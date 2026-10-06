import re
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import settings


def _normalize_db_url(raw_url: str) -> str:
    if not raw_url:
        return raw_url
    url = raw_url.strip()
    
    # Compatibilidad con prefijos legacy como 'postgres://' (Heroku/Dokploy)
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
        
    # Si la URL solicita psycopg v3 (postgresql+psycopg:// o postgresql+psycopg3://)
    if url.startswith("postgresql+psycopg://") or url.startswith("postgresql+psycopg3://"):
        try:
            import psycopg  # noqa: F401
        except ImportError:
            # Fallback a psycopg2 si psycopg v3 no estuviera instalado en el entorno
            url = re.sub(r"^postgresql\+psycopg3?://", "postgresql+psycopg2://", url)
            
    # Si la URL solicita psycopg2 o el driver por defecto
    elif url.startswith("postgresql+psycopg2://") or url.startswith("postgresql://"):
        try:
            import psycopg2  # noqa: F401
        except ImportError:
            try:
                import psycopg  # noqa: F401
                url = re.sub(r"^postgresql(\+psycopg2)?://", "postgresql+psycopg://", url)
            except ImportError:
                pass
                
    return url


DATABASE_URL = _normalize_db_url(settings.DATABASE_URL)
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
