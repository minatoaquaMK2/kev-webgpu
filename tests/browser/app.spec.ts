import {test,expect} from '@playwright/test';
test('no automatic model download, text-safe evidence, staged inputs',async({page})=>{
 const external:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4173')&&!r.url().startsWith('data:'))external.push(r.url())});
 await page.goto('/');await expect(page.locator('#evidence-list article')).toHaveCount(3);await expect(page.locator('#analyze')).toBeDisabled();
 await page.locator('#stages button').nth(2).click();await expect(page.locator('#evidence-list article')).toHaveCount(9);expect(external).toEqual([]);
 const json=await page.locator('#json-editor').inputValue();const b=JSON.parse(json);b.evidence[0].excerpt='<img src=x onerror="alert(1)">';await page.locator('summary').filter({hasText:'Edit evidence JSON'}).click();await page.locator('#json-editor').fill(JSON.stringify(b));await page.locator('#apply-json').click();await expect(page.locator('#evidence-list img')).toHaveCount(0);await expect(page.locator('#evidence-list')).toContainText('<img src=x');expect(external).toEqual([]);
});
test('narrow layout has no horizontal overflow',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('/');await expect(page.locator('#case')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);});
