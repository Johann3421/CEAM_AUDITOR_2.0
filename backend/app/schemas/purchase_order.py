from pydantic import BaseModel
from typing import Optional
from datetime import date
from decimal import Decimal

class PurchaseOrderBase(BaseModel):
    codigo_acuerdo_marco: str
    procedimiento: str
    orden_electronica: Optional[str] = None
    nro_orden_fisica: str
    ruc_entidad: Optional[str] = None
    nombre_entidad: Optional[str] = None
    ruc_proveedor: Optional[str] = None
    nombre_proveedor: Optional[str] = None
    fecha_publicacion: Optional[date] = None
    fecha_aceptacion: Optional[date] = None
    catalogo: Optional[str] = None
    categoria: Optional[str] = None
    detalle_producto: Optional[str] = None
    logistica_entrega: Optional[str] = None
    moneda: str = "PEN"
    sub_total: Optional[Decimal] = None
    igv: Optional[Decimal] = None
    monto_total: Optional[Decimal] = None
    estado_orden: Optional[str] = None
    plazo_entrega_dias: Optional[int] = None
    pdf_url: Optional[str] = None
    orden_digitalizada: Optional[str] = None
    nro_parte: Optional[str] = None
    precio_unitario: Optional[Decimal] = None

class PurchaseOrderCreate(PurchaseOrderBase):
    pass

class PurchaseOrderResponse(PurchaseOrderBase):
    id: int
    class Config:
        from_attributes = True
