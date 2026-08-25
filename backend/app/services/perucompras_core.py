"""
MÓDULO CENTRAL PERUCOMPRAS_CORE
================================
Funciones Padre para Automatización de Perú Compras según GUIA_FUNCIONES_PADRE_PERUCOMPRAS.md
"""

import asyncio
import io
import logging
import os
import time
import re
import json
import base64
import html
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from playwright.async_api import Page, TimeoutError as PWTimeoutError

try:
    from PIL import Image
    import pytesseract
    TESSERACT_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
    if os.path.exists(TESSERACT_WIN_PATH):
        pytesseract.pytesseract.tesseract_cmd = TESSERACT_WIN_PATH
    HAS_OCR = True
except ImportError:
    HAS_OCR = False
    Image = None
    pytesseract = None

logger = logging.getLogger("ceam.perucompras_core")

import base64

BASE_URL = "https://catalogos.perucompras.gob.pe"
LOGIN_URL = f"{BASE_URL}/AccesoGeneral"
MEJORA_BASICA_URL = f"{BASE_URL}/MejoraBasica"


async def _extract_captcha_bytes_via_canvas(page: Page) -> Optional[bytes]:
    """Extrae los bytes exactos PNG del #imgCaptcha usandolo sobre un Canvas HTML5 del DOM."""
    try:
        data_url = await page.evaluate("""() => {
            return new Promise((resolve) => {
                const img = document.querySelector('#imgCaptcha');
                if (!img) { resolve(null); return; }
                const canvas = document.createElement('canvas');
                canvas.width = img.naturalWidth || img.width || 220;
                canvas.height = img.naturalHeight || img.height || 80;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas.toDataURL('image/png'));
            });
        }""")
        if data_url and ',' in data_url:
            base64_str = data_url.split(',')[1]
            return base64.b64decode(base64_str)
    except Exception as e:
        logger.warning("Error en _extract_captcha_bytes_via_canvas: %s", e)
    
    # Fallback screenshot
    try:
        captcha_el = await page.query_selector("#imgCaptcha")
        if captcha_el:
            return await captcha_el.screenshot()
    except Exception:
        pass
    return None


def _solve_captcha_image(img_bytes: bytes) -> str:
    """Procesa los bytes del CAPTCHA con PIL (scaling 3x) + PyTesseract para obtener los 6 caracteres del CAPTCHA."""
    if not HAS_OCR or not Image or not pytesseract:
        logger.warning("Pillow / PyTesseract no están disponibles.")
        return ""
    try:
        img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        scaled = img.resize((img.width * 3, img.height * 3), Image.LANCZOS)
        gray = scaled.convert("L")
        
        # OCR en escala de grises escalada
        raw_text = pytesseract.image_to_string(gray, config="--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz").strip()
        clean = "".join(ch for ch in raw_text if ch.isalnum())
        if len(clean) >= 6:
            return clean[:6]

        # Umbral binarizado 130
        bw130 = gray.point(lambda x: 0 if x < 130 else 255, "1")
        raw130 = pytesseract.image_to_string(bw130, config="--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz").strip()
        clean130 = "".join(ch for ch in raw130 if ch.isalnum())
        if len(clean130) >= 6:
            return clean130[:6]
        elif len(clean130) >= 4:
            return clean130

        return clean[:6] if clean else ""
    except Exception as e:
        logger.warning("Error en _solve_captcha_image: %s", e)
        return ""


async def _capture_live_preview(page: Page, screenshot_callback: Optional[Callable[[str], None]] = None):
    """Captura screenshot del navegador y lo envía al callback en base64 para vista en vivo."""
    if screenshot_callback:
        try:
            shot_bytes = await page.screenshot(type="jpeg", quality=60)
            b64_str = f"data:image/jpeg;base64,{base64.b64encode(shot_bytes).decode('ascii')}"
            screenshot_callback(b64_str)
        except Exception:
            pass


async def login_automatico(
    page: Page,
    usuario: str,
    password: str,
    max_retries: int = 6,
    log_func: Optional[Callable[[str], None]] = None,
    screenshot_callback: Optional[Callable[[str], None]] = None
) -> bool:
    """
    1. Autenticación en el portal Perú Compras con resolución automática de CAPTCHA.
    """
    def _log(msg: str):
        logger.info(msg)
        if log_func:
            try:
                log_func(msg)
            except Exception:
                log_func(msg.encode('ascii', errors='ignore').decode('ascii'))

    _log("🔑 Iniciando login_automatico en Perú Compras...")
    
    # Asegurar resolución 1920x1080 para evitar deformación del CAPTCHA
    await page.set_viewport_size({"width": 1920, "height": 1080})

    for attempt in range(1, max_retries + 1):
        _log(f"Intento de login {attempt}/{max_retries}...")
        try:
            await page.goto(LOGIN_URL, timeout=45000, wait_until="networkidle")
            await _capture_live_preview(page, screenshot_callback)
            
            # Verificar si ya está logueado
            if "/AccesoGeneral" not in page.url and "/Login" not in page.url:
                _log("✅ Sesión activa detectada.")
                await _capture_live_preview(page, screenshot_callback)
                return True

            # Llenar usuario y clave (usar selector id exacto e indicar state='visible')
            user_input = await page.wait_for_selector("#ID_Usuario", state="visible", timeout=10000)
            if user_input:
                await user_input.fill(usuario)

            pass_input = await page.wait_for_selector("#Contrasena", state="visible", timeout=10000)
            if pass_input:
                await pass_input.fill(password)

            # Extraer CAPTCHA vía HTML5 Canvas para máxima nitidez (sin ruido de viewport)
            await page.wait_for_selector("#imgCaptcha", timeout=10000)
            captcha_bytes = await _extract_captcha_bytes_via_canvas(page)
            captcha_code = ""
            if captcha_bytes:
                captcha_code = _solve_captcha_image(captcha_bytes)
                _log(f"🧩 CAPTCHA extraído por OCR vía Canvas: '{captcha_code}'")

            # Remover modales/overlays transparentes que puedan bloquear el clic
            await page.evaluate("""() => {
                const overlays = document.querySelectorAll('.modal-overlay, .modal-backdrop');
                overlays.forEach(el => el.remove());
            }""")

            # Llenar CAPTCHA y presionar Enter
            captcha_input = await page.wait_for_selector("#CodigoCaptcha, input[name='CodigoCaptcha']", timeout=5000)
            if captcha_input and captcha_code:
                await captcha_input.fill(captcha_code)
                await _capture_live_preview(page, screenshot_callback)
                await captcha_input.press("Enter")

            # Click Ingresar (con force=True)
            btn_submit = await page.query_selector("button[type='submit'], input[type='submit'], #btnIngresar, .btn-primary")
            if btn_submit:
                try:
                    await btn_submit.click(force=True, timeout=5000)
                except Exception:
                    # Alternativa: Submit JS directo del formulario
                    await page.evaluate("() => { const form = document.querySelector('form'); if (form) form.submit(); }")

            await page.wait_for_timeout(3000)
            await _capture_live_preview(page, screenshot_callback)

            # Validar si redireccionó fuera de la pantalla de login
            if "/AccesoGeneral" not in page.url:
                _log("🎉 Login exitoso en Perú Compras.")
                await _capture_live_preview(page, screenshot_callback)
                return True
            else:
                _log("⚠️ El login no avanzó (posible CAPTCHA incorrecto). Reintentando...")

        except Exception as e:
            _log(f"❌ Error en intento {attempt}: {e}")

        await asyncio.sleep(2)

    _log("❌ Se agotaron los intentos de login_automatico.")
    return False


def _safe_log(msg: str, log_func: Optional[Callable[[str], None]] = None):
    logger.info(msg)
    if log_func:
        try:
            log_func(msg)
        except Exception:
            log_func(msg.encode('ascii', errors='ignore').decode('ascii'))


async def saltar_verificacion(
    page: Page,
    log_func: Optional[Callable[[str], None]] = None,
    screenshot_callback: Optional[Callable[[str], None]] = None
) -> bool:
    """
    2. Maniobra de retroceso seguro y navegación limpia a MejoraBasica.
    """
    _safe_log("🔄 Ejecutando saltar_verificacion...", log_func)
    try:
        await page.go_back()
        await page.wait_for_timeout(1000)
        await page.goto(BASE_URL, timeout=30000)
        await page.goto(MEJORA_BASICA_URL, timeout=30000, wait_until="networkidle")
        await _capture_live_preview(page, screenshot_callback)
        _safe_log("✅ Navegación a MejoraBasica completada con éxito.", log_func)
        return True
    except Exception as e:
        _safe_log(f"⚠️ Error en saltar_verificacion: {e}", log_func)
        return False


async def navegar_mejora_basica(
    page: Page,
    log_func: Optional[Callable[[str], None]] = None
) -> bool:
    """
    3. Navegación directa a MejoraBasica.
    """
    return await saltar_verificacion(page, log_func=log_func)


async def descubrir_todas_las_combinaciones(
    page: Page,
    log_func: Optional[Callable[[str], None]] = None
) -> List[Dict[str, Any]]:
    """
    Descubre dinámicamente todos los Acuerdos, Catálogos y Categorías disponibles
    en la cuenta activa en MejoraBasica, ordenándolos por prioridad de negocio:
      1. COMPUTADORAS DE ESCRITORIO (Desktop PC tradicional)
      2. COMPUTADORAS PORTÁTILES (Laptops / Notebooks)
      3. COMPUTADORAS TODO EN UNO (AIO)
      4. ESCÁNERES y demás categorías en orden
    """
    _safe_log("🧭 Descubriendo árbol completo de opciones dinámicas en Perú Compras...", log_func)
    combinaciones = []

    try:
        await page.wait_for_selector("#ajaxAcuerdo", state="visible", timeout=20000)

        # 1. Obtener todos los acuerdos
        acuerdos = await page.evaluate("""() => {
            const sel = document.querySelector('#ajaxAcuerdo');
            if (!sel) return [];
            return Array.from(sel.options)
                .filter(o => o.value && o.value !== '0' && o.value.trim() !== '')
                .map(o => ({ value: o.value.trim(), text: o.text.trim() }));
        }""")

        _safe_log(f"📋 Encontrados {len(acuerdos)} Acuerdos Marco en la cuenta.", log_func)

        for ac in acuerdos:
            # Seleccionar Acuerdo
            await page.evaluate("""(val) => {
                const sel = document.querySelector('#ajaxAcuerdo');
                if (sel) {
                    sel.value = val;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.jQuery) { window.jQuery(sel).trigger('change'); }
                }
            }""", ac["value"])

            # Esperar a que se pueble #ajaxCatalogo
            catalogos = []
            for _ in range(12):
                await page.wait_for_timeout(800)
                catalogos = await page.evaluate("""() => {
                    const sel = document.querySelector('#ajaxCatalogo');
                    if (!sel || sel.options.length <= 1) return [];
                    return Array.from(sel.options)
                        .filter(o => o.value && o.value !== '0' && o.value.trim() !== '')
                        .map(o => ({ value: o.value.trim(), text: o.text.trim() }));
                }""")
                if catalogos:
                    break

            _safe_log(f"  📂 Acuerdo [{ac['value']}] {ac['text']}: {len(catalogos)} catálogos detectados.", log_func)

            for cat in catalogos:
                # Seleccionar Catálogo
                await page.evaluate("""(val) => {
                    const sel = document.querySelector('#ajaxCatalogo');
                    if (sel) {
                        sel.value = val;
                        sel.dispatchEvent(new Event('change', { bubbles: true }));
                        if (window.jQuery) { window.jQuery(sel).trigger('change'); }
                    }
                }""", cat["value"])

                # Esperar a que se pueble #ajaxCategoria
                categorias = []
                for _ in range(12):
                    await page.wait_for_timeout(800)
                    categorias = await page.evaluate("""() => {
                        const sel = document.querySelector('#ajaxCategoria');
                        if (!sel || sel.options.length <= 1) return [];
                        return Array.from(sel.options)
                            .filter(o => o.value && o.value !== '0' && o.value.trim() !== '')
                            .map(o => ({ value: o.value.trim(), text: o.text.trim() }));
                    }""")
                    if categorias:
                        break

                for categ in categorias:
                    combinaciones.append({
                        "n_acuerdo": ac["value"],
                        "acuerdo_nombre": ac["text"],
                        "n_catalogo": cat["value"],
                        "catalogo_nombre": cat["text"],
                        "n_categoria": categ["value"],
                        "categoria_nombre": categ["text"],
                    })

        # Función de puntuación de prioridad para ordenar
        def calcular_prioridad(c):
            cat_up = c["catalogo_nombre"].upper()
            categ_up = c["categoria_nombre"].upper()

            # Prioridad 1: Computadoras de Escritorio (Desktop tradicional)
            if "ESCRITORIO" in cat_up and ("ESCRITORIO" in categ_up or "TORRE" in categ_up or "PC" in categ_up) and "TODO EN UNO" not in categ_up:
                return 1
            # Prioridad 2: Computadoras Portátiles / Laptops
            if "PORTATIL" in cat_up or "PORTÁTIL" in cat_up or "LAPTOP" in cat_up or "NOTEBOOK" in cat_up:
                return 2
            # Prioridad 3: Todo en Uno (AIO)
            if "TODO EN UNO" in categ_up or "ALL IN ONE" in categ_up or "AIO" in categ_up:
                return 3
            # Prioridad 4: Escáneres
            if "ESCANER" in cat_up or "ESCÁNER" in cat_up:
                return 4
            # Otras categorías
            return 10

        combinaciones.sort(key=calcular_prioridad)
        _safe_log(f"🎯 Total combinaciones descubiertas y ordenadas por prioridad: {len(combinaciones)}", log_func)
        return combinaciones

    except Exception as e:
        _safe_log(f"⚠️ Error en descubrimiento dinámico: {e}", log_func)
        # Fallback a las combinaciones conocidas por defecto
        return [
            {
                "n_acuerdo": "249",
                "acuerdo_nombre": "EXT-CE-2022-5 COMPUTADORAS DE ESCRITORIO, COMPUTADORAS PORTÁTILES Y ESCÁNERES",
                "n_catalogo": "252",
                "catalogo_nombre": "COMPUTADORAS DE ESCRITORIO",
                "n_categoria": "11736",
                "categoria_nombre": "COMPUTADORA TODO EN UNO"
            }
        ]


async def completar_menu_dinamico(
    page: Page,
    acuerdo: str = "",
    catalogo: str = "",
    categoria: str = "",
    log_func: Optional[Callable[[str], None]] = None,
    screenshot_callback: Optional[Callable[[str], None]] = None,
    max_wait_table_sec: int = 600
) -> Dict[str, Any]:
    """
    4. Selecciona en cascada las opciones de los desplegables dinámicos en MejoraBasica:
       - #ajaxAcuerdo (Acuerdo Marco)
       - #ajaxCatalogo (Catálogo de Productos)
       - #ajaxCategoria (Categoría de Productos)
       Dispara el botón #btnBuscar y espera activamente (hasta max_wait_table_sec = 10 min)
       a que el servidor de Perú Compras procese y renderice la tabla completa de productos.
    """
    _safe_log(f"📋 Completando menú dinámico: acuerdo='{acuerdo}', catálogo='{catalogo}', categoría='{categoria}'", log_func)
    res_selection = {"success": False, "n_acuerdo": None, "n_catalogo": None, "n_categoria": None, "products": []}

    try:
        # 1. Esperar y seleccionar #ajaxAcuerdo
        await page.wait_for_selector("#ajaxAcuerdo", state="visible", timeout=30000)
        acuerdo_res = await page.evaluate("""(target) => {
            const sel = document.querySelector('#ajaxAcuerdo');
            if (!sel) return null;
            let chosen = null;
            const normTarget = target.toLowerCase().trim();
            for (const opt of sel.options) {
                if (!opt.value || opt.value === '0') continue;
                const normText = opt.text.toLowerCase().trim();
                if (normTarget && normText.includes(normTarget)) {
                    chosen = opt;
                    break;
                }
                if (!chosen) chosen = opt; // Fallback al primero válido
            }
            if (chosen) {
                sel.value = chosen.value;
                sel.dispatchEvent(new Event('change', { bubbles: true }));
                if (window.jQuery) { window.jQuery(sel).trigger('change'); }
                return { value: chosen.value, text: chosen.text.trim() };
            }
            return null;
        }""", acuerdo)

        if not acuerdo_res:
            _safe_log("❌ No se encontraron opciones válidas en #ajaxAcuerdo.", log_func)
            return res_selection

        res_selection["n_acuerdo"] = int(acuerdo_res["value"])
        _safe_log(f"✅ Acuerdo seleccionado: [{acuerdo_res['value']}] {acuerdo_res['text']}", log_func)

        # 2. Esperar que #ajaxCatalogo se pueble mediante AJAX (hasta 15s)
        catalogo_res = None
        for _ in range(15):
            await page.wait_for_timeout(1000)
            catalogo_res = await page.evaluate("""(target) => {
                const sel = document.querySelector('#ajaxCatalogo');
                if (!sel || sel.options.length <= 1) return null;
                let chosen = null;
                const normTarget = target.toLowerCase().trim();
                for (const opt of sel.options) {
                    if (!opt.value || opt.value === '0' || opt.value === '') continue;
                    const normText = opt.text.toLowerCase().trim();
                    if (normTarget && normText.includes(normTarget)) {
                        chosen = opt;
                        break;
                    }
                    if (!chosen) chosen = opt;
                }
                if (chosen) {
                    sel.value = chosen.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.jQuery) { window.jQuery(sel).trigger('change'); }
                    return { value: chosen.value, text: chosen.text.trim() };
                }
                return null;
            }""", catalogo)
            if catalogo_res:
                break

        if not catalogo_res:
            _safe_log("❌ No se pudo poblar o seleccionar #ajaxCatalogo.", log_func)
            return res_selection

        res_selection["n_catalogo"] = int(catalogo_res["value"])
        _safe_log(f"✅ Catálogo seleccionado: [{catalogo_res['value']}] {catalogo_res['text']}", log_func)

        # 3. Esperar que #ajaxCategoria se pueble mediante AJAX (hasta 15s)
        categoria_res = None
        for _ in range(15):
            await page.wait_for_timeout(1000)
            categoria_res = await page.evaluate("""(target) => {
                const sel = document.querySelector('#ajaxCategoria');
                if (!sel || sel.options.length <= 1) return null;
                let chosen = null;
                const normTarget = target.toLowerCase().trim();
                for (const opt of sel.options) {
                    if (!opt.value || opt.value === '0' || opt.value === '') continue;
                    const normText = opt.text.toLowerCase().trim();
                    if (normTarget && normText.includes(normTarget)) {
                        chosen = opt;
                        break;
                    }
                    if (!chosen) chosen = opt;
                }
                if (chosen) {
                    sel.value = chosen.value;
                    sel.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.jQuery) { window.jQuery(sel).trigger('change'); }
                    return { value: chosen.value, text: chosen.text.trim() };
                }
                return null;
            }""", categoria)
            if categoria_res:
                break

        if not categoria_res:
            _safe_log("❌ No se pudo poblar o seleccionar #ajaxCategoria.", log_func)
            return res_selection

        res_selection["n_categoria"] = int(categoria_res["value"])
        _safe_log(f"✅ Categoría seleccionada: [{categoria_res['value']}] {categoria_res['text']}", log_func)

        # 4. Click en Buscar
        await page.evaluate("""() => {
            const btn = document.querySelector('#btnBuscar, #btnBuscarProducto, .btnBuscar, input[value="Buscar"], input[value="Iniciar Búsqueda"]');
            if (btn) {
                btn.click();
            }
        }""")
        _safe_log("🚀 Búsqueda disparada (#btnBuscar clickeado). Esperando procesamiento de Perú Compras (puede tomar 8-10 min)...", log_func)
        await _capture_live_preview(page, screenshot_callback)

        # 5. Espera activa inteligente hasta que la tabla o datos aparezcan en el DOM
        start_wait = time.time()
        last_log_time = start_wait
        found_rows = False

        while time.time() - start_wait < max_wait_table_sec:
            await page.wait_for_timeout(3000)
            now = time.time()
            elapsed = int(now - start_wait)

            # Transmitir screenshot en vivo
            await _capture_live_preview(page, screenshot_callback)

            # Verificar si la tabla ya tiene filas con productos renderizados
            check_dom = await page.evaluate("""() => {
                const container = document.querySelector('#OfertasPanelDiv') || document.querySelector('#TablaProductos') || document.querySelector('table');
                const rows = container ? container.querySelectorAll('tr') : document.querySelectorAll('tr');
                const hasDataRows = Array.from(rows).some(r => r.querySelectorAll('td').length >= 5);
                const html = container ? container.innerHTML : '';
                return { hasDataRows, rowCount: rows.length, html };
            }""")

            if check_dom and check_dom.get("hasDataRows"):
                found_rows = True
                _safe_log(f"🎉 Tabla cargada exitosamente en el DOM ({elapsed}s transcurridos, {check_dom.get('rowCount')} filas detectadas).", log_func)
                await _capture_live_preview(page, screenshot_callback)
                if check_dom.get("html"):
                    products = _parse_html_products_partial(check_dom["html"])
                    if products:
                        res_selection["products"] = products
                        _safe_log(f"📦 Extraídos {len(products)} productos directamente desde el DOM.", log_func)
                break

            # Log de progreso cada 15 segundos
            if now - last_log_time >= 15:
                last_log_time = now
                _safe_log(f"⏳ Esperando que el servidor estatal procese y devuelva los datos... ({elapsed}s / {max_wait_table_sec}s)", log_func)

        # Si el DOM no extrajo los productos, extraerlos directamente de la ruta _ListaProductosOfertados
        if not res_selection.get("products") and res_selection.get("n_acuerdo") and res_selection.get("n_catalogo") and res_selection.get("n_categoria"):
            _safe_log("📡 Obteniendo dataset completo de la ruta directa /MejoraBasica/_ListaProductosOfertados...", log_func)
            direct_items = await consultar_json_productos(
                page,
                n_acuerdo=res_selection["n_acuerdo"],
                n_catalogo=res_selection["n_catalogo"],
                n_categoria=res_selection["n_categoria"],
                log_func=log_func
            )
            if direct_items:
                res_selection["products"] = direct_items
                _safe_log(f"📦 Extraídos {len(direct_items)} productos completos de un solo golpe desde la ruta directa.", log_func)

        res_selection["success"] = True
        return res_selection

    except Exception as e:
        _safe_log(f"❌ Error en completar_menu_dinamico: {e}", log_func)
        return res_selection


def _parse_html_products_partial(html_text: str) -> List[Dict[str, Any]]:
    """
    Parsea las filas <tr> y columnas <td> de la tabla HTML devuelta por _ListaProductosOfertados
    usando expresiones regulares nativas y html.unescape para máxima velocidad y sin dependencias externas.
    """
    try:
        products = []
        tr_matches = re.findall(r'<tr[^>]*>(.*?)</tr>', html_text, re.DOTALL | re.IGNORECASE)

        for tr_content in tr_matches:
            td_matches = re.findall(r'<td[^>]*>(.*?)</td>', tr_content, re.DOTALL | re.IGNORECASE)
            if len(td_matches) >= 7:
                cols = [html.unescape(re.sub(r'<[^>]+>', ' ', td)).strip() for td in td_matches]
                cols = [' '.join(c.split()) for c in cols]

                desc = cols[1]
                estado = cols[2]
                moneda = cols[3]
                precio_str = cols[4]
                stock_str = cols[6]

                try:
                    precio = float(precio_str.replace(",", "")) if precio_str else 0.0
                except ValueError:
                    precio = 0.0

                try:
                    stock = int(stock_str) if stock_str else 0
                except ValueError:
                    stock = 0

                # Extraer marca y nro_parte del bloque UNIDAD ... SIST. MANEJO
                marca = "VARIOS"
                nro_parte = "S/N"
                unidad_match = re.search(r'UNIDAD\s+([A-Z0-9_-]+)(?:\s+(.*?))?(?:\s+([A-Z0-9_*#/-]+))?\s+SIST\.\s+MANEJO', desc, re.IGNORECASE)
                if unidad_match:
                    marca = unidad_match.group(1).upper()
                    nro_parte = unidad_match.group(3) or unidad_match.group(2) or "S/N"
                else:
                    words = desc.split()
                    nro_parte = words[-1] if words else "S/N"

                products.append({
                    "nro_parte": nro_parte,
                    "descripcion_producto": desc,
                    "marca": marca,
                    "precio_ofertado": precio,
                    "moneda": moneda,
                    "existencia_stock": stock,
                    "estado": estado
                })
        return products
    except Exception as e:
        logger.warning("Error parseando HTML partial de productos: %s", e)
        return []


async def consultar_json_productos(
    page: Page,
    n_acuerdo: int,
    n_catalogo: int,
    n_categoria: int,
    log_func: Optional[Callable[[str], None]] = None
) -> List[Dict[str, Any]]:
    """
    5. Ejecuta una petición fetch interna usando las cookies de la sesión activa en el navegador.
    Soporta formato JSON y Vista Parcial HTML DataTables ASP.NET de Perú Compras.
    """
    url = f"{BASE_URL}/MejoraBasica/_ListaProductosOfertados?N_Acuerdo={n_acuerdo}&N_Catalogo={n_catalogo}&N_Categoria={n_categoria}&C_Descripcion=&_={int(time.time() * 1000)}"
    _safe_log(f"📡 Pidiendo dataset de productos a: {url}", log_func)

    js_code = """
    async (targetUrl) => {
        const response = await fetch(targetUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        if (!response.ok) return null;
        return await response.text();
    }
    """

    try:
        raw_res = await page.evaluate(js_code, url)
        if not raw_res:
            _safe_log("⚠️ El servidor de Perú Compras devolvió una respuesta vacía.", log_func)
            return []

        # 1. Intentar JSON primero
        if raw_res.strip().startswith("[") or raw_res.strip().startswith("{"):
            try:
                data = json.loads(raw_res)
                if isinstance(data, list):
                    _safe_log(f"🎉 Extraídos {len(data)} productos en formato JSON crudo!", log_func)
                    return data
                elif isinstance(data, dict) and "data" in data:
                    items = data.get("data", [])
                    _safe_log(f"🎉 Extraídos {len(items)} productos desde objeto JSON!", log_func)
                    return items
            except Exception:
                pass

        # 2. Parsear HTML Partial de DataTables
        products = _parse_html_products_partial(raw_res)
        _safe_log(f"🎉 Extraídos {len(products)} productos desde la tabla HTML!", log_func)
        return products
    except Exception as e:
        _safe_log(f"❌ Error en consultar_json_productos: {e}", log_func)
        return []
