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
    fecha_inicio: Optional[str] = None,
    fecha_fin: Optional[str] = None,
) -> dict:
    """
    Scrape Perú Compras and upsert results into the database.

    Args:
        catalogo: Optional catalog name to filter by (e.g. "Útiles de Escritorio").
        max_pages: Maximum result pages to scrape.
        fecha_inicio: Start date for extraction range (YYYY-MM-DD).
        fecha_fin: End date for extraction range (YYYY-MM-DD).

    Returns:
        dict with keys ``inserted`` and ``updated``.
    """
    from app.services.scraper import run_scrape_sync

    logger.info(
        "Starting scrape task [id=%s] catalogo=%r max_pages=%d fecha_inicio=%s fecha_fin=%s",
        self.request.id, catalogo, max_pages, fecha_inicio, fecha_fin,
    )
    self.update_state(state="STARTED", meta={"progress": 0, "catalogo": catalogo})

    db = SessionLocal()
    try:
        result = run_scrape_sync(
            db,
            catalogo=catalogo,
            max_pages=max_pages,
            fecha_inicio=fecha_inicio,
            fecha_fin=fecha_fin,
        )
        logger.info("Scrape completed: %s", result)
        return result
    except Exception as exc:
        logger.exception("Scrape task failed")
        # Re-raise as built-in RuntimeError so Celery's JSON backend can always
        # serialize the failure. Custom exception types (e.g. from user modules)
        # cause KeyError/'exc_type' when Celery tries to reconstruct them from JSON.
        raise RuntimeError(str(exc)) from None
    finally:
        db.close()


@celery_app.task(bind=True, name="tasks.scrape_fichas")
def scrape_fichas_task(
    self,
    agreement_code: str = "EXT-CE-2022-5",
    agreement_selector: Optional[str] = None,
) -> dict:
    """
    Run Module 2: download and upsert fichas-producto from buscadorcatalogos.perucompras.gob.pe.

    Args:
        agreement_code: Short code for the agreement (e.g. "EXT-CE-2022-5").
        agreement_selector: Full CSS data-agreement selector override (optional).

    Returns:
        dict with keys ``inserted``, ``updated``, ``errors``, ``rows_processed``.
    """
    import asyncio
    from app.db.database import engine as app_engine
    from app.services.fichas_scraper import run_module_2, AGREEMENT_SELECTOR

    selector = agreement_selector or AGREEMENT_SELECTOR

    logger.info(
        "Starting fichas scrape task [id=%s] agreement=%r",
        self.request.id, agreement_code,
    )
    self.update_state(state="STARTED", meta={"progress": 0, "agreement_code": agreement_code})

    # Explicit event loop management — see comment in run_scrape_sync for why
    # asyncio.run() must NOT be used inside Celery tasks.
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        result = loop.run_until_complete(
            run_module_2(
                engine=app_engine,
                agreement_selector=selector,
                agreement_code=agreement_code,
                cleanup=True,
            )
        )
        logger.info("Fichas scrape completed: %s", result)
        return result
    except Exception as exc:
        logger.exception("Fichas scrape task failed")
        # Re-raise as built-in RuntimeError — same reason as scrape_catalog_task.
        raise RuntimeError(str(exc)) from None
    finally:
        loop.close()
        asyncio.set_event_loop(None)
