"""
Playwright-based scraper for Perú Compras — Buscador de Catálogos.
URL: https://buscadorcatalogos.perucompras.gob.pe/
"""
import logging
import asyncio
from datetime import datetime
from typing import AsyncGenerator, Optional

from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

from app.schemas.purchase_order import PurchaseOrderCreate

logger = logging.getLogger(__name__)

BASE_URL = "https://buscadorcatalogos.perucompras.gob.pe/"


# ---------------------------------------------------------------------------
# Low-level page helpers
# ---------------------------------------------------------------------------

async def _safe_text(page: Page, selector: str, default: str = "") -> str:
    try:
        el = await page.wait_for_selector(selector, timeout=3000)
        return (await el.inner_text()).strip() if el else default
    except PWTimeout:
        return default


async def _parse_date(raw: str) -> Optional[str]:
    """Convert DD/MM/YYYY → ISO YYYY-MM-DD, return None on failure."""
    for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(raw.strip(), fmt).date().isoformat()
        except ValueError:
            continue
    return None


async def _parse_decimal(raw: str) -> Optional[float]:
    try:
        return float(raw.replace(",", "").replace(" ", "").strip())
    except (ValueError, AttributeError):
        return None


# ---------------------------------------------------------------------------
# Detail-page parser
# ---------------------------------------------------------------------------

async def _parse_order_detail(page: Page, detail_url: str) -> Optional[PurchaseOrderCreate]:
    """Navigate to an order detail page and extract all fields."""
    try:
        await page.goto(detail_url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_selector("table", timeout=10000)
    except PWTimeout:
        logger.warning("Timeout loading detail: %s", detail_url)
        return None

    async def cell(label: str) -> str:
        try:
            # Find a row where any cell contains the label, return next sibling cell
            locator = page.locator(f"td:has-text('{label}') + td")
            count = await locator.count()
            if count:
                return (await locator.first.inner_text()).strip()
            # Try th variant
            locator = page.locator(f"th:has-text('{label}') + td")
            count = await locator.count()
            if count:
                return (await locator.first.inner_text()).strip()
        except Exception:
            pass
        return ""

    raw_sub = await cell("Sub Total")
    raw_igv  = await cell("IGV")
    raw_tot  = await cell("Monto Total")
    raw_pub  = await cell("Fecha Publicación")
    raw_acep = await cell("Fecha Aceptación")

    return PurchaseOrderCreate(
        codigo_acuerdo_marco=await cell("Código Acuerdo Marco"),
        procedimiento=await cell("Procedimiento"),
        nro_orden_fisica=await cell("Nro. Orden Física"),
        ruc_entidad=await cell("RUC Entidad"),
        nombre_entidad=await cell("Entidad"),
        ruc_proveedor=await cell("RUC Proveedor"),
        nombre_proveedor=await cell("Proveedor"),
        fecha_publicacion=await _parse_date(raw_pub),
        fecha_aceptacion=await _parse_date(raw_acep),
        catalogo=await cell("Catálogo"),
        categoria=await cell("Categoría"),
        detalle_producto=await cell("Detalle Producto"),
        logistica_entrega=await cell("Logística de Entrega"),
        moneda=await cell("Moneda") or "PEN",
        sub_total=await _parse_decimal(raw_sub),
        igv=await _parse_decimal(raw_igv),
        monto_total=await _parse_decimal(raw_tot),
        estado_orden=await cell("Estado Orden"),
        plazo_entrega_dias=int(p) if (p := await cell("Plazo Entrega")).isdigit() else None,
        pdf_url=detail_url,
    )


# ---------------------------------------------------------------------------
# Search + pagination
# ---------------------------------------------------------------------------

async def _get_detail_links(page: Page) -> list[str]:
    """Extract order detail URLs from the current results page."""
    links = await page.eval_on_selector_all(
        "a[href*='DetalleOrdenCompra'], a[href*='detalle']",
        "els => els.map(e => e.href)",
    )
    return list(dict.fromkeys(links))   # deduplicate, preserve order


async def scrape_orders(
    catalogo: Optional[str] = None,
    max_pages: int = 10,
) -> AsyncGenerator[PurchaseOrderCreate, None]:
    """
    Async generator — yields PurchaseOrderCreate per scraped order.

    Usage (in async context):
        async for order in scrape_orders(catalogo="Útiles de Escritorio"):
            crud.upsert_order(db, order)
    """
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()

        logger.info("Navigating to %s", BASE_URL)
        await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)

        # Apply catalog filter if provided
        if catalogo:
            try:
                await page.fill("input[placeholder*='catálogo'], input[name*='catalogo']", catalogo)
                await page.press("input[placeholder*='catálogo'], input[name*='catalogo']", "Enter")
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception as exc:
                logger.warning("Could not apply catalog filter: %s", exc)

        for page_num in range(1, max_pages + 1):
            logger.info("Scraping page %d", page_num)
            links = await _get_detail_links(page)

            if not links:
                logger.info("No links found on page %d — stopping.", page_num)
                break

            detail_page = await context.new_page()
            for url in links:
                order = await _parse_order_detail(detail_page, url)
                if order:
                    yield order
                await asyncio.sleep(0.5)   # polite delay
            await detail_page.close()

            # Try to go to next page
            try:
                next_btn = page.locator("a:has-text('Siguiente'), li.next > a, [aria-label='Next']")
                if await next_btn.count() == 0:
                    logger.info("No next page button — done.")
                    break
                await next_btn.first.click()
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception as exc:
                logger.info("Pagination ended: %s", exc)
                break

        await browser.close()


# ---------------------------------------------------------------------------
# Sync wrapper used by Celery (runs the async generator in a new event loop)
# ---------------------------------------------------------------------------

def run_scrape_sync(
    db_session,
    catalogo: Optional[str] = None,
    max_pages: int = 10,
) -> dict:
    """Synchronous entry-point for Celery tasks."""
    from app.services import crud

    inserted = 0
    updated = 0

    async def _run():
        nonlocal inserted, updated
        async for order in scrape_orders(catalogo=catalogo, max_pages=max_pages):
            existing = crud.get_order_by_nro(db_session, order.nro_orden_fisica)
            crud.upsert_order(db_session, order)
            if existing:
                updated += 1
            else:
                inserted += 1

    asyncio.run(_run())
    return {"inserted": inserted, "updated": updated}
