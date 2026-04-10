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

        print("Setting dates natively...")
        fecha_inicio = "2025-01-01"
        fecha_fin = "2025-03-31"
        
        fi = page.locator("#fechaInicial")
        await fi.click()
        await fi.fill(fecha_inicio)
        await fi.press("Tab")
        print(f"Date set: {fecha_inicio}")

        ff = page.locator("#fechaFinal")
        await ff.click()
        await ff.fill(fecha_fin)
        await ff.press("Tab")
        print(f"Date set: {fecha_fin}")
        
        print("Check if chkDetallado is checked...")
        chk = page.locator("#chkDetallado")
        if not await chk.is_checked():
            await chk.click()
            print("Checked it natively.")
            await page.wait_for_timeout(2000)

        print("Clicking Search natively...")
        btn = page.locator("#btnBuscar")
        await btn.click()

        print("Waiting 3s for AJAX JS...")
        await page.wait_for_timeout(3000)

        print("Waiting for networkidle 90s...")
        await page.wait_for_load_state("networkidle", timeout=90000)

        print("Rows on screen:")
        rows = await page.locator("tr.FilaDatos").count()
        print(rows)

        if rows > 0:
            first_row = await page.locator("tr.FilaDatos").first.inner_text()
            print(f"First row sample: {first_row.strip()}")

        print("Saving screenshot to /debug_shot.png")
        await page.screenshot(path="debug_shot.png", full_page=True)

        print("Waiting 5s to settle...")
        await page.wait_for_timeout(5000)

        print("Clicking #aExportarXLSX...")
        async with page.expect_download(timeout=60000) as download_info:
            xlsx = page.locator("#aExportarXLSX")
            print("Exporting Button HTML:", await xlsx.first.evaluate("el => el.outerHTML"))
            await xlsx.evaluate("node => node.click()")
            
        download = await download_info.value
        dest = "test_export.xlsx"
        await download.save_as(dest)
        print("Downloaded!")

        print("Reading Excel...")
        df = pd.read_excel(dest, engine="openpyxl")
        print(f"Raw len(df): {len(df)}")
        print(f"Raw len(df) skipping skiprows: {len(pd.read_excel(dest, engine='openpyxl', skiprows=5))}")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
