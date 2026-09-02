"""
EXTRACTOR DE PRODUCTOS OFERTADOS - PERÚ COMPRAS
================================================
Ruta objetivo: https://catalogos.perucompras.gob.pe/Reportes/ProductoOfertadoIndex
Acuerdo Marco fijado: EXT-CE-2022-5 (ID: 249)

Permite seleccionar dinámicamente o por parámetros el catálogo y la categoría,
ejecutar la búsqueda y extraer todos los registros de ofertas con sus campos
estructurados (IDs, Part Numbers, URLs de PDF, Imágenes, Precios, Estados, etc.).
"""

import asyncio
import json
import logging
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup

# Ajustar PYTHONPATH para importar módulos del backend si es necesario
backend_path = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from playwright.async_api import async_playwright
from app.services.perucompras_core import login_automatico, saltar_verificacion

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("extraer_reportes_producto_ofertado")

TARGET_URL = "https://catalogos.perucompras.gob.pe/Reportes/ProductoOfertadoIndex"
ENDPOINT_DETALLE = "https://catalogos.perucompras.gob.pe/Reportes/_detProductoOfertadoIndex"
ID_ACUERDO_2022_5 = "249"


def parse_tabla_productos_ofertados(html_content: str) -> List[Dict[str, Any]]:
    """
    Parsea la tabla HTML (#TablaOfertas) devuelta por _detProductoOfertadoIndex
    y extrae todos los campos técnicos, comerciales y administrativos.
    """
    soup = BeautifulSoup(html_content, "html.parser")
    table = soup.find("table", id="TablaOfertas") or soup.find("table")
    if not table:
        return []

    rows = table.find("tbody").find_all("tr") if table.find("tbody") else table.find_all("tr")
    extracted = []

    for r in rows:
        cols = r.find_all("td")
        if len(cols) < 5:
            continue

        # 1. ID Oferta e Imagen
        input_id = cols[0].find("input", id="ID_ProductoOfertado") or cols[0].find("input")
        id_producto_ofertado = input_id.get("value") if input_id else None

        img = cols[0].find("img")
        imagen_url = img.get("src") if img else None

        # 2. Descripción completa de la Ficha-Producto
        descripcion = cols[1].get_text(" ", strip=True) if len(cols) > 1 else ""

        # 3. Ficha Técnica PDF e ID Producto
        pdf_link = cols[2].find("a") if len(cols) > 2 else None
        pdf_url = pdf_link.get("href") if pdf_link else None

        id_producto = None
        if pdf_url:
            m = re.search(r'/(\d+)(?:\.pdf|-[^/]+\.pdf)', pdf_url)
            if m:
                id_producto = m.group(1)
        elif imagen_url:
            m = re.search(r'/(\d+)-', imagen_url)
            if m:
                id_producto = m.group(1)

        # 4. Moneda y Precio
        moneda = cols[3].get_text(strip=True) if len(cols) > 3 else "USD"
        precio_raw = cols[4].get_text(strip=True).replace(",", "") if len(cols) > 4 else "0"
        try:
            precio = float(precio_raw)
        except ValueError:
            precio = None

        # 5. Fechas y Estados
        fecha_registro = cols[5].get_text(strip=True) if len(cols) > 5 else ""
        estado_ficha_producto = cols[6].get_text(strip=True) if len(cols) > 6 else ""
        estado_oferta = cols[7].get_text(strip=True) if len(cols) > 7 else ""
        fecha_adjudicacion = cols[8].get_text(strip=True) if len(cols) > 8 else ""
        fecha_publicacion = cols[9].get_text(strip=True) if len(cols) > 9 else ""

        # 6. Motivo, Justificación y Puntaje
        motivo = cols[10].get_text(strip=True) if len(cols) > 10 else ""
        justificacion = cols[11].get_text(strip=True) if len(cols) > 11 else ""
        puntaje_raw = cols[12].get_text(strip=True).replace(",", "") if len(cols) > 12 else ""
        try:
            puntaje = float(puntaje_raw) if puntaje_raw else None
        except ValueError:
            puntaje = None

        # 7. Extracción de Metadatos de Hardware (Marca, Modelo, Nro Parte)
        marca = None
        modelo = None
        nro_parte = None

        m_unidad = re.search(r'UNIDAD\s+([A-Z0-9\.\-]+)\s+(.*?)(?:\s+SIST\.|\s+RAEE:|$)', descripcion, re.I)
        if m_unidad:
            marca = m_unidad.group(1).strip()
            resto = m_unidad.group(2).strip()
            tokens = resto.split()
            if tokens:
                nro_parte = tokens[-1]
                modelo = " ".join(tokens[:-1])
            else:
                modelo = resto

        # Especificaciones clave
        m_pulg = re.search(r'(\d+(?:\.\d+)?)\s*(?:\"|\'\'|PULGADAS|PLG|PULG)', descripcion, re.I)
        tamano_pantalla = f'{m_pulg.group(1)}"' if m_pulg else None

        m_res = re.search(r'(\d{3,4}\s*X\s*\d{3,4})', descripcion, re.I)
        resolucion = m_res.group(1) if m_res else None

        extracted.append({
            "id_producto_ofertado": id_producto_ofertado,
            "id_producto": id_producto,
            "nro_parte": nro_parte,
            "marca": marca,
            "modelo": modelo,
            "descripcion": descripcion,
            "ficha_tecnica_pdf": pdf_url,
            "imagen_url": imagen_url,
            "moneda": moneda,
            "precio": precio,
            "fecha_registro": fecha_registro,
            "estado_ficha_producto": estado_ficha_producto,
            "estado_oferta": estado_oferta,
            "fecha_adjudicacion": fecha_adjudicacion,
            "fecha_publicacion": fecha_publicacion,
            "motivo": motivo,
            "justificacion": justificacion,
            "puntaje": puntaje,
            "tamano_pantalla": tamano_pantalla,
            "resolucion": resolucion
        })

    return extracted


async def extraer_fichas_reporte(
    catalogo_texto: str = "COMPUTADORAS DE ESCRITORIO",
    categoria_texto: str = "MONITOR",
    palabra_clave: str = "",
    user: Optional[str] = None,
    password: Optional[str] = None,
    output_json_path: Optional[str] = None,
    headless: bool = True
) -> List[Dict[str, Any]]:
    """
    Inicia sesión, navega a Reportes/ProductoOfertadoIndex, selecciona:
      1. Acuerdo Marco: 249 (EXT-CE-2022-5)
      2. Catálogo: según `catalogo_texto`
      3. Categoría: según `categoria_texto`
      4. Palabra Clave: según `palabra_clave` (opcional, para filtrar o evitar timeout en categorías masivas)
    Dispara la búsqueda y devuelve la lista completa de objetos JSON extraídos.
    """
    user = user or os.getenv("PERUCOMPRAS_USER_KING", "estalin.huamali01")
    password = password or os.getenv("PERUCOMPRAS_PASS_KING", "PE/CyG6c&1R4T=")

    logger.info(f"Iniciando extracción en Reportes con usuario: {user}")
    logger.info(f"Filtros: Acuerdo='EXT-CE-2022-5' (249) | Catálogo='{catalogo_texto}' | Categoría='{categoria_texto}'")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=headless)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page = await context.new_page()
        page.set_default_timeout(60000)

        # 1. Login
        ok = await login_automatico(page, user, password, max_retries=5)
        if not ok:
            logger.error("No se pudo iniciar sesión en Perú Compras.")
            await browser.close()
            return []

        # 2. Navegar a Reportes/ProductoOfertadoIndex
        await saltar_verificacion(page, target_url=TARGET_URL)
        await page.wait_for_timeout(2500)

        # 3. Seleccionar Acuerdo Marco 2022-5 (ID 249)
        logger.info("Seleccionando Acuerdo Marco EXT-CE-2022-5 (249)...")
        await page.wait_for_selector("#ajaxAcuerdo", state="visible", timeout=20000)
        await page.evaluate("""(acuerdoVal) => {
            const sel = document.querySelector('#ajaxAcuerdo');
            if (sel) {
                sel.value = acuerdoVal;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                if (window.jQuery) {
                    window.jQuery(sel).val(acuerdoVal).trigger('change');
                }
            }
        }""", ID_ACUERDO_2022_5)

        # 4. Esperar y seleccionar Catálogo
        logger.info(f"Esperando que se cargue el catálogo: '{catalogo_texto}'...")
        cat_selected = False
        for _ in range(15):
            await page.wait_for_timeout(1000)
            res = await page.evaluate("""(target) => {
                const sel = document.querySelector('#ajaxCatalogo');
                if (!sel || sel.options.length <= 1) return null;
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].text.toUpperCase().includes(target.toUpperCase())) {
                        sel.selectedIndex = i;
                        sel.value = sel.options[i].value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.jQuery) { window.jQuery(sel).val(sel.options[i].value).trigger('change'); }
                        return { value: sel.options[i].value, text: sel.options[i].text };
                    }
                }
                return null;
            }""", catalogo_texto)
            if res:
                logger.info(f"✅ Catálogo seleccionado: [{res['value']}] {res['text']}")
                cat_selected = True
                break

        if not cat_selected:
            logger.error(f"No se encontró el catálogo '{catalogo_texto}'.")
            await browser.close()
            return []

        # 5. Esperar y seleccionar Categoría
        logger.info(f"Esperando que se cargue la categoría: '{categoria_texto}'...")
        categ_selected = False
        for _ in range(15):
            await page.wait_for_timeout(1000)
            res = await page.evaluate("""(target) => {
                const sel = document.querySelector('#ajaxCategoria');
                if (!sel || sel.options.length <= 1) return null;
                for (let i = 0; i < sel.options.length; i++) {
                    if (sel.options[i].text.toUpperCase().includes(target.toUpperCase())) {
                        sel.selectedIndex = i;
                        sel.value = sel.options[i].value;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.jQuery) { window.jQuery(sel).val(sel.options[i].value).trigger('change'); }
                        return { value: sel.options[i].value, text: sel.options[i].text };
                    }
                }
                return null;
            }""", categoria_texto)
            if res:
                logger.info(f"✅ Categoría seleccionada: [{res['value']}] {res['text']}")
                categ_selected = True
                break

        if not categ_selected:
            logger.error(f"No se encontró la categoría '{categoria_texto}'.")
            await browser.close()
            return []

        # 5.5 Escribir palabra clave si está presente
        if palabra_clave:
            logger.info(f"Aplicando filtro por palabra clave: '{palabra_clave}'")
            await page.fill("#C_Descripcion", palabra_clave)
            await page.wait_for_timeout(500)

        # 6. Interceptar la respuesta de _detProductoOfertadoIndex al dar click en Iniciar Búsqueda
        logger.info("Disparando búsqueda...")
        html_response = None

        # Esperar por la respuesta de red específica
        async with page.expect_response(lambda r: "_detProductoOfertadoIndex" in r.url and r.status == 200, timeout=60000) as response_info:
            await page.evaluate("""() => {
                const btn = document.querySelector('#btnBuscar');
                if (btn) btn.click();
            }""")

        response = await response_info.value
        html_response = await response.text()
        logger.info(f"Respuesta recibida ({len(html_response)} bytes). Procesando tabla...")

        # 7. Parsear la tabla recibida
        items = parse_tabla_productos_ofertados(html_response)
        logger.info(f"🎉 Total de productos ofertados extraídos: {len(items)}")

        if output_json_path:
            out_p = Path(output_json_path)
            out_p.parent.mkdir(parents=True, exist_ok=True)
            with open(out_p, "w", encoding="utf-8") as f:
                json.dump(items, f, indent=2, ensure_ascii=False)
            logger.info(f"💾 Archivo JSON guardado en: {out_p}")

        await browser.close()
        return items


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Extractor de Reportes/ProductoOfertadoIndex (Perú Compras)")
    parser.add_argument("--catalogo", default="COMPUTADORAS DE ESCRITORIO", help="Nombre del catálogo")
    parser.add_argument("--categoria", default="MONITOR", help="Nombre de la categoría")
    parser.add_argument("--output", default="scratch/resultado_reportes_monitores.json", help="Ruta de guardado JSON")
    args = parser.parse_args()

    results = asyncio.run(extraer_fichas_reporte(
        catalogo_texto=args.catalogo,
        categoria_texto=args.categoria,
        output_json_path=args.output
    ))
    print(f"\nResumen: {len(results)} productos extraídos.")
    if results:
        print("\nEjemplo de producto extraído (primer elemento):")
        print(json.dumps(results[0], indent=2, ensure_ascii=False))
