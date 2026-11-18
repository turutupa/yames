import { test, expect, type Page } from "@playwright/test";
import { openShot, MOBILE_URL, notHitTestable, settleAnimations, noSidewaysScroll } from "./fits";

/**
 * Acceptance pass 4 (2026-11-18), measured.
 *
 * P1-3: on a phone held upright, a Take's ready screen keeps the input's
 * state and its ways out in the sticky footer, so the first screen says why a
 * Start will not start; "Start take" spans the column; the input chip sits on
 * the bar's first row when there are no blocks. P2-7/8: Today's rows and its
 * plan at 1024, with the coach beside it, and on a phone.
 */

const PHONE = { width: 390, height: 844 };

/** The footer block, the input line inside it, and the big button, as boxes. */
async function footer(page: Page) {
  return page.evaluate(() => {
    const box = (e: Element | null) => {
      if (!e) return null;
      const r = e.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
    };
    const input = document.querySelector(
      '[data-testid="session-input-failed"], [data-testid="session-no-input"], [data-testid="session-input-on"], [data-testid="session-ungraded-note"]',
    );
    const actions = document.querySelector(".session-body > .session-actions");
    return {
      vh: innerHeight,
      input: box(input),
      inFooter: !!input?.closest('[data-testid="session-go"]'),
      big: box(document.querySelector('[data-testid="session-big"]')),
      column: box(actions),
      buttons: [
        ...document.querySelectorAll<HTMLElement>(
          '[data-testid="session-check-sound"], [data-testid="session-choose-input"], [data-testid="session-play-ungraded"]',
        ),
      ].map((b) => box(b)),
    };
  });
}

test.describe("a Take's ready screen on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const scene of ["session-input-failed", "session-input-off", "session-ready"]) {
    test(`${scene}: the input line is in the footer, on the first screen, Start full width`, async ({ page }) => {
      test.slow();
      await openShot(page, scene, PHONE);
      await settleAnimations(page);
      await noSidewaysScroll(page, `${scene} on a phone`);
      const f = await footer(page);
      expect(f.input, "no input line").not.toBeNull();
      expect(f.inFooter, "the input line is not in the sticky footer").toBe(true);
      // On the first screen, nothing scrolled.
      expect(f.input!.top).toBeGreaterThanOrEqual(0);
      expect(f.input!.bottom).toBeLessThanOrEqual(f.vh);
      for (const b of f.buttons) {
        expect(b!.top).toBeGreaterThanOrEqual(0);
        expect(b!.bottom).toBeLessThanOrEqual(f.vh);
      }
      // Above Start, and Start the column's width.
      expect(f.input!.bottom).toBeLessThanOrEqual(f.big!.top + 1);
      expect(Math.abs(f.big!.width - f.column!.width), `Start ${f.big!.width} of ${f.column!.width}`).toBeLessThanOrEqual(1);
      // Nothing over the line or its buttons.
      expect(
        await notHitTestable(
          page,
          '[data-testid="session-check-sound"], [data-testid="session-choose-input"], [data-testid="session-play-ungraded"], [data-testid="session-big"]',
        ),
      ).toEqual([]);
    });
  }

  test("the input chip shares the bar's first row when there are no blocks", async ({ page }) => {
    await openShot(page, "session-ready", PHONE);
    await settleAnimations(page);
    const rows = await page.evaluate(() => {
      const top = (s: string) => document.querySelector(s)?.getBoundingClientRect().top ?? null;
      return {
        pips: document.querySelector('[data-testid="session-pips"]')?.children.length ?? 0,
        exit: top('[data-testid="session-exit"]'),
        chip: top('[data-testid="session-input-chip"]'),
        skip: top('[data-testid="session-skip-this"]'),
      };
    });
    expect(rows.pips).toBe(0);
    expect(Math.abs(rows.chip! - rows.exit!)).toBeLessThanOrEqual(2);
    expect(Math.abs(rows.chip! - rows.skip!)).toBeLessThanOrEqual(2);
  });
});

test.describe("a Take's ready screen at 390 in the desktop build", () => {
  test("the status line is in the footer, not under it", async ({ page }) => {
    test.slow();
    await openShot(page, "session-input-failed", PHONE);
    await settleAnimations(page);
    const f = await footer(page);
    expect(f.inFooter).toBe(true);
    expect(f.input!.bottom).toBeLessThanOrEqual(f.vh);
    expect(Math.abs(f.big!.width - f.column!.width)).toBeLessThanOrEqual(1);
  });
});

test.describe("Today", () => {
  test("a row's hover covers the whole row, Swap's column included", async ({ page }) => {
    await openShot(page, "today-returning", { width: 1400, height: 900 });
    await settleAnimations(page);
    await page.locator(".session-plan-go").nth(1).hover();
    await page.waitForTimeout(300);
    const lit = await page.evaluate(() => {
      const li = document.querySelectorAll(".session-plan-row")[1] as HTMLElement;
      const go = li.querySelector(".session-plan-go") as HTMLElement;
      return { li: getComputedStyle(li).backgroundColor, go: getComputedStyle(go).backgroundColor };
    });
    expect(lit.li).not.toBe("rgba(0, 0, 0, 0)");
    expect(lit.go).toBe("rgba(0, 0, 0, 0)");
  });

  test("at 1024 the titles have room, and with the coach open the plan is not under it", async ({ page }) => {
    test.slow();
    const size = { width: 1024, height: 700 };
    await openShot(page, "today-returning", size);
    await settleAnimations(page);
    const widths = await page.locator(".session-plan-title").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
    for (const w of widths) expect(w).toBeGreaterThanOrEqual(220);

    await page.mouse.click(5, 300);
    await page.keyboard.press("c");
    await expect(page.locator(".coach-card.coach-card-open")).toBeVisible();
    await page.waitForTimeout(500);
    await noSidewaysScroll(page, "Today with the coach at 1024");
    const row = page.locator(".session-plan-go").first();
    await row.scrollIntoViewIfNeeded();
    expect(await notHitTestable(page, ".session-plan-row:first-child > .session-plan-go")).toEqual([]);
    const coach = (await page.locator(".coach-card.coach-card-open").boundingBox())!;
    const plan = (await page.locator(".session-today-plan").boundingBox())!;
    expect(plan.x + plan.width, "the plan runs under the coach").toBeLessThanOrEqual(coach.x + 1);
  });

  test.describe("on a phone", () => {
    test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
    for (const theme of ["ember", "aurora", "ivory"]) {
      test(`every reason is whole, and scrolled down the last row clears Start, in ${theme}`, async ({ page }) => {
        test.slow();
        await openShot(page, "phone-today-returning", PHONE, theme);
        await settleAnimations(page);
        const cut = await page.locator(".session-plan-why").evaluateAll((els) =>
          els.filter((e) => e.scrollHeight > e.clientHeight + 1 || getComputedStyle(e).webkitLineClamp !== "none").length,
        );
        expect(cut, "a reason is clamped").toBe(0);
        await page.evaluate(() => {
          const s = document.querySelector(".main-content");
          if (s) s.scrollTop = s.scrollHeight;
        });
        await page.waitForTimeout(200);
        const last = (await page.locator(".session-plan-row").last().boundingBox())!;
        const start = (await page.locator(".session-today-start").boundingBox())!;
        expect(last.y + last.height, "the last row is under Start").toBeLessThanOrEqual(start.y + 1);
      });
    }
  });
});

test("the header's volume shows a ring when reached by keyboard", async ({ page }) => {
  await openShot(page, "today-returning", { width: 1400, height: 900 });
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.classList.contains("context-chip-range"))) break;
  }
  const ring = await page.evaluate(() => {
    const chip = document.activeElement?.closest(".context-chip-volume");
    return chip ? getComputedStyle(chip).outlineStyle : "no chip";
  });
  expect(ring).toBe("solid");
});
