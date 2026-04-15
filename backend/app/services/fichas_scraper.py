"""
CEAM AUDITOR — Módulo 2: Extractor de Fichas-Producto
======================================================
Scraper asíncrono para el Buscador de Catálogos de Perú Compras:
  https://buscadorcatalogos.perucompras.gob.pe/#

Flujo principal:
  1. Navegar la SPA hasta el acuerdo marco deseado (selector CSS exacto).
  2. Descargar el Excel de fichas-producto (generación lenta en servidor: 1-5 min).
  3. Procesar el Excel con Pandas (limpieza, tipado, normalización de columnas).
  4. Upsert en tabla `fichas_producto` de la base de datos (SQLite o PostgreSQL).

Uso standalone (testing local):
  python fichas_scraper.py

Uso dentro del sistema CEAM:
  from app.services.fichas_scraper import run_module_2
  result = await run_module_2(engine=app_engine)
"""

import asyncio
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import pandas as pd
from playwright.async_api import async_playwright, TimeoutError as PWTimeout
from sqlalchemy import (
    Column, DateTime, Float, Integer, MetaData, String, Table, Text,
    create_engine, inspect as sa_inspect, insert, select, text, update,
)


# ─── Logging ─────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("ceam.m2.fichas")


# ─── Constants ───────────────────────────────────────────────────────────────

CATALOG_URL = "https://buscadorcatalogos.perucompras.gob.pe/#"

# Primary selector: partial match on agreement code — robust against bullet/spacing variants.
# Falls back to scanning all data-agreement divs if nothing matches.
AGREEMENT_SELECTOR = 'div[data-agreement*="EXT-CE-2022-5"]'

# Full exact value kept for reference / manual overrides only:
# 'div[data-agreement="VIGENTE\u2022EXT-CE-2022-5 COMPUTADORAS DE ESCRITORIO, '
# 'COMPUTADORAS PORTATILES Y ESCANERES"]'

DOWNLOAD_BTN_SELECTOR = "a.btn-download.text-purple.text-bold"

# /tmp/catalogos/ is writable inside Docker containers and local Linux/Mac.
DOWNLOAD_DIR = Path("/tmp/catalogos")

# Server-side Excel generation can take up to 5 minutes for large catalogs.
DOWNLOAD_TIMEOUT_MS = 300_000
PAGE_LOAD_TIMEOUT_MS = 60_000

MAX_RETRIES = 3
BACKOFF_SECONDS = [5, 15, 45]   # wait durations between attempts

# Commit to DB in batches to avoid overwhelming the connection.
BATCH_SIZE = 100


# ─── Custom Exceptions ───────────────────────────────────────────────────────

class CatalogDownloadError(Exception):
    """Raised when the catalog Excel download fails after all retry attempts."""


# ─── Retry Decorator ─────────────────────────────────────────────────────────

def async_retry(max_attempts: int = MAX_RETRIES, backoff: list = None):
    """
    Decorator that retries an async function up to `max_attempts` times.

    Args:
        max_attempts: Maximum number of attempts before raising.
        backoff: List of wait times in seconds between attempts.
                 Defaults to module-level BACKOFF_SECONDS.

    Behaviour:
        - Each failed attempt (PWTimeout or any Exception) is logged as WARNING.
        - The final failure is logged as CRITICAL then raised as CatalogDownloadError.
        - On retry, a full new browser session is created because navigate_and_download
          re-enters the `async with async_playwright()` block from scratch.
    """
    if backoff is None:
        backoff = BACKOFF_SECONDS

    def decorator(func):
        async def wrapper(*args, **kwargs):
            for attempt in range(1, max_attempts + 1):
                try:
                    return await func(*args, **kwargs)
                except (PWTimeout, Exception) as exc:
                    wait = backoff[attempt - 1] if attempt - 1 < len(backoff) else backoff[-1]
                    if attempt < max_attempts:
                        logger.warning(
                            "Attempt %d/%d failed for %s: %s — retrying in %ds",
                            attempt, max_attempts, func.__name__, exc, wait,
                        )
                        await asyncio.sleep(wait)
                    else:
                        logger.critical(
                            "All %d attempts failed for %s: %s",
                            max_attempts, func.__name__, exc,
                        )
                        raise CatalogDownloadError(
                            f"[{func.__name__}] failed after {max_attempts} attempts: {exc}"
                        ) from exc
        return wrapper
    return decorator


# ─── 1. Navigation & Download ─────────────────────────────────────────────────

@async_retry(max_attempts=MAX_RETRIES, backoff=BACKOFF_SECONDS)
async def navigate_and_download(
    agreement_selector: str = AGREEMENT_SELECTOR,
    download_btn_selector: str = DOWNLOAD_BTN_SELECTOR,
    agreement_code: str = "EXT-CE-2022-5",
) -> str:
    """
    Navigate the Perú Compras catalog SPA, select the target agreement, and
    download the fichas-producto Excel file.

    Args:
        agreement_selector: CSS selector targeting the agreement container div.
                            Must match the `data-agreement` attribute exactly.
        download_btn_selector: CSS selector for the Excel download anchor tag.
        agreement_code: Short code used in the output filename to identify the run.

    Returns:
        Absolute path to the saved .xlsx file as a string.

    Raises:
        CatalogDownloadError: After MAX_RETRIES failed attempts (raised by decorator).
        playwright.async_api.TimeoutError: Propagated upward to the retry decorator.

    ─── CRITICAL NOTE — WHY expect_download() MUST BE OPENED BEFORE THE CLICK ───
    Playwright's page.expect_download() registers a one-time listener for the
    browser's "download started" signal. If you click the button first and then
    call expect_download(), the download event fires between those two lines and
    Playwright never catches it — the context manager starts listening for an
    event that already happened and times out immediately.

    The ONLY correct pattern is:

        async with page.expect_download(timeout=300_000) as download_info:
            await page.click("selector")        # fires inside the context
        download = await download_info.value    # event already captured

    Never invert this order.
    """
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest_filename = f"fichas_{agreement_code}_{timestamp}.xlsx"
    dest_path = DOWNLOAD_DIR / dest_filename

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-gpu",
            ],
        )
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        try:
            # ── Load SPA ─────────────────────────────────────────────────
            logger.info("Navigating to %s", CATALOG_URL)
            await page.goto(CATALOG_URL, wait_until="domcontentloaded", timeout=PAGE_LOAD_TIMEOUT_MS)

            logger.info("Waiting for SPA to fully render (networkidle)...")
            await page.wait_for_load_state("networkidle", timeout=PAGE_LOAD_TIMEOUT_MS)

            # ── Dismiss blocking modal popup ──────────────────────────────
            # The portal shows a #divPopUpComunicadoBloqueado modal on load.
            # It has data-backdrop="static" and data-keyboard="false", so it
            # cannot be dismissed by clicking outside or pressing Escape.
            # We must click its close/accept button before interacting with the page.
            try:
                modal_sel = "#divPopUpComunicadoBloqueado"
                modal_visible = await page.is_visible(modal_sel, timeout=5_000)
                if modal_visible:
                    logger.info("Blocking modal detected — attempting to dismiss...")
                    # Try common close button patterns inside the modal
                    closed = False
                    for btn_sel in [
                        "#divPopUpComunicadoBloqueado button[data-dismiss='modal']",
                        "#divPopUpComunicadoBloqueado .btn-close",
                        "#divPopUpComunicadoBloqueado .close",
                        "#divPopUpComunicadoBloqueado button.btn-primary",
                        "#divPopUpComunicadoBloqueado button.btn-success",
                        "#divPopUpComunicadoBloqueado button",
                    ]:
                        try:
                            btn = page.locator(btn_sel).first
                            if await btn.is_visible(timeout=2_000):
                                await btn.evaluate("node => node.click()")
                                logger.info("Modal dismissed via: %s", btn_sel)
                                closed = True
                                break
                        except Exception:
                            continue

                    if not closed:
                        # Force-hide the modal via JS as last resort
                        logger.warning("No close button found — force-hiding modal via JS")
                        await page.evaluate(
                            "() => {"
                            "  const m = document.getElementById('divPopUpComunicadoBloqueado');"
                            "  if (m) { m.style.display='none'; m.classList.remove('show'); }"
                            "  const backdrop = document.querySelector('.modal-backdrop');"
                            "  if (backdrop) backdrop.remove();"
                            "  document.body.classList.remove('modal-open');"
                            "  document.body.style.removeProperty('padding-right');"
                            "}"
                        )
                        logger.info("Modal force-hidden via JS")

                    # Wait for the modal to be hidden before proceeding
                    await page.wait_for_timeout(500)
            except Exception as modal_exc:
                logger.warning("Modal check/dismiss failed (continuing anyway): %s", modal_exc)

            # ── Select the agreement card ─────────────────────────────────
            logger.info("Locating agreement element with selector: %s", agreement_selector)

            # Dump all visible data-agreement values to help diagnose selector mismatches.
            all_agreements = await page.evaluate(
                "() => [...document.querySelectorAll('[data-agreement]')]"
                ".map(el => el.getAttribute('data-agreement'))"
            )
            logger.info("data-agreement values found on page (%d): %s", len(all_agreements), all_agreements)

            agreement_el = page.locator(agreement_selector).first
            await agreement_el.wait_for(state="visible", timeout=30_000)

            # Scroll into view first — prevents ClickNotAllowed on partially
            # visible elements that fall outside the rendered viewport.
            await agreement_el.scroll_into_view_if_needed()
            await page.wait_for_timeout(500)

            # Use JS click to bypass any remaining overlay interception
            await agreement_el.evaluate("node => node.click()")
            logger.info("Agreement card clicked — waiting for fichas count and download button...")

            # Wait for the page to update and show the download button.
            await page.wait_for_selector(
                download_btn_selector, state="visible", timeout=30_000
            )
            logger.info("Download button is visible.")

            # ── Download (context BEFORE click — see docstring) ───────────
            logger.info(
                "Opening download context — waiting up to %d s for server to generate Excel...",
                DOWNLOAD_TIMEOUT_MS // 1000,
            )
            async with page.expect_download(timeout=DOWNLOAD_TIMEOUT_MS) as download_info:
                await page.locator(download_btn_selector).first.evaluate("node => node.click()")

            download = await download_info.value
            await download.save_as(str(dest_path))
            logger.info("Download complete — saved to: %s", dest_path)

        finally:
            # Browser MUST close even on error to avoid orphaned Chromium processes.
            await browser.close()

    return str(dest_path)


# ─── 2. ETL: Process Excel ────────────────────────────────────────────────────

def process_catalog_excel(filepath: str) -> pd.DataFrame:
    """
    Read, clean, and type-cast the fichas-producto Excel file downloaded from
    the Perú Compras catalog portal.

    ETL steps:
      1. Detect the correct sheet automatically.
      2. Normalise column names (strip, lowercase, spaces→underscores).
      3. Convert price/amount columns to float64 (Peruvian number format).
      4. Convert date columns to datetime.
      5. Convert code/ID columns to string (preserves leading zeros).
      6. Drop fully empty rows.
      7. Add `fecha_extraccion` (UTC timestamp of this run).

    Args:
        filepath: Absolute path to the .xlsx file.

    Returns:
        Cleaned and fully typed pd.DataFrame.

    Raises:
        FileNotFoundError: If `filepath` does not exist.
        ValueError: If the file is empty after loading.
    """
    path = Path(filepath)
    if not path.exists():
        raise FileNotFoundError(f"Excel file not found: {filepath}")

    logger.info("Reading Excel: %s", filepath)
    xl = pd.ExcelFile(filepath, engine="openpyxl")
    sheet_name = xl.sheet_names[0]
    if len(xl.sheet_names) > 1:
        logger.warning(
            "Multiple sheets found %s — using first: '%s'", xl.sheet_names, sheet_name
        )

    df = pd.read_excel(xl, sheet_name=sheet_name)
    xl.close()

    if df.empty:
        raise ValueError(f"Excel file produced an empty DataFrame: {filepath}")

    logger.info("Raw shape: %d rows × %d cols", *df.shape)

    # ── Normalise column names ────────────────────────────────────────────
    df.columns = (
        df.columns
        .astype(str)
        .str.strip()
        .str.lower()
        .str.replace(r"\s+", "_", regex=True)
        .str.replace(r"[^a-z0-9_]", "", regex=True)
        .str.replace(r"_+", "_", regex=True)
        .str.strip("_")
    )
    logger.info("Normalised columns: %s", list(df.columns))

    # ── Drop fully empty rows ─────────────────────────────────────────────
    df = df.dropna(how="all").reset_index(drop=True)

    # ── Price / amount columns → float64 ─────────────────────────────────
    # Peruvian format uses "." as thousands separator and "," as decimal.
    price_re = re.compile(
        r"(precio|monto|costo|valor|igv|total|sub_total|subtotal|flete|unitario)", re.I
    )
    for col in df.columns:
        if price_re.search(col):
            df[col] = (
                df[col]
                .astype(str)
                .str.replace(r"\.", "", regex=True)       # strip thousands dot
                .str.replace(",", ".", regex=False)        # decimal comma → period
                .str.replace(r"[^0-9.\-]", "", regex=True)
            )
            df[col] = pd.to_numeric(df[col], errors="coerce").astype("float64")
            logger.info("  → float64: %s", col)

    # ── Date columns → datetime ───────────────────────────────────────────
    date_re = re.compile(r"fecha", re.I)
    for col in df.columns:
        if date_re.search(col) and col != "fecha_extraccion":
            df[col] = pd.to_datetime(df[col], format="%d/%m/%Y", errors="coerce")
            logger.info("  → datetime: %s", col)

    # ── Code / ID columns → string (preserve leading zeros) ──────────────
    code_re = re.compile(r"(codigo|cod_|ficha|ruc|nro|numero|numero_|id_)", re.I)
    for col in df.columns:
        if code_re.search(col):
            df[col] = (
                df[col]
                .astype(str)
                .str.strip()
                .str.replace(r"\.0$", "", regex=True)
                .replace("nan", None)
            )
            logger.info("  → string: %s", col)

    # ── Extraction timestamp (UTC) ────────────────────────────────────────
    df["fecha_extraccion"] = datetime.now(tz=timezone.utc)

    logger.info("Processed shape: %d rows × %d cols", *df.shape)
    return df


# ─── 3. Upsert to Database ────────────────────────────────────────────────────

def upsert_fichas(df: pd.DataFrame, engine) -> dict:
    """
    Upsert fichas_producto rows into the database using SQLAlchemy Core.

    Compatible with both SQLite (development) and PostgreSQL (production).
    The table `fichas_producto` is created automatically if it does not exist.

    Upsert logic:
      - If a row with the same key already EXISTS: update all fields EXCEPT
        `fecha_primera_carga` (preserves the original insertion date).
      - If the row does NOT exist: insert with `fecha_primera_carga` = now().

    Transaction safety:
      Each BATCH_SIZE block is wrapped in its own connection + transaction.
      Within each batch, individual rows use SAVEPOINTs (nested transactions)
      so a single bad row doesn't abort the whole batch.

    Args:
        df: Cleaned DataFrame from process_catalog_excel().
        engine: SQLAlchemy Engine (sqlite or postgresql+psycopg2).

    Returns:
        Dict with keys 'inserted' (int), 'updated' (int), 'errors' (int).
    """
    meta = MetaData()

    # ── Auto-detect primary key column ────────────────────────────────────
    # Ordered priority list — first match wins.
    # Deliberately excludes description/title columns that also happen to
    # contain the word "ficha" (e.g. descripcion_fichaproducto).
    KEY_PRIORITY = [
        r"^nro_parte",          # nro_parte_o_codigo_unico...
        r"^codigo_ficha$",
        r"^cod_ficha$",
        r"^codigo_producto$",
        r"^cod_producto$",
        r"^codigo_",
        r"^cod_",
        r"nro_parte",
        r"codigo",
    ]
    key_col = None
    for pattern in KEY_PRIORITY:
        for col in df.columns:
            if re.search(pattern, col, re.I):
                key_col = col
                break
        if key_col:
            break

    if key_col is None:
        # Last resort: first column
        key_col = df.columns[0]
        logger.warning("No ficha code column detected — using '%s' as key", key_col)
    else:
        logger.info("Upsert key column: '%s'", key_col)

    # Log a sample of key values to verify the right column was picked
    sample_keys = df[key_col].dropna().head(3).tolist()
    logger.info("Sample key values: %s", sample_keys)

    # ── Build SQLAlchemy table definition from DataFrame dtypes ──────────
    def _sa_col(name: str, dtype) -> Column:
        if pd.api.types.is_float_dtype(dtype):
            return Column(name, Float, nullable=True)
        if pd.api.types.is_datetime64_any_dtype(dtype):
            return Column(name, DateTime(timezone=True), nullable=True)
        if pd.api.types.is_integer_dtype(dtype):
            return Column(name, Integer, nullable=True)
        return Column(name, Text, nullable=True)

    # Use Text (unlimited) for PK — nro_parte values can be long strings.
    sa_cols = [Column(key_col, Text, primary_key=True)]
    for col in df.columns:
        if col == key_col:
            continue
        if col == "fecha_primera_carga":
            sa_cols.append(Column("fecha_primera_carga", DateTime(timezone=True), nullable=True))
        else:
            sa_cols.append(_sa_col(col, df[col].dtype))

    if "fecha_primera_carga" not in [c.name for c in sa_cols]:
        sa_cols.append(Column("fecha_primera_carga", DateTime(timezone=True), nullable=True))

    fichas_table = Table("fichas_producto", meta, *sa_cols, extend_existing=True)
    meta.create_all(engine)

    # ── Auto-migrate legacy varchar columns → TEXT ────────────────────────
    # If the table was previously created with a String(128) column (from an
    # old schema run), ALTER those columns to TEXT so long values fit.
    # Runs only on PostgreSQL; silently skipped on SQLite (no varchar issue).
    try:
        insp = sa_inspect(engine)
        if insp.has_table("fichas_producto"):
            existing_cols = {c["name"]: c["type"] for c in insp.get_columns("fichas_producto")}
            with engine.begin() as _mc:
                for sa_col in sa_cols:
                    if not isinstance(sa_col.type, Text):
                        continue
                    col_name = sa_col.name
                    db_type = str(existing_cols.get(col_name, "")).upper()
                    if "VARCHAR" in db_type or "CHAR" in db_type:
                        logger.warning(
                            "Migrating column '%s' from %s → TEXT", col_name, db_type
                        )
                        _mc.execute(
                            text(f'ALTER TABLE fichas_producto ALTER COLUMN "{col_name}" TYPE TEXT')
                        )
    except Exception as _me:
        logger.warning("Schema auto-migration skipped: %s", _me)

    # ── Helpers ───────────────────────────────────────────────────────────
    def _clean(row: dict) -> dict:
        """Replace NaN/NaT/inf with None for SQLAlchemy compatibility."""
        out = {}
        for k, v in row.items():
            try:
                null = pd.isna(v)
            except (TypeError, ValueError):
                null = False
            out[k] = None if null else v
        return out

    # ── Ensure unique index so ON CONFLICT works even if PK was never applied ─
    try:
        safe_idx = re.sub(r"[^a-z0-9]", "_", key_col[:30])
        with engine.begin() as _ic:
            _ic.execute(text(
                f'CREATE UNIQUE INDEX IF NOT EXISTS "idx_fichas_uq_{safe_idx}" '
                f'ON fichas_producto ("{key_col}")'
            ))
        logger.info("Unique index ensured on column '%s'", key_col)
    except Exception as _idx_e:
        logger.warning("Could not ensure unique index: %s", _idx_e)

    # ── Pre-fetch existing rows for delta detection (one round-trip) ──────
    existing_map: dict = {}
    try:
        col_names = [c.name for c in fichas_table.c]
        fetch_cols = [fichas_table.c[key_col]]
        if "estado_ficha_producto" in col_names:
            fetch_cols.append(fichas_table.c["estado_ficha_producto"])
        if "fecha_primera_carga" in col_names:
            fetch_cols.append(fichas_table.c["fecha_primera_carga"])
        with engine.connect() as _rc:
            for _r in _rc.execute(select(*fetch_cols)).fetchall():
                _rm = dict(zip([c.name for c in fetch_cols], _r))
                existing_map[str(_rm[key_col]).strip()] = _rm
        logger.info("Pre-fetched %d existing rows for delta detection", len(existing_map))
    except Exception as _fe:
        logger.warning("Could not pre-fetch existing rows: %s", _fe)

    # ── Upsert loop — PostgreSQL ON CONFLICT DO UPDATE (true upsert) ──────
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    inserted = 0
    updated = 0
    errors = 0
    deltas_suspendidas = []

    now_utc = datetime.now(tz=timezone.utc)
    rows = df.to_dict(orient="records")

    for batch_start in range(0, len(rows), BATCH_SIZE):
        batch_rows = rows[batch_start:batch_start + BATCH_SIZE]
        batch_vals: list = []

        for raw_row in batch_rows:
            clean_row = _clean(raw_row)
            key_val = clean_row.get(key_col)
            if not key_val or str(key_val).strip() in ("", "nan", "None"):
                errors += 1
                continue

            key_str = str(key_val).strip()
            existing = existing_map.get(key_str)

            if existing:
                # Delta: Ofertada → Suspendida
                try:
                    old_state = str(existing.get("estado_ficha_producto") or "").strip().lower()
                    new_state = str(clean_row.get("estado_ficha_producto") or "").strip().lower()
                    if "ofertada" in old_state and "suspendida" in new_state:
                        desc_keys = [k for k in clean_row if "descrip" in k]
                        desc = str(clean_row.get(desc_keys[0], "")).strip() if desc_keys else ""
                        deltas_suspendidas.append({
                            "marca": str(clean_row.get("marca", "")).strip(),
                            "nro_parte": key_str,
                            "descripcion": desc,
                            "anterior": existing.get("estado_ficha_producto"),
                            "actual": clean_row.get("estado_ficha_producto"),
                        })
                except Exception as diff_exc:
                    logger.warning("Delta calc error for %s: %s", key_str, diff_exc)

                # Preserve original insertion date
                clean_row.pop("fecha_primera_carga", None)
                updated += 1
            else:
                clean_row["fecha_primera_carga"] = now_utc
                # Track in-memory so duplicate keys within same Excel don't double-insert
                existing_map[key_str] = {"estado_ficha_producto": clean_row.get("estado_ficha_producto")}
                inserted += 1

            batch_vals.append(clean_row)

        if not batch_vals:
            continue

        try:
            with engine.begin() as conn:
                for val in batch_vals:
                    try:
                        stmt = pg_insert(fichas_table).values(**val)
                        up_cols = {
                            col: stmt.excluded[col]
                            for col in val
                            if col not in (key_col, "fecha_primera_carga")
                        }
                        stmt = stmt.on_conflict_do_update(
                            index_elements=[key_col],
                            set_=up_cols,
                        )
                        conn.execute(stmt)
                    except Exception as row_exc:
                        logger.error(
                            "Row upsert failed key=%.80s: %s",
                            val.get(key_col, "?"), row_exc,
                        )
                        errors += 1
                        if "fecha_primera_carga" in val:
                            inserted = max(0, inserted - 1)
                        else:
                            updated = max(0, updated - 1)
        except Exception as batch_exc:
            logger.error(
                "Batch %d–%d failed entirely: %s",
                batch_start, batch_start + len(batch_rows), batch_exc,
            )
            errors += len(batch_vals)
            inserted = max(0, inserted - sum(1 for v in batch_vals if "fecha_primera_carga" in v))
            updated = max(0, updated - sum(1 for v in batch_vals if "fecha_primera_carga" not in v))

        logger.info(
            "Batch %d–%d done — inserted=%d updated=%d errors=%d",
            batch_start, batch_start + len(batch_rows), inserted, updated, errors,
        )

    logger.info(
        "Upsert complete — inserted: %d, updated: %d, errors: %d",
        inserted, updated, errors,
    )
    return {
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
        "deltas_suspendidas": deltas_suspendidas,
    }



# ─── 4. Orchestrator ─────────────────────────────────────────────────────────

async def run_module_2(
    engine=None,
    agreement_selector: str = AGREEMENT_SELECTOR,
    agreement_code: str = "EXT-CE-2022-5",
    cleanup: bool = True,
) -> dict:
    """
    Full Module 2 pipeline: download → ETL → upsert → cleanup temp file.

    Args:
        engine: SQLAlchemy Engine. If None, falls back to the app's default
                engine imported from app.db.database.
        agreement_selector: CSS selector for the target agreement card.
        agreement_code: Short identifier used in filenames and log messages.
        cleanup: If True, delete the temp Excel after a successful upsert.

    Returns:
        Dict with keys:
          'filepath'       — path where the Excel was saved
          'rows_processed' — number of rows parsed from Excel
          'inserted'       — new records inserted
          'updated'        — existing records updated
          'errors'         — rows skipped due to errors

    Raises:
        CatalogDownloadError: If the Playwright download fails after all retries.
        ValueError: If the downloaded Excel is empty or unreadable.
    """
    logger.info("═══ CEAM AUDITOR — Módulo 2 — Inicio ═══")
    logger.info("Target agreement: %s", agreement_code)

    # Step 1 — Download
    filepath = await navigate_and_download(
        agreement_selector=agreement_selector,
        agreement_code=agreement_code,
    )
    logger.info("✔ Download OK: %s", filepath)

    # Step 2 — ETL
    df = process_catalog_excel(filepath)
    logger.info("✔ ETL OK: %d records ready for upsert", len(df))

    # Step 3 — Upsert
    if engine is None:
        from app.db.database import engine as app_engine  # lazy import (avoids circular deps)
        engine = app_engine

    result = upsert_fichas(df, engine)

    # Step 4 — Cleanup temp file
    if cleanup:
        try:
            Path(filepath).unlink()
            logger.info("✔ Temp file deleted: %s", filepath)
        except OSError as exc:
            logger.warning("Could not delete temp file %s: %s", filepath, exc)

    summary = {"filepath": filepath, "rows_processed": len(df), **result}
    logger.info("═══ Módulo 2 completado: %s ═══", summary)
    return summary


# ─── Entry point (standalone / testing) ──────────────────────────────────────

if __name__ == "__main__":
    # ── Example: run with SQLite for local testing ────────────────────────
    #
    # Prerequisites:
    #   pip install playwright pandas sqlalchemy openpyxl
    #   playwright install chromium --with-deps
    #
    # Run:
    #   python fichas_scraper.py
    #
    # The SQLite DB is created at /tmp/ceam_test.db.
    # Inspect results:
    #   sqlite3 /tmp/ceam_test.db ".tables"
    #   sqlite3 /tmp/ceam_test.db "SELECT COUNT(*) FROM fichas_producto;"
    #   sqlite3 /tmp/ceam_test.db "SELECT * FROM fichas_producto LIMIT 5;"

    test_engine = create_engine(
        "sqlite:////tmp/ceam_test.db",
        connect_args={"check_same_thread": False},
    )

    result = asyncio.run(
        run_module_2(
            engine=test_engine,
            agreement_selector=AGREEMENT_SELECTOR,
            agreement_code="EXT-CE-2022-5",
            cleanup=True,
        )
    )

    print("\n✅ Module 2 finished:")
    print(f"   File downloaded    : {result['filepath']}")
    print(f"   Records processed  : {result['rows_processed']}")
    print(f"   Inserted           : {result['inserted']}")
    print(f"   Updated            : {result['updated']}")
    print(f"   Errors             : {result['errors']}")
