// Whose kit plays the file's drums (W37 item 3).
//
// The owner: *"the 'drums' layer in a song i'm playing sounds AWFUL, the click
// sounds very good tho"*. What was a bug is fixed in `song.rs`; what is left
// is taste, and taste is a switch he can flip while the song plays. It sits
// under the band's faders inside "More", so the two things it has to be are:
// reachable at the smallest window the app opens, and no wider than the panel
// it is in — which is exactly what W36 item 4 was about for the faders above
// it.
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { openShot, insideViewport, noSidewaysScroll } from "./fits";

const OUT = path.resolve(process.cwd(), ".w37-shots");

/** The owner's window, and the smallest one the app opens. */
const WINDOWS = [
  { name: "the owner's window", width: 2000, height: 1124 },
  { name: "the smallest window", width: 480, height: 780 },
];

test.slow();

test.beforeAll(() => {
  fs.mkdirSync(OUT, { recursive: true });
});

for (const size of WINDOWS) {
  test(`the drums choice is reachable and fits at ${size.name}`, async ({ page }) => {
    await openShot(page, "songs", size, "ember");
    await page.locator(".songs-more-chip").click();
    await expect(page.locator(".songs-more-pop")).toHaveCount(1);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    const choice = page.locator(".songs-band-drums");
    await expect(
      choice,
      "the file has a drum track and no way to choose whose kit plays it",
    ).toHaveCount(1);
    await choice.scrollIntoViewIfNeeded();

    // Both answers are there, and exactly one of them is in force.
    await expect(page.locator(".songs-band-drums-btn")).toHaveCount(2);
    await expect(page.locator('.songs-band-drums-btn[aria-pressed="true"]')).toHaveCount(1);

    await insideViewport(page, ".songs-band-drums", "the drums choice", size);
    await insideViewport(page, ".songs-band-drums-btn", "a drums button", size);
    await noSidewaysScroll(page, "the drums choice");

    // And it does not push itself out of the panel it lives in, which is the
    // failure the band's own faders had at this width (W36 item 4).
    const fits = await page.evaluate(() => {
      const pop = document.querySelector(".songs-more-pop") as HTMLElement | null;
      const row = document.querySelector(".songs-band-drums") as HTMLElement | null;
      if (!pop || !row) return null;
      const p = pop.getBoundingClientRect();
      const r = row.getBoundingClientRect();
      return { over: Math.max(0, r.right - p.right), under: Math.max(0, p.left - r.left) };
    });
    expect(fits, "the panel or the row went missing").not.toBeNull();
    expect(fits!.over, "the drums choice is wider than the panel").toBeLessThanOrEqual(1);
    expect(fits!.under).toBeLessThanOrEqual(1);

    await page.screenshot({ path: path.join(OUT, `drums-choice-${String(size.width)}.png`) });

    // Pressing the other one takes. It re-reads the file and loads the piece
    // again, which is why this is a press rather than a sweep.
    //
    // Pinned by INDEX before the press, not by `:not([aria-pressed="true"])`:
    // that selector re-resolves the moment the press lands, so it would end
    // up naming whichever button is un-pressed AFTERWARDS — which is the one
    // that was just turned off.
    const pressed = await page.evaluate(() =>
      [...document.querySelectorAll(".songs-band-drums-btn")].findIndex(
        (b) => b.getAttribute("aria-pressed") === "true",
      ),
    );
    expect(pressed, "neither answer was in force").toBeGreaterThanOrEqual(0);
    const other = page.locator(".songs-band-drums-btn").nth(pressed === 0 ? 1 : 0);
    await other.click();
    await expect(other).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".songs-band-drums-btn").nth(pressed)).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await expect(page.locator('.songs-band-drums-btn[aria-pressed="true"]')).toHaveCount(1);
  });
}
