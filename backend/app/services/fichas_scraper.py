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
    create_engine, insert, select, update,
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

# CSS selector for the agreement card — must match the data-agreement attribute exactly.
AGREEMENT_SELECTOR = (
    'div[data-agreement="VIGENTE\u2022EXT-CE-2022-5 COMPUTADORAS DE ESCRITORIO, '
    'COMPUTADORAS PORTATILES Y ESCANERES"]'
)

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

            # ── Select the agreement card ─────────────────────────────────
            logger.info("Locating agreement element...")
            agreement_el = page.locator(agreement_selector)
            await agreement_el.wait_for(state="visible", timeout=30_000)

            # Scroll into view first — prevents ClickNotAllowed on partially
            # visible elements that fall outside the rendered viewport.
            await agreement_el.scroll_into_view_if_needed()
            await page.wait_for_timeout(500)

            await agreement_el.click()
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
                await page.click(download_btn_selector)

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

    Commits are done in batches of BATCH_SIZE records to avoid saturating
    the database connection on large catalogs.

    Args:
        df: Cleaned DataFrame from process_catalog_excel().
        engine: SQLAlchemy Engine (sqlite or postgresql+psycopg2).

    Returns:
        Dict with keys 'inserted' (int), 'updated' (int), 'errors' (int).

    Raises:
        sqlalchemy.exc.SQLAlchemyError: On unrecoverable database connection errors.
    """
    meta = MetaData()

    # ── Auto-detect primary key column ────────────────────────────────────
    key_col = None
    for col in df.columns:
        if re.search(r"(codigo_ficha|cod_ficha|ficha|cod_producto)", col, re.I):
            key_col = col
            break
    if key_col is None:
        key_col = df.columns[0]
        logger.warning("No ficha code column detected — using '%s' as key", key_col)
    else:
        logger.info("Upsert key column: '%s'", key_col)

    # ── Build SQLAlchemy table definition from DataFrame dtypes ──────────
    def _sa_col(name: str, dtype) -> Column:
        if pd.api.types.is_float_dtype(dtype):
            return Column(name, Float, nullable=True)
        if pd.api.types.is_datetime64_any_dtype(dtype):
            return Column(name, DateTime(timezone=True), nullable=True)
        if pd.api.types.is_integer_dtype(dtype):
            return Column(name, Integer, nullable=True)
        return Column(name, Text, nullable=True)

    sa_cols = [Column(key_col, String(128), primary_key=True)]
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

    # ── Upsert loop ───────────────────────────────────────────────────────
    inserted = 0
    updated = 0
    errors = 0
    now_utc = datetime.now(tz=timezone.utc)
    rows = df.to_dict(orient="records")
    batch: list = []

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

    with engine.begin() as conn:
        for idx, raw_row in enumerate(rows):
            clean_row = _clean(raw_row)
            key_val = clean_row.get(key_col)
            if not key_val or str(key_val).strip() in ("", "nan", "None"):
                logger.warning("Row %d skipped — empty key value", idx)
                errors += 1
                continue

            batch.append((key_val, clean_row))

            if len(batch) >= BATCH_SIZE or idx == len(rows) - 1:
                for kv, row in batch:
                    try:
                        existing = conn.execute(
                            select(fichas_table).where(fichas_table.c[key_col] == kv)
                        ).fetchone()

                        if existing:
                            update_data = {
                                k: v for k, v in row.items()
                                if k != "fecha_primera_carga"
                            }
                            conn.execute(
                                update(fichas_table)
                                .where(fichas_table.c[key_col] == kv)
                                .values(**update_data)
                            )
                            updated += 1
                        else:
                            row["fecha_primera_carga"] = now_utc
                            conn.execute(insert(fichas_table).values(**row))
                            inserted += 1

                    except Exception as exc:
                        logger.error("Upsert error for key=%s: %s", kv, exc)
                        errors += 1

                logger.info(
                    "Batch committed — running totals: inserted=%d updated=%d errors=%d",
                    inserted, updated, errors,
                )
                batch = []

    logger.info(
        "Upsert complete — inserted: %d, updated: %d, errors: %d",
        inserted, updated, errors,
    )
    return {"inserted": inserted, "updated": updated, "errors": errors}


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
