from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import settings
from app.db.database import engine, Base
from app.api.router import api_router

# Create all tables on startup (use Alembic in production)
Base.metadata.create_all(bind=engine)

# Auto-migrate: add columns that may not exist yet in pre-existing tables
_NEW_COLS = [
    ("purchase_orders", "orden_digitalizada", "TEXT"),
    ("purchase_orders", "nro_parte",          "TEXT"),
    ("purchase_orders", "precio_unitario",     "NUMERIC(14,4)"),
]
try:
    with engine.begin() as _c:
        for table, col, coltype in _NEW_COLS:
            exists = _c.execute(
                text(
                    "SELECT 1 FROM information_schema.columns "
                    "WHERE table_name=:t AND column_name=:c"
                ),
                {"t": table, "c": col},
            ).fetchone()
            if not exists:
                _c.execute(text(f'ALTER TABLE {table} ADD COLUMN "{col}" {coltype}'))
except Exception:
    pass  # SQLite in tests / table not created yet

app = FastAPI(
    title=settings.PROJECT_NAME,
    version="2.0.0",
    description="Auditor de órdenes de compra — Perú Compras",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS — allow frontend dev server and production domains
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://localhost:3000",
        "https://auditor.sekaitech.com.pe",
        "https://admin2.abadgroup.tech"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/", tags=["health"])
def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}
