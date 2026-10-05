"""
Módulo de Seguridad B2B Server-to-Server
Autenticación estática mediante Header X-API-KEY para integración con sistemas externos (ej. Ensamblador KENYA).
"""
import os
from fastapi import Security, HTTPException, status
from fastapi.security.api_key import APIKeyHeader

API_KEY_NAME = "X-API-KEY"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)

# Token secreto B2B configurable vía variable de entorno
CEAM_B2B_SECRET = os.getenv("CEAM_B2B_SECRET", "kenya-ceam-b2b-secret-token-2026")


def verificar_api_key_b2b(api_key: str = Security(api_key_header)) -> str:
    """
    Valida la cabecera X-API-KEY en llamadas Server-to-Server.
    Rechaza peticiones no autorizadas con código HTTP 403 Forbidden.
    """
    if not api_key or api_key.strip() != CEAM_B2B_SECRET:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acceso B2B denegado: API Key inválida o no suministrada en cabecera X-API-KEY."
        )
    return api_key
