import asyncio
import json
from playwright.async_api import async_playwright

async def main():
    results = {}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        
        try:
            print('Navigating to login...')
            await page.goto('https://www.kenya.com.pe/login')
            await page.wait_for_load_state('networkidle')
            
            print('Logging in...')
            # Identify the inputs
            inputs = await page.locator('input:visible').all()
            for inp in inputs:
                type_attr = await inp.get_attribute('type')
                name_attr = await inp.get_attribute('name')
                if type_attr in ('text', 'email') or name_attr in ('email', 'username'):
                    await inp.fill('kenya')
                elif type_attr == 'password':
                    await inp.fill('12345678')
            
            # Click login button
            await page.click('button[type="submit"], input[type="submit"], .btn')
            await page.wait_for_load_state('networkidle')
            await asyncio.sleep(4)
            
            results['url_after_login'] = page.url
            
            # Take a screenshot
            await page.screenshot(path='kenya_admin_dashboard.png', full_page=True)
            
            # Get all links in the sidebar
            sidebar_links = await page.evaluate('''() => {
                const links = Array.from(document.querySelectorAll('a'));
                return links.map(a => ({ text: a.innerText.trim(), href: a.href })).filter(l => l.text !== '');
            }''')
            
            results['sidebar_links'] = sidebar_links
                
            # Now let's try to find the Products page
            products_url = None
            for link in sidebar_links:
                if 'producto' in link['href'].lower() and 'modelo' not in link['href'].lower() and 'categoria' not in link['href'].lower():
                    products_url = link['href']
                    break
                    
            if not products_url:
                products_url = 'https://www.kenya.com.pe/producto'
                
            await page.goto(products_url)
            await page.wait_for_load_state('networkidle')
            await asyncio.sleep(2)
            await page.screenshot(path='kenya_products_list.png', full_page=True)
            
            # Find the first edit button
            edit_buttons = await page.locator('a:has-text("Editar"), a[title="Editar"], .fa-edit, a[href*="edit"]').all()
            if edit_buttons:
                # Need to click the parent a tag if it's an icon
                await edit_buttons[0].click(force=True)
                await page.wait_for_load_state('networkidle')
                await asyncio.sleep(3)
                results['edit_url'] = page.url
                await page.screenshot(path='kenya_product_edit.png', full_page=True)
                
                # Extract all labels and inputs
                fields = await page.evaluate('''() => {
                    const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                    return inputs.map(i => {
                        let label = '';
                        if (i.id) {
                            const lbl = document.querySelector(`label[for="${i.id}"]`);
                            if (lbl) label = lbl.innerText.trim();
                        }
                        if (!label && i.closest('div')) {
                            const lbl = i.closest('div').querySelector('label');
                            if (lbl) label = lbl.innerText.trim();
                        }
                        return {
                            name: i.name || i.id || 'unknown',
                            type: i.type || i.tagName.toLowerCase(),
                            label: label,
                            value: i.value
                        };
                    });
                }''')
                
                results['product_fields'] = fields
            else:
                results['error'] = 'No edit button found.'
            
        except Exception as e:
            results['error_trace'] = str(e)
        finally:
            await browser.close()
            
        with open('scratch/kenya_results.json', 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=4, ensure_ascii=False)

asyncio.run(main())
