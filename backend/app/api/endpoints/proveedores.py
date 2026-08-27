import json
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
    proveedor_filter: Optional[str] = Query(None, description="Filtro específico: 'ambos', 'exclusivo', 'thekingcomputer', 'jorge_rojas'"),
    region: Optional[str] = Query(None, description="Filtro por región / departamento"),
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
    Lista las fichas y ofertas por proveedor con soporte para filtros por columna, región y ordenamiento tipo Excel.
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

    # Cuando se selecciona una región, se computa dinámicamente el plazo_entrega_dias
    # para esa región a través de plazo_expr y raw_json['plazos_por_region'].

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
        where_clauses.append("UPPER(f.catalogo) = UPPER(:catalogo)")
        params["catalogo"] = catalogo

    if categoria:
        categ_lower = categoria.lower().strip()
        if categ_lower in ("escritorio", "computadora de escritorio"):
            where_clauses.append("""(
                UPPER(f.categoria) = 'COMPUTADORA DE ESCRITORIO'
                OR (
                    (UPPER(f.catalogo) LIKE '%ESCRITORIO%' OR UPPER(f.categoria) LIKE '%ESCRITORIO%' OR UPPER(f.descripcion_producto) LIKE '%ESCRITORIO%')
                    AND UPPER(f.categoria) NOT LIKE '%TODO EN UNO%'
                    AND UPPER(f.categoria) NOT LIKE '%MONITOR%'
                    AND UPPER(f.categoria) NOT LIKE '%ESTACION%'
                    AND UPPER(f.categoria) NOT LIKE '%ALMACENAMIENTO%'
                    AND UPPER(f.categoria) NOT LIKE '%PANTALLA%'
                    AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%'
                    AND UPPER(f.descripcion_producto) NOT LIKE '%ALL IN ONE%'
                    AND UPPER(f.descripcion_producto) NOT LIKE '%MONITOR%'
                )
            )""")
        elif categ_lower in ("aio", "todo en uno", "all in one", "computadora todo en uno"):
            where_clauses.append("""(
                UPPER(f.categoria) LIKE '%TODO EN UNO%'
                OR UPPER(f.descripcion_producto) LIKE '%TODO EN UNO%'
                OR UPPER(f.descripcion_producto) LIKE '%ALL IN ONE%'
                OR UPPER(f.descripcion_producto) LIKE '%ALL-IN-ONE%'
            )""")
        elif categ_lower in ("workstation", "estacion de trabajo", "estacion"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%ESTACION DE TRABAJO%' OR UPPER(f.descripcion_producto) LIKE '%WORKSTATION%')")
        elif categ_lower in ("monitor", "monitores"):
            where_clauses.append("""(
                (UPPER(f.categoria) = 'MONITOR' OR UPPER(f.categoria) LIKE '%MONITOR%' OR UPPER(f.catalogo) LIKE '%MONITOR%' OR UPPER(f.descripcion_producto) LIKE 'MONITOR%' OR UPPER(f.descripcion_producto) LIKE '%MONITOR LED%')
                AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%'
                AND UPPER(f.categoria) NOT LIKE '%TODO EN UNO%'
            )""")
        elif categ_lower in ("pantalla_pub", "pantalla publicitaria"):
            where_clauses.append("UPPER(f.categoria) LIKE '%PANTALLA PUBLICITARIA%'")
        elif categ_lower in ("pantalla_int", "pantalla interactiva"):
            where_clauses.append("UPPER(f.categoria) LIKE '%PANTALLA INTERACTIVA%'")
        elif categ_lower in ("almacenamiento_int", "dispositivos de almacenamiento interno"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%ALMACENAMIENTO INTERNO%' OR UPPER(f.descripcion_producto) LIKE '%ALMACENAMIENTO INTERNO%')")
        elif categ_lower in ("almacenamiento_ext", "dispositivos de almacenamiento externo"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%ALMACENAMIENTO EXTERNO%' OR UPPER(f.descripcion_producto) LIKE '%ALMACENAMIENTO EXTERNO%')")
        elif categ_lower in ("portatil", "laptop", "laptops", "computadora portatil"):
            where_clauses.append("""(
                UPPER(f.categoria) = 'COMPUTADORA PORTATIL'
                OR (
                    (UPPER(f.catalogo) LIKE '%PORTATIL%' OR UPPER(f.categoria) LIKE '%PORTATIL%' OR UPPER(f.categoria) LIKE '%LAPTOP%' OR UPPER(f.descripcion_producto) LIKE '%PORTATIL%' OR UPPER(f.descripcion_producto) LIKE '%PORTÁTIL%' OR UPPER(f.descripcion_producto) LIKE '%LAPTOP%' OR UPPER(f.descripcion_producto) LIKE '%NOTEBOOK%')
                    AND UPPER(f.categoria) NOT LIKE '%ESTACION%'
                    AND UPPER(f.descripcion_producto) NOT LIKE '%TODO EN UNO%'
                )
            )""")
        elif categ_lower in ("workstation_portatil", "estacion de trabajo portatil"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%ESTACION DE TRABAJO PORTATIL%' OR UPPER(f.descripcion_producto) LIKE '%WORKSTATION PORTATIL%')")
        elif categ_lower in ("tableta", "tablet", "tablets"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%TABLET%' OR UPPER(f.descripcion_producto) LIKE '%TABLETA%')")
        elif categ_lower in ("escaner_planos", "escaner de planos"):
            where_clauses.append("UPPER(f.categoria) LIKE '%ESCANER DE PLANOS%'")
        elif categ_lower in ("escaner_docs", "escaner de documentos"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%ESCANER DE DOCUMENTOS%' OR (UPPER(f.catalogo) LIKE '%ESCANER%' AND UPPER(f.categoria) NOT LIKE '%PLANOS%' AND UPPER(f.categoria) NOT LIKE '%LIBROS%'))")
        elif categ_lower in ("escaner_libros", "escaner de libros"):
            where_clauses.append("UPPER(f.categoria) LIKE '%ESCANER DE LIBROS%'")
        else:
            where_clauses.append("(UPPER(f.categoria) LIKE UPPER(:categoria) OR UPPER(f.catalogo) LIKE UPPER(:categoria) OR UPPER(f.descripcion_producto) LIKE UPPER(:categoria))")
            params["categoria"] = f"%{categoria}%"

    if stock_filter == "with_stock":
        where_clauses.append("f.existencia_stock > 0")
    elif stock_filter == "zero_stock":
        where_clauses.append("(f.existencia_stock IS NULL OR f.existencia_stock = 0)")

    where_sql = " AND ".join(where_clauses)
    is_consolidated = (not proveedor or proveedor.lower() == "all")

    selected_reg = region.strip().upper() if (region and region.lower() != "all") else None
    if selected_reg:
        params["selected_reg"] = selected_reg
        plazo_expr = "COALESCE((f.raw_json->'plazos_por_region'->>:selected_reg)::int, f.plazo_entrega_dias)"
    else:
        plazo_expr = "f.plazo_entrega_dias"

    if is_consolidated:
        having_clauses = []
        if proveedor_filter:
            pf = proveedor_filter.lower().strip()
            if pf in ("ambos", "compitiendo", "competencia", "dual"):
                having_clauses.append("COUNT(DISTINCT r.ruc_proveedor) > 1")
            elif pf in ("exclusivo", "unico", "single", "1"):
                having_clauses.append("COUNT(DISTINCT r.ruc_proveedor) = 1")
            elif pf in ("thekingcomputer", "the_king", "king", "20601234567"):
                having_clauses.append("BOOL_OR(r.ruc_proveedor = '20601234567' OR UPPER(r.nombre_proveedor) LIKE '%KING%')")
            elif pf in ("jorge_rojas", "jorge", "rojas", "10408899991"):
                having_clauses.append("BOOL_OR(r.ruc_proveedor = '10408899991' OR UPPER(r.nombre_proveedor) LIKE '%JORGE%' OR UPPER(r.nombre_proveedor) LIKE '%ROJAS%')")

        having_sql = f"HAVING {' AND '.join(having_clauses)}" if having_clauses else ""

        order_by_sql = "g.id DESC"
        if sort_by == "precio_asc":
            order_by_sql = "g.min_precio ASC NULLS LAST"
        elif sort_by == "precio_desc":
            order_by_sql = "g.min_precio DESC NULLS LAST"
        elif sort_by == "stock_desc":
            order_by_sql = "g.existencia_stock DESC NULLS LAST"
        elif sort_by == "marca_asc":
            order_by_sql = "g.marca ASC"

        sql = f"""
            WITH raw_matched AS (
                SELECT 
                    f.id,
                    f.nro_parte,
                    f.descripcion_producto AS descripcion,
                    f.marca,
                    f.catalogo,
                    f.categoria,
                    f.acuerdo_marco,
                    f.nombre_proveedor,
                    f.ruc_proveedor,
                    f.precio_ofertado,
                    f.existencia_stock,
                    {plazo_expr} AS plazo_entrega_dias,
                    COALESCE(f.raw_json->'plazos_por_region', '{{}}'::json) AS plazos_por_region,
                    f.region,
                    f.provincia,
                    f.pdf_url,
                    f.fecha_extraccion,
                    CASE 
                        WHEN UPPER(TRIM(COALESCE(f.nro_parte, ''))) IN ('', '-', 'S/N', 'SN', 'COLECTIVO', 'VARIOS', '0', 'NO TIENE', 'SIN NUMERO', 'SIN NUMERO DE PARTE', 'NO APLICA') 
                        THEN CONCAT(COALESCE(NULLIF(TRIM(f.nro_parte), ''), 'S/N'), '::', MD5(COALESCE(f.descripcion_producto, f.id::text)))
                        ELSE UPPER(TRIM(f.nro_parte))
                    END AS group_key
                FROM ofertas_proveedor_history f
                WHERE {where_sql}
            ),
            dedup_provider_offers AS (
                SELECT DISTINCT ON (r.group_key, r.ruc_proveedor)
                    r.group_key,
                    r.id,
                    r.nro_parte,
                    r.descripcion,
                    r.marca,
                    r.catalogo,
                    r.categoria,
                    r.acuerdo_marco,
                    r.nombre_proveedor,
                    r.ruc_proveedor,
                    r.precio_ofertado,
                    r.existencia_stock,
                    r.plazo_entrega_dias,
                    r.plazos_por_region,
                    r.region,
                    r.provincia,
                    r.pdf_url,
                    r.fecha_extraccion
                FROM raw_matched r
                ORDER BY r.group_key, r.ruc_proveedor, r.precio_ofertado ASC NULLS LAST, r.id DESC
            ),
            grouped_items AS (
                SELECT 
                    r.group_key,
                    MAX(r.nro_parte) AS nro_parte,
                    MIN(r.id) AS id,
                    MAX(r.descripcion) AS descripcion,
                    MAX(r.marca) AS marca,
                    MAX(r.catalogo) AS catalogo,
                    MAX(r.categoria) AS categoria,
                    MAX(r.acuerdo_marco) AS acuerdo_marco,
                    MIN(r.precio_ofertado) AS min_precio,
                    MAX(r.precio_ofertado) AS max_precio,
                    MIN(r.plazo_entrega_dias) AS min_plazo_entrega,
                    MAX(r.plazo_entrega_dias) AS max_plazo_entrega,
                    MAX(r.region) AS region,
                    MAX(r.provincia) AS provincia,
                    SUM(COALESCE(r.existencia_stock, 0)) AS existencia_stock,
                    COUNT(DISTINCT r.ruc_proveedor) AS total_proveedores,
                    json_agg(
                        json_build_object(
                            'id', r.id,
                            'nombre_proveedor', r.nombre_proveedor,
                            'ruc_proveedor', r.ruc_proveedor,
                            'precio_ofertado', r.precio_ofertado,
                            'existencia_stock', r.existencia_stock,
                            'plazo_entrega_dias', r.plazo_entrega_dias,
                            'plazos_por_region', r.plazos_por_region,
                            'region', r.region,
                            'provincia', r.provincia,
                            'pdf_url', r.pdf_url,
                            'estado', 'VIGENTE',
                            'fecha_extraccion', r.fecha_extraccion::text
                        ) ORDER BY r.precio_ofertado ASC NULLS LAST
                    ) AS ofertas
                FROM dedup_provider_offers r
                GROUP BY r.group_key
                {having_sql}
            )
            SELECT 
                g.id,
                g.nro_parte,
                g.descripcion,
                g.marca,
                g.catalogo,
                g.categoria,
                g.acuerdo_marco,
                g.min_precio,
                g.max_precio,
                g.min_plazo_entrega,
                g.max_plazo_entrega,
                g.region,
                g.provincia,
                g.existencia_stock,
                g.total_proveedores,
                g.ofertas,
                COUNT(*) OVER() AS total_count
            FROM grouped_items g
            ORDER BY {order_by_sql}
            LIMIT :limit OFFSET :offset
        """
    else:
        order_by_sql = "f.id DESC"
        if sort_by == "precio_asc":
            order_by_sql = "f.precio_ofertado ASC NULLS LAST"
        elif sort_by == "precio_desc":
            order_by_sql = "f.precio_ofertado DESC NULLS LAST"
        elif sort_by == "stock_desc":
            order_by_sql = "f.existencia_stock DESC NULLS LAST"
        elif sort_by == "marca_asc":
            order_by_sql = "f.marca ASC"

        sql = f"""
            SELECT 
                f.id,
                f.nro_parte,
                f.descripcion_producto AS descripcion,
                f.marca,
                f.catalogo,
                f.categoria,
                f.acuerdo_marco,
                f.nombre_proveedor AS proveedor,
                f.ruc_proveedor,
                f.precio_ofertado,
                f.precio_ofertado AS min_precio,
                f.existencia_stock,
                {plazo_expr} AS plazo_entrega_dias,
                {plazo_expr} AS min_plazo_entrega,
                {plazo_expr} AS max_plazo_entrega,
                COALESCE(f.raw_json->'plazos_por_region', '{{}}'::json) AS plazos_por_region,
                f.region,
                f.provincia,
                f.pdf_url,
                f.raw_json,
                f.fecha_extraccion::text AS fecha_extraccion,
                1 AS total_proveedores,
                json_build_array(json_build_object(
                    'id', f.id,
                    'nombre_proveedor', f.nombre_proveedor,
                    'ruc_proveedor', f.ruc_proveedor,
                    'precio_ofertado', f.precio_ofertado,
                    'existencia_stock', f.existencia_stock,
                    'plazo_entrega_dias', {plazo_expr},
                    'plazos_por_region', COALESCE(f.raw_json->'plazos_por_region', '{{}}'::json),
                    'region', f.region,
                    'provincia', f.provincia,
                    'pdf_url', f.pdf_url,
                    'estado', 'VIGENTE',
                    'fecha_extraccion', f.fecha_extraccion::text
                )) AS ofertas,
                COUNT(*) OVER() AS total_count
            FROM ofertas_proveedor_history f
            WHERE {where_sql}
            ORDER BY {order_by_sql}
            LIMIT :limit OFFSET :offset
        """

    try:
        params["limit"] = limit
        params["offset"] = offset
        rows = db.execute(text(sql), params).mappings().all()

        if rows and len(rows) > 0:
            total_items = rows[0]["total_count"] if "total_count" in rows[0] else len(rows)
            items = []
            for r in rows:
                item_dict = dict(r)
                if isinstance(item_dict.get("ofertas"), str):
                    try:
                        item_dict["ofertas"] = json.loads(item_dict["ofertas"])
                    except Exception:
                        item_dict["ofertas"] = []
                items.append(item_dict)

            return {
                "items": items,
                "page": page,
                "limit": limit,
                "total": total_items,
                "is_consolidated": is_consolidated
            }
    except Exception as e:
        import logging
        logging.getLogger("ceam.proveedores").error("Error en get_proveedor_fichas: %s", e)

    return {"items": [], "page": page, "limit": limit, "total": 0, "is_consolidated": is_consolidated}

@router.post("/clear")
def clear_proveedor_data(
    proveedor: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Limpia las ofertas de la base de datos para comenzar de nuevo una extracción limpia."""
    try:
        if proveedor and proveedor.lower() != "all":
            prov_l = proveedor.lower()
            if prov_l in ("thekingcomputer", "king"):
                db.execute(text("DELETE FROM ofertas_proveedor_history WHERE UPPER(nombre_proveedor) LIKE '%KING%' OR UPPER(ruc_proveedor) = '20601234567';"))
            elif prov_l in ("jorge_rojas", "jorge", "rojas"):
                db.execute(text("DELETE FROM ofertas_proveedor_history WHERE UPPER(nombre_proveedor) LIKE '%ROJAS%' OR UPPER(nombre_proveedor) LIKE '%JORGE%' OR UPPER(ruc_proveedor) = '10408899991';"))
            else:
                db.execute(text("DELETE FROM ofertas_proveedor_history WHERE UPPER(nombre_proveedor) LIKE UPPER(:prov);"), {"prov": f"%{proveedor}%"})
        else:
            db.execute(text("TRUNCATE TABLE ofertas_proveedor_history RESTART IDENTITY;"))
        db.commit()
        return {"success": True, "message": "Datos de ofertas limpiados con éxito"}
    except Exception as e:
        db.rollback()
        return {"success": False, "error": str(e)}

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
def get_categories_count(
    proveedor: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Devuelve el conteo de ofertas distribuidas exactamente por las 14 categorías oficiales de Perú Compras."""
    prov_where = ""
    params = {}
    if proveedor and proveedor.lower() != "all":
        prov_l = proveedor.lower()
        if prov_l in ("thekingcomputer", "king"):
            prov_where = " AND (UPPER(nombre_proveedor) LIKE '%KING%' OR UPPER(ruc_proveedor) = '20601234567')"
        elif prov_l in ("jorge_rojas", "jorge", "rojas"):
            prov_where = " AND (UPPER(nombre_proveedor) LIKE '%ROJAS%' OR UPPER(nombre_proveedor) LIKE '%JORGE%' OR UPPER(ruc_proveedor) = '10408899991')"
        else:
            prov_where = " AND UPPER(nombre_proveedor) LIKE UPPER(:prov)"
            params["prov"] = f"%{proveedor}%"

    try:
        total = db.execute(text(f"SELECT COUNT(*) FROM ofertas_proveedor_history WHERE 1=1 {prov_where};"), params).scalar() or 0
        
        # 1. COMPUTADORAS DE ESCRITORIO (Catálogo 252 - 8 categorías)
        escritorio = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where}
              AND (
                UPPER(categoria) = 'COMPUTADORA DE ESCRITORIO'
                OR (
                    (UPPER(categoria) LIKE '%ESCRITORIO%' OR UPPER(descripcion_producto) LIKE '%ESCRITORIO%')
                    AND UPPER(categoria) NOT LIKE '%TODO EN UNO%'
                    AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%'
                    AND UPPER(descripcion_producto) NOT LIKE '%ALL IN ONE%'
                    AND UPPER(descripcion_producto) NOT LIKE '%PORTATIL%'
                    AND UPPER(descripcion_producto) NOT LIKE '%PORTÁTIL%'
                )
              );
        """), params).scalar() or 0

        aio = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where}
              AND (
                UPPER(categoria) LIKE '%TODO EN UNO%' 
                OR UPPER(descripcion_producto) LIKE '%TODO EN UNO%' 
                OR UPPER(descripcion_producto) LIKE '%ALL IN ONE%'
              );
        """), params).scalar() or 0

        workstation = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where}
              AND UPPER(categoria) = 'ESTACION DE TRABAJO'
              AND UPPER(categoria) NOT LIKE '%PORTATIL%';
        """), params).scalar() or 0

        monitor = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where}
              AND (UPPER(categoria) = 'MONITOR' OR (UPPER(descripcion_producto) LIKE 'MONITOR%' AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%'));
        """), params).scalar() or 0

        pantalla_pub = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where} AND UPPER(categoria) LIKE '%PANTALLA PUBLICITARIA%';
        """), params).scalar() or 0

        pantalla_int = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where} AND UPPER(categoria) LIKE '%PANTALLA INTERACTIVA%';
        """), params).scalar() or 0

        almacenamiento_int = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where} AND UPPER(categoria) LIKE '%ALMACENAMIENTO INTERNO%';
        """), params).scalar() or 0

        almacenamiento_ext = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where} AND UPPER(categoria) LIKE '%ALMACENAMIENTO EXTERNO%';
        """), params).scalar() or 0

        # 2. COMPUTADORAS PORTÁTILES (Catálogo 250 - 3 categorías)
        portatil = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where}
              AND (
                UPPER(categoria) = 'COMPUTADORA PORTATIL'
                OR (
                    (UPPER(categoria) LIKE '%PORTATIL%' OR UPPER(descripcion_producto) LIKE '%PORTATIL%' OR UPPER(descripcion_producto) LIKE '%LAPTOP%')
                    AND UPPER(categoria) NOT LIKE '%ESTACION%'
                    AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%'
                )
              );
        """), params).scalar() or 0

        workstation_portatil = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where}
              AND (UPPER(categoria) LIKE '%ESTACION DE TRABAJO PORTATIL%' OR UPPER(descripcion_producto) LIKE '%WORKSTATION PORTATIL%');
        """), params).scalar() or 0

        tableta = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where}
              AND (UPPER(categoria) LIKE '%TABLET%' OR UPPER(descripcion_producto) LIKE '%TABLETA%');
        """), params).scalar() or 0

        # 3. ESCÁNERES (Catálogo 251 - 3 categorías)
        escaner_planos = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where} AND UPPER(categoria) LIKE '%ESCANER DE PLANOS%';
        """), params).scalar() or 0

        escaner_docs = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where} AND (UPPER(categoria) LIKE '%ESCANER DE DOCUMENTOS%' OR (UPPER(catalogo) LIKE '%ESCANER%' AND UPPER(categoria) NOT LIKE '%PLANOS%' AND UPPER(categoria) NOT LIKE '%LIBROS%'));
        """), params).scalar() or 0

        escaner_libros = db.execute(text(f"""
            SELECT COUNT(*) FROM ofertas_proveedor_history 
            WHERE 1=1 {prov_where} AND UPPER(categoria) LIKE '%ESCANER DE LIBROS%';
        """), params).scalar() or 0

        return {
            "total": total,
            "escritorio": escritorio,
            "aio": aio,
            "workstation": workstation,
            "monitor": monitor,
            "pantalla_pub": pantalla_pub,
            "pantalla_int": pantalla_int,
            "almacenamiento_int": almacenamiento_int,
            "almacenamiento_ext": almacenamiento_ext,
            "portatil": portatil,
            "workstation_portatil": workstation_portatil,
            "tableta": tableta,
            "escaner_planos": escaner_planos,
            "escaner_docs": escaner_docs,
            "escaner_libros": escaner_libros
        }
    except Exception as e:
        return {
            "total": 0, "escritorio": 0, "aio": 0, "workstation": 0, "monitor": 0,
            "pantalla_pub": 0, "pantalla_int": 0, "almacenamiento_int": 0, "almacenamiento_ext": 0,
            "portatil": 0, "workstation_portatil": 0, "tableta": 0,
            "escaner_planos": 0, "escaner_docs": 0, "escaner_libros": 0, "error": str(e)
        }

@router.post("/reclassify")
def reclassify_existing_offers(db: Session = Depends(get_db)):
    """Reclasifica en lote todas las ofertas existentes analizando su descripción."""
    try:
        db.execute(text("""
            -- Limpieza preventiva de duplicados antes de actualizar clasificaciones
            DELETE FROM ofertas_proveedor_history a
            USING ofertas_proveedor_history b
            WHERE a.id < b.id 
              AND a.nro_parte = b.nro_parte 
              AND a.ruc_proveedor = b.ruc_proveedor 
              AND COALESCE(a.region, 'N/A') = COALESCE(b.region, 'N/A');

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
    proveedor: str = Query("thekingcomputer", description="ID del proveedor a extraer: thekingcomputer, jorge_rojas")
):
    """
    Inicia la extracción en segundo plano para la cuenta del proveedor especificado.
    """
    from app.services.proveedores_scraper import PROVEEDORES_CONFIG, run_worker_pool_extraction
    from app.db.database import SessionLocal
    prov_nombre = PROVEEDORES_CONFIG.get(proveedor, {}).get("nombre", proveedor)

    async def _async_task():
        with SessionLocal() as db_session:
            await run_worker_pool_extraction([], db_session, provider_key=proveedor)

    background_tasks.add_task(_async_task)
    return {
        "message": f"Worker Pool de extracción iniciado para '{prov_nombre}'",
        "proveedor": proveedor,
        "nombre": prov_nombre
    }

@router.post("/scrape-plazos")
async def trigger_scrape_plazos(
    background_tasks: BackgroundTasks,
    proveedor: str = Query("thekingcomputer", description="ID del proveedor: thekingcomputer, jorge_rojas"),
    regiones: Optional[str] = Query(None, description="Regiones separadas por coma (ej: LIMA,AREQUIPA) o vacío para todas")
):
    """
    Inicia la extracción regional de plazos de entrega en segundo plano.
    """
    from app.services.proveedores_scraper import async_extract_plazos_regionales, PROVEEDORES_CONFIG
    from app.db.database import SessionLocal
    prov_nombre = PROVEEDORES_CONFIG.get(proveedor, {}).get("nombre", proveedor)
    target_regs = [r.strip().upper() for r in regiones.split(",")] if regiones else None

    async def _async_plazos_task():
        with SessionLocal() as db_session:
            await async_extract_plazos_regionales(provider_key=proveedor, regiones=target_regs, db=db_session)

    background_tasks.add_task(_async_plazos_task)
    return {
        "message": f"Extracción regional de plazos iniciada para '{prov_nombre}'",
        "proveedor": proveedor,
        "regiones": target_regs or "TODAS (25 Regiones)"
    }

@router.get("/scrape-status")
def get_scrape_status():
    from app.services.proveedores_scraper import EXTRACTION_STATUS
    return EXTRACTION_STATUS
