# 📋 PROMPT: Implementación de Extracción de Campos de PDFs para CEAM AUDITOR

> **Instrucciones para el Agente / Desarrollador en `CEAM AUDITOR`**:  
> Copia y pega el siguiente prompt en el asistente de tu proyecto `CEAM_AUDITOR_2.0` (o ejecútalo como guía técnica paso a paso).

---

```markdown
# 🎯 TAREA: Implementar Módulo de Extracción de Especificaciones Técnicas desde PDFs (Fichas Técnicas Perú Compras)

## 📌 Contexto
En el proyecto necesitamos extraer automáticamente campos estructurados clave (procesador, memoria RAM, almacenamiento, tarjeta gráfica, formato, puertos, garantía, specs de monitores y tóners) a partir de los PDFs de fichas técnicas de Perú Compras (guardados localmente o descargados vía URL desde Azure CDN / portales estatales).

Actualmente en el ecosistema contamos con la lógica probada de tokenización y sanitización de fichas técnicas (utilizada en Kenya Tienda con `SyncFichasCommand`), y requerimos integrarla en Python dentro de `CEAM_AUDITOR_2.0` (FastAPI + Pydantic + Celery / Scripts de auditoría).

---

## 📦 1. Dependencias Requeridas

Instala las siguientes librerías en el entorno virtual (`venv`) de backend:

```bash
pip install pypdf requests pdfplumber
```

O agrégalas al `requirements.txt`:
```text
pypdf>=4.0.0
requests>=2.31.0
pdfplumber>=0.10.0
```

> **Nota:** `pypdf` es la librería principal (rápida, ligera, 100% Python, no requiere binarios de sistema como Poppler ni Tesseract). `pdfplumber` es opcional como motor secundario para tablas complejas.

---

## 🛠️ 2. Archivo del Servicio: `backend/app/services/pdf_extractor.py`

Crea o actualiza el archivo `backend/app/services/pdf_extractor.py` con el siguiente código completo y listo para producción:

```python
"""
Servicio de Extracción de Especificaciones Técnicas desde Fichas PDF
Proyecto: CEAM AUDITOR 2.0
Extrae campos estructurados para Computadoras, Laptops, Monitores y Tóners.
"""

import re
import unicodedata
from io import BytesIO
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union
import requests
from pypdf import PdfReader


# ═══════════════════════════════════════════════════════════════════════════
# DICCIONARIOS DE TOKENS Y CAMPOS (PERÚ COMPRAS / FICHAS TÉCNICAS)
# ═══════════════════════════════════════════════════════════════════════════

# Tokens para Computadoras de Escritorio / Laptops / Workstations
TOKENS_PC: Dict[str, str] = {
    # Ordenados preferentemente: tokens más específicos primero
    "TIPO DE PRODUCTO": "tipo_producto",
    "FORMATO": "formato",
    "FACTOR DE FORMA": "formato",
    "FACTORDE FORMA": "formato",
    "PROCESADOR": "procesador",
    "MEMORIA RAM": "ram",
    "RAM": "ram",
    "ALMACENAMIENTO": "almacenamiento",
    "TARJETA GRAFICA": "graficos",
    "TARJETA GRÁFICA": "graficos",
    "GRAFICOS": "graficos",
    "GRÁFICOS": "graficos",
    "VIDEO": "graficos",
    "GPU": "graficos",
    "SISTEMA OPERATIVO": "sistema_operativo",
    "SIST. OPER": "sistema_operativo",
    "SUITE OFIMATICA PRE-INSTALADA": "suite_ofimatica",
    "SUITE OFIMÁTICA PRE-INSTALADA": "suite_ofimatica",
    "SUITE OFIMATICA": "suite_ofimatica",
    "SUITE OFIMÁTICA": "suite_ofimatica",
    "SONIDO": "sonido",
    "CHIPSET": "chipset",
    "LAN": "conectividad_lan",
    "WLAN": "conectividad_wlan",
    "CONECTIVIDAD INALAMBRICA": "conectividad_wlan",
    "BLUETOOTH": "bluetooth",
    "USB": "conectividad_usb",
    "PUERTOS USB": "conectividad_usb",
    "VIDEO VGA": "video_vga",
    "VGA": "video_vga",
    "VIDEO HDMI": "video_hdmi",
    "HDMI": "video_hdmi",
    "DISPLAYPORT": "displayport",
    "PUERTOS MINIMOS": "puertos_minimos",
    "PUERTOS MÍNIMOS": "puertos_minimos",
    "SLOT DE EXPANSION": "slot_expansion",
    "SLOT DE EXPANSIÓN": "slot_expansion",
    "FUENTE DE PODER": "fuente_poder",
    "POTENCIA FUENTE": "fuente_poder",
    "GARANTIA DE FABRICA": "garantia_de_fabrica",
    "GARANTÍA DE FÁBRICA": "garantia_de_fabrica",
    "GARANTIA": "garantia_de_fabrica",
    "GARANTÍA": "garantia_de_fabrica",
    "G. F": "garantia_de_fabrica",
    "TECLADO": "teclado",
    "MOUSE": "mouse",
    "PANTALLA": "pantalla",
    "UNIDAD OPTICA": "unidad_optica",
    "UNIDAD ÓPTICA": "unidad_optica",
    "EMPAQUE": "empaque",
    "CERTIFICACIONES": "certificaciones",
    "ACCESORIOS Y OTROS": "accesorios_otros",
    "ACCESORIOSY OTROS": "accesorios_otros",
    "ACCESORIOS": "accesorios_otros",
    "OTROS": "accesorios_otros",
    "SIST. MANEJO RAEE": "sistema_raee",
    "SISTEMA DE MANEJO DE RAEE": "sistema_raee",
}

# Tokens para Monitores
TOKENS_MONITOR: Dict[str, List[str]] = {
    "tamano_pantalla": [
        "Tamaño de la Pantalla", "Tamaño de Pantalla", "Tamaño Pantalla",
        "Dimension de la Pantalla", "Diagonal de Pantalla", "PANTALLA",
    ],
    "resolucion": [
        "Resolución de la Pantalla", "Resolución de Pantalla", "Resolución Pantalla",
        "Resolución Máxima", "Resolución Nativa", "Resolución", "RESOLUCION",
    ],
    "panel": [
        "Tecnología del Panel", "Tipo de Panel", "Tecnología de Panel", "Panel",
    ],
    "tecnologia_pantalla": [
        "Tecnología de la Pantalla", "Tecnología de Pantalla", "Tipo de Pantalla",
    ],
    "relacion_aspecto": [
        "Relación de Aspecto", "Proporción de Aspecto", "Aspect Ratio",
    ],
    "brillo": [
        "Brillo de la Pantalla", "Brillo de Pantalla", "Brillo", "Luminancia",
    ],
    "contraste": [
        "Relación de Contraste", "Contraste Dinámico", "Contraste Estático", "Contraste",
    ],
    "angulo_vision": [
        "Ángulo de Visión", "Ángulo de Visualización", "Ángulos de Visión", "Angulo de Vision",
    ],
    "frecuencia_actualizacion": [
        "Frecuencia de Actualización", "Tasa de Refresco", "Frecuencia de Refresco", "Frecuencia",
    ],
    "tiempo_respuesta": [
        "Tiempo de Respuesta", "Response Time",
    ],
    "hdmi": [
        "Conector HDMI", "Puerto HDMI", "Entrada HDMI", "HDMI",
    ],
    "displayport": [
        "Conector DisplayPort", "Puerto DisplayPort", "DisplayPort", "DP",
    ],
    "vga": [
        "Conector VGA", "Puerto VGA", "Entrada VGA", "VGA", "D-Sub",
    ],
    "usb": [
        "Conector USB", "Puerto USB", "Concentrador USB", "USB Hub", "USB",
    ],
    "audio_altavoces": [
        "Altavoces", "Parlantes", "Audio Integrado", "Altavoz",
    ],
    "montaje_vesa": [
        "Montaje VESA", "Compatibilidad VESA", "VESA",
    ],
    "garantia_de_fabrica": [
        "Garantía del Fabricante", "Garantía de Fábrica", "Garantía", "Tiempo de Garantía",
    ],
    "certificaciones": [
        "Certificaciones", "Certificación", "Normas",
    ],
}

# Tokens para Tóner y Suministros
TOKENS_TONER: Dict[str, str] = {
    "TIPO DE SUMINISTRO DE IMPRESION": "tipo_suministro",
    "TIPO DE SUMINISTRO DE IMPRESIÓN": "tipo_suministro",
    "TIPO DE SUMINISTRO": "tipo_suministro",
    "DESCRIPCION": "descripcion_toner",
    "DESCRIPCIÓN": "descripcion_toner",
    "MODELO DE SUMINISTRO": "modelo_toner",
    "MODELO": "modelo_toner",
    "COLOR": "color_toner",
    "RENDIMIENTO APROXIMADO": "rendimiento",
    "RENDIMIENTO": "rendimiento",
    "GARANTIA DE FABRICA": "garantia_de_fabrica",
    "GARANTÍA DE FÁBRICA": "garantia_de_fabrica",
    "SISTEMA DE MANEJO DE RAEE": "sistema_raee",
    "SIST. MANEJO RAEE": "sistema_raee",
    "NUMERO DE PARTE DEL FABRICANTE": "numero_parte_ref",
    "NÚMERO DE PARTE DEL FABRICANTE": "numero_parte_ref",
    "NUMERO DE PARTE": "numero_parte_ref",
    "NÚMERO DE PARTE": "numero_parte_ref",
    "NRO DE PARTE": "numero_parte_ref",
    "N° DE PARTE": "numero_parte_ref",
    "Nº DE PARTE": "numero_parte_ref",
    "UNIDADES POR CAJA": "unidad",
    "UNIDAD CAJA": "unidad",
    "DIMENSIONES": "dimensiones",
    "EMPAQUE": "empaque",
    "CERTIFICACIONES": "certificaciones",
}

# Marcadores de fin de ficha técnica (detienen la captura del último token)
MARCADORES_FIN: List[str] = [
    "UNIDAD KENYA TECHNOLOGY",
    "SIST. MANEJO RAEE",
    "SISTEMA DE MANEJO DE RAEE",
    "WWW.",
    "HTTP://",
    "HTTPS://",
    "PÁGINA",
    "PAGINA",
    "PORTAL DE PERU COMPRAS",
]


# ═══════════════════════════════════════════════════════════════════════════
# FUNCIONES DE EXTRACCIÓN Y LIMPIEZA
# ═══════════════════════════════════════════════════════════════════════════

def descargar_pdf(url: str, timeout: int = 30) -> Optional[bytes]:
    """Descarga un PDF desde una URL remota."""
    try:
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) CEAM-Auditor/2.0"
        }
        resp = requests.get(url, headers=headers, timeout=timeout)
        resp.raise_for_status()
        
        # Validar content-type mínimo
        ctype = resp.headers.get("Content-Type", "").lower()
        if "html" in ctype and "pdf" not in ctype:
            return None
            
        return resp.content
    except Exception as exc:
        print(f"[PDFExtractor] Error descargando {url}: {exc}")
        return None


def leer_bytes_pdf(origen: Union[str, Path, bytes, BytesIO]) -> Optional[bytes]:
    """Obtiene los bytes a partir de una URL, ruta de archivo o buffer en memoria."""
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
    """Extrae el texto completo concatenado de todas las páginas del PDF."""
    if not pdf_bytes:
        return ""
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        paginas_texto = []
        for i, page in enumerate(reader.pages):
            txt = page.extract_text() or ""
            paginas_texto.append(txt)
        return "\n".join(paginas_texto)
    except Exception as e:
        print(f"[PDFExtractor] Error leyendo PDF con pypdf: {e}")
        return ""


def sanitizar_valor(valor: str) -> Optional[str]:
    """
    Limpia y normaliza el valor extraído:
    - Elimina superíndices de notas al pie (¹, ², ³, etc.)
    - Quita dos puntos, comas, puntos o espacios al inicio/fin
    - Descarta valores no representativos (N/A, NULL, -, NO ESPECIFICADO)
    """
    if not valor:
        return None
        
    texto = str(valor).strip()
    
    # Quitar marcadores de nota al pie al inicio
    texto = re.sub(r"^[\u00B9\u00B2\u00B3\u2070-\u2079\*\#\s]+", "", texto)
    
    # Limpiar puntuación limítrofe
    texto = texto.strip(" :;,.-\t\r\n")
    
    # Normalizar espacios intermedios
    texto = re.sub(r"\s+", " ", texto)
    
    if not texto:
        return None
        
    upper = texto.upper()
    valores_nulos = {"N/A", "NA", "-", "--", "NULL", "NONE", "NO APLICA", "NO ESPECIFICA", "NO ESPECIFICADO"}
    if upper in valores_nulos:
        return None
        
    return texto


def extraer_por_tokens(texto: str, mapa_tokens: Dict[str, str], marcadores_fin: List[str] = None) -> Dict[str, str]:
    """
    Algoritmo de segmentación por tokens ordenados por posición de aparición:
    Encuentra la posición de cada palabra clave en el texto y extrae
    el contenido hasta el inicio del siguiente token o marcador de fin.
    """
    if marcadores_fin is None:
        marcadores_fin = MARCADORES_FIN

    specs: Dict[str, str] = {}
    texto_upper = texto.upper()
    posiciones: Dict[str, int] = {}

    for token in mapa_tokens.keys():
        # Búsqueda con límites de palabra no alfanumérica
        patron = rf"(?<![A-ZÁÉÍÓÚÑ0-9]){re.escape(token)}(?![A-ZÁÉÍÓÚÑ0-9])"
        match = re.search(patron, texto_upper)
        if match:
            posiciones[token] = match.start()

    if not posiciones:
        return specs

    # Ordenar tokens por orden de aparición en el PDF
    tokens_ordenados = sorted(posiciones.keys(), key=lambda t: posiciones[t])
    total = len(tokens_ordenados)

    for i, token in enumerate(tokens_ordenados):
        clave_campo = mapa_tokens[token]
        inicio = posiciones[token] + len(token)

        if i + 1 < total:
            siguiente_token = tokens_ordenados[i + 1]
            fin = posiciones[siguiente_token]
        else:
            fin = len(texto)
            for marker in marcadores_fin:
                pos_m = texto_upper.find(marker.upper(), inicio)
                if pos_m != -1 and pos_m < fin:
                    fin = pos_m

        segmento = texto[inicio:max(inicio, fin)]
        valor_limpio = sanitizar_valor(segmento)

        if valor_limpio and clave_campo not in specs:
            specs[clave_campo] = valor_limpio

    return specs


def extraer_specs_monitor(texto: str) -> Dict[str, str]:
    """Extrae campos para monitores utilizando coincidencias por línea y regex."""
    specs: Dict[str, str] = {}
    lineas = [l.strip() for l in texto.splitlines() if l.strip()]

    for clave, variantes in TOKENS_MONITOR.items():
        for variante in variantes:
            patron = rf"^\s*{re.escape(variante)}[°:\s\-]+(.+)"
            encontrado = False
            for linea in lineas:
                m = re.match(patron, linea, re.IGNORECASE)
                if m:
                    val = sanitizar_valor(m.group(1))
                    if val:
                        # Para conectividad en monitores, si dice "No", se descarta
                        if clave in ("hdmi", "displayport", "vga", "usb") and val.lower() == "no":
                            encontrado = True
                            break
                        specs[clave] = val
                        encontrado = True
                        break
            if encontrado:
                break
    return specs


def fallback_descripcion(desc_raw: str, categoria: str = "") -> Dict[str, str]:
    """Fallback si el PDF no tiene texto legible (ej. escaneado) usando la descripción breve."""
    specs: Dict[str, str] = {}
    if not desc_raw:
        return specs
    
    desc = desc_raw.upper()
    cat = (categoria or "").upper()

    if "MONITOR" in cat:
        size_m = re.search(r'(\d+(?:\.\d+)?)"', desc)
        if size_m:
            specs["tamano_pantalla"] = f'{size_m.group(1)} Pulgadas'
        res_m = re.search(r'(\d{3,4})[Xx](\d{3,4})\s*PIXELES', desc)
        if res_m:
            specs["resolucion"] = f'{res_m.group(1)} x {res_m.group(2)} Pixeles'
        if "IPS" in desc:
            specs["panel"] = "IPS"
        elif "VA" in desc:
            specs["panel"] = "VA"
        elif "TN" in desc:
            specs["panel"] = "TN"
        if "LCD" in desc and "LED" in desc:
            specs["tecnologia_pantalla"] = "LCD con Retroiluminación LED"
    else:
        # Extracción básica para PCs
        proc_m = re.search(r'PROCESADOR:\s*([^:]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
        if proc_m:
            specs["procesador"] = sanitizar_valor(proc_m.group(1))
        ram_m = re.search(r'RAM:\s*([^:]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
        if ram_m:
            specs["ram"] = sanitizar_valor(ram_m.group(1))
        alm_m = re.search(r'ALMACENAMIENTO:\s*([^:]+?)(?=\s+[A-Z0-9\s]+:|$)', desc)
        if alm_m:
            specs["almacenamiento"] = sanitizar_valor(alm_m.group(1))

    return {k: v for k, v in specs.items() if v is not None}


# ═══════════════════════════════════════════════════════════════════════════
# FUNCIÓN PRINCIPAL DE ENTRADA
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
        categoria: 'COMPUTADORA', 'LAPTOP', 'MONITOR', 'TONER', etc.
        descripcion_fallback: Texto de descripción de la BD si el PDF no contiene texto.

    Retorna:
        Dict con los campos extraídos normalizados.
    """
    pdf_bytes = leer_bytes_pdf(origen)
    if not pdf_bytes:
        # Usar fallback de descripción si no se pudo obtener el PDF
        return fallback_descripcion(descripcion_fallback or "", categoria)

    texto = extraer_texto_crudo(pdf_bytes)
    if not texto.strip():
        return fallback_descripcion(descripcion_fallback or "", categoria)

    cat_upper = (categoria or "").upper()

    if "MONITOR" in cat_upper:
        specs = extraer_specs_monitor(texto)
        if not specs.get("tamano_pantalla") and descripcion_fallback:
            fb = fallback_descripcion(descripcion_fallback, categoria)
            specs = {**fb, **specs}
        return specs

    elif "TONER" in cat_upper or "TÓNER" in cat_upper or "SUMINISTRO" in cat_upper:
        return extraer_por_tokens(texto, TOKENS_TONER)

    else:
        # Computadoras, Laptops, Servidores, etc.
        return extraer_por_tokens(texto, TOKENS_PC)
```

---

## 🚀 3. Ejemplo de Uso Rápido

### A. Desde Python / Endpoint FastAPI:
```python
from app.services.pdf_extractor import extraer_especificaciones_pdf

# 1. Desde una URL directa (Azure CDN o similar)
url_pdf = "https://example.com/storage/pdfs/ficha_kenya_12700.pdf"
specs = extraer_especificaciones_pdf(url_pdf, categoria="COMPUTADORA")
print(specs)
# Output:
# {
#    "formato": "Small Form Factor",
#    "procesador": "Intel Core i7-12700",
#    "ram": "16 GB DDR4 3200 MHz",
#    "almacenamiento": "512 GB SSD M.2 NVMe",
#    "graficos": "Intel UHD Graphics 770",
#    "sistema_operativo": "Windows 11 Pro 64-bit",
#    "garantia_de_fabrica": "36 Meses On-Site",
#    ...
# }

# 2. Desde un archivo subido en FastAPI (UploadFile):
@router.post("/fichas/extraer-specs-pdf")
async def extraer_desde_upload(file: UploadFile = File(...), categoria: str = "COMPUTADORA"):
    contenido = await file.read()
    specs = extraer_especificaciones_pdf(contenido, categoria=categoria)
    return {"ok": True, "specs": specs}
```

### B. Desde Script de Consola (Batch / Celery):
```bash
python -c "
from app.services.pdf_extractor import extraer_especificaciones_pdf
specs = extraer_especificaciones_pdf('test_ficha.pdf', categoria='COMPUTADORA')
import pprint; pprint.pprint(specs)
"
```

---

## 🛡️ 4. Puntos Clave Resueltos
1. **Sin dependencia de Poppler ni Tesseract**: Usa `pypdf` nativo, ejecutándose en cualquier contenedor Linux/Docker o Windows sin instalar binarios externos.
2. **Sanitización de notas al pie**: Limpia automáticamente superíndices (ej. `¹`, `²`, `³`) que causan errores de coincidencia en base de datos.
3. **Manejo de conectividad negativa**: En monitores y computadoras, descarta puertos que contengan `"No"` o `"N/A"` para no ensuciar la ficha técnica.
4. **Fallback Inteligente**: Si el PDF está protegido o dañado, aprovecha el campo `descripcin_fichaproducto` de la API de Perú Compras para rescatar los datos básicos.
```
