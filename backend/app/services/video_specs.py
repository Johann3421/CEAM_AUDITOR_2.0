"""
video_specs.py
==============
Servicio de extracción de specs de video/gráficos para fichas Kenya Technology.

Descarga los PDFs de ficha técnica desde Azure CDN y extrae el campo
"Gráficos" (integrado o dedicado) de cada producto.

Usado por:
  - app/worker/tasks.py (tarea Celery, cron cada lunes)
  - POST /fichas/video-specs/refresh (disparo manual vía API)
"""

import json
import logging
import re
import time
from io import BytesIO
from pathlib import Path

import requests
from pypdf import PdfReader
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

# Ruta donde se guarda el JSON resultante (dentro del container: /app/app/data/)
DATA_FILE = Path(__file__).parent.parent / "data" / "kenya_video_specs.json"

MARCA = "KENYA TECHNOLOGY"
PAUSA_ENTRE_REQUESTS = 0.2   # segundos entre descargas (throttling cortés)
TIMEOUT_HTTP = 25

# Nombres posibles del campo gráficos en el PDF (orden de prioridad)
_CAMPOS_VIDEO = ["Gráficos", "Graficos", "Video", "Tarjeta de Video", "GPU"]

_TABLE = "fichas_producto"


# ---------------------------------------------------------------------------
# Helpers privados
# ---------------------------------------------------------------------------

def _get_columns(db: Session) -> list[str]:
    rows = db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = :t ORDER BY ordinal_position"
        ),
        {"t": _TABLE},
    ).fetchall()
    return [r[0] for r in rows]


def _find_col(col_set: set, *candidates: str) -> str | None:
    """Exact match first, then substring match."""
    for c in candidates:
        if c in col_set:
            return c
    for c in candidates:
        m = next((col for col in col_set if c.lower() in col.lower()), None)
        if m:
            return m
    return None


def _fetch_products(db: Session) -> list[dict]:
    """Query DB and return Kenya Tech products with their ficha_tcnica URL."""
    cols = _get_columns(db)
    col_set = set(cols)

    nro_col   = _find_col(col_set,
                          "nro_parte_o_cdigo_nico_de_identificacin",
                          "nro_parte_o_código_único_de_identificación",
                          "nro_parte", "codigo")
    desc_col  = _find_col(col_set,
                          "descripcin_fichaproducto", "descripción_fichaproducto",
                          "descripcion", "descripción")
    cat_col   = _find_col(col_set, "categora", "categoría", "categoria")
    marca_col = _find_col(col_set, "marca")
    pdf_col   = _find_col(col_set, "ficha_tcnica", "ficha_técnica", "ficha_tecnica")
    estado_col = _find_col(col_set, "estado_ficha_producto", "estado")

    if not all([nro_col, pdf_col, marca_col]):
        raise RuntimeError(
            f"Columnas requeridas no encontradas. "
            f"nro_col={nro_col}, pdf_col={pdf_col}, marca_col={marca_col}"
        )

    select_cols = ", ".join(
        f'"{c}"' for c in [nro_col, desc_col, cat_col, marca_col, pdf_col, estado_col]
        if c
    )

    # DISTINCT ON nro_parte — tomar el registro más reciente por producto
    sql = text(f"""
        SELECT DISTINCT ON ("{nro_col}") {select_cols}
        FROM {_TABLE}
        WHERE "{marca_col}" ILIKE :marca
          AND "{pdf_col}" ILIKE 'http%'
        ORDER BY "{nro_col}", fecha_extraccion DESC NULLS LAST
    """)

    rows = db.execute(sql, {"marca": f"%{MARCA}%"}).fetchall()
    keys = [nro_col, desc_col, cat_col, marca_col, pdf_col, estado_col]
    keys = [k for k in keys if k]  # drop Nones

    return [dict(zip(keys, row)) for row in rows]


def _download_pdf(url: str) -> bytes | None:
    try:
        resp = requests.get(url, timeout=TIMEOUT_HTTP)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        logger.warning("PDF download failed (%s): %s", url, exc)
        return None


def _extract_text(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        logger.warning("PDF parse error: %s", exc)
        return ""


def _extract_graficos(text: str) -> str | None:
    for campo in _CAMPOS_VIDEO:
        pattern = rf"^\s*{re.escape(campo)}\s+(.+)"
        for line in text.splitlines():
            m = re.match(pattern, line, re.IGNORECASE)
            if m:
                return m.group(1).strip()
    return None


# ---------------------------------------------------------------------------
# Función pública principal
# ---------------------------------------------------------------------------

def run_extraction(db: Session) -> dict:
    """
    Extrae specs de video de todas las fichas Kenya Technology.

    Devuelve un dict con:
      total        — productos con PDF procesados
      con_graficos — cuántos tenían campo gráficos
      sin_graficos — cuántos no lo tenían
      output_path  — ruta del JSON guardado
    """
    logger.info("video_specs: iniciando extracción para '%s'", MARCA)

    products = _fetch_products(db)
    logger.info("video_specs: %d productos con PDF encontrados", len(products))

    # Detectar nombres de columnas dinámicamente del primer producto
    sample = products[0] if products else {}
    nro_key  = next((k for k in sample if "nro" in k.lower() or "cdigo" in k.lower()), None)
    desc_key = next((k for k in sample if "descrip" in k.lower() or "denominac" in k.lower()), None)
    cat_key  = next((k for k in sample if "categ" in k.lower()), None)
    pdf_key  = next((k for k in sample if "ficha" in k.lower()), None)

    resultados = []
    sin_graficos = 0

    for i, product in enumerate(products, 1):
        nro_parte = product.get(nro_key, "") or ""
        modelo    = product.get(desc_key, "") or ""
        categoria = product.get(cat_key, "") or ""
        pdf_url   = product.get(pdf_key, "") or ""

        if i % 50 == 0:
            logger.info("video_specs: progreso %d/%d", i, len(products))

        pdf_bytes = _download_pdf(pdf_url)
        if not pdf_bytes:
            sin_graficos += 1
            resultados.append({
                "nro_parte": nro_parte,
                "modelo": modelo,
                "categoria": categoria,
                "graficos": None,
                "ficha_tecnica_url": pdf_url,
            })
            continue

        texto = _extract_text(pdf_bytes)
        graficos = _extract_graficos(texto)

        if not graficos:
            sin_graficos += 1

        resultados.append({
            "nro_parte": nro_parte,
            "modelo": modelo,
            "categoria": categoria,
            "graficos": graficos,
            "ficha_tecnica_url": pdf_url,
        })

        time.sleep(PAUSA_ENTRE_REQUESTS)

    # Guardar JSON
    DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
    DATA_FILE.write_text(
        json.dumps(resultados, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    con_graficos = len(resultados) - sin_graficos
    logger.info(
        "video_specs: completo. total=%d con_graficos=%d sin_graficos=%d → %s",
        len(resultados), con_graficos, sin_graficos, DATA_FILE,
    )

    return {
        "total": len(resultados),
        "con_graficos": con_graficos,
        "sin_graficos": sin_graficos,
        "output_path": str(DATA_FILE),
    }
