import { test, expect, type Page } from "@playwright/test";
import { openShot, MOBILE_URL } from "./fits";
import { LEARN_STOPS, targetOf } from "../../src/containers/onboarding/tour/stops";
import { SHOT_THEMES } from "../../src/shots/scenarios";

/**
 * "Show me around" (card #50), measured.
 *
 * Every stop of the learning tour, walked with Next the way a player walks it,
 * at a wide window, a small one and a phone: the bubble is wholly inside the
 * window, it points at something (it is never left centred because its
 * target was missing), and the thing it points at is on screen and inside
 * the spotlight.
 */
const DESKTOP = [
  { width: 1400, height: 900 },
  { width: 1024, height: 700 },
];
const PHONE = { width: 390, height: 844 };

type Box = { x: number; y: number; width: number; height: number };

async function stopSettled(page: Page, index: number) {
  await expect(page.getByTestId("tour-overlay")).toHaveAttribute("data-index", String(index));
  await page.waitForSelector(".tour-ring", { timeout: 10_000 });
  // Still: the card and the ring measured twice, a beat apart, agree.
  const read = () =>
    page.evaluate(() =>
      [".tour-card", ".tour-ring"]
        .map((s) => {
          const r = document.querySelector(s)!.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height].map(Math.round).join(",");
        })
        .join("|"),
    );
  await expect
    .poll(
      async () => {
        const a = await read();
        await page.waitForTimeout(350);
        return a === (await read());
      },
      { timeout: 10_000 },
    )
    .toBe(true);
}

async function measureStop(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const box = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    const card = document.querySelector(".tour-card")!;
    const targets = [...document.querySelectorAll(sel)]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
      })
      .map(box);
    return {
      card: box(card),
      placement: card.getAttribute("data-placement"),
      ring: box(document.querySelector(".tour-ring")!),
      targets,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }, selector);
}

function inside(inner: Box, outer: Box, slack = 1) {
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

async function walk(page: Page, where: string) {
  for (let i = 0; i < LEARN_STOPS.length; i++) {
    const stop = LEARN_STOPS[i];
    const at = `${stop.id} (${i + 1} of ${LEARN_STOPS.length}) at ${where}`;
    await stopSettled(page, i);
    const m = await measureStop(page, targetOf(stop));
    const screen = { x: 0, y: 0, ...m.viewport };
    expect(inside(m.card, screen, 0.5), `${at}: the bubble leaves the window ${JSON.stringify(m.card)}`).toBe(true);
    expect(m.placement, `${at}: the bubble points at nothing`).not.toBe("center");
    expect(m.targets.length, `${at}: no visible target`).toBeGreaterThan(0);
    const onScreen = m.targets.filter((t) => overlaps(t, screen));
    expect(onScreen.length, `${at}: the target is off screen`).toBeGreaterThan(0);
    // The ring is the target's box grown by its padding, clipped to the window.
    for (const t of onScreen) {
      const clipped = {
        x: Math.max(0, t.x),
        y: Math.max(0, t.y),
        width: Math.min(screen.width, t.x + t.width) - Math.max(0, t.x),
        height: Math.min(screen.height, t.y + t.height) - Math.max(0, t.y),
      };
      expect(inside(clipped, m.ring, 1.5), `${at}: a target sits outside the spotlight`).toBe(true);
    }
    await page.locator(".tour-btn-primary").click();
  }
  await expect(page.getByTestId("tour-overlay")).toHaveCount(0);
}

test.describe("Show me around, every stop", () => {
  for (const size of DESKTOP) {
    test(`fits and points at ${size.width}x${size.height}`, async ({ page }) => {
      test.slow();
      await openShot(page, "tour-learn", size);
      await walk(page, `${size.width}x${size.height}`);
    });
  }
});

test.describe("Show me around, on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test(`fits and points at ${PHONE.width}x${PHONE.height}`, async ({ page }) => {
    test.slow();
    await openShot(page, "tour-learn", PHONE);
    await walk(page, `${PHONE.width}x${PHONE.height} (phone)`);
  });
});

/**
 * The result's big button on one line on a phone, in every theme (owner,
 * 2026-11-18: "Go again, up to 90 BPM" took two lines in Aurora at 390 px).
 */
test.describe("the result's big button on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  for (const width of [360, 390]) {
    test(`is one line in every theme at ${width}px`, async ({ page }) => {
      test.slow();
      const wrapped: string[] = [];
      for (const theme of SHOT_THEMES) {
        await openShot(page, "session-result", { width, height: 844 }, theme);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const lines = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="session-big"]')!;
          const range = document.createRange();
          range.selectNodeContents(el);
          return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
        });
        if (lines !== 1) wrapped.push(`${theme}: ${lines} lines`);
      }
      expect(wrapped).toEqual([]);
    });
  }
});
