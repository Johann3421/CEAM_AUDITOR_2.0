"""
SERVICIO: SINCRONIZACIÓN DE ESTADOS Y FICHAS TÉCNICAS PDF
==========================================================
Ruta objetivo: https://catalogos.perucompras.gob.pe/Reportes/ProductoOfertadoIndex
Acuerdo Marco: EXT-CE-2022-5 (ID 249)

Extrae para cada catálogo y categoría de Perú Compras:
  - Estado Ficha-producto (VIGENTE, EXCLUIDA, OFERTADA, SUSPENDIDA, etc.)
  - Estado Oferta (VIGENTE, NO_PRESENTADA, etc.)
  - Motivo y Justificación
  - URL directa de Ficha Técnica PDF oficial
  - ID ProductoOfertado
E inserta / actualiza estos campos en las fichas existentes en `ofertas_proveedor_history`.
"""

import asyncio
import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from bs4 import BeautifulSoup
from sqlalchemy import text
from sqlalchemy.orm import Session

from playwright.async_api import async_playwright
from app.services.perucompras_core import login_automatico, saltar_verificacion, _capture_live_preview
from app.services.proveedores_scraper import (
    PROVEEDORES_CONFIG,
    EXTRACTION_STATUS,
    add_status_log,
    update_live_screenshot
)

logger = logging.getLogger("ceam.reportes_estados")

TARGET_URL = "https://catalogos.perucompras.gob.pe/Reportes/ProductoOfertadoIndex"
ID_ACUERDO_2022_5 = "249"

# Catálogos y Categorías Oficiales de EXT-CE-2022-5
CATEGORIAS_OFICIALES_ESTADOS = [
    # Computadoras de Escritorio (252)
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11735", "categoria_nombre": "COMPUTADORA DE ESCRITORIO"},
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11736", "categoria_nombre": "COMPUTADORA TODO EN UNO"},
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11740", "categoria_nombre": "ESTACION DE TRABAJO"},
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11741", "categoria_nombre": "MONITOR"},
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11742", "categoria_nombre": "PANTALLA PUBLICITARIA"},
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11749", "categoria_nombre": "PANTALLA INTERACTIVA"},
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11751", "categoria_nombre": "DISPOSITIVOS DE ALMACENAMIENTO INTERNO"},
    {"catalogo_id": "252", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_id": "11747", "categoria_nombre": "DISPOSITIVOS DE ALMACENAMIENTO EXTERNO"},
    
    # Computadoras Portátiles (250)
    {"catalogo_id": "250", "catalogo_nombre": "COMPUTADORAS PORTÁTILES", "categoria_id": "11743", "categoria_nombre": "COMPUTADORA PORTATIL"},
    {"catalogo_id": "250", "catalogo_nombre": "COMPUTADORAS PORTÁTILES", "categoria_id": "11744", "categoria_nombre": "ESTACION DE TRABAJO PORTATIL"},

    # Escáneres (251)
    {"catalogo_id": "251", "catalogo_nombre": "ESCÁNERES", "categoria_id": "11745", "categoria_nombre": "ESCÁNER DE DOCUMENTOS"},
    {"catalogo_id": "251", "catalogo_nombre": "ESCÁNERES", "categoria_id": "11746", "categoria_nombre": "ESCÁNER PARA LIBROS"}
]


def parse_tabla_reportes(html_content: str) -> List[Dict[str, Any]]:
    """Parsea la tabla HTML de ofertas de Reportes/ProductoOfertadoIndex."""
    if not html_content or len(html_content) < 100:
        return []

    soup = BeautifulSoup(html_content, "html.parser")
    table = soup.find("table", id="TablaOfertas") or soup.find("table")
    if not table:
        return []

    rows = table.find("tbody").find_all("tr") if table.find("tbody") else table.find_all("tr")
    items = []

    for r in rows:
        cols = r.find_all("td")
        if len(cols) < 5:
            continue

        # 1. ID_ProductoOfertado e Imagen
        input_id = cols[0].find("input", id="ID_ProductoOfertado") or cols[0].find("input")
        id_producto_ofertado = input_id.get("value") if input_id else None

        img = cols[0].find("img")
        imagen_url = img.get("src") if img else None

        # 2. Descripción
        descripcion = cols[1].get_text(" ", strip=True) if len(cols) > 1 else ""

        # 3. PDF
        pdf_link = cols[2].find("a") if len(cols) > 2 else None
        pdf_url = pdf_link.get("href") if pdf_link else None

        # 4. Estados y Metadatos
        moneda = cols[3].get_text(strip=True) if len(cols) > 3 else "USD"
        precio_raw = cols[4].get_text(strip=True).replace(",", "") if len(cols) > 4 else "0"
        try:
            precio = float(precio_raw)
        except ValueError:
            precio = None

        fecha_registro = cols[5].get_text(strip=True) if len(cols) > 5 else ""
        estado_ficha_producto = cols[6].get_text(strip=True) if len(cols) > 6 else ""
        estado_oferta = cols[7].get_text(strip=True) if len(cols) > 7 else ""
        fecha_adjudicacion = cols[8].get_text(strip=True) if len(cols) > 8 else ""
        fecha_publicacion = cols[9].get_text(strip=True) if len(cols) > 9 else ""
        motivo = cols[10].get_text(strip=True) if len(cols) > 10 else ""
        justificacion = cols[11].get_text(strip=True) if len(cols) > 11 else ""

        # Extraer nro_parte y marca
        nro_parte = None
        marca = None
        m_unidad = re.search(r'UNIDAD\s+([A-Z0-9\.\-]+)\s+(.*?)(?:\s+SIST\.|\s+RAEE:|$)', descripcion, re.I)
        if m_unidad:
            marca = m_unidad.group(1).strip()
            resto = m_unidad.group(2).strip()
            tokens = resto.split()
            if tokens:
                nro_parte = tokens[-1]

        # Si no se halló por UNIDAD, buscar al final de la descripción
        if not nro_parte:
            m_np = re.search(r'([A-Z0-9\-\/]{4,30})(?:\s+SIST\.|\s+RAEE:|\s*$)', descripcion)
            if m_np:
                nro_parte = m_np.group(1).strip()

        items.append({
            "id_producto_ofertado": id_producto_ofertado,
            "nro_parte": nro_parte,
            "marca": marca,
            "descripcion": descripcion,
            "pdf_url": pdf_url,
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
        })

    return items


async def async_sync_estados_fichas(
    provider_key: str = "thekingcomputer",
    db: Optional[Session] = None
) -> Dict[str, Any]:
    """
    Ejecuta el proceso completo de sincronización de estados y PDFs:
    1. Abre sesión en Perú Compras con las credenciales del proveedor.
    2. Navega a Reportes/ProductoOfertadoIndex y fija Acuerdo 2022-5 (249).
    3. Itera las categorías oficiales obteniendo `_detProductoOfertadoIndex`.
    4. Cruza e inserta los estados y PDFs en `ofertas_proveedor_history`.
    """
    prov_cfg = PROVEEDORES_CONFIG.get(provider_key, PROVEEDORES_CONFIG["thekingcomputer"])
    user = prov_cfg["user"]
    password = prov_cfg["pass"]
    prov_nombre = prov_cfg["nombre"]
    nombre_proveedor = prov_nombre
    ruc_proveedor = prov_cfg.get("ruc", "")

    EXTRACTION_STATUS["is_running"] = True
    EXTRACTION_STATUS["status"] = "running"
    EXTRACTION_STATUS["provider"] = provider_key
    EXTRACTION_STATUS["provider_name"] = prov_nombre
    EXTRACTION_STATUS["last_error"] = None
    EXTRACTION_STATUS["combos_total"] = len(CATEGORIAS_OFICIALES_ESTADOS)
    EXTRACTION_STATUS["combos_completed"] = 0
    EXTRACTION_STATUS["items_inserted"] = 0
    EXTRACTION_STATUS["logs"] = []

    add_status_log(f"🚀 Iniciando sincronización de estados y PDFs para '{prov_nombre}'...")

    total_actualizados = 0

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1920, "height": 1080})
            page = await context.new_page()
            page.set_default_timeout(60000)

            # 1. Login
            add_status_log("🔑 Iniciando autenticación automática en Perú Compras...")
            logged = await login_automatico(
                page, user, password, max_retries=6,
                log_func=add_status_log,
                screenshot_callback=update_live_screenshot
            )
            if not logged:
                msg = "Fallo la autenticación en Perú Compras tras varios intentos."
                add_status_log(f"❌ {msg}")
                EXTRACTION_STATUS["status"] = "error"
                EXTRACTION_STATUS["last_error"] = msg
                EXTRACTION_STATUS["is_running"] = False
                await browser.close()
                return {"success": False, "error": msg}

            # 2. Navegar a Reportes/ProductoOfertadoIndex
            add_status_log(f"🌐 Navegando a módulo de Reportes ({TARGET_URL})...")
            await saltar_verificacion(page, target_url=TARGET_URL, log_func=add_status_log, screenshot_callback=update_live_screenshot)
            await page.wait_for_timeout(2000)

            # 3. Fijar Acuerdo Marco 2022-5 (249)
            add_status_log("📌 Seleccionando Acuerdo Marco EXT-CE-2022-5 (ID 249)...")
            await page.wait_for_selector("#ajaxAcuerdo", state="visible", timeout=25000)
            await page.evaluate("""(acuerdoVal) => {
                const sel = document.querySelector('#ajaxAcuerdo');
                if (sel) {
                    sel.value = acuerdoVal;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.jQuery) { window.jQuery(sel).val(acuerdoVal).trigger('change'); }
                }
            }""", ID_ACUERDO_2022_5)

            await page.wait_for_timeout(2000)
            await _capture_live_preview(page, update_live_screenshot)

            # 4. Descubrir dinámicamente todas las categorías disponibles o usar la lista oficial completa
            add_status_log("🔍 Descubriendo todos los catálogos y categorías del Acuerdo Marco EXT-CE-2022-5...")
            combos_a_procesar = []
            try:
                catalogos_opts = await page.evaluate("""() => {
                    const sel = document.querySelector('#ajaxCatalogo');
                    if (!sel) return [];
                    return Array.from(sel.options)
                        .filter(o => o.value && o.value !== '0' && o.value !== '')
                        .map(o => ({ id: o.value, nombre: o.text.trim() }));
                }""")
                if catalogos_opts:
                    for c_opt in catalogos_opts:
                        await page.evaluate("""(catId) => {
                            const sel = document.querySelector('#ajaxCatalogo');
                            if (sel && window.jQuery) {
                                window.jQuery(sel).val(catId).trigger('change');
                            }
                        }""", c_opt["id"])
                        await page.wait_for_timeout(1200)
                        categs_opts = await page.evaluate("""() => {
                            const sel = document.querySelector('#ajaxCategoria');
                            if (!sel) return [];
                            return Array.from(sel.options)
                                .filter(o => o.value && o.value !== '0' && o.value !== '')
                                .map(o => ({ id: o.value, nombre: o.text.trim() }));
                        }""")
                        for cg_opt in categs_opts:
                            combos_a_procesar.append({
                                "catalogo_id": str(c_opt["id"]),
                                "catalogo_nombre": c_opt["nombre"],
                                "categoria_id": str(cg_opt["id"]),
                                "categoria_nombre": cg_opt["nombre"]
                            })
            except Exception as disc_err:
                logger.warning(f"Error en descubrimiento dinámico de categorías: {disc_err}")

            if not combos_a_procesar:
                from app.services.proveedores_scraper import OFFICIAL_PERUCOMPRAS_COMBOS
                combos_a_procesar = [
                    {
                        "catalogo_id": c["n_catalogo"],
                        "catalogo_nombre": c["catalogo_nombre"],
                        "categoria_id": c["n_categoria"],
                        "categoria_nombre": c["categoria_nombre"]
                    }
                    for c in OFFICIAL_PERUCOMPRAS_COMBOS
                ]

            EXTRACTION_STATUS["combos_total"] = len(combos_a_procesar)
            add_status_log(f"📋 Total de categorías a procesar: {len(combos_a_procesar)} categorías oficiales.")

            # Función para consultar directamente la ruta /Reportes/_detProductoOfertadoIndex vía fetch (idéntico a consultar_json_productos)
            async def _fetch_ruta_reportes(cat_id: str, categ_id: str, c_desc: str = "", timeout_ms: int = 25000) -> str:
                target_url = (
                    f"/Reportes/_detProductoOfertadoIndex"
                    f"?N_Acuerdo={ID_ACUERDO_2022_5}&N_Catalogo={cat_id}&N_Categoria={categ_id}"
                    f"&C_Descripcion={c_desc}&_={int(time.time() * 1000)}"
                )
                js_fetch = """
                async (args) => {
                    try {
                        const controller = new AbortController();
                        const timer = setTimeout(() => controller.abort(), args.timeout);
                        const res = await fetch(args.url, {
                            headers: { 'X-Requested-With': 'XMLHttpRequest' },
                            signal: controller.signal
                        });
                        clearTimeout(timer);
                        if (!res.ok) return '';
                        return await res.text();
                    } catch(e) {
                        return '';
                    }
                }
                """
                return await page.evaluate(js_fetch, {"url": target_url, "timeout": timeout_ms})

            # 5. Iterar sobre todas las categorías descubiertas
            for idx, cat_item in enumerate(combos_a_procesar):
                n_cat = cat_item["catalogo_id"]
                n_categ = cat_item["categoria_id"]
                cat_nom = cat_item["catalogo_nombre"]
                categ_nom = cat_item["categoria_nombre"]

                add_status_log(f"📂 [{idx+1}/{len(combos_a_procesar)}] Consultando ruta: {cat_nom} -> {categ_nom}...")
                EXTRACTION_STATUS["combos_completed"] = idx + 1
                EXTRACTION_STATUS["progress_message"] = f"Extrayendo estados: {categ_nom} ({idx+1}/{len(combos_a_procesar)})"

                try:
                    items = []
                    # Consulta directa a la ruta sin filtros de marca (exactamente igual al primer script)
                    raw_html = await _fetch_ruta_reportes(n_cat, n_categ, c_desc="", timeout_ms=60000)
                    if raw_html:
                        items = parse_tabla_reportes(raw_html)

                    # Deduplicar por id_producto_ofertado o nro_parte
                    unique_dict = {}
                    for it in items:
                        k = it.get("id_producto_ofertado") or it.get("nro_parte") or (it.get("descripcion") or "")[:30]
                        if k and k not in unique_dict:
                            unique_dict[k] = it
                    items = list(unique_dict.values())

                    add_status_log(f"   📊 Total consolidado: {len(items)} fichas procesadas en {categ_nom}.")

                    # PASO B: Actualizar en base de datos indexada por nro_parte
                    if items and db is not None:
                        cat_actualizados = 0
                        sql_up_exact = text("""
                            UPDATE ofertas_proveedor_history
                            SET 
                                estado_ficha_producto = COALESCE(NULLIF(:estado_f, ''), estado_ficha_producto),
                                estado_oferta = COALESCE(NULLIF(:estado_o, ''), estado_oferta),
                                motivo_estado = COALESCE(NULLIF(:motivo, ''), motivo_estado),
                                justificacion_estado = COALESCE(NULLIF(:justif, ''), justificacion_estado),
                                id_producto_ofertado = COALESCE(NULLIF(:id_of, ''), id_producto_ofertado),
                                pdf_url = COALESCE(NULLIF(:pdf, ''), pdf_url)
                            WHERE UPPER(TRIM(nro_parte)) = UPPER(TRIM(:np));
                        """)

                        sql_up_desc = text("""
                            UPDATE ofertas_proveedor_history
                            SET 
                                estado_ficha_producto = COALESCE(NULLIF(:estado_f, ''), estado_ficha_producto),
                                estado_oferta = COALESCE(NULLIF(:estado_o, ''), estado_oferta),
                                motivo_estado = COALESCE(NULLIF(:motivo, ''), motivo_estado),
                                justificacion_estado = COALESCE(NULLIF(:justif, ''), justificacion_estado),
                                id_producto_ofertado = COALESCE(NULLIF(:id_of, ''), id_producto_ofertado),
                                pdf_url = COALESCE(NULLIF(:pdf, ''), pdf_url)
                            WHERE UPPER(descripcion_producto) LIKE UPPER(:np_like);
                        """)

                        for it in items:
                            np = (it.get("nro_parte") or "").strip()
                            if not np or np in ("S/N", "SN", "-"):
                                continue

                            params = {
                                "estado_f": it.get("estado_ficha_producto") or "",
                                "estado_o": it.get("estado_oferta") or "",
                                "motivo": it.get("motivo") or "",
                                "justif": it.get("justificacion") or "",
                                "id_of": it.get("id_producto_ofertado") or "",
                                "pdf": it.get("pdf_url") or "",
                                "np": np
                            }

                            try:
                                # 1. Intento rápido por índice exacto de nro_parte (< 0.1 ms)
                                res_up = db.execute(sql_up_exact, params)
                                if res_up.rowcount > 0:
                                    cat_actualizados += res_up.rowcount
                                elif len(np) >= 6:
                                    # 2. Fallback solo si no hubo coincidencia exacta y el nro de parte tiene longitud confiable
                                    params_desc = {**params, "np_like": f"%{np}%"}
                                    res_desc = db.execute(sql_up_desc, params_desc)
                                    cat_actualizados += res_desc.rowcount
                            except Exception as row_err:
                                db.rollback()
                                logger.warning(f"Error actualizando nro_parte {np}: {row_err}")

                        db.commit()
                        total_actualizados += cat_actualizados
                        EXTRACTION_STATUS["items_inserted"] = total_actualizados
                        add_status_log(f"   💾 {cat_actualizados} registros actualizados en BD para {categ_nom}.")

                except Exception as cat_err:
                    if db is not None:
                        db.rollback()
                    add_status_log(f"⚠️ Error procesando {categ_nom}: {cat_err}")

                # Pausa mínima de cortesía entre categorías
                await asyncio.sleep(1.0)

            add_status_log(f"🎉 Sincronización completada con éxito. Total ofertas actualizadas: {total_actualizados}")
            EXTRACTION_STATUS["status"] = "completed"
            EXTRACTION_STATUS["is_running"] = False
            EXTRACTION_STATUS["progress_message"] = f"Estados y PDFs incluidos exitosamente ({total_actualizados} ofertas)."
            await _capture_live_preview(page, update_live_screenshot)
            await browser.close()

            return {
                "success": True,
                "items_updated": total_actualizados,
                "categories_processed": len(CATEGORIAS_OFICIALES_ESTADOS)
            }

    except Exception as e:
        err_msg = f"Error fatal en async_sync_estados_fichas: {str(e)}"
        logger.error(err_msg, exc_info=True)
        add_status_log(f"❌ {err_msg}")
        EXTRACTION_STATUS["status"] = "error"
        EXTRACTION_STATUS["last_error"] = str(e)
        EXTRACTION_STATUS["is_running"] = False
        return {"success": False, "error": str(e)}
