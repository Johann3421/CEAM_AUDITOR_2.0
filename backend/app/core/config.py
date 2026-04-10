from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "CEAM AUDITOR"
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/ceam_auditor"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"

    class Config:
        env_file = ".env"

settings = Settings()
