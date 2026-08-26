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
        prov_l = proveedor.lower()
        if prov_l in ("thekingcomputer", "king"):
            where_clauses.append("(UPPER(f.nombre_proveedor) LIKE '%KING%' OR UPPER(f.ruc_proveedor) = '20601234567')")
        elif prov_l in ("jorge_rojas", "jorge", "rojas"):
            where_clauses.append("(UPPER(f.nombre_proveedor) LIKE '%ROJAS%' OR UPPER(f.nombre_proveedor) LIKE '%JORGE%' OR UPPER(f.ruc_proveedor) = '10408899991')")
        else:
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
        cat_lower = catalogo.lower()
        if cat_lower in ("portatil", "laptop", "notebook"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%PORTATIL%' OR UPPER(f.categoria) LIKE '%PORTATIL%' OR UPPER(f.categoria) LIKE '%LAPTOP%' OR UPPER(f.descripcion_producto) LIKE '%PORTATIL%' OR UPPER(f.descripcion_producto) LIKE '%PORTÁTIL%' OR UPPER(f.descripcion_producto) LIKE '%LAPTOP%' OR UPPER(f.descripcion_producto) LIKE '%NOTEBOOK%') AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%'")
        elif cat_lower in ("monitor", "monitores", "pantalla"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%MONITOR%' OR UPPER(f.categoria) LIKE '%MONITOR%' OR UPPER(f.descripcion_producto) LIKE 'MONITOR%' OR UPPER(f.descripcion_producto) LIKE '%MONITOR LED%') AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%'")
        elif cat_lower in ("impresora", "impresoras", "multifuncional"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%IMPRESORA%' OR UPPER(f.categoria) LIKE '%IMPRESORA%' OR UPPER(f.descripcion_producto) LIKE '%IMPRESORA%' OR UPPER(f.descripcion_producto) LIKE '%MULTIFUNCIONAL%')")
        elif cat_lower in ("escaner", "escáner", "scanner", "escaneres"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%ESCANER%' OR UPPER(f.categoria) LIKE '%ESCANER%' OR UPPER(f.descripcion_producto) LIKE '%ESCANER%' OR UPPER(f.descripcion_producto) LIKE '%ESCÁNER%')")
        elif cat_lower in ("tablet", "tablets"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%TABLET%' OR UPPER(f.categoria) LIKE '%TABLET%' OR UPPER(f.descripcion_producto) LIKE '%TABLET%')")
        elif cat_lower in ("workstation", "estacion de trabajo", "estacion"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%ESTACION%' OR UPPER(f.descripcion_producto) LIKE '%ESTACION DE TRABAJO%' OR UPPER(f.descripcion_producto) LIKE '%WORKSTATION%')")
        elif cat_lower in ("servidor", "servidores", "server"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%SERVIDOR%' OR UPPER(f.descripcion_producto) LIKE '%SERVIDOR%' OR UPPER(f.descripcion_producto) LIKE '%SERVER%')")
        elif cat_lower in ("proyector", "proyectores"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%PROYECTOR%' OR UPPER(f.descripcion_producto) LIKE '%PROYECTOR%')")
        elif cat_lower in ("ups", "energia", "estabilizador"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%UPS%' OR UPPER(f.descripcion_producto) LIKE '%UPS%' OR UPPER(f.descripcion_producto) LIKE '%ENERGIA ININTERRUMPIDA%')")
        else:
            where_clauses.append("(UPPER(f.catalogo) LIKE UPPER(:catalogo) OR UPPER(f.descripcion_producto) LIKE UPPER(:catalogo))")
            params["catalogo"] = f"%{catalogo}%"

    if categoria:
        categ_lower = categoria.lower()
        if categ_lower == "desktop":
            where_clauses.append("(UPPER(f.categoria) LIKE '%ESCRITORIO%' OR UPPER(f.descripcion_producto) LIKE '%ESCRITORIO%' OR UPPER(f.descripcion_producto) LIKE '%MINI PC%' OR UPPER(f.descripcion_producto) LIKE '%SFF%') AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%' AND UPPER(f.descripcion_producto) NOT LIKE '%PORTATIL%' AND UPPER(f.descripcion_producto) NOT LIKE '%PORTÁTIL%' AND UPPER(f.descripcion_producto) NOT LIKE 'MONITOR%'")
        elif categ_lower in ("laptop", "portatil", "notebook"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%PORTATIL%' OR UPPER(f.categoria) LIKE '%PORTATIL%' OR UPPER(f.categoria) LIKE '%LAPTOP%' OR UPPER(f.descripcion_producto) LIKE '%PORTATIL%' OR UPPER(f.descripcion_producto) LIKE '%PORTÁTIL%' OR UPPER(f.descripcion_producto) LIKE '%LAPTOP%' OR UPPER(f.descripcion_producto) LIKE '%NOTEBOOK%') AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%'")
        elif categ_lower in ("aio", "todo_en_uno", "todo en uno"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%TODO EN UNO%' OR UPPER(f.descripcion_producto) LIKE '%TODO EN UNO%' OR UPPER(f.descripcion_producto) LIKE '%ALL IN ONE%' OR UPPER(f.descripcion_producto) LIKE '%ALL-IN-ONE%')")
        elif categ_lower in ("monitor", "monitores", "pantalla"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%MONITOR%' OR UPPER(f.categoria) LIKE '%MONITOR%' OR UPPER(f.descripcion_producto) LIKE 'MONITOR%' OR UPPER(f.descripcion_producto) LIKE '%MONITOR LED%') AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%'")
        elif categ_lower in ("impresora", "impresoras", "multifuncional"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%IMPRESORA%' OR UPPER(f.categoria) LIKE '%IMPRESORA%' OR UPPER(f.descripcion_producto) LIKE '%IMPRESORA%' OR UPPER(f.descripcion_producto) LIKE '%MULTIFUNCIONAL%')")
        elif categ_lower in ("escaner", "escáner", "scanner", "escaneres"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%ESCANER%' OR UPPER(f.categoria) LIKE '%ESCANER%' OR UPPER(f.descripcion_producto) LIKE '%ESCANER%' OR UPPER(f.descripcion_producto) LIKE '%ESCÁNER%')")
        elif categ_lower in ("tablet", "tablets"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%TABLET%' OR UPPER(f.categoria) LIKE '%TABLET%' OR UPPER(f.descripcion_producto) LIKE '%TABLET%')")
        elif categ_lower in ("workstation", "estacion de trabajo", "estacion"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%ESTACION%' OR UPPER(f.descripcion_producto) LIKE '%ESTACION DE TRABAJO%' OR UPPER(f.descripcion_producto) LIKE '%WORKSTATION%')")
        elif categ_lower in ("servidor", "servidores", "server"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%SERVIDOR%' OR UPPER(f.descripcion_producto) LIKE '%SERVIDOR%' OR UPPER(f.descripcion_producto) LIKE '%SERVER%')")
        elif categ_lower in ("proyector", "proyectores"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%PROYECTOR%' OR UPPER(f.descripcion_producto) LIKE '%PROYECTOR%')")
        elif categ_lower in ("ups", "energia", "estabilizador"):
            where_clauses.append("(UPPER(f.catalogo) LIKE '%UPS%' OR UPPER(f.descripcion_producto) LIKE '%UPS%' OR UPPER(f.descripcion_producto) LIKE '%ENERGIA ININTERRUMPIDA%')")
        else:
            where_clauses.append("(UPPER(f.categoria) LIKE UPPER(:categoria) OR UPPER(f.catalogo) LIKE UPPER(:categoria) OR UPPER(f.descripcion_producto) LIKE UPPER(:categoria))")
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

@router.get("/categories-count")
def get_categories_count(db: Session = Depends(get_db)):
    """Devuelve el conteo de ofertas distribuidas por todas las categorías."""
    try:
        total = db.execute(text("SELECT COUNT(*) FROM ofertas_proveedor_history;")).scalar() or 0
        desktop = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(categoria) LIKE '%ESCRITORIO%' OR UPPER(descripcion_producto) LIKE '%ESCRITORIO%' OR UPPER(descripcion_producto) LIKE '%MINI PC%' OR UPPER(descripcion_producto) LIKE '%SFF%')
              AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%'
              AND UPPER(descripcion_producto) NOT LIKE '%PORTATIL%'
              AND UPPER(descripcion_producto) NOT LIKE '%PORTÁTIL%'
              AND UPPER(descripcion_producto) NOT LIKE 'MONITOR%';
        """)).scalar() or 0

        laptop = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%PORTATIL%' OR UPPER(categoria) LIKE '%PORTATIL%' OR UPPER(descripcion_producto) LIKE '%PORTATIL%' OR UPPER(descripcion_producto) LIKE '%PORTÁTIL%' OR UPPER(descripcion_producto) LIKE '%LAPTOP%' OR UPPER(descripcion_producto) LIKE '%NOTEBOOK%')
              AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%';
        """)).scalar() or 0

        aio = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(categoria) LIKE '%TODO EN UNO%' OR UPPER(descripcion_producto) LIKE '%TODO EN UNO%' OR UPPER(descripcion_producto) LIKE '%ALL IN ONE%' OR UPPER(descripcion_producto) LIKE '%ALL-IN-ONE%');
        """)).scalar() or 0

        monitor = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%MONITOR%' OR UPPER(categoria) LIKE '%MONITOR%' OR UPPER(descripcion_producto) LIKE 'MONITOR%' OR UPPER(descripcion_producto) LIKE '%MONITOR LED%')
              AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%';
        """)).scalar() or 0

        impresora = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%IMPRESORA%' OR UPPER(categoria) LIKE '%IMPRESORA%' OR UPPER(descripcion_producto) LIKE '%IMPRESORA%' OR UPPER(descripcion_producto) LIKE '%MULTIFUNCIONAL%');
        """)).scalar() or 0

        escaner = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%ESCANER%' OR UPPER(categoria) LIKE '%ESCANER%' OR UPPER(descripcion_producto) LIKE '%ESCANER%' OR UPPER(descripcion_producto) LIKE '%ESCÁNER%');
        """)).scalar() or 0

        tablet = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%TABLET%' OR UPPER(categoria) LIKE '%TABLET%' OR UPPER(descripcion_producto) LIKE '%TABLET%');
        """)).scalar() or 0

        workstation = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%ESTACION%' OR UPPER(descripcion_producto) LIKE '%ESTACION DE TRABAJO%' OR UPPER(descripcion_producto) LIKE '%WORKSTATION%');
        """)).scalar() or 0

        servidor = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%SERVIDOR%' OR UPPER(descripcion_producto) LIKE '%SERVIDOR%' OR UPPER(descripcion_producto) LIKE '%SERVER%');
        """)).scalar() or 0

        proyector = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%PROYECTOR%' OR UPPER(descripcion_producto) LIKE '%PROYECTOR%');
        """)).scalar() or 0

        ups = db.execute(text("""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE (UPPER(catalogo) LIKE '%UPS%' OR UPPER(descripcion_producto) LIKE '%UPS%' OR UPPER(descripcion_producto) LIKE '%ENERGIA ININTERRUMPIDA%');
        """)).scalar() or 0

        return {
            "total": total,
            "desktop": desktop,
            "laptop": laptop,
            "aio": aio,
            "monitor": monitor,
            "impresora": impresora,
            "escaner": escaner,
            "tablet": tablet,
            "workstation": workstation,
            "servidor": servidor,
            "proyector": proyector,
            "ups": ups
        }
    except Exception as e:
        return {
            "total": 0, "desktop": 0, "laptop": 0, "aio": 0, "monitor": 0,
            "impresora": 0, "escaner": 0, "tablet": 0, "workstation": 0,
            "servidor": 0, "proyector": 0, "ups": 0, "error": str(e)
        }

@router.post("/reclassify")
def reclassify_existing_offers(db: Session = Depends(get_db)):
    """Reclasifica en lote todas las ofertas existentes analizando su descripción."""
    try:
        db.execute(text("""
            -- 1. Monitores
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'MONITORES', categoria = 'MONITOR'
            WHERE (UPPER(descripcion_producto) LIKE 'MONITOR%' 
               OR UPPER(descripcion_producto) LIKE '%MONITOR LED%' 
               OR UPPER(descripcion_producto) LIKE '%MONITOR PARA PC%'
               OR UPPER(categoria) LIKE '%MONITOR%')
              AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%';

            -- 2. Todo en Uno (AIO)
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'COMPUTADORAS DE ESCRITORIO', categoria = 'COMPUTADORA TODO EN UNO'
            WHERE (UPPER(descripcion_producto) LIKE '%TODO EN UNO%' 
               OR UPPER(descripcion_producto) LIKE '%ALL IN ONE%' 
               OR UPPER(descripcion_producto) LIKE '%ALL-IN-ONE%');

            -- 3. Portátiles / Laptops
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'COMPUTADORAS PORTATILES', categoria = 'COMPUTADORA PORTATIL'
            WHERE (UPPER(descripcion_producto) LIKE '%PORTATIL%' 
               OR UPPER(descripcion_producto) LIKE '%PORTÁTIL%' 
               OR UPPER(descripcion_producto) LIKE '%LAPTOP%' 
               OR UPPER(descripcion_producto) LIKE '%NOTEBOOK%')
              AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%';

            -- 4. Impresoras / Multifuncionales
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'IMPRESORAS', categoria = 'IMPRESORA'
            WHERE (UPPER(descripcion_producto) LIKE '%IMPRESORA%' 
               OR UPPER(descripcion_producto) LIKE '%MULTIFUNCIONAL%'
               OR UPPER(descripcion_producto) LIKE '%PLOTTER%'
               OR UPPER(categoria) LIKE '%IMPRESORA%');

            -- 5. Escáneres
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'ESCANERES', categoria = 'ESCANER'
            WHERE (UPPER(descripcion_producto) LIKE '%ESCANER%' 
               OR UPPER(descripcion_producto) LIKE '%ESCÁNER%');

            -- 6. Tablets
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'TABLETS', categoria = 'TABLET'
            WHERE UPPER(descripcion_producto) LIKE '%TABLET%';

            -- 7. Estaciones de Trabajo (Workstations)
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'ESTACIONES DE TRABAJO', categoria = 'ESTACION DE TRABAJO'
            WHERE (UPPER(descripcion_producto) LIKE '%ESTACION DE TRABAJO%' 
               OR UPPER(descripcion_producto) LIKE '%ESTACIÓN DE TRABAJO%'
               OR UPPER(descripcion_producto) LIKE '%WORKSTATION%');

            -- 8. Servidores
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'SERVIDORES', categoria = 'SERVIDOR'
            WHERE (UPPER(descripcion_producto) LIKE '%SERVIDOR%' 
               OR UPPER(descripcion_producto) LIKE '%SERVER%');

            -- 9. Proyectores
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'PROYECTORES', categoria = 'PROYECTOR'
            WHERE UPPER(descripcion_producto) LIKE '%PROYECTOR%';

            -- 10. UPS / Energía
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'ENERGIA Y UPS', categoria = 'UPS'
            WHERE (UPPER(descripcion_producto) LIKE '%UPS%' 
               OR UPPER(descripcion_producto) LIKE '%ENERGIA ININTERRUMPIDA%'
               OR UPPER(descripcion_producto) LIKE '%ESTABILIZADOR%');

            -- 11. Computadoras de Escritorio (Desktop / Torre)
            UPDATE ofertas_proveedor_history 
            SET catalogo = 'COMPUTADORAS DE ESCRITORIO', categoria = 'COMPUTADORA DE ESCRITORIO'
            WHERE (UPPER(descripcion_producto) LIKE 'COMPUTADORA DE ESCRITORIO%' 
               OR UPPER(descripcion_producto) LIKE '%ESCRITORIO%' 
               OR UPPER(descripcion_producto) LIKE '%MINI PC%'
               OR UPPER(descripcion_producto) LIKE '%SFF%')
              AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%'
              AND UPPER(descripcion_producto) NOT LIKE '%PORTATIL%'
              AND UPPER(descripcion_producto) NOT LIKE '%PORTÁTIL%'
              AND UPPER(descripcion_producto) NOT LIKE '%MONITOR%';
        """))
        db.commit()
        return {"success": True, "message": "Reclasificación ejecutada con éxito"}
    except Exception as e:
        return {"success": False, "error": str(e)}

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

@router.get("/accounts")
def get_available_accounts():
    """Devuelve la lista de cuentas de proveedores configuradas para extracción."""
    from app.services.proveedores_scraper import PROVEEDORES_CONFIG
    return [
        {
            "id": k,
            "nombre": v["nombre"],
            "short": v["short"],
            "user": v["user"],
            "ruc": v["ruc"]
        }
        for k, v in PROVEEDORES_CONFIG.items()
    ]

@router.post("/scrape")
async def trigger_scrape_proveedores(
    background_tasks: BackgroundTasks,
    proveedor: str = Query("thekingcomputer", description="ID del proveedor a extraer: thekingcomputer, jorge_rojas"),
    db: Session = Depends(get_db)
):
    """
    Inicia la extracción en segundo plano para la cuenta del proveedor especificado.
    """
    from app.services.proveedores_scraper import PROVEEDORES_CONFIG
    prov_nombre = PROVEEDORES_CONFIG.get(proveedor, {}).get("nombre", proveedor)

    async def _async_task():
        await run_worker_pool_extraction([], db, provider_key=proveedor)

    background_tasks.add_task(_async_task)
    return {
        "message": f"Worker Pool de extracción iniciado para '{prov_nombre}'",
        "proveedor": proveedor,
        "nombre": prov_nombre
    }

@router.get("/scrape-status")
def get_scrape_status():
    from app.services.proveedores_scraper import EXTRACTION_STATUS
    return EXTRACTION_STATUS
