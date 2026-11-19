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

  // Card #67: Exit 85 + clock 76 + chip 44 + Skip 109 + gaps was 338 px in a
  // 302 px bar in Russian, and Skip went to a row of its own.
  for (const [lng, size] of [
    ["ru", { width: 360, height: 640 }],
    ["ru", { width: 390, height: 844 }],
    ["de", { width: 360, height: 640 }],
  ] as const) {
    test(`Skip stays on the bar's first row in ${lng} at ${size.width}`, async ({ page }) => {
      await openShot(page, "session-ready", size, "ember", { lng });
      await settleAnimations(page);
      // The bar is measured as its width and its faces land: wait for its answer.
      await expect(async () => {
        const tops = await page.evaluate(() =>
          ['[data-testid="session-exit"]', '[data-testid="session-skip-this"]'].map((s) => document.querySelector(s)!.getBoundingClientRect().top),
        );
        expect(Math.abs(tops[0] - tops[1])).toBeLessThanOrEqual(4);
      }, "Skip is on a row of its own").toPass({ timeout: 5000 });
      const bar = await page.evaluate(() => {
        const box = (s: string) => {
          const r = document.querySelector(s)!.getBoundingClientRect();
          return { top: r.top, left: r.left, right: r.right, height: r.height };
        };
        const left = document.querySelector<HTMLElement>(".session-bar-left")!;
        const range = document.createRange();
        range.selectNodeContents(left);
        return {
          vw: innerWidth,
          exit: box('[data-testid="session-exit"]'),
          chip: box('[data-testid="session-input-chip"]'),
          skip: box('[data-testid="session-skip-this"]'),
          clock: box(".session-bar-left"),
          clockWords: range.getBoundingClientRect().width,
          clockLines: new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size,
        };
      });
      expect(Math.abs(bar.skip.top - bar.exit.top), "Skip is on a row of its own").toBeLessThanOrEqual(4);
      expect(Math.abs(bar.chip.top - bar.exit.top)).toBeLessThanOrEqual(4);
      expect(bar.skip.right).toBeLessThanOrEqual(bar.vw);
      // Nothing squeezed to get there: a thumb of height, the clock's words whole.
      // (Exit is 43.4 px in every language; its thumb is `phone-learning`'s to measure.)
      expect(bar.exit.height).toBeGreaterThanOrEqual(43);
      expect(bar.skip.height).toBeGreaterThanOrEqual(43);
      expect(bar.clockWords).toBeLessThanOrEqual(bar.clock.right - bar.clock.left + 1);
      expect(bar.clockLines).toBeLessThanOrEqual(2);
      expect(bar.clock.left).toBeGreaterThanOrEqual(bar.exit.right);
      expect(bar.chip.left).toBeGreaterThanOrEqual(bar.clock.right - 1);
      expect(bar.skip.left).toBeGreaterThanOrEqual(bar.chip.right - 1);
    });
  }
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

    // Card #67: "WARM-UP ·" over "NOT GRADED" in Ivory at 390.
    for (const [theme, lng] of [["ivory", "en"], ["ember", "en"], ["ember", "de"], ["aurora", "ru"]] as const) {
      test(`a row's facts wrap whole, with no dot at a line's end or start, in ${theme} (${lng})`, async ({ page }) => {
        test.slow();
        await openShot(page, "today-three-paths", PHONE, theme, { lng });
        await settleAnimations(page);
        const lines = await page.locator(".session-plan-meta.session-dotline").evaluateAll((els) =>
          els.map((line) => {
            const edge = line.getBoundingClientRect().left + parseFloat(getComputedStyle(line).getPropertyValue("--dot-w")) * parseFloat(getComputedStyle(line).fontSize);
            const parts = [...line.querySelectorAll<HTMLElement>(".session-dot-part")].map((part) => {
              const range = document.createRange();
              range.selectNodeContents(part);
              const sep = part.querySelector<HTMLElement>(".session-dot-sep")?.getBoundingClientRect() ?? null;
              const words = [...range.getClientRects()].filter((r) => r.width > 0);
              return {
                text: part.textContent ?? "",
                top: Math.round(part.getBoundingClientRect().top),
                sepShown: sep ? sep.right > edge + 1 : false,
                sepTop: sep ? Math.round(sep.top) : null,
                // The words: nothing of them in the clipped margin.
                left: Math.min(...words.filter((r) => !sep || r.left >= sep.right - 0.5).map((r) => r.left)),
              };
            });
            return { text: line.textContent ?? "", edge, right: line.getBoundingClientRect().right, parts };
          }),
        );
        expect(lines.length).toBeGreaterThan(1);
        expect(lines.some((l) => l.parts.length > 1), "no row with two facts to wrap").toBe(true);
        for (const line of lines) {
          line.parts.forEach((part, i) => {
            const startsLine = i === 0 || line.parts[i - 1].top !== part.top;
            expect(part.sepShown, `"${line.text}": a dot ${startsLine ? "starts a line" : "is missing between two facts"}`).toBe(!startsLine);
            expect(part.left, `"${line.text}": "${part.text}" starts under the clip`).toBeGreaterThanOrEqual(line.edge - 1);
          });
        }
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
