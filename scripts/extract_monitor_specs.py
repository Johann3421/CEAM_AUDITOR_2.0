#!/usr/bin/env python3
"""
extract_monitor_specs.py
========================
Extrae las características técnicas de los monitores de Kenya Technology
descargando y parseando los PDFs de ficha técnica desde Azure CDN.

Los specs de un monitor en el PDF tienen este formato:
    Tamaño de Pantalla  27 Pulgadas
    Tecnología de Pantalla  LCD con Retroiluminación LED
    Panel  IPS
    Resolución  1920 x 1080 Pixeles (FHD)
    Contraste  1000:1
    Brillo  250 cd/m2
    Tiempo de Respuesta  5 ms
    HDMI  x1
    DisplayPort  No
    Garantia  36 Meses Carry In

Salida: backend/app/data/kenya_monitor_specs.json
  Formato dict keyed by nro_parte (uppercase) para lookup O(1):
  {
    "R270FHDITNHN": {
      "tamano_pantalla": "27 Pulgadas",
      "panel": "IPS",
      ...
    },
    ...
  }

Dependencias:
    pip install requests pypdf

Uso:
    python extract_monitor_specs.py             # modo completo
    python extract_monitor_specs.py --prueba    # solo 5 monitores
"""

import argparse
import json
import re
import sys
import time
from io import BytesIO
from pathlib import Path

import requests
from pypdf import PdfReader

# ---------------------------------------------------------------------------
# Configuración
# ---------------------------------------------------------------------------
API_BASE_URL = "https://api-auditor.sekaitech.com.pe"
MARCA = "KENYA TECHNOLOGY"
CATEGORIA = "MONITOR"
LIMIT_POR_PAGINA = 500
PAUSA_ENTRE_REQUESTS = 0.3
TIMEOUT_HTTP = 30

# Campos del PDF específicos de monitores.
# Cada entrada: clave_resultado -> [variantes de nombre en el PDF]
CAMPOS_MONITOR = {
    "tamano_pantalla":      ["Tamaño de Pantalla", "Tamano de Pantalla", "Tamaño"],
    "tecnologia_pantalla":  ["Tecnología de Pantalla", "Tecnologia de Pantalla", "Tecnología"],
    "panel":                ["Panel"],
    "relacion_aspecto":     ["Relacion de Aspecto", "Relación de Aspecto", "Aspect Ratio"],
    "resolucion":           ["Resolución", "Resolucion"],
    "contraste":            ["Contraste"],
    "brillo":               ["Brillo"],
    "angulo_vision":        ["Angulo de Visión", "Angulo de Vision", "Ángulo de Visión"],
    "tiempo_respuesta":     ["Tiempo de Respuesta"],
    "hdmi":                 ["HDMI"],
    "displayport":          ["DisplayPort", "Display Port"],
    "vga":                  ["VGA"],
    "usb":                  ["USB"],
    "garantia":             ["Garantia", "Garantía"],
    "alimentacion":         ["Alimentacion", "Alimentación"],
    "soporte_vesa":         ["Soporte Vesa", "Soporte VESA", "VESA"],
    "accesorios":           ["Accesorios"],
    "otros":                ["Otros"],
}

# Campos de conectividad: ocultar si el valor es "No" / "NO"
CAMPOS_CONECTIVIDAD = {"hdmi", "displayport", "vga", "usb"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def obtener_monitores(api_url: str, marca: str, categoria: str) -> list:
    endpoint = f"{api_url.rstrip('/')}/api/v1/fichas/"
    todos = []
    skip = 0
    print(f"  Descargando monitores de '{marca}' desde {endpoint} ...")
    while True:
        resp = requests.get(
            endpoint,
            params={"marca": marca, "categoria": categoria, "skip": skip, "limit": LIMIT_POR_PAGINA},
            timeout=TIMEOUT_HTTP,
        )
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])
        todos.extend(items)
        total = data.get("total", len(todos))
        print(f"    skip={skip} -> {len(items)} items  (acumulado {len(todos)}/{total})")
        if not items or len(todos) >= total:
            break
        skip += len(items)
    return todos


def _col(item: dict, *candidatos: str):
    for cand in candidatos:
        for k in item:
            if cand.lower() in k.lower():
                return item[k]
    return None


def descargar_pdf(url: str):
    try:
        resp = requests.get(url, timeout=TIMEOUT_HTTP)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        print(f"    WARN Error descargando PDF: {exc}")
        return None


def extraer_texto_pdf(pdf_bytes: bytes) -> str:
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        print(f"    WARN Error parseando PDF: {exc}")
        return ""


def extraer_campo_pdf(texto: str, nombres: list) -> str | None:
    """
    Busca la primera línea que empiece (con espacio opcional) con uno de
    los nombres dados y devuelve el valor capturado (resto de la línea).
    Soporta el símbolo ° tras el nombre (ej: 'Contraste° 1000:1').
    """
    for nombre in nombres:
        # [°\s]+ cubre: 'Contraste 1000:1' y 'Contraste° 1000:1'
        patron = rf"^\s*{re.escape(nombre)}[°\s]+(.+)"
        for linea in texto.splitlines():
            m = re.match(patron, linea, re.IGNORECASE)
            if m:
                return m.group(1).strip()
    return None


def extraer_specs_monitor(texto: str) -> dict:
    """Extrae todos los campos de monitor de un texto PDF."""
    specs = {}
    for clave, nombres in CAMPOS_MONITOR.items():
        valor = extraer_campo_pdf(texto, nombres)
        if valor is None:
            continue
        # Para conectividad: descartar si el valor es "No"
        if clave in CAMPOS_CONECTIVIDAD and valor.strip().lower() == "no":
            continue
        specs[clave] = valor
    return specs


def parse_descripcion_fallback(desc: str) -> dict:
    """
    Extrae specs básicos del campo descripcin_fichaproducto como fallback
    cuando no hay PDF válido.
    Ejemplo: "MONITOR : PANTALLA: LCD CON RETROILUMINACION LED 27.0" 1920X1080 PIXELES"
    """
    specs = {}
    if not desc:
        return specs
    size_m = re.search(r'(\d+(?:\.\d+)?)"', desc)
    if size_m:
        specs["tamano_pantalla"] = f'{size_m.group(1)} Pulgadas'
    res_m = re.search(r'(\d{3,4})[Xx](\d{3,4})\s*PIXELES', desc, re.I)
    if res_m:
        specs["resolucion"] = f'{res_m.group(1)} x {res_m.group(2)} Pixeles'
    if "IPS" in desc.upper():
        specs["panel"] = "IPS"
    elif "VA" in desc.upper():
        specs["panel"] = "VA"
    elif "TN" in desc.upper():
        specs["panel"] = "TN"
    if "LCD" in desc.upper() and "LED" in desc.upper():
        specs["tecnologia_pantalla"] = "LCD con Retroiluminación LED"
    elif "OLED" in desc.upper():
        specs["tecnologia_pantalla"] = "OLED"
    return specs


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Extrae specs de monitores Kenya Technology desde PDFs")
    parser.add_argument("--api-url", default=API_BASE_URL)
    parser.add_argument("--prueba", action="store_true", help="Solo 5 monitores")
    parser.add_argument("--salida", default="resultados_monitor_specs.json")
    args = parser.parse_args()

    print("=" * 60)
    print("  extract_monitor_specs.py  -- Monitores Kenya Technology")
    print("=" * 60)

    print("\n[1/3] Obteniendo monitores desde la API ...")
    try:
        monitores = obtener_monitores(args.api_url, MARCA, CATEGORIA)
    except Exception as exc:
        print(f"ERROR: No se pudo obtener monitores: {exc}")
        sys.exit(1)

    print(f"  Total monitores: {len(monitores)}")

    if args.prueba:
        monitores = monitores[:5]
        print(f"  Modo prueba: procesando solo {len(monitores)} monitor(es).")

    con_pdf = [
        m for m in monitores
        if _col(m, "ficha_tcnica", "ficha_tecnica")
        and str(_col(m, "ficha_tcnica", "ficha_tecnica")).startswith("http")
    ]
    print(f"  Con PDF: {len(con_pdf)}  |  Sin PDF: {len(monitores) - len(con_pdf)}")

    print(f"\n[2/3] Procesando {len(con_pdf)} PDFs ...")
    resultado: dict = {}   # keyed by nro_parte.upper()
    sin_specs = 0

    for i, item in enumerate(con_pdf, 1):
        nro_parte = (_col(item, "nro_parte", "cdigo_nico", "codigo_unico") or "").upper()
        modelo    = _col(item, "descripcin", "denominacin", "descripcion") or ""
        pdf_url   = _col(item, "ficha_tcnica", "ficha_tecnica") or ""
        desc      = _col(item, "descripcin") or ""

        print(f"  [{i:>3}/{len(con_pdf)}] {nro_parte[:22]:<22}", end=" ", flush=True)

        pdf_bytes = descargar_pdf(pdf_url)
        if pdf_bytes:
            texto = extraer_texto_pdf(pdf_bytes)
            specs = extraer_specs_monitor(texto)
        else:
            specs = {}

        # Fallback: parsear descripción si PDF falla o no devuelve specs clave
        if not specs.get("tamano_pantalla"):
            fb = parse_descripcion_fallback(desc)
            specs = {**fb, **specs}   # PDF gana si hay solapamiento

        if specs:
            print(f"-> {specs.get('tamano_pantalla','?')} | {specs.get('panel','?')} | {specs.get('resolucion','?')[:25]}")
        else:
            print("-> (sin specs)")
            sin_specs += 1

        resultado[nro_parte] = {
            "nro_parte":        nro_parte,
            "modelo":           modelo,
            "ficha_tecnica_url": pdf_url,
            **specs,
        }

        time.sleep(PAUSA_ENTRE_REQUESTS)

    # Guardar lista completa también (para compatibilidad con otros usos)
    lista = list(resultado.values())

    print(f"\n[3/3] Guardando ...")
    salida_path = Path(args.salida)
    salida_path.write_text(json.dumps(lista, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  JSON lista: {salida_path.resolve()}")

    # Guardar dict keyed-by-nro_parte para el backend
    backend_data = Path(__file__).parent.parent / "backend" / "app" / "data"
    if backend_data.exists():
        dest_list = backend_data / "kenya_monitor_specs.json"
        dest_dict = backend_data / "kenya_monitor_specs_dict.json"
        dest_list.write_text(json.dumps(lista, ensure_ascii=False, indent=2), encoding="utf-8")
        dest_dict.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  Copia backend (lista): {dest_list.resolve()}")
        print(f"  Copia backend (dict):  {dest_dict.resolve()}")
    else:
        print("  (carpeta backend/app/data/ no encontrada -- copia omitida)")

    con_specs = sum(1 for v in resultado.values() if len(v) > 4)   # tiene campos además de metadatos
    print("\n" + "=" * 60)
    print(f"  Monitores procesados : {len(con_pdf)}")
    print(f"  Con specs extraídas  : {con_specs}")
    print(f"  Sin specs            : {sin_specs}")
    print("=" * 60)


if __name__ == "__main__":
    main()
