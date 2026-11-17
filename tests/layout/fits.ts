import { expect, type Page } from "@playwright/test";
import { MOBILE_ORIGIN } from "../../playwright.config";

/**
 * The language every scene in this run is built in.
 *
 * `YAMES_LAYOUT_LOCALE=de npm run test:layout` measures the German build.
 * English is the default because it is the shortest of the fifteen and a
 * suite that only ever passed in the longest one would be a suite nobody
 * ran. "Does it fit" is a different question per locale: German runs about a
 * third longer than English, Russian longer again, and a rail label or a
 * fader name that fits at 480px in English can leave the window in either.
 *
 * Scenes are built through the harness's own `?lng=`, which fails the scene
 * outright on a tag it does not have — a run that silently fell back to
 * English would pass while measuring nothing.
 */
export const LAYOUT_LOCALE = process.env.YAMES_LAYOUT_LOCALE ?? "en";

/** True when this run is measuring English, and may assert on English words. */
export const IN_ENGLISH = LAYOUT_LOCALE === "en";

/**
 * The harness, built for a phone (M09).
 *
 * A second Vite server, started by `playwright.config.ts` with
 * `YAMES_MOBILE=1`, because `IS_MOBILE` is a build-time constant and the
 * phone's layout hangs off the `.main-window.is-mobile` class that constant
 * writes — a desktop build dragged to 360px is a different app with a rail in
 * it. A describe block opts in with:
 *
 *     test.use({ baseURL: MOBILE_URL, viewport: { width: 360, height: 800 },
 *                isMobile: true, hasTouch: true });
 *
 * `isMobile` + `hasTouch` are what make the page match `(pointer: coarse)`
 * and `(hover: none)`, which is where every 44px touch target lives.
 */
export const MOBILE_URL = MOBILE_ORIGIN;

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
  /**
   * Anything else the harness reads off its own query string.
   *
   * `{ song: "long" }` is the only user so far: the Songs scenes pick which
   * of the written-for-the-pictures songs is on the stage from `?song=`, and
   * a question about a page taller than the frame cannot be asked of the
   * eight-bar one (W34 item 5).
   */
  query: Record<string, string> = {},
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
  const extra = Object.entries(query)
    .map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("");
  await page.goto(
    `/shots.html?shot=${shot}&theme=${theme}&window=main&lng=${LAYOUT_LOCALE}${extra}`,
  );

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

  // Bounded by the test's own timeout, not a fixed 30 s: a scene that plays
  // Takes in real time (Find my edge, four of them, with the neck stage
  // drawing) is marked slow by its spec and needs the room.
  await page.waitForFunction(
    () => window.__SHOT_READY__ === true || typeof window.__SHOT_ERROR__ === "string",
    undefined,
    { timeout: 0 },
  );
  const failed = await page.evaluate(() => window.__SHOT_ERROR__);
  expect(failed, `the "${shot}" scene did not build`).toBeUndefined();

  // And it is in the language this run asked for. A locale run that quietly
  // fell back to English would report a clean suite having measured nothing.
  const built = await page.evaluate(() => window.__SHOT_LOCALE__);
  expect(built, `the "${shot}" scene was built in ${built}, not ${LAYOUT_LOCALE}`).toBe(
    LAYOUT_LOCALE,
  );

  if (size.width !== BUILD_AT.width || size.height !== BUILD_AT.height) {
    await page.setViewportSize(size);
    // One frame for the media queries to restyle, one for the compositor.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
  }
}

/**
 * The whole page's language, switched through Settings → General → the
 * dropdown — the door a person uses, and the one `scripts/mobile-shots.mjs`
 * drives for its `--locale` runs. The list names each language in its own
 * words, so the option is found by that name rather than by the code.
 *
 * Phone builds only: it presses the bottom bar's Settings tab, and presses it
 * again to come back to the tab the test started on.
 */
export const NATIVE_NAME: Record<string, string> = {
  de: "Deutsch",
  ja: "\u65e5\u672c\u8a9e",
  "pt-BR": "Portugu\u00eas (Brasil)",
  ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
};

export async function switchLanguage(page: Page, code: string) {
  const name = NATIVE_NAME[code];
  if (!name) throw new Error(`no native name on file for "${code}"`);
  const settings = '.mobile-tab[data-tab="settings"]';
  await page.click(settings);
  await page.waitForSelector(".settings-section");
  await page.click(".lang-select-btn");
  await page.waitForSelector(".lang-options");
  await page.getByText(name, { exact: true }).first().click();
  // Back to the tab the test came from.
  await page.click(settings);
  await page.waitForSelector(".main-header");
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
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
    __SHOT_LOCALE__?: string;
  }
}

/**
 * Open one of the tools on a phone (M7): the bottom bar carries the places —
 * Today, Paths, Progress, Tools, Settings — and the tools are cards on the
 * Tools screen, the way the rail nests them under Tools on a desktop.
 */
export async function openTool(page: Page, id: "beat" | "drill" | "setlist" | "jam" | "songs") {
  await page.click('.mobile-tab[data-tab="tools"]');
  await page.click(`[data-testid="tool-card-${id}"]`);
}

/**
 * Let the learning side's entrance animations (`.session-rise`, `.session-fade`)
 * land, so a measurement sees where things rest rather than where they rise
 * from.
 */
export async function settleAnimations(page: Page) {
  await page.evaluate(async () => {
    for (const a of document.getAnimations()) {
      if (a instanceof CSSAnimation && /^session-/.test(a.animationName)) {
        try {
          a.finish();
        } catch {
          // An infinite one (a pulse) cannot finish, and is not an entrance.
        }
      }
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
}

/**
 * Pairs of blocks on a learning screen that are drawn over each other (QA
 * 2026-11-17 #1, #2, #5): text, cards, controls and the neck's slot. One that
 * holds the other is nesting, not an overlap; a hidden one is not drawn. A
 * few pixels of touch are let through: a card's shadow, a tag's border.
 */
export async function overlapping(page: Page, root = ".session-page"): Promise<string[]> {
  await settleAnimations(page);
  return page.evaluate((rootSel) => {
    const scope = document.querySelector(rootSel);
    if (!scope) return [`no ${rootSel}`];
    const sel = [
      "button",
      "h1",
      "h2",
      "h3",
      ".session-kick",
      ".session-why",
      ".session-glass",
      ".session-slot",
      ".session-stat",
      ".session-moved",
      ".session-bpm",
      ".session-tag",
      ".session-chart",
      "svg",
    ].join(",");
    const els = [...scope.querySelectorAll<HTMLElement>(sel)].filter((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      for (let e: HTMLElement | null = el; e; e = e.parentElement) {
        const cs = getComputedStyle(e);
        if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
      }
      // Drawn inside something that owns its own picture (a chart's labels).
      return !el.closest("svg") || el.tagName.toLowerCase() === "svg";
    });
    const name = (el: Element) =>
      `${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ")[0]} "${(el.textContent ?? "").trim().slice(0, 24)}"`;
    // What is drawn of a block: its box, cut by every ancestor that clips
    // (the tab panel's surfaces run on past their panel, out of sight).
    const drawn = (el: HTMLElement) => {
      const r = el.getBoundingClientRect();
      let { left, right, top, bottom } = r;
      for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
        // Hidden or clipped only: a scroller's content is still there to be
        // scrolled to, and an overlap below the fold is still an overlap.
        if (!/hidden|clip/.test(getComputedStyle(e).overflow)) continue;
        const c = e.getBoundingClientRect();
        left = Math.max(left, c.left);
        right = Math.min(right, c.right);
        top = Math.max(top, c.top);
        bottom = Math.min(bottom, c.bottom);
      }
      return { left, right, top, bottom };
    };
    const out: string[] = [];
    const SLACK = 3;
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i];
        const b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = drawn(a);
        const rb = drawn(b);
        const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (w > SLACK && h > SLACK) out.push(`${name(a)} × ${name(b)} (${Math.round(w)}×${Math.round(h)})`);
      }
    }
    return out;
  }, root);
}

/**
 * Whether a thumb or a pointer at the middle of each control reaches it: the
 * element on top at its centre is the control or inside it (QA #1: the neck's
 * slot took the tap meant for "Play this").
 */
export async function notHitTestable(page: Page, selector: string): Promise<string[]> {
  await settleAnimations(page);
  return page.evaluate((sel) => {
    const out: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(sel)) {
      if (el.getBoundingClientRect().width === 0) continue;
      el.scrollIntoView({ block: "center", behavior: "instant" });
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const top = document.elementFromPoint(x, y);
      if (!top || !(top === el || el.contains(top))) {
        out.push(
          `"${(el.textContent ?? "").trim().slice(0, 30)}" at ${Math.round(x)},${Math.round(y)} is under ${
            top ? `${top.tagName.toLowerCase()}.${String(top.getAttribute("class") ?? "").split(" ")[0]}` : "nothing"
          }`,
        );
      }
    }
    return out;
  }, selector);
}
