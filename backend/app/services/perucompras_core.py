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

from PIL import Image
import pytesseract
from playwright.async_api import Page, TimeoutError as PWTimeoutError

# Intentar configurar la ruta estándar de Tesseract en Windows si existe
TESSERACT_WIN_PATH = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
if os.path.exists(TESSERACT_WIN_PATH):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_WIN_PATH

logger = logging.getLogger("ceam.perucompras_core")

BASE_URL = "https://catalogos.perucompras.gob.pe"
LOGIN_URL = f"{BASE_URL}/AccesoGeneral"
MEJORA_BASICA_URL = f"{BASE_URL}/MejoraBasica"


def _solve_captcha_image(img_bytes: bytes) -> str:
    """Procesa la imagen del CAPTCHA con PIL + PyTesseract para extraer el texto."""
    try:
        image = Image.open(io.BytesIO(img_bytes))
        gray = image.convert("L")
        # Umbral binarizado
        bw = gray.point(lambda x: 0 if x < 140 else 255, "1")
        text = pytesseract.image_to_string(bw, config="--psm 7 -c tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdefghijklmnopqrstuvwxyz").strip()
        if not text:
            text = pytesseract.image_to_string(gray, config="--psm 6").strip()
        # Limpiar espacios y caracteres no alfanuméricos
        clean_text = "".join(ch for ch in text if ch.isalnum())
        return clean_text
    except Exception as e:
        logger.warning("Error resolviendo CAPTCHA con Tesseract: %s", e)
        return ""


async def login_automatico(
    page: Page,
    usuario: str,
    password: str,
    max_retries: int = 5,
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

            # CAPTCHA
            captcha_el = await page.wait_for_selector("#imgCaptcha", timeout=10000)
            captcha_code = ""
            if captcha_el:
                img_bytes = await captcha_el.screenshot()
                captcha_code = _solve_captcha_image(img_bytes)
                _log(f"🧩 CAPTCHA extraído por OCR: '{captcha_code}'")

            captcha_input = await page.wait_for_selector("#CodigoCaptcha, input[name='CodigoCaptcha']", timeout=5000)
            if captcha_input and captcha_code:
                await captcha_input.fill(captcha_code)

            # Click Ingresar
            btn_submit = await page.query_selector("button[type='submit'], input[type='submit'], #btnIngresar, .btn-primary")
            if btn_submit:
                await btn_submit.click()

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


async def saltar_verificacion(
    page: Page,
    log_func: Optional[Callable[[str], None]] = None
) -> bool:
    """
    2. Maniobra de retroceso seguro y navegación limpia a MejoraBasica.
    """
    def _log(msg: str):
        logger.info(msg)
        if log_func:
            log_func(msg)

    _log("🔄 Ejecutando saltar_verificacion...")
    try:
        await page.go_back()
        await page.wait_for_timeout(1000)
        await page.goto(BASE_URL, timeout=30000)
        await page.goto(MEJORA_BASICA_URL, timeout=30000, wait_until="networkidle")
        _log("✅ Navegación a MejoraBasica completada con éxito.")
        return True
    except Exception as e:
        _log(f"⚠️ Error en saltar_verificacion: {e}")
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
    def _log(msg: str):
        logger.info(msg)
        if log_func:
            log_func(msg)

    _log(f"📋 completando menu dinamico: acuerdo={acuerdo}, catalogo={catalogo}, categoria={categoria}")
    try:
        # Esperar dropdowns
        await page.wait_for_selector("select", timeout=15000)

        # Disparar búsqueda botón #btnBuscar si existe
        btn_buscar = await page.query_selector("#btnBuscar, input[value='Iniciar Búsqueda'], .btn-search")
        if btn_buscar:
            await btn_buscar.click()
            _log("🚀 Botón #btnBuscar clickeado.")
            await page.wait_for_timeout(2000)
        return True
    except Exception as e:
        _log(f"❌ Error en completar_menu_dinamico: {e}")
        return False


async def consultar_json_productos(
    page: Page,
    n_acuerdo: int,
    n_catalogo: int,
    n_categoria: int,
    log_func: Optional[Callable[[str], None]] = None
) -> List[Dict[str, Any]]:
    """
    5. Ejecuta una petición fetch interna usando las cookies de la sesión activa en el navegador.
    Ruta objetivo: /MejoraBasica/_ListaProductosOfertados?N_Acuerdo=...&N_Catalogo=...&N_Categoria=...
    """
    def _log(msg: str):
        logger.info(msg)
        if log_func:
            log_func(msg)

    url = f"{BASE_URL}/MejoraBasica/_ListaProductosOfertados?N_Acuerdo={n_acuerdo}&N_Catalogo={n_catalogo}&N_Categoria={n_categoria}&_={int(time.time() * 1000)}"
    _log(f"📡 Pidiendo JSON de productos desde el navegador a: {url}")

    js_code = """
    async (targetUrl) => {
        const response = await fetch(targetUrl, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Accept': 'application/json, text/javascript, */*; q=0.01'
            }
        });
        if (!response.ok) return null;
        return await response.json();
    }
    """

    try:
        data = await page.evaluate(js_code, url)
        if isinstance(data, list):
            _log(f"🎉 ¡Extraídos {len(data)} productos en formato JSON crudo!")
            return data
        elif isinstance(data, dict) and "data" in data:
            items = data.get("data", [])
            _log(f"🎉 ¡Extraídos {len(items)} productos!")
            return items
        else:
            _log("⚠️ La respuesta no fue una lista. Obtenido tipo: " + str(type(data)))
            return []
    except Exception as e:
        _log(f"❌ Error ejecutando fetch interno para consultar_json_productos: {e}")
        return []
