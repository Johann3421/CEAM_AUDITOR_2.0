"""
Playwright-based RPA scraper for Perú Compras — Consulta de Órdenes Públicas.
URL: https://www.catalogos.perucompras.gob.pe/ConsultaOrdenesPub#

Tested flow (verified manually on 2026-04-10):
  1. Navigate to the portal.
  2. Open Select2 dropdown for #cboAcuerdo.
  3. Type keyword to filter, select a vigente option (skip "No Vigente").
  4. Fill #fechaInicial and #fechaFinal.
  5. Check #chkDetallado.
  6. Click #btnBuscar → wait for results table.
  7. Click #aExportarXLSX → download the .xlsx file.
  8. Process the Excel: skip 5 header rows, merge by Nro Orden Física.
  9. Upsert into PostgreSQL.
"""
import logging
import asyncio
import os
import re
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

    # ── Find the real header row dynamically ─────────────────────────────
    # The Perú Compras XLSX starts with several metadata/title rows before
    # the actual column headers. We scan the first 20 rows to find the one
    # that contains recognisable field names ("nro" + "proveedor").
    df_scan = pd.read_excel(filepath, header=None, engine="openpyxl", nrows=20)
    header_row_idx = None
    for i, row_data in df_scan.iterrows():
        cleaned = [
            re.sub(r"(_x[0-9a-fA-F]+_|\n|\r)", "", str(v)).strip().lower()
            for v in row_data
            if str(v).lower() not in ("nan", "none", "")
        ]
        line = " ".join(cleaned)
        if ("nro" in line or "c\u00f3digo" in line or "codigo" in line) and "proveedor" in line:
            header_row_idx = int(i)
            logger.info("Found real header row at raw index %d", header_row_idx)
            break

    if header_row_idx is None:
        logger.warning("Header row not found in first 20 rows — defaulting to skiprows=5")
        header_row_idx = 5

    try:
        df = pd.read_excel(filepath, skiprows=header_row_idx, engine="openpyxl")
    except Exception as exc:
        logger.error("Failed to read Excel with skiprows=%d: %s", header_row_idx, exc)
        return []

    # Normalize column names: strip whitespace, remove XML hex markers and line feeds
    df.columns = df.columns.astype(str).str.replace(
        r"(_x[0-9a-fA-F]+_|\n|\r)", "", regex=True
    ).str.strip()
    logger.info("Excel loaded: %d raw rows, columns: %s", len(df), list(df.columns))

    if len(df) == 0:
        logger.warning("Excel file is empty")
        return []

    # ── Column mapping (flexible matching) ────────────────────────────────
    col_map = {}
    for col in df.columns:
        cl = col.lower().strip()
        if ("código" in cl or "codigo" in cl) and "acuerdo" in cl:
            col_map["codigo_acuerdo_marco"] = col
        elif "procedimiento" in cl:
            col_map["procedimiento"] = col
        elif ("nro" in cl or "número" in cl or "numero" in cl) and "orden" in cl:
            col_map["nro_orden_fisica"] = col
        elif "ruc" in cl and ("entidad" in cl or "comprador" in cl):
            col_map["ruc_entidad"] = col
        elif ("nombre" in cl or "razón" in cl or "razon" in cl) and "entidad" in cl:
            col_map["nombre_entidad"] = col
        elif "entidad" in cl and "ruc" not in cl and "nombre_entidad" not in col_map:
            col_map["nombre_entidad"] = col
        elif "ruc" in cl and "proveedor" in cl:
            col_map["ruc_proveedor"] = col
        elif ("nombre" in cl or "razón" in cl or "razon" in cl) and "proveedor" in cl:
            col_map["nombre_proveedor"] = col
        elif "proveedor" in cl and "ruc" not in cl and "nombre_proveedor" not in col_map:
            col_map["nombre_proveedor"] = col
        elif "fecha" in cl and ("publicación" in cl or "publicacion" in cl):
            col_map["fecha_publicacion"] = col
        elif "fecha" in cl and ("aceptación" in cl or "aceptacion" in cl):
            col_map["fecha_aceptacion"] = col
        elif ("catálogo" in cl or "catalogo" in cl) and "categoría" not in cl:
            col_map["catalogo"] = col
        elif "categoría" in cl or "categoria" in cl:
            col_map["categoria"] = col
        elif "detalle" in cl or ("descripción" in cl and "producto" in cl):
            col_map["detalle_producto"] = col
        elif "lugar" in cl and "entrega" in cl:
            col_map["logistica_entrega"] = col
        elif "moneda" in cl:
            col_map["moneda"] = col
        elif "sub" in cl and "total" in cl:
            # Prefer order-level "Sub Total Orden Electrónica" over delivery-level "Sub Total".
            # "orden" is present only in the order-level variant, so set/overwrite when seen.
            if "sub_total" not in col_map or "orden" in cl:
                col_map["sub_total"] = col
        elif "igv" in cl:
            # Prefer order-level "IGV Orden Electrónica" over delivery-level "IGV Entrega".
            if "igv" not in col_map or "orden" in cl:
                col_map["igv"] = col
        elif "total" in cl and "orden" in cl and "sub" not in cl and "igv" not in cl:
            # "Total Orden Electrónica" — the real per-order total
            col_map["monto_total"] = col
        elif "monto_total" not in col_map and "monto" in cl and "total" in cl:
            # Fallback: "Monto Total Entrega" (delivery-level) only if not already mapped
            col_map["monto_total"] = col
        elif "estado" in cl and ("orden" in cl or "entrega" in cl):  # Estado de la Orden Electrónica
            if "estado_orden" not in col_map or ("orden" in cl and "entrega" not in cl):
                col_map["estado_orden"] = col
        elif "plazo" in cl or ("días" in cl and "entrega" in cl):
            col_map["plazo_entrega_dias"] = col
        elif "orden" in cl and "compra" in cl and "nro_orden_fisica" not in col_map:
            col_map["nro_orden_fisica"] = col

    logger.info("Column mapping: %s", col_map)

    # Find the order number column
    nro_col = col_map.get("nro_orden_fisica")
    if not nro_col:
        # Last resort: pick any column with "orden" in the name
        for col in df.columns:
            if "orden" in col.lower() and "estado" not in col.lower():
                nro_col = col
                col_map["nro_orden_fisica"] = col
                break

    if not nro_col:
        logger.error("No 'Nro Orden Física' column found. Columns: %s", list(df.columns))
        return []

    # Drop rows with empty order numbers
    df = df.dropna(subset=[nro_col])
    df[nro_col] = df[nro_col].astype(str).str.strip()
    df = df[df[nro_col] != ""]

    if len(df) == 0:
        logger.warning("No valid rows after cleanup")
        return []

    # ── Merge duplicate rows by Nro Orden Física ──────────────────────────
    def _merge_group(group):
        if len(group) == 1:
            return group.iloc[0]
        row = group.iloc[0].copy()
        for field_key in ["detalle_producto", "logistica_entrega"]:
            if field_key in col_map:
                c = col_map[field_key]
                vals = group[c].dropna().astype(str).unique()
                row[c] = " | ".join(v for v in vals if v.strip() and v.strip() != "nan")
        for field_key in ["sub_total", "igv", "monto_total"]:
            if field_key in col_map:
                c = col_map[field_key]
                row[c] = pd.to_numeric(group[c], errors="coerce").max()
        return row

    merged = df.groupby(nro_col, sort=False).apply(_merge_group).reset_index(drop=False)
    # If the above created a duplicate column or weird naming, we ensure the column exists
    if nro_col not in merged.columns and 'index' in merged.columns:
        merged = merged.rename(columns={'index': nro_col})
    
    logger.info("Merged %d raw rows → %d unique orders. Columns: %s", len(df), len(merged), list(merged.columns))

    # ── Convert to PurchaseOrderCreate ────────────────────────────────────
    orders = []
    for _, row in merged.iterrows():
        def _get(key, default=""):
            c = col_map.get(key)
            if c is None:
                return default
            val = row.get(c)
            if pd.isna(val):
                return default
            return val

        def _get_date(key):
            val = _get(key)
            if not val:
                return None
            if isinstance(val, (datetime, pd.Timestamp)):
                return val.date().isoformat()
            for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y %H:%M:%S"):
                try:
                    return datetime.strptime(str(val).strip(), fmt).date().isoformat()
                except ValueError:
                    continue
            return None

        def _get_decimal(key):
            val = _get(key)
            if not val:
                return None
            try:
                return float(str(val).replace(",", "").replace(" ", "").strip())
            except (ValueError, TypeError):
                return None

        def _get_int(key):
            val = _get(key)
            if not val:
                return None
            try:
                return int(float(str(val)))
            except (ValueError, TypeError):
                return None

        nro = str(_get("nro_orden_fisica")).strip()
        if not nro or nro == "nan":
            continue

        try:
            order = PurchaseOrderCreate(
                codigo_acuerdo_marco=str(_get("codigo_acuerdo_marco")).strip() or "N/A",
                procedimiento=str(_get("procedimiento")).strip() or "N/A",
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
            logger.warning("Skip row nro=%s: %s", nro, exc)
            continue

    logger.info("Parsed %d valid orders from Excel", len(orders))
    return orders


# ─── Playwright RPA ───────────────────────────────────────────────────────────

async def _download_excel(
    catalogo_keyword: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
) -> Optional[str]:
    """
    Automate the Peru Compras portal to download the detailed .xlsx export.

    Select2 dropdown IDs (verified 2026-04-10):
      - Acuerdo Marco:    select#cboAcuerdo  (rendered via Select2)
      - Entidad:          select#cboEntidad  (rendered via Select2)
      - Proveedor:        select#cboProveedor
      - Fecha inicial:    input#fechaInicial
      - Fecha final:      input#fechaFinal
      - Exportar check:   input#chkDetallado
      - Search button:    button#btnBuscar
      - XLSX download:    a#aExportarXLSX  (appears AFTER search returns results)
    """
    download_dir = tempfile.mkdtemp(prefix="ceam_scraper_")

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

        logger.info("Navigating to %s", BASE_URL)
        try:
            await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
            await page.wait_for_timeout(3000)
        except PWTimeout:
            await browser.close()
            raise RuntimeError("Timeout al cargar el portal de Perú Compras (30 s). Verifica la conexión de red.")

        # ── 1. Select Acuerdo Marco via Select2 ──────────────────────────
        try:
            # Click the Select2 container to open the dropdown
            select2_container = page.locator("#select2-cboAcuerdo-container")
            await select2_container.click()
            await page.wait_for_timeout(1000)

            # Type keyword to filter options
            search_input = page.locator("input.select2-search__field")
            keyword = catalogo_keyword or "COMPUTADORAS DE ESCRITORIO"
            await search_input.fill(keyword)
            await page.wait_for_timeout(2000)

            # Get all filtered results
            results = page.locator(".select2-results__option")
            count = await results.count()
            logger.info("Found %d Select2 options for '%s'", count, keyword)

            selected = False
            for i in range(count):
                option = results.nth(i)
                text = (await option.inner_text()).strip()
                logger.info("  Option %d: %s", i, text)

                # Skip "No Vigente" options
                if "no vigente" in text.lower():
                    continue

                # Skip placeholders
                if "seleccione" in text.lower():
                    continue

                # This is a vigente option — select it
                await option.click()
                logger.info("Selected: %s", text)
                selected = True
                break

            if not selected:
                await browser.close()
                raise RuntimeError(
                    f"No se encontró ningún Acuerdo Marco vigente para la búsqueda: '{keyword}'. "
                    "Verifica que la palabra clave coincida con un convenio activo en el portal."
                )

            await page.wait_for_timeout(1500)

        except RuntimeError:
            raise
        except Exception as exc:
            await browser.close()
            raise RuntimeError(f"Error al seleccionar Acuerdo Marco en el portal: {exc}") from exc

        # ── 2. Fill date range ────────────────────────────────────────────
        # Chromium <input type="date"> STRÍCTAMENTE requiere formato YYYY-MM-DD para un .fill() programático.
        def _format_date(d: str) -> str:
            if "/" in d:
                parts = d.split("/")
                if len(parts) == 3 and len(parts[0]) == 2:  # DD/MM/YYYY
                    return f"{parts[2]}-{parts[1]}-{parts[0]}"
            return d

        fecha_inicio = _format_date(fecha_inicio) if fecha_inicio else "2025-01-01"
        fecha_fin = _format_date(fecha_fin) if fecha_fin else "2025-03-31"

        try:
            fi = page.locator("#fechaInicial")
            await fi.click()
            await fi.fill(fecha_inicio)
            await fi.press("Tab") # ASP.NET Datepickers need focus out
            logger.info("Fecha inicial: %s", fecha_inicio)

            ff = page.locator("#fechaFinal")
            await ff.click()
            await ff.fill(fecha_fin)
            await ff.press("Tab")
            logger.info("Fecha final: %s", fecha_fin)
        except Exception as exc:
            logger.warning("Error filling dates: %s", exc)

        # ── 3. Check "Exportar Detallado" ─────────────────────────────────
        try:
            chk = page.locator("#chkDetallado")
            if not await chk.is_checked():
                await chk.check(force=True)
                logger.info("Checked 'Exportar Detallado'")
                # Critical: sometimes this checkbox triggers an ASP.NET UpdatePanel
                await page.wait_for_timeout(2000)
        except Exception as exc:
            logger.warning("Could not check 'Exportar Detallado': %s", exc)

        # ── 4. Click "INICIAR BÚSQUEDA" ──────────────────────────────────
        try:
            btn = page.locator("#btnBuscar")
            await btn.click(force=True)
            logger.info("Clicked INICIAR BÚSQUEDA")

            # CRÍTICO: La consulta Detallada de Perú Compras puede tomar entre 15 y 45 segundos.
            await page.wait_for_timeout(3000) # Dar tiempo a que el AJAX JS dispare

            logger.info("Waiting for network to completely settle...")
            await page.wait_for_load_state("networkidle", timeout=90000)
            logger.info("Network is idle. Search should be complete.")

            # Collect diagnostics
            rows_on_screen = await page.locator("tr.FilaDatos").count()
            first_row_text = ""
            if rows_on_screen > 0:
                first_row_text = await page.locator("tr.FilaDatos").first.inner_text()
            
            logger.info("ROWS ON SCREEN: %s, FIRST ROW: %s", rows_on_screen, first_row_text)

            # Esperar unos segundos finales para asentar ViewState ASP.NET
            await page.wait_for_timeout(5000)

        except PWTimeout:
            await browser.close()
            raise RuntimeError("Timeout esperando los resultados de búsqueda (60 s). El portal tardó demasiado.")
        except RuntimeError:
            raise
        except Exception as exc:
            await browser.close()
            raise RuntimeError(f"Error al ejecutar la búsqueda en el portal: {exc}") from exc

        # ── 5. Click .xlsx export link to download ────────────────────────
        try:
            xlsx_link = page.locator("#aExportarXLSX")
            if await xlsx_link.count() == 0:
                # Fallback: try text-based selector
                xlsx_link = page.locator("a:has-text('.xlsx')")

            link_href = await xlsx_link.first.get_attribute("href")
            link_class = await xlsx_link.first.get_attribute("class")
            link_disabled = await xlsx_link.first.get_attribute("disabled")
            
            logger.info("Export link Diagnostics: href=%s class=%s disabled=%s", link_href, link_class, link_disabled)

            logger.info("Clicking .xlsx export link...")

            async with page.expect_download(timeout=120000) as download_info:
                # Utilizamos evaluate para saltar las validaciones estrictas de Playwright.
                # A veces el framework ASP.NET le deja un atributo 'disabled' falso al botón
                # aunque funcionalmente ya permite la descarga.
                await xlsx_link.first.evaluate("node => node.click()")

            download = await download_info.value
            filename = download.suggested_filename or "ordenes_export.xlsx"
            dest_path = os.path.join(download_dir, filename)
            await download.save_as(dest_path)
            logger.info("Downloaded: %s (%s)", dest_path, filename)

            await browser.close()
            return dest_path, rows_on_screen, first_row_text, f"href: {link_href}, class: {link_class}, disabled: {link_disabled}"

        except PWTimeout:
            await browser.close()
            raise RuntimeError("Timeout al descargar el archivo .xlsx (120 s). El portal no entregó el archivo a tiempo.")
        except RuntimeError:
            raise
        except Exception as exc:
            await browser.close()
            raise RuntimeError(f"Error al descargar el archivo .xlsx: {exc}") from exc


# ─── Sync Wrapper for Celery ──────────────────────────────────────────────────

def run_scrape_sync(
    db_session,
    catalogo: Optional[str] = None,
    max_pages: int = 10,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
) -> dict:
    """
    Synchronous entry-point called by Celery tasks.
    max_pages is kept for API compatibility but not used (we download full Excel).
    """
    from app.services import crud

    inserted = 0
    updated = 0

    async def _run():
        nonlocal inserted, updated

        filepath, rows_on_screen, fr_text, link_diag = await _download_excel(
            catalogo_keyword=catalogo,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
        )

        if not filepath or not os.path.exists(filepath):
            logger.error("No Excel file downloaded")
            return

        orders = _process_excel(filepath)

        for order in orders:
            existing = crud.get_order_by_nro(db_session, order.nro_orden_fisica)
            crud.upsert_order(db_session, order)
            if existing:
                updated += 1
            else:
                inserted += 1

        try:
            os.remove(filepath)
        except OSError:
            pass

    asyncio.run(_run())
    return {"inserted": inserted, "updated": updated}
