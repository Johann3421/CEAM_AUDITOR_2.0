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
    nro_parte: Optional[str] = Query(None, description="Filtro por nro_parte"),
    catalogo: Optional[str] = Query(None, description="Filtro por catálogo"),
    categoria: Optional[str] = Query(None, description="Filtro por categoría"),
    stock_filter: Optional[str] = Query(None, description="Filtro de stock: 'with_stock' o 'zero_stock'"),
    sort_by: Optional[str] = Query(None, description="Ordenamiento: precio_asc, precio_desc, stock_desc, marca_asc"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=1000),
    db: Session = Depends(get_db)
):
    """
    Lista las fichas y ofertas por proveedor con soporte para filtros por columna y ordenamiento tipo Excel.
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

    if nro_parte:
        where_clauses.append("UPPER(f.nro_parte) LIKE UPPER(:nro_parte)")
        params["nro_parte"] = f"%{nro_parte}%"

    if catalogo:
        where_clauses.append("UPPER(f.catalogo) LIKE UPPER(:catalogo)")
        params["catalogo"] = f"%{catalogo}%"

    if categoria:
        where_clauses.append("UPPER(f.categoria) LIKE UPPER(:categoria)")
        params["categoria"] = f"%{categoria}%"

    if stock_filter == "with_stock":
        where_clauses.append("f.existencia_stock > 0")
    elif stock_filter == "zero_stock":
        where_clauses.append("(f.existencia_stock IS NULL OR f.existencia_stock = 0)")

    where_sql = " AND ".join(where_clauses)

    order_by_sql = "id DESC"
    if sort_by == "precio_asc":
        order_by_sql = "precio_ofertado ASC NULLS LAST"
    elif sort_by == "precio_desc":
        order_by_sql = "precio_ofertado DESC NULLS LAST"
    elif sort_by == "stock_desc":
        order_by_sql = "existencia_stock DESC NULLS LAST"
    elif sort_by == "marca_asc":
        order_by_sql = "marca ASC"

    # First try query from ofertas_proveedor_history
    try:
        sql = f"""
            SELECT 
                id,
                nro_parte,
                descripcion_producto AS descripcion,
                marca,
                catalogo,
                categoria,
                acuerdo_marco,
                nombre_proveedor AS proveedor,
                ruc_proveedor,
                precio_ofertado,
                existencia_stock,
                plazo_entrega_dias,
                pdf_url,
                raw_json,
                fecha_extraccion,
                COUNT(*) OVER() AS total_count
            FROM ofertas_proveedor_history f
            WHERE {where_sql}
            ORDER BY {order_by_sql}
            LIMIT :limit OFFSET :offset
        """
        params["limit"] = limit
        params["offset"] = offset
        rows = db.execute(text(sql), params).mappings().all()

        if rows and len(rows) > 0:
            total_items = rows[0]["total_count"] if "total_count" in rows[0] else len(rows)
            return {
                "items": [dict(r) for r in rows],
                "page": page,
                "limit": limit,
                "total": total_items
            }
    except Exception as e:
        import logging
        logging.getLogger("ceam.proveedores").error("Error en get_proveedor_fichas: %s", e)

    return {"items": [], "page": page, "limit": limit, "total": 0}

@router.get("/filters/{column_name}")
def get_column_filters(column_name: str, db: Session = Depends(get_db)):
    """Devuelve valores únicos no nulos para construir filtros tipo Excel en las cabeceras de tabla."""
    from app.models.ofertas_proveedor import OfertaProveedorHistory
    valid_columns = {
        "marca": OfertaProveedorHistory.marca,
        "proveedor": OfertaProveedorHistory.nombre_proveedor,
        "catalogo": OfertaProveedorHistory.catalogo,
        "categoria": OfertaProveedorHistory.categoria,
    }
    if column_name not in valid_columns:
        raise HTTPException(status_code=400, detail="Columna no permitida para filtros")
    
    col = valid_columns[column_name]
    rows = db.query(col).filter(col.isnot(None), col != '').distinct().order_by(col).all()
    return {"values": [r[0] for r in rows if r[0]]}

@router.get("/export-json")
def export_all_fichas_json(db: Session = Depends(get_db)):
    """
    Devuelve todas las ofertas extraídas en formato JSON crudo completo.
    """
    try:
        rows = db.execute(text("""
            SELECT 
                id, nro_parte, descripcion_producto, marca, catalogo, categoria,
                acuerdo_marco, nombre_proveedor, ruc_proveedor, precio_ofertado,
                existencia_stock, plazo_entrega_dias, pdf_url, raw_json, fecha_extraccion
            FROM ofertas_proveedor_history
            ORDER BY id ASC
        """)).mappings().all()
        return [dict(r) for r in rows]
    except Exception as e:
        import logging
        logging.getLogger("ceam.proveedores").error("Error en export_all_fichas_json: %s", e)
        return {"error": str(e)}

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
