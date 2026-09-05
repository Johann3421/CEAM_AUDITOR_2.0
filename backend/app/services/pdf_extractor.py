"""
Servicio de Extracción de Especificaciones Técnicas desde Fichas PDF
Proyecto: CEAM AUDITOR 2.0
Extrae campos estructurados para Computadoras, Laptops, Monitores y Suministros.
Soporta:
  - Computadoras: Procesador, RAM, Almacenamiento (SSD/HDD), Tarjeta Gráfica (GPU dedicada/integrada),
    Fuente de Poder (Watts + certificación 80 Plus), Chipset, Formato (Torre, SFF, etc.),
    Sistema Operativo, Puertos y Conectividad.
  - Monitores: Pulgadas, Panel (IPS/VA/TN), Resolución, Tasa de refresco (Hz),
    Tiempo de respuesta (ms), Brillo (cd/m²), Contraste, Conectores de video y Altavoces.
"""

import re
import unicodedata
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import requests
from pypdf import PdfReader


def descargar_pdf(url: str, timeout: int = 25) -> Optional[bytes]:
    """Descarga un PDF desde una URL remota con cabeceras estándar."""
    if not url or url == "#" or not url.startswith(("http://", "https://")):
        return None
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CEAM-Auditor/2.0"
        }
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        
        ctype = resp.headers.get("Content-Type", "").lower()
        if "html" in ctype and "pdf" not in ctype:
            return None
            
        return resp.content
    except Exception:
        return None


def leer_bytes_pdf(origen: Union[str, Path, bytes, BytesIO]) -> Optional[bytes]:
    """Obtiene los bytes a partir de una URL, ruta local o buffer en memoria."""
    if isinstance(origen, bytes):
        return origen
    if isinstance(origen, BytesIO):
        return origen.getvalue()
    if isinstance(origen, (str, Path)):
        s_origen = str(origen).strip()
        if s_origen.startswith(("http://", "https://")):
            return descargar_pdf(s_origen)
        p = Path(s_origen)
        if p.is_file():
            return p.read_bytes()
    return None


def extraer_texto_crudo(pdf_bytes: bytes) -> str:
    """Extrae el texto completo de todas las páginas del PDF con pypdf."""
    if not pdf_bytes:
        return ""
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        paginas_texto = []
        for page in reader.pages:
            txt = page.extract_text() or ""
            paginas_texto.append(txt)
        return "\n".join(paginas_texto)
    except Exception:
        return ""


def sanitizar_valor(valor: str) -> Optional[str]:
    """Limpia notas al pie, espacios y valores vacíos/nulos."""
    if not valor:
        return None
        
    texto = str(valor).strip()
    texto = re.sub(r"^[\u00B9\u00B2\u00B3\u2070-\u2079\*\#\s]+", "", texto)
    texto = texto.strip(" :;,.-\t\r\n")
    texto = re.sub(r"\s+", " ", texto)
    
    if not texto:
        return None
        
    upper = texto.upper()
    valores_nulos = {"N/A", "NA", "-", "--", "NULL", "NONE", "NO APLICA", "NO ESPECIFICA", "NO ESPECIFICADO"}
    if upper in valores_nulos:
        return None
        
    return texto


# ═══════════════════════════════════════════════════════════════════════════
# EXTRACTOR ESPECÍFICO PARA COMPUTADORAS Y LAPTOPS
# ═══════════════════════════════════════════════════════════════════════════

TOKENS_PC_ORDENADOS = [
    ('chipset', ['Chipset', 'Placa Madre', 'Mainboard']),
    ('procesador', ['Procesador', 'CPU']),
    ('ram', ['Memoria RAM', 'Memoria', 'RAM']),
    ('almacenamiento', ['Almacenamiento', 'Disco Duro', 'Unidad de Almacenamiento']),
    ('unidad_optica', ['Unidad Óptica', 'Unidad optica', 'Unidad de DVD', 'DVD']),
    ('graficos', ['Unidad de video', 'Tarjeta de Video', 'Tarjeta Gráfica', 'Tarjeta Grafica', 'Controlador de video', 'Gráficos', 'Graficos', 'Video']),
    ('conectividad', ['Conectividad Inalámbrica', 'Conectividad Inalambrica', 'Conectividad', 'Red']),
    ('panel_frontal', ['Panel frontal', 'Puertos frontales']),
    ('panel_posterior', ['Panel posterior', 'Puertos posteriores']),
    ('puertos_video', ['Puertos de Video', 'Salidas de Video', 'Conectores de Video']),
    ('formato', ['Formato', 'Factor de Forma', 'Factorde Forma']),
    ('fuente_poder', ['Fuente de poder', 'Potencia Fuente', 'Fuente']),
    ('teclado', ['Teclado']),
    ('mouse', ['Mouse', 'Ratón']),
    ('sistema_operativo', ['Sistema Operativo', 'Sist. Oper', 'S.O.']),
    ('suite_ofimatica', ['Office Pre-Instalado', 'Suite Ofimática', 'Suite Ofimatica', 'Office']),
    ('garantia', ['Garantía de Fábrica', 'Garantía', 'Garantia', 'G. F']),
]


def extraer_specs_pc(raw_text: str) -> Dict[str, str]:
    """Segmenta el PDF de una PC localizando encabezados en inicio de línea."""
    matches = []
    for key, variants in TOKENS_PC_ORDENADOS:
        for tok in variants:
            # Buscar el token preferentemente al inicio de línea o tras un salto de línea
            patron = rf'(?:^|\n)[ \t]*{re.escape(tok)}[:\s]+([^\n\r]*)'
            for m in re.finditer(patron, raw_text, re.I):
                matches.append((m.start(), key, tok, m.group(1).strip()))

    if not matches:
        return {}

    # Ordenar por posición de aparición en el texto
    matches.sort(key=lambda x: x[0])
    specs: Dict[str, str] = {}

    for idx, (pos, key, tok, first_line) in enumerate(matches):
        if key in specs:
            continue
        # El límite del bloque es la posición del siguiente encabezado
        end_pos = matches[idx + 1][0] if idx + 1 < len(matches) else pos + 400
        chunk = raw_text[pos:end_pos].strip()
        
        # Eliminar el nombre del token del inicio
        val = re.sub(rf'^[ \t]*{re.escape(tok)}[:\s]*', '', chunk, flags=re.I).strip()
        val = re.sub(r'\s+', ' ', val)
        val_limpio = sanitizar_valor(val)
        if val_limpio:
            specs[key] = val_limpio

    return specs


# ═══════════════════════════════════════════════════════════════════════════
# EXTRACTOR ESPECÍFICO PARA MONITORES
# ═══════════════════════════════════════════════════════════════════════════

TOKENS_MONITOR_MAP = [
    ('tamano_pantalla', ['Tamaño de la Pantalla', 'Tamaño de Pantalla', 'Tamaño Pantalla', 'Tamaño', 'Dimension de la Pantalla', 'PANTALLA']),
    ('resolucion', ['Resolución nativa', 'Resolución de la Pantalla', 'Resolución de Pantalla', 'Resolución Pantalla', 'Resolución Máxima', 'Resolución Nativa', 'Resolución', 'RESOLUCION']),
    ('panel', ['Tecnología del Panel', 'Tipo de Panel', 'Tecnología de Panel', 'Panel']),
    ('tecnologia_pantalla', ['Tecnología de la Pantalla', 'Tecnología de Pantalla', 'Tecnología', 'Tipo de Pantalla']),
    ('brillo', ['Brillo de la Pantalla', 'Brillo de Pantalla', 'Brillo', 'Luminancia']),
    ('contraste', ['Relación de Contraste', 'Contraste Dinámico', 'Contraste Estático', 'Contraste']),
    ('frecuencia_actualizacion', ['Frecuencia de actualización', 'Frecuencia de Actualización', 'Tasa de Refresco', 'Frecuencia de Refresco', 'Frecuencia', 'Tasa de refresco']),
    ('tiempo_respuesta', ['Tiempo de respuesta', 'Tiempo de Respuesta', 'Response Time']),
    ('angulo_vision', ['Ángulo de visualización', 'Ángulo de Visión', 'Ángulos de Visión', 'Angulo de Vision']),
    ('relacion_aspecto', ['Relación aspecto', 'Relación de Aspecto', 'Proporción de Aspecto', 'Aspect Ratio']),
    ('interfaz_video', ['Interfaz de video', 'Conectores de video', 'Puertos de video', 'Entradas de video', 'Conectividad']),
    ('altavoces', ['Speaker', 'Altavoces', 'Parlantes', 'Audio Integrado', 'Altavoz']),
    ('base_ergonomica', ['Base ergonómica', 'Base', 'Soporte']),
    ('montaje_vesa', ['Montaje VESA', 'Compatibilidad VESA', 'VESA']),
    ('garantia', ['Garantía del Fabricante', 'Garantía de Fábrica', 'Garantía', 'Tiempo de Garantía']),
]


def extraer_specs_monitor(raw_text: str) -> Dict[str, str]:
    """Extrae campos de monitores manejando etiquetas en la misma línea o en línea previa."""
    lines = [l.strip() for l in raw_text.splitlines() if l.strip()]
    specs: Dict[str, str] = {}

    for i, line in enumerate(lines):
        for k, labels in TOKENS_MONITOR_MAP:
            if k in specs:
                continue
            for lbl in labels:
                m = re.match(rf'^{re.escape(lbl)}[:\s]*(.*)', line, re.I)
                if m:
                    val = m.group(1).strip()
                    # Si la etiqueta estaba sola en la línea, tomar la siguiente
                    if (not val or len(val) <= 1) and i + 1 < len(lines):
                        val = lines[i + 1].strip()
                    val_limpio = sanitizar_valor(val)
                    if val_limpio:
                        specs[k] = val_limpio
                        break

    return specs


# ═══════════════════════════════════════════════════════════════════════════
# FALLBACK DE DESCRIPCIÓN DE PERÚ COMPRAS
# ═══════════════════════════════════════════════════════════════════════════

def fallback_descripcion(desc_raw: str, categoria: str = "") -> Dict[str, str]:
    """Extrae especificaciones desde la descripción textual de Perú Compras si no hay PDF."""
    specs: Dict[str, str] = {}
    if not desc_raw:
        return specs
    
    desc = desc_raw.upper()
    cat = (categoria or "").upper()

    if "MONITOR" in cat or "PANTALLA" in cat:
        size_m = re.search(r'(\d+(?:\.\d+)?)"', desc)
        if size_m:
            specs["tamano_pantalla"] = f'{size_m.group(1)}" Pulgadas'
        res_m = re.search(r'(\d{3,4})\s*[Xx]\s*(\d{3,4})', desc)
        if res_m:
            specs["resolucion"] = f'{res_m.group(1)}x{res_m.group(2)}'
        elif "FHD" in desc or "1080" in desc:
            specs["resolucion"] = "1920x1080 FHD"
        if "IPS" in desc:
            specs["panel"] = "IPS"
        elif "VA" in desc:
            specs["panel"] = "VA"
        elif "TN" in desc:
            specs["panel"] = "TN"
        
        m_hz = re.search(r'\b(60|75|100|120|144|165|180|240)\s*HZ\b', desc)
        if m_hz:
            specs["frecuencia_actualizacion"] = f"{m_hz.group(1)} Hz"
        m_ms = re.search(r'\b(\d+(?:\.\d+)?)\s*MS\b', desc)
        if m_ms:
            specs["tiempo_respuesta"] = f"{m_ms.group(1)} ms"
    else:
        # PCs y Laptops
        proc_m = re.search(r'PROCESADOR:\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
        if proc_m:
            specs["procesador"] = sanitizar_valor(proc_m.group(1))
            
        ram_m = re.search(r'RAM:\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
        if ram_m:
            specs["ram"] = sanitizar_valor(ram_m.group(1))
            
        alm_m = re.search(r'ALMACENAMIENTO:\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
        if alm_m:
            specs["almacenamiento"] = sanitizar_valor(alm_m.group(1))
            
        so_m = re.search(r'(?:SIST\.?\s*OPER(?:ATIVO)?|SISTEMA\s+OPERATIVO):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
        if so_m:
            specs["sistema_operativo"] = sanitizar_valor(so_m.group(1))

        # Detección de video y fuente en descripción
        if "VIDEO: DEDICADO" in desc or "TARJETA DE VIDEO" in desc or "RTX" in desc or "GTX" in desc or "RADEON" in desc:
            m_gpu = re.search(r'(?:VIDEO|TARJETA DE VIDEO):\s*([^;]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
            if m_gpu:
                specs["graficos"] = sanitizar_valor(m_gpu.group(1))
            else:
                specs["graficos"] = "Tarjeta de Video Dedicada"

        m_fp = re.search(r'(\d+)\s*WATTS?', desc)
        if m_fp:
            specs["fuente_poder"] = f"{m_fp.group(1)} Watts"

    return {k: v for k, v in specs.items() if v is not None}


# ═══════════════════════════════════════════════════════════════════════════
# NORMALIZADOR ESTRUCTURADO (CAMPOS RESUMIDOS PARA TABLA Y FILTROS)
# ═══════════════════════════════════════════════════════════════════════════

def normalizar_campos_clave(raw_specs: Dict[str, Any], categoria: str = "") -> Dict[str, Any]:
    """
    Transforma y limpia los valores del PDF o descripción en métricas estándar para UI:
    - gpu_tipo: 'Dedicada' / 'Integrada'
    - gpu_resumen: 'NVIDIA RTX 4060 8GB' / 'Dedicado 4GB PCIe' / 'Intel UHD Graphics'
    - fuente_resumen: '600W • 80+ Bronze' / '500W'
    - so_resumen: 'Windows 11 Pro' / 'Sin SO (No incluido)' / 'Linux'
    - storage_resumen: '1 TB SSD' / '500 GB SSD' / '1 TB HDD'
    - monitor_hz: '100 Hz', '144 Hz', etc.
    - monitor_ms: '1 ms', '4 ms', etc.
    - monitor_brillo: '300 cd/m²', etc.
    - monitor_contraste: '1200:1', etc.
    """
    out = dict(raw_specs)

    # 1. Normalización de Tarjeta Gráfica (GPU)
    graf = raw_specs.get("graficos") or ""
    graf_u = graf.upper()
    if graf:
        if any(w in graf_u for w in ["DEDICAD", "PCIE", "RTX", "GTX", "RADEON", "GEFORCE", "04 GB", "4 GB", "6 GB", "8 GB", "12 GB", "16 GB", "DISCRETA"]):
            out["gpu_tipo"] = "Dedicada"
        elif any(w in graf_u for w in ["INTEGRAD", "UHD", "IRIS", "RADEON GRAPHICS", "VEGA", "NO INCLUYE DEDICADA"]):
            out["gpu_tipo"] = "Integrada"
        else:
            out["gpu_tipo"] = "Integrada" if "INTEGR" in graf_u else "Dedicada"
        out["gpu_resumen"] = graf[:50]

    # 2. Normalización de Fuente de Poder
    fp = raw_specs.get("fuente_poder") or ""
    if fp:
        m_watts = re.search(r'(\d+)\s*(?:Watts?|W\b)', fp, re.IGNORECASE)
        watts = f"{m_watts.group(1)}W" if m_watts else ""
        cert = ""
        fp_u = fp.upper()
        if "80 PLUS TITANIUM" in fp_u: cert = "80+ Titanium"
        elif "80 PLUS PLATINUM" in fp_u: cert = "80+ Platinum"
        elif "80 PLUS GOLD" in fp_u: cert = "80+ Gold"
        elif "80 PLUS SILVER" in fp_u: cert = "80+ Silver"
        elif "80 PLUS BRONZE" in fp_u: cert = "80+ Bronze"
        elif "80 PLUS" in fp_u or "80+" in fp_u: cert = "80+ White"
        
        parts = [p for p in [watts, cert] if p]
        out["fuente_resumen"] = " • ".join(parts) if parts else fp[:40]

    # 3. Normalización de Sistema Operativo
    so_raw = (raw_specs.get("sistema_operativo") or "").upper()
    if so_raw:
        if any(w in so_raw for w in ["NO INCLUID", "NO INCLUYE", "SIN SISTEMA", "SIN SO", "NINGUNO", "FREEDOS", "FREE DOS", "DOS"]):
            out["so_resumen"] = "Sin SO (No incluido)"
        elif any(w in so_raw for w in ["WINDOWS 11 PRO", "WIN 11 PRO", "W11 PRO", "W11P"]):
            out["so_resumen"] = "Windows 11 Pro"
        elif any(w in so_raw for w in ["WINDOWS 11 HOME", "WIN 11 HOME", "W11 HOME", "W11H"]):
            out["so_resumen"] = "Windows 11 Home"
        elif any(w in so_raw for w in ["WINDOWS 10 PRO", "WIN 10 PRO", "W10 PRO"]):
            out["so_resumen"] = "Windows 10 Pro"
        elif any(w in so_raw for w in ["LINUX", "UBUNTU", "FEDORA"]):
            out["so_resumen"] = "Linux / Ubuntu"
        else:
            out["so_resumen"] = raw_specs.get("sistema_operativo")[:30]

    # 4. Normalización de Almacenamiento
    alm_raw = raw_specs.get("almacenamiento") or ""
    if alm_raw:
        m_size = re.search(r'(\d+)\s*(GB|TB)', alm_raw, re.IGNORECASE)
        tipo = "HDD" if ("HDD" in alm_raw.upper() and "SSD" not in alm_raw.upper()) else "SSD"
        if m_size:
            out["storage_resumen"] = f"{m_size.group(1)} {m_size.group(2).upper()} {tipo}"

    # 5. Normalización de Monitores (Hz, ms, brillo, contraste)
    if "MONITOR" in (categoria or "").upper() or "PANTALLA" in (categoria or "").upper():
        frec = raw_specs.get("frecuencia_actualizacion") or ""
        m_hz = re.search(r'(\d{2,3})\s*Hz\b', frec, re.IGNORECASE)
        if m_hz:
            out["monitor_hz"] = f"{m_hz.group(1)} Hz"

        ms_raw = raw_specs.get("tiempo_respuesta") or ""
        m_ms = re.search(r'(\d+(?:\.\d+)?)\s*ms\b', ms_raw, re.IGNORECASE)
        if m_ms:
            out["monitor_ms"] = f"{m_ms.group(1)} ms"

        brillo_raw = raw_specs.get("brillo") or ""
        m_brillo = re.search(r'(\d+)\s*(?:cd/m²|nits?|cd/m2)', brillo_raw, re.IGNORECASE)
        if m_brillo:
            out["monitor_brillo"] = f"{m_brillo.group(1)} cd/m²"

        cont_raw = raw_specs.get("contraste") or ""
        m_cont = re.search(r'(\d+:\d+)', cont_raw)
        if m_cont:
            out["monitor_contraste"] = m_cont.group(1)

        pan_raw = (raw_specs.get("panel") or "").upper()
        if "IPS" in pan_raw: out["panel"] = "IPS"
        elif "VA" in pan_raw: out["panel"] = "VA"
        elif "TN" in pan_raw: out["panel"] = "TN"

    return out


# ═══════════════════════════════════════════════════════════════════════════
# ENTRADA PRINCIPAL
# ═══════════════════════════════════════════════════════════════════════════

def extraer_especificaciones_pdf(
    origen: Union[str, Path, bytes, BytesIO],
    categoria: str = "COMPUTADORA",
    descripcion_fallback: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Función unificada para extraer especificaciones técnicas desde un PDF.

    Parámetros:
        origen: URL (http/https), ruta local (Path/str) o bytes del PDF.
        categoria: 'COMPUTADORA', 'LAPTOP', 'MONITOR', etc.
        descripcion_fallback: Texto de descripción de la BD si el PDF no contiene texto legible.

    Retorna:
        Dict con los campos extraídos normalizados.
    """
    pdf_bytes = leer_bytes_pdf(origen)
    if not pdf_bytes:
        raw_fb = fallback_descripcion(descripcion_fallback or "", categoria)
        return normalizar_campos_clave(raw_fb, categoria)

    texto = extraer_texto_crudo(pdf_bytes)
    if not texto.strip():
        raw_fb = fallback_descripcion(descripcion_fallback or "", categoria)
        return normalizar_campos_clave(raw_fb, categoria)

    cat_upper = (categoria or "").upper()

    if "MONITOR" in cat_upper or "PANTALLA" in cat_upper:
        specs = extraer_specs_monitor(texto)
        if not specs.get("tamano_pantalla") and descripcion_fallback:
            fb = fallback_descripcion(descripcion_fallback, categoria)
            specs = {**fb, **specs}
        return normalizar_campos_clave(specs, categoria)
    else:
        specs = extraer_specs_pc(texto)
        # Si faltaron campos clave en el PDF y hay fallback de texto, complementar
        if (not specs.get("procesador") or not specs.get("almacenamiento") or not specs.get("sistema_operativo")) and descripcion_fallback:
            fb = fallback_descripcion(descripcion_fallback, categoria)
            for k, v in fb.items():
                if k not in specs:
                    specs[k] = v
        return normalizar_campos_clave(specs, categoria)
