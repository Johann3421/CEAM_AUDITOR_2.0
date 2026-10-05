"""
API B2B para Integración Server-to-Server
Proyecto: CEAM AUDITOR 2.0 -> Ensamblador KENYA ERP / Sistemas Externos
Provee:
1. GET /api/v1/integracion/fichas/top-desktop (Fichas de computadoras más vendidas)
2. GET /api/v1/integracion/benchmark/{nro_parte} (Benchmark forense de precios y competencia)
3. POST /api/v1/integracion/auditar-specs (Auditoría de cumplimiento técnico Zero-Waste)
"""

import re
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.security_b2b import verificar_api_key_b2b
from app.db.database import get_db

router = APIRouter()

# Tipo de cambio referencial PEN/USD para cálculos comparativos si no hay dato en USD
TIPO_CAMBIO_REF = 3.75


# ═══════════════════════════════════════════════════════════════════════════
# HELPERS DE METADATA Y DETECCIÓN DE COLUMNAS
# ═══════════════════════════════════════════════════════════════════════════

_COLS_CACHE: Optional[Dict[str, Optional[str]]] = None


def _get_fichas_columns(db: Session) -> Dict[str, Optional[str]]:
    """Detecta dinámicamente los nombres de columnas de fichas_producto."""
    global _COLS_CACHE
    if _COLS_CACHE is not None:
        return _COLS_CACHE

    try:
        rows = db.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'fichas_producto'"
        )).fetchall()
        cols = {r[0] for r in rows}
    except Exception:
        cols = set()

    nro_col = next((c for c in [
        "nro_parte_o_código_único_de_identificación",
        "nro_parte_o_cdigo_nico_de_identificacin",
        "nro_parte", "codigo_ficha", "cod_ficha"
    ] if c in cols), None)

    desc_col = next((c for c in [
        "descripción_fichaproducto", "descripcin_fichaproducto",
        "descripcion_fichaproducto", "descripcion", "detalle_producto"
    ] if c in cols), None)

    marca_col = next((c for c in ["marca", "fabricante"] if c in cols), None)
    cat_col = next((c for c in ["categoría", "categora", "categoria"] if c in cols), None)
    pdf_col = next((c for c in ["ficha_técnica", "ficha_tcnica", "ficha_tecnica", "url_pdf", "pdf_url"] if c in cols), None)

    _COLS_CACHE = {
        "nro": nro_col or "nro_parte",
        "desc": desc_col or "descripcion",
        "marca": marca_col or "marca",
        "cat": cat_col or "categoria",
        "pdf": pdf_col or "pdf_url",
        "has_min_precio": "min_precio" in cols,
        "has_specs_pdf": "specs_pdf" in cols,
    }
    return _COLS_CACHE


# ═══════════════════════════════════════════════════════════════════════════
# PARSER CANÓNICO DE ESPECIFICACIONES TÉCNICAS PARA COMPUTADORAS
# ═══════════════════════════════════════════════════════════════════════════

def _parsear_specs_pc(descripcion: str, specs_pdf: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Convierte una descripción y/o specs de PDF en un diccionario estructurado
    de especificaciones técnicas canónicas para el ensamblador.
    """
    txt = (descripcion or "") + " "
    sp_pdf = specs_pdf or {}

    # CPU Familia y Generación
    cpu_fam = "Core i5"
    cpu_gen = "12th"
    cpu_raw = sp_pdf.get("procesador", "") or txt

    if re.search(r'\b(Core\s*Ultra\s*9|Ultra\s*9)\b', cpu_raw, re.I):
        cpu_fam, cpu_gen = "Core Ultra 9", "Series 1"
    elif re.search(r'\b(Core\s*Ultra\s*7|Ultra\s*7)\b', cpu_raw, re.I):
        cpu_fam, cpu_gen = "Core Ultra 7", "Series 1"
    elif re.search(r'\b(Core\s*Ultra\s*5|Ultra\s*5)\b', cpu_raw, re.I):
        cpu_fam, cpu_gen = "Core Ultra 5", "Series 1"
    elif re.search(r'\b(Core\s*i9|i9)\b', cpu_raw, re.I):
        cpu_fam = "Core i9"
    elif re.search(r'\b(Core\s*i7|i7)\b', cpu_raw, re.I):
        cpu_fam = "Core i7"
    elif re.search(r'\b(Core\s*i5|i5)\b', cpu_raw, re.I):
        cpu_fam = "Core i5"
    elif re.search(r'\b(Core\s*i3|i3)\b', cpu_raw, re.I):
        cpu_fam = "Core i3"
    elif re.search(r'\bRyzen\s*9\b', cpu_raw, re.I):
        cpu_fam = "Ryzen 9"
    elif re.search(r'\bRyzen\s*7\b', cpu_raw, re.I):
        cpu_fam = "Ryzen 7"
    elif re.search(r'\bRyzen\s*5\b', cpu_raw, re.I):
        cpu_fam = "Ryzen 5"
    elif re.search(r'\bRyzen\s*3\b', cpu_raw, re.I):
        cpu_fam = "Ryzen 3"

    m_gen = re.search(r'\b(1[0-5])[\s\-]*(?:th|va|ma|ra|ª|°)?\s*(?:Gen|Generaci[oó]n)?\b', cpu_raw, re.I)
    if m_gen:
        cpu_gen = f"{m_gen.group(1)}th"
    elif re.search(r'\b(7[0-9]{3}|8[0-9]{3})\b', cpu_raw):
        cpu_gen = "Ryzen 7000/8000"
    elif re.search(r'\b(5[0-9]{3})\b', cpu_raw):
        cpu_gen = "Ryzen 5000"

    # RAM (GB)
    ram_gb = 16
    ram_raw = sp_pdf.get("ram", "") or txt
    m_ram = re.search(r'\b(4|8|16|32|64|128)\s*(?:GB|GIGAS)\b', ram_raw, re.I)
    if m_ram:
        ram_gb = int(m_ram.group(1))

    # Almacenamiento (GB y Tipo)
    storage_gb = 512
    storage_tipo = "SSD NVMe"
    disco_raw = sp_pdf.get("almacenamiento", "") or txt

    if re.search(r'\b2\s*TB\b', disco_raw, re.I):
        storage_gb = 2048
    elif re.search(r'\b1\s*TB\b', disco_raw, re.I):
        storage_gb = 1024
    elif re.search(r'\b512\s*GB\b', disco_raw, re.I):
        storage_gb = 512
    elif re.search(r'\b256\s*GB\b', disco_raw, re.I):
        storage_gb = 256
    elif re.search(r'\b128\s*GB\b', disco_raw, re.I):
        storage_gb = 128

    if re.search(r'\b(NVMe|M\.2|PCIE)\b', disco_raw, re.I):
        storage_tipo = "SSD NVMe"
    elif re.search(r'\bSSD\b', disco_raw, re.I):
        storage_tipo = "SSD SATA"
    elif re.search(r'\bHDD\b', disco_raw, re.I):
        storage_tipo = "HDD"

    # Formato de Chasis
    formato = "Slim / SFF"
    formato_raw = sp_pdf.get("formato", "") or txt
    if re.search(r'\b(Mini\s*PC|Tiny|Micro|USFF)\b', formato_raw, re.I):
        formato = "Mini PC / Tiny"
    elif re.search(r'\b(Torre|Tower|ATX|Micro\s*ATX)\b', formato_raw, re.I):
        formato = "Torre"
    elif re.search(r'\b(SFF|Small\s*Form\s*Factor|Slim)\b', formato_raw, re.I):
        formato = "Slim / SFF"

    # Garantía
    garantia_meses = 36
    garantia_raw = sp_pdf.get("garantia", "") or txt
    m_gar = re.search(r'\b(12|24|36|48|60)\s*(?:Meses|Mes)\b', garantia_raw, re.I)
    if m_gar:
        garantia_meses = int(m_gar.group(1))
    elif re.search(r'\b3\s*(?:A[ñn]os?)\b', garantia_raw, re.I):
        garantia_meses = 36
    elif re.search(r'\b1\s*(?:A[ñn]o)\b', garantia_raw, re.I):
        garantia_meses = 12

    return {
        "cpu_familia": cpu_fam,
        "cpu_gen": cpu_gen,
        "ram_gb": ram_gb,
        "storage_gb": storage_gb,
        "storage_tipo": storage_tipo,
        "formato_chasis": formato,
        "garantia_meses": garantia_meses,
    }


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT 1: TOP FICHAS DE COMPUTADORAS DE ESCRITORIO
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/fichas/top-desktop")
def obtener_top_fichas_desktop(
    limit: int = Query(30, ge=1, le=100, description="Cantidad máxima de fichas a retornar"),
    meses: int = Query(12, ge=1, le=60, description="Ventana de tiempo en meses"),
    db: Session = Depends(get_db),
    _: str = Depends(verificar_api_key_b2b)
):
    """
    Retorna las fichas de computadoras de escritorio con mayor volumen de compra en Perú Compras.
    Incluye especificaciones técnicas parseadas canónicamente y precios adjudicados de referencia.
    """
    desde_fecha = datetime.utcnow().date() - timedelta(days=meses * 30)
    cols = _get_fichas_columns(db)
    nro_col = cols["nro"]
    desc_col = cols["desc"]
    marca_col = cols["marca"]
    cat_col = cols["cat"]
    pdf_col = cols["pdf"]

    # 1. Consulta agregada sobre purchase_orders
    sql_orders = text("""
        SELECT 
            UPPER(TRIM(po.nro_parte)) as nro_parte,
            COUNT(po.id) as total_ordenes,
            COALESCE(SUM(
                CASE 
                    WHEN po.monto_total IS NOT NULL AND po.precio_unitario IS NOT NULL AND po.precio_unitario > 0
                    THEN ROUND(po.monto_total / po.precio_unitario)
                    ELSE 1
                END
            ), COUNT(po.id)) as unidades_compradas,
            MIN(NULLIF(po.precio_unitario, 0)) as min_unit_pen,
            AVG(NULLIF(po.precio_unitario, 0)) as avg_unit_pen,
            MAX(COALESCE(po.fecha_publicacion, po.fecha_aceptacion)) as ultima_fecha
        FROM purchase_orders po
        WHERE po.nro_parte IS NOT NULL 
          AND TRIM(po.nro_parte) != ''
          AND (
                po.categoria ILIKE '%ESCRITORIO%' 
             OR po.catalogo ILIKE '%COMPUTADORA%' 
             OR po.detalle_producto ILIKE '%COMPUTADORA DE ESCRITORIO%'
          )
          AND COALESCE(po.fecha_publicacion, po.fecha_aceptacion) >= :desde_fecha
        GROUP BY UPPER(TRIM(po.nro_parte))
        ORDER BY total_ordenes DESC, unidades_compradas DESC
        LIMIT :limit
    """)

    order_rows = db.execute(sql_orders, {"desde_fecha": desde_fecha, "limit": limit}).fetchall()
    if not order_rows:
        return []

    nro_partes = [r[0] for r in order_rows]

    # 2. Consultar fichas_producto para enriquecer con datos oficiales
    fichas_dict: Dict[str, Dict[str, Any]] = {}
    try:
        sql_fichas = text(f"""
            SELECT 
                UPPER(TRIM("{nro_col}")) as nro_parte,
                "{desc_col}" as descripcion,
                "{marca_col}" as marca,
                "{cat_col}" as categoria,
                "{pdf_col}" as pdf_url
                {', "min_precio"' if cols["has_min_precio"] else ''}
                {', "specs_pdf"' if cols["has_specs_pdf"] else ''}
            FROM fichas_producto
            WHERE UPPER(TRIM("{nro_col}")) = ANY(:nros)
        """)
        f_rows = db.execute(sql_fichas, {"nros": nro_partes}).fetchall()
        for fr in f_rows:
            fichas_dict[fr[0]] = {
                "descripcion": fr[1] or "",
                "marca": fr[2] or "GENÉRICO",
                "categoria": fr[3] or "COMPUTADORAS DE ESCRITORIO",
                "pdf_url": fr[4] or "",
                "min_precio_ficha": fr[5] if cols["has_min_precio"] else None,
                "specs_pdf": fr[6] if cols["has_specs_pdf"] else None,
            }
    except Exception:
        pass

    resultados = []
    for r in order_rows:
        np = r[0]
        f_info = fichas_dict.get(np, {})
        desc = f_info.get("descripcion") or f"COMPUTADORA DE ESCRITORIO {np}"
        specs_pdf = f_info.get("specs_pdf")
        
        # Precio unitario PEN
        p_min_pen = float(r[3]) if r[3] else float(f_info.get("min_precio_ficha") or 1800.00)
        p_avg_pen = float(r[4]) if r[4] else p_min_pen
        p_min_usd = round(p_min_pen / TIPO_CAMBIO_REF, 2)

        specs_parseadas = _parsear_specs_pc(desc, specs_pdf)

        resultados.append({
            "nro_parte": np,
            "descripcion": desc,
            "marca": f_info.get("marca") or "GENÉRICO",
            "categoria": f_info.get("categoria") or "COMPUTADORAS DE ESCRITORIO",
            "total_ordenes": int(r[1]),
            "unidades_compradas": int(r[2]),
            "precio_min_unit_pen": round(p_min_pen, 2),
            "precio_min_unit_usd": p_min_usd,
            "precio_promedio_pen": round(p_avg_pen, 2),
            "pdf_url": f_info.get("pdf_url") or "",
            "ultima_adjudicacion": r[5].isoformat() if r[5] else None,
            "specs_parseadas": specs_parseadas
        })

    return resultados


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT 2: BENCHMARK FORENSE DE PRECIOS Y COMPETENCIA
# ═══════════════════════════════════════════════════════════════════════════

@router.get("/benchmark/{nro_parte}")
def obtener_benchmark_ficha(
    nro_parte: str,
    db: Session = Depends(get_db),
    _: str = Depends(verificar_api_key_b2b)
):
    """
    Inteligencia competitiva de una ficha técnica:
    1. Historial de precios adjudicados (últimas 5 órdenes de compra OCAM).
    2. Ofertas de competidores activos con stock y plazos de entrega.
    """
    np_clean = nro_parte.strip().upper()
    cols = _get_fichas_columns(db)
    nro_col = cols["nro"]
    desc_col = cols["desc"]
    pdf_col = cols["pdf"]

    # 1. Buscar ficha técnica
    ficha_info = {}
    try:
        sql_ficha = text(f"""
            SELECT 
                "{desc_col}" as desc,
                "{pdf_col}" as pdf
                {', "min_precio"' if cols["has_min_precio"] else ''}
            FROM fichas_producto
            WHERE UPPER(TRIM("{nro_col}")) = :np
            LIMIT 1
        """)
        row = db.execute(sql_ficha, {"np": np_clean}).first()
        if row:
            ficha_info = {
                "descripcion": row[0],
                "pdf_url": row[1],
                "min_precio": float(row[2]) if cols["has_min_precio"] and row[2] else None
            }
    except Exception:
        pass

    # 2. Últimas órdenes de compra en purchase_orders
    sql_ordenes = text("""
        SELECT 
            COALESCE(po.orden_electronica, po.nro_orden_fisica) as orden,
            po.nombre_entidad,
            po.precio_unitario,
            po.monto_total,
            COALESCE(po.fecha_publicacion, po.fecha_aceptacion) as fecha,
            po.nombre_proveedor
        FROM purchase_orders po
        WHERE UPPER(TRIM(po.nro_parte)) = :np
        ORDER BY fecha DESC NULLS LAST
        LIMIT 5
    """)
    ord_rows = db.execute(sql_ordenes, {"np": np_clean}).fetchall()

    ultimas_ordenes = []
    precios_pen = []
    for r in ord_rows:
        unit = float(r[2]) if r[2] else (float(r[3]) if r[3] else None)
        if unit:
            precios_pen.append(unit)
        ultimas_ordenes.append({
            "orden_electronica": r[0] or "OCAM-S/N",
            "entidad": r[1] or "ENTIDAD DEL ESTADO",
            "monto_unitario_pen": round(unit, 2) if unit else None,
            "cantidad": 1,
            "fecha": r[4].isoformat() if r[4] else None,
            "proveedor_ganador": r[5] or "PROVEEDOR ADJUDICADO"
        })

    p_min_hist = ficha_info.get("min_precio") or (min(precios_pen) if precios_pen else 0.0)
    p_min_reciente = precios_pen[0] if precios_pen else p_min_hist

    # 3. Competencia activa en ofertas_proveedor_history
    sql_competencia = text("""
        SELECT 
            nombre_proveedor,
            precio_ofertado,
            existencia_stock,
            plazo_entrega_dias,
            region
        FROM ofertas_proveedor_history
        WHERE UPPER(TRIM(nro_parte)) = :np
          AND precio_ofertado IS NOT NULL
        ORDER BY fecha_extraccion DESC, precio_ofertado ASC
        LIMIT 10
    """)
    comp_rows = []
    try:
        comp_rows = db.execute(sql_competencia, {"np": np_clean}).fetchall()
    except Exception:
        pass

    competencia_activa = []
    vistos = set()
    for c in comp_rows:
        prov = c[0] or "DISTRIBUIDOR"
        reg = c[4] or "LIMA"
        key = f"{prov}_{reg}"
        if key in vistos:
            continue
        vistos.add(key)
        competencia_activa.append({
            "proveedor": prov,
            "precio_ofertado_pen": float(c[1]) if c[1] else 0.0,
            "precio_ofertado_usd": round(float(c[1]) / TIPO_CAMBIO_REF, 2) if c[1] else 0.0,
            "stock": int(c[2]) if c[2] is not None else 0,
            "plazo_entrega_dias": int(c[3]) if c[3] is not None else 2,
            "region": reg
        })

    return {
        "nro_parte": np_clean,
        "descripcion": ficha_info.get("descripcion") or f"PRODUCTO {np_clean}",
        "pdf_url": ficha_info.get("pdf_url") or "",
        "precio_min_historico_pen": round(p_min_hist, 2),
        "precio_min_historico_usd": round(p_min_hist / TIPO_CAMBIO_REF, 2),
        "precio_min_reciente_pen": round(p_min_reciente, 2),
        "precio_min_reciente_usd": round(p_min_reciente / TIPO_CAMBIO_REF, 2),
        "ultimas_ordenes": ultimas_ordenes,
        "competencia_activa": competencia_activa
    }


# ═══════════════════════════════════════════════════════════════════════════
# ENDPOINT 3: AUDITOR DE CUMPLIMIENTO TÉCNICO (ZERO-WASTE SPEC)
# ═══════════════════════════════════════════════════════════════════════════

class AuditarSpecsRequest(BaseModel):
    nro_parte_ceam: str = Field(..., description="Número de parte oficial de la ficha en CEAM")
    componentes_ensamble: Dict[str, Any] = Field(
        ...,
        description="Componentes propuestos: {'cpu': '...', 'ram': '...', 'storage': '...', 'psu': '...', 'formato': '...'}"
    )


@router.post("/auditar-specs")
def auditar_specs_ensamble(
    payload: AuditarSpecsRequest,
    db: Session = Depends(get_db),
    _: str = Depends(verificar_api_key_b2b)
):
    """
    Compara componente por componente el ensamble configurado contra las bases técnicas
    de la ficha de Perú Compras para evitar descalificaciones o desperdicio de margen.
    """
    np_clean = payload.nro_parte_ceam.strip().upper()
    comp = payload.componentes_ensamble

    cols = _get_fichas_columns(db)
    nro_col = cols["nro"]
    desc_col = cols["desc"]

    # 1. Obtener ficha oficial
    sql_ficha = text(f"""
        SELECT 
            "{desc_col}" as desc
            {', "specs_pdf"' if cols["has_specs_pdf"] else ''}
        FROM fichas_producto
        WHERE UPPER(TRIM("{nro_col}")) = :np
        LIMIT 1
    """)
    row = db.execute(sql_ficha, {"np": np_clean}).first()
    
    desc_oficial = row[0] if row else ""
    specs_pdf = row[1] if (row and cols["has_specs_pdf"]) else {}
    req = _parsear_specs_pc(desc_oficial, specs_pdf)

    alertas: List[str] = []
    desperdicio: List[Dict[str, Any]] = []

    # A. Auditoría de Memoria RAM
    ram_ensamble = str(comp.get("ram", "")).upper()
    m_ram_ens = re.search(r'\b(4|8|16|32|64|128)\b', ram_ensamble)
    ram_ens_gb = int(m_ram_ens.group(1)) if m_ram_ens else None

    if ram_ens_gb:
        if ram_ens_gb < req["ram_gb"]:
            alertas.append(f"RAM insuficiente: la ficha exige mínimo {req['ram_gb']}GB y el ensamble tiene {ram_ens_gb}GB.")
        elif ram_ens_gb > req["ram_gb"]:
            extra_gb = ram_ens_gb - req["ram_gb"]
            impacto = round(extra_gb * 2.2, 2)  # ~$2.2 USD por GB extra aproximado
            desperdicio.append({
                "pieza": "MEMORIA_RAM",
                "requerido": f"{req['ram_gb']}GB",
                "ensamblado": f"{ram_ens_gb}GB",
                "motivo": f"Sobredimensionado: Ficha pide {req['ram_gb']}GB, pusiste {ram_ens_gb}GB (+{extra_gb}GB innecesarios)",
                "impacto_margen_usd": impacto
            })

    # B. Auditoría de Almacenamiento
    storage_ensamble = str(comp.get("storage", "") or comp.get("disco", "")).upper()
    m_st_ens = re.search(r'\b(128|256|512|1024|2048|1TB|2TB)\b', storage_ensamble)
    
    st_ens_gb = None
    if m_st_ens:
        v = m_st_ens.group(1)
        if "1TB" in v: st_ens_gb = 1024
        elif "2TB" in v: st_ens_gb = 2048
        else: st_ens_gb = int(v)

    if st_ens_gb:
        if st_ens_gb < req["storage_gb"]:
            alertas.append(f"Almacenamiento insuficiente: la ficha exige mínimo {req['storage_gb']}GB y el ensamble tiene {st_ens_gb}GB.")
        elif st_ens_gb > req["storage_gb"]:
            impacto = 28.50 if (st_ens_gb - req["storage_gb"]) >= 512 else 15.00
            desperdicio.append({
                "pieza": "ALMACENAMIENTO",
                "requerido": f"{req['storage_gb']}GB {req['storage_tipo']}",
                "ensamblado": f"{st_ens_gb}GB",
                "motivo": f"Sobredimensionado: Ficha pide {req['storage_gb']}GB, pusiste {st_ens_gb}GB",
                "impacto_margen_usd": impacto
            })

    # Verificar tecnología NVMe si es requerida
    if "NVME" in req["storage_tipo"].upper() and storage_ensamble and not any(k in storage_ensamble for k in ["NVME", "M.2", "PCIE"]):
        alertas.append("Almacenamiento no cumple interfaz: la ficha exige SSD NVMe / M.2 PCIe y el componente no lo especifica.")

    # C. Auditoría de Chasis / Formato
    formato_ensamble = str(comp.get("formato", "") or comp.get("case", "")).upper()
    if req["formato_chasis"] == "Slim / SFF" and any(k in formato_ensamble for k in ["TORRE", "ATX GRANDE", "FULL TOWER"]):
        alertas.append("Gabinete no admitido: La ficha técnica exige chasis Slim / SFF de bajo volumen y se configuró Torre ATX.")

    # D. Auditoría de Procesador
    cpu_ensamble = str(comp.get("cpu", "") or comp.get("procesador", "")).upper()
    if req["cpu_familia"].upper() not in cpu_ensamble and cpu_ensamble:
        # Si pide Core i7 y pusieron Core i5
        if "I7" in req["cpu_familia"].upper() and "I5" in cpu_ensamble:
            alertas.append("Procesador de gama inferior: La ficha exige Intel Core i7 y se configuró Core i5.")
        elif "I5" in req["cpu_familia"].upper() and "I3" in cpu_ensamble:
            alertas.append("Procesador de gama inferior: La ficha exige Intel Core i5 y se configuró Core i3.")
        elif "I5" in req["cpu_familia"].upper() and "I7" in cpu_ensamble:
            desperdicio.append({
                "pieza": "PROCESADOR",
                "requerido": req["cpu_familia"],
                "ensamblado": cpu_ensamble,
                "motivo": "Sobredimensionado: Ficha pide Core i5, pusiste Core i7",
                "impacto_margen_usd": 110.00
            })

    cumple_100 = len(alertas) == 0

    return {
        "nro_parte_ceam": np_clean,
        "cumple_100": cumple_100,
        "specs_requeridas_ficha": req,
        "alertas_descalificacion": alertas,
        "desperdicio_margen": desperdicio,
        "total_impacto_desperdicio_usd": round(sum(d.get("impacto_margen_usd", 0) for d in desperdicio), 2)
    }
