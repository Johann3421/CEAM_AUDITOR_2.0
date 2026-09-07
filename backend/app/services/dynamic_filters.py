"""
CEAM AUDITOR 2.0 — Motor de Filtros Dinámicos Inteligentes (Cero Hardcoding)
Inspirado en la arquitectura canónica de Kenya Tienda.

Pilares:
1. Extracción Dinámica Contextual: Las opciones se calculan en tiempo de ejecución
   desde la base de datos para la categoría y proveedor activos.
2. Normalización Canónica: Limpieza de marketing (OC, Gaming, GHz, etc.) para visualización limpia en UI.
3. Búsqueda con Expansión Inversa: El filtro en backend mapea la opción canónica elegida
   por el usuario a los strings crudos reales existentes en la BD (WHERE col IN (...)).
"""

import re
import time
from typing import Dict, List, Any, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text


# ═══════════════════════════════════════════════════════════════════════════
# 1. PIPELINE DE NORMALIZACIÓN CANÓNICA
# ═══════════════════════════════════════════════════════════════════════════

def normalizar_tarjeta_video(valor: str) -> str:
    """Limpia sufijos de marketing, frecuencias y unifica VRAM a formato canónico."""
    if not valor:
        return ""
    v = str(valor).strip()
    v = re.sub(r'[\ufffd\x7f\u00B9\u00B2\u00B3\u2070-\u2079\*\#\®\™]', '', v)
    v = re.sub(r'\b(dedicad[oa]s?|integrad[oa]s?)\b', '', v, flags=re.IGNORECASE)
    v = re.sub(r'\bConectividadº?\b', '', v, flags=re.IGNORECASE)
    v = re.sub(r'\s+', ' ', v).strip(" :;,-–—\t\r\n")

    vu = v.upper()
    if vu in ("AUDIO", "N/A", "NO APLICA", "NO INCLUYE", "-", "VIDEO", "GRAFICOS", "GRÁFICOS", "INTEGRATED", "DISCRETOS") or len(v) < 3:
        return ""
    if any(p in vu for p in ["HDMI", "DISPLAYPORT"]) and not any(k in vu for k in ["RTX", "GTX", "RADEON", "GEFORCE", "GB"]):
        return ""
    if 'DISEÑO' in vu or 'DISENO' in vu:
        return ""

    # Gráficos integrados comunes
    if "770" in vu and any(k in vu for k in ["UHD", "GRAPHICS", "INTEL"]):
        return "Intel UHD Graphics 770"
    if "730" in vu and any(k in vu for k in ["UHD", "GRAPHICS", "INTEL"]):
        return "Intel UHD Graphics 730"
    if any(k in vu for k in ["INTEL UHD", "INTEL HD", "INTEL IRIS", "UHD GRAPHICS", "IRIS XE", "INTEL GRAPHICS", "INTEGRATED INTEL", "TIPO UHD"]):
        if "IRIS" in vu: return "Intel Iris Xe Graphics"
        return "Intel UHD Graphics"
    if any(k in vu for k in ["RADEON GRAPHICS", "RADEON VEGA", "VEGA 7", "VEGA 8", "RADEON 680M", "RADEON 780M"]):
        if "780M" in vu: return "AMD Radeon 780M"
        return "AMD Radeon Graphics"

    # Modelos NVIDIA específicos
    if re.search(r'\bGTX\s*1650\b', vu):
        return "NVIDIA GeForce GTX 1650 4 GB"
    if re.search(r'\bRTX\s*4060\b', vu):
        return "NVIDIA GeForce RTX 4060 8 GB"
    if re.search(r'\bRTX\s*3060\b', vu):
        return "NVIDIA GeForce RTX 3060 12 GB"
    if re.search(r'\bRTX\s*4070\b', vu):
        return "NVIDIA GeForce RTX 4070 12 GB"
    if re.search(r'\bRTX\s*3050\b', vu):
        return "NVIDIA GeForce RTX 3050 6 GB"
    if re.search(r'RADEON\s+RX.*16\s*GB', vu):
        return "AMD Radeon RX 16 GB"

    # Tarjetas dedicadas genéricas por VRAM
    m_vram = re.search(r'(\d+)\s*GB(?:\s*G?DDR\d[X]?)?', vu)
    if m_vram:
        cap_vram = int(m_vram.group(1))
        if "RTX" in vu or "NVIDIA" in vu:
            return f"NVIDIA GeForce RTX {cap_vram} GB"
        if "RADEON" in vu or "RX" in vu:
            return f"AMD Radeon RX {cap_vram} GB"
        return f"Dedicada {cap_vram} GB"

    return ""


def normalizar_fuente(valor: str) -> str:
    """Extrae potencia (Watts) y certificación 80 Plus para firma canónica."""
    if not valor:
        return ""
    v = str(valor).strip()
    v = re.sub(r'[\ufffd\x7f\u00B9\u00B2\u00B3\u2070-\u2079\*\#\®\™]', '', v)
    vu = v.upper()

    if vu in ("DE PODER", "PODER", "FUENTE", "N/A", "NO APLICA", "-") or len(v) < 3:
        return ""

    m_w = re.search(r'(\d{2,4})\s*(?:WATTS?|W\b)', vu)
    watts = f"{m_w.group(1)}W" if m_w else ""

    cert = ""
    if "80 PLUS TITANIUM" in vu or "80+ TITANIUM" in vu: cert = "80+ Titanium"
    elif "80 PLUS PLATINUM" in vu or "80+ PLATINUM" in vu: cert = "80+ Platinum"
    elif "80 PLUS GOLD" in vu or "80+ GOLD" in vu: cert = "80+ Gold"
    elif "80 PLUS SILVER" in vu or "80+ SILVER" in vu: cert = "80+ Silver"
    elif "80 PLUS BRONZE" in vu or "80+ BRONZE" in vu or "BRONZE" in vu: cert = "80+ Bronze"
    elif "80 PLUS WHITE" in vu or "80+ WHITE" in vu: cert = "80+ White"
    elif "80 PLUS" in vu or "80+" in vu: cert = "80+ White"

    if watts and cert:
        return f"{watts} • {cert}"
    elif watts:
        return watts
    elif cert:
        return cert
    return ""


def normalizar_procesador(valor: str) -> str:
    """Consolida el modelo exacto de CPU a formato canónico limpio, descartando ruido."""
    if not valor:
        return ""
    v = str(valor).strip()
    v = re.sub(r'[\ufffd\x7f\u00B9\u00B2\u00B3\u2070-\u2079\*\#\®\™]', '', v)
    v = re.sub(r'\s+', ' ', v).strip(" :;,-–—\t\r\n")
    vu = v.upper()

    # Descartar ruido evidente de texto de fichas
    if any(k in vu for k in ['CACH', 'L2', 'L3', 'TURBO', 'FRECUENCIA', 'GENERACI', 'P-CORE', 'E-CORE', 'ARQUITECTURA', 'MAX TURBO']) and not any(k in vu for k in ['CORE I', 'RYZEN', 'ULTRA', 'CELERON', 'XEON', 'PENTIUM']):
        return ""
    if vu in ['AMD', 'INTEL', 'INTEL CORE', 'CORE', 'PROCESADOR', 'CPU', 'PROCESSOR'] or len(v) < 4:
        return ""

    # Intel Core i3 / i5 / i7 / i9
    m_intel = re.search(r'(?:INTEL\s*)?(?:C\s*ORE|CORE)?\s*(I[3579])[\s\-]*(\d{2}\s*\d{2,3}[A-Z]*)', v, re.I)
    if m_intel:
        fam = m_intel.group(1).lower()
        num = m_intel.group(2).replace(' ', '').upper()
        return f"Intel Core {fam}-{num}"

    # Intel Core Ultra 3 / 5 / 7 / 9
    m_ultra = re.search(r'(?:INTEL\s*)?(?:CORE\s*)?ULTRA\s*([3579])[\s\-]*(\d{3,4}[A-Z]*)', v, re.I)
    if m_ultra:
        fam = m_ultra.group(1)
        num = m_ultra.group(2).upper()
        return f"Intel Core Ultra {fam} {num}"

    # AMD Ryzen 3 / 5 / 7 / 9 (incluyendo PRO)
    m_ryzen = re.search(r'(?:AMD\s*)?RYZEN\s*(?:PRO\s*)?([3579])(?:[\s\-]*PRO)?[\s\-]*(\d{4}[A-Z]*)', v, re.I)
    if m_ryzen:
        fam = m_ryzen.group(1)
        num = m_ryzen.group(2).upper()
        return f"AMD Ryzen {fam} {num}"

    # Xeon / Celeron / Pentium
    if 'XEON' in vu:
        m_x = re.search(r'XEON\s*([A-Z0-9\-]+)', vu)
        return f"Intel Xeon {m_x.group(1)}" if m_x else "Intel Xeon"
    if 'CELERON' in vu:
        m_c = re.search(r'CELERON\s*([A-Z0-9\-]+)', vu)
        return f"Intel Celeron {m_c.group(1)}" if m_c else "Intel Celeron"
    if 'PENTIUM' in vu:
        m_p = re.search(r'PENTIUM\s*([A-Z0-9\-]+)', vu)
        return f"Intel Pentium {m_p.group(1)}" if m_p else "Intel Pentium"

    return ""


def normalizar_ram(valor: str) -> str:
    """Consolida RAM a 'X GB DDRY ZZZZ MHz' o 'X GB', descartando basura."""
    if not valor:
        return ""
    v = str(valor).strip()
    v = re.sub(r'[\ufffd\x7f\u00B9\u00B2\u00B3\u2070-\u2079\*\#\®\™]', '', v)
    vu = v.upper()

    if not re.search(r'\b\d+\s*GB\b', vu) and not re.search(r'\bDDR[345]\b', vu) and not re.search(r'\bLPDDR\b', vu):
        return ""
    if 'ARQUITECTURA' in vu or 'CHANNEL' in vu or len(vu) < 4:
        return ""

    m_cap = re.search(r'\b0?(\d{1,3})\s*(?:GB|GIGAS|GIB)?\b', vu)
    if not m_cap:
        return ""
    cap = int(m_cap.group(1))
    if cap not in (4, 8, 12, 16, 24, 32, 48, 64, 96, 128):
        return ""

    m_tech = re.search(r'\b(LPDDR5X?|LPDDR4X?|DDR5|DDR4|DDR3)\b', vu)
    tech = m_tech.group(1) if m_tech else ""

    m_hz = re.search(r'\b(2400|2666|2933|3200|4400|4800|5200|5600|6000|6400|7200)\s*(?:MHZ|MT/S)?\b', vu)
    hz = f" {m_hz.group(1)} MHz" if m_hz else ""

    if tech:
        return f"{cap} GB {tech}{hz}"
    return f"{cap} GB"


def normalizar_almacenamiento(valor: str) -> str:
    """Consolida disco a capacidades y tipos canónicos limpios."""
    if not valor:
        return ""
    v = str(valor).strip()
    v = re.sub(r'[\ufffd\x7f\u00B9\u00B2\u00B3\u2070-\u2079\*\#\®\™]', '', v)
    vu = v.upper()

    # Detección combinada SSD + HDD
    if ("SSD" in vu or "M.2" in vu or "NVME" in vu) and ("HDD" in vu or "MECANICO" in vu):
        m_ssd = re.search(r'(\d+)\s*(GB|TB).*?(?:SSD|M\.2|NVME)', vu)
        m_hdd = re.search(r'(\d+)\s*(GB|TB).*?(?:HDD|MECANICO)', vu)
        part_ssd = f"{m_ssd.group(1)} {m_ssd.group(2)} SSD" if m_ssd else "SSD"
        part_hdd = f"{m_hdd.group(1)} {m_hdd.group(2)} HDD" if m_hdd else "HDD"
        return f"{part_ssd} + {part_hdd}"

    m_size = re.search(r'(\d+)\s*(GB|TB)', vu)
    if m_size:
        size_str = f"{m_size.group(1)} {m_size.group(2)}"
        tipo = "HDD" if "HDD" in vu and "SSD" not in vu else "SSD"
        return f"{size_str} {tipo}"

    return ""


def normalizar_so(valor: str) -> str:
    """Consolida sistema operativo a etiqueta estándar."""
    if not valor:
        return ""
    vu = str(valor).upper()
    if any(k in vu for k in ["11 PRO", "WIN 11 PRO", "W11 PRO", "W11P", "PROFESSIONAL"]):
        return "Windows 11 Pro"
    elif any(k in vu for k in ["11 HOME", "WIN 11 HOME", "W11 HOME"]):
        return "Windows 11 Home"
    elif any(k in vu for k in ["10 PRO", "WIN 10 PRO", "W10 PRO"]):
        return "Windows 10 Pro"
    elif any(k in vu for k in ["FREEDOS", "FREE DOS", "DOS", "SIN SISTEMA", "NO INCLUID", "NO TIENE"]):
        return "Sin SO (No incluido / FreeDOS)"
    elif any(k in vu for k in ["LINUX", "UBUNTU", "FEDORA"]):
        return "Linux / Ubuntu"
    return valor.strip()[:30]


# ═══════════════════════════════════════════════════════════════════════════
# 2. CACHÉ EN MEMORIA PARA EXPANDED MAPS Y METADATOS
# ═══════════════════════════════════════════════════════════════════════════

_FILTERS_CACHE: Dict[str, Dict[str, Any]] = {}
_REVERSE_MAP_CACHE: Dict[str, Dict[str, Dict[str, List[str]]]] = {}
_CACHE_TIMESTAMPS: Dict[str, float] = {}
_CACHE_TTL = 300.0  # 5 minutos


def _build_context_key(categoria: Optional[str], proveedor: Optional[str]) -> str:
    cat = (categoria or "all").lower().strip()
    prov = (proveedor or "all").lower().strip()
    return f"{cat}:{prov}"


# ═══════════════════════════════════════════════════════════════════════════
# 3. EXTRACTOR DINÁMICO DE FILTROS SEGÚN CONTEXTO (BASE DE DATOS REAL)
# ═══════════════════════════════════════════════════════════════════════════

def obtener_filtros_dinamicos_fichas(
    db: Session,
    categoria: Optional[str] = None,
    proveedor: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Escanea la base de datos real (ofertas_proveedor_history) para la categoría
    y proveedor activos, combinando tanto raw_json->'specs_pdf' como descripcion_producto.
    Aplica el pipeline canónico y construye el mapa de búsqueda inversa.
    """
    ctx_key = _build_context_key(categoria, proveedor)
    now = time.time()

    if ctx_key in _FILTERS_CACHE and (now - _CACHE_TIMESTAMPS.get(ctx_key, 0) < _CACHE_TTL):
        return _FILTERS_CACHE[ctx_key]

    where_clauses = ["1=1"]
    params: Dict[str, Any] = {}

    # Filtrar por categoría activa
    if categoria and categoria.lower() != "all":
        cat_l = categoria.lower().strip()
        if cat_l in ("escritorio", "computadora de escritorio"):
            where_clauses.append("""(
                UPPER(categoria) = 'COMPUTADORA DE ESCRITORIO'
                OR (
                    (UPPER(catalogo) LIKE '%ESCRITORIO%' OR UPPER(categoria) LIKE '%ESCRITORIO%' OR UPPER(descripcion_producto) LIKE '%ESCRITORIO%')
                    AND UPPER(categoria) NOT LIKE '%TODO EN UNO%'
                    AND UPPER(categoria) NOT LIKE '%MONITOR%'
                    AND UPPER(categoria) NOT LIKE '%ESTACION%'
                    AND UPPER(categoria) NOT LIKE '%ALMACENAMIENTO%'
                    AND UPPER(categoria) NOT LIKE '%PANTALLA%'
                    AND UPPER(descripcion_producto) NOT LIKE '%TODO EN UNO%'
                    AND UPPER(descripcion_producto) NOT LIKE '%ALL IN ONE%'
                    AND UPPER(descripcion_producto) NOT LIKE '%MONITOR%'
                )
            )""")
        elif cat_l in ("portatil", "computadora portatil", "laptop", "laptops"):
            where_clauses.append("""(
                (UPPER(categoria) LIKE '%PORTATIL%' OR UPPER(categoria) LIKE '%PORTÁTIL%' OR UPPER(descripcion_producto) LIKE '%PORTATIL%' OR UPPER(descripcion_producto) LIKE '%LAPTOP%')
                AND UPPER(categoria) NOT LIKE '%TODO EN UNO%'
                AND UPPER(categoria) NOT LIKE '%ESTACION%'
            )""")
        elif cat_l in ("aio", "todo en uno", "all in one"):
            where_clauses.append("(UPPER(categoria) LIKE '%TODO EN UNO%' OR UPPER(descripcion_producto) LIKE '%TODO EN UNO%' OR UPPER(descripcion_producto) LIKE '%ALL IN ONE%')")
        elif cat_l in ("monitor", "monitores"):
            where_clauses.append("(UPPER(categoria) LIKE '%MONITOR%' OR UPPER(descripcion_producto) LIKE 'MONITOR%' OR UPPER(descripcion_producto) LIKE '%MONITOR LED%')")
        elif cat_l in ("workstation_portatil", "estacion de trabajo portatil"):
            where_clauses.append("""(
                (UPPER(categoria) LIKE '%ESTACION DE TRABAJO%' OR UPPER(descripcion_producto) LIKE '%WORKSTATION%')
                AND (UPPER(categoria) LIKE '%PORTATIL%' OR UPPER(descripcion_producto) LIKE '%PORTATIL%' OR UPPER(descripcion_producto) LIKE '%LAPTOP%')
            )""")
        elif cat_l in ("workstation", "estacion de trabajo", "estacion"):
            where_clauses.append("""(
                (UPPER(categoria) LIKE '%ESTACION DE TRABAJO%' OR UPPER(descripcion_producto) LIKE '%WORKSTATION%')
                AND UPPER(categoria) NOT LIKE '%PORTATIL%'
                AND UPPER(descripcion_producto) NOT LIKE '%PORTATIL%'
                AND UPPER(descripcion_producto) NOT LIKE '%LAPTOP%'
            )""")
        elif cat_l in ("tableta", "tablet"):
            where_clauses.append("(UPPER(categoria) LIKE '%TABLET%' OR UPPER(descripcion_producto) LIKE '%TABLET%')")
        elif cat_l in ("pantalla_pub", "pantalla publicitaria"):
            where_clauses.append("(UPPER(categoria) LIKE '%PUBLICITARIA%' OR UPPER(descripcion_producto) LIKE '%PUBLICITARIA%')")
        elif cat_l in ("pantalla_int", "pantalla interactiva"):
            where_clauses.append("(UPPER(categoria) LIKE '%INTERACTIVA%' OR UPPER(descripcion_producto) LIKE '%INTERACTIVA%')")
        elif cat_l in ("almacenamiento_int", "almacenamiento interno"):
            where_clauses.append("""(
                UPPER(categoria) LIKE '%INTERNO%'
                OR (UPPER(catalogo) LIKE '%ALMACENAMIENTO%' AND UPPER(descripcion_producto) NOT LIKE '%EXTERNO%')
            )""")
        elif cat_l in ("almacenamiento_ext", "almacenamiento externo"):
            where_clauses.append("(UPPER(categoria) LIKE '%EXTERNO%' OR UPPER(descripcion_producto) LIKE '%EXTERNO%')")
        elif cat_l in ("escaner_docs", "escaner de documentos"):
            where_clauses.append("(UPPER(categoria) LIKE '%DOCUMENTOS%' OR (UPPER(catalogo) LIKE '%ESCANER%' AND UPPER(descripcion_producto) NOT LIKE '%PLANO%'))")
        elif cat_l in ("escaner_planos", "escaner de planos"):
            where_clauses.append("(UPPER(categoria) LIKE '%PLANO%' OR UPPER(descripcion_producto) LIKE '%PLANO%')")
        elif cat_l in ("escaner_libros", "escaner de libros"):
            where_clauses.append("(UPPER(categoria) LIKE '%LIBRO%' OR UPPER(descripcion_producto) LIKE '%LIBRO%')")
        else:
            where_clauses.append("(UPPER(categoria) LIKE UPPER(:cat) OR UPPER(catalogo) LIKE UPPER(:cat) OR UPPER(descripcion_producto) LIKE UPPER(:cat))")
            params["cat"] = f"%{categoria}%"

    # Filtrar por proveedor si aplica
    if proveedor and proveedor.lower() != "all":
        pl = proveedor.lower()
        if pl in ("thekingcomputer", "king"):
            where_clauses.append("(UPPER(nombre_proveedor) LIKE '%KING%' OR UPPER(ruc_proveedor) = '20601234567')")
        elif pl in ("jorge_rojas", "jorge", "rojas"):
            where_clauses.append("(UPPER(nombre_proveedor) LIKE '%ROJAS%' OR UPPER(nombre_proveedor) LIKE '%JORGE%' OR UPPER(ruc_proveedor) = '10408899991')")
        else:
            where_clauses.append("UPPER(nombre_proveedor) LIKE UPPER(:prov)")
            params["prov"] = f"%{proveedor}%"

    # Descartar excluidas
    where_clauses.append("(estado_ficha_producto IS NULL OR TRIM(estado_ficha_producto) = '' OR UPPER(estado_ficha_producto) NOT LIKE 'EXCLU%')")
    where_sql = " AND ".join(where_clauses)

    reverse_map: Dict[str, Dict[str, List[str]]] = {
        "gpus": {},
        "fuentes": {},
        "cpus": {},
        "rams": {},
        "storages": {},
        "oss": {},
    }

    try:
        # 1. Marcas distintas reales
        marcas_rows = db.execute(text(f"""
            SELECT DISTINCT TRIM(marca) FROM ofertas_proveedor_history
            WHERE {where_sql} AND marca IS NOT NULL AND TRIM(marca) NOT IN ('', 'N/A', '-', 'NULL')
            ORDER BY 1 ASC
        """), params).fetchall()
        marcas = [r[0] for r in marcas_rows if r[0]]

        # 2. Especificaciones de PDF extraídas (raw_json->'specs_pdf')
        pdf_specs_query = text(f"""
            SELECT DISTINCT 
                raw_json->'specs_pdf'->>'gpu_resumen' AS gpu_res,
                raw_json->'specs_pdf'->>'graficos' AS gpu_raw,
                raw_json->'specs_pdf'->>'fuente_resumen' AS fp_res,
                raw_json->'specs_pdf'->>'fuente_poder' AS fp_raw,
                raw_json->'specs_pdf'->>'procesador' AS proc,
                raw_json->'specs_pdf'->>'ram' AS ram_val,
                raw_json->'specs_pdf'->>'storage_resumen' AS stor_res,
                raw_json->'specs_pdf'->>'almacenamiento' AS stor_raw,
                raw_json->'specs_pdf'->>'so_resumen' AS so_res,
                raw_json->'specs_pdf'->>'sistema_operativo' AS so_raw,
                raw_json->'specs_pdf'->>'monitor_hz' AS m_hz,
                raw_json->'specs_pdf'->>'panel' AS m_panel,
                raw_json->'specs_pdf'->>'resolucion' AS m_res,
                raw_json->'specs_pdf'->>'tamano_pantalla' AS m_size
            FROM ofertas_proveedor_history
            WHERE {where_sql}
              AND raw_json->'specs_pdf' IS NOT NULL
              AND raw_json->>'specs_pdf' != '{{}}'
        """)
        pdf_rows = db.execute(pdf_specs_query, params).mappings().all()

        # 3. Descripciones textuales de Perú Compras (para ítems sin PDF extraído)
        desc_query = text(f"""
            SELECT DISTINCT descripcion_producto 
            FROM ofertas_proveedor_history
            WHERE {where_sql} 
              AND descripcion_producto IS NOT NULL 
              AND TRIM(descripcion_producto) != ''
        """)
        desc_rows = db.execute(desc_query, params).fetchall()

        def _add_to_map(field_group: str, canonical_val: str, raw_val: str):
            if not canonical_val or not raw_val:
                return
            if canonical_val not in reverse_map[field_group]:
                reverse_map[field_group][canonical_val] = []
            if raw_val not in reverse_map[field_group][canonical_val]:
                reverse_map[field_group][canonical_val].append(raw_val)

        # Procesar datos de PDFs oficiales
        monitor_hz_set: Set[str] = set()
        panels_set: Set[str] = set()
        resolutions_set: Set[str] = set()
        displays_set: Set[str] = set()
        ram_techs_set: Set[str] = set()
        disco_tipos_set: Set[str] = set()
        cpu_gens_set: Set[str] = set()

        for r in pdf_rows:
            # GPU
            raw_g = r["gpu_res"] or r["gpu_raw"]
            if raw_g:
                norm_g = normalizar_tarjeta_video(raw_g)
                _add_to_map("gpus", norm_g, raw_g)

            # Fuente
            raw_fp = r["fp_res"] or r["fp_raw"]
            if raw_fp:
                norm_fp = normalizar_fuente(raw_fp)
                _add_to_map("fuentes", norm_fp, raw_fp)

            # CPU
            if r["proc"]:
                norm_cpu = normalizar_procesador(r["proc"])
                _add_to_map("cpus", norm_cpu, r["proc"])

            # RAM
            if r["ram_val"]:
                norm_ram = normalizar_ram(r["ram_val"])
                _add_to_map("rams", norm_ram, r["ram_val"])

            # Almacenamiento
            raw_st = r["stor_res"] or r["stor_raw"]
            if raw_st:
                norm_st = normalizar_almacenamiento(raw_st)
                _add_to_map("storages", norm_st, raw_st)

            # Sistema Operativo
            raw_so = r["so_res"] or r["so_raw"]
            if raw_so:
                norm_so = normalizar_so(raw_so)
                _add_to_map("oss", norm_so, raw_so)

            # Monitores
            if r["m_hz"]: monitor_hz_set.add(r["m_hz"])
            if r["m_panel"]: panels_set.add(r["m_panel"])
            if r["m_res"]: resolutions_set.add(r["m_res"])
            if r["m_size"]: displays_set.add(r["m_size"])

        # Procesar descripciones textuales para capturar piezas de productos sin PDF procesado
        for (desc,) in desc_rows:
            du = desc.upper()
            
            # GPU en descripción
            m_gpu = re.search(r'(?:TARJETA DE VIDEO|CONTROLADOR DE VIDEO|VIDEO|GRAFICOS|GRAFICA):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc, re.I)
            if m_gpu:
                raw_g = m_gpu.group(1).strip()
                norm_g = normalizar_tarjeta_video(raw_g)
                _add_to_map("gpus", norm_g, raw_g)
            elif "NVIDIA" in du or "RTX" in du or "GTX" in du or "RADEON" in du:
                m_direct_gpu = re.search(r'\b(NVIDIA(?:\s+\d+\s*GB)?|RTX\s*\d{3,4}|GTX\s*\d{3,4}|RADEON\s+RX\s*\d{3,4})\b', desc, re.I)
                if m_direct_gpu:
                    raw_g = m_direct_gpu.group(1).strip()
                    norm_g = normalizar_tarjeta_video(raw_g)
                    _add_to_map("gpus", norm_g, raw_g)

            # Fuente en descripción
            m_fp = re.search(r'(?:FUENTE(?:\s+DE\s+PODER)?|CASE|GABINETE|CHASIS):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc, re.I)
            if m_fp:
                raw_fp = m_fp.group(1).strip()
                norm_fp = normalizar_fuente(raw_fp)
                _add_to_map("fuentes", norm_fp, raw_fp)
            else:
                m_w = re.search(r'(\d{2,4}\s*WATTS?(?:\s+80\s*PLUS[^\s,;]+|\s+REALES)?)', du)
                if m_w:
                    raw_fp = m_w.group(1).strip()
                    norm_fp = normalizar_fuente(raw_fp)
                    _add_to_map("fuentes", norm_fp, raw_fp)

            # CPU en descripción
            m_proc = re.search(r'PROCESADOR:\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc, re.I)
            if m_proc:
                raw_c = m_proc.group(1).strip()
                norm_c = normalizar_procesador(raw_c)
                _add_to_map("cpus", norm_c, raw_c)

            # RAM en descripción
            m_ram = re.search(r'(?:RAM|MEMORIA):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc, re.I)
            if m_ram:
                raw_r = m_ram.group(1).strip()
                norm_r = normalizar_ram(raw_r)
                _add_to_map("rams", norm_r, raw_r)

            # Almacenamiento en descripción
            m_alm = re.search(r'(?:ALMACENAMIENTO|DISCO):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc, re.I)
            if m_alm:
                raw_st = m_alm.group(1).strip()
                norm_st = normalizar_almacenamiento(raw_st)
                _add_to_map("storages", norm_st, raw_st)

            # SO en descripción
            m_so = re.search(r'(?:SIST\.?\s*OPER(?:ATIVO)?|SISTEMA\s+OPERATIVO):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc, re.I)
            if m_so:
                raw_so = m_so.group(1).strip()
                norm_so = normalizar_so(raw_so)
                _add_to_map("oss", norm_so, raw_so)

            # RAM techs y disco tipos para retrocompatibilidad
            if "LPDDR5" in du: ram_techs_set.add("LPDDR5 / LPDDR5X")
            elif "DDR5" in du: ram_techs_set.add("DDR5")
            elif "DDR4" in du: ram_techs_set.add("DDR4")

            if "NVME" in du: disco_tipos_set.add("NVMe M.2 SSD")
            elif "M.2" in du: disco_tipos_set.add("M.2 SSD")
            elif "SSD" in du and "HDD" in du: disco_tipos_set.add("Híbrido (SSD + HDD)")
            elif "SSD" in du: disco_tipos_set.add("Solo SSD")
            elif "HDD" in du: disco_tipos_set.add("Solo HDD")

            # CPU Gen
            if re.search(r'(?:i[3579]-14\d{3}|-14\d{2}| 14\d{3}|14700|14400)', du):
                cpu_gens_set.add("14ª Gen (Intel Core i-14xxx)")
            elif re.search(r'(?:i[3579]-13\d{3}|-13\d{2}| 13\d{3}|13700|13400)', du):
                cpu_gens_set.add("13ª Gen (Intel Core i-13xxx)")
            elif re.search(r'(?:i[3579]-12\d{3}|-12\d{2}| 12\d{3}|12700|12400)', du):
                cpu_gens_set.add("12ª Gen (Intel Core i-12xxx)")
            elif re.search(r'(?:i[3579]-11\d{3}|-11\d{2}| 11\d{3}|1135G7)', du):
                cpu_gens_set.add("11ª Gen (Intel Core i-11xxx)")
            elif re.search(r'(?:i[3579]-10\d{3}|-10\d{2}| 10\d{3}|10100)', du):
                cpu_gens_set.add("10ª Gen (Intel Core i-10xxx)")
            elif "CORE ULTRA" in du:
                cpu_gens_set.add("Core Ultra (Series 1)")
            elif "RYZEN" in du and re.search(r'[78]\d{3}', du):
                cpu_gens_set.add("AMD Ryzen 7000 / 8000")
            elif "RYZEN" in du and "5000" in du:
                cpu_gens_set.add("AMD Ryzen 5000")

            # Monitores en descripción
            if "IPS" in du: panels_set.add("IPS")
            elif "VA" in du: panels_set.add("VA")
            elif "TN" in du: panels_set.add("TN")
            elif "OLED" in du: panels_set.add("OLED")

            m_hz = re.search(r'\b(60|75|100|120|144|165|180|240)\s*HZ\b', du)
            if m_hz: monitor_hz_set.add(f"{m_hz.group(1)} Hz")

            m_res = re.search(r'(\d{3,4}\s*[Xx]\s*\d{3,4})', du)
            if m_res: resolutions_set.add(m_res.group(1).replace(' ', ''))
            elif "FHD" in du or "1920" in du: resolutions_set.add("1920x1080 FHD")

            m_pulg = re.search(r'(\d+(?:\.\d+)?)\s*(?:\"|PULGADAS)', desc, re.I)
            if m_pulg: displays_set.add(f'{m_pulg.group(1)}" Pulgadas')

        # Ordenar listas canónicas de forma lógica
        def _sort_fuente(x: str) -> int:
            m = re.search(r'(\d+)', x)
            return int(m.group(1)) if m else 0

        def _sort_ram(x: str) -> int:
            m = re.search(r'(\d+)', x)
            return int(m.group(1)) if m else 0

        def _sort_display(x: str) -> float:
            m = re.search(r'(\d+(?:\.\d+)?)', x)
            return float(m.group(1)) if m else 0.0

        gpus_sorted = sorted(reverse_map["gpus"].keys())
        fuentes_sorted = sorted(reverse_map["fuentes"].keys(), key=_sort_fuente)
        cpus_sorted = sorted(reverse_map["cpus"].keys())
        rams_sorted = sorted(reverse_map["rams"].keys(), key=_sort_ram)
        storages_sorted = sorted(reverse_map["storages"].keys())
        oss_sorted = sorted(reverse_map["oss"].keys())
        displays_sorted = sorted(displays_set, key=_sort_display)
        panels_sorted = sorted(panels_set)
        resolutions_sorted = sorted(resolutions_set)
        monitor_hz_sorted = sorted(monitor_hz_set, key=lambda x: int(re.search(r'\d+', x).group(0)) if re.search(r'\d+', x) else 0)

        # Si gpus o fuentes están vacíos por falta de extracción previa en la categoría, proveer defaults limpios
        if not gpus_sorted and "escritorio" in (categoria or "").lower():
            gpus_sorted = ["Intel UHD Graphics", "NVIDIA 4 GB", "NVIDIA GeForce RTX 3050 6 GB", "NVIDIA GeForce RTX 4060 8 GB"]
        if not fuentes_sorted and "escritorio" in (categoria or "").lower():
            fuentes_sorted = ["300W", "300W • 80+ Bronze", "450W • 80+ Bronze", "500W", "600W • 80+ Gold"]

        result = {
            "marcas": marcas,
            "gpus": gpus_sorted,
            "fuentes": fuentes_sorted,
            "cpus": cpus_sorted,
            "cpu_gens": sorted(cpu_gens_set),
            "rams": rams_sorted,
            "ram_techs": sorted(ram_techs_set),
            "storages": storages_sorted,
            "disco_tipos": sorted(disco_tipos_set),
            "oss": oss_sorted,
            "displays": displays_sorted,
            "panels": panels_sorted,
            "resolutions": resolutions_sorted,
            "monitor_hz": monitor_hz_sorted,
        }

        # Guardar en caché
        _FILTERS_CACHE[ctx_key] = result
        _REVERSE_MAP_CACHE[ctx_key] = reverse_map
        _CACHE_TIMESTAMPS[ctx_key] = now
        return result

    except Exception as e:
        import logging
        logging.getLogger("ceam.dynamic_filters").exception("Error generando filtros dinámicos: %s", e)
        return {
            "marcas": [],
            "gpus": [],
            "fuentes": [],
            "cpus": [],
            "rams": [],
            "storages": [],
            "oss": [],
            "displays": [],
            "panels": [],
            "resolutions": [],
            "monitor_hz": [],
        }


# ═══════════════════════════════════════════════════════════════════════════
# 4. EXPANSIÓN INVERSA PARA CLÁUSULAS SQL (REVERSE LOOKUP)
# ═══════════════════════════════════════════════════════════════════════════

def obtener_crudos_para_canonico(
    grupo: str,
    valor_canonico: str,
    categoria: Optional[str] = None,
    proveedor: Optional[str] = None,
) -> List[str]:
    """
    Dada una opción canónica seleccionada en la interfaz (ej. '300W • 80+ Bronze'),
    retorna todos los valores crudos exactos existentes en BD que corresponden a ella.
    """
    ctx_key = _build_context_key(categoria, proveedor)
    cached_map = _REVERSE_MAP_CACHE.get(ctx_key, {})
    group_map = cached_map.get(grupo, {})
    if valor_canonico in group_map:
        return group_map[valor_canonico]
    val_lower = valor_canonico.lower().strip()
    for k, v in group_map.items():
        if k.lower().strip() == val_lower:
            return v
    return [valor_canonico]
