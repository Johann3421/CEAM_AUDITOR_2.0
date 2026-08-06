from pydantic import BaseModel, Field, validator, root_validator
from typing import Optional, Any

class OfertaPeruComprasSchema(BaseModel):
    """
    Modelo Pydantic para validar y normalizar la estructura del JSON
    retornado por Perú Compras en _ListaProductosOfertados.
    """
    nro_parte: str = Field(default="")
    descripcion: Optional[str] = Field(default="")
    marca: Optional[str] = Field(default="")
    ruc_proveedor: Optional[str] = Field(default="")
    nombre_proveedor: str = Field(default="PROVEEDOR DESCONOCIDO")
    acuerdo_marco: Optional[str] = Field(default="EXT-CE-2022-5")
    catalogo: Optional[str] = Field(default="")
    categoria: Optional[str] = Field(default="")
    region: Optional[str] = Field(default=None)
    provincia: Optional[str] = Field(default=None)
    precio_ofertado: float = Field(default=0.0)
    existencia_stock: int = Field(default=0)
    plazo_entrega_dias: int = Field(default=0)
    pdf_url: Optional[str] = Field(default="")

    @root_validator(pre=True)
    def map_peru_compras_keys(cls, values: dict):
        if not isinstance(values, dict):
            return {}
        return {
            "nro_parte": values.get("C_NroParte") or values.get("nro_parte") or values.get("NroParte") or "",
            "descripcion": values.get("C_Descripcion") or values.get("descripcion") or "",
            "marca": values.get("C_Marca") or values.get("marca") or "",
            "ruc_proveedor": values.get("C_RucProveedor") or values.get("ruc") or "",
            "nombre_proveedor": values.get("C_NombreProveedor") or values.get("proveedor") or values.get("NombreProveedor") or "PROVEEDOR DESCONOCIDO",
            "acuerdo_marco": values.get("C_Acuerdo") or values.get("acuerdo") or "EXT-CE-2022-5",
            "catalogo": values.get("C_Catalogo") or values.get("catalogo") or "",
            "categoria": values.get("C_Categoria") or values.get("categoria") or "",
            "region": values.get("C_Region") or values.get("region"),
            "provincia": values.get("C_Provincia") or values.get("provincia"),
            "precio_ofertado": values.get("N_Precio") or values.get("precio") or values.get("Precio") or 0.0,
            "existencia_stock": values.get("N_Stock") or values.get("stock") or values.get("Stock") or 0,
            "plazo_entrega_dias": values.get("N_Plazo") or values.get("plazo") or values.get("Plazo") or 0,
            "pdf_url": values.get("C_UrlPdf") or values.get("pdf_url") or "",
        }

    @validator('nro_parte', pre=True)
    def clean_nro_parte(cls, v):
        return str(v or "").strip().upper()

    @validator('nombre_proveedor', pre=True)
    def clean_nombre(cls, v):
        return str(v or "PROVEEDOR DESCONOCIDO").strip().upper()

    @validator('precio_ofertado', pre=True)
    def clean_precio(cls, v):
        try:
            return float(v)
        except (ValueError, TypeError):
            return 0.0

    class Config:
        allow_population_by_field_name = True
