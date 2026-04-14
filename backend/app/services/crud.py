"""CRUD operations for PurchaseOrder."""
from typing import List, Optional
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.purchase_order import PurchaseOrder
from app.schemas.purchase_order import PurchaseOrderCreate


# ---------------------------------------------------------------------------
# Read helpers
# ---------------------------------------------------------------------------

def get_order(db: Session, order_id: int) -> Optional[PurchaseOrder]:
    return db.query(PurchaseOrder).filter(PurchaseOrder.id == order_id).first()


def get_order_by_electronica(db: Session, orden: str) -> Optional[PurchaseOrder]:
    return db.query(PurchaseOrder).filter(
        PurchaseOrder.orden_electronica == orden
    ).first()


def get_orders(
    db: Session,
    skip: int = 0,
    limit: int = 100,
    catalogo: Optional[str] = None,
    categoria: Optional[str] = None,
    estado_orden: Optional[str] = None,
    search: Optional[str] = None,
) -> List[PurchaseOrder]:
    from sqlalchemy import or_
    q = db.query(PurchaseOrder)
    if catalogo:
        q = q.filter(PurchaseOrder.catalogo.ilike(f"%{catalogo}%"))
    if categoria:
        q = q.filter(PurchaseOrder.categoria.ilike(f"%{categoria}%"))
    if estado_orden:
        q = q.filter(PurchaseOrder.estado_orden == estado_orden)
    if search:
        q = q.filter(
            or_(
                PurchaseOrder.nombre_entidad.ilike(f"%{search}%"),
                PurchaseOrder.nombre_proveedor.ilike(f"%{search}%"),
                PurchaseOrder.nro_orden_fisica.ilike(f"%{search}%"),
                PurchaseOrder.orden_electronica.ilike(f"%{search}%")
            )
        )
    return q.order_by(PurchaseOrder.fecha_publicacion.desc()).offset(skip).limit(limit).all()


def count_orders(db: Session) -> int:
    return db.query(func.count(PurchaseOrder.id)).scalar()


# ---------------------------------------------------------------------------
# Write helpers
# ---------------------------------------------------------------------------

def create_order(db: Session, order: PurchaseOrderCreate) -> PurchaseOrder:
    db_obj = PurchaseOrder(**order.model_dump())
    db.add(db_obj)
    db.commit()
    db.refresh(db_obj)
    return db_obj


def upsert_order(db: Session, order: PurchaseOrderCreate) -> PurchaseOrder:
    """Insert or update by orden_electronica (idempotent scrape import)."""
    existing = get_order_by_electronica(db, order.orden_electronica)
    if existing:
        for key, value in order.model_dump().items():
            setattr(existing, key, value)
        db.commit()
        db.refresh(existing)
        return existing
    return create_order(db, order)


def delete_order(db: Session, order_id: int) -> bool:
    obj = get_order(db, order_id)
    if not obj:
        return False
    db.delete(obj)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Analytics aggregates
# ---------------------------------------------------------------------------

def get_stats(db: Session) -> dict:
    total_orders = count_orders(db)
    total_amount = db.query(func.sum(PurchaseOrder.monto_total)).scalar() or 0
    by_catalogo = (
        db.query(PurchaseOrder.catalogo, func.count(PurchaseOrder.id).label("count"))
        .group_by(PurchaseOrder.catalogo)
        .order_by(func.count(PurchaseOrder.id).desc())
        .limit(10)
        .all()
    )
    by_categoria = (
        db.query(PurchaseOrder.categoria, func.count(PurchaseOrder.id).label("count"))
        .group_by(PurchaseOrder.categoria)
        .order_by(func.count(PurchaseOrder.id).desc())
        .limit(10)
        .all()
    )
    top_providers = (
        db.query(
            PurchaseOrder.nombre_proveedor,
            func.sum(PurchaseOrder.monto_total).label("total"),
        )
        .group_by(PurchaseOrder.nombre_proveedor)
        .order_by(func.sum(PurchaseOrder.monto_total).desc())
        .limit(5)
        .all()
    )
    return {
        "total_orders": total_orders,
        "total_amount": float(total_amount),
        "by_catalogo": [{"catalogo": r[0], "count": r[1]} for r in by_catalogo],
        "by_categoria": [{"categoria": r[0], "count": r[1]} for r in by_categoria],
        "top_providers": [
            {"nombre_proveedor": r[0], "total": float(r[1] or 0)}
            for r in top_providers
        ],
    }
