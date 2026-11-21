import { test, expect, type Page } from "@playwright/test";
import { MOBILE_URL, noSidewaysScroll, openShot, settleAnimations } from "./fits";

/**
 * The loop step and the two Session rules (coach leg c1c; DESIGN 4.2; mocks
 * 03, 06, 07), measured in a real browser at 1440, 1024 x 700 and a phone:
 *
 * - "Loop the first bar" is a tonal button in the row with the tempo
 *   controls, never inside the note, and leads the row the second time at the
 *   same place;
 * - P2: the third time, the solid button is Move on, the note says why, and
 *   going again and the loop are still there;
 * - P1: a pass that still held the bar that slipped goes again at its tempo
 *   once, with "Up to N" one tap away;
 * - the loop's own screen keeps one solid button (Stop the loop) inside the
 *   window, and stopping it is the same Exercise's ready screen;
 * - every page keeps exactly one solid button and no sideways scroll.
 */

const WIDE = { width: 1440, height: 900 };
const SHORT = { width: 1024, height: 700 };
const PHONE = { width: 390, height: 844 };

/** The page's solid buttons that are on screen. */
async function solidButtons(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll<HTMLElement>(".session-big")].filter((b) => {
        const r = b.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(b).visibility !== "hidden";
      }).length,
  );
}

/** Inside the window, one solid button, the big one reachable on screen when `onScreen`. */
async function fits(page: Page, where: string, onScreen = true) {
  await settleAnimations(page);
  expect(await solidButtons(page), `${where}: one solid button`).toBe(1);
  await noSidewaysScroll(page, where);
  const vw = await page.evaluate(() => innerWidth);
  for (const id of ["session-loop", "session-up-to", "session-big"]) {
    const el = page.locator(`[data-testid="${id}"]`);
    if ((await el.count()) === 0) continue;
    const box = await el.first().boundingBox();
    if (!box) continue;
    expect(box.x, `${where}: ${id} starts inside the window`).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width, `${where}: ${id} ends inside the window`).toBeLessThanOrEqual(vw + 0.5);
  }
  if (onScreen) {
    const big = await page.locator('[data-testid="session-big"]').boundingBox();
    const vh = await page.evaluate(() => innerHeight);
    expect(big, `${where}: the big button`).not.toBeNull();
    expect(big!.y + big!.height, `${where}: the big button is on screen`).toBeLessThanOrEqual(vh + 0.5);
  }
}

/** The loop button sits before Slower in the tonal row (it leads it). */
async function loopLeads(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const loop = document.querySelector('[data-testid="session-loop"]');
    const slower = document.querySelector('[data-testid="session-slower"]');
    return !!loop && !!slower && !!(loop.compareDocumentPosition(slower) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
}

test("the second time at the same place, the loop leads the tonal row, outside the note", async ({ page }) => {
  test.slow();
  await openShot(page, "coach-loop-front", WIDE);
  const loop = page.locator('[data-testid="session-loop"]');
  await expect(loop).toBeVisible({ timeout: 30_000 });
  await expect(loop).toHaveAttribute("data-front", "");
  await expect(loop).toHaveText(/^Loop /);
  expect(await loopLeads(page)).toBe(true);
  await expect(page.locator('[data-testid="coach-note"] [data-testid="session-loop"]')).toHaveCount(0);
  // Not the third time: the big button still goes again.
  await expect(page.locator('[data-testid="session-big"]')).toHaveText(/again/i);
  await fits(page, "loop-front at 1440");
  await page.setViewportSize(SHORT);
  await fits(page, "loop-front at 1024x700");
});

test("P2: the third time at the same place, the solid button moves on and nothing else is lost", async ({ page }) => {
  test.slow();
  await openShot(page, "coach-leave-it", WIDE);
  const big = page.locator('[data-testid="session-big"]');
  await expect(page.locator('[data-testid="coach-history"]')).toContainText("Same place three times", { timeout: 30_000 });
  // On: "Move on" to a next block, or the end of the Session on the last one
  // (this five-minute Session's), never going again.
  await expect(big).not.toHaveText(/again/i);
  await expect(page.locator('[data-testid="session-again"]')).toBeVisible();
  await expect(page.locator('[data-testid="session-loop"]')).toBeVisible();
  await expect(page.locator('[data-testid="session-move-on"]')).toHaveCount(0);
  await fits(page, "leave-it at 1440");
  await page.setViewportSize(SHORT);
  await fits(page, "leave-it at 1024x700");
});

test("P1: a pass that held the bar that slipped goes again once, with Up to N one tap away", async ({ page }) => {
  test.slow();
  await openShot(page, "coach-once-more", WIDE);
  const big = page.locator('[data-testid="session-big"]');
  await expect(page.locator('[data-testid="session-result"]')).toBeVisible({ timeout: 30_000 });
  await expect(big).toHaveText(/again/i);
  await expect(big).not.toHaveText(/up to/i);
  const up = page.locator('[data-testid="session-up-to"]');
  await expect(up).toBeVisible();
  await expect(up).toHaveText(/^Up to \d+ BPM$/);
  // The way up is "Up to N" alone: no Faster beside it (pol1).
  await expect(page.locator('[data-testid="session-tonal"] [data-testid="session-faster"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="coach-history"]')).toContainText("Once more at");
  await fits(page, "once-more at 1440");
  await page.setViewportSize(SHORT);
  await fits(page, "once-more at 1024x700");
});

test("the loop's own screen: Stop the loop, the loop's tempo, nothing graded said", async ({ page }) => {
  test.slow();
  await openShot(page, "coach-loop", WIDE);
  const screen = page.locator('[data-testid="session-loop-screen"]');
  await expect(screen).toHaveAttribute("data-phase", "looping", { timeout: 30_000 });
  await expect(page.locator('[data-testid="session-big"]')).toHaveText("Stop the loop");
  await expect(page.locator('[data-testid="session-loop-how"]')).toContainText("Nothing here is graded or kept");
  await expect(page.locator('[data-testid="practice-tempo"]')).toBeVisible();
  await fits(page, "loop at 1440");
  await page.setViewportSize(SHORT);
  await fits(page, "loop at 1024x700");
});

test("after the loop: the same Exercise's ready screen, its Take's tempo untouched", async ({ page }) => {
  test.slow();
  await openShot(page, "coach-after-loop", WIDE);
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "ready", { timeout: 30_000 });
  await expect(page.locator('[data-testid="coach-note"]')).toBeVisible();
  await expect(page.locator('[data-testid="session-loop"]')).toBeVisible();
  await fits(page, "after-loop at 1440");
  await page.setViewportSize(SHORT);
  await fits(page, "after-loop at 1024x700");
});

test("loop_bars (leg lb1): \"loop bars 1-2\" on a ready screen is a proposal, and one press is the loop's screen", async ({ page }) => {
  test.slow();
  await openShot(page, "session-ready", WIDE);
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "ready", { timeout: 30_000 });
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  // The call the typed command makes (`router.ts`: "loop bars 1-2" -> loop_bars { from: 1, to: 2 }).
  await page.evaluate(async () => {
    const mod = await import("/src/containers/coach/askTools.ts");
    mod.runAskCall({ tool: "loop_bars", args: { from: 1, to: 2 } }, "loop bars 1-2");
  });
  const proposal = page.locator(".ask-panel [data-testid=ask-proposal]");
  await expect(proposal).toContainText(/Loop bars? 1/);
  // Nothing moved before the press.
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "ready");
  await proposal.locator("[data-testid=ask-proposal-go]").click();
  await expect(page.locator(".ask-panel [data-testid=ask-receipt]")).toContainText("Looping");
  await expect(page.locator('[data-testid="session-loop-screen"]')).toHaveAttribute("data-phase", "looping", { timeout: 15_000 });
  await expect(page.locator('[data-testid="session-big"]')).toHaveText("Stop the loop");
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, viewport: PHONE, isMobile: true, hasTouch: true });
  for (const scene of ["coach-loop-front", "coach-leave-it", "coach-once-more", "coach-loop", "coach-after-loop"]) {
    test(`${scene} on a phone`, async ({ page }) => {
      test.slow();
      await openShot(page, `phone-${scene}`, PHONE);
      await expect(page.locator('[data-testid="session-big"]')).toBeVisible({ timeout: 30_000 });
      // A phone's result scrolls; the big button there is in the flow, so only fitting sideways is asked.
      await fits(page, `${scene} on a phone`, false);
    });
  }
});

const SHOTS_DIR = process.env.COACH_SHOTS;
test.describe("pictures for the review", () => {
  test.skip(!SHOTS_DIR, "COACH_SHOTS is not set");
  for (const theme of ["ember", "neon", "manuscript"]) {
    for (const scene of ["coach-loop-front", "coach-leave-it", "coach-once-more", "coach-loop", "coach-after-loop"]) {
      test(`${scene} in ${theme}`, async ({ page }) => {
        test.slow();
        await openShot(page, scene, WIDE, theme);
        await settleAnimations(page);
        await page.screenshot({ path: `${SHOTS_DIR}/${scene}--${theme}--1440.png` });
        await page.setViewportSize(SHORT);
        await settleAnimations(page);
        await page.screenshot({ path: `${SHOTS_DIR}/${scene}--${theme}--1024x700.png` });
      });
    }
  }
});

test.describe("phone pictures for the review", () => {
  test.skip(!SHOTS_DIR, "COACH_SHOTS is not set");
  test.use({ baseURL: MOBILE_URL, viewport: PHONE, isMobile: true, hasTouch: true });
  for (const scene of ["coach-loop-front", "coach-leave-it", "coach-once-more", "coach-loop"]) {
    test(`${scene} on a phone in ember`, async ({ page }) => {
      test.slow();
      await openShot(page, `phone-${scene}`, PHONE, "ember");
      await settleAnimations(page);
      await page.screenshot({ path: `${SHOTS_DIR}/${scene}--ember--phone.png`, fullPage: true });
    });
  }
});
