import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll, insideViewport, notHitTestable, overlapping, spillingLabels, fitsOnOneLine } from "./fits";

/**
 * The learning side, measured: Today, a Session, Paths and Progress.
 *
 * Every scene here is reached by pressing what a player presses (`shots/main.tsx`
 * walks Today, the big button, the verdict and on to the recap), so a scene that
 * reaches `__SHOT_READY__` at all has proved the screens before it still lead to
 * it. On top of that, each must fit: no sideways scroll, and the one big action
 * a player looks for inside the window, at the widest and the narrowest sizes the
 * rest of the app is held to.
 */
const SCENES = [
  "today-first",
  // Guitar first: a drummer's Today carries the note at the top of the hero.
  "today-drums",
  "today-returning",
  "today-back",
  "session-ready",
  "session-playing",
  "session-between",
  "session-result",
  "session-no-catch",
  "session-warmup-ready",
  "session-warmup",
  "session-edge",
  "session-edge-result",
  "session-recap",
  // The input at a Take's ready screen, and a Session played without grading
  // (owner, 2026-11-18).
  "session-input-off",
  "session-input-failed",
  "session-ungraded-ready",
  "session-ungraded-result",
  "session-ungraded-recap",
  "paths",
  "path-alternate",
  "step-detail",
  "progress",
  "progress-empty",
  "tools",
];

const SIZES = [
  { name: "wide", width: 1400, height: 900 },
  { name: "narrow", width: 620, height: 780 },
];

/** The scenes with one big next action, and the control that is it. */
const BIG: Record<string, string> = {
  "today-first": '[data-testid="today-start"]',
  "today-drums": '[data-testid="today-start"]',
  "today-returning": '[data-testid="today-start"]',
  "today-back": '[data-testid="today-start"]',
  "session-ready": '[data-testid="session-big"]',
  "session-warmup-ready": '[data-testid="session-big"]',
  // Running, the big button is Pause (UX audit SES-1); Next is a link.
  "session-warmup": '[data-testid="session-pause"]',
  "session-result": '[data-testid="session-big"]',
  "session-no-catch": '[data-testid="session-big"]',
  "session-edge-result": '[data-testid="session-big"]',
  "session-recap": '[data-testid="session-big"]',
  "session-input-off": '[data-testid="session-big"]',
  "session-input-failed": '[data-testid="session-big"]',
  "session-ungraded-ready": '[data-testid="session-big"]',
  "session-ungraded-result": '[data-testid="session-big"]',
  "session-ungraded-recap": '[data-testid="session-big"]',
};

for (const scene of SCENES) {
  for (const size of SIZES) {
    test(`${scene} fits at ${size.name} (${size.width}px)`, async ({ page }) => {
      // Find my edge plays up to four Takes in real time with the neck stage
      // drawing them; under SwiftShader and a parallel suite that passes 30 s.
      if (scene === "session-edge-result") test.slow();
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
      const big = BIG[scene];
      if (big) {
        await expect(page.locator(big)).toBeVisible();
        await insideViewport(page, big, `${scene} at ${size.width}px`, size);
      }
    });
  }
}

/*
 * The QA sweep of 2026-11-17, measured. A short window (1024x700) and the
 * narrowest desktop one (620x780): the sizes where the learning side's blocks
 * were drawn over each other.
 */
const QA_SIZES = [
  { name: "1024x700", width: 1024, height: 700 },
  { name: "620x780", width: 620, height: 780 },
];

for (const size of QA_SIZES) {
  // #2: the "TAKE n · …" heading was drawn over Exit.
  for (const scene of ["session-between", "session-edge-result"]) {
    test(`${scene}: Exit takes a tap, and nothing overlaps, at ${size.name}`, async ({ page }) => {
      // Both play a Take (edge-result up to four) in real time first.
      test.slow();
      await openShot(page, scene, size);
      expect(await notHitTestable(page, '[data-testid="session-exit"]')).toEqual([]);
      expect(await overlapping(page)).toEqual([]);
    });
  }

  // #5: the exercise cards covered the neck, the heading and the chart.
  for (const scene of ["progress", "progress-empty"]) {
    test(`${scene}: nothing overlaps at ${size.name}`, async ({ page }) => {
      await openShot(page, scene, size);
      await noSidewaysScroll(page, `${scene} at ${size.name}`);
      expect(await overlapping(page)).toEqual([]);
    });
  }

  // #20: the switch is locked while the Take runs, and says so.
  test(`session-playing: the view switch is locked and looks it at ${size.name}`, async ({ page }) => {
    await openShot(page, "session-playing", size);
    const sw = page.locator('[data-testid="practice-view"]');
    await expect(sw).toHaveAttribute("data-locked", "");
    await expect(sw.locator(".session-viewswitch-lock")).toBeVisible();
    expect(await overlapping(page)).toEqual([]);
  });
}

// #25: under 900 px the learning side's rail is a strip of icons.
test("the learning side's rail is the icon strip at 620px", async ({ page }) => {
  await openShot(page, "progress", { width: 620, height: 780 });
  const rail = (await page.locator(".rail").boundingBox())!;
  expect(Math.round(rail.width), "the rail keeps its labels at 620px").toBeLessThanOrEqual(72);
  await expect(page.locator(".rail-mode-label").first()).toBeHidden();
});

// #19: the runway's ready screen is the neck, and says the runway comes with the Take.
test("session-runway-ready: the neck alone, and a line for the runway", async ({ page }) => {
  await openShot(page, "session-runway-ready", { width: 1024, height: 700 });
  await expect(page.locator('[data-testid="runway"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="runway-later"]')).toBeVisible();
  expect(await overlapping(page)).toEqual([]);
});

/*
 * #11: long translations fit. The big button wraps rather than cutting
 * "Закончить дубль" short, a tag stays inside its card, and the rail's labels
 * take two lines rather than an ellipsis. Built in each language through the
 * harness's own `?lng=`; the scenes are the ones it reaches without the
 * rail (src/shots/main.tsx finds the rail's doors by their English names).
 */
const LONG_LOCALES = ["ru", "de", "pt-BR", "ja"];
const LOCALE_SCENES: { scene: string; size: { width: number; height: number } }[] = [
  { scene: "today-returning", size: { width: 1024, height: 700 } },
  { scene: "today-returning", size: { width: 620, height: 780 } },
  { scene: "session-playing", size: { width: 620, height: 780 } },
  { scene: "session-between", size: { width: 1024, height: 700 } },
];
for (const lng of LONG_LOCALES) {
  for (const { scene, size } of LOCALE_SCENES) {
    test(`${scene} in ${lng}: every label fits, nothing overlaps, at ${size.width}x${size.height}`, async ({ page }) => {
      // A result scene plays its Take in real time first.
      if (scene !== "today-returning") test.slow();
      await openShot(page, scene, size, "ember", { lng });
      await noSidewaysScroll(page, `${scene} in ${lng} at ${size.width}px`);
      expect(await spillingLabels(page)).toEqual([]);
      expect(await overlapping(page)).toEqual([]);
    });
  }
}

test("a drummer's Today says the Paths are for guitar, and still starts", async ({ page }) => {
  await openShot(page, "today-drums", { width: 1400, height: 900 });
  const note = page.locator('[data-testid="instrument-note"]');
  await expect(note).toBeVisible();
  const [n, start] = [await note.boundingBox(), await page.locator('[data-testid="today-start"]').boundingBox()];
  expect(n!.y, "the note sits above the Start button").toBeLessThan(start!.y);
  await expect(page.locator('[data-testid="today-start"]')).toBeEnabled();
});

/*
 * Acceptance pass 3 P2-7: "Was this grade fair?" only where the verdict could
 * have gone the other way. Not on a clear pass (87% against 85, every bar
 * held), not on a Take in the middle of a Find my edge climb, and once, about
 * the climb, when the edge is found.
 */
test.describe("the fairness question", () => {
  test("is not asked on a clear pass", async ({ page }) => {
    await openShot(page, "session-result", { width: 1400, height: 900 });
    await expect(page.locator('[data-testid="session-result"]')).toBeVisible();
    await expect(page.locator('[data-testid="session-fair"]')).toHaveCount(0);
  });

  test("is not asked on a Take of a Find my edge climb", async ({ page }) => {
    test.slow();
    await openShot(page, "session-edge", { width: 1400, height: 900 });
    await expect(page.locator('[data-testid="session-edge"]')).toBeVisible();
    await expect(page.locator('[data-testid="session-fair"]')).toHaveCount(0);
  });

  test("is asked once, about the climb, when the edge is found", async ({ page }) => {
    test.slow();
    await openShot(page, "session-edge-result", { width: 1400, height: 900 });
    await expect(page.locator('[data-testid="session-edge"][data-done]')).toBeVisible();
    await expect(page.locator('[data-testid="session-fair"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="session-fair"]')).toContainText("climb");
  });
});

/*
 * The Session bar (owner, 2026-11-18): every block a button, Previous beside
 * Skip, the input's state, and the clock, on one line at 1400 and 1024; a
 * block takes a click and opens its ready screen, and Previous comes back.
 */
test.describe("the Session bar", () => {
  for (const size of [
    { name: "1400", width: 1400, height: 900 },
    { name: "1024", width: 1024, height: 700 },
  ]) {
    test(`fits on one line, and every block takes a click, at ${size.name}`, async ({ page }) => {
      // Opening a Session is the slowest scene the harness builds, and this one
      // is built at 1440 and then narrowed: room for both on a loaded machine.
      test.slow();
      await openShot(page, "session-warmup-ready", size);
      // The screen rises in, and at 1024 it has just been narrowed: the bar is
      // measured once it has come to rest, and fails with its last reading if
      // it never does.
      await expect(async () => {
        await noSidewaysScroll(page, `session-warmup-ready at ${size.width}px`);
        await fitsOnOneLine(page, '[data-testid="session-bar"]', `the Session bar at ${size.width}px`);
        expect(await notHitTestable(page, ".session-pip")).toEqual([]);
        expect(await notHitTestable(page, '[data-testid="session-previous"]')).toEqual([]);
        expect(await notHitTestable(page, '[data-testid="session-input-chip"]')).toEqual([]);
        // Taller than the 5 px it draws: a pointer finds it.
        for (const box of await page.locator(".session-pip").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) {
          expect(box).toBeGreaterThanOrEqual(20);
        }
      }).toPass({ timeout: 15_000 });
      // On the first block, Previous says why it does nothing.
      await expect(page.locator('[data-testid="session-previous"]')).toHaveAttribute("aria-disabled", "true");
    });
  }

  test("a block opens its ready screen, and Previous comes back, by mouse and by key", async ({ page }) => {
    await openShot(page, "session-warmup-ready", { width: 1400, height: 900 });
    await page.locator('[data-testid="session-pip-1"]').click();
    await expect(page.locator('[data-testid="session-take"]')).toBeVisible();
    await expect(page.locator('[data-testid="session-pip-1"]')).toHaveAttribute("aria-current", "step");
    // The warm-up was left before it was played: skipped, not done.
    await expect(page.locator('[data-testid="session-pip-0"]')).toHaveAttribute("data-state", "skipped");
    await page.locator('[data-testid="session-previous"]').click();
    await expect(page.locator('[data-testid="session-pip-0"]')).toHaveAttribute("aria-current", "step");
    // Keyboard: a block is focusable and Enter opens it. A key first, so the
    // focus that follows is the keyboard's, not the click's just before
    // (`trackFocusModality`: a clicked control leaves Enter to the Session).
    await page.keyboard.press("Tab");
    await page.locator('[data-testid="session-pip-1"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator('[data-testid="session-pip-1"]')).toHaveAttribute("aria-current", "step");
  });
});

/*
 * The neck before a Take (the owner, 2026-11-18): finger numbers on the dots,
 * a "start here" pill off the strings, and Watch, which lights the order on
 * the neck and never starts anything. A sweep, a one-string drill and a box
 * lick, wide and narrow.
 */
const NECK_SCENES = ["session-neck-sweep", "session-neck-fingers", "session-neck-box"];
for (const scene of NECK_SCENES) {
  for (const size of [
    { width: 1400, height: 900 },
    { width: 620, height: 780 },
  ]) {
    test(`${scene}: the start pill finds room, Watch fits, at ${size.width}px`, async ({ page }) => {
      await openShot(page, scene, size);
      const pill = page.locator('[data-testid="practice-now-tag"]');
      await expect(pill).toHaveText(/\S/);
      await expect(pill).toHaveAttribute("data-start", "");
      // Clear of every dot of the pattern, between two strings (`placeStart`).
      await expect(pill).toHaveAttribute("data-clear", "");
      const neck = (await page.locator('[data-testid="practice-neck"]').boundingBox())!;
      const p = (await pill.boundingBox())!;
      expect(p.x).toBeGreaterThanOrEqual(neck.x);
      expect(p.x + p.width).toBeLessThanOrEqual(neck.x + neck.width + 0.5);
      await expect(page.locator('[data-testid="practice-watch"]')).toBeVisible();
      await insideViewport(page, '[data-testid="practice-watch"]', `${scene} at ${size.width}px`, size);
      expect(await notHitTestable(page, '[data-testid="practice-watch"]')).toEqual([]);
      // The neck's foot (the beat, the key, Watch) is drawn in the room its
      // slot keeps for it (FOOT_PX), so Watch is inside the slot by design;
      // anything else on top of anything is not.
      const inFoot = (o: string) => o.startsWith("div.session-slot") && (o.includes("× button.practice-watch") || o.includes("× button.practice-sound") || o.endsWith("× svg. \"\" (10×10)") || o.endsWith("× svg. \"\" (12×12)") || o.endsWith("× svg. \"\" (16×16)"));
      expect((await overlapping(page)).filter((o) => !inFoot(o))).toEqual([]);
      await noSidewaysScroll(page, `${scene} at ${size.width}px`);
    });
  }
}

test("Watch lights the order and starts nothing; its key and Start both stop it", async ({ page }) => {
  await openShot(page, "session-neck-sweep", { width: 1400, height: 900 });
  const watch = page.locator('[data-testid="practice-watch"]');
  await expect(watch.locator("kbd")).toHaveText("L");
  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  // The pill goes while it plays, the beat dots count, and nothing runs.
  await expect(page.locator('[data-testid="practice-now-tag"]')).toBeHidden();
  await expect(page.locator('[data-testid="practice-beats"] i[data-on]')).toHaveCount(1, { timeout: 3000 });
  await expect(page.locator('[data-testid="session-live"]')).toHaveCount(0);
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "ready");
  // Its key stops it (pressed on the page, not on the button it just clicked).
  await page.locator("body").click({ position: { x: 5, y: 400 } });
  await page.keyboard.press("l");
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator('[data-testid="practice-now-tag"]')).toBeVisible();
  await page.keyboard.press("l");
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  // Start take ends it: the Take runs and Watch is gone.
  await page.locator('[data-testid="session-big"]').click();
  await expect(page.locator('[data-testid="session-live"]')).toBeVisible();
  await expect(watch).toHaveCount(0);
});
