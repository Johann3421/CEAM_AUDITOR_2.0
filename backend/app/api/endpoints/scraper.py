"""Scraper management endpoints — trigger jobs and query status."""
import traceback
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from celery.result import AsyncResult

from app.worker.celery_app import celery_app
from app.worker.tasks import scrape_catalog_task, scrape_fichas_task

router = APIRouter(prefix="/scraper", tags=["Scraper"])

# ── Catálogos disponibles Módulo 1 ────────────────────────────────────────────
CATALOGOS_DISPONIBLES = [
    "COMPUTADORAS DE ESCRITORIO",
    "COMPUTADORAS PORTATILES Y ESCANERES",
    "UTILES DE ESCRITORIO",
    "MATERIAL DE LIMPIEZA",
    "IMPRESORAS Y EQUIPOS MULTIFUNCIONALES",
    "AIRE ACONDICIONADO",
    "MOBILIARIO DE OFICINA",
    "EQUIPOS DE COMUNICACION",
    "MATERIAL DE FERRETERIA",
    "COMBUSTIBLES Y LUBRICANTES",
]

# ── Acuerdos Marco disponibles Módulo 2 ───────────────────────────────────────
ACUERDOS_MARCO = [
    {
        "code": "EXT-CE-2022-5",
        "label": "EXT-CE-2022-5 — Computadoras de Escritorio, Portátiles y Escáneres",
        "selector": 'div[data-agreement*="EXT-CE-2022-5"]',
    },
]


@router.post("/start")
def start_scrape(
    catalogo: Optional[str] = Query(None, description="Catalog name filter"),
    max_pages: int = Query(10, ge=1, le=100, description="Max result pages to scrape"),
    fecha_inicio: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    fecha_fin: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
):
    """
    Dispatch a background scrape job.
    Returns a ``task_id`` you can poll with GET /scraper/status/{task_id}.
    """
    task = scrape_catalog_task.delay(
        catalogo=catalogo,
        max_pages=max_pages,
        fecha_inicio=fecha_inicio,
        fecha_fin=fecha_fin,
    )
    return {"task_id": task.id, "status": "queued", "catalogo": catalogo}


@router.get("/status/{task_id}")
def get_task_status(task_id: str):
    """Poll the status of a scrape job by its Celery task ID."""
    try:
        result: AsyncResult = celery_app.AsyncResult(task_id)
        state = result.state  # may raise if Redis is unreachable
    except Exception as exc:
        err_str = str(exc)
        # Billiard "Exception information must include the exception type" means
        # the task failed inside a Celery worker but the asyncio event loop
        # cleared sys.exc_info() before billiard could capture it. The task DID
        # fail — report it as FAILURE so the frontend stops polling.
        if "exception type" in err_str.lower() or "exc_info" in err_str.lower():
            return {
                "task_id": task_id,
                "status": "FAILURE",
                "error": "La tarea falló en el worker. Revisa los logs del contenedor ceam_worker para el detalle del error.",
            }
        return {
            "task_id": task_id,
            "status": "UNKNOWN",
            "error": f"No se pudo consultar el estado de la tarea: {err_str}",
        }

    response: dict = {"task_id": task_id, "status": state}

    try:
        if result.successful():
            response["result"] = result.result
        elif result.failed():
            # Use propagate=False to get the exception object without re-raising
            raw = result.get(propagate=False)
            response["error"] = str(raw)
        elif state in ("STARTED", "PROGRESS"):
            info = result.info or {}
            response["meta"] = info if isinstance(info, dict) else {"detail": str(info)}
    except Exception as exc:
        response["error"] = f"Error al leer resultado de la tarea: {exc}"

    return response


@router.delete("/flush-task/{task_id}")
def flush_task(task_id: str):
    """
    Delete a task's result/meta from Redis.
    Use this to clear a corrupted task entry so the ID can be reused cleanly.
    """
    try:
        celery_app.AsyncResult(task_id).forget()
        return {"task_id": task_id, "flushed": True}
    except Exception as exc:
        return {"task_id": task_id, "flushed": False, "error": str(exc)}


@router.delete("/revoke/{task_id}")
def revoke_task(task_id: str, terminate: bool = Query(False)):
    """Cancel a queued or running scrape task."""
    celery_app.control.revoke(task_id, terminate=terminate)
    return {"task_id": task_id, "revoked": True}


@router.get("/test-download")
async def test_download(
    catalogo: str = Query("COMPUTADORAS DE ESCRITORIO", description="Keyword to search"),
):
    """
    Run the Playwright download directly in the API process (no Celery).
    Returns full error details as JSON so failures are visible in Swagger /docs.
    WARNING: blocks for the duration of the download (~2–5 min).
    """
    from app.db.database import SessionLocal
    from app.services.scraper import _download_excel, _process_excel
    from app.services import crud

    try:
        filepath, rows_on_screen, fr_text, link_diag = await _download_excel(catalogo_keyword=catalogo)
    except BaseException as exc:
        return {
            "status": "error",
            "phase": "playwright_download",
            "error": str(exc),
            "trace": traceback.format_exc(),
        }

    if not filepath:
        return {"status": "error", "phase": "playwright_download", "error": "No se descargó ningún archivo (filepath es None)"}

    try:
        import pandas as pd
        df_raw = pd.read_excel(filepath, engine="openpyxl")
        raw_columns = list(df_raw.columns)
        raw_rows_count = len(df_raw)

        try:
            df_skip = pd.read_excel(filepath, skiprows=5, engine="openpyxl")
            skip_columns = list(df_skip.columns)
        except Exception:
            skip_columns = []

        orders = _process_excel(filepath)
        
        debug_info = {
            "raw_columns": raw_columns,
            "raw_rows_count": raw_rows_count,
            "skip_columns": skip_columns,
            "rows_on_screen": rows_on_screen,
            "first_row_text": fr_text,
            "link_diagnostics": link_diag
        }
    except BaseException as exc:
        return {
            "status": "error",
            "phase": "excel_processing",
            "error": str(exc),
            "trace": traceback.format_exc(),
        }

    inserted = 0
    updated = 0
    db = SessionLocal()
    try:
        for order in orders:
            existing = crud.get_order_by_nro(db, order.nro_orden_fisica)
            crud.upsert_order(db, order)
            if existing:
                updated += 1
            else:
                inserted += 1
    except BaseException as exc:
        db.close()
        return {
            "status": "error",
            "phase": "db_upsert",
            "error": str(exc),
            "trace": traceback.format_exc(),
        }
    finally:
        db.close()

    return {
        "status": "ok", 
        "orders_parsed": len(orders), 
        "inserted": inserted, 
        "updated": updated,
        "debug_info": debug_info
    }


# ─── Metadata endpoints ───────────────────────────────────────────────────────

@router.get("/catalogos")
def list_catalogos():
    """Return the list of available Module 1 catalog options for the frontend dropdown."""
    return {"catalogos": CATALOGOS_DISPONIBLES}


@router.get("/acuerdos")
def list_acuerdos():
    """Return the list of available Module 2 acuerdos marco for the frontend dropdown."""
    return {"acuerdos": [{"code": a["code"], "label": a["label"]} for a in ACUERDOS_MARCO]}


# ─── Módulo 2 — Fichas Producto endpoints ────────────────────────────────────

@router.post("/fichas/start")
def start_fichas_scrape(
    agreement_code: str = Query("EXT-CE-2022-5", description="Acuerdo marco code"),
):
    """
    Dispatch a background fichas-producto scrape job (Módulo 2).
    Returns a ``task_id`` you can poll with GET /scraper/status/{task_id}.
    """
    # Look up the CSS selector for the given agreement code
    acuerdo = next((a for a in ACUERDOS_MARCO if a["code"] == agreement_code), None)
    if acuerdo is None:
        return {"error": f"Acuerdo marco '{agreement_code}' no encontrado", "available": [a["code"] for a in ACUERDOS_MARCO]}

    task = scrape_fichas_task.delay(
        agreement_code=acuerdo["code"],
        agreement_selector=acuerdo["selector"],
    )
    return {"task_id": task.id, "status": "queued", "agreement_code": agreement_code}
