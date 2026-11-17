import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll, MOBILE_URL } from "./fits";
import { PHONE_LEARNING_SCENES } from "../../src/shots/scenarios";

/**
 * The learning side and the first run, on a phone (M7, the MVP).
 *
 * The owner's targets are Windows, macOS and Android, and every MVP feature
 * works on all three: so Today, a Session, its result, Paths, Progress and the
 * first run's input step are measured here in the PHONE build (the second
 * server in playwright.config.ts) at the two widths Android phones cluster
 * at — 360 (the narrowest still sold) and 412 (a Pixel). Three things each:
 *
 * 1. Nothing scrolls sideways.
 * 2. Every control a thumb can reach is at least 44×44 px (a range input is
 *    held to its height only: you drag along it). A control's hit box counts
 *    its absolutely-positioned `::before` when it has one, the way
 *    `.context-chip-icon` and the sidebar buttons grow theirs.
 * 3. The bottom tab bar sits above the gesture bar the phone reports
 *    (`--safe-bottom`, written in from Kotlin on Android), and nothing is
 *    drawn under it that cannot be scrolled out from under it.
 *
 * Only what is on top at its own centre is measured: a control under the
 * first-run overlay is not reachable and not this test's business.
 */
const WIDTHS = [
  { width: 360, height: 800 },
  { width: 412, height: 915 },
];

/** Every reachable control in view that is smaller than a thumb. */
async function smallTargets(page: Page): Promise<{ small: string[]; seen: number }> {
  return page.evaluate(() => {
    const out: string[] = [];
    let seen = 0;
    const sel =
      'button, a[href], [role="button"], select, input:not([type="hidden"]), [role="radio"], [role="tab"], [role="switch"]';
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || cs.visibility === "hidden" || cs.display === "none") continue;
      // In view, and on top at its centre: what a thumb can actually press.
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      if (cx < 0 || cy < 0 || cx > innerWidth || cy > innerHeight) continue;
      const top = document.elementFromPoint(cx, cy);
      if (!top || !(el === top || el.contains(top))) continue;
      if ((el as HTMLButtonElement).disabled) continue;
      seen++;

      let w = r.width;
      let h = r.height;
      const before = getComputedStyle(el, "::before");
      if (before.content !== "none" && before.position === "absolute") {
        const px = (v: string) => (v.endsWith("px") ? -Math.min(0, parseFloat(v)) : 0);
        w += px(before.left) + px(before.right);
        h += px(before.top) + px(before.bottom);
      }
      const isRange = el instanceof HTMLInputElement && el.type === "range";
      if (Math.round(h) < 44 || (!isRange && Math.round(w) < 44)) {
        const name = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30);
        out.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]} "${name}" ${Math.round(w)}×${Math.round(h)}`);
      }
    }
    return { small: out, seen };
  });
}

test.describe("the learning side on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const scene of PHONE_LEARNING_SCENES) {
    for (const size of WIDTHS) {
      test(`${scene} fits a thumb at ${size.width}px`, async ({ page }) => {
        // Find my edge plays its Takes in real time (see session.spec.ts).
        // Scenes that play a Take in real time with the neck or the runway
        // drawing (SwiftShader, a parallel suite): the budget session.spec.ts
        // gives its own.
        if (scene.startsWith("session-")) test.slow();
        await openShot(page, `phone-${scene}`, size);
        await noSidewaysScroll(page, `phone-${scene} at ${size.width}px`);
        const first = await smallTargets(page);
        // A sweep that finds nothing looks exactly like one that cannot find
        // anything: every one of these screens has a control to press (the
        // welcome card has two; the rest have the tab bar as well).
        expect(first.seen, "no controls measured at all").toBeGreaterThan(1);
        expect(first.small, "controls smaller than 44×44 px").toEqual([]);

        // And again at the bottom of the screen, where the last card meets
        // the tab bar.
        await page.evaluate(() => {
          const pane = document.querySelector(".main-content > .view-transition-wrapper");
          if (pane) pane.scrollTop = pane.scrollHeight;
        });
        await page.waitForTimeout(150);
        expect((await smallTargets(page)).small, "controls smaller than 44×44 px, scrolled down").toEqual([]);
      });
    }
  }

  test("the tab bar clears the gesture bar the phone reports", async ({ page }) => {
    await openShot(page, "phone-today-returning", { width: 360, height: 800 });
    const inset = 24;
    await page.evaluate((px) => {
      document.documentElement.style.setProperty("--safe-bottom", `${px}px`);
    }, inset);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const labels = await page.$$eval(".mobile-tabs .mobile-tab", (tabs) =>
      tabs.map((t) => t.getBoundingClientRect().bottom),
    );
    expect(labels.length, "no tab bar").toBeGreaterThan(3);
    for (const bottom of labels) {
      expect(Math.round(bottom), "a tab is drawn under the gesture bar").toBeLessThanOrEqual(800 - inset);
    }
  });

  // The runway Take on a phone (mvp-runway, "one picture at a time"): while
  // the Take runs, the runway is the picture — on screen, as wide as the
  // phone, and above the tab bar, at both widths.
  for (const size of WIDTHS) {
    test(`the runway Take fills the phone at ${size.width}px`, async ({ page }) => {
      await openShot(page, "phone-session-runway-playing", size);
      const runway = page.locator('[data-testid="runway"]');
      await expect(runway, "no runway during the Take").toBeVisible();
      const r = (await runway.boundingBox())!;
      const bar = (await page.locator(".mobile-tabs").boundingBox())!;
      expect(Math.round(r.x), "the runway starts off the left edge").toBeGreaterThanOrEqual(0);
      expect(Math.round(r.x + r.width), "the runway runs off the right edge").toBeLessThanOrEqual(size.width);
      expect(Math.round(r.width), "the runway is a strip, not the picture").toBeGreaterThan(size.width * 0.8);
      expect(Math.round(r.height), "the runway has no height to fall down").toBeGreaterThan(200);
      expect(Math.round(r.y), "the runway starts under the tab bar").toBeLessThan(Math.round(bar.y));
    });
  }

  test("a Session's big button scrolls clear of the tab bar", async ({ page }) => {
    await openShot(page, "phone-session-ready", { width: 360, height: 800 });
    const big = page.locator('[data-testid="session-big"]');
    await big.scrollIntoViewIfNeeded();
    const b = (await big.boundingBox())!;
    const bar = (await page.locator(".mobile-tabs").boundingBox())!;
    expect(Math.round(b.y + b.height), "the big button is under the tab bar").toBeLessThanOrEqual(
      Math.round(bar.y),
    );
  });
});
