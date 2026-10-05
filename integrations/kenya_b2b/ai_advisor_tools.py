"""
Definición de Herramientas (Tool Calling) para el Asistente de IA (Gemini) en ENSAMBLADOR KENYA.
Permite que el Copiloto IA ejecute consultas determinísticas contra CEAM AUDITOR 2.0.
"""

GEMINI_TOOLS_CEAM = [
    {
        "name": "consultar_fichas_mas_vendidas_ceam",
        "description": "Obtiene las fichas oficiales de computadoras de escritorio con mayor volumen de compra en Perú Compras, incluyendo precios mínimos de adjudicación y especificaciones técnicas oficiales.",
        "parameters": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Cantidad de fichas a consultar (por defecto 15, máximo 50)."
                },
                "meses": {
                    "type": "integer",
                    "description": "Ventana temporal en meses para evaluar las órdenes de compra (por defecto 12)."
                }
            }
        }
    },
    {
        "name": "obtener_benchmark_precio_adjudicado",
        "description": "Consulta el histórico de precios adjudicados por el Estado para una ficha técnica específica y lista las ofertas activas de competidores con su stock y plazos de entrega.",
        "parameters": {
            "type": "object",
            "properties": {
                "nro_parte": {
                    "type": "string",
                    "description": "Número de parte exacto de la ficha de Perú Compras (ej: KNY-PRO-I5-16-512, B11B256201-G12)."
                }
            },
            "required": ["nro_parte"]
        }
    },
    {
        "name": "auditar_cumplimiento_zero_waste",
        "description": "Audita la configuración de hardware ensamblada contra las bases de la ficha técnica oficial para detectar riesgos de descalificación o piezas sobredimensionadas que desperdician margen.",
        "parameters": {
            "type": "object",
            "properties": {
                "nro_parte_ceam": {
                    "type": "string",
                    "description": "Número de parte de la ficha oficial en CEAM."
                },
                "componentes": {
                    "type": "object",
                    "description": "Diccionario con los componentes del ensamble (cpu, ram, storage, formato, psu).",
                    "properties": {
                        "cpu": {"type": "string", "description": "Modelo del procesador (ej: Intel Core i5 13400)"},
                        "ram": {"type": "string", "description": "Capacidad y tipo de RAM (ej: 16GB DDR4 3200MHz)"},
                        "storage": {"type": "string", "description": "Capacidad y tipo de almacenamiento (ej: 512GB SSD NVMe M.2)"},
                        "formato": {"type": "string", "description": "Factor de forma del gabinete (ej: Slim / SFF o Torre)"},
                        "psu": {"type": "string", "description": "Potencia de fuente (ej: 250W 80 Plus)"}
                    },
                    "required": ["cpu", "ram", "storage"]
                }
            },
            "required": ["nro_parte_ceam", "componentes"]
        }
    }
]


def ejecutar_herramienta_ceam(nombre_funcion: str, argumentos: dict) -> dict:
    """
    Dispatcher de ejecución para las tools de Gemini conectadas a CeamClient.
    """
    from .ceam_client import CeamClient

    if nombre_funcion == "consultar_fichas_mas_vendidas_ceam":
        limit = argumentos.get("limit", 15)
        meses = argumentos.get("meses", 12)
        return {"resultado": CeamClient.get_top_fichas_desktop(limit=limit, meses=meses)}

    elif nombre_funcion == "obtener_benchmark_precio_adjudicado":
        nro_parte = argumentos.get("nro_parte", "")
        return {"resultado": CeamClient.get_benchmark(nro_parte=nro_parte)}

    elif nombre_funcion == "auditar_cumplimiento_zero_waste":
        nro_parte = argumentos.get("nro_parte_ceam", "")
        componentes = argumentos.get("componentes", {})
        return {"resultado": CeamClient.auditar_specs(nro_parte_ceam=nro_parte, componentes=componentes)}

    return {"error": f"Herramienta desconocida: {nombre_funcion}"}
