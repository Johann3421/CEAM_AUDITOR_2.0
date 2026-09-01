import json
import re
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, List, Dict

from app.db.database import get_db
from app.services.proveedores_scraper import run_worker_pool_extraction, fetch_single_combo

router = APIRouter(prefix="/proveedores", tags=["proveedores"])

def _get_fichas_pdf_join(db: Session):
    """
    Returns (join_sql, select_expr, ord_min_expr, fec_min_expr, pref_expr, pmin_expr, momin_expr) 
    to link PDF and historical order/price data from fichas_producto by nro_parte.
    """
    fallback = ("", "f.pdf_url", "NULL::text", "NULL::text", "NULL::numeric", "NULL::numeric", "NULL::numeric")
    try:
        rows = db.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'fichas_producto'"
        )).fetchall()
        cols = [r[0] for r in rows]
        if not cols:
            return fallback
            
        col_set = set(cols)
        
        # 1. Detect nro_parte column
        nro_col = next((c for c in [
            "nro_parte_o_código_único_de_identificación",
            "nro_parte_o_cdigo_nico_de_identificacin",
            "nro_parte", "codigo_ficha", "cod_ficha", "codigo"
        ] if c in col_set), None)
        if not nro_col:
            nro_col = next((c for c in cols if 'parte' in c.lower() or 'codigo' in c.lower()), None)
            
        # 2. Detect pdf column
        pdf_col = next((c for c in [
            "ficha_técnica", "ficha_tcnica", "ficha_tecnica", "url_pdf", "pdf_url"
        ] if c in col_set), None)
        if not pdf_col:
            pdf_col = next((c for c in cols if 'pdf' in c.lower() or 'ficha' in c.lower() or 'url' in c.lower()), None)
            
        if nro_col:
            pdf_select_field = f'fp."{pdf_col}" AS _linked_pdf,' if pdf_col else "NULL::text AS _linked_pdf,"
            ord_min_field = 'fp.orden_min AS _linked_orden_min,' if 'orden_min' in col_set else "NULL::text AS _linked_orden_min,"
            fec_min_field = 'fp.fecha_orden_min::text AS _linked_fecha_orden_min,' if 'fecha_orden_min' in col_set else "NULL::text AS _linked_fecha_orden_min,"
            pref_field = 'fp.precio_referencia AS _linked_precio_ref,' if 'precio_referencia' in col_set else "NULL::numeric AS _linked_precio_ref,"
            pmin_field = 'fp.precio_min AS _linked_precio_min,' if 'precio_min' in col_set else "NULL::numeric AS _linked_precio_min,"
            momin_field = 'fp.monto_orden_min AS _linked_monto_orden_min' if 'monto_orden_min' in col_set else "NULL::numeric AS _linked_monto_orden_min"

            order_by_extra = f', fp."{pdf_col}" DESC NULLS LAST' if pdf_col else ''
            join_sql = f"""
                LEFT JOIN (
                    SELECT DISTINCT ON (UPPER(TRIM(fp."{nro_col}")))
                        UPPER(TRIM(fp."{nro_col}")) AS _match_nro,
                        {pdf_select_field}
                        {ord_min_field}
                        {fec_min_field}
                        {pref_field}
                        {pmin_field}
                        {momin_field}
                    FROM fichas_producto fp
                    WHERE fp."{nro_col}" IS NOT NULL AND fp."{nro_col}" != ''
                    ORDER BY 
                        UPPER(TRIM(fp."{nro_col}")),
                        (fp.orden_min IS NOT NULL AND fp.orden_min != '') DESC,
                        (fp.precio_min IS NOT NULL) DESC,
                        fp.precio_min ASC NULLS LAST
                        {order_by_extra}
                ) fp_pdf ON UPPER(TRIM(f.nro_parte)) = fp_pdf._match_nro
            """
            select_expr = "COALESCE(NULLIF(NULLIF(f.pdf_url, ''), '#'), fp_pdf._linked_pdf)" if pdf_col else "f.pdf_url"
            return (
                join_sql,
                select_expr,
                "fp_pdf._linked_orden_min",
                "fp_pdf._linked_fecha_orden_min",
                "fp_pdf._linked_precio_ref",
                "fp_pdf._linked_precio_min",
                "fp_pdf._linked_monto_orden_min"
            )
    except Exception:
        pass
        
    return fallback


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
    pdf_filter: Optional[str] = Query(None, description="Filtro de PDF: 'with_pdf' o 'no_pdf'"),
    sort_by: Optional[str] = Query(None, description="Ordenamiento: precio_asc, precio_desc, stock_desc, marca_asc"),
    cpu: Optional[str] = Query(None, description="Filtro de CPU"),
    ram: Optional[str] = Query(None, description="Filtro de Memoria RAM"),
    disco: Optional[str] = Query(None, description="Filtro de Disco / Almacenamiento"),
    pantalla: Optional[str] = Query(None, description="Filtro de Pantalla en pulgadas"),
    so: Optional[str] = Query(None, description="Filtro de Sistema Operativo"),
    panel: Optional[str] = Query(None, description="Filtro de Tipo de Panel (IPS, VA, etc.)"),
    resolucion: Optional[str] = Query(None, description="Filtro de Resolución"),
    cpu_gen: Optional[str] = Query(None, description="Filtro de Generación CPU: gen14, gen13, gen12, gen11, gen10, ultra, ryzen7000, ryzen5000"),
    ram_tech: Optional[str] = Query(None, description="Filtro de Tecnología RAM: DDR4, DDR5, LPDDR5"),
    disco_tipo: Optional[str] = Query(None, description="Filtro de Tipo de Disco: NVMe, M.2, hibrido, solo_ssd, solo_hdd"),
    vga: Optional[str] = Query(None, description="Filtro de Puerto VGA: si, no"),
    hdmi: Optional[str] = Query(None, description="Filtro de Puerto HDMI: si, no"),
    wifi: Optional[str] = Query(None, description="Filtro de Wi-Fi / WLAN: si, no"),
    bluetooth: Optional[str] = Query(None, description="Filtro de Bluetooth: si, no"),
    lan: Optional[str] = Query(None, description="Filtro de Puerto de Red LAN: si, no"),
    office: Optional[str] = Query(None, description="Filtro de Suite Ofimática: home_business, si, no"),
    garantia: Optional[str] = Query(None, description="Filtro de Garantía: 36, 24, 12"),
    unidad_optica: Optional[str] = Query(None, description="Filtro de Unidad Óptica: si, no"),
    camara: Optional[str] = Query(None, description="Filtro de Cámara Web: si, no"),
    tactil: Optional[str] = Query(None, description="Filtro de Pantalla Táctil: si, no"),
    con_orden: Optional[bool] = Query(None, description="Filtrar solo fichas con orden de compra registrada"),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=5000),
    db: Session = Depends(get_db)
):
    """
    Lista las fichas y ofertas por proveedor con soporte para filtros por columna, región y ordenamiento tipo Excel.
    """
    offset = (page - 1) * limit
    params = {}
    where_clauses = ["1=1"]

    pdf_join, pdf_select, ord_min_expr, fec_min_expr, pref_expr, pmin_expr, momin_expr = _get_fichas_pdf_join(db)

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
                UPPER(f.categoria) LIKE '%MONITOR%'
                OR UPPER(f.descripcion_producto) LIKE 'MONITOR%'
                OR UPPER(f.descripcion_producto) LIKE '%MONITOR LED%'
                OR UPPER(f.descripcion_producto) LIKE '%MONITOR GAMER%'
            )""")
        elif categ_lower in ("pantalla_pub", "pantalla publicitaria"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%PUBLICITARIA%' OR UPPER(f.descripcion_producto) LIKE '%PUBLICITARIA%')")
        elif categ_lower in ("pantalla_int", "pantalla interactiva"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%INTERACTIVA%' OR UPPER(f.descripcion_producto) LIKE '%INTERACTIVA%')")
        elif categ_lower in ("almacenamiento_int", "almacenamiento interno"):
            where_clauses.append("""(
                UPPER(f.categoria) LIKE '%INTERNO%'
                OR (UPPER(f.catalogo) LIKE '%ALMACENAMIENTO%' AND UPPER(f.descripcion_producto) NOT LIKE '%EXTERNO%')
            )""")
        elif categ_lower in ("almacenamiento_ext", "almacenamiento externo"):
            where_clauses.append("""(
                UPPER(f.categoria) LIKE '%EXTERNO%'
                OR UPPER(f.descripcion_producto) LIKE '%EXTERNO%'
            )""")
        elif categ_lower in ("portatil", "computadora portatil", "laptop"):
            where_clauses.append("""(
                (UPPER(f.categoria) LIKE '%PORTATIL%' OR UPPER(f.categoria) LIKE '%PORTÁTIL%' OR UPPER(f.descripcion_producto) LIKE '%PORTATIL%' OR UPPER(f.descripcion_producto) LIKE '%LAPTOP%')
                AND UPPER(f.categoria) NOT LIKE '%TODO EN UNO%'
                AND UPPER(f.categoria) NOT LIKE '%ESTACION%'
            )""")
        elif categ_lower in ("workstation_portatil", "estacion de trabajo portatil"):
            where_clauses.append("""(
                (UPPER(f.categoria) LIKE '%ESTACION DE TRABAJO%' OR UPPER(f.descripcion_producto) LIKE '%WORKSTATION%')
                AND (UPPER(f.categoria) LIKE '%PORTATIL%' OR UPPER(f.descripcion_producto) LIKE '%PORTATIL%' OR UPPER(f.descripcion_producto) LIKE '%LAPTOP%')
            )""")
        elif categ_lower in ("tableta", "tablet"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%TABLET%' OR UPPER(f.descripcion_producto) LIKE '%TABLET%')")
        elif categ_lower in ("escaner_docs", "escaner de documentos"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%DOCUMENTOS%' OR (UPPER(f.catalogo) LIKE '%ESCANER%' AND UPPER(f.descripcion_producto) NOT LIKE '%PLANO%'))")
        elif categ_lower in ("escaner_planos", "escaner de planos"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%PLANO%' OR UPPER(f.descripcion_producto) LIKE '%PLANO%')")
        elif categ_lower in ("escaner_libros", "escaner de libros"):
            where_clauses.append("(UPPER(f.categoria) LIKE '%LIBRO%' OR UPPER(f.descripcion_producto) LIKE '%LIBRO%')")
        else:
            where_clauses.append("(UPPER(f.categoria) LIKE UPPER(:categoria) OR UPPER(f.catalogo) LIKE UPPER(:categoria) OR UPPER(f.descripcion_producto) LIKE UPPER(:categoria))")
            params["categoria"] = f"%{categoria}%"

    if stock_filter == "with_stock":
        where_clauses.append("f.existencia_stock > 0")
    elif stock_filter == "zero_stock":
        where_clauses.append("(f.existencia_stock IS NULL OR f.existencia_stock = 0)")

    if pdf_filter:
        pdf_l = pdf_filter.lower().strip()
        if pdf_l in ("with_pdf", "con_pdf", "pdf", "1", "true"):
            where_clauses.append(f"({pdf_select} IS NOT NULL AND {pdf_select} != '' AND {pdf_select} != '#')")
        elif pdf_l in ("no_pdf", "sin_pdf", "0", "false"):
            where_clauses.append(f"({pdf_select} IS NULL OR {pdf_select} = '' OR {pdf_select} = '#')")

    if con_orden:
        where_clauses.append(f"({ord_min_expr} IS NOT NULL AND {ord_min_expr} != '')")

    # ── Filtros de Características Técnicas por Componente ───────────────
    if cpu and cpu != 'Todos':
        cpu_u = cpu.upper().strip()
        if 'I9' in cpu_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%I9%' OR UPPER(f.descripcion_producto) LIKE '%CORE I9%')")
        elif 'I7' in cpu_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%I7%' OR UPPER(f.descripcion_producto) LIKE '%CORE I7%')")
        elif 'I5' in cpu_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%I5%' OR UPPER(f.descripcion_producto) LIKE '%CORE I5%')")
        elif 'I3' in cpu_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%I3%' OR UPPER(f.descripcion_producto) LIKE '%CORE I3%')")
        elif 'RYZEN 9' in cpu_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%RYZEN 9%'")
        elif 'RYZEN 7' in cpu_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%RYZEN 7%'")
        elif 'RYZEN 5' in cpu_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%RYZEN 5%'")
        elif 'RYZEN 3' in cpu_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%RYZEN 3%'")
        elif 'CELERON' in cpu_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%CELERON%'")
        elif 'XEON' in cpu_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%XEON%'")
        elif 'PENTIUM' in cpu_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%PENTIUM%'")
        else:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE :cpu_filter")
            params["cpu_filter"] = f"%{cpu}%"

    if ram and ram != 'Todos':
        m_ram = re.search(r'\b(\d+)\s*GB\b', ram, re.I)
        if m_ram:
            val = m_ram.group(1)
            where_clauses.append(f"(UPPER(f.descripcion_producto) LIKE '%{val} GB%' OR UPPER(f.descripcion_producto) LIKE '%{val}GB%')")
        else:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE :ram_filter")
            params["ram_filter"] = f"%{ram}%"

    if disco and disco != 'Todos':
        disco_u = disco.upper().strip()
        if '128' in disco_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%128%GB%' OR UPPER(f.descripcion_producto) LIKE '%128GB%')")
        elif '256' in disco_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%256%GB%' OR UPPER(f.descripcion_producto) LIKE '%256GB%')")
        elif '512' in disco_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%512%GB%' OR UPPER(f.descripcion_producto) LIKE '%512GB%')")
        elif '1 TB' in disco_u or '1TB' in disco_u:
            if 'HDD' in disco_u:
                where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%1%TB%' AND UPPER(f.descripcion_producto) LIKE '%HDD%')")
            else:
                where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%1%TB%' AND UPPER(f.descripcion_producto) NOT LIKE '%HDD%')")
        elif '2 TB' in disco_u or '2TB' in disco_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%2%TB%')")
        else:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE :disco_filter")
            params["disco_filter"] = f"%{disco}%"

    if pantalla and pantalla != 'Todos':
        m_pan = re.search(r'(\d+(?:\.\d+)?)', pantalla)
        if m_pan:
            val = m_pan.group(1)
            where_clauses.append(f"(UPPER(f.descripcion_producto) LIKE '%{val}\"%' OR UPPER(f.descripcion_producto) LIKE '%{val} PULG%' OR UPPER(f.descripcion_producto) LIKE '%{val}PULG%' OR UPPER(f.descripcion_producto) LIKE '%{val} %')")
        elif pantalla == 'Sin pantalla':
            where_clauses.append("UPPER(f.descripcion_producto) NOT LIKE '%PANTALLA%'")

    if so and so != 'Todos':
        so_u = so.upper()
        if '11 PRO' in so_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%W11 PRO%' OR UPPER(f.descripcion_producto) LIKE '%W11P%' OR UPPER(f.descripcion_producto) LIKE '%WIN 11 PRO%' OR UPPER(f.descripcion_producto) LIKE '%WINDOWS 11 PRO%')")
        elif '11 HOME' in so_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%W11 HOME%' OR UPPER(f.descripcion_producto) LIKE '%W11H%' OR UPPER(f.descripcion_producto) LIKE '%WIN 11 HOME%' OR UPPER(f.descripcion_producto) LIKE '%WINDOWS 11 HOME%')")
        elif '10' in so_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%W10%' OR UPPER(f.descripcion_producto) LIKE '%WINDOWS 10%')")
        elif 'FREE' in so_u or 'DOS' in so_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%FREEDOS%' OR UPPER(f.descripcion_producto) LIKE '%FREE DOS%' OR UPPER(f.descripcion_producto) LIKE '%NO TIENE%')")
        elif 'LINUX' in so_u or 'UBUNTU' in so_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%UBUNTU%' OR UPPER(f.descripcion_producto) LIKE '%LINUX%')")

    if panel and panel != 'Todos':
        panel_u = panel.upper().strip()
        if panel_u == 'IPS':
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%IPS%'")
        elif panel_u == 'VA':
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '% VA %' OR UPPER(f.descripcion_producto) LIKE '%VA-%' OR UPPER(f.descripcion_producto) LIKE 'VA %')")
        elif panel_u == 'TN':
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '% TN %' OR UPPER(f.descripcion_producto) LIKE 'TN %')")
        elif panel_u == 'OLED':
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%OLED%'")

    if resolucion and resolucion != 'Todos':
        res_u = resolucion.upper()
        if '4K' in res_u or '3840' in res_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%3840X2160%' OR UPPER(f.descripcion_producto) LIKE '%4K%')")
        elif '2K' in res_u or '2560' in res_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%2560X1440%' OR UPPER(f.descripcion_producto) LIKE '%2K%')")
        elif 'FHD' in res_u or '1920' in res_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%1920X1080%' OR UPPER(f.descripcion_producto) LIKE '%FHD%' OR UPPER(f.descripcion_producto) LIKE '%FULL HD%')")
        elif '1600' in res_u or 'HD+' in res_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%1600X900%' OR UPPER(f.descripcion_producto) LIKE '%HD+%')")
        elif 'HD' in res_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%1366X768%' OR UPPER(f.descripcion_producto) LIKE '%HD%')")

    # ── Puertos y Conectividad (VGA, HDMI, WLAN, LAN, BT) ───────────────
    if vga and vga != 'Todos':
        vga_l = vga.lower()
        if vga_l in ('si', 'con_vga', '1', 'true'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%VGA: SI%'")
        elif vga_l in ('no', 'sin_vga', '0', 'false'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%VGA: NO%'")

    if hdmi and hdmi != 'Todos':
        hdmi_l = hdmi.lower()
        if hdmi_l in ('si', 'con_hdmi', '1', 'true'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%HDMI: SI%'")
        elif hdmi_l in ('no', 'sin_hdmi', '0', 'false'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%HDMI: NO%'")

    if wifi and wifi != 'Todos':
        wifi_l = wifi.lower()
        if wifi_l in ('si', 'con_wifi', '1', 'true'):
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%WLAN: SI%' OR UPPER(f.descripcion_producto) LIKE '%WI-FI%')")
        elif wifi_l in ('no', 'sin_wifi', '0', 'false'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%WLAN: NO%'")

    if bluetooth and bluetooth != 'Todos':
        bt_l = bluetooth.lower()
        if bt_l in ('si', 'con_bt', '1', 'true'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%BLUETOOTH: SI%'")
        elif bt_l in ('no', 'sin_bt', '0', 'false'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%BLUETOOTH: NO%'")

    if lan and lan != 'Todos':
        lan_l = lan.lower()
        if lan_l in ('si', 'con_lan', '1', 'true'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%LAN: SI%'")
        elif lan_l in ('no', 'sin_lan', '0', 'false'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%LAN: NO%'")

    if unidad_optica and unidad_optica != 'Todos':
        uo_l = unidad_optica.lower()
        if uo_l in ('si', 'con_dvd', '1', 'true'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%UNIDAD OPTICA: SI%'")
        elif uo_l in ('no', 'sin_dvd', '0', 'false'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%UNIDAD OPTICA: NO%'")

    if camara and camara != 'Todos':
        cam_l = camara.lower()
        if cam_l in ('si', 'con_camara', '1', 'true'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%CAMARA WEB: SI%'")
        elif cam_l in ('no', 'sin_camara', '0', 'false'):
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%CAMARA WEB: NO%'")

    if tactil and tactil != 'Todos':
        tac_l = tactil.lower()
        if tac_l in ('si', 'tactil', 'touch', '1', 'true'):
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%TACTIL%' OR UPPER(f.descripcion_producto) LIKE '%TOUCH%')")
        elif tac_l in ('no', 'no_tactil', '0', 'false'):
            where_clauses.append("(UPPER(f.descripcion_producto) NOT LIKE '%TACTIL%' AND UPPER(f.descripcion_producto) NOT LIKE '%TOUCH%')")

    # ── Tecnologías Específicas de RAM y Disco ───────────────────────────
    if ram_tech and ram_tech != 'Todos':
        rt_u = ram_tech.upper()
        if rt_u == 'DDR5':
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%DDR5%'")
        elif rt_u == 'DDR4':
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%DDR4%'")
        elif 'LPDDR' in rt_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%LPDDR5%' OR UPPER(f.descripcion_producto) LIKE '%LPDDR4%')")

    if disco_tipo and disco_tipo != 'Todos':
        dt_u = disco_tipo.upper()
        if 'NVME' in dt_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%NVME%'")
        elif 'M.2' in dt_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%M.2%'")
        elif 'HIBRIDO' in dt_u or 'SSD + HDD' in dt_u or 'SSD/HDD' in dt_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%SSD%' AND UPPER(f.descripcion_producto) LIKE '%HDD%')")
        elif 'SOLO SSD' in dt_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%SSD%' AND UPPER(f.descripcion_producto) NOT LIKE '%HDD%')")
        elif 'SOLO HDD' in dt_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%HDD%' AND UPPER(f.descripcion_producto) NOT LIKE '%SSD%')")

    # ── Generación de CPU ────────────────────────────────────────────────
    if cpu_gen and cpu_gen != 'Todos':
        cg_u = cpu_gen.upper()
        if '14' in cg_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%-14%' OR UPPER(f.descripcion_producto) LIKE '% 14700%' OR UPPER(f.descripcion_producto) LIKE '% 14400%' OR UPPER(f.descripcion_producto) LIKE '% 14900%')")
        elif '13' in cg_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%-13%' OR UPPER(f.descripcion_producto) LIKE '% 13700%' OR UPPER(f.descripcion_producto) LIKE '% 13400%' OR UPPER(f.descripcion_producto) LIKE '% 13500%')")
        elif '12' in cg_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%-12%' OR UPPER(f.descripcion_producto) LIKE '% 12700%' OR UPPER(f.descripcion_producto) LIKE '% 12400%' OR UPPER(f.descripcion_producto) LIKE '% 12100%')")
        elif '11' in cg_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%-11%' OR UPPER(f.descripcion_producto) LIKE '% 11700%' OR UPPER(f.descripcion_producto) LIKE '% 11400%')")
        elif '10' in cg_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%-10%' OR UPPER(f.descripcion_producto) LIKE '% 10700%' OR UPPER(f.descripcion_producto) LIKE '% 10400%')")
        elif 'ULTRA' in cg_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%CORE ULTRA%'")
        elif '7000' in cg_u or '8000' in cg_u:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%RYZEN%7%' OR UPPER(f.descripcion_producto) LIKE '%RYZEN%8%')")
        elif '5000' in cg_u:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%RYZEN%5%'")

    # ── Office y Garantía ────────────────────────────────────────────────
    if office and office != 'Todos':
        off_l = office.lower()
        if 'home' in off_l or 'business' in off_l:
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%OFFICE HOME & BUSINESS%' OR UPPER(f.descripcion_producto) LIKE '%OFFICE HOME AND BUSINESS%')")
        elif off_l in ('si', 'con_office', '1', 'true'):
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%OFFICE%' OR UPPER(f.descripcion_producto) LIKE '%OFIMATICA PRE-INSTALADA%')")
        elif off_l in ('no', 'sin_office', '0', 'false'):
            where_clauses.append("(UPPER(f.descripcion_producto) LIKE '%SUITE OFIMATICA: NO%' OR (UPPER(f.descripcion_producto) NOT LIKE '%OFFICE%' AND UPPER(f.descripcion_producto) NOT LIKE '%PRE-INSTALADA%'))")

    if garantia and garantia != 'Todos':
        if '36' in garantia:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%36 MESES%'")
        elif '24' in garantia:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%24 MESES%'")
        elif '12' in garantia:
            where_clauses.append("UPPER(f.descripcion_producto) LIKE '%12 MESES%'")

    where_sql = " AND ".join(where_clauses)
    is_consolidated = (not proveedor or proveedor.lower() == "all")

    selected_reg = region.strip().upper() if (region and region.lower() != "all") else None
    if selected_reg:
        import unicodedata
        n = unicodedata.normalize('NFKD', selected_reg)
        selected_reg = ''.join(c for c in n if not unicodedata.combining(c))
        params["selected_reg"] = selected_reg
        plazo_expr = "COALESCE((f.raw_json->'plazos_por_region'->>:selected_reg)::int, (f.raw_json->'plazos_por_region'->>'LIMA')::int, f.plazo_entrega_dias, 90)"
    else:
        plazo_expr = "COALESCE((f.raw_json->'plazos_por_region'->>'LIMA')::int, f.plazo_entrega_dias, 90)"

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

        order_by_sql = "g.id DESC, g.group_key ASC"
        if sort_by == "precio_asc":
            order_by_sql = "g.min_precio ASC NULLS LAST, g.group_key ASC"
        elif sort_by == "precio_desc":
            order_by_sql = "g.min_precio DESC NULLS LAST, g.group_key ASC"
        elif sort_by == "stock_desc":
            order_by_sql = "g.existencia_stock DESC NULLS LAST, g.group_key ASC"
        elif sort_by == "marca_asc":
            order_by_sql = "g.marca ASC, g.group_key ASC"

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
                    {pdf_select} AS pdf_url,
                    f.fecha_extraccion,
                    {ord_min_expr} AS orden_min,
                    {fec_min_expr} AS fecha_orden_min,
                    {pref_expr} AS precio_referencia,
                    {pmin_expr} AS precio_historico_min,
                    {momin_expr} AS monto_orden_min,
                    CASE 
                        WHEN UPPER(TRIM(COALESCE(f.nro_parte, ''))) IN ('', '-', 'S/N', 'SN', 'COLECTIVO', 'VARIOS', '0', 'NO TIENE', 'SIN NUMERO', 'SIN NUMERO DE PARTE', 'NO APLICA') 
                        THEN CONCAT(COALESCE(NULLIF(TRIM(f.nro_parte), ''), 'S/N'), '::', MD5(COALESCE(f.descripcion_producto, f.id::text)))
                        ELSE UPPER(TRIM(f.nro_parte))
                    END AS group_key
                FROM ofertas_proveedor_history f
                {pdf_join}
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
                    r.fecha_extraccion,
                    r.orden_min,
                    r.fecha_orden_min,
                    r.precio_referencia,
                    r.precio_historico_min,
                    r.monto_orden_min
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
                    MAX(r.pdf_url) AS pdf_url,
                    MAX(r.orden_min) AS orden_min,
                    MAX(r.fecha_orden_min) AS fecha_orden_min,
                    MAX(r.precio_referencia) AS precio_referencia,
                    MAX(r.precio_historico_min) AS precio_historico_min,
                    MAX(r.monto_orden_min) AS monto_orden_min,
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
                g.pdf_url,
                g.orden_min,
                g.fecha_orden_min,
                g.precio_referencia,
                g.precio_historico_min,
                g.monto_orden_min,
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
                {pdf_select} AS pdf_url,
                {ord_min_expr} AS orden_min,
                {fec_min_expr} AS fecha_orden_min,
                {pref_expr} AS precio_referencia,
                {pmin_expr} AS precio_historico_min,
                {momin_expr} AS monto_orden_min,
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
                    'pdf_url', {pdf_select},
                    'estado', 'VIGENTE',
                    'fecha_extraccion', f.fecha_extraccion::text
                )) AS ofertas,
                COUNT(*) OVER() AS total_count
            FROM ofertas_proveedor_history f
            {pdf_join}
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
    solo_plazos: bool = Query(False),
    db: Session = Depends(get_db)
):
    """Limpia las ofertas de la base de datos para comenzar de nuevo una extracción limpia."""
    try:
        if solo_plazos:
            # Solo resetear plazos sin borrar ofertas
            where = ""
            params = {}
            if proveedor and proveedor.lower() != "all":
                prov_l = proveedor.lower()
                if prov_l in ("thekingcomputer", "king"):
                    where = "WHERE UPPER(nombre_proveedor) LIKE '%KING%' OR UPPER(ruc_proveedor) = '20601234567'"
                elif prov_l in ("jorge_rojas", "jorge", "rojas"):
                    where = "WHERE UPPER(nombre_proveedor) LIKE '%ROJAS%' OR UPPER(ruc_proveedor) = '10408899991'"
                else:
                    where = "WHERE UPPER(nombre_proveedor) LIKE UPPER(:prov)"
                    params = {"prov": f"%{proveedor}%"}
            db.execute(text(f"""
                UPDATE ofertas_proveedor_history
                SET plazo_entrega_dias = NULL,
                    raw_json = CASE
                        WHEN raw_json IS NOT NULL THEN (raw_json::jsonb - 'plazos_por_region')::json
                        ELSE NULL
                    END
                {where}
            """), params)
            db.commit()
            return {"success": True, "message": "Plazos de entrega limpiados con éxito (ofertas conservadas)"}

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
    proveedor: str = Query("thekingcomputer", description="ID del proveedor: thekingcomputer, jorge_rojas, all"),
    regiones: Optional[str] = Query(None, description="Regiones separadas por coma (ej: LIMA,AREQUIPA) o vacío para todas")
):
    """
    Inicia la extracción regional de plazos de entrega en segundo plano.
    """
    from app.services.proveedores_scraper import async_extract_plazos_regionales, PROVEEDORES_CONFIG
    from app.db.database import SessionLocal
    if regiones and regiones.strip().lower() in ("all", "todas", "global", "none", "null"):
        target_regs = None
    elif regiones:
        target_regs = [r.strip().upper() for r in regiones.split(",") if r.strip()]
    else:
        target_regs = None

    async def _async_plazos_task():
        with SessionLocal() as db_session:
            if proveedor in ("all", "ambos", "todos"):
                for p_key in ("thekingcomputer", "jorge_rojas"):
                    await async_extract_plazos_regionales(provider_key=p_key, regiones=target_regs, db=db_session)
            else:
                await async_extract_plazos_regionales(provider_key=proveedor, regiones=target_regs, db=db_session)

    background_tasks.add_task(_async_plazos_task)
    prov_desc = "Ambos Proveedores (The King y Jorge Rojas)" if proveedor in ("all", "ambos", "todos") else PROVEEDORES_CONFIG.get(proveedor, {}).get("nombre", proveedor)
    return {
        "message": f"Extracción regional de plazos iniciada para '{prov_desc}'",
        "proveedor": proveedor,
        "regiones": target_regs or "TODAS (25 Regiones)"
    }

@router.get("/scrape-status")
def get_scrape_status():
    from app.services.proveedores_scraper import EXTRACTION_STATUS
    return EXTRACTION_STATUS
