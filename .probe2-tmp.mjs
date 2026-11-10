import { chromium } from "@playwright/test";
const [base, shot] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const t0 = Date.now();
page.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
await page.goto(`${base}/shots.html?shot=${shot}&theme=ember&window=main&lng=en`);
for (let i = 0; i < 40; i++) {
  const s = await page.evaluate(() => ({
    ids: [...document.querySelectorAll("[data-testid]")].map((e) => e.dataset.testid).filter((x) => /today|session|plan|step|path|edge/.test(x)).slice(0, 8).join(","),
    plan: document.querySelectorAll(".session-plan-item").length,
    ready: window.__SHOT_READY__, err: window.__SHOT_ERROR__, fonts: document.fonts.status,
  }));
  console.log(Date.now() - t0, JSON.stringify(s));
  if (s.ready || s.err) break;
  await page.waitForTimeout(1500);
}
await browser.close();
