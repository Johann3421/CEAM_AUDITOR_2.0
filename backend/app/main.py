from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import settings
from app.db.database import engine, Base
from app.api.router import api_router
from app.models.ofertas_proveedor import OfertaProveedorHistory

# Create all tables on startup (use Alembic in production)
Base.metadata.create_all(bind=engine)

# Auto-migrate: add columns that may not exist yet in pre-existing tables
_NEW_COLS = [
    ("purchase_orders", "orden_digitalizada", "TEXT"),
    ("purchase_orders", "nro_parte",          "TEXT"),
    ("purchase_orders", "precio_unitario",     "NUMERIC(14,4)"),
    ("purchase_orders", "orden_electronica",   "TEXT UNIQUE"),
    ("purchase_orders", "marca",               "TEXT"),
    ("fichas_producto", "fecha_orden_min",     "DATE"),
    ("fichas_producto", "fecha_orden_max",     "DATE"),
    ("ofertas_proveedor_history", "estado_ficha_producto", "VARCHAR(100)"),
    ("ofertas_proveedor_history", "estado_oferta",         "VARCHAR(100)"),
    ("ofertas_proveedor_history", "motivo_estado",         "TEXT"),
    ("ofertas_proveedor_history", "justificacion_estado",  "TEXT"),
    ("ofertas_proveedor_history", "id_producto_ofertado",  "VARCHAR(50)"),
]
try:
    with engine.begin() as _c:
        # Create composite unique index for ofertas_proveedor_history
        try:
            _c.execute(text("""
                CREATE UNIQUE INDEX IF NOT EXISTS idx_oferta_prov_unique 
                ON ofertas_proveedor_history (nro_parte, ruc_proveedor, acuerdo_marco, catalogo, categoria, (COALESCE(region, 'N/A')));
                CREATE INDEX IF NOT EXISTS ix_oph_nombre_prov_cat ON ofertas_proveedor_history (nombre_proveedor, categoria);
                CREATE INDEX IF NOT EXISTS ix_oph_ruc_cat ON ofertas_proveedor_history (ruc_proveedor, categoria);
                CREATE INDEX IF NOT EXISTS ix_oph_nro_parte_trim ON ofertas_proveedor_history (UPPER(TRIM(nro_parte)));
                CREATE INDEX IF NOT EXISTS ix_oph_categoria ON ofertas_proveedor_history (categoria);
            """))
        except Exception:
            pass

        # 1. Quitar el index unique de nro_orden_fisica si existiera
        try:
            _c.execute(text("DROP INDEX IF EXISTS ix_purchase_orders_nro_orden_fisica;"))
            _c.execute(text("CREATE INDEX IF NOT EXISTS ix_purchase_orders_nro_orden_fisica ON purchase_orders (nro_orden_fisica);"))
        except Exception:
            pass  # Error handling for DBs that don't support this
        
        try:
            _c.execute(text("ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_nro_orden_fisica_key;"))
        except Exception:
            pass  # Constraint might not exist
            
        # 2. Add new columns
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

        # 3. Backfill fecha_orden_min and fecha_orden_max in fichas_producto from purchase_orders
        try:
            _c.execute(text("""
                UPDATE fichas_producto fp
                SET fecha_orden_min = COALESCE(po.fecha_publicacion, po.fecha_aceptacion)
                FROM purchase_orders po
                WHERE fp.fecha_orden_min IS NULL
                  AND fp.orden_min IS NOT NULL
                  AND fp.orden_min != ''
                  AND po.orden_electronica = fp.orden_min;

                UPDATE fichas_producto fp
                SET fecha_orden_min = COALESCE(po.fecha_publicacion, po.fecha_aceptacion)
                FROM purchase_orders po
                WHERE fp.fecha_orden_min IS NULL
                  AND fp.orden_min IS NOT NULL
                  AND fp.orden_min != ''
                  AND po.nro_orden_fisica = fp.orden_min;

                UPDATE fichas_producto fp
                SET fecha_orden_max = COALESCE(po.fecha_publicacion, po.fecha_aceptacion)
                FROM purchase_orders po
                WHERE fp.fecha_orden_max IS NULL
                  AND fp.orden_max IS NOT NULL
                  AND fp.orden_max != ''
                  AND po.orden_electronica = fp.orden_max;

                UPDATE fichas_producto fp
                SET fecha_orden_max = COALESCE(po.fecha_publicacion, po.fecha_aceptacion)
                FROM purchase_orders po
                WHERE fp.fecha_orden_max IS NULL
                  AND fp.orden_max IS NOT NULL
                  AND fp.orden_max != ''
                  AND po.nro_orden_fisica = fp.orden_max;
            """))
        except Exception:
            pass
        # Actualizar stock inmediato para fichas reportadas con stock 0
        try:
            _c.execute(text("""
                UPDATE ofertas_proveedor_history
                SET existencia_stock = 5
                WHERE UPPER(nro_parte) = 'XBM238F100' AND (existencia_stock IS NULL OR existencia_stock = 0);

                UPDATE ofertas_proveedor_history
                SET existencia_stock = 1
                WHERE UPPER(nro_parte) IN ('MF2439K625', 'XBM270F180') AND (existencia_stock IS NULL OR existencia_stock = 0);
            """))
        except Exception:
            pass
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


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all handler so unhandled 500s pass through ExceptionMiddleware
    (which is wrapped by CORSMiddleware), ensuring CORS headers are always
    present — even on error responses."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error", "type": type(exc).__name__},
    )


@app.get("/", tags=["health"])
def health_check():
    return {"status": "ok", "project": settings.PROJECT_NAME}
