from pydantic import BaseModel, Field, validator
from typing import Optional, Any

class OfertaPeruComprasSchema(BaseModel):
    """
    Modelo Pydantic para validar y normalizar la estructura del JSON
    retornado por Perú Compras en _ListaProductosOfertados.
    """
    nro_parte: str = Field(..., alias="C_NroParte")
    descripcion: Optional[str] = Field("", alias="C_Descripcion")
    marca: Optional[str] = Field("", alias="C_Marca")
    ruc_proveedor: Optional[str] = Field("", alias="C_RucProveedor")
    nombre_proveedor: str = Field(..., alias="C_NombreProveedor")
    acuerdo_marco: Optional[str] = Field("EXT-CE-2022-5", alias="C_Acuerdo")
    catalogo: Optional[str] = Field("", alias="C_Catalogo")
    categoria: Optional[str] = Field("", alias="C_Categoria")
    region: Optional[str] = Field(None, alias="C_Region")
    provincia: Optional[str] = Field(None, alias="C_Provincia")
    precio_ofertado: float = Field(0.0, alias="N_Precio")
    existencia_stock: int = Field(0, alias="N_Stock")
    plazo_entrega_dias: int = Field(0, alias="N_Plazo")
    pdf_url: Optional[str] = Field("", alias="C_UrlPdf")

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
