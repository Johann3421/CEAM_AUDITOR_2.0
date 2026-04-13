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
    nombre_entidad: Optional[str] = Query(None),
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
        nombre_entidad=nombre_entidad,
    )


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


@router.get("/{order_id}", response_model=PurchaseOrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db)):
    order = crud.get_order(db, order_id)
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order


@router.post("/", response_model=PurchaseOrderResponse, status_code=201)
def create_order(payload: PurchaseOrderCreate, db: Session = Depends(get_db)):
    existing = crud.get_order_by_nro(db, payload.nro_orden_fisica)
    if existing:
        raise HTTPException(status_code=409, detail="Order number already exists")
    return crud.create_order(db, payload)


@router.delete("/{order_id}", status_code=204)
def delete_order(order_id: int, db: Session = Depends(get_db)):
    success = crud.delete_order(db, order_id)
    if not success:
        raise HTTPException(status_code=404, detail="Order not found")
