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
    result: AsyncResult = celery_app.AsyncResult(task_id)
    response = {
        "task_id": task_id,
        "status": result.status,
    }
    if result.successful():
        response["result"] = result.result
    elif result.failed():
        response["error"] = str(result.result)
    elif result.state == "STARTED":
        response["meta"] = result.info
    return response


@router.delete("/revoke/{task_id}")
def revoke_task(task_id: str, terminate: bool = Query(False)):
    """Cancel a queued or running scrape task."""
    celery_app.control.revoke(task_id, terminate=terminate)
    return {"task_id": task_id, "revoked": True}
