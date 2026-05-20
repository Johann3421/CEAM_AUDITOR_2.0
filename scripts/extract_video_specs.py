"""
extract_video_specs.py
======================
Extrae el campo de video/graficos para cada ficha de Kenya Technology
descargando y parseando los PDFs de ficha tecnica desde Azure CDN.

Proceso:
  1. Llama a la API interna para obtener todos los productos Kenya Technology
     con su URL de ficha tecnica (columna ficha_tcnica).
  2. Por cada producto descarga el PDF en memoria.
  3. Extrae el campo Graficos (integrado o dedicado) del texto del PDF.
  4. Guarda resultados en JSON.

Dependencias:
    pip install requests pypdf

Uso:
    python extract_video_specs.py                    # modo completo
    python extract_video_specs.py --prueba           # solo 5 productos
    python extract_video_specs.py --api-url https://api-auditor.sekaitech.com.pe
    python extract_video_specs.py --salida mi_resultado.json
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

API_BASE_URL = "https://api-auditor.sekaitech.com.pe"
MARCA = "KENYA TECHNOLOGY"
LIMIT_POR_PAGINA = 500
PAUSA_ENTRE_REQUESTS = 0.3
TIMEOUT_HTTP = 30

CAMPOS_VIDEO = ["Graficos", "Video", "Tarjeta de Video", "GPU"]

def obtener_todos_los_productos(api_url, marca):
    endpoint = f"{api_url.rstrip('/')}/api/v1/fichas/"
    todos = []
    skip = 0
    print(f"  Descargando productos de '{marca}' desde {endpoint} ...")
    while True:
        resp = requests.get(endpoint, params={"marca": marca, "skip": skip, "limit": LIMIT_POR_PAGINA}, timeout=TIMEOUT_HTTP)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("items", [])
        todos.extend(items)
        total = data.get("total", len(todos))
        print(f"    pagina skip={skip} -> {len(items)} items  (acumulado {len(todos)}/{total})")
        if not items or len(todos) >= total:
            break
        skip += len(items)
    return todos

def _col(item, *candidatos):
    for cand in candidatos:
        for k in item:
            if cand.lower() in k.lower():
                return item[k]
    return None

def descargar_pdf(url):
    try:
        resp = requests.get(url, timeout=TIMEOUT_HTTP)
        resp.raise_for_status()
        return resp.content
    except Exception as exc:
        print(f"    WARN Error descargando PDF ({url}): {exc}")
        return None

def extraer_texto_pdf(pdf_bytes):
    try:
        reader = PdfReader(BytesIO(pdf_bytes))
        return "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception as exc:
        print(f"    WARN Error parseando PDF: {exc}")
        return ""

def extraer_campo(texto, nombre_campo):
    patron = rf"^\s*{re.escape(nombre_campo)}\s+(.+)"
    for linea in texto.splitlines():
        m = re.match(patron, linea, re.IGNORECASE)
        if m:
            return m.group(1).strip()
    return None

def extraer_graficos(texto):
    # Try accented and non-accented variants
    for campo in ["Gráficos", "Graficos"] + CAMPOS_VIDEO:
        valor = extraer_campo(texto, campo)
        if valor:
            return valor
    return None

def main():
    parser = argparse.ArgumentParser(description="Extrae specs de video de fichas Kenya Technology")
    parser.add_argument("--api-url", default=API_BASE_URL)
    parser.add_argument("--prueba", action="store_true", help="Solo 5 productos")
    parser.add_argument("--salida", default="resultados_video_specs.json")
    args = parser.parse_args()

    print("=" * 60)
    print("  extract_video_specs.py  -- Kenya Technology")
    print("=" * 60)

    print("\n[1/3] Obteniendo productos desde la API ...")
    try:
        productos = obtener_todos_los_productos(args.api_url, MARCA)
    except Exception as exc:
        print(f"ERROR: No se pudo obtener el catalogo: {exc}")
        sys.exit(1)

    print(f"  Total productos encontrados: {len(productos)}")

    if args.prueba:
        productos = productos[:5]
        print(f"  Modo prueba: procesando solo {len(productos)} producto(s).")

    con_pdf = [p for p in productos if _col(p, "ficha_tcnica", "ficha_tecnica") and str(_col(p, "ficha_tcnica", "ficha_tecnica")).startswith("http")]
    sin_pdf = len(productos) - len(con_pdf)
    print(f"  Con PDF: {len(con_pdf)}  |  Sin PDF: {sin_pdf}")

    print(f"\n[2/3] Procesando {len(con_pdf)} PDFs ...")
    resultados = []
    sin_graficos = 0

    for i, item in enumerate(con_pdf, 1):
        nro_parte = _col(item, "nro_parte", "cdigo_nico", "codigo_unico") or ""
        modelo    = _col(item, "descripcin", "denominacin", "descripcion") or ""
        pdf_url   = _col(item, "ficha_tcnica", "ficha_tecnica") or ""
        categoria = _col(item, "categor") or ""

        print(f"  [{i:>4}/{len(con_pdf)}] {nro_parte[:20]:<20}  {categoria[:30]:<30}", end=" ", flush=True)

        pdf_bytes = descargar_pdf(pdf_url)
        if not pdf_bytes:
            print("-> ERROR descarga")
            sin_graficos += 1
            continue

        texto = extraer_texto_pdf(pdf_bytes)
        graficos = extraer_graficos(texto)

        if graficos:
            print(f"-> {graficos[:55]}")
        else:
            print("-> (sin campo graficos)")
            sin_graficos += 1

        resultados.append({"nro_parte": nro_parte, "modelo": modelo, "categoria": categoria, "graficos": graficos, "ficha_tecnica_url": pdf_url})
        time.sleep(PAUSA_ENTRE_REQUESTS)

    print(f"\n[3/3] Guardando resultados ...")
    salida_path = Path(args.salida)
    salida_path.write_text(json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  Guardado: {salida_path.resolve()}")

    backend_data = Path(__file__).parent.parent / "backend" / "app" / "data"
    if backend_data.exists():
        destino = backend_data / "kenya_video_specs.json"
        destino.write_text(json.dumps(resultados, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  Copia backend: {destino.resolve()}")
    else:
        print("  (carpeta backend/app/data/ no encontrada -- copia omitida)")

    con_graficos = sum(1 for r in resultados if r["graficos"])
    print("\n" + "=" * 60)
    print(f"  Procesados   : {len(con_pdf)}")
    print(f"  Con graficos : {con_graficos}")
    print(f"  Sin graficos : {sin_graficos}")
    print("=" * 60)

if __name__ == "__main__":
    main()
