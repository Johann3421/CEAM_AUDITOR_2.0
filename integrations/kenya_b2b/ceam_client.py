"""
Cliente HTTP B2B para consumir la API de CEAM AUDITOR 2.0 desde ENSAMBLADOR KENYA ERP.
Copiar este archivo en: app/services/ceam_client.py (en el backend de KENYA).
"""
import os
import requests
from typing import Dict, Any, List, Optional


class CeamClient:
    """Cliente HTTP para comunicación Server-to-Server con CEAM AUDITOR 2.0."""
    
    BASE_URL = os.getenv("CEAM_API_URL", "https://api-auditor.sekaitech.com.pe/api/v1/integracion")
    API_KEY = os.getenv("CEAM_API_KEY", "kenya-ceam-b2b-secret-token-2026")
    HEADERS = {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
        "User-Agent": "Ensamblador-Kenya-ERP/1.0"
    }

    @classmethod
    def get_top_fichas_desktop(cls, limit: int = 30, meses: int = 12) -> List[Dict[str, Any]]:
        """
        Obtiene las fichas oficiales de computadoras de escritorio más vendidas en Perú Compras.
        Retorna precios mínimos de adjudicación y especificaciones técnicas parseadas.
        """
        try:
            url = f"{cls.BASE_URL}/fichas/top-desktop"
            params = {"limit": limit, "meses": meses}
            res = requests.get(url, headers=cls.HEADERS, params=params, timeout=8)
            res.raise_for_status()
            return res.json()
        except Exception as e:
            print(f"[CeamClient] Error obteniendo top fichas desktop: {e}")
            return []

    @classmethod
    def get_benchmark(cls, nro_parte: str) -> Optional[Dict[str, Any]]:
        """
        Obtiene el benchmark forense de una ficha:
        - Precio mínimo histórico y reciente en OCAMs
        - Últimas 5 adjudicaciones públicas
        - Competencia activa con stock regional y plazos de entrega
        """
        try:
            url = f"{cls.BASE_URL}/benchmark/{nro_parte.strip()}"
            res = requests.get(url, headers=cls.HEADERS, timeout=8)
            res.raise_for_status()
            return res.json()
        except Exception as e:
            print(f"[CeamClient] Error obteniendo benchmark de {nro_parte}: {e}")
            return None

    @classmethod
    def auditar_specs(cls, nro_parte_ceam: str, componentes: Dict[str, Any]) -> Dict[str, Any]:
        """
        Compara los componentes configurados en KENYA contra la ficha oficial de CEAM.
        Detecta:
        - Alertas de descalificación (ej. falta RAM, SSD no NVMe, factor de forma errado).
        - Desperdicio de margen (componentes sobredimensionados innecesariamente).
        """
        try:
            url = f"{cls.BASE_URL}/auditar-specs"
            payload = {
                "nro_parte_ceam": nro_parte_ceam.strip(),
                "componentes_ensamble": componentes
            }
            res = requests.post(url, json=payload, headers=cls.HEADERS, timeout=8)
            res.raise_for_status()
            return res.json()
        except Exception as e:
            print(f"[CeamClient] Error auditando specs para {nro_parte_ceam}: {e}")
            return {
                "nro_parte_ceam": nro_parte_ceam,
                "cumple_100": False,
                "error": str(e),
                "alertas_descalificacion": [f"Error de conexión con CEAM Auditor: {e}"],
                "desperdicio_margen": []
            }
