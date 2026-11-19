#!/usr/bin/env node
// A picture of a detection replay page, for a card or a report:
//   node scripts/detect-replay-png.mjs take.replay.html [take.png] [--zoom 160] [--width 2400]
// The page is what `npm run detect:bench -- replay <wav>` writes. Uses the
// Playwright that the layout suite already depends on; no network.
import { chromium } from "playwright";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const zoom = Number(opt("--zoom", 160));
const width = Number(opt("--width", 2400));
const [html, png = html && html.replace(/\.html$/, ".png")] = args;
if (!html) {
  console.error("usage: node scripts/detect-replay-png.mjs take.replay.html [take.png] [--zoom px-per-second] [--width px]");
  process.exit(2);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 1100 } });
await page.goto("file://" + path.resolve(html));
await page.evaluate((z) => {
  const el = document.getElementById("zoom");
  el.value = String(z);
  el.dispatchEvent(new Event("input"));
}, zoom);
await page.screenshot({ path: png, fullPage: true });
await browser.close();
console.log(png);
