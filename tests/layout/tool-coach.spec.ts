import { test, expect, type Page } from "@playwright/test";
import {
  openShot,
  openTool,
  fitsOnOneLine,
  insideViewport,
  noSidewaysScroll,
  notHitTestable,
  settleAnimations,
  MOBILE_URL,
  IN_ENGLISH,
} from "./fits";

/**
 * The tools' coach (leg c2a2, DESIGN 7): Listen on the transport, the line and
 * the note under the stage, and Progress → Tool runs. Desktop only; a phone
 * has none of it.
 *
 * The line's action button and the note are driven through the real coach,
 * not poked into the page: Playwright's clock runs the session forward while
 * the harness's mock answers as the analyzer would (`?coachFeed=lowConf`,
 * `?coachReport=1`, `?toolRuns=N`, see `src/shots/toolCoachFixtures.ts`).
 *
 * Pictures go to `$YAMES_TOOL_SHOTS/<theme>-<scene>.png` when it is set.
 */

const SHOTS = process.env.YAMES_TOOL_SHOTS;
const THEMES = ["ember", "neon", "manuscript"] as const;
const LISTEN = '[data-testid="transport-listen"]';
const COACH = '[data-testid="tool-coach"]';

type Size = { width: number; height: number };
const SIZES: Size[] = [
  { width: 1440, height: 900 },
  { width: 1024, height: 700 },
  { width: 800, height: 900 },
  { width: 620, height: 780 },
];
const MID: Size = { width: 1024, height: 700 };

type R = { left: number; right: number; top: number; bottom: number };
async function rect(page: Page, sel: string): Promise<R> {
  const r = await page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const b = e.getBoundingClientRect();
    return { left: b.left, right: b.right, top: b.top, bottom: b.bottom };
  }, sel);
  expect(r, `nothing matched ${sel}`).not.toBeNull();
  return r!;
}

async function shot(page: Page, name: string) {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
}

/** Listen, off: on the bar, inside the window, pressable, and the bar on one line. */
async function listenOffHolds(page: Page, size: Size, where: string) {
  const listen = page.locator(LISTEN);
  await expect(listen, where).toBeVisible();
  await expect(listen, where).toHaveAttribute("role", "switch");
  await expect(listen, where).toHaveAttribute("aria-checked", "false");
  if (IN_ENGLISH) {
    await expect(listen, where).toContainText("Listen");
    await expect(listen, where).not.toContainText("Listening");
  }
  // The track is the switch's state; it is never shed with the word.
  await expect(listen.locator(".transport-switch-track"), `${where}: Listen's track`).toBeVisible();
  await insideViewport(page, LISTEN, where, size);
  expect(await notHitTestable(page, LISTEN), where).toEqual([]);
  await fitsOnOneLine(page, ".transport", where);
  await noSidewaysScroll(page, where);
  expect(await page.locator(COACH).count(), `${where}: the tools' coach with Listen off`).toBe(0);
}

/** Listen, on: the coach's row under the stage, and nothing pushed out of the window. */
async function listenOnHolds(page: Page, size: Size, where: string) {
  const listen = page.locator(LISTEN);
  await listen.click();
  await expect(listen, where).toHaveAttribute("aria-checked", "true");
  // The mock's input opens at once: the switch says it is listening.
  if (IN_ENGLISH) await expect(listen, where).toContainText("Listening");
  await expect(page.locator(COACH), where).toBeVisible();
  await expect(page.locator(".tool-coach-row"), where).toBeVisible();
  await expect(page.locator(".system-status-chip"), where).toBeVisible();
  await settleAnimations(page);
  for (const sel of [".transport", COACH, LISTEN, ".transport-play"]) {
    await insideViewport(page, sel, `${where}: ${sel}`, size);
  }
  const coach = await rect(page, COACH);
  const bar = await rect(page, ".transport");
  expect(coach.bottom, `${where}: the coach's row above the transport`).toBeLessThanOrEqual(bar.top + 1);
  await fitsOnOneLine(page, ".tool-coach-row", where);
  await fitsOnOneLine(page, ".transport", where);
  await noSidewaysScroll(page, where);
  expect(await notHitTestable(page, `${LISTEN}, .transport-play`), where).toEqual([]);
}

/** Run the page's clock forward in steps, letting React render between them, until `done`. */
async function runUntil(page: Page, done: () => Promise<boolean>, maxMs: number, stepMs = 2000) {
  for (let ran = 0; ran < maxMs; ran += stepMs) {
    if (await done()) return;
    await page.clock.runFor(stepMs);
    await page.waitForTimeout(40);
  }
  expect(await done(), `nothing after ${maxMs / 1000} s of the page's clock`).toBe(true);
}

/** Pause the page's clock where it is now (it has been running at wall speed since `install`). */
async function pauseClock(page: Page) {
  const now = await page.evaluate(() => Date.now());
  // Far enough ahead that the page's clock, still running, has not passed it
  // by the time the call lands on a busy machine.
  await page.clock.pauseAt(now + 1000);
}

for (const theme of THEMES) {
  test.describe(`the tools' coach, ${theme}`, () => {
    for (const size of SIZES) {
      test(`listen-off: the Metronome at ${size.width}x${size.height}`, async ({ page }) => {
        await openShot(page, "metronome", size, theme);
        await listenOffHolds(page, size, `Metronome ${size.width}`);
        await shot(page, `${theme}-listen-off-metronome-${size.width}`);
      });

      test(`listen-on: the Metronome at ${size.width}x${size.height}`, async ({ page }) => {
        await openShot(page, "metronome", size, theme);
        await listenOnHolds(page, size, `Metronome ${size.width}`);
        await shot(page, `${theme}-listen-on-metronome-${size.width}`);
        // And off again: the switch and the row go back.
        await page.locator(LISTEN).click();
        await expect(page.locator(LISTEN)).toHaveAttribute("aria-checked", "false");
      });
    }

    for (const [scene, what] of [
      ["drill", "the Drill"],
      ["setlist-jam", "a loaded Setlist"],
      ["jam", "a Jam"],
    ] as const) {
      test(`listen-off and listen-on: ${what} at 1024x700`, async ({ page }) => {
        await openShot(page, scene, MID, theme);
        await expect(page.locator(".transport")).toBeVisible();
        await listenOffHolds(page, MID, `${what} 1024`);
        await shot(page, `${theme}-listen-off-${scene}-1024`);
        await listenOnHolds(page, MID, `${what} 1024`);
        await shot(page, `${theme}-listen-on-${scene}-1024`);
      });
    }

    for (const size of theme === "ember" ? [MID, SIZES[0]] : [MID]) {
      test(`tool-line-button: the calibration tip and its button at ${size.width}`, async ({ page }) => {
        test.slow();
        /*
         * The real path: the gatekeeper's low-confidence caveat. Mean
         * calibration confidence under 0.5 for 30 s, after the 20 s warm-up,
         * with at least 8 scored beats in the window; the intervention layer
         * then hangs "Recalibrate" on it. About a minute of the page's clock.
         */
        await page.clock.install();
        await openShot(page, "metronome", size, theme, { coachFeed: "lowConf" });
        await page.locator(LISTEN).click();
        await expect(page.locator(LISTEN)).toHaveAttribute("aria-checked", "true");
        if (IN_ENGLISH) await expect(page.locator(LISTEN)).toContainText("Listening");
        await page.locator(".transport-play").click();
        await expect(page.locator(".transport-play.playing")).toBeVisible();
        await pauseClock(page);
        const act = page.locator('[data-testid="tool-coach-act"]');
        await runUntil(page, async () => (await act.count()) > 0, 120_000);
        await page.clock.resume();
        await expect(act).toBeVisible();
        if (IN_ENGLISH) await expect(act).toHaveText(/recalibrate/i);
        await settleAnimations(page);

        const line = await rect(page, '[data-testid="tool-coach-line"]');
        const text = await rect(page, '[data-testid="tool-coach-line"] .coach-line');
        const button = await rect(page, '[data-testid="tool-coach-act"]');
        const where = `tip ${size.width}`;
        expect(button.right, `${where}: the button inside its line`).toBeLessThanOrEqual(line.right + 1);
        expect(button.left, `${where}: the button inside its line`).toBeGreaterThanOrEqual(line.left - 1);
        expect(
          button.left >= text.right - 1 || button.top >= text.bottom - 1,
          `${where}: the button at the end of the line (after the text)`,
        ).toBe(true);
        await insideViewport(page, `${COACH}, .transport, [data-testid="tool-coach-act"]`, where, size);
        const coach = await rect(page, COACH);
        const bar = await rect(page, ".transport");
        expect(coach.bottom, `${where}: the coach above the transport`).toBeLessThanOrEqual(bar.top + 1);
        expect(await notHitTestable(page, `[data-testid="tool-coach-act"], ${LISTEN}, .transport-play`), where).toEqual([]);
        await noSidewaysScroll(page, where);
        await shot(page, `${theme}-tool-line-button-${size.width}`);

        // One press, and the button has done its work.
        await act.click();
        await expect(act).toHaveCount(0);
      });
    }

    test("tool-note: a run of more than 10 s stops; the note, its score and its chips; then Listen off", async ({ page }) => {
      test.slow();
      await page.clock.install();
      await openShot(page, "metronome", MID, theme, { coachReport: "1" });
      await page.locator(LISTEN).click();
      await expect(page.locator(LISTEN)).toHaveAttribute("aria-checked", "true");
      await page.locator(".transport-play").click();
      await expect(page.locator(".transport-play.playing")).toBeVisible();
      await pauseClock(page);
      // Twelve seconds of playing: past the 10 s a run needs for a note.
      for (let i = 0; i < 12; i++) {
        await page.clock.runFor(1000);
        await page.waitForTimeout(40);
      }
      await page.locator(".transport-play").click();
      await expect(page.locator(".transport-play.playing")).toHaveCount(0);
      await page.clock.resume();

      const note = page.locator('[data-testid="tool-coach-note"]');
      await expect(note).toBeVisible({ timeout: 15_000 });
      await expect(note.locator('[data-testid="tool-coach-score"]')).toBeVisible();
      if (IN_ENGLISH) await expect(note).toContainText("Even spacing through most of that run");
      const chips = note.locator('[data-testid^="tool-coach-chip-"]');
      expect(await chips.count(), "the note's question chips").toBeGreaterThan(0);
      await settleAnimations(page);
      await insideViewport(page, `${COACH}, .transport`, "note 1024", MID);
      const coach = await rect(page, COACH);
      const bar = await rect(page, ".transport");
      expect(coach.bottom, "the note above the transport").toBeLessThanOrEqual(bar.top + 1);
      expect(await notHitTestable(page, `[data-testid^="tool-coach-chip-"], ${LISTEN}, .transport-play`)).toEqual([]);
      await noSidewaysScroll(page, "note 1024");
      await shot(page, `${theme}-tool-note`);

      // Listen off: the session's summary, with the way to Progress.
      await page.locator(LISTEN).click();
      await expect(page.locator(LISTEN)).toHaveAttribute("aria-checked", "false");
      const runs = page.locator('[data-testid="tool-coach-runs"]');
      await expect(runs).toBeVisible({ timeout: 15_000 });
      await settleAnimations(page);
      await insideViewport(page, `${COACH}, .transport`, "summary 1024", MID);
      expect(await notHitTestable(page, '[data-testid="tool-coach-runs"]')).toEqual([]);
      await shot(page, `${theme}-tool-note-end`);
      await runs.click();
      await expect(page.locator('[data-testid="tool-runs"]')).toBeVisible();
    });

    for (const size of [SIZES[0], MID]) {
      test(`progress-tool-runs at ${size.width}x${size.height}: the list, then a run's detail`, async ({ page }) => {
        await openShot(page, "progress", size, theme, { toolRuns: "4" });
        const section = page.locator('[data-testid="tool-runs"]');
        await section.scrollIntoViewIfNeeded();
        await expect(section).toBeVisible();
        const rows = page.locator('[data-testid="tool-run"]');
        await expect(rows).toHaveCount(4);
        await settleAnimations(page);
        const where = `Tool runs ${size.width}`;
        const page_ = await rect(page, ".session-page");
        const box = await rect(page, '[data-testid="tool-runs"]');
        expect(box.left, `${where}: inside the page`).toBeGreaterThanOrEqual(page_.left - 1);
        expect(box.right, `${where}: inside the page`).toBeLessThanOrEqual(page_.right + 1);
        expect(box.right, `${where}: inside the window`).toBeLessThanOrEqual(size.width + 1);
        // Inset from the card's border, as the Path cards above it are.
        const title = await rect(page, "#tool-runs-title");
        const clear = await rect(page, '[data-testid="tool-runs-clear"]');
        expect(title.left - box.left, `${where}: the title on the card's border`).toBeGreaterThanOrEqual(8);
        expect(box.right - clear.right, `${where}: Clear all on the card's border`).toBeGreaterThanOrEqual(8);
        for (const r of await rows.all()) {
          const b = (await r.boundingBox())!;
          expect(b.x, `${where}: a row inside the section`).toBeGreaterThanOrEqual(box.left - 1);
          expect(b.x + b.width, `${where}: a row inside the section`).toBeLessThanOrEqual(box.right + 1);
        }
        expect(await cutText(page, '[data-testid="tool-runs"]'), `${where}: text cut`).toEqual([]);
        await noSidewaysScroll(page, where);
        await rows.first().scrollIntoViewIfNeeded();
        await shot(page, `${theme}-progress-tool-runs-${size.width}`);

        await rows.first().click();
        const detail = page.locator('[data-testid="tool-run-detail"]');
        await expect(detail).toBeVisible();
        await detail.scrollIntoViewIfNeeded();
        await settleAnimations(page);
        const d = await rect(page, '[data-testid="tool-run-detail"]');
        expect(d.left, `${where}: the detail inside the section`).toBeGreaterThanOrEqual(box.left - 1);
        expect(d.right, `${where}: the detail inside the section`).toBeLessThanOrEqual(box.right + 1);
        expect(await cutText(page, '[data-testid="tool-run-detail"]'), `${where}: detail text cut`).toEqual([]);
        await noSidewaysScroll(page, `${where} detail`);
        await shot(page, `${theme}-progress-tool-runs-detail-${size.width}`);
        await page.locator('[data-testid="tool-runs-back"]').click();
        await expect(rows).toHaveCount(4);
      });
    }
  });
}

/** Text inside `root` that is cut by its own box (an ellipsis or a hidden overflow), or spills past it. */
async function cutText(page: Page, root: string): Promise<string[]> {
  return page.evaluate((sel) => {
    const out: string[] = [];
    const scope = document.querySelector(sel);
    if (!scope) return [`no ${sel}`];
    for (const el of scope.querySelectorAll<HTMLElement>("*")) {
      if (el.closest("svg")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? "").trim());
      if (!hasText) continue;
      const cs = getComputedStyle(el);
      if (el.scrollWidth > el.clientWidth + 1 && (cs.overflowX !== "visible" || cs.textOverflow === "ellipsis")) {
        out.push(`${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ")[0]} "${(el.textContent ?? "").trim().slice(0, 30)}" (${el.scrollWidth} in ${el.clientWidth})`);
      }
    }
    return out;
  }, root);
}

test.describe("the tools' coach on a phone: none of it", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  test("no Listen, no coach under the stage, no Tool runs", async ({ page }) => {
    const size = { width: 390, height: 844 };
    await openShot(page, "metronome", size);
    for (const tool of ["beat", "drill"] as const) {
      await openTool(page, tool);
      await expect(page.locator(".transport")).toBeVisible();
      expect(await page.locator(LISTEN).count(), `${tool}: Listen on a phone`).toBe(0);
      expect(await page.locator(COACH).count(), `${tool}: the tools' coach on a phone`).toBe(0);
    }
    await shot(page, "ember-phone-tools");
    await page.click('.mobile-tab[data-tab="progress"]');
    await page.waitForTimeout(600);
    expect(await page.locator('[data-testid="tool-runs"]').count(), "Tool runs on a phone").toBe(0);
    await shot(page, "ember-phone-progress");
  });
});
