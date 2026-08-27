"""
Test MejoraPlazo/consultaMejoraPlazoEntrega usando las funciones del proyecto.
Ejecutar desde la raiz del proyecto:

    python test_mejoraplazo.py

Se abrira Chrome visible. El login ocurre automaticamente via OCR de captcha.
"""
import asyncio
import sys
import os

# Agregar backend al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

async def main():
    from playwright.async_api import async_playwright
    # Usar las funciones ya probadas del proyecto
    from app.services.perucompras_core import login_automatico, saltar_verificacion

    USER = "estalin.huamali01"
    PASS = "PE/CyG6c&1R4T="

    # Parametros de prueba
    ACUERDO_PROV_ID = "118205"
    N_ACUERDO   = "EXT-CE-2022-5"
    N_CATALOGO  = "COMPUTADORAS PORTATILES"
    N_CATEGORIA = "COMPUTADORA PORTATIL"
    COD_REGION  = "150000"  # LIMA
    UBIGEO_PROV = "150100"  # Lima capital

    print("=== TEST MejoraPlazo ===\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context(viewport={"width": 1920, "height": 1080})
        page    = await context.new_page()

        print("[1] Login automatico via OCR captcha...")
        ok = await login_automatico(page, USER, PASS, max_retries=8)
        if not ok:
            print("❌ Login fallido. Abortando.")
            await browser.close()
            return

        print("[2] Navegando a MejoraPlazo/IndexMejora...")
        nav_ok = await saltar_verificacion(page, target_url="https://catalogos.perucompras.gob.pe/MejoraPlazo/IndexMejora")
        if not nav_ok:
            print("❌ No se pudo navegar a MejoraPlazo. Abortando.")
            await browser.close()
            return

        await page.wait_for_timeout(2000)

        # ---- FILTROS ----
        print("[3] Llamando obtenerFiltros (paso 0, 3, 4, 5)...")

        filter_results = await page.evaluate("""async ({nAcuerdo, nCategoria, codReg, ubigeoProv}) => {
            const get = async (body) => {
                const r = await fetch('/MejoraPlazo/obtenerFiltros', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                    body: body,
                });
                return await r.text();
            };

            const results = {};
            results['f0'] = await get('0^18181');
            results['f3'] = await get(`3^18181^${nAcuerdo}^${nCategoria}`);
            results['f4'] = await get(`4^${codReg}`);
            results['f5'] = await get(`5^${ubigeoProv}`);
            return results;
        }""", {"nAcuerdo": N_ACUERDO, "nCategoria": N_CATEGORIA, "codReg": COD_REGION, "ubigeoProv": UBIGEO_PROV})

        print(f"\n  f0 (acuerdo_prov_id): {str(filter_results.get('f0',''))[:300]}")
        print(f"\n  f3 (categoria)      : {str(filter_results.get('f3',''))[:300]}")
        print(f"\n  f4 (region)         : {str(filter_results.get('f4',''))[:500]}")
        print(f"\n  f5 (provincia)      : {str(filter_results.get('f5',''))[:300]}")

        # Extraer acuerdo_prov_id real desde f0
        f0 = str(filter_results.get("f0", ""))
        acuerdo_real = ACUERDO_PROV_ID
        if f0 and "-" in f0:
            try:
                parts = f0.split("^")[0].split("-")
                if len(parts) >= 2:
                    acuerdo_real = parts[1]
                    print(f"\n  [!] acuerdo_prov_id real desde f0: {acuerdo_real}")
            except:
                pass

        # Extraer primer ubigeo de provincia desde f4
        f4 = str(filter_results.get("f4", ""))
        first_ubigeo = UBIGEO_PROV
        if f4:
            # Formato esperado: ubigeo^nombre¬ubigeo^nombre...
            first_prov = f4.split("¬")[0] if "¬" in f4 else f4.split("^")[0] if "^" in f4 else ""
            if first_prov:
                print(f"\n  Primera provincia de f4: {first_prov!r}")

        # ---- PROBAR FORMATOS ----
        print(f"\n[4] Probando formatos de body con acuerdo_prov_id={acuerdo_real!r}...\n")

        test_cases = [
            ("Original (doble ^, ubigeo prov capital)", f"{acuerdo_real}^{N_CATALOGO}^{N_CATEGORIA}^^{UBIGEO_PROV}"),
            ("Sin campo vacio, ubigeo prov",             f"{acuerdo_real}^{N_CATALOGO}^{N_CATEGORIA}^{UBIGEO_PROV}"),
            ("Con codigo region 150000",                 f"{acuerdo_real}^{N_CATALOGO}^{N_CATEGORIA}^^{COD_REGION}"),
            ("Solo ID + ubigeo prov",                   f"{acuerdo_real}^^^{UBIGEO_PROV}"),
            ("Sin catalogo",                             f"{acuerdo_real}^^{N_CATEGORIA}^^{UBIGEO_PROV}"),
            ("Con 150101 (Lima Cercado, distrito)",      f"{acuerdo_real}^{N_CATALOGO}^{N_CATEGORIA}^^150101"),
        ]

        for label, body in test_cases:
            print(f"  [{label}]")
            print(f"    Body: {body!r}")
            res = await page.evaluate("""async (body) => {
                try {
                    const r = await fetch('/MejoraPlazo/consultaMejoraPlazoEntrega', {
                        method: 'POST',
                        headers: {'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'},
                        body: body,
                        signal: AbortSignal.timeout(15000)
                    });
                    return await r.text();
                } catch(e) { return 'ERROR: ' + e.message; }
            }""", body)

            if res:
                print(f"    Respuesta ({len(res)} chars): {res[:400]}")
            else:
                print(f"    Respuesta: VACIA")
            print()

        print("=== FIN DEL TEST ===")
        print("\nPresiona ENTER para cerrar el navegador...")
        input()
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
