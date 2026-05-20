"""Purchase Orders REST endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.schemas.purchase_order import PurchaseOrderCreate, PurchaseOrderResponse
from app.services import crud

router = APIRouter(prefix="/purchase-orders", tags=["Purchase Orders"])


@router.get("/", response_model=List[PurchaseOrderResponse])
def list_orders(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=500),
    catalogo: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    estado_orden: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    entidad: Optional[str] = Query(None),
    proveedor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List purchase orders with optional filters and pagination."""
    return crud.get_orders(
        db,
        skip=skip,
        limit=limit,
        catalogo=catalogo,
        categoria=categoria,
        estado_orden=estado_orden,
        search=search,
        entidad=entidad,
        proveedor=proveedor,
    )


@router.get("/summary")
def get_orders_summary(
    catalogo: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    estado_orden: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    entidad: Optional[str] = Query(None),
    proveedor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Return total count of purchase orders matching the provided filters."""
    total = crud.count_orders_filtered(
        db,
        catalogo=catalogo,
        categoria=categoria,
        estado_orden=estado_orden,
        search=search,
        entidad=entidad,
        proveedor=proveedor,
    )
    return {"total": total}


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Aggregated statistics for dashboard KPIs and charts."""
    return crud.get_stats(db)


@router.get("/catalogos-filter")
def get_catalogos_filter(db: Session = Depends(get_db)):
    """Return distinct catalogo values present in the DB for the filter dropdown."""
    from app.models.purchase_order import PurchaseOrder
    rows = (
        db.query(PurchaseOrder.catalogo)
        .filter(PurchaseOrder.catalogo.isnot(None))
        .distinct()
        .order_by(PurchaseOrder.catalogo)
        .all()
    )
    return {"catalogos": [r[0] for r in rows if r[0]]}


@router.get("/filters/{column_name}")
def get_column_filters(column_name: str, db: Session = Depends(get_db)):
    """Return distinct non-null values for a specific column to build Excel-like filters."""
    from app.models.purchase_order import PurchaseOrder
    valid_columns = {
        "entidad": PurchaseOrder.nombre_entidad,
        "proveedor": PurchaseOrder.nombre_proveedor,
        "estado": PurchaseOrder.estado_orden,
    }
    if column_name not in valid_columns:
        raise HTTPException(status_code=400, detail="Columna no permitida para filtros")
    
    col = valid_columns[column_name]
    rows = db.query(col).filter(col.isnot(None), col != '').distinct().order_by(col).all()
    return {"values": [r[0] for r in rows if r[0]]}


@router.delete("/all", status_code=200)
def delete_all_orders(db: Session = Depends(get_db)):
    """Delete ALL purchase orders from the database. Used to reset data before a fresh scrape."""
    from app.models.purchase_order import PurchaseOrder
    count = db.query(PurchaseOrder).count()
    db.query(PurchaseOrder).delete()
    db.commit()
    return {"deleted": count, "message": f"Se eliminaron {count} órdenes de compra"}


@router.get("/providers")
def list_providers(db: Session = Depends(get_db)):
    """Return all distinct providers with their order count and total amount."""
    from app.models.purchase_order import PurchaseOrder
    from sqlalchemy import func as f
    rows = (
        db.query(
            PurchaseOrder.nombre_proveedor,
            f.count(PurchaseOrder.id).label("orders"),
            f.sum(PurchaseOrder.monto_total).label("total"),
        )
        .group_by(PurchaseOrder.nombre_proveedor)
        .order_by(f.sum(PurchaseOrder.monto_total).desc())
        .all()
    )
    return {
        "providers": [
            {
                "nombre_proveedor": r[0],
                "orders": r[1],
                "total": float(r[2] or 0),
            }
            for r in rows
            if r[0]
        ]
    }


@router.get("/export")
def export_orders_csv(
    proveedor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Stream orders as CSV. Filter by proveedor if provided."""
    import csv
    import io
    from fastapi.responses import StreamingResponse

    orders = crud.get_orders(db, skip=0, limit=100_000, proveedor=proveedor)

    def generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "id", "orden_electronica", "nro_orden_fisica", "fecha_publicacion",
            "nombre_entidad", "nombre_proveedor", "catalogo", "categoria",
            "estado_orden", "monto_total", "nro_parte",
        ])
        for o in orders:
            writer.writerow([
                o.id, o.orden_electronica, o.nro_orden_fisica,
                o.fecha_publicacion, o.nombre_entidad, o.nombre_proveedor,
                o.catalogo, o.categoria, o.estado_orden, o.monto_total, o.nro_parte,
            ])
        yield buf.getvalue()

    filename = f"ordenes_{proveedor or 'todas'}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export-excel")
def export_orders_excel(
    catalogo: Optional[str] = Query(None),
    categoria: Optional[str] = Query(None),
    estado_orden: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    entidad: Optional[str] = Query(None),
    proveedor: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Export purchase orders as a styled Excel file respecting all active filters."""
    import io
    import json as _json
    from datetime import datetime
    from fastapi.responses import StreamingResponse
    from openpyxl import Workbook
    from openpyxl.styles import PatternFill, Font, Alignment, Border, Side
    from openpyxl.utils import get_column_letter

    orders = crud.get_orders(
        db, skip=0, limit=100_000,
        catalogo=catalogo, categoria=categoria,
        estado_orden=estado_orden, search=search,
        entidad=entidad, proveedor=proveedor,
    )

    # ── Column definitions: (display label, model attr, column width) ────
    COLS = [
        ("Orden Electrónica",        "orden_electronica",    24),
        ("Nro. Orden Física",         "nro_orden_fisica",     20),
        ("Fecha Publicación",         "fecha_publicacion",    18),
        ("Entidad",                   "nombre_entidad",       40),
        ("Proveedor",                 "nombre_proveedor",     40),
        ("Catálogo",                  "catalogo",             22),
        ("Categoría",                 "categoria",            26),
        ("Estado",                    "estado_orden",         14),
        ("Total con IGV (S/)",        "monto_total",          19),
        ("Productos  (P/N · Precio unit. · Subtotal s/IGV)", "nro_parte", 60),
    ]

    # ── Styles ─────────────────────────────────────────────────────────────
    HDR_FILL   = PatternFill("solid", fgColor="1E3A8A")
    TITLE_FILL = PatternFill("solid", fgColor="0F172A")
    ALT_FILL   = PatternFill("solid", fgColor="EFF6FF")
    HDR_FONT   = Font(bold=True, color="FFFFFF", size=10, name="Calibri")
    TITLE_FONT = Font(bold=True, color="FFFFFF", size=11, name="Calibri")
    BOLD_GREEN = Font(bold=True, color="065F46", name="Calibri", size=9)
    BASE_FONT  = Font(name="Calibri", size=9)
    thin       = Side(style="thin", color="CBD5E1")
    BORDER     = Border(left=thin, right=thin, top=thin, bottom=thin)
    CENTER     = Alignment(horizontal="center", vertical="center", wrap_text=True)
    WRAP       = Alignment(wrap_text=True, vertical="top")
    TOP        = Alignment(vertical="top")
    R_TOP      = Alignment(horizontal="right", vertical="top")
    MONEY_FMT  = "S/ #,##0.00"

    wb = Workbook()
    ws = wb.active
    ws.title = "Órdenes de Compra"

    # ── Title ────────────────────────────────────────────────────────────
    filters_info = []
    if proveedor:    filters_info.append(f"Proveedor: {proveedor}")
    if entidad:      filters_info.append(f"Entidad: {entidad}")
    if catalogo:     filters_info.append(f"Catálogo: {catalogo}")
    if estado_orden: filters_info.append(f"Estado: {estado_orden}")
    if search:       filters_info.append(f"Búsqueda: {search}")

    title_txt = "Órdenes de Compra — CEAM AUDITOR"
    if filters_info:
        title_txt += f"  |  Filtros: {' · '.join(filters_info)}"
    title_txt += f"  |  {len(orders):,} registros  |  Exportado: {datetime.now().strftime('%d/%m/%Y %H:%M')}"

    ncols = len(COLS)
    ws.merge_cells(f"A1:{get_column_letter(ncols)}1")
    tc = ws["A1"]
    tc.value = title_txt
    tc.fill = TITLE_FILL
    tc.font = TITLE_FONT
    tc.alignment = CENTER
    ws.row_dimensions[1].height = 24

    # ── Headers ──────────────────────────────────────────────────────────
    for ci, (label, _, width) in enumerate(COLS, start=1):
        cell = ws.cell(row=2, column=ci, value=label)
        cell.fill = HDR_FILL
        cell.font = HDR_FONT
        cell.alignment = CENTER
        cell.border = BORDER
        ws.column_dimensions[get_column_letter(ci)].width = width
    ws.row_dimensions[2].height = 28

    # ── Data ─────────────────────────────────────────────────────────────
    for ri, order in enumerate(orders, start=3):
        is_alt = ri % 2 == 0
        for ci, (label, field, _) in enumerate(COLS, start=1):
            raw = getattr(order, field, None)

            if field == "nro_parte":
                try:
                    prods = _json.loads(raw or "[]")
                    if isinstance(prods, list) and prods:
                        lines = []
                        for p in prods:
                            nro = p.get("nro_parte") or "—"
                            pu  = p.get("precio_unitario")
                            pt  = p.get("total")
                            pu_s = f"S/ {float(pu):,.2f}" if pu is not None else "—"
                            pt_s = f"S/ {float(pt):,.2f}" if pt is not None else "—"
                            lines.append(f"• {nro}   unit.: {pu_s}   sub s/IGV: {pt_s}")
                        val = "\n".join(lines)
                    else:
                        val = str(raw) if raw else "—"
                except Exception:
                    val = str(raw) if raw else "—"
            elif field == "monto_total" and raw is not None:
                val = float(raw)
            elif field == "fecha_publicacion" and raw is not None:
                val = str(raw)
            else:
                val = raw

            cell = ws.cell(row=ri, column=ci, value=val)
            if is_alt:
                cell.fill = ALT_FILL
            cell.border = BORDER

            if field == "monto_total":
                cell.font = BOLD_GREEN
                cell.number_format = MONEY_FMT
                cell.alignment = R_TOP
            elif field == "nro_parte":
                cell.font = BASE_FONT
                cell.alignment = WRAP
            else:
                cell.font = BASE_FONT
                cell.alignment = TOP

    ws.freeze_panes = "A3"
    ws.auto_filter.ref = f"A2:{get_column_letter(ncols)}2"

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    parts = [x[:20].replace(" ", "_") for x in [proveedor, entidad] if x]
    slug  = "_".join(parts) if parts else "todas"
    fname = f"ordenes_{slug}_{datetime.now().strftime('%Y%m%d')}.xlsx"

    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
    )


@router.get("/{order_id}", response_model=PurchaseOrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = crud.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/", response_model=PurchaseOrderResponse, status_code=201)
def create_order(payload: PurchaseOrderCreate, db: Session = Depends(get_db)):
    existing = crud.get_order_by_electronica(db, payload.orden_electronica)
    if existing:
        raise HTTPException(status_code=409, detail="Order number already exists")
    return crud.create_order(db, payload)


@router.delete("/{order_id}", status_code=204)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    success = crud.delete_order(db, order_id)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found")
