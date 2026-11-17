import { test, expect, type Page } from "@playwright/test";
import { openShot, noSidewaysScroll, MOBILE_URL, notHitTestable, overlapping, spillingLabels } from "./fits";
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
        // Every one of these walks the app from Today (and the session scenes
        // play a Take in real time with the neck or the runway drawing): under
        // SwiftShader and the full parallel suite, Paths alone passed 30 s.
        // The budget session.spec.ts gives its own.
        test.slow();
        await openShot(page, `phone-${scene}`, size);
        await noSidewaysScroll(page, `phone-${scene} at ${size.width}px`);
        const first = await smallTargets(page);
        // A sweep that finds nothing looks exactly like one that cannot find
        // anything: every one of these screens has a control to press (the
        // welcome card has two; the rest have the tab bar as well, except a
        // running Session, which has no tab bar (QA 2026-11-17 #3) and whose
        // recap has only "Done").
        expect(first.seen, "no controls measured at all").toBeGreaterThan(scene.startsWith("session-") ? 0 : 1);
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

  // QA 2 (2026-11-17) #1 and #2: in the longest languages, on the narrowest
  // phones, the recap's "What moved" number drew over its own details, and the
  // first run's Next ran off the card.
  for (const lng of ["ru", "de", "pt-BR", "fr"]) {
    for (const size of [{ width: 360, height: 800 }, { width: 390, height: 844 }]) {
      test(`the recap and the first run's footer fit in ${lng} at ${size.width}px`, async ({ page }) => {
        test.slow();
        await openShot(page, "phone-session-recap", size, "ember", { lng });
        const recap = await page.evaluate(() =>
          [...document.querySelectorAll(".session-recap-item")].map((item) => {
            const box = item.getBoundingClientRect();
            const text = item.querySelector(".session-recap-text")!.getBoundingClientRect();
            const num = item.querySelector(".session-recap-number")?.getBoundingClientRect();
            return {
              textWide: Math.round(text.width) >= 150,
              apart: !num || num.top >= text.bottom - 1 || num.left >= text.right - 1,
              inside: !num || (num.right <= box.right + 1 && num.left >= box.left - 1),
            };
          }),
        );
        expect(recap.length, "no recap rows").toBeGreaterThan(0);
        expect(recap.every((r) => r.textWide && r.apart && r.inside), JSON.stringify(recap)).toBe(true);

        await openShot(page, "phone-firstrun-input", size, "ember", { lng });
        const out = await page.evaluate(() => {
          const footer = document.querySelector(".onboarding-footer")!.getBoundingClientRect();
          return [...document.querySelectorAll<HTMLElement>(".onboarding-footer .onboarding-btn")]
            .filter((b) => {
              const r = b.getBoundingClientRect();
              return r.left < footer.left - 1 || r.right > footer.right + 1 || b.scrollWidth > b.clientWidth + 1;
            })
            .map((b) => b.textContent);
        });
        expect(out, "footer buttons off the card").toEqual([]);
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
  // phone, and inside the window (no tab bar while a Session runs), at both widths.
  for (const size of WIDTHS) {
    test(`the runway Take fills the phone at ${size.width}px`, async ({ page }) => {
      await openShot(page, "phone-session-runway-playing", size);
      const runway = page.locator('[data-testid="runway"]');
      await expect(runway, "no runway during the Take").toBeVisible();
      const r = (await runway.boundingBox())!;
      expect(Math.round(r.x), "the runway starts off the left edge").toBeGreaterThanOrEqual(0);
      expect(Math.round(r.x + r.width), "the runway runs off the right edge").toBeLessThanOrEqual(size.width);
      expect(Math.round(r.width), "the runway is a strip, not the picture").toBeGreaterThan(size.width * 0.8);
      expect(Math.round(r.height), "the runway has no height to fall down").toBeGreaterThan(200);
      expect(Math.round(r.y + r.height), "the runway runs off the bottom").toBeLessThanOrEqual(size.height);
    });
  }

  // QA 2026-11-17 #3: one picture at a time. While a Session runs the tab bar
  // is gone (it covered "Start take" at 360x800); Exit is the way out.
  for (const scene of ["session-ready", "session-playing", "session-between", "session-result", "session-recap"]) {
    test(`no tab bar during ${scene}`, async ({ page }) => {
      await openShot(page, `phone-${scene}`, { width: 360, height: 800 });
      await expect(page.locator('[data-testid="session"]')).toBeVisible();
      await expect(page.locator(".mobile-tabs")).toHaveCount(0);
    });
  }

  test("a Session's big button is reachable, with nothing over it", async ({ page }) => {
    await openShot(page, "phone-session-ready", { width: 360, height: 800 });
    expect(await notHitTestable(page, '[data-testid="session-big"], [data-testid="session-exit"]')).toEqual([]);
  });

  test("the tab bar is back on Today after a Session", async ({ page }) => {
    await openShot(page, "phone-today-returning", { width: 360, height: 800 });
    await expect(page.locator(".mobile-tabs")).toBeVisible();
  });

  for (const size of WIDTHS) {
    // #1: the Step page's first card's buttons, under the neck's slot.
    test(`phone-step-detail: every button takes a tap, nothing overlaps, at ${size.width}px`, async ({ page }) => {
      test.slow();
      await openShot(page, "phone-step-detail", size);
      expect(await notHitTestable(page, '[data-testid="step-detail"] button')).toEqual([]);
      expect(await overlapping(page)).toEqual([]);
    });

    // #2: Exit under the Take's heading on the result scenes.
    for (const scene of ["session-between", "session-edge-result"]) {
      test(`phone-${scene}: Exit takes a tap, nothing overlaps, at ${size.width}px`, async ({ page }) => {
        test.slow();
        await openShot(page, `phone-${scene}`, size);
        expect(await notHitTestable(page, '[data-testid="session-exit"]')).toEqual([]);
        expect(await overlapping(page)).toEqual([]);
      });
    }

    // #4: "0 / 8" is one line, and the live numbers do not overlap.
    test(`phone-session-playing: the bar counter is one line at ${size.width}px`, async ({ page }) => {
      test.slow();
      await openShot(page, "phone-session-playing", size);
      const lines = await page.$eval('[data-testid="session-live"] .session-stat:not([data-xl]) b', (b) => {
        const lh = parseFloat(getComputedStyle(b).lineHeight) || parseFloat(getComputedStyle(b).fontSize);
        return Math.round(b.getBoundingClientRect().height / lh);
      });
      expect(lines, "the bar counter wraps").toBe(1);
      expect(await overlapping(page)).toEqual([]);
    });

    // #11: the longest translations on the Take and its result.
    for (const lng of ["ru", "de", "pt-BR", "ja"]) {
      for (const scene of ["session-playing", "session-between"]) {
        test(`phone-${scene} in ${lng}: every label fits at ${size.width}px`, async ({ page }) => {
          test.slow();
          await openShot(page, `phone-${scene}`, size, "ember", { lng });
          await noSidewaysScroll(page, `phone-${scene} in ${lng}`);
          expect(await spillingLabels(page)).toEqual([]);
          expect(await overlapping(page)).toEqual([]);
        });
      }
    }

    // #5: Progress, nothing drawn over anything.
    test(`phone-progress: nothing overlaps at ${size.width}px`, async ({ page }) => {
      test.slow();
      await openShot(page, "phone-progress", size);
      expect(await overlapping(page)).toEqual([]);
    });
  }
});
