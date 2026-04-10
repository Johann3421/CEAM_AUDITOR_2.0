"""Celery tasks for CEAM Auditor."""
import logging
from typing import Optional

from app.worker.celery_app import celery_app
from app.db.database import SessionLocal

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, name="tasks.scrape_catalog")
def scrape_catalog_task(
    self,
    catalogo: Optional[str] = None,
    max_pages: int = 10,
) -> dict:
    """
    Scrape Perú Compras and upsert results into the database.

    Args:
        catalogo: Optional catalog name to filter by (e.g. "Útiles de Escritorio").
        max_pages: Maximum result pages to scrape.

    Returns:
        dict with keys ``inserted`` and ``updated``.
    """
    from app.services.scraper import run_scrape_sync

    logger.info(
        "Starting scrape task [id=%s] catalogo=%r max_pages=%d",
        self.request.id, catalogo, max_pages,
    )
    self.update_state(state="STARTED", meta={"progress": 0, "catalogo": catalogo})

    db = SessionLocal()
    try:
        result = run_scrape_sync(db, catalogo=catalogo, max_pages=max_pages)
        logger.info("Scrape completed: %s", result)
        return result
    except Exception as exc:
        logger.exception("Scrape task failed")
        self.update_state(state="FAILURE", meta={"error": str(exc)})
        raise
    finally:
        db.close()
