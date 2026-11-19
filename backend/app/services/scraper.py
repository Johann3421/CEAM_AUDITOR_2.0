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
import json
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
        elif "orden" in cl and ("digitalizada" in cl or "digital" in cl):
            col_map["orden_digitalizada"] = col
        elif ("nro" in cl or "número" in cl or "numero" in cl) and ("parte" in cl or "part" in cl):
            col_map["nro_parte"] = col
        elif ("precio" in cl or "p.u" in cl or "pu" == cl or "unitario" in cl) and "total" not in cl and "sub" not in cl and "orden" not in cl and "flete" not in cl:
            col_map["precio_unitario"] = col
        elif ("cantidad" in cl or "cant" in cl or "unidades" in cl) and "orden" not in cl:
            col_map["cantidad"] = col
        elif "orden" in cl and "electr" in cl and "estado" not in cl and "sub" not in cl and "igv" not in cl and "total" not in cl:
            if "orden_electronica" not in col_map:
                col_map["orden_electronica"] = col
        elif "marca" in cl:
            col_map["marca"] = col

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

    elec_col = col_map.get("orden_electronica")
    if not elec_col:
        logger.warning("No 'Orden Electrónica' column found, fallback to physical order.")
        elec_col = nro_col

    # ── Fallback: fill empty orden_electronica with nro_orden_fisica ──────
    # Some orders in the Excel have the "Orden Electrónica" column empty/NaN
    # (e.g. orders not yet fully digitised). Without this fallback those rows
    # are silently dropped by the dropna below, losing valid order data.
    if elec_col != nro_col:
        mask_na = df[elec_col].isna()
        mask_empty = df[elec_col].astype(str).str.strip().isin(["", "nan", "NaN", "None"])
        mask = mask_na | mask_empty
        filled_count = mask.sum()
        if filled_count > 0:
            df.loc[mask, elec_col] = df.loc[mask, nro_col]
            logger.info("Filled %d empty orden_electronica values with nro_orden_fisica fallback", filled_count)

    # Drop rows with empty order numbers
    df = df.dropna(subset=[elec_col])
    df[elec_col] = df[elec_col].astype(str).str.strip()
    df = df[df[elec_col] != ""]
    df[nro_col] = df[nro_col].astype(str).str.strip()

    if len(df) == 0:
        logger.warning("No valid rows after cleanup")
        return []

    # ── Merge duplicate rows by Nro Orden Física (Enfoque de Matemática Discreta) ──
    # Para órdenes con múltiples productos, el excel genera múltiples filas (y con sufijos
    # -0, -1, etc. en la orden electrónica). Agrupamos obteniendo la base de la orden.
    def _get_base_order(o):
        parts = str(o).strip().split('-')
        if len(parts) >= 4 and parts[-1].isdigit():
            return '-'.join(parts[:-1])
        return str(o)

    df['_base_elec'] = df[elec_col].apply(_get_base_order)

    def _merge_group(group):
        # Tomamos el ÚLTIMO elemento base, ya que las filas posteriores (-1, -2)
        # suelen contener el 'Estado de la Orden' y 'Precios' definitivos, evitando los '0.00' iniciales
        row = group.iloc[-1].copy()
        # Sobrescribimos el valor de la orden electrónica para que sea el código base unificado
        row[elec_col] = group.name
        
        # Eliminar precio_unitario de las funciones numéricas y nro_parte de concatenación normal
        # 1. Operación de Monoide Libre (Concatenación sin repetición) para textos múltiples
        for field_key in ["detalle_producto", "logistica_entrega"]:
            if field_key in col_map:
                c = col_map[field_key]
                vals = group[c].dropna().astype(str).unique()
                row[c] = " | ".join(v for v in vals if v.strip() and v.strip() != "nan")
                
        # Construcción de JSON para productos anidados en nro_parte
        # Esto soluciona el requerimiento de múltiples productos sin separar la orden base
        productos = []
        if "nro_parte" in col_map:
            parte_col = col_map["nro_parte"]
            pu_col = col_map.get("precio_unitario", "")
            cant_col = col_map.get("cantidad", "")
            
            # We want tracking of sub totals strictly for each product line.
            # In the Excel, 'Sub Total' represents the item total. 
            sub_col_item = None
            for col in group.columns:
                if "sub" in col.lower() and "total" in col.lower() and "orden" not in col.lower():
                    sub_col_item = col
                    break
                    
            partes_unicas = group[parte_col].dropna().astype(str).unique()
            for p in partes_unicas:
                if p.strip() in ("", "nan", "None"): continue
                
                # Filter rows of this part that actually have a price > 0
                filas_p = group[group[parte_col].astype(str) == p]
                precio_val = 0.0
                total_val = 0.0
                cant_val = 1.0

                if cant_col and cant_col in filas_p.columns:
                    c_series = pd.to_numeric(filas_p[cant_col].astype(str).str.replace(",", "").str.replace(" ", ""), errors="coerce")
                    if not c_series.dropna().empty:
                        c_max = float(c_series.max())
                        if c_max > 0:
                            cant_val = c_max

                if pu_col and pu_col in filas_p.columns:
                    # try to max the prices because the -0 row has 0.00
                    p_series = pd.to_numeric(filas_p[pu_col].astype(str).str.replace(",", "").str.replace(" ", ""), errors="coerce")
                    if not p_series.dropna().empty:
                        precio_val = float(p_series.max())
                
                if sub_col_item:
                    s_series = pd.to_numeric(filas_p[sub_col_item].astype(str).str.replace(",", "").str.replace(" ", ""), errors="coerce")
                    if not s_series.dropna().empty:
                        total_val = float(s_series.max())
                
                # REGLA CRUCIAL DE PRECIO UNITARIO:
                # 1. Si precio_val es 0 pero hay total y cantidad > 0, calcular precio_unitario real
                if (precio_val <= 0 or precio_val is None) and total_val > 0 and cant_val > 0:
                    precio_val = round(total_val / cant_val, 4)
                
                # 2. Si cant_val > 1 y por error precio_val vino igual al total_val (precio total en vez de unitario), corregir
                if cant_val > 1 and precio_val > 0 and abs(precio_val - total_val) < 0.01:
                    precio_val = round(total_val / cant_val, 4)
                
                productos.append({
                    "nro_parte": p.strip(),
                    "precio_unitario": precio_val,
                    "cantidad": int(cant_val) if cant_val >= 1 else 1,
                    "total": total_val
                })
        
        row[col_map.get("nro_parte", "nro_parte")] = json.dumps(productos, ensure_ascii=False) if productos else ""

        # Asignar precio unitario al row base a partir del primer producto válido
        if productos and productos[0]["precio_unitario"] > 0:
            row["precio_unitario"] = str(productos[0]["precio_unitario"])
        elif pu_col and pu_col in group.columns:
            p_series = pd.to_numeric(group[pu_col].astype(str).str.replace(",", "").str.replace(" ", ""), errors="coerce")
            if not p_series.dropna().empty:
                valid_p = p_series[p_series > 0]
                if not valid_p.empty:
                    row["precio_unitario"] = str(valid_p.iloc[-1])

        # 2. Función Supremo (Máximo) para conjuntos Numéricos (excluyendo precio_unitario)
        for field_key in ["sub_total", "igv", "monto_total"]:
            if field_key in col_map:
                c = col_map[field_key]
                # Se garantiza que campos string como '1,200.5' sean tratables
                cleaned = pd.to_numeric(group[c].astype(str).str.replace(",", "").str.replace(" ", ""), errors="coerce")
                if not cleaned.dropna().empty:
                    # Casteamos a string para evitar TypeError si el dataframe base inicializó la columna como StringExtensionType
                    row[c] = str(cleaned.max())
                    
        # 3. Función de Elección (Primer válido) para URLs y Documentos
        for field_key in ["orden_digitalizada"]:
            if field_key in col_map:
                c = col_map[field_key]
                valid_vals = [v for v in group[c].dropna().astype(str) if v.strip() and v.strip() != "nan"]
                if valid_vals:
                    row[c] = valid_vals[0]
                    
        return row

    merged = df.groupby('_base_elec', sort=False).apply(_merge_group).reset_index(drop=True)

    # After reset_index the groupby key '_base_elec' is gone from the frame;
    # _merge_group already wrote group.name into row[elec_col] so elec_col is
    # preserved correctly. Clean up the helper column if it leaked through.
    if '_base_elec' in merged.columns and '_base_elec' != elec_col:
        merged = merged.drop(columns=['_base_elec'], errors='ignore')

    logger.info("Merged %d raw rows → %d unique base orders. Columns: %s", len(df), len(merged), list(merged.columns))

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
        elec = str(_get("orden_electronica")).strip()
        if not elec or elec == "nan" or not nro or nro == "nan":
            continue

        try:
            order = PurchaseOrderCreate(
                codigo_acuerdo_marco=str(_get("codigo_acuerdo_marco")).strip() or "N/A",
                procedimiento=str(_get("procedimiento")).strip() or "N/A",
                orden_electronica=elec,
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
                orden_digitalizada=str(_get("orden_digitalizada")).strip() or None,
                nro_parte=str(_get("nro_parte")).strip() or None,
                precio_unitario=_get_decimal("precio_unitario"),
                marca=str(_get("marca")).strip() or None,
            )
            orders.append(order)
        except Exception as exc:
            logger.warning("Skip row nro=%s: %s", nro, exc)
            continue

    logger.info("Parsed %d valid orders from Excel", len(orders))
    return orders


# ─── High-Performance PostgreSQL Batch Upsert ───────────────────────────────

def batch_upsert_orders(db_session, orders: List[PurchaseOrderCreate]) -> tuple:
    """
    High-performance bulk upsert for PurchaseOrder using PostgreSQL ON CONFLICT DO UPDATE.
    Dramatically reduces I/O compared to row-by-row commits.
    Returns (inserted_count, updated_count).
    """
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.models.purchase_order import PurchaseOrder

    if not orders:
        return 0, 0

    # 1. Deduplicate by orden_electronica (keep the last valid occurrence in the batch)
    unique_orders_dict = {}
    for o in orders:
        key = (o.orden_electronica or "").strip()
        if not key or key in ("nan", "None"):
            continue
        unique_orders_dict[key] = o.model_dump()

    if not unique_orders_dict:
        return 0, 0

    target_keys = list(unique_orders_dict.keys())

    # 2. Query which keys already exist in the database (single SELECT)
    existing_keys = set(
        r[0] for r in db_session.query(PurchaseOrder.orden_electronica)
        .filter(PurchaseOrder.orden_electronica.in_(target_keys))
        .all()
    )

    inserted_count = len(target_keys) - len(existing_keys)
    updated_count = len(existing_keys)

    # 3. Prepare PostgreSQL ON CONFLICT DO UPDATE statement
    stmt = pg_insert(PurchaseOrder)
    update_cols = {
        col.name: getattr(stmt.excluded, col.name)
        for col in PurchaseOrder.__table__.columns
        if col.name not in ("id", "orden_electronica")
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=["orden_electronica"],
        set_=update_cols,
    )

    # 4. Execute in chunks of 500
    rows = list(unique_orders_dict.values())
    chunk_size = 500
    for i in range(0, len(rows), chunk_size):
        batch = rows[i:i + chunk_size]
        db_session.execute(stmt, batch)

    db_session.commit()
    logger.info("Batch upsert completed: %d inserted, %d updated", inserted_count, updated_count)
    return inserted_count, updated_count


# ─── Playwright RPA (Optimized Session Reuse & Fast Chunking) ────────────────

def _format_date(d: str) -> str:
    """Normalize dates to YYYY-MM-DD format."""
    if not d:
        return ""
    if "/" in d:
        parts = d.split("/")
        if len(parts) == 3 and len(parts[0]) == 2:  # DD/MM/YYYY
            return f"{parts[2]}-{parts[1]}-{parts[0]}"
    return d.strip()


async def _select_acuerdo_marco(page, catalogo_keyword: Optional[str]):
    """Select the target Acuerdo Marco once in the Select2 dropdown."""
    select2_container = page.locator("#select2-cboAcuerdo-container")
    await select2_container.click()
    await page.wait_for_timeout(1000)

    raw_kw = catalogo_keyword or "COMPUTADORAS DE ESCRITORIO"
    # Extract clean agreement code if formatted as "CODE — Title"
    keyword = raw_kw.split("—")[0].strip() if "—" in raw_kw else raw_kw.strip()

    search_input = page.locator("input.select2-search__field")
    await search_input.fill(keyword)
    await page.wait_for_timeout(2000)

    results = page.locator(".select2-results__option")
    count = await results.count()
    logger.info("Found %d Select2 options for '%s'", count, keyword)

    selected = False
    for i in range(count):
        option = results.nth(i)
        text = (await option.inner_text()).strip()

        # Skip non-vigente or placeholders
        if "no vigente" in text.lower() or "seleccione" in text.lower() or "no se encontraron" in text.lower():
            continue

        await option.click()
        logger.info("Selected agreement: %s", text)
        selected = True
        break

    if not selected:
        raise RuntimeError(
            f"No se encontró ningún Acuerdo Marco vigente para la búsqueda: '{keyword}'. "
            "Verifica que la palabra clave coincida con un convenio activo en el portal."
        )
    await page.wait_for_timeout(1500)


async def _query_chunk(page, chunk_start: str, chunk_end: str, download_dir: str, chunk_idx: int) -> Optional[str]:
    """Execute search for a single date range chunk and download the Excel file if results exist."""
    # 1. Fill dates
    fi = page.locator("#fechaInicial")
    await fi.click()
    await fi.fill(chunk_start)
    await fi.press("Tab")

    ff = page.locator("#fechaFinal")
    await ff.click()
    await ff.fill(chunk_end)
    await ff.press("Tab")

    # 2. Check "Exportar Detallado"
    chk = page.locator("#chkDetallado")
    if not await chk.is_checked():
        await chk.check(force=True)
        await page.wait_for_timeout(1000)

    # 3. Click INICIAR BÚSQUEDA
    btn = page.locator("#btnBuscar")
    await btn.click(force=True)
    await page.wait_for_timeout(2500)

    try:
        await page.wait_for_load_state("networkidle", timeout=60000)
    except Exception:
        pass
    await page.wait_for_timeout(2000)

    # 4. Check rows on screen: if 0, skip download immediately (avoids hanging for 10 minutes)
    rows_on_screen = await page.locator("tr.FilaDatos").count()
    logger.info("Chunk %d (%s..%s) returned %d rows on screen", chunk_idx + 1, chunk_start, chunk_end, rows_on_screen)
    if rows_on_screen == 0:
        logger.info("Zero rows found for chunk %s..%s, skipping Excel export", chunk_start, chunk_end)
        return None

    # 5. Click .xlsx export link
    xlsx_link = page.locator("#aExportarXLSX").first
    if await xlsx_link.count() == 0:
        xlsx_link = page.locator("a:has-text('.xlsx')").first

    logger.info("Clicking .xlsx export link for chunk %d...", chunk_idx + 1)
    async with page.expect_download(timeout=60000) as download_info:
        await xlsx_link.evaluate("node => node.click()")

    download = await download_info.value
    filename = download.suggested_filename or f"ordenes_chunk_{chunk_idx}.xlsx"
    dest_path = os.path.join(download_dir, filename)
    await download.save_as(dest_path)
    logger.info("Chunk %d downloaded: %s (%s)", chunk_idx + 1, dest_path, filename)
    return dest_path


def _split_date_range(start_str: Optional[str], end_str: Optional[str], max_days: int = 30) -> List[tuple]:
    """Split a date range YYYY-MM-DD into sub-ranges of up to `max_days` to prevent server timeouts."""
    if not start_str or not end_str:
        return [(_format_date(start_str) or "2025-01-01", _format_date(end_str) or "2025-03-31")]

    start_str = _format_date(start_str)
    end_str = _format_date(end_str)

    try:
        dt_start = datetime.strptime(start_str, "%Y-%m-%d").date()
        dt_end = datetime.strptime(end_str, "%Y-%m-%d").date()
    except ValueError:
        return [(start_str, end_str)]

    if dt_start >= dt_end:
        return [(start_str, end_str)]

    chunks = []
    curr_start = dt_start
    while curr_start <= dt_end:
        curr_end = min(curr_start + timedelta(days=max_days - 1), dt_end)
        chunks.append((curr_start.isoformat(), curr_end.isoformat()))
        curr_start = curr_end + timedelta(days=1)
    return chunks


async def _run_scrape_async(
    db_session,
    catalogo: Optional[str] = None,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    progress_callback: Optional[callable] = None,
) -> dict:
    """
    Main asynchronous scraper loop reusing a SINGLE Playwright browser instance across chunks.
    Reports real progress and bulk-upserts orders directly into PostgreSQL.
    """
    total_inserted = 0
    total_updated = 0

    chunks = _split_date_range(fecha_inicio, fecha_fin, max_days=30)
    total_chunks = len(chunks)
    logger.info("Scraping date range %s to %s split into %d chunk(s)", fecha_inicio, fecha_fin, total_chunks)

    if progress_callback:
        progress_callback({
            "progress": 5,
            "current_chunk": 0,
            "total_chunks": total_chunks,
            "phase": "init",
            "phase_desc": f"Iniciando sesión con Perú Compras (0/{total_chunks} bloques)",
            "inserted": 0,
            "updated": 0,
        })

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

        try:
            logger.info("Navigating to %s", BASE_URL)
            await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=45000)
            await page.wait_for_timeout(2000)

            # Dismiss modal popup if present on load
            try:
                modal = page.locator("#divPopUpComunicadoBloqueado")
                if await modal.is_visible(timeout=2000):
                    await page.evaluate("""() => {
                        const m = document.getElementById('divPopUpComunicadoBloqueado');
                        if (m) m.style.display = 'none';
                        const b = document.querySelector('.modal-backdrop');
                        if (b) b.remove();
                        document.body.classList.remove('modal-open');
                    }""")
            except Exception:
                pass

            await _select_acuerdo_marco(page, catalogo)
        except Exception as init_exc:
            await browser.close()
            raise RuntimeError(f"Fallo al inicializar sesión en Perú Compras: {init_exc}") from init_exc

        for chunk_idx, (chunk_start, chunk_end) in enumerate(chunks):
            pct = round(10 + (chunk_idx / total_chunks) * 80)
            if progress_callback:
                progress_callback({
                    "progress": pct,
                    "current_chunk": chunk_idx + 1,
                    "total_chunks": total_chunks,
                    "chunk_range": f"{chunk_start} → {chunk_end}",
                    "phase": "fetch",
                    "phase_desc": f"Consultando bloque {chunk_idx + 1} de {total_chunks} ({chunk_start} al {chunk_end})",
                    "inserted": total_inserted,
                    "updated": total_updated,
                })

            filepath = None
            try:
                filepath = await _query_chunk(page, chunk_start, chunk_end, download_dir, chunk_idx)
            except Exception as chunk_exc:
                logger.error("Error downloading chunk %d (%s..%s): %s", chunk_idx + 1, chunk_start, chunk_end, chunk_exc)
                # Attempt recovering the page if it got into a bad state
                try:
                    await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=30000)
                    await page.wait_for_timeout(1500)
                    await _select_acuerdo_marco(page, catalogo)
                except Exception as rec_exc:
                    logger.warning("Recovery navigation failed: %s", rec_exc)
                continue

            if filepath and os.path.exists(filepath):
                if progress_callback:
                    progress_callback({
                        "progress": pct,
                        "current_chunk": chunk_idx + 1,
                        "total_chunks": total_chunks,
                        "chunk_range": f"{chunk_start} → {chunk_end}",
                        "phase": "save",
                        "phase_desc": f"Guardando datos del bloque {chunk_idx + 1} de {total_chunks} en BD...",
                        "inserted": total_inserted,
                        "updated": total_updated,
                    })

                orders = _process_excel(filepath)
                if orders and db_session:
                    ins, upd = batch_upsert_orders(db_session, orders)
                    total_inserted += ins
                    total_updated += upd

                try:
                    os.remove(filepath)
                except OSError:
                    pass

        await browser.close()

    # Safe cleanup of completely corrupt / blank records
    try:
        from sqlalchemy import or_
        from app.models.purchase_order import PurchaseOrder
        pruned = db_session.query(PurchaseOrder).filter(
            or_(
                PurchaseOrder.orden_electronica.is_(None),
                PurchaseOrder.orden_electronica.in_(["", "nan", "None"]),
                PurchaseOrder.nro_orden_fisica.is_(None),
                PurchaseOrder.nro_orden_fisica.in_(["", "nan", "None"]),
            )
        ).delete(synchronize_session="fetch")
        if pruned > 0:
            db_session.commit()
            logger.info("Pruned %d corrupt records", pruned)
    except Exception as exc:
        logger.warning("Corrupt records cleanup failed (non-critical): %s", exc)
        db_session.rollback()

    if progress_callback:
        progress_callback({
            "progress": 100,
            "current_chunk": total_chunks,
            "total_chunks": total_chunks,
            "phase": "done",
            "phase_desc": f"¡Extracción finalizada! {total_inserted} nuevas, {total_updated} actualizadas.",
            "inserted": total_inserted,
            "updated": total_updated,
        })

    return {"inserted": total_inserted, "updated": total_updated}


# ─── Sync Wrapper for Celery ──────────────────────────────────────────────────

def run_scrape_sync(
    db_session,
    catalogo: Optional[str] = None,
    max_pages: int = 10,
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
    progress_callback: Optional[callable] = None,
) -> dict:
    """
    Synchronous entry-point called by Celery tasks.
    Automatically splits long date ranges into 30-day chunks and reuses a single browser.
    """
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        return loop.run_until_complete(
            _run_scrape_async(
                db_session,
                catalogo=catalogo,
                fecha_inicio=fecha_inicio,
                fecha_fin=fecha_fin,
                progress_callback=progress_callback,
            )
        )
    finally:
        loop.close()
        asyncio.set_event_loop(None)

