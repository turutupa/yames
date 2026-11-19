import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, MOBILE_URL } from "./fits";

/**
 * A chord Path on the screen (card #74).
 *
 * - The Neck view of "E minor, A minor, C" drew the three shapes on top of
 *   each other. It shows the chord of the bar: the first one before the
 *   start, each in its turn while Watch plays.
 * - The Tab view says which way each strum goes: the bracket for down and the
 *   V for up, over the strum, with the two words once in the corner.
 */
const SIZES = [
  { name: "desktop", size: { width: 1400, height: 900 }, phone: false },
  { name: "phone", size: { width: 390, height: 844 }, phone: true },
] as const;

const E_MINOR = ["1:0", "2:0", "3:0", "4:2", "5:2", "6:0"];
const A_MINOR = ["1:0", "2:1", "3:2", "4:2", "5:0"];
const C_MAJOR = ["1:0", "2:1", "3:0", "4:2", "5:3"];
const CHORDS = [E_MINOR, A_MINOR, C_MAJOR];

type Dot = { key: string; kind: string; label: string | null; x: number; y: number; r: number };

async function neck(page: Page): Promise<{ mode: string; dots: Dot[] }> {
  return page.evaluate(() => {
    const c = window.__NECK__?.current;
    if (!c) return { mode: "none", dots: [] };
    const dots: Dot[] = [];
    for (const n of c.getSnapshot().notes) {
      const p = c.project(n.string, n.fret);
      dots.push({ key: `${n.string}:${n.fret}`, kind: n.kind, label: n.label ?? null, x: p?.x ?? -1, y: p?.y ?? -1, r: p?.r ?? 0 });
    }
    return { mode: c.mode, dots };
  });
}

/** The places drawn as the chord itself: everything but NEXT's outline. */
const shapeOf = (dots: Dot[]) => dots.filter((d) => d.kind !== "next").map((d) => d.key).sort();

for (const { name, size, phone } of SIZES) {
  test.describe(`a chord Exercise on a ${name}`, () => {
    if (phone) test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

    test("the neck shows the first chord before the start, not every chord at once", async ({ page }) => {
      test.slow();
      await openShot(page, "session-neck-first-chords", size, "ember");
      await expect.poll(async () => (await neck(page)).mode, { timeout: 20_000 }).toBe("3d");
      await settleAnimations(page);
      await expect.poll(async () => shapeOf((await neck(page)).dots), { timeout: 10_000 }).toEqual(E_MINOR);
      const { dots } = await neck(page);
      // The whole chord is what you start on, and its fretted notes carry their fingers.
      expect(dots.every((d) => d.kind === "now")).toBe(true);
      expect(dots.find((d) => d.key === "5:2")?.label).toBe("2");
      expect(dots.find((d) => d.key === "4:2")?.label).toBe("3");
      // Every dot of it is on the neck's slot, on the first screen.
      const slot = (await page.locator(".practice-neck-slot, .session-practice-hero").first().boundingBox())!;
      for (const d of dots) {
        expect(d.x, `${d.key} is off the slot`).toBeGreaterThanOrEqual(slot.x - 1);
        expect(d.x).toBeLessThanOrEqual(slot.x + slot.width + 1);
        expect(d.y).toBeGreaterThanOrEqual(slot.y - 1);
        expect(d.y).toBeLessThanOrEqual(slot.y + slot.height + 1);
      }
    });

    test("Watch shows one chord at a time, each in its bar", async ({ page }) => {
      test.setTimeout(90_000);
      await openShot(page, "session-neck-first-chords", size, "ember");
      await expect.poll(async () => (await neck(page)).mode, { timeout: 20_000 }).toBe("3d");
      await settleAnimations(page);
      await page.getByTestId("practice-watch").click();
      // 40 BPM: a bar of count-in, then a bar a chord, six seconds each.
      const seen = new Set<string>();
      const until = Date.now() + 22_000;
      while (Date.now() < until && seen.size < 2) {
        const { dots } = await neck(page);
        const shape = shapeOf(dots);
        const which = CHORDS.findIndex((chord) => shape.every((k) => chord.includes(k)));
        expect(which, `the neck holds places of more than one chord: ${shape.join(" ")}`).toBeGreaterThanOrEqual(0);
        if (shape.length === CHORDS[which].length) seen.add(["Em", "Am", "C"][which]);
        // NEXT's outline is the next strum's: never more than one more chord.
        const next = dots.filter((d) => d.kind === "next").map((d) => d.key);
        expect(CHORDS.some((chord) => next.every((k) => chord.includes(k))), `NEXT is no chord: ${next.join(" ")}`).toBe(true);
        await page.waitForTimeout(150);
      }
      expect([...seen].sort(), "Watch never reached the second chord").toEqual(["Am", "Em"]);
    });

    test("the tab says which way each strum goes", async ({ page }) => {
      test.slow();
      await openShot(page, "session-tab-first-chords", size, "ember");
      await settleAnimations(page);
      await expect(page.locator(".tabstrip-strum").first()).toBeVisible();
      const tab = await page.evaluate(() => {
        const box = (el: Element) => {
          const r = el.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        };
        const strip = document.querySelector('[data-testid="tabstrip"]')!;
        return {
          strip: box(strip),
          key: box(document.querySelector('[data-testid="tabstrip-strumkey"]')!),
          keyText: (document.querySelector('[data-testid="tabstrip-strumkey"]') as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
          segs: [...document.querySelectorAll(".tabstrip-seg")].map((seg) => ({
            marks: [...seg.querySelectorAll(".tabstrip-strum")].map((m) => ({ dir: m.getAttribute("data-strum"), ...box(m) })),
            topLine: Math.min(...[...seg.querySelectorAll(".tabstrip-line")].map((l) => l.getBoundingClientRect().top)),
            label: seg.querySelector(".tabstrip-label") ? box(seg.querySelector(".tabstrip-label")!) : null,
            numbers: [...seg.querySelectorAll('.tabstrip-note[data-string="1"] text')].map((n) => box(n)),
            box: box(seg),
          })),
        };
      });
      expect(tab.keyText).toBe("down up");
      // The key is inside the strip, on nothing.
      expect(tab.key.right).toBeLessThanOrEqual(tab.strip.right);
      expect(tab.key.top).toBeGreaterThanOrEqual(tab.strip.top);
      const marks = tab.segs.flatMap((s) => s.marks);
      expect(marks.length).toBeGreaterThanOrEqual(6);
      // Down, down-up: two downs for every up in a bar.
      const first = tab.segs.find((s) => s.marks.length > 0)!;
      expect(first.marks.map((m) => m.dir).join("")).toMatch(/^(ddu)+$/);
      const touches = (a: { left: number; right: number; top: number; bottom: number }, b: typeof a) =>
        a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      for (const seg of tab.segs) {
        for (const m of seg.marks) {
          // Over the staff, clear of the top string's numbers, the bar's name and the key.
          expect(m.bottom, "a strum mark is on the staff").toBeLessThanOrEqual(seg.topLine);
          expect(m.top).toBeGreaterThanOrEqual(seg.box.top);
          expect(m.bottom - m.top).toBeGreaterThanOrEqual(6);
          if (seg.label) expect(touches(m, seg.label), "a strum mark is on the bar's name").toBe(false);
          expect(touches(m, tab.key), "a strum mark is under the key").toBe(false);
          for (const n of seg.numbers) expect(touches(m, n), "a strum mark touches a number").toBe(false);
        }
        if (seg.label) expect(touches(seg.label, tab.key), "the key is on a bar's name").toBe(false);
      }
    });
  });
}
