import { test, expect } from "@playwright/test";
import { openShot, noSidewaysScroll } from "./fits";

/**
 * The Settings sheet, measured in a real browser.
 *
 * Written the day the owner sent a screenshot of the update banner and said
 * it was "sitting a bit awkwardly behind the settings". It was: the panel
 * below it carried `margin-top: 0` — it matches neither
 * `.settings-section:first-child` nor `.settings-section + .settings-section`
 * once the banner is the first child — and the banner's own
 * `margin-bottom: -4px`, left over from the long-scroll layout this view used
 * to be, pulled the panel four pixels UP over it.
 *
 * None of that is visible to a unit test. happy-dom computes no geometry, so
 * every box in it is zero by zero and an overlap measures the same as a gap.
 * This is the suite that can see it.
 */
const WIDTHS = [
  { name: "narrow", width: 520, height: 900 },
  { name: "wide", width: 1400, height: 900 },
];

test.describe("the update banner", () => {
  for (const size of WIDTHS) {
    test(`does not sit under the panel below it at ${size.name} (${size.width}px)`, async ({
      page,
    }) => {
      await openShot(page, "settings-update", size);

      const boxes = await page.evaluate(() => {
        const banner = document.querySelector(".update-banner");
        const panel = banner?.nextElementSibling;
        if (!banner || !panel) return null;
        const b = banner.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        return {
          bannerBottom: b.bottom,
          panelTop: p.top,
          bannerLeft: b.left,
          panelLeft: p.left,
          bannerRight: b.right,
          panelRight: p.right,
          panelClass: panel.className,
        };
      });

      expect(boxes, "no update banner on the settings sheet").not.toBeNull();
      expect(boxes!.panelClass, "the banner is not followed by a settings panel").toContain(
        "settings-section",
      );

      // The bug, stated as a number. It was −4.
      const gap = boxes!.panelTop - boxes!.bannerBottom;
      expect(
        Math.round(gap),
        `the panel starts ${Math.round(gap)}px from the banner's bottom edge — a negative \
number means it is drawn over it`,
      ).toBeGreaterThanOrEqual(8);

      // And it is the stack's own rhythm, not some other gap.
      expect(Math.round(gap), `${Math.round(gap)}px is not the 14px the panels use`).toBeLessThanOrEqual(20);

      // Same column as everything else in the sheet: a banner inset from the
      // panels reads as a different kind of object floating over them.
      expect(Math.round(boxes!.bannerLeft), "the banner's left edge").toBe(
        Math.round(boxes!.panelLeft),
      );
      expect(Math.round(boxes!.bannerRight), "the banner's right edge").toBe(
        Math.round(boxes!.panelRight),
      );
    });
  }

  test("keeps the settings sheet from scrolling sideways", async ({ page }) => {
    await openShot(page, "settings-update", { width: 520, height: 900 });
    await noSidewaysScroll(page, "the settings sheet at 520px");
  });
});

/*
 * P1-10 (acceptance, 2026-11-18): at 1024px the section index's "you are
 * here" label was drawn over the rows it named. Whatever the index shows —
 * ticks, always-on names, the scroll flash — stays out of the sheet, at every
 * width a desktop window is dragged to.
 */
test.describe("the section index", () => {
  for (const width of [900, 1024, 1180, 1300, 1400, 2000]) {
    test(`never draws over the sheet at ${width}px`, async ({ page }) => {
      await openShot(page, "settings-update", { width, height: 800 });
      const hits: string[] = [];
      for (const y of [0, 700, 1600, 2600, 4000]) {
        const found = await page.evaluate(async (y) => {
          const c = document.querySelector<HTMLElement>(".view-transition-wrapper");
          if (!c) return ["no scroller"];
          c.scrollTop = y;
          c.dispatchEvent(new Event("scroll"));
          await new Promise((r) => setTimeout(r, 200));
          const sections = [...c.querySelectorAll("section.settings-section, section.hotkeys-section")].map(
            (s) => s.getBoundingClientRect(),
          );
          const shown = [...document.querySelectorAll<HTMLElement>(".stl-tick, .stl-tooltip, .stl-popover")].filter((e) => {
            const cs = getComputedStyle(e);
            const rail = e.closest<HTMLElement>(".settings-timeline");
            return (
              cs.display !== "none" &&
              cs.visibility !== "hidden" &&
              Number(cs.opacity) > 0 &&
              (!rail || getComputedStyle(rail).visibility !== "hidden")
            );
          });
          const out: string[] = [];
          for (const e of shown) {
            const r = e.getBoundingClientRect();
            if (r.width === 0) continue;
            for (const s of sections) {
              const x = Math.min(r.right, s.right) - Math.max(r.left, s.left);
              const yv = Math.min(r.bottom, s.bottom) - Math.max(r.top, s.top);
              if (x > 0 && yv > 0) out.push(`${e.className} "${e.textContent?.trim()}" at x ${Math.round(r.left)}–${Math.round(r.right)}, sheet ends at ${Math.round(s.right)}`);
            }
          }
          return out;
        }, y);
        hits.push(...found);
      }
      expect([...new Set(hits)], "the section index is drawn over the settings sheet").toEqual([]);
    });
  }
});

/*
 * Acceptance 4, P2-3: at 1400 the column was 718px, held by a gutter kept on
 * both sides for an index that is only on the right, and the Support page's
 * GitHub tile wrapped to three lines. The column grows to a reading width
 * (900–1040px at 1400 and up), and each support tile's hint is one or two lines.
 */
test.describe("the settings column", () => {
  for (const [width, min] of [
    [1400, 860],
    [2000, 1000],
  ] as const) {
    test(`is wide enough for its cards at ${width}px`, async ({ page }) => {
      await openShot(page, "settings-update", { width, height: 900 });
      const sizes = await page.$$eval("section.settings-section", (els) => els.map((e) => e.getBoundingClientRect().width));
      expect(sizes.length).toBeGreaterThan(3);
      for (const w of sizes) {
        expect(w).toBeGreaterThanOrEqual(min);
        expect(w).toBeLessThanOrEqual(1040.5);
      }
      const lines = await page.$$eval(".support-link-hint", (els) =>
        els.map((e) => {
          const lh = parseFloat(getComputedStyle(e).lineHeight) || parseFloat(getComputedStyle(e).fontSize) * 1.3;
          return Math.round(e.getBoundingClientRect().height / lh);
        }),
      );
      expect(lines.length).toBeGreaterThan(1);
      for (const n of lines) expect(n, "a support tile's hint wraps past two lines").toBeLessThanOrEqual(2);
    });
  }
});

/**
 * Recording session (card #109): its switch, its cap field and its two
 * buttons sit inside the Support panel at every width, and the switch never
 * overlaps the long hint beside it.
 */
test.describe("the recording session row", () => {
  for (const size of [
    { width: 520, height: 900 },
    { width: 1024, height: 900 },
    { width: 1400, height: 900 },
  ]) {
    test(`fits its panel at ${size.width}px`, async ({ page }) => {
      await openShot(page, "settings-update", size);
      const row = page.getByTestId("settings-recording-session");
      await row.scrollIntoViewIfNeeded();
      const m = await row.evaluate((el) => {
        const panel = el.closest("section.settings-section")!.getBoundingClientRect();
        const r = (q: string) => {
          const e = el.querySelector(q);
          return e ? e.getBoundingClientRect() : null;
        };
        return {
          panel: { left: panel.left, right: panel.right },
          parts: [".setting-switch", ".recording-session-cap", '[data-testid="recording-session-zip"]', '[data-testid="recording-session-open"]']
            .map((q) => ({ q, b: r(q) }))
            .filter((x) => x.b !== null)
            .map((x) => ({ q: x.q, left: x.b!.left, right: x.b!.right, width: x.b!.width })),
          label: r(".setting-label"),
          toggle: r(".setting-switch"),
        };
      });
      expect(m.parts.length).toBe(4);
      for (const p of m.parts) {
        expect(p.width, `${p.q} has no size`).toBeGreaterThan(10);
        expect(p.left, `${p.q} starts outside its panel`).toBeGreaterThanOrEqual(m.panel.left - 0.5);
        expect(p.right, `${p.q} ends outside its panel`).toBeLessThanOrEqual(m.panel.right + 0.5);
      }
      expect(m.label!.right, "the switch overlaps the hint").toBeLessThanOrEqual(m.toggle!.left + 0.5);
    });
  }
});
