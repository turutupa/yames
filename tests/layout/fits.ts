import { expect, type Page } from "@playwright/test";

/**
 * Open one scene of the screenshot harness at one window size.
 *
 * `shots.html` is the same page the capture script drives: the real UI with a
 * mock IPC behind it, one scene per `?shot=`. It sets `__SHOT_READY__` when
 * the scene has settled — React committed, web fonts landed, two frames
 * painted — and `__SHOT_ERROR__` if the scene could not be built. Waiting on
 * the first and reading the second is the whole of the setup here: a test
 * that measured the page before the fonts arrived would be measuring the
 * fallback stack, which is a different set of widths.
 */
export async function openShot(
  page: Page,
  shot: string,
  size: { width: number; height: number },
  theme = "ember",
) {
  /*
   * Built wide, then narrowed to the size under test.
   *
   * The harness loads a jam the way a person does — by clicking a row in the
   * library — and below about 900px the rail collapses and there is no
   * library to click, so a scene opened straight at 520px never finishes
   * building ("timed out waiting for the jam library"). Narrowing afterwards
   * is also the truer test: a window is a thing people drag, and the layout
   * has to survive being dragged, not only being born small.
   */
  const BUILD_AT = { width: 1440, height: Math.max(size.height, 900) };
  await page.setViewportSize(BUILD_AT);
  await page.goto(`/shots.html?shot=${shot}&theme=${theme}&window=main`);

  // That the page is the harness at all, before waiting thirty seconds for it
  // to say it is ready. The first run of this suite met a dev server for
  // another app on the port it asked for, and "timed out waiting for
  // __SHOT_READY__" is a poor way to be told you are looking at the wrong
  // website.
  await page
    .waitForFunction(() => typeof window.__SHOT_MANIFEST__ === "object", undefined, {
      timeout: 15_000,
    })
    .catch(() => {
      throw new Error(
        `http://localhost:5390 is not the Yames screenshot harness — the page that answered is "${shot}" on some other server. Stop whatever is on port 5390 and run again.`,
      );
    });

  await page.waitForFunction(
    () => window.__SHOT_READY__ === true || typeof window.__SHOT_ERROR__ === "string",
    undefined,
    { timeout: 30_000 },
  );
  const failed = await page.evaluate(() => window.__SHOT_ERROR__);
  expect(failed, `the "${shot}" scene did not build`).toBeUndefined();

  if (size.width !== BUILD_AT.width || size.height !== BUILD_AT.height) {
    await page.setViewportSize(size);
    // One frame for the media queries to restyle, one for the compositor.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  }
}

/** A box in page pixels, rounded the way a reader's eye rounds it. */
export type Box = { left: number; right: number; top: number; bottom: number; text: string };

/**
 * Where everything inside `selector` sits, one entry per child element.
 *
 * Measured in the browser rather than reasoned about from the stylesheet: the
 * bug this file exists to catch was a correct-looking stylesheet whose rows
 * happened not to fit, and only the rectangles say that.
 */
export async function childBoxes(page: Page, selector: string): Promise<Box[]> {
  return page.$$eval(`${selector} > *`, (nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        text: (node.className || node.tagName).toString().slice(0, 60),
      };
    }),
  );
}

/**
 * Nothing inside `selector` sticks out of it, and nothing has been pushed
 * onto a second line.
 *
 * Both halves matter and they are different failures. The owner's report —
 * "the piano has more drop downs making the on off switch show up out of the
 * table" — was the first: a row whose contents ran past its own right edge.
 * The second version of the same bug was the other: a grid with one more
 * child than it had columns, which does not overflow at all, it silently
 * wraps, and the switch appears UNDER the row rather than beside it.
 *
 * One pixel of tolerance, because a border-box edge and a child's edge that
 * are meant to touch can land a fraction apart after scaling.
 */
export async function fitsOnOneLine(page: Page, selector: string, where: string) {
  const rows = await page.$$(selector);
  expect(rows.length, `${where}: nothing matched ${selector}`).toBeGreaterThan(0);

  for (const [i, row] of rows.entries()) {
    const box = (await row.boundingBox())!;
    const children = await row.evaluate((node) =>
      [...node.children].map((child) => {
        const r = child.getBoundingClientRect();
        return {
          left: r.left,
          right: r.right,
          top: r.top,
          bottom: r.bottom,
          what: (child.className || child.tagName).toString().slice(0, 60),
        };
      }),
    );

    for (const child of children) {
      // Parts a row chooses not to draw measure zero and are not on any line.
      if (child.right - child.left === 0 && child.bottom - child.top === 0) continue;

      expect(
        Math.round(child.right),
        `${where} row ${i + 1}: "${child.what}" ends at ${Math.round(child.right)}, past the row's ${Math.round(box.x + box.width)}`,
      ).toBeLessThanOrEqual(Math.round(box.x + box.width) + 1);

      expect(
        Math.round(child.left),
        `${where} row ${i + 1}: "${child.what}" starts at ${Math.round(child.left)}, before the row's ${Math.round(box.x)}`,
      ).toBeGreaterThanOrEqual(Math.round(box.x) - 1);

      // On one line: every part shares vertical space with the row's middle.
      const middle = box.y + box.height / 2;
      expect(
        child.top <= middle + 1 && child.bottom >= middle - 1,
        `${where} row ${i + 1}: "${child.what}" is on a second line (${Math.round(child.top)}–${Math.round(child.bottom)}, the row's middle is ${Math.round(middle)})`,
      ).toBe(true);
    }
  }
}

/** The window never scrolls sideways. A horizontal bar is always a mistake. */
export async function noSidewaysScroll(page: Page, where: string) {
  const overflow = await page.evaluate(() => {
    const el = document.scrollingElement ?? document.documentElement;
    return el.scrollWidth - el.clientWidth;
  });
  expect(overflow, `${where}: the window scrolls ${overflow}px sideways`).toBeLessThanOrEqual(1);
}

declare global {
  interface Window {
    __SHOT_READY__?: boolean;
    __SHOT_ERROR__?: string;
    __SHOT_MANIFEST__?: unknown;
  }
}
