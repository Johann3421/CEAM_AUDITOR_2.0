from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict

from app.db.database import get_db
from app.services.proveedores_scraper import run_worker_pool_extraction, fetch_single_combo

router = APIRouter(prefix="/proveedores", tags=["proveedores"])

@router.get("/fichas")
def get_proveedor_fichas(
    proveedor: Optional[str] = Query(None, description="Filtro por nombre de proveedor"),
    search: Optional[str] = Query(None, description="Búsqueda rápida por nro_parte o descripción"),
    marca: Optional[str] = Query(None, description="Filtro por marca"),
    page: int = Query(1, ge=1),
    limit: int = Query(25, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Lista las fichas y ofertas por proveedor desde ofertas_proveedor_history o purchase_orders.
    """
    offset = (page - 1) * limit
    params = {}
    where_clauses = ["1=1"]

    if proveedor and proveedor.lower() != "all":
        where_clauses.append("UPPER(f.nombre_proveedor) LIKE UPPER(:proveedor)")
        params["proveedor"] = f"%{proveedor}%"

    if search:
        where_clauses.append("(UPPER(f.nro_parte) LIKE UPPER(:search) OR UPPER(f.descripcion_producto) LIKE UPPER(:search) OR UPPER(f.marca) LIKE UPPER(:search))")
        params["search"] = f"%{search}%"

    if marca:
        where_clauses.append("UPPER(f.marca) = UPPER(:marca)")
        params["marca"] = marca

    where_sql = " AND ".join(where_clauses)

    # First try query from ofertas_proveedor_history
    try:
        sql = f"""
            SELECT 
                nro_parte,
                descripcion_producto AS descripcion,
                marca,
                catalogo,
                nombre_proveedor AS proveedor,
                precio_ofertado AS precio_referencia,
                precio_ofertado AS precio_min,
                precio_ofertado AS precio_max,
                existencia_stock AS n_ordenes,
                precio_ofertado AS total_vendido,
                pdf_url
            FROM ofertas_proveedor_history f
            WHERE {where_sql}
            LIMIT :limit OFFSET :offset
        """
        params["limit"] = limit
        params["offset"] = offset
        rows = db.execute(text(sql), params).mappings().all()

        if rows and len(rows) > 0:
            return {
                "items": [dict(r) for r in rows],
                "page": page,
                "limit": limit,
                "total": len(rows)
            }
    except Exception:
        pass

    return {"items": [], "page": page, "limit": limit, "total": 0}

@router.get("/kpis")
def get_proveedor_kpis(
    proveedor: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """
    Devuelve los KPIs consolidados del proveedor.
    """
    params = {}
    where_clause = ""
    if proveedor and proveedor.lower() != "all":
        where_clause = "WHERE UPPER(nombre_proveedor) LIKE UPPER(:proveedor)"
        params["proveedor"] = f"%{proveedor}%"

    try:
        res = db.execute(text(f"""
            SELECT 
                COUNT(DISTINCT nro_orden_fisica) AS total_ordenes,
                COALESCE(SUM(monto_total), 0) AS total_vendido,
                COUNT(DISTINCT id) AS fichas_count,
                COALESCE(AVG(monto_total), 0) AS avg_precio
            FROM purchase_orders
            {where_clause}
        """), params).mappings().first()
        return dict(res) if res else {"total_ordenes": 0, "total_vendido": 0, "fichas_count": 0, "avg_precio": 0}
    except Exception:
        return {"total_ordenes": 0, "total_vendido": 0, "fichas_count": 0, "avg_precio": 0}

@router.post("/scrape")
async def trigger_scrape_proveedores(
    background_tasks: BackgroundTasks,
    n_acuerdo: str = Query("249"),
    n_catalogo: str = Query("252"),
    n_categoria: str = Query("11736"),
    db: Session = Depends(get_db)
):
    """
    Inicia la extracción en segundo plano usando el Worker Pool async concurrente.
    """
    combos = [(n_acuerdo, n_catalogo, n_categoria)]

    async def _async_task():
        await run_worker_pool_extraction(combos, db)

    background_tasks.add_task(_async_task)
    return {"message": "Worker Pool de extracción por proveedor iniciado en segundo plano"}

@router.get("/scrape-status")
def get_scrape_status():
    from app.services.proveedores_scraper import EXTRACTION_STATUS
    return EXTRACTION_STATUS
