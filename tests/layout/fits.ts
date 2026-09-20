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
  //
  // `playwright.config.ts` now starts a server of its own on a port derived
  // from this checkout and never reuses one, so this should be unreachable —
  // it stays because the failure it describes cost an afternoon twice.
  await page
    .waitForFunction(() => typeof window.__SHOT_MANIFEST__ === "object", undefined, {
      timeout: 15_000,
    })
    .catch(() => {
      const origin = new URL(page.url()).origin;
      throw new Error(
        `${origin} is not the Yames screenshot harness — something else answered for the "${shot}" scene. Stop whatever is on that port and run again.`,
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

/**
 * Every element matching `selector` is inside the window, on all four sides.
 *
 * The question none of the 107 tests in this folder asked, and the one that
 * cost W18 a task: they all measured whether a thing fitted its PARENT, and a
 * row fits its parent perfectly while the parent sits 28px below the bottom of
 * the window. Measured at 1400×900 on 2026-09-20, the Songs band's faders
 * started at y=928 and the verdict at y=1075 — both a scroll away, both green.
 *
 * Parts a layout chooses not to draw measure zero and are skipped: a control
 * a container query has hidden is not off-screen, it is not there.
 */
export async function insideViewport(
  page: Page,
  selector: string,
  where: string,
  size: { width: number; height: number },
) {
  const boxes = await page.$$eval(selector, (nodes) =>
    nodes.map((node) => {
      const r = node.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        what: (node.className || node.tagName).toString().slice(0, 60),
      };
    }),
  );
  expect(boxes.length, `${where}: nothing matched ${selector}`).toBeGreaterThan(0);

  for (const box of boxes) {
    if (box.right - box.left === 0 && box.bottom - box.top === 0) continue;
    expect(
      Math.round(box.top),
      `${where}: "${box.what}" starts at y=${Math.round(box.top)}, above the window`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      Math.round(box.bottom),
      `${where}: "${box.what}" ends at y=${Math.round(box.bottom)}, past the window's ${size.height} — it is under the fold`,
    ).toBeLessThanOrEqual(size.height + 1);
    expect(
      Math.round(box.left),
      `${where}: "${box.what}" starts at x=${Math.round(box.left)}, off the left`,
    ).toBeGreaterThanOrEqual(-1);
    expect(
      Math.round(box.right),
      `${where}: "${box.what}" ends at x=${Math.round(box.right)}, past the window's ${size.width}`,
    ).toBeLessThanOrEqual(size.width + 1);
  }
}

/**
 * Inside `root`, only the elements named in `allowed` may scroll.
 *
 * A scroller inside a scroller is the shape of the bug: the Songs tab had its
 * own 520px viewport, inside a stage that also scrolled, inside a window — so
 * the wheel did something different depending on which pixel the pointer was
 * over, and half the screen was reachable only by the outer one. Naming the
 * few boxes that are ALLOWED to scroll is the only way to say that; asking
 * "does the window scroll" misses every scroller between.
 *
 * Only boxes that can ACTUALLY scroll count, which means `overflow: auto` or
 * `scroll` on the axis. Content bigger than an `overflow: visible` box simply
 * spills — that is a different bug and `insideViewport` is what catches it —
 * and `overflow: hidden` is a box with no bar and no wheel. Without this the
 * first thing every run reported was `.sr-only`, which is a 1×1 clipped span
 * holding a whole sentence, three times per fader.
 *
 * Two pixels of slack: a sub-pixel border or a rounded line height can leave
 * `scrollHeight` one greater than `clientHeight` on a box nobody can scroll.
 */
export async function onlyTheseScroll(
  page: Page,
  root: string,
  allowed: string[],
  where: string,
) {
  const rogue = await page.evaluate(
    ({ root, allowed }) => {
      const host = document.querySelector(root);
      if (!host) return null;
      const out: { what: string; over: number; how: "down" | "across" }[] = [];
      const scrolls = (value: string) => value === "auto" || value === "scroll";
      for (const el of [host, ...host.querySelectorAll("*")]) {
        if (allowed.some((sel) => el.matches(sel) || el.closest(sel))) continue;
        const style = getComputedStyle(el);
        const down = el.scrollHeight - el.clientHeight;
        const across = el.scrollWidth - el.clientWidth;
        const what = (el.className || el.tagName).toString().slice(0, 60);
        if (down > 2 && scrolls(style.overflowY)) out.push({ what, over: down, how: "down" });
        if (across > 2 && scrolls(style.overflowX)) out.push({ what, over: across, how: "across" });
      }
      return out;
    },
    { root, allowed },
  );
  expect(rogue, `${where}: nothing matched ${root}`).not.toBeNull();
  expect(
    rogue!.map((r) => `"${r.what}" scrolls ${r.how} by ${Math.round(r.over)}px`),
    `${where}: only ${allowed.join(", ")} may scroll`,
  ).toEqual([]);
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
