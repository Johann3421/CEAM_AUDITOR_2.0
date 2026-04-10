import asyncio
import os
from datetime import datetime
import pandas as pd
from playwright.async_api import async_playwright

BASE_URL = "https://www.catalogos.perucompras.gob.pe/ConsultaOrdenesPub#"

async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--no-sandbox"])
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        print("Navigating...")
        await page.goto(BASE_URL, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(3000)

        print("Selecting Acuerdo Marco...")
        await page.locator("#select2-cboAcuerdo-container").click()
        await page.wait_for_timeout(1000)
        await page.locator("input.select2-search__field").fill("COMPUTADORAS DE ESCRITORIO")
        await page.wait_for_timeout(2000)

        results = page.locator(".select2-results__option")
        count = await results.count()
        selected = False
        for i in range(count):
            text = await results.nth(i).inner_text()
            if "no vigente" in text.lower() or "seleccione" in text.lower():
                continue
            await results.nth(i).click()
            print(f"Selected: {text}")
            selected = True
            break
        
        await page.wait_for_timeout(2000)

        print("Setting dates...")
        fecha_inicio = "01/01/2025"
        fecha_fin = "31/03/2025"
        
        # USE EVALUATE TO FORCE IT, IN CASE FILL FAILS
        await page.evaluate(f"document.getElementById('fechaInicial').value = '{fecha_inicio}'")
        await page.evaluate(f"document.getElementById('fechaFinal').value = '{fecha_fin}'")
        print(f"Dates set: {fecha_inicio} - {fecha_fin}")
        
        print("Checking Detallado...")
        chk = page.locator("#chkDetallado")
        if not await chk.is_checked():
            await chk.check()

        print("Clicking Search...")
        btn = page.locator("#btnBuscar")
        await btn.click(force=True)

        print("Waiting 10s for new table...")
        await page.wait_for_timeout(10000)

        # Print how many rows are in the table
        rows = await page.locator("tr.FilaDatos").count()
        print(f"Table row count: {rows}")
        
        if rows > 0:
            first_row = await page.locator("tr.FilaDatos").first.inner_text()
            print(f"First row sample: {first_row[:100]}")
        else:
            print("WARNING: TABLE IS EMPTY ON SCREEN!")

        print("Waiting networkidle...")
        try:
            await page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass

        print("Clicking Exportar XLSX...")
        async with page.expect_download(timeout=60000) as download_info:
            await page.locator("#aExportarXLSX").evaluate("node => node.click()")
        download = await download_info.value
        dest = "/tmp/test_export.xlsx"
        await download.save_as(dest)
        print("Downloaded!")

        print("Reading Excel...")
        df = pd.read_excel(dest, engine="openpyxl")
        print(f"Raw len(df): {len(df)}")
        print(f"Raw Columns: {list(df.columns)}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
