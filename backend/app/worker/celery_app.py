"""Celery application instance."""
from celery import Celery
from celery.schedules import crontab
from app.core.config import settings

celery_app = Celery(
    "ceam_auditor",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="America/Lima",
    enable_utc=True,
    task_track_started=True,
    result_expires=86400,   # 24 h
)

# ── Tareas periódicas (Celery Beat) ───────────────────────────────────────────
celery_app.conf.beat_schedule = {
    # Cada lunes a las 06:00 hora Lima — actualiza specs de video Kenya Tech
    "refresh-video-specs-monday": {
        "task": "tasks.refresh_video_specs",
        "schedule": crontab(hour=6, minute=0, day_of_week=1),
    },
}
