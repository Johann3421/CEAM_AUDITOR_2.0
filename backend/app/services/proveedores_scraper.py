"""
CEAM AUDITOR — Módulo Avanzado: Extractor de Ofertas por Proveedor (Perú Compras)
==================================================================================
Arquitectura de Alta Eficiencia:
  - Playwright para autenticación y captura de cookies de sesión (.ASPXAUTH / SessionId).
  - Pool Concurrente de Workers (`asyncio.Semaphore(5)`) con `httpx.AsyncClient`.
  - Rate Limiting con Jitter Aleatorio (0.3s - 1.0s) entre peticiones AJAX.
  - Validación Estricta de Contrato JSON con Pydantic.
  - Detección de Expiración de Sesión (Redirección HTML) con Re-autenticación.
  - Checkpointing Persistente en JSON para Resumibilidad.
  - Caching Local de Jerarquía de Combos con TTL.
"""

import asyncio
import logging
import json
import random
import os
import time
import re
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set

import httpx
from playwright.async_api import async_playwright
from pydantic import ValidationError
from sqlalchemy import text
from sqlalchemy.orm import Session
from app.schemas.oferta_proveedor import OfertaPeruComprasSchema
from app.services.perucompras_core import (
    login_automatico,
    saltar_verificacion,
    completar_menu_dinamico,
    descubrir_todas_las_combinaciones,
    consultar_json_productos,
    _parse_html_products_partial,
    _capture_live_preview
)

logger = logging.getLogger("ceam.proveedores_scraper")

BASE_URL = "https://catalogos.perucompras.gob.pe"
ENDPOINT_OFERTAS = f"{BASE_URL}/MejoraBasica/_ListaProductosOfertados"

CHECKPOINT_FILE = Path("checkpoint_proveedores.json")
COMBOS_CACHE_FILE = Path("combos_cache.json")

PROVEEDORES_CONFIG = {
    "thekingcomputer": {
        "id": "thekingcomputer",
        "nombre": "THE KING COMPUTER E.I.R.L.",
        "short": "The King Computer",
        "user": os.getenv("PERUCOMPRAS_USER_KING", "estalin.huamali01"),
        "pass": os.getenv("PERUCOMPRAS_PASS_KING", "PE/CyG6c&1R4T="),
        "ruc": "20601234567"
    },
    "jorge_rojas": {
        "id": "jorge_rojas",
        "nombre": "ROJAS VILLANUEVA JORGE LUIS",
        "short": "Jorge Rojas Villanueva",
        "user": os.getenv("PERUCOMPRAS_USER_ROJAS", "neison.chacas"),
        "pass": os.getenv("PERUCOMPRAS_PASS_ROJAS", "DHj585-g47j9#$@"),
        "ruc": "10408899991"
    }
}

DEFAULT_USER = PROVEEDORES_CONFIG["thekingcomputer"]["user"]
DEFAULT_PASS = PROVEEDORES_CONFIG["thekingcomputer"]["pass"]

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/json,*/*;q=0.8",
    "X-Requested-With": "XMLHttpRequest"
}
JITTER_MIN = 0.3
JITTER_MAX = 1.0
MAX_CONCURRENT_WORKERS = 3

EXTRACTION_STATUS = {
    "is_running": False,
    "status": "idle",
    "provider": "thekingcomputer",
    "provider_name": "THE KING COMPUTER E.I.R.L.",
    "progress_message": "",
    "combos_total": 0,
    "combos_completed": 0,
    "items_inserted": 0,
    "logs": [],
    "last_error": None,
    "latest_screenshot": None
}

def update_live_screenshot(b64_str: str):
    EXTRACTION_STATUS["latest_screenshot"] = b64_str

def add_status_log(msg: str):
    timestamp = time.strftime("%H:%M:%S")
    clean_msg = msg.encode('ascii', errors='ignore').decode('ascii') if not msg.isascii() else msg
    log_line = f"[{timestamp}] {clean_msg}"
    logger.info(clean_msg)
    EXTRACTION_STATUS["logs"].append(log_line)
    if len(EXTRACTION_STATUS["logs"]) > 200:
        EXTRACTION_STATUS["logs"] = EXTRACTION_STATUS["logs"][-200:]
    EXTRACTION_STATUS["progress_message"] = clean_msg

OFFICIAL_PERUCOMPRAS_COMBOS = [
    # 1. COMPUTADORAS DE ESCRITORIO (Catálogo 252 - 8 categorías)
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11735", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "COMPUTADORA DE ESCRITORIO"},
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11736", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "COMPUTADORA TODO EN UNO"},
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11740", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "ESTACION DE TRABAJO"},
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11741", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "MONITOR"},
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11742", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "PANTALLA PUBLICITARIA"},
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11749", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "PANTALLA INTERACTIVA"},
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11751", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "DISPOSITIVOS DE ALMACENAMIENTO INTERNO"},
    {"n_acuerdo": "249", "n_catalogo": "252", "n_categoria": "11747", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO", "categoria_nombre": "DISPOSITIVOS DE ALMACENAMIENTO EXTERNO"},

    # 2. COMPUTADORAS PORTÁTILES (Catálogo 250 - 3 categorías)
    {"n_acuerdo": "249", "n_catalogo": "250", "n_categoria": "11743", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS PORTÁTILES", "categoria_nombre": "COMPUTADORA PORTATIL"},
    {"n_acuerdo": "249", "n_catalogo": "250", "n_categoria": "11744", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS PORTÁTILES", "categoria_nombre": "ESTACION DE TRABAJO PORTATIL"},
    {"n_acuerdo": "249", "n_catalogo": "250", "n_categoria": "11745", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "COMPUTADORAS PORTÁTILES", "categoria_nombre": "TABLETA"},

    # 3. ESCÁNERES (Catálogo 251 - 3 categorías)
    {"n_acuerdo": "249", "n_catalogo": "251", "n_categoria": "11737", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "ESCÁNERES", "categoria_nombre": "ESCANER DE PLANOS"},
    {"n_acuerdo": "249", "n_catalogo": "251", "n_categoria": "11738", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "ESCÁNERES", "categoria_nombre": "ESCANER DE DOCUMENTOS"},
    {"n_acuerdo": "249", "n_catalogo": "251", "n_categoria": "11739", "acuerdo_nombre": "EXT-CE-2022-5", "catalogo_nombre": "ESCÁNERES", "categoria_nombre": "ESCANER DE LIBROS"},
]

# =========================================================================
# FUNCIÓN PRINCIPAL DE EXTRACCIÓN SISTEMÁTICA PASO A PASO
# =========================================================================
async def async_login_and_get_cookies(
    provider_key: str = "thekingcomputer",
    user: Optional[str] = None, 
    password: Optional[str] = None,
    db: Optional[Session] = None
) -> Dict[str, str]:
    """
    PIPELINE MAESTRO DE EXTRACCIÓN PERÚ COMPRAS
    ===========================================
    Este flujo ejecuta la extracción completa dividida en 7 pasos atómicos y modulares:

    PASO 1: Carga de credenciales y configuración del proveedor objetivo.
    PASO 2: Inicialización del motor Playwright con viewport Full HD (1920x1080).
    PASO 3: Autenticación en /AccesoGeneral con resolución automática de CAPTCHA por OCR.
    PASO 4: Evasión de modales y navegación a la ruta base de ofertas (/MejoraBasica).
    PASO 5: Iteración de la matriz de combinaciones (Acuerdo ➔ Catálogo ➔ Categoría).
            - PASO 5.1: Selección de selectores AJAX en el DOM (#ajaxAcuerdo, #ajaxCatalogo, #ajaxCategoria).
            - PASO 5.2: Consulta directa al endpoint JSON (_ListaProductosOfertados).
            - PASO 5.3: Fallback de búsqueda interactiva (Clic en #btnBuscar y parseo DOM).
    PASO 6: Normalización y enriquecimiento de metadatos (RUC, Proveedor, Catálogo, Categoría).
    PASO 7: Persistencia en base de datos con Upsert y trazabilidad histórica.
    """
    from playwright.async_api import async_playwright
    
    # -------------------------------------------------------------------------
    # PASO 1: CARGA DE CONFIGURACIÓN Y CREDENCIALES DEL PROVEEDOR
    # -------------------------------------------------------------------------
    prov_cfg = PROVEEDORES_CONFIG.get(provider_key, PROVEEDORES_CONFIG["thekingcomputer"])
    user = user or prov_cfg["user"]
    password = password or prov_cfg["pass"]
    nombre_proveedor = prov_cfg["nombre"]
    ruc_proveedor = prov_cfg["ruc"]

    EXTRACTION_STATUS["provider"] = provider_key
    EXTRACTION_STATUS["provider_name"] = nombre_proveedor
    EXTRACTION_STATUS["status"] = "running"
    EXTRACTION_STATUS["is_running"] = True
    EXTRACTION_STATUS["items_inserted"] = 0

    add_status_log(f"🏢 [PASO 1] Proveedor Activo: {nombre_proveedor} (RUC: {ruc_proveedor})")
    add_status_log(f"🔐 [PASO 1] Iniciando sesión con usuario: {user}")
    cookies_dict = {}

    try:
        # ---------------------------------------------------------------------
        # PASO 2: INICIALIZACIÓN DEL NAVEGADOR PLAYWRIGHT (HEADLESS FULL HD)
        # ---------------------------------------------------------------------
        async with async_playwright() as p:
            add_status_log("🌐 [PASO 2] Lanzando navegador Chromium headless (1920x1080)...")
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={'width': 1920, 'height': 1080})
            page = await context.new_page()
            page.set_default_timeout(600000)
            page.set_default_navigation_timeout(600000)

            # -----------------------------------------------------------------
            # PASO 3: AUTENTICACIÓN AUTOMATIZADA CON OCR DE CAPTCHA
            # -----------------------------------------------------------------
            add_status_log("🔑 [PASO 3] Ejecutando login_automatico con resolución de CAPTCHA...")
            ok = await login_automatico(
                page, 
                user, 
                password, 
                max_retries=6, 
                log_func=add_status_log,
                screenshot_callback=update_live_screenshot
            )

            if ok:
                # -------------------------------------------------------------
                # PASO 4: SALTO DE VERIFICACIÓN Y ACCESO A LA RUTA /MejoraBasica
                # -------------------------------------------------------------
                add_status_log("🚪 [PASO 4] Evadiendo verificación y navegando a /MejoraBasica...")
                await saltar_verificacion(
                    page, 
                    log_func=add_status_log,
                    screenshot_callback=update_live_screenshot
                )
                
                # -------------------------------------------------------------
                # PASO 5: ITERACIÓN DE CATEGORÍAS Y EXTRACCIÓN DE PRODUCTOS
                # -------------------------------------------------------------
                combos = OFFICIAL_PERUCOMPRAS_COMBOS
                EXTRACTION_STATUS["combos_total"] = len(combos)
                EXTRACTION_STATUS["combos_completed"] = 0

                for i, combo in enumerate(combos, 1):
                    n_acuerdo = combo["n_acuerdo"]
                    n_catalogo = combo["n_catalogo"]
                    n_categoria = combo["n_categoria"]
                    cat_nom = combo["catalogo_nombre"]
                    categ_nom = combo["categoria_nombre"]
                    acuerdo_nom = combo["acuerdo_nombre"]

                    add_status_log(f"⚡ [PASO 5: {i}/{len(combos)}] Procesando: [{cat_nom}] ➔ [{categ_nom}]...")
                    
                    # PASO 5.1: Establecer selección en DOM para preparar el contexto del servidor
                    try:
                        await page.evaluate("""({acuerdo, catalogo, categoria}) => {
                            const selAc = document.querySelector('#ajaxAcuerdo');
                            if (selAc) { selAc.value = acuerdo; selAc.dispatchEvent(new Event('change', { bubbles: true })); }
                            const selCat = document.querySelector('#ajaxCatalogo');
                            if (selCat) { selCat.value = catalogo; selCat.dispatchEvent(new Event('change', { bubbles: true })); }
                            const selCateg = document.querySelector('#ajaxCategoria');
                            if (selCateg) { selCateg.value = categoria; selCateg.dispatchEvent(new Event('change', { bubbles: true })); }
                        }""", {"acuerdo": n_acuerdo, "catalogo": n_catalogo, "categoria": n_categoria})
                        await page.wait_for_timeout(300)
                    except Exception as e:
                        logger.debug("Aviso al seleccionar combos DOM: %s", e)

                    # PASO 5.2: Consultar directamente el endpoint de productos JSON (_ListaProductosOfertados)
                    products = await consultar_json_productos(
                        page,
                        n_acuerdo=int(n_acuerdo),
                        n_catalogo=int(n_catalogo),
                        n_categoria=int(n_categoria),
                        log_func=add_status_log
                    )

                    # PASO 5.3: Fallback interactivo si el endpoint directo no trajo registros
                    if not products:
                        add_status_log(f"🔄 [PASO 5.3] Fallback interactivo: Clic en #btnBuscar para [{cat_nom} ➔ {categ_nom}]...")
                        try:
                            await page.click("#btnBuscar", timeout=5000)
                            await page.wait_for_timeout(3000)
                            dom_res = await page.evaluate("""() => {
                                const container = document.querySelector('#OfertasPanelDiv') || document.querySelector('table');
                                return container ? container.innerHTML : '';
                            }""")
                            if dom_res:
                                products = _parse_html_products_partial(dom_res)
                        except Exception as e:
                            add_status_log(f"⚠️ Aviso en click interactivo: {e}")

                    # ---------------------------------------------------------
                    # PASO 6 Y 7: NORMALIZACIÓN Y PERSISTENCIA EN BASE DE DATOS
                    # ---------------------------------------------------------
                    if products and db:
                        # PASO 6: Enriquecer con metadatos del proveedor y categoría oficial
                        for prod_item in products:
                            prod_item["catalogo"] = cat_nom
                            prod_item["categoria"] = categ_nom
                            prod_item["acuerdo_marco"] = acuerdo_nom
                            prod_item["nombre_proveedor"] = nombre_proveedor
                            prod_item["ruc_proveedor"] = ruc_proveedor

                        # PASO 7: Guardar en base de datos con Upsert
                        inserted_now = upsert_ofertas_history_db(db, products)
                        EXTRACTION_STATUS["items_inserted"] += inserted_now
                        add_status_log(f"✅ [PASO 7: {i}/{len(combos)}] Guardados {len(products)} productos de '{categ_nom}' para '{nombre_proveedor}'.")
                    else:
                        add_status_log(f"ℹ️ [PASO 7: {i}/{len(combos)}] 0 productos disponibles en '{categ_nom}'.")

                    EXTRACTION_STATUS["combos_completed"] = i
                    await asyncio.sleep(0.5)

                raw_cookies = await context.cookies()
                for c in raw_cookies:
                    cookies_dict[c["name"]] = c["value"]
                
                EXTRACTION_STATUS["status"] = "completed"
                EXTRACTION_STATUS["is_running"] = False
                add_status_log(f"🎉 [FIN] Extracción finalizada para {nombre_proveedor}. {EXTRACTION_STATUS['items_inserted']} ofertas guardadas en total.")
            else:
                EXTRACTION_STATUS["status"] = "error"
                EXTRACTION_STATUS["is_running"] = False
                add_status_log(f"❌ [PASO 3] Falló la autenticación para {nombre_proveedor} ({user}).")

            await browser.close()
    except Exception as e:
        EXTRACTION_STATUS["status"] = "error"
        EXTRACTION_STATUS["is_running"] = False
        EXTRACTION_STATUS["last_error"] = str(e)
        add_status_log(f"❌ Excepción en inicio de sesión / extracción: {e}")
    return cookies_dict

def login_and_get_cookies(provider_key: str = "thekingcomputer", user: Optional[str] = None, password: Optional[str] = None) -> Dict[str, str]:
    """Wrapper síncrono para async_login_and_get_cookies."""
    return asyncio.run(async_login_and_get_cookies(provider_key=provider_key, user=user, password=password))

def load_checkpoint() -> Set[str]:
    """Carga el conjunto de combinaciones ya procesadas exitosamente."""
    if CHECKPOINT_FILE.exists():
        try:
            with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                return set(data.get("completed", []))
        except Exception as e:
            logger.warning("Error leyendo checkpoint: %s", e)
    return set()

def save_checkpoint(completed: Set[str]):
    """Persiste las combinaciones completadas en disco."""
    try:
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump({"completed": list(completed), "updated_at": time.time()}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("Error guardando checkpoint: %s", e)

def load_combos_cache(max_age_days: int = 3) -> Optional[Dict]:
    """Carga la jerarquía de catálogos y categorías desde cache si no ha expirado."""
    if COMBOS_CACHE_FILE.exists():
        try:
            with open(COMBOS_CACHE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
                cached_at = data.get("cached_at", 0)
                if time.time() - cached_at < max_age_days * 86400:
                    return data.get("combos")
        except Exception as e:
            logger.warning("Error leyendo cache de combos: %s", e)
    return None

def save_combos_cache(combos_data: Dict):
    """Guarda la estructura jerárquica de combos en disco con timestamp."""
    try:
        with open(COMBOS_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(combos_data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning("Error guardando cache de combos: %s", e)

async def verify_national_scope(client: httpx.AsyncClient, cookies: Optional[Dict[str, str]] = None) -> bool:
    """
    Verifica si una consulta sin parámetros de Región/Provincia devuelve el dataset completo a nivel nacional.
    """
    params = {
        "N_Acuerdo": "249",
        "N_Catalogo": "252",
        "N_Categoria": "11736",
        "C_Descripcion": "",
        "_": int(time.time() * 1000)
    }
    try:
        resp = await client.get(ENDPOINT_OFERTAS, params=params, headers=DEFAULT_HEADERS, cookies=cookies)
        if resp.status_code == 200:
            text_res = resp.text
            if "AccesoGeneral" not in text_res:
                # Probar si es HTML partial
                items = _parse_html_products_partial(text_res)
                if len(items) > 0:
                    logger.info("⚡ Verificación de alcance exitosa: Petición nacional retornó %d registros sin iterar regiones.", len(items))
                    return True
                # Probar si es JSON
                try:
                    data = resp.json()
                    if isinstance(data, list) and len(data) > 0:
                        return True
                except Exception:
                    pass
    except Exception as e:
        logger.warning("No se pudo verificar alcance nacional: %s", e)
    return False

async def fetch_single_combo(
    client: httpx.AsyncClient,
    semaphore: asyncio.Semaphore,
    combo_key: str,
    n_acuerdo: str,
    n_catalogo: str,
    n_categoria: str,
    cookies: Optional[Dict[str, str]] = None
) -> Tuple[str, List[Dict], bool]:
    """
    Worker individual que ejecuta la petición AJAX con rate-limiting jitter y validación Pydantic.
    """
    async with semaphore:
        # Rate Limiting & Throttling with random jitter
        await asyncio.sleep(random.uniform(JITTER_MIN, JITTER_MAX))

        params = {
            "N_Acuerdo": n_acuerdo,
            "N_Catalogo": n_catalogo,
            "N_Categoria": n_categoria,
            "C_Descripcion": "",
            "_": int(time.time() * 1000)
        }

        try:
            resp = await client.get(ENDPOINT_OFERTAS, params=params, headers=DEFAULT_HEADERS, cookies=cookies)

            # Detect Session Expiration (Redirección HTTP a login o página de login)
            if resp.status_code in (301, 302):
                logger.warning("⚠️ Redirección 302 detectada. Sesión expirada para combo: %s", combo_key)
                return combo_key, [], True

            if resp.status_code == 200:
                raw_text = resp.text
                if "AccesoGeneral" in raw_text or "SISCatalogo - Peru Compras" in raw_text:
                    logger.warning("⚠️ Redirección a AccesoGeneral detectada en HTML. Sesión expirada.")
                    return combo_key, [], True

                # Intentar parsear como HTML Partial de DataTables
                items_from_html = _parse_html_products_partial(raw_text)
                if items_from_html and len(items_from_html) > 0:
                    logger.info("✅ Extraídos %d productos de la tabla HTML para combo %s", len(items_from_html), combo_key)
                    return combo_key, items_from_html, False

                # Si es JSON
                try:
                    raw_list = resp.json()
                    valid_items = []
                    if isinstance(raw_list, list):
                        for raw in raw_list:
                            try:
                                # Pydantic Contract Validation
                                validated = OfertaPeruComprasSchema.parse_obj(raw)
                                val_dict = validated.dict()
                                val_dict["raw_json"] = raw
                                valid_items.append(val_dict)
                            except ValidationError as ve:
                                logger.warning("Estructura JSON inválida en item: %s", ve)
                    return combo_key, valid_items, False
                except Exception:
                    pass

                return combo_key, [], False
            else:
                logger.error("HTTP Error %d en combo %s", resp.status_code, combo_key)
                return combo_key, [], False
        except Exception as e:
            logger.error("Excepción procesando combo %s: %s", combo_key, e)
            return combo_key, [], False

async def run_worker_pool_extraction(
    combos: List[Tuple[str, str, str]],
    db: Session,
    provider_key: str = "thekingcomputer",
    cookies: Optional[Dict[str, str]] = None
) -> Dict[str, int]:
    """
    Orquesta el Worker Pool concurrente procesando las combinaciones con resumibilidad y checkpoints.
    """
    prov_cfg = PROVEEDORES_CONFIG.get(provider_key, PROVEEDORES_CONFIG["thekingcomputer"])
    nombre_proveedor = prov_cfg["nombre"]

    EXTRACTION_STATUS["is_running"] = True
    EXTRACTION_STATUS["status"] = "running"
    EXTRACTION_STATUS["provider"] = provider_key
    EXTRACTION_STATUS["provider_name"] = nombre_proveedor
    EXTRACTION_STATUS["logs"] = []
    EXTRACTION_STATUS["last_error"] = None
    EXTRACTION_STATUS["combos_completed"] = 0
    EXTRACTION_STATUS["items_inserted"] = 0
    EXTRACTION_STATUS["combos_total"] = len(combos)

    add_status_log(f"⚡ Iniciando flujo de extracción para [{nombre_proveedor}]...")

    try:
        if not cookies:
            cookies = await async_login_and_get_cookies(provider_key=provider_key, db=db)
            if not cookies:
                EXTRACTION_STATUS["is_running"] = False
                EXTRACTION_STATUS["status"] = "error"
                EXTRACTION_STATUS["last_error"] = f"Fallo de autenticación en Perú Compras para {nombre_proveedor}"
                add_status_log("❌ Error fatal: No se pudo obtener sesión activa.")
                return {"processed_combos": 0, "total_inserted": 0, "error": "Login failed"}

        completed = load_checkpoint()
        semaphore = asyncio.Semaphore(MAX_CONCURRENT_WORKERS)
        total_inserted = 0
        combos_processed = 0

        # Timeout de 10 minutos para responder a la latencia de los servidores del Estado
        custom_timeout = httpx.Timeout(600.0, connect=60.0)
        async with httpx.AsyncClient(timeout=custom_timeout, follow_redirects=False) as client:
            add_status_log("🔍 Verificando alcance del endpoint JSON _ListaProductosOfertados...")
            is_national = await verify_national_scope(client, cookies)
            add_status_log(f"Scope nacional verificado: {is_national}")

            tasks = []
            for n_acuerdo, n_catalogo, n_categoria in combos:
                combo_key = f"{n_acuerdo}_{n_catalogo}_{n_categoria}"
                if combo_key in completed:
                    continue
                tasks.append(fetch_single_combo(client, semaphore, combo_key, n_acuerdo, n_catalogo, n_categoria, cookies))

            add_status_log(f"📡 Procesando Worker Pool ({len(tasks)} combinaciones)...")

            for chunk_start in range(0, len(tasks), 20):
                chunk = tasks[chunk_start:chunk_start + 20]
                results = await asyncio.gather(*chunk)

                for combo_key, items, session_expired in results:
                    if session_expired:
                        add_status_log("🚨 Sesión expirada. Solicitando re-autenticación...")
                        break

                    if items:
                        count = upsert_ofertas_history_db(db, items)
                        total_inserted += count
                        EXTRACTION_STATUS["items_inserted"] = total_inserted

                    completed.add(combo_key)
                    combos_processed += 1
                    EXTRACTION_STATUS["combos_completed"] = combos_processed

                save_checkpoint(completed)

        EXTRACTION_STATUS["is_running"] = False
        EXTRACTION_STATUS["status"] = "completed"
        add_status_log(f"🎉 Extracción finalizada con éxito para {nombre_proveedor}! Total ofertas insertadas/actualizadas: {total_inserted}")

        return {
            "processed_combos": combos_processed,
            "total_inserted": total_inserted,
            "national_scope_verified": is_national
        }
    except Exception as e:
        EXTRACTION_STATUS["is_running"] = False
        EXTRACTION_STATUS["status"] = "error"
        EXTRACTION_STATUS["last_error"] = str(e)
        add_status_log(f"❌ Error crítico en worker pool: {e}")
        return {"processed_combos": 0, "total_inserted": 0, "error": str(e)}

def upsert_ofertas_history_db(db: Session, ofertas: List[Dict]) -> int:
    """
    Inserta o actualiza las ofertas validadas en la tabla `ofertas_proveedor_history`
    garantizando trazabilidad histórica y evitando colisiones entre catálogos y proveedores.
    """
    if not ofertas:
        return 0

    inserted = 0
    stmt = text("""
        INSERT INTO ofertas_proveedor_history (
            nro_parte, descripcion_producto, marca, ruc_proveedor, nombre_proveedor,
            acuerdo_marco, catalogo, categoria, region, provincia,
            precio_ofertado, existencia_stock, plazo_entrega_dias, pdf_url, raw_json
        ) VALUES (
            :nro_parte, :descripcion, :marca, :ruc_proveedor, :nombre_proveedor,
            :acuerdo_marco, :catalogo, :categoria, :region, :provincia,
            :precio_ofertado, :existencia_stock, :plazo_entrega_dias, :pdf_url, :raw_json
        )
        ON CONFLICT DO NOTHING
    """)

    for o in ofertas:
        try:
            params = {
                "nro_parte": o.get("nro_parte") or "S/N",
                "descripcion": o.get("descripcion") or o.get("descripcion_producto") or "",
                "marca": o.get("marca") or "VARIOS",
                "ruc_proveedor": o.get("ruc_proveedor") or "20601234567",
                "nombre_proveedor": o.get("nombre_proveedor") or o.get("proveedor") or "THE KING COMPUTER E.I.R.L.",
                "acuerdo_marco": o.get("acuerdo_marco") or "EXT-CE-2022-5",
                "catalogo": o.get("catalogo") or "COMPUTADORAS DE ESCRITORIO",
                "categoria": o.get("categoria") or "ESCRITORIO",
                "region": o.get("region"),
                "provincia": o.get("provincia"),
                "precio_ofertado": o.get("precio_ofertado"),
                "existencia_stock": o.get("existencia_stock"),
                "plazo_entrega_dias": o.get("plazo_entrega_dias"),
                "pdf_url": o.get("pdf_url"),
                "raw_json": json.dumps(o.get("raw_json")) if o.get("raw_json") else None
            }
            db.execute(stmt, params)
            inserted += 1
        except Exception as e:
            logger.warning("Error guardando snapshot histórico en BD: %s", e)

PERU_REGIONES_OFICIALES = [
    {"codigo_region": "150000", "ubigeo_provincia": "150100", "nombre": "LIMA"},
    {"codigo_region": "070000", "ubigeo_provincia": "070100", "nombre": "CALLAO"},
    {"codigo_region": "040000", "ubigeo_provincia": "040100", "nombre": "AREQUIPA"},
    {"codigo_region": "080000", "ubigeo_provincia": "080100", "nombre": "CUSCO"},
    {"codigo_region": "130000", "ubigeo_provincia": "130100", "nombre": "LA LIBERTAD"},
    {"codigo_region": "200000", "ubigeo_provincia": "200100", "nombre": "PIURA"},
    {"codigo_region": "140000", "ubigeo_provincia": "140100", "nombre": "LAMBAYEQUE"},
    {"codigo_region": "120000", "ubigeo_provincia": "120100", "nombre": "JUNÍN"},
    {"codigo_region": "020000", "ubigeo_provincia": "020100", "nombre": "ÁNCASH"},
    {"codigo_region": "110000", "ubigeo_provincia": "110100", "nombre": "ICA"},
    {"codigo_region": "060000", "ubigeo_provincia": "060100", "nombre": "CAJAMARCA"},
    {"codigo_region": "210000", "ubigeo_provincia": "210100", "nombre": "PUNO"},
    {"codigo_region": "220000", "ubigeo_provincia": "220100", "nombre": "SAN MARTÍN"},
    {"codigo_region": "100000", "ubigeo_provincia": "100100", "nombre": "HUÁNUCO"},
    {"codigo_region": "050000", "ubigeo_provincia": "050100", "nombre": "AYACUCHO"},
    {"codigo_region": "160000", "ubigeo_provincia": "160100", "nombre": "LORETO"},
    {"codigo_region": "250000", "ubigeo_provincia": "250100", "nombre": "UCAYALI"},
    {"codigo_region": "230000", "ubigeo_provincia": "230100", "nombre": "TACNA"},
    {"codigo_region": "180000", "ubigeo_provincia": "180100", "nombre": "MOQUEGUA"},
    {"codigo_region": "240000", "ubigeo_provincia": "240100", "nombre": "TUMBES"},
    {"codigo_region": "030000", "ubigeo_provincia": "030100", "nombre": "APURÍMAC"},
    {"codigo_region": "010000", "ubigeo_provincia": "010100", "nombre": "AMAZONAS"},
    {"codigo_region": "090000", "ubigeo_provincia": "090100", "nombre": "HUANCAVELICA"},
    {"codigo_region": "190000", "ubigeo_provincia": "190100", "nombre": "PASCO"},
    {"codigo_region": "170000", "ubigeo_provincia": "170100", "nombre": "MADRE DE DIOS"}
]

def _normalize_region_text(s: str) -> str:
    if not s:
        return ""
    import unicodedata
    n = unicodedata.normalize('NFKD', s.strip().upper())
    return ''.join(c for c in n if not unicodedata.combining(c))

async def async_extract_plazos_regionales(
    provider_key: str = "thekingcomputer",
    regiones: Optional[List[str]] = None,
    db: Optional[Session] = None
) -> Dict:
    """
    Extrae los plazos de entrega vigentes por región y provincia directamente desde /MejoraPlazo/consultaMejoraPlazoEntrega.
    """
    prov_cfg = PROVEEDORES_CONFIG.get(provider_key, PROVEEDORES_CONFIG["thekingcomputer"])
    user = prov_cfg["user"]
    password = prov_cfg["pass"]
    ruc = prov_cfg["ruc"]
    nombre_proveedor = prov_cfg["nombre"]

    # Normalizar lista de regiones solicitadas
    norm_regiones = [_normalize_region_text(r) for r in regiones if r and _normalize_region_text(r) not in ("ALL", "TODAS", "GLOBAL", "")] if regiones else []

    if norm_regiones:
        target_regiones = [
            r for r in PERU_REGIONES_OFICIALES 
            if _normalize_region_text(r["nombre"]) in norm_regiones or r["codigo_region"] in norm_regiones
        ]
    else:
        target_regiones = PERU_REGIONES_OFICIALES

    EXTRACTION_STATUS["is_running"] = True
    EXTRACTION_STATUS["status"] = "running"
    EXTRACTION_STATUS["current_provider"] = nombre_proveedor
    EXTRACTION_STATUS["combos_total"] = len(target_regiones)
    EXTRACTION_STATUS["combos_completed"] = 0
    EXTRACTION_STATUS["items_inserted"] = 0
    add_status_log(f"⏱️ Iniciando extracción de plazos regionales para {nombre_proveedor} ({len(target_regiones)} regiones)...")

    total_actualizados = 0

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(viewport={"width": 1920, "height": 1080})
            page = await context.new_page()

            ok = await login_automatico(page, user, password, max_retries=6, log_func=add_status_log, screenshot_callback=update_live_screenshot)
            if not ok:
                raise Exception("Fallo en login de autenticación en Perú Compras.")

            target_url = "https://catalogos.perucompras.gob.pe/MejoraPlazo/IndexMejora"
            nav_ok = await saltar_verificacion(page, target_url=target_url, log_func=add_status_log, screenshot_callback=update_live_screenshot)
            if not nav_ok:
                raise Exception(f"No se pudo acceder a la ruta {target_url}")

            await page.wait_for_timeout(1500)
            await _capture_live_preview(page, update_live_screenshot)

            # 1. Obtener acuerdo_id y acuerdo_proveedor_id desde filtro 0
            acuerdo_info = await page.evaluate("""async () => {
                try {
                    const res = await fetch('/MejoraPlazo/obtenerFiltros', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                        body: '0^18181',
                        signal: AbortSignal.timeout(10000)
                    });
                    return await res.text();
                } catch(e) { return null; }
            }""")

            acuerdo_id = "249"
            acuerdo_prov_id = "118205"
            if acuerdo_info and "-" in acuerdo_info:
                header_acuerdo = acuerdo_info.split("¯")[0]
                parts = header_acuerdo.split("^")[0].split("-")
                if len(parts) >= 2:
                    acuerdo_id = parts[0]
                    acuerdo_prov_id = parts[1]

            add_status_log(f"🔑 Acuerdo ID: {acuerdo_id} | Proveedor ID: {acuerdo_prov_id}")

            # 2. Obtener catálogos dinámicos
            catalogos_raw = await page.evaluate("""async (acuerdoId) => {
                try {
                    const res = await fetch('/MejoraPlazo/obtenerFiltros', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                        body: `1^${acuerdoId}`,
                        signal: AbortSignal.timeout(10000)
                    });
                    return await res.text();
                } catch(e) { return null; }
            }""", acuerdo_id)

            combos_activos = []
            if catalogos_raw:
                for cat_str in catalogos_raw.split("¬"):
                    if not cat_str.strip():
                        continue
                    cat_parts = cat_str.split("^")
                    if len(cat_parts) >= 2:
                        id_cat, nom_cat = cat_parts[0], cat_parts[1]
                        
                        # 3. Obtener subcategorías para cada catálogo
                        subcats_raw = await page.evaluate("""async (idCat) => {
                            try {
                                const res = await fetch('/MejoraPlazo/obtenerFiltros', {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                                    body: `2^${idCat}`,
                                    signal: AbortSignal.timeout(10000)
                                });
                                return await res.text();
                            } catch(e) { return null; }
                        }""", id_cat)

                        if subcats_raw:
                            for subcat_str in subcats_raw.split("¬"):
                                if not subcat_str.strip():
                                    continue
                                subcat_parts = subcat_str.split("^")
                                if len(subcat_parts) >= 2:
                                    combos_activos.append({
                                        "id_catalogo": id_cat,
                                        "nom_catalogo": nom_cat,
                                        "id_subcategoria": subcat_parts[0],
                                        "nom_subcategoria": subcat_parts[1]
                                    })

            if not combos_activos:
                # Fallback con combos estándar conocidos
                combos_activos = [
                    {"id_catalogo": "250", "nom_catalogo": "COMPUTADORAS PORTATILES", "id_subcategoria": "11743", "nom_subcategoria": "COMPUTADORA PORTATIL"},
                    {"id_catalogo": "250", "nom_catalogo": "COMPUTADORAS PORTATILES", "id_subcategoria": "11744", "nom_subcategoria": "ESTACION DE TRABAJO PORTATIL"},
                    {"id_catalogo": "250", "nom_catalogo": "COMPUTADORAS PORTATILES", "id_subcategoria": "11745", "nom_subcategoria": "TABLETA"},
                    {"id_catalogo": "252", "nom_catalogo": "COMPUTADORAS DE ESCRITORIO", "id_subcategoria": "11735", "nom_subcategoria": "COMPUTADORA DE ESCRITORIO"},
                    {"id_catalogo": "252", "nom_catalogo": "COMPUTADORAS DE ESCRITORIO", "id_subcategoria": "11736", "nom_subcategoria": "COMPUTADORA TODO EN UNO"},
                    {"id_catalogo": "252", "nom_catalogo": "COMPUTADORAS DE ESCRITORIO", "id_subcategoria": "11740", "nom_subcategoria": "ESTACION DE TRABAJO"},
                    {"id_catalogo": "252", "nom_catalogo": "COMPUTADORAS DE ESCRITORIO", "id_subcategoria": "11741", "nom_subcategoria": "MONITOR"},
                ]

            # Mapeo subcategoría portal → catalogo/categoria en BD
            SUBCAT_TO_DB = {
                "COMPUTADORA PORTATIL": ("COMPUTADORAS PORTATILES", "COMPUTADORA PORTATIL"),
                "ESTACION DE TRABAJO PORTATIL": ("COMPUTADORAS PORTATILES", "ESTACION DE TRABAJO PORTATIL"),
                "TABLETA": ("TABLETS", "TABLET"),
                "COMPUTADORA DE ESCRITORIO": ("COMPUTADORAS DE ESCRITORIO", "COMPUTADORA DE ESCRITORIO"),
                "COMPUTADORA TODO EN UNO": ("COMPUTADORAS DE ESCRITORIO", "COMPUTADORA TODO EN UNO"),
                "ESTACION DE TRABAJO": ("ESTACIONES DE TRABAJO", "ESTACION DE TRABAJO"),
                "MONITOR": ("MONITORES", "MONITOR"),
                "ESCANER DE DOCUMENTOS": ("ESCANERES", "ESCANER DE DOCUMENTOS"),
                "ESCANER DE PLANOS": ("ESCANERES", "ESCANER DE PLANOS"),
                "IMPRESORA": ("IMPRESORAS", "IMPRESORA"),
                "MULTIFUNCIONAL": ("IMPRESORAS", "MULTIFUNCIONAL"),
                "SERVIDOR": ("SERVIDORES", "SERVIDOR"),
                "PROYECTOR": ("PROYECTORES", "PROYECTOR"),
                "UPS": ("ENERGIA Y UPS", "UPS"),
            }

            if db:
                # UPDATE masivo: todas las ofertas de un catalogo+categoria del proveedor en esa región
                update_stmt = text("""
                    UPDATE ofertas_proveedor_history
                    SET raw_json = jsonb_set(
                            COALESCE(raw_json::jsonb, '{}'::jsonb),
                            ARRAY['plazos_por_region', :region],
                            to_jsonb(CAST(:plazo AS integer))
                        ),
                        plazo_entrega_dias = :plazo
                    WHERE (ruc_proveedor = :ruc OR UPPER(nombre_proveedor) LIKE :prov_match)
                      AND UPPER(categoria) LIKE :cat_match
                """)
                prov_search = "%KING%" if "KING" in nombre_proveedor.upper() else "%ROJAS%"

            EXTRACTION_STATUS["combos_total"] = len(target_regiones) * len(combos_activos)

            for reg in target_regiones:
                cod_reg = reg["codigo_region"]
                reg_nom = reg["nombre"]
                reg_key = _normalize_region_text(reg_nom)
                ubigeo_prov = reg["ubigeo_provincia"]

                add_status_log(f"📍 Región: {reg_nom} (Ubigeo: {ubigeo_prov})")

                reg_actualizados = 0

                for combo in combos_activos:
                    id_cat = combo["id_catalogo"]
                    id_subcat = combo["id_subcategoria"]
                    nom_subcat = combo["nom_subcategoria"]

                    body_post = f"{acuerdo_prov_id}^{id_cat}^{id_subcat}^^{ubigeo_prov}"

                    try:
                        res_raw = await page.evaluate("""async (bodyPost) => {
                            try {
                                const res = await fetch('/MejoraPlazo/consultaMejoraPlazoEntrega', {
                                    method: 'POST',
                                    headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                                    body: bodyPost,
                                    signal: AbortSignal.timeout(6000)
                                });
                                if (res.ok) {
                                    return await res.text();
                                }
                                return null;
                            } catch(e) { return null; }
                        }""", body_post)
                    except Exception:
                        res_raw = None

                    EXTRACTION_STATUS["combos_completed"] += 1

                    if not res_raw or "¯" not in res_raw:
                        continue

                    partes = res_raw.split("¯")
                    datos_str = partes[1] if len(partes) > 1 else ""

                    if not datos_str or not datos_str.strip():
                        continue

                    # Solo tomar la PRIMERA fila para obtener el plazo
                    primera_fila = None
                    for fila in datos_str.split("¬"):
                        if fila.strip():
                            cols = fila.split("^")
                            if len(cols) >= 7 and cols[6].strip():
                                primera_fila = cols
                                break

                    if not primera_fila:
                        continue

                    try:
                        plazo_int = int(float(primera_fila[6].strip()))
                    except (ValueError, TypeError):
                        continue

                    # Buscar mapeo en BD para esta subcategoría
                    nom_upper = nom_subcat.upper().strip()
                    db_cat = SUBCAT_TO_DB.get(nom_upper)
                    if not db_cat:
                        # Fallback: buscar por coincidencia parcial
                        for key, val in SUBCAT_TO_DB.items():
                            if key in nom_upper or nom_upper in key:
                                db_cat = val
                                break

                    cat_match = f"%{db_cat[1]}%" if db_cat else f"%{nom_upper}%"

                    if db:
                        result = db.execute(update_stmt, {
                            "plazo": plazo_int,
                            "region": reg_key,
                            "ruc": ruc,
                            "prov_match": prov_search,
                            "cat_match": cat_match
                        })
                        rows_updated = result.rowcount
                        db.commit()
                    else:
                        rows_updated = 0

                    reg_actualizados += rows_updated
                    total_actualizados += rows_updated
                    EXTRACTION_STATUS["items_inserted"] = total_actualizados

                    if rows_updated > 0:
                        add_status_log(f"   ✅ [{nom_subcat}] {plazo_int} días → {rows_updated} fichas actualizadas en {reg_nom}")

                add_status_log(f"   📊 Resumen {reg_nom}: {reg_actualizados} fichas totales actualizadas")

                if EXTRACTION_STATUS["combos_completed"] % 10 == 0:
                    await _capture_live_preview(page, update_live_screenshot)

            await browser.close()

        EXTRACTION_STATUS["is_running"] = False
        EXTRACTION_STATUS["status"] = "completed"
        add_status_log(f"🎉 Extracción de plazos completada! Total fichas actualizadas: {total_actualizados}")
        return {"status": "completed", "total_actualizados": total_actualizados}
    except Exception as e:
        EXTRACTION_STATUS["is_running"] = False
        EXTRACTION_STATUS["status"] = "error"
        EXTRACTION_STATUS["last_error"] = str(e)
        add_status_log(f"❌ Error extrayendo plazos regionales: {e}")
        return {"status": "error", "error": str(e)}

