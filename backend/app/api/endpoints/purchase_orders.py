"""Purchase Orders REST endpoints."""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
import csv
import io

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


@router.get("/stats")
def get_stats(db: Session = Depends(get_db)):
    """Aggregated statistics for dashboard KPIs and charts."""
    return crud.get_stats(db)


@router.get("/providers")
def get_providers(db: Session = Depends(get_db)):
    from app.models.purchase_order import PurchaseOrder
    rows = (
        db.query(
            PurchaseOrder.nombre_proveedor,
            func.count(PurchaseOrder.id).label("orders"),
            func.sum(PurchaseOrder.monto_total).label("total"),
        )
        .filter(PurchaseOrder.nombre_proveedor.isnot(None), PurchaseOrder.nombre_proveedor != "")
        .group_by(PurchaseOrder.nombre_proveedor)
        .order_by(func.sum(PurchaseOrder.monto_total).desc())
        .all()
    )
    return {"providers": [{"nombre_proveedor": r[0], "orders": int(r[1]), "total": float(r[2] or 0)} for r in rows]}


@router.get("/export")
def export_orders(proveedor: str = Query(...), db: Session = Depends(get_db)):
    from app.models.purchase_order import PurchaseOrder
    rows = db.query(PurchaseOrder).filter(PurchaseOrder.nombre_proveedor == proveedor).order_by(PurchaseOrder.fecha_publicacion.desc()).all()
    if not rows:
        raise HTTPException(status_code=404, detail="No orders for provider")

    def iter_csv():
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["orden_electronica", "nro_orden_fisica", "fecha_publicacion", "nombre_entidad", "nombre_proveedor", "monto_total"])
        yield buffer.getvalue()
        buffer.seek(0)
        buffer.truncate(0)
        for r in rows:
            writer.writerow([
                r.orden_electronica or '',
                r.nro_orden_fisica or '',
                r.fecha_publicacion.isoformat() if r.fecha_publicacion else '',
                r.nombre_entidad or '',
                r.nombre_proveedor or '',
                float(r.monto_total or 0),
            ])
            yield buffer.getvalue()
            buffer.seek(0)
            buffer.truncate(0)

    filename = f"orders_{proveedor.replace(' ', '_')}.csv"
    return StreamingResponse(iter_csv(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename={filename}"})


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
