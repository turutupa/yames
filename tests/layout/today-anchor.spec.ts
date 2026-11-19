// Owner, 2026-11-19: the plan beside it must not move Today's hero up and down.
import { test, expect } from "@playwright/test";
import { openShot } from "./fits";
const sizes = [{width:1400,height:900},{width:1024,height:700},{width:1280,height:720}];
for (const size of sizes) test(`hero fixed ${size.width}`, async ({ page }) => {
  const ys: number[] = [];
  for (const m of ["5","10","15","20"]) {
    await openShot(page, "today-returning", size, "ember");
    await page.getByRole("button", { name: new RegExp(`^${m}$`) }).first().click().catch(()=>{});
    await page.waitForTimeout(500);
    const y = await page.locator(".session-today-hero .session-mega").first().evaluate(e => e.getBoundingClientRect().top);
    ys.push(Math.round(y));
    
  }
  
  expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
});
