import { test, expect, type Page } from "@playwright/test";
import { MOBILE_URL, noSidewaysScroll, openShot, settleAnimations } from "./fits";

/**
 * The coach in a Session (coach leg c1b1; DESIGN 3.4, 3.6, 4.1 to 4.4; mocks
 * 03 to 07, 13, 14), measured in a real browser at a computer's two sizes and
 * a phone's:
 *
 * - the note sits inside the window, wraps, and nothing in it is under 12 px;
 * - the coach's colour is on its glyph and the 3 px rule and nowhere else, and
 *   the rule is the same colour after a pass and after a miss;
 * - chips are a neutral 1 px outline, never filled, never coach-coloured;
 * - the page keeps its one solid button, and on a short window (1024 x 700)
 *   Start stays on screen with the note above it;
 * - the order during a Take is one fixed line, 24 px on a computer and 20 on
 *   a phone, in ink, with no coach colour.
 *
 * `COACH_SHOTS=<dir>` also saves each scene in Ember, Neon and Manuscript for
 * a person to look at against the mocks.
 */

const WIDE = { width: 1440, height: 900 };
const SHORT = { width: 1024, height: 700 };
const PHONE = { width: 390, height: 844 };

const NOTE_SCENES = [
  { scene: "coach-ready-again", kind: "ready" },
  { scene: "session-between", kind: "result" },
  { scene: "session-result", kind: "result" },
  { scene: "session-ready", kind: "ready" },
  { scene: "session-ungraded-ready", kind: "ready" },
  { scene: "coach-ungraded-ready", kind: "ready" },
  { scene: "coach-ungraded-result", kind: "ungraded" },
] as const;

type NoteFacts = {
  rule: string;
  ruleWidth: number;
  mark: string;
  glyph: string;
  smallest: { px: number; text: string };
  coachColoured: string[];
  chips: Array<{ border: string; borderWidth: number; background: string }>;
  nowrap: string[];
  box: { left: number; right: number; top: number; bottom: number };
};

/** What the note is drawn with, read in one task. */
async function noteFacts(page: Page): Promise<NoteFacts> {
  return page.evaluate(() => {
    const note = document.querySelector<HTMLElement>('[data-testid="coach-note"]')!;
    const cs = getComputedStyle(note);
    // The theme's --accent-2, resolved to a colour the way the rule is.
    const probe = document.createElement("i");
    probe.style.color = "var(--accent-2)";
    note.appendChild(probe);
    const mark = getComputedStyle(probe).color;
    probe.remove();
    const glyph = getComputedStyle(note.querySelector(".coach-note-head .coach-glyph")!).color;
    let smallest = { px: 99, text: "" };
    const coachColoured: string[] = [];
    const nowrap: string[] = [];
    for (const el of note.querySelectorAll<HTMLElement>("*")) {
      const s = getComputedStyle(el);
      if (s.display === "none" || el.closest(".sr-only")) continue;
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim() !== "");
      if (own) {
        const px = parseFloat(s.fontSize);
        if (px < smallest.px) smallest = { px, text: el.textContent!.trim().slice(0, 40) };
        if (s.color === mark) coachColoured.push(el.textContent!.trim().slice(0, 40));
        // A number with its unit may keep together; words may not.
        if (s.whiteSpace === "nowrap" && !/^[×\d\s%]+$/.test(el.textContent!.trim())) nowrap.push(el.textContent!.trim().slice(0, 40));
      }
      if (s.backgroundColor === mark) coachColoured.push(`fill: ${el.className}`);
    }
    const chips = [...note.querySelectorAll<HTMLElement>(".coach-chip")].map((c) => {
      const s = getComputedStyle(c);
      return { border: s.borderTopColor, borderWidth: parseFloat(s.borderTopWidth), background: s.backgroundColor };
    });
    const r = note.getBoundingClientRect();
    return {
      rule: cs.borderLeftColor,
      ruleWidth: parseFloat(cs.borderLeftWidth),
      mark,
      glyph,
      smallest,
      coachColoured,
      chips,
      nowrap,
      box: { left: r.left, right: r.right, top: r.top, bottom: r.bottom },
    };
  });
}

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

async function checkNote(page: Page, where: string, kind: string) {
  const note = page.locator('[data-testid="coach-note"]');
  await expect(note, `${where}: the coach's note`).toBeVisible({ timeout: 20_000 });
  await expect(note).toHaveAttribute("data-kind", kind);
  await settleAnimations(page);
  const f = await noteFacts(page);
  const vw = await page.evaluate(() => innerWidth);
  expect(f.box.left, `${where}: the note starts inside the window`).toBeGreaterThanOrEqual(0);
  expect(f.box.right, `${where}: the note ends inside the window`).toBeLessThanOrEqual(vw + 0.5);
  expect(f.ruleWidth, `${where}: the coach's rule is 3 px`).toBe(3);
  expect(f.rule, `${where}: the rule is the coach's colour, never a grade's`).toBe(f.mark);
  expect(f.glyph, `${where}: the glyph is the coach's colour`).toBe(f.mark);
  expect(f.coachColoured, `${where}: the coach's colour on words or a fill`).toEqual([]);
  expect(f.smallest.px, `${where}: smallest text "${f.smallest.text}"`).toBeGreaterThanOrEqual(12);
  expect(f.nowrap, `${where}: words held on one line`).toEqual([]);
  for (const chip of f.chips) {
    expect(chip.borderWidth, `${where}: a chip's outline`).toBe(1);
    expect(chip.border, `${where}: a chip is never coach-coloured`).not.toBe(f.mark);
    expect(chip.background, `${where}: a chip is an outline, not a fill`).toBe("rgba(0, 0, 0, 0)");
  }
  expect(await solidButtons(page), `${where}: one solid button`).toBe(1);
  await noSidewaysScroll(page, where);
}

for (const { scene, kind } of NOTE_SCENES) {
  test(`${scene}: the coach's note keeps the design's rules at 1440 and 1024 x 700`, async ({ page }) => {
    test.slow();
    await openShot(page, scene, WIDE);
    await checkNote(page, `${scene} at 1440`, kind);
    await page.setViewportSize(SHORT);
    await checkNote(page, `${scene} at 1024x700`, kind);
    // Start, Go again or Next: on screen, under the note, in a short window.
    const big = await page.locator('[data-testid="session-big"]').boundingBox();
    expect(big, `${scene} at 1024x700: the big button`).not.toBeNull();
    expect(big!.y + big!.height, `${scene} at 1024x700: the big button is on screen`).toBeLessThanOrEqual(700 + 0.5);
  });
}

test("the ready note before a later Take: one thing to do, its source, the last Take in one line", async ({ page }) => {
  await openShot(page, "coach-ready-again", WIDE);
  const note = page.locator('[data-testid="coach-note"]');
  await expect(note.locator(".coach-block-source")).toBeVisible();
  await expect(note.locator('[data-testid="coach-last"]')).toBeVisible();
  // The quiet line steps aside on a short window; the headline stays.
  await page.setViewportSize(SHORT);
  await expect(note.locator('[data-testid="coach-last"]')).toBeHidden();
  await expect(note.locator(".coach-note-head")).toBeVisible();
});

test("the result note: the strip inside it, drawn once, and one fact line", async ({ page }) => {
  await openShot(page, "session-between", WIDE);
  const note = page.locator('[data-testid="coach-note"]');
  await expect(note).toHaveAttribute("aria-live", "polite");
  await expect(note.locator('[data-testid="coach-bars"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="coach-bars"]')).toHaveCount(1);
  await expect(page.locator('[data-testid="session-bars"]')).toHaveCount(0);
  await expect(note.locator('[data-testid="coach-facts"]')).toHaveCount(1);
  // A slipped bar carries a cross as well as its colour.
  const missed = note.locator('.coach-bar[data-state="missed"]');
  if ((await missed.count()) > 0) await expect(missed.first()).toContainText("×");
});

test("ungraded: nothing about the microphone or grading in the coach's words", async ({ page }) => {
  for (const scene of ["session-ungraded-ready", "coach-ungraded-ready", "coach-ungraded-result"]) {
    await openShot(page, scene, WIDE);
    const note = page.locator('[data-testid="coach-note"]');
    await expect(note).toBeVisible({ timeout: 20_000 });
    await expect(note).not.toContainText(/micro|grading|graded/i);
  }
});

test("ungraded: the author's question before, and two equal answers after, nothing pre-selected", async ({ page }) => {
  await openShot(page, "coach-ungraded-ready", WIDE);
  await expect(page.locator('[data-testid="coach-note"] .coach-note-head')).toContainText("?");
  await openShot(page, "coach-ungraded-result", WIDE);
  const yes = page.locator('[data-testid="coach-heard-yes"]');
  const notYet = page.locator('[data-testid="coach-heard-notYet"]');
  await expect(yes).toHaveAttribute("aria-pressed", "false");
  await expect(notYet).toHaveAttribute("aria-pressed", "false");
  await notYet.click();
  await expect(notYet).toHaveAttribute("aria-pressed", "true");
  await expect(yes).toHaveAttribute("aria-pressed", "false");
});

async function checkOrder(page: Page, where: string, px: number) {
  const order = page.locator('[data-testid="coach-order"]');
  await expect(order, `${where}: the order`).toBeVisible({ timeout: 30_000 });
  const f = await order.evaluate((el) => {
    const s = getComputedStyle(el);
    const probe = document.createElement("i");
    probe.style.color = "var(--accent-2)";
    el.appendChild(probe);
    const mark = getComputedStyle(probe).color;
    probe.remove();
    const r = el.getBoundingClientRect();
    return {
      size: parseFloat(s.fontSize),
      color: s.color,
      glyph: getComputedStyle(el.querySelector(".coach-glyph")!).color,
      mark,
      right: r.right,
      vw: innerWidth,
    };
  });
  expect(f.size, `${where}: the order's size`).toBe(px);
  expect(f.glyph, `${where}: no coach colour on a live screen`).not.toBe(f.mark);
  expect(f.color, `${where}: the order is in ink`).not.toBe(f.mark);
  expect(f.right, `${where}: the order is inside the window`).toBeLessThanOrEqual(f.vw + 0.5);
  expect(await solidButtons(page), `${where}: one solid button`).toBe(1);
}

test("the order during a Take: 24 px, in ink, fixed (neck and runway)", async ({ page }) => {
  test.slow();
  await openShot(page, "coach-take-order", WIDE);
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "playing", { timeout: 30_000 });
  await checkOrder(page, "neck at 1440", 24);
  const said = await page.locator('[data-testid="coach-order"]').textContent();
  expect([...(said ?? "")].length).toBeLessThanOrEqual(48);
  await openShot(page, "coach-take-order-runway", WIDE);
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "playing", { timeout: 30_000 });
  await checkOrder(page, "runway at 1440", 24);
});

test("a cue too long for the order shows nothing during the Take rather than half a sentence", async ({ page }) => {
  // The returning player's Exercise: its cue runs past 48 characters.
  await openShot(page, "session-playing", WIDE);
  await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "playing", { timeout: 30_000 });
  const order = page.locator('[data-testid="coach-order"]');
  if ((await order.count()) > 0) {
    expect([...((await order.textContent()) ?? "")].length).toBeLessThanOrEqual(48);
  }
  await expect(page.locator('[data-testid="coach-note"]')).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ baseURL: MOBILE_URL, viewport: PHONE, isMobile: true, hasTouch: true });

  for (const { scene, kind } of NOTE_SCENES) {
    test(`${scene}: the coach's note on a phone`, async ({ page }) => {
      test.slow();
      await openShot(page, `phone-${scene}`, PHONE);
      await checkNote(page, `${scene} on a phone`, kind);
    });
  }

  test("the order during a Take is 20 px on a phone", async ({ page }) => {
    test.slow();
    await openShot(page, "phone-coach-take-order", PHONE);
    await expect(page.locator('[data-testid="session-take"]')).toHaveAttribute("data-phase", "playing", { timeout: 30_000 });
    await checkOrder(page, "phone", 20);
  });
});

const SHOTS_DIR = process.env.COACH_SHOTS;
test.describe("pictures for the review", () => {
  test.skip(!SHOTS_DIR, "COACH_SHOTS is not set");
  const SCENES = [
    "coach-ready-again",
    "session-ready",
    "coach-take-order",
    "session-between",
    "session-result",
    "session-ungraded-ready",
    "coach-ungraded-ready",
    "coach-ungraded-result",
    "session-no-catch",
    "session-recap",
  ];
  for (const theme of ["ember", "neon", "manuscript"]) {
    for (const scene of SCENES) {
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
  for (const theme of ["ember", "manuscript"]) {
    for (const scene of ["coach-ready-again", "coach-take-order", "session-between", "session-result", "coach-ungraded-ready", "coach-ungraded-result"]) {
      test(`${scene} on a phone in ${theme}`, async ({ page }) => {
        test.slow();
        await openShot(page, `phone-${scene}`, PHONE, theme);
        await settleAnimations(page);
        await page.screenshot({ path: `${SHOTS_DIR}/${scene}--${theme}--phone.png`, fullPage: true });
      });
    }
  }
});
