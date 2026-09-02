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

            # 5. Iterar sobre todas las categorías descubiertas
            for idx, cat_item in enumerate(combos_a_procesar):
                n_cat = cat_item["catalogo_id"]
                n_categ = cat_item["categoria_id"]
                cat_nom = cat_item["catalogo_nombre"]
                categ_nom = cat_item["categoria_nombre"]

                add_status_log(f"📂 [{idx+1}/{len(combos_a_procesar)}] Consultando: {cat_nom} -> {categ_nom}...")
                EXTRACTION_STATUS["combos_completed"] = idx + 1
                EXTRACTION_STATUS["progress_message"] = f"Extrayendo estados: {categ_nom} ({idx+1}/{len(combos_a_procesar)})"

                try:
                    items = []

                    # Función helper para consultar _detProductoOfertadoIndex con timeout configurable
                    async def _fetch_reporte(desc_filtro: str = "", t_out: int = 45000):
                        return await page.evaluate("""(args) => {
                            return new Promise((resolve) => {
                                $.ajax({
                                    url: '/Reportes/_detProductoOfertadoIndex',
                                    type: 'GET',
                                    cache: false,
                                    data: {
                                        N_Acuerdo: args.n_acuerdo,
                                        N_Catalogo: args.n_catalogo,
                                        N_Categoria: args.n_categoria,
                                        C_Descripcion: args.c_descripcion
                                    },
                                    timeout: args.timeout,
                                    success: function(data) { resolve(data || ''); },
                                    error: function() { resolve(''); }
                                });
                            });
                        }""", {
                            "n_acuerdo": ID_ACUERDO_2022_5,
                            "n_catalogo": n_cat,
                            "n_categoria": n_categ,
                            "c_descripcion": desc_filtro,
                            "timeout": t_out
                        })

                    # 1. Intento global sin filtro (funciona de inmediato para categorías medianas/pequeñas)
                    html_table = await _fetch_reporte(desc_filtro="", t_out=45000)
                    if html_table and len(html_table) > 300:
                        items = parse_tabla_reportes(html_table)

                    # 2. Si devolvió 0 o falló (categorías masivas como Computadora de Escritorio con ~28k registros que saturan el backend)
                    if not items:
                        add_status_log(f"   ⚡ Categoría masiva o sin respuesta global. Extrayendo por lotes de marcas para evitar saturación del servidor...")
                        
                        # Buscar qué marcas tenemos en nuestra base de datos para esta categoría/catálogo
                        marcas_a_buscar = set()
                        if db is not None:
                            try:
                                sql_m = text("""
                                    SELECT DISTINCT UPPER(TRIM(marca)) 
                                    FROM ofertas_proveedor_history 
                                    WHERE (UPPER(categoria) = UPPER(:cat) OR UPPER(catalogo) = UPPER(:catalogo))
                                      AND marca IS NOT NULL AND TRIM(marca) != ''
                                """)
                                rows_m = db.execute(sql_m, {"cat": categ_nom, "catalogo": cat_nom}).fetchall()
                                for r in rows_m:
                                    if r[0] and len(r[0]) >= 2:
                                        marcas_a_buscar.add(r[0])
                            except Exception as e:
                                logger.warning(f"Error consultando marcas de BD: {e}")

                        # Marcas líderes para garantizar cobertura total de computadoras
                        marcas_top = ["HP", "LENOVO", "DELL", "ADVANCE", "ACER", "ASUS", "TEROS", "APPLE", "SAMSUNG"]
                        for m_top in marcas_top:
                            marcas_a_buscar.add(m_top)

                        # Consultar por cada marca específica (cada consulta toma solo 1-2s y nunca cae en timeout)
                        for m_marca in sorted(marcas_a_buscar):
                            add_status_log(f"   🔎 Consultando lote marca '{m_marca}' en {categ_nom}...")
                            html_marca = await _fetch_reporte(desc_filtro=m_marca, t_out=30000)
                            items_marca = parse_tabla_reportes(html_marca)
                            if items_marca:
                                add_status_log(f"      ✓ {len(items_marca)} fichas encontradas para marca '{m_marca}'.")
                                items.extend(items_marca)
                            await asyncio.sleep(0.4)

                        # 3. Si aún faltan productos específicos de nuestra BD sin estado, buscar directamente por sus nro_parte
                        if db is not None:
                            try:
                                sql_np = text("""
                                    SELECT DISTINCT UPPER(TRIM(nro_parte))
                                    FROM ofertas_proveedor_history
                                    WHERE (UPPER(categoria) = UPPER(:cat) OR UPPER(catalogo) = UPPER(:catalogo))
                                      AND (estado_ficha_producto IS NULL OR estado_ficha_producto = '')
                                      AND nro_parte IS NOT NULL AND LENGTH(TRIM(nro_parte)) >= 4
                                    LIMIT 50
                                """)
                                rows_np = db.execute(sql_np, {"cat": categ_nom, "catalogo": cat_nom}).fetchall()
                                for r_np in rows_np:
                                    np_target = r_np[0]
                                    html_np = await _fetch_reporte(desc_filtro=np_target, t_out=15000)
                                    items_np = parse_tabla_reportes(html_np)
                                    if items_np:
                                        items.extend(items_np)
                                    await asyncio.sleep(0.3)
                            except Exception as e:
                                logger.warning(f"Error buscando por nro_parte: {e}")

                    # Deduplicar items por id_producto_ofertado o nro_parte
                    unique_items = {}
                    for it in items:
                        key = it.get("id_producto_ofertado") or (it.get("nro_parte") or "") + (it.get("descripcion") or "")[:20]
                        if key and key not in unique_items:
                            unique_items[key] = it
                    
                    items = list(unique_items.values())
                    add_status_log(f"   📊 Total consolidado: {len(items)} fichas procesadas en {categ_nom}.")
                    await _capture_live_preview(page, update_live_screenshot)

                    if items and db is not None:
                        cat_actualizados = 0
                        for it in items:
                            np = it.get("nro_parte")
                            estado_f = it.get("estado_ficha_producto")
                            estado_o = it.get("estado_oferta")
                            pdf = it.get("pdf_url")
                            motivo = it.get("motivo")
                            justif = it.get("justificacion")
                            id_of = it.get("id_producto_ofertado")

                            if not np and not it.get("descripcion"):
                                continue

                            # Actualizar registros coincidentes en la base de datos
                            # 1. Por nro_parte exacto
                            # 2. O por coincidencia en descripcion_producto si nro_parte es genérico
                            try:
                                sql = text("""
                                    UPDATE ofertas_proveedor_history
                                    SET 
                                        estado_ficha_producto = COALESCE(:estado_f, estado_ficha_producto),
                                        estado_oferta = COALESCE(:estado_o, estado_oferta),
                                        motivo_estado = COALESCE(:motivo, motivo_estado),
                                        justificacion_estado = COALESCE(:justif, justificacion_estado),
                                        id_producto_ofertado = COALESCE(:id_of, id_producto_ofertado),
                                        pdf_url = COALESCE(:pdf, pdf_url),
                                        raw_json = jsonb_set(
                                            jsonb_set(
                                                jsonb_set(
                                                    COALESCE(raw_json, '{}'::json)::jsonb,
                                                    '{estado_ficha_producto}', to_jsonb(:estado_f::text)
                                                ),
                                                '{estado_oferta}', to_jsonb(:estado_o::text)
                                            ),
                                            '{ficha_tecnica_pdf}', to_jsonb(:pdf::text)
                                        )::json
                                    WHERE UPPER(TRIM(nro_parte)) = UPPER(TRIM(:np))
                                       OR (
                                           :np IS NOT NULL 
                                           AND :np != '' 
                                           AND UPPER(descripcion_producto) LIKE UPPER(:np_like)
                                       );
                                """)
                                res_up = db.execute(sql, {
                                    "estado_f": estado_f or "",
                                    "estado_o": estado_o or "",
                                    "motivo": motivo or "",
                                    "justif": justif or "",
                                    "id_of": id_of or "",
                                    "pdf": pdf or "",
                                    "np": np or "___NONE___",
                                    "np_like": f"%{np}%" if np and len(np) >= 5 else "___NONE___"
                                })
                                cat_actualizados += res_up.rowcount
                            except Exception as db_err:
                                logger.warning(f"Error actualizando ficha {np}: {db_err}")

                        db.commit()
                        total_actualizados += cat_actualizados
                        EXTRACTION_STATUS["items_inserted"] = total_actualizados
                        add_status_log(f"   💾 {cat_actualizados} registros actualizados en BD para {categ_nom}.")

                except Exception as cat_err:
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
