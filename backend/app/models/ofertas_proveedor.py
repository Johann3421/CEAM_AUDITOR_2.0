from sqlalchemy import Column, String, Numeric, DateTime, Text, Integer, JSON
from sqlalchemy.sql import func
from app.db.database import Base

class OfertaProveedorHistory(Base):
    __tablename__ = "ofertas_proveedor_history"

    id = Column(Integer, primary_key=True, index=True)
    nro_parte = Column(String, index=True, nullable=False)
    descripcion_producto = Column(Text, nullable=True)
    marca = Column(String, nullable=True)
    ruc_proveedor = Column(String, index=True, nullable=True)
    nombre_proveedor = Column(String, index=True, nullable=False)
    acuerdo_marco = Column(String, index=True, nullable=False)
    catalogo = Column(String, index=True, nullable=False)
    categoria = Column(String, index=True, nullable=False)
    region = Column(String, nullable=True)
    provincia = Column(String, nullable=True)
    precio_ofertado = Column(Numeric(14, 4), nullable=True)
    existencia_stock = Column(Integer, nullable=True)
    plazo_entrega_dias = Column(Integer, nullable=True)
    pdf_url = Column(String, nullable=True)
    raw_json = Column(JSON, nullable=True)
    fecha_extraccion = Column(DateTime(timezone=True), server_default=func.now())
