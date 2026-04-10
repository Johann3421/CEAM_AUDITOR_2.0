"""Scraper management endpoints — trigger jobs and query status."""
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from celery.result import AsyncResult

from app.worker.celery_app import celery_app
from app.worker.tasks import scrape_catalog_task

router = APIRouter(prefix="/scraper", tags=["Scraper"])


@router.post("/start")
def start_scrape(
    catalogo: Optional[str] = Query(None, description="Catalog name filter"),
    max_pages: int = Query(10, ge=1, le=100, description="Max result pages to scrape"),
):
    """
    Dispatch a background scrape job.
    Returns a ``task_id`` you can poll with GET /scraper/status/{task_id}.
    """
    task = scrape_catalog_task.delay(catalogo=catalogo, max_pages=max_pages)
    return {"task_id": task.id, "status": "queued", "catalogo": catalogo}


@router.get("/status/{task_id}")
def get_task_status(task_id: str):
    """Poll the status of a scrape job by its Celery task ID."""
    try:
        result: AsyncResult = celery_app.AsyncResult(task_id)
        state = result.state  # may raise if Redis is unreachable
    except Exception as exc:
        # Redis or broker unreachable — return a safe response with CORS intact
        return {
            "task_id": task_id,
            "status": "UNKNOWN",
            "error": f"No se pudo consultar el estado de la tarea: {exc}",
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


@router.delete("/revoke/{task_id}")
def revoke_task(task_id: str, terminate: bool = Query(False)):
    """Cancel a queued or running scrape task."""
    celery_app.control.revoke(task_id, terminate=terminate)
    return {"task_id": task_id, "revoked": True}


@router.get("/test-download")
def test_download(
    catalogo: str = Query("COMPUTADORAS DE ESCRITORIO", description="Keyword to search"),
):
    """
    Run the Playwright download SYNCHRONOUSLY in the API process (no Celery).
    Use this endpoint from Swagger /docs to diagnose scraper failures directly —
    it returns the error message (or success count) in the HTTP response.
    WARNING: blocks the API worker for the duration of the download (~2–5 min).
    """
    from app.db.database import SessionLocal
    from app.services.scraper import run_scrape_sync

    db = SessionLocal()
    try:
        result = run_scrape_sync(db, catalogo=catalogo)
        return {"status": "ok", **result}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    finally:
        db.close()
    return {"task_id": task_id, "revoked": True}
