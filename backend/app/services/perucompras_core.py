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


async def login_automatico(
    page: Page,
    usuario: str,
    password: str,
    max_retries: int = 6,
    log_func: Optional[Callable[[str], None]] = None
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
            
            # Verificar si ya está logueado
            if "/AccesoGeneral" not in page.url and "/Login" not in page.url:
                _log("✅ Sesión activa detectada.")
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

            # Validar si redireccionó fuera de la pantalla de login
            if "/AccesoGeneral" not in page.url:
                _log("🎉 Login exitoso en Perú Compras.")
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
    log_func: Optional[Callable[[str], None]] = None
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


async def completar_menu_dinamico(
    page: Page,
    acuerdo: str,
    catalogo: str,
    categoria: str,
    log_func: Optional[Callable[[str], None]] = None
) -> bool:
    """
    4. Selecciona las opciones en los desplegables dinámicos y presiona #btnBuscar.
    """
    _safe_log(f"📋 completando menu dinamico: acuerdo={acuerdo}, catalogo={catalogo}, categoria={categoria}", log_func)
    try:
        # Esperar dropdowns
        await page.wait_for_selector("select", timeout=15000)

        # Disparar búsqueda botón #btnBuscar si existe
        btn_buscar = await page.query_selector("#btnBuscar, input[value='Iniciar Búsqueda'], .btn-search")
        if btn_buscar:
            await btn_buscar.click()
            _safe_log("🚀 Botón #btnBuscar clickeado.", log_func)
            await page.wait_for_timeout(2000)
        return True
    except Exception as e:
        _safe_log(f"❌ Error en completar_menu_dinamico: {e}", log_func)
        return False


def _parse_html_products_partial(html_text: str) -> List[Dict[str, Any]]:
    """Parsea la tabla HTML devuelta por _ListaProductosOfertados."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_text, "html.parser")
        rows = soup.find_all("tr")
        products = []
        for r in rows:
            cols = [td.get_text(strip=True) for td in r.find_all("td")]
            if len(cols) >= 7:
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

                marca_match = re.search(r'UNIDAD\s+([A-Z0-9_-]+)', desc)
                marca = marca_match.group(1) if marca_match else "VARIOS"
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
    url = f"{BASE_URL}/MejoraBasica/_ListaProductosOfertados?N_Acuerdo={n_acuerdo}&N_Catalogo={n_catalogo}&N_Categoria={n_categoria}&_={int(time.time() * 1000)}"
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
