from sqlalchemy import Column, String, Numeric, Date, Text, Integer
from app.db.database import Base

class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id = Column(Integer, primary_key=True, index=True)
    codigo_acuerdo_marco = Column(String, index=True)
    procedimiento = Column(String)
    nro_orden_fisica = Column(String, unique=True, index=True)
    
    ruc_entidad = Column(String)
    nombre_entidad = Column(String)
    ruc_proveedor = Column(String)
    nombre_proveedor = Column(String)
    
    fecha_publicacion = Column(Date, index=True)
    fecha_aceptacion = Column(Date)
    
    catalogo = Column(String, index=True)
    categoria = Column(String, index=True)
    
    detalle_producto = Column(Text)
    logistica_entrega = Column(Text)
    
    moneda = Column(String, default="PEN")
    sub_total = Column(Numeric(12, 2))
    igv = Column(Numeric(12, 2))
    monto_total = Column(Numeric(12, 2))
    
    estado_orden = Column(String)
    plazo_entrega_dias = Column(Integer)
    pdf_url = Column(String, nullable=True)
    orden_digitalizada = Column(String, nullable=True)
    nro_parte = Column(String, nullable=True)
    precio_unitario = Column(Numeric(14, 4), nullable=True)
