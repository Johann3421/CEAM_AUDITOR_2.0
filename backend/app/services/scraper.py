"""
Playwright-based RPA scraper for Perú Compras — Consulta de Órdenes Públicas.
URL: https://www.catalogos.perucompras.gob.pe/ConsultaOrdenesPub#

Strategy:
  1. Navigate to the portal.
  2. Select a valid "Acuerdo Marco" (filtering out "No Vigente").
  3. Fill in date range fields.
  4. Check "Exportar Detallado".
  5. Click "INICIAR BÚSQUEDA" → this triggers an .xlsx download.
  6. Process the downloaded Excel (skip first 5 metadata rows).
  7. Merge duplicate "Nro Orden Física" rows into single clean records.
  8. Upsert each record into the database.
"""
import logging
import asyncio
import os
import glob
import tempfile
from datetime import datetime, timedelta
from typing import Optional, List

import pandas as pd
from playwright.async_api import async_playwright, TimeoutError as PWTimeout

from app.schemas.purchase_order import PurchaseOrderCreate

logger = logging.getLogger(__name__)

BASE_URL = "https://www.catalogos.perucompras.gob.pe/ConsultaOrdenesPub#"


# ─── Excel Processing (ETL) ──────────────────────────────────────────────────

def _process_excel(filepath: str) -> List[PurchaseOrderCreate]:
    """
    Read the downloaded Excel, skip the first 5 metadata rows,
    merge rows with the same 'Nro Orden Física', and return clean records.
    """
    logger.info("Processing Excel file: %s", filepath)

    df = pd.read_excel(filepath, skiprows=5, engine="openpyxl")

    # Normalize column names (remove extra spaces, lowercase)
    df.columns = df.columns.str.strip()

    logger.info("Excel loaded: %d raw rows, columns: %s", len(df), list(df.columns))

    # ── Column mapping (handle varying header names from the portal) ──────
    col_map = {}
    for col in df.columns:
        cl = col.lower()
        if "código" in cl and "acuerdo" in cl:
            col_map["codigo_acuerdo_marco"] = col
        elif "procedimiento" in cl:
            col_map["procedimiento"] = col
        elif "nro" in cl and "orden" in cl and "físi" in cl:
            col_map["nro_orden_fisica"] = col
        elif "ruc" in cl and "entidad" in cl:
            col_map["ruc_entidad"] = col
        elif "nombre" in cl and "entidad" in cl:
            col_map["nombre_entidad"] = col
        elif "razón" in cl and "entidad" in cl:
            col_map["nombre_entidad"] = col
        elif "ruc" in cl and "proveedor" in cl:
            col_map["ruc_proveedor"] = col
        elif "nombre" in cl and "proveedor" in cl:
            col_map["nombre_proveedor"] = col
        elif "razón" in cl and "proveedor" in cl:
            col_map["nombre_proveedor"] = col
        elif "fecha" in cl and "publicación" in cl:
            col_map["fecha_publicacion"] = col
        elif "fecha" in cl and "aceptación" in cl:
            col_map["fecha_aceptacion"] = col
        elif "catálogo" in cl or "catalogo" in cl:
            col_map["catalogo"] = col
        elif "categoría" in cl or "categoria" in cl:
            col_map["categoria"] = col
        elif "detalle" in cl and "producto" in cl:
            col_map["detalle_producto"] = col
        elif "descripción" in cl and ("bien" in cl or "serv" in cl or "item" in cl):
            col_map["detalle_producto"] = col
        elif "logíst" in cl or "entrega" in cl and "direc" not in cl:
            col_map["logistica_entrega"] = col
        elif "moneda" in cl:
            col_map["moneda"] = col
        elif "sub" in cl and "total" in cl:
            col_map["sub_total"] = col
        elif "igv" in cl:
            col_map["igv"] = col
        elif "monto" in cl and "total" in cl:
            col_map["monto_total"] = col
        elif "total" in cl and "igv" not in cl and "sub" not in cl:
            col_map["monto_total"] = col
        elif "estado" in cl and "orden" in cl:
            col_map["estado_orden"] = col
        elif "plazo" in cl:
            col_map["plazo_entrega_dias"] = col

    logger.info("Column mapping resolved: %s", col_map)

    # ── Identify the key column for merging ───────────────────────────────
    nro_col = col_map.get("nro_orden_fisica")
    if not nro_col:
        # Fallback: try to find any column containing order numbers
        for col in df.columns:
            if "orden" in col.lower():
                nro_col = col
                col_map["nro_orden_fisica"] = col
                break

    if not nro_col:
        logger.error("Cannot find 'Nro Orden Física' column. Available: %s", list(df.columns))
        return []

    # Drop rows where the key is empty
    df = df.dropna(subset=[nro_col])

    # ── Merge duplicate rows by Nro Orden Física ──────────────────────────
    # The Excel often has the same order split across multiple rows
    # (each row adds complementary info like different items).
    # We concat text fields and keep max of numeric fields.
    def _merge_group(group):
        """Merge rows sharing the same Nro Orden Física."""
        if len(group) == 1:
            return group.iloc[0]

        row = group.iloc[0].copy()

        # For text columns: concatenate unique, non-empty values
        text_fields = ["detalle_producto", "logistica_entrega"]
        for field_key in text_fields:
            if field_key in col_map:
                original_col = col_map[field_key]
                unique_vals = group[original_col].dropna().astype(str).unique()
                row[original_col] = " | ".join(v for v in unique_vals if v.strip())

        # For numeric columns: take the max (usually the total)
        numeric_fields = ["sub_total", "igv", "monto_total"]
        for field_key in numeric_fields:
            if field_key in col_map:
                original_col = col_map[field_key]
                row[original_col] = pd.to_numeric(group[original_col], errors="coerce").max()

        return row

    merged = df.groupby(nro_col, sort=False).apply(_merge_group).reset_index(drop=True)
    logger.info("Merged %d raw rows → %d unique orders", len(df), len(merged))

    # ── Convert to PurchaseOrderCreate objects ────────────────────────────
    orders = []
    for _, row in merged.iterrows():
        def _get(key: str, default=""):
            original_col = col_map.get(key)
            if original_col is None:
                return default
            val = row.get(original_col)
            if pd.isna(val):
                return default
            return val

        def _get_date(key: str):
            val = _get(key)
            if not val:
                return None
            if isinstance(val, datetime):
                return val.date().isoformat()
            if isinstance(val, pd.Timestamp):
                return val.date().isoformat()
            # Try parsing string dates
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
                try:
                    return datetime.strptime(str(val).strip(), fmt).date().isoformat()
                except ValueError:
                    continue
            return None

        def _get_decimal(key: str):
            val = _get(key)
            if not val:
                return None
            try:
                return float(str(val).replace(",", "").replace(" ", "").strip())
            except (ValueError, TypeError):
                return None

        def _get_int(key: str):
            val = _get(key)
            if not val:
                return None
            try:
                return int(float(str(val)))
            except (ValueError, TypeError):
                return None

        nro = str(_get("nro_orden_fisica")).strip()
        if not nro:
            continue

        try:
            order = PurchaseOrderCreate(
                codigo_acuerdo_marco=str(_get("codigo_acuerdo_marco")).strip(),
                procedimiento=str(_get("procedimiento")).strip(),
                nro_orden_fisica=nro,
                ruc_entidad=str(_get("ruc_entidad")).strip() or None,
                nombre_entidad=str(_get("nombre_entidad")).strip() or None,
                ruc_proveedor=str(_get("ruc_proveedor")).strip() or None,
                nombre_proveedor=str(_get("nombre_proveedor")).strip() or None,
                fecha_publicacion=_get_date("fecha_publicacion"),
                fecha_aceptacion=_get_date("fecha_aceptacion"),
                catalogo=str(_get("catalogo")).strip() or None,
                categoria=str(_get("categoria")).strip() or None,
                detalle_producto=str(_get("detalle_producto")).strip() or None,
                logistica_entrega=str(_get("logistica_entrega")).strip() or None,
                moneda=str(_get("moneda")).strip() or "PEN",
                sub_total=_get_decimal("sub_total"),
                igv=_get_decimal("igv"),
                monto_total=_get_decimal("monto_total"),
                estado_orden=str(_get("estado_orden")).strip() or None,
                plazo_entrega_dias=_get_int("plazo_entrega_dias"),
                pdf_url=None,
            )
            orders.append(order)
        except Exception as exc:
            logger.warning("Skipping row with nro=%s: %s", nro, exc)
            continue

    logger.info("Parsed %d valid orders from Excel", len(orders))
    return orders


# ─── Playwright RPA (Browser Automation) ──────────────────────────────────────

async def _download_excel(
    catalogo_keyword: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
) -> Optional[str]:
    """
    Automate the Peru Compras portal to download the detailed Excel export.

    Returns the path to the downloaded .xlsx file, or None on failure.
    """
    download_dir = tempfile.mkdtemp(prefix="ceam_scraper_")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        logger.info("Navigating to %s", BASE_URL)
        try:
            await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)  # Let JS render
        except PWTimeout:
            logger.error("Timeout loading portal")
            await browser.close()
            return None

        # ── 1. Select Acuerdo Marco ───────────────────────────────────────
        try:
            # Click the dropdown to open it
            select_am = page.locator("select").first
            options = await select_am.locator("option").all()

            selected = False
            for option in options:
                text = (await option.inner_text()).strip()

                # Skip placeholder
                if "seleccione" in text.lower():
                    continue

                # Skip "No Vigente" agreements (user requirement)
                if "no vigente" in text.lower():
                    continue

                # If a keyword filter was given, match it
                if catalogo_keyword:
                    if catalogo_keyword.lower() not in text.lower():
                        continue

                # Select this option
                value = await option.get_attribute("value")
                if value:
                    await select_am.select_option(value=value)
                    logger.info("Selected Acuerdo Marco: %s", text)
                    selected = True
                    break

            if not selected:
                logger.warning("No matching Acuerdo Marco found for keyword: %s", catalogo_keyword)
                await browser.close()
                return None

            await page.wait_for_timeout(1500)

        except Exception as exc:
            logger.error("Error selecting Acuerdo Marco: %s", exc)
            await browser.close()
            return None

        # ── 2. Fill date range ────────────────────────────────────────────
        if not fecha_inicio:
            # Default: last 12 months
            fecha_inicio = (datetime.now() - timedelta(days=365)).strftime("%d/%m/%Y")
        if not fecha_fin:
            fecha_fin = datetime.now().strftime("%d/%m/%Y")

        try:
            date_inputs = page.locator("input[type='date'], input[placeholder*='Fecha']")
            count = await date_inputs.count()

            if count >= 2:
                # Clear and fill fecha_inicio
                await date_inputs.nth(0).click()
                await date_inputs.nth(0).fill("")
                await date_inputs.nth(0).type(fecha_inicio, delay=50)

                # Clear and fill fecha_fin
                await date_inputs.nth(1).click()
                await date_inputs.nth(1).fill("")
                await date_inputs.nth(1).type(fecha_fin, delay=50)

                logger.info("Date range: %s to %s", fecha_inicio, fecha_fin)
            else:
                logger.warning("Could not find date inputs (%d found)", count)

        except Exception as exc:
            logger.warning("Error filling dates: %s", exc)

        # ── 3. Check "Exportar Detallado" ─────────────────────────────────
        try:
            checkbox = page.locator("input[type='checkbox']").first
            if not await checkbox.is_checked():
                await checkbox.check()
                logger.info("Checked 'Exportar Detallado'")
        except Exception as exc:
            logger.warning("Could not check 'Exportar Detallado': %s", exc)

        # ── 4. Click "INICIAR BÚSQUEDA" and wait for download ─────────────
        try:
            search_btn = page.locator("button:has-text('INICIAR'), a:has-text('INICIAR'), input[value*='INICIAR']")

            if await search_btn.count() == 0:
                # Try finding any button with search-like text
                search_btn = page.locator("button:has-text('Buscar'), button:has-text('búsqueda')")

            # Start waiting for download BEFORE clicking
            async with page.expect_download(timeout=120000) as download_info:
                await search_btn.first.click()
                logger.info("Clicked search button, waiting for download...")

            download = await download_info.value
            dest_path = os.path.join(download_dir, download.suggested_filename or "export.xlsx")
            await download.save_as(dest_path)
            logger.info("Downloaded file: %s", dest_path)

            await browser.close()
            return dest_path

        except PWTimeout:
            logger.warning("Download timeout — trying .xlsx link fallback")

        # ── 5. Fallback: try clicking the .xlsx export link directly ──────
        try:
            xlsx_link = page.locator("a:has-text('.xlsx')")
            if await xlsx_link.count() > 0:
                async with page.expect_download(timeout=120000) as download_info:
                    await xlsx_link.first.click()

                download = await download_info.value
                dest_path = os.path.join(download_dir, download.suggested_filename or "export.xlsx")
                await download.save_as(dest_path)
                logger.info("Downloaded via .xlsx link: %s", dest_path)

                await browser.close()
                return dest_path
        except Exception as exc:
            logger.error("Fallback download also failed: %s", exc)

        await browser.close()
        return None


# ─── Sync Wrapper for Celery ──────────────────────────────────────────────────

def run_scrape_sync(
    db_session,
    catalogo: Optional[str] = None,
    max_pages: int = 10,
) -> dict:
    """
    Synchronous entry-point called by Celery tasks.

    1. Downloads the Excel via browser automation.
    2. Processes and merges the data.
    3. Upserts each record into the database.
    """
    from app.services import crud

    inserted = 0
    updated = 0

    async def _run():
        nonlocal inserted, updated

        # Download the Excel file
        filepath = await _download_excel(catalogo_keyword=catalogo)

        if not filepath or not os.path.exists(filepath):
            logger.error("No Excel file was downloaded")
            return

        # Process the Excel into clean records
        orders = _process_excel(filepath)

        # Upsert each record
        for order in orders:
            existing = crud.get_order_by_nro(db_session, order.nro_orden_fisica)
            crud.upsert_order(db_session, order)
            if existing:
                updated += 1
            else:
                inserted += 1

        # Cleanup temp file
        try:
            os.remove(filepath)
        except OSError:
            pass

    asyncio.run(_run())
    return {"inserted": inserted, "updated": updated}
