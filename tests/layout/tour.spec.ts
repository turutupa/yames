import { test, expect, type Page } from "@playwright/test";
import { openShot, MOBILE_URL, IN_ENGLISH } from "./fits";
import { LEARN_STOPS, TOOLS_STOPS, targetOf } from "../../src/containers/onboarding/tour/stops";
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
      rings: [...document.querySelectorAll(".tour-ring")].map(box),
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
    // The tour measures its target again on a 300 ms beat (and on scroll and
    // resize), so a page that moves under it (a list arriving, a card still
    // rising into place) is followed a beat later. A stop is judged once the
    // spotlight has caught up, not in the one frame after the page moved:
    // "the card and the ring agree with themselves" (stopSettled) says
    // nothing about the target, and on a busy machine the phone's Paths stop
    // was read in that frame about one run in two.
    let m!: Awaited<ReturnType<typeof measureStop>>;
    await expect(async () => {
      m = await measureStop(page, targetOf(stop));
      const screen = { x: 0, y: 0, ...m.viewport };
      expect(inside(m.card, screen, 0.5), `${at}: the bubble leaves the window ${JSON.stringify(m.card)}`).toBe(true);
      expect(m.placement, `${at}: the bubble points at nothing`).not.toBe("center");
      expect(m.targets.length, `${at}: no visible target`).toBeGreaterThan(0);
      const onScreen = m.targets.filter((t) => overlaps(t, screen));
      expect(onScreen.length, `${at}: the target is off screen`).toBeGreaterThan(0);
      // Each target sits in a ring: its box grown by the padding, clipped to the
      // window. A `separate` stop has one ring per group of targets.
      for (const t of onScreen) {
        const clipped = {
          x: Math.max(0, t.x),
          y: Math.max(0, t.y),
          width: Math.min(screen.width, t.x + t.width) - Math.max(0, t.x),
          height: Math.min(screen.height, t.y + t.height) - Math.max(0, t.y),
        };
        expect(
          m.rings.some((ring) => inside(clipped, ring, 1.5)),
          `${at}: a target sits outside the spotlight`,
        ).toBe(true);
      }
    }).toPass({ timeout: 8_000, intervals: [150, 350, 350, 700] });
    // The tour's Session is the calm ready screen: it asked for no input, so
    // nothing says one is missing, and the big button is the ordinary Start.
    if (stop.view === "session") {
      const calm = await page.evaluate(() => ({
        alarms: ['session-input-chip', 'session-input-failed', 'session-no-input', 'session-back']
          .filter((id) => document.querySelector(`[data-testid="${id}"]`)),
        big: document.querySelector('[data-testid="session-big"]')?.textContent ?? "",
      }));
      expect(calm.alarms, `${at}: an input alarm in the tour's Session`).toEqual([]);
      if (IN_ENGLISH) expect(calm.big, `${at}: the big button`).toMatch(/^Start take, \d+ BPM$/);
    }
    // The bubble never covers what it points at.
    for (const ring of m.rings) {
      expect(overlaps(m.card, { x: ring.x + 2, y: ring.y + 2, width: ring.width - 4, height: ring.height - 4 }), `${at}: the bubble covers a spotlight`).toBe(false);
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

/**
 * The tools tour's "coach" stop (review of leg c2a1): the old card it pointed
 * at is gone, and Ask's panel is closed when the stop shows, so it points at
 * the rail's Ask row. Walked with Next to it, then measured as above.
 */
test.describe("Tour the tools, the coach stop", () => {
  for (const size of DESKTOP) {
    test(`spotlights the rail's Ask row at ${size.width}x${size.height}`, async ({ page }) => {
      test.slow();
      await openShot(page, "tour-tools", size);
      const index = TOOLS_STOPS.findIndex((s) => s.id === "coach");
      for (let i = 0; i < index; i++) {
        await stopSettled(page, i);
        await page.locator(".tour-btn-primary").click();
      }
      await stopSettled(page, index);
      const at = `coach at ${size.width}x${size.height}`;
      await expect(async () => {
        const m = await measureStop(page, targetOf(TOOLS_STOPS[index]));
        const screen = { x: 0, y: 0, ...m.viewport };
        expect(m.placement, `${at}: the bubble points at nothing`).not.toBe("center");
        expect(m.targets.length, `${at}: one visible target`).toBe(1);
        const row = await page.evaluate(() => {
          const el = document.querySelector('[data-tour="coach"]');
          return !!el && el.classList.contains("rail-action") && !!el.closest(".rail");
        });
        expect(row, `${at}: the target is the rail's Ask row`).toBe(true);
        expect(inside(m.targets[0], screen, 0.5), `${at}: the row is off screen`).toBe(true);
        expect(m.rings.some((ring) => inside(m.targets[0], ring, 1.5)), `${at}: the row sits outside the spotlight`).toBe(true);
        expect(inside(m.card, screen, 0.5), `${at}: the bubble leaves the window`).toBe(true);
      }).toPass({ timeout: 8_000, intervals: [150, 350, 350, 700] });
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
 * The result on a phone, in every theme (owner, 2026-11-18): the big button on
 * one line ("Go again, up to 90 BPM" took two in Aurora at 390 px), the
 * number inside its column (Neon's "87%" ran off the screen), and Slower,
 * Faster and Move on sharing a row ("Move on" wrapped alone in Neon).
 */
test.describe("the result's big button on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  for (const width of [360, 390]) {
    test(`fits in every theme at ${width}px`, async ({ page }) => {
      test.slow();
      const wrapped: string[] = [];
      for (const theme of SHOT_THEMES) {
        await openShot(page, "session-result", { width, height: 844 }, theme);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(150);
        const m = await page.evaluate(() => {
          const el = document.querySelector('[data-testid="session-big"]')!;
          const range = document.createRange();
          range.selectNodeContents(el);
          const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
          // "78 → 87%": its words inside its own column, not off the screen.
          const moved = document.querySelector(".session-moved")!.getBoundingClientRect();
          const pair = document.createRange();
          pair.selectNodeContents(document.querySelector(".session-moved-pair")!);
          const numberRight = pair.getBoundingClientRect().right;
          // Slower, Faster and Move on: one row, none of them cut.
          const nudges = [...document.querySelectorAll<HTMLElement>(".session-between .session-nudges button")];
          const rows = new Set(nudges.map((b) => Math.round(b.getBoundingClientRect().top))).size;
          const cut = nudges.filter((b) => b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent);
          return { lines, numberOut: numberRight - moved.right, count: nudges.length, rows, cut };
        });
        if (m.lines !== 1) wrapped.push(`${theme}: the big button takes ${m.lines} lines`);
        if (m.numberOut > 1) wrapped.push(`${theme}: the number runs ${Math.round(m.numberOut)}px past its column`);
        if (m.count <= 3 && m.rows !== 1) wrapped.push(`${theme}: the ${m.count} nudges take ${m.rows} rows`);
        if (m.cut.length) wrapped.push(`${theme}: cut nudges ${m.cut.join(", ")}`);
      }
      expect(wrapped).toEqual([]);
    });
  }
});
