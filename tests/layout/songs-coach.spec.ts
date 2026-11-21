/**
 * The coach on Songs (c5a2; DESIGN 3.1's Songs row, 3.2; judgement call 19).
 *
 * - The verdict after a pass is the Session's coach note: the sentence as its
 *   headline, "Measured" under it, one fact line; the fix's button under the
 *   note, inside the pinned head.
 * - Ask docks on Songs from 1160 px (it already mounted there; this measures it
 *   rather than building it): the tab stage and the review beside the dock, not
 *   under it, their controls pressable; a drawer over the content at 1024.
 *
 * Pictures only when `YAMES_SHOT_DIR` names a folder.
 */
import { test, expect, type Page } from "@playwright/test";
import { openShot, settleAnimations, notHitTestable, noSidewaysScroll, MOBILE_URL } from "./fits";

const SHOTS_DIR = process.env.YAMES_SHOT_DIR;
async function shot(page: Page, name: string) {
  if (SHOTS_DIR) await page.screenshot({ path: `${SHOTS_DIR}/${name}.png` });
}

type R = { left: number; right: number; top: number; bottom: number; width: number; height: number };
async function rect(page: Page, sel: string): Promise<R | null> {
  return page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
}

async function openFromRail(page: Page) {
  await page.locator(".rail-footer .rail-action").first().click();
  await expect(page.locator(".ask-panel")).toBeVisible();
  await settleAnimations(page);
  await page.waitForTimeout(260);
}

/** The note, whole, inside the review's pinned head, the fix's button under it. */
async function noteHolds(page: Page, where: string) {
  const note = page.getByTestId("songs-note");
  await expect(note, where).toBeVisible();
  await expect(note).toHaveAttribute("data-kind", "song");
  await expect(note.locator(".coach-block-source"), `${where}: the source line`).toContainText("Measured");
  await expect(note.getByTestId("coach-facts"), `${where}: the fact line`).toBeVisible();
  const head = (await rect(page, ".songs-review-head"))!;
  const n = (await rect(page, '[data-testid="songs-note"]'))!;
  const fix = (await rect(page, ".songs-review-said .coach-block-button"))!;
  expect(fix, `${where}: the fix`).not.toBeNull();
  expect(n.left, `${where}: note left`).toBeGreaterThanOrEqual(head.left - 0.5);
  expect(n.right, `${where}: note right`).toBeLessThanOrEqual(head.right + 0.5);
  expect(fix.top, `${where}: the fix under the note`).toBeGreaterThanOrEqual(n.bottom - 0.5);
  expect(fix.bottom, `${where}: the fix in the window`).toBeLessThanOrEqual(page.viewportSize()!.height + 0.5);
  // Text wraps and is never cut.
  const cut = await page.locator('[data-testid="songs-note"] .coach-note-head').evaluate((el) => {
    const s = getComputedStyle(el);
    return el.scrollWidth > el.clientWidth + 1 || s.whiteSpace === "nowrap" || s.textOverflow === "ellipsis";
  });
  expect(cut, `${where}: the headline is cut`).toBe(false);
  expect(await notHitTestable(page, ".songs-review-said .coach-block-button, .songs-review-back"), where).toEqual([]);
}

/** Songs' content beside the dock, never under it. */
async function besideTheDock(page: Page, where: string, sel: string) {
  const panel = (await rect(page, ".ask-panel"))!;
  const content = (await rect(page, ".main-content"))!;
  expect(content.right, `${where}: the content ends where the dock starts`).toBeLessThanOrEqual(panel.left + 0.5);
  const it = (await rect(page, sel))!;
  expect(it, `${where}: ${sel}`).not.toBeNull();
  expect(it.right, `${where}: ${sel} under the dock`).toBeLessThanOrEqual(panel.left + 0.5);
}

test.describe("the Songs verdict in the coach's note", () => {
  for (const theme of ["ember", "manuscript"]) {
    test(`after a pass at 1440x900 with the dock open, in ${theme}`, async ({ page }) => {
      await openShot(page, "songs-review-rushing", { width: 1440, height: 900 }, theme);
      await openFromRail(page);
      await noteHolds(page, `1440 dock ${theme}`);
      await besideTheDock(page, `1440 ${theme}`, ".songs-review");
      await noSidewaysScroll(page, "Songs");
      await shot(page, `songs-note-1440-dock-${theme}`);
    });
  }

  test("after a pass at 1024x700, no dock", async ({ page }) => {
    await openShot(page, "songs-review-rushing", { width: 1024, height: 700 }, "ember");
    await noteHolds(page, "1024");
    await noSidewaysScroll(page, "Songs");
    await shot(page, "songs-note-1024-ember");
  });

  test("after a pass in Russian at 1024x700: wraps, never cut", async ({ page }) => {
    await openShot(page, "songs-review-rushing", { width: 1024, height: 700 }, "ember", { lng: "ru" });
    const note = page.getByTestId("songs-note");
    await expect(note).toBeVisible();
    const cut = await page.locator('[data-testid="songs-note"] .coach-note-head').evaluate(
      (el) => el.scrollWidth > el.clientWidth + 1,
    );
    expect(cut).toBe(false);
    await noSidewaysScroll(page, "Songs");
    await shot(page, "songs-note-1024-ru");
  });
});

test.describe("Ask's dock on Songs (measured, judgement call 19)", () => {
  for (const width of [1160, 1440, 1920]) {
    test(`the dock at ${width}: the tab stage beside it, its controls pressable`, async ({ page }) => {
      await openShot(page, "songs", { width, height: 900 }, "ember");
      await openFromRail(page);
      expect(await page.evaluate(() => getComputedStyle(document.querySelector(".ask-panel")!).position)).not.toBe("absolute");
      await besideTheDock(page, `songs ${width}`, ".songs-tab-viewport");
      expect(await notHitTestable(page, ".songs-strip button, .songs-view-controls button"), `songs ${width}`).toEqual([]);
      await noSidewaysScroll(page, "Songs");
      await shot(page, `songs-dock-${width}`);
    });
  }

  test("the drawer at 1024: over the content, Songs' layout unchanged under it", async ({ page }) => {
    await openShot(page, "songs", { width: 1024, height: 768 }, "ember");
    const before = (await rect(page, ".songs-tab-viewport"))!;
    await openFromRail(page);
    const after = (await rect(page, ".songs-tab-viewport"))!;
    // A drawer floats: the stage is not re-laid out underneath it.
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);
    await noSidewaysScroll(page, "Songs");
    await shot(page, "songs-drawer-1024");
  });
});

test.describe("the Songs note on a phone", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });
  test("after a pass at 360x800: the note and the fix on screen, the line no target", async ({ page }) => {
    await openShot(page, "phone-songs-review-rushing", { width: 360, height: 800 }, "ember");
    await noteHolds(page, "phone 360");
    // A phone's Ask is the header's button: the sentence is not one.
    await expect(page.getByTestId("coach-note-ask")).toHaveCount(0);
    await noSidewaysScroll(page, "Songs");
    await shot(page, "phone-songs-note-360");
  });
});
