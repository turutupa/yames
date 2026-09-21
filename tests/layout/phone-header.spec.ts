import { test, expect, type Page } from "@playwright/test";
import { openShot, MOBILE_URL } from "./fits";

/**
 * The bar above the stage, on a phone (M09).
 *
 * It is 48px tall and everything in it is 44: the touch pass gave every chip
 * and every text button a 44px minimum, which is the size of a fingertip. The
 * bar was 40, so the sound chip, the volume chip, the overflow and Save were
 * all drawn two pixels above the top of the screen with their top border cut
 * off, on every tab — a thing no unit test can see, because happy-dom gives
 * every one of those boxes the same zero height.
 *
 * The second half is the one a screenshot cannot show either: a real phone
 * pushes `--safe-top` in from Kotlin (M05b), and the bar has to end up below
 * the status bar rather than under it. That is `.main-window`'s padding, so
 * the test sets the token and measures where the bar lands.
 */
const PHONES = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

/** Every control in the bar, both halves of it. */
const BAR_CONTROLS = ".main-header .header-context > *, .main-header .header-actions > *";

test.describe("the phone's top bar", () => {
  test.use({ baseURL: MOBILE_URL, isMobile: true, hasTouch: true });

  for (const size of PHONES) {
    test(`draws its controls inside itself at ${size.width}px`, async ({ page }) => {
      // The metronome tab: a name and a Save button on the left, three chips
      // on the right, which is the fullest this bar ever is.
      await openShot(page, "metronome", size);

      const boxes = await page.$$eval(BAR_CONTROLS, (nodes) => {
        const bar = document.querySelector(".main-header")!.getBoundingClientRect();
        return nodes
          .map((n) => {
            const r = n.getBoundingClientRect();
            return {
              top: r.top,
              bottom: r.bottom,
              barTop: bar.top,
              barBottom: bar.bottom,
              what: (n.getAttribute("class") || n.tagName).slice(0, 40),
            };
          })
          .filter((b) => b.bottom > b.top);
      });
      expect(boxes.length, "nothing in the bar to measure").toBeGreaterThan(1);

      for (const box of boxes) {
        expect(
          Math.round(box.top),
          `"${box.what}" starts at ${Math.round(box.top)}, above the bar's ${Math.round(box.barTop)}`,
        ).toBeGreaterThanOrEqual(Math.round(box.barTop));
        expect(
          Math.round(box.bottom),
          `"${box.what}" ends at ${Math.round(box.bottom)}, below the bar's ${Math.round(box.barBottom)}`,
        ).toBeLessThanOrEqual(Math.round(box.barBottom));
        // And nothing is off the top of the screen, which is what the cut
        // borders actually were.
        expect(Math.round(box.top), `"${box.what}" is off the top of the screen`).toBeGreaterThanOrEqual(0);
      }
    });
  }

  test("shows the jam's name rather than fragments of a chip", async ({ page }) => {
    // At 360 the jam bar was a JAM badge, a vibe chip and a name squeezed to
    // nothing, with clipped letters of both showing between the volume and
    // the overflow ("C", "sl"). The name is what the bar is for.
    await openShot(page, "jam", { width: 360, height: 800 });

    const name = await page.$(".jam-save-area .preset-active-name");
    expect(name, "no jam name in the bar").toBeTruthy();
    const box = (await name!.boundingBox())!;
    expect(Math.round(box.width), "the jam's name has no width").toBeGreaterThan(80);

    // The two that were being clipped are not drawn at all on a phone.
    expect(await page.$(".jam-save-area .jam-badge:visible"), "the JAM badge is still drawn").toBeNull();
    expect(await page.$(".jam-save-area .jam-vibe-chip:visible"), "the vibe chip is still drawn").toBeNull();
  });

  test("sits below the status bar when the phone reports one", async ({ page }) => {
    /*
     * `--safe-top` is 0 in any browser: there is no notch to report. On a
     * phone the Kotlin side measures the status bar and writes it in (M05b),
     * and `.main-window` pads by it — so the whole content region, this bar
     * included, starts below it. Setting the token is the only way to check
     * that here, and it is worth checking: a bar that ends up UNDER the
     * status bar is unreadable and untappable at the same time.
     */
    await openShot(page, "metronome", { width: 360, height: 800 });
    const inset = 48;
    await page.evaluate((px) => {
      document.documentElement.style.setProperty("--safe-top", `${px}px`);
    }, inset);
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );

    const bar = (await (await page.waitForSelector(".main-header")).boundingBox())!;
    expect(Math.round(bar.y), "the bar is drawn under the status bar").toBeGreaterThanOrEqual(inset);

    const tops = await page.$$eval(BAR_CONTROLS, (nodes) =>
      nodes.map((n) => n.getBoundingClientRect().top).filter((t) => t > 0),
    );
    expect(tops.length, "nothing in the bar to measure").toBeGreaterThan(1);
    expect(Math.round(Math.min(...tops)), "a control is drawn under the status bar")
      .toBeGreaterThanOrEqual(inset);
  });

  test("says what is on the stage rather than which tab you are on", async ({ page }) => {
    /*
     * M12. At 360 the metronome tab's bar said "Unsaved metr…" — a sentence
     * cut in half to name the mode, on a screen whose lit tab names it. The
     * phone build says one word; the noun stays on the desktop, which has the
     * room for it.
     */
    await openShot(page, "metronome", { width: 360, height: 800 });
    const name = await page.waitForSelector(".preset-save-area .preset-active-name");
    expect((await name.textContent())?.trim(), "the bar still names the mode").toBe("Unsaved");
    expect(await isClipped(page, ".preset-save-area .preset-active-name")).toBe(false);
  });

  test("gives the routine's name the room the badge and the caption took", async ({ page }) => {
    /*
     * M12. The setlist tab at 360 read `D  [SETLIST]  No changes`: the name
     * cut to its initial, a badge repeating the lit tab, and a caption saying
     * nothing had happened. Both of the last two are gone on a phone.
     */
    await openSetlist(page, { width: 360, height: 800 });

    const name = await page.waitForSelector(".setlist-save-area .preset-active-name");
    const box = (await name.boundingBox())!;
    expect(Math.round(box.width), "the setlist's name has no width").toBeGreaterThan(80);
    expect((await name.textContent())?.trim()).toBe("Daily routine");
    expect(await isClipped(page, ".setlist-save-area .preset-active-name")).toBe(false);

    expect(
      await page.$(".setlist-save-area .setlist-badge:visible"),
      "the SETLIST badge is still drawn",
    ).toBeNull();
    expect(
      await page.$(".setlist-save-area .preset-text-btn--save:visible"),
      'the bar still says "No changes" when there is nothing to save',
    ).toBeNull();
  });

  /*
   * A name longer than the bar, in the three locales whose words are longest
   * (M12). Whatever it is called, it ellipsises inside its own box; it never
   * pushes the volume control or the overflow off the bar.
   *
   * The name is user data, so it is written straight into the element rather
   * than typed through the rename flow: what is under test is the box it is
   * drawn in, and that box is the app's own.
   */
  const LONG_NAME = "Wednesday evening warm-up, then the slow blues in A minor";

  for (const locale of ["de", "ru", "ja"] as const) {
    for (const size of PHONES) {
      test(`keeps a long name in its own box at ${size.width}px in ${locale}`, async ({ page }) => {
        await openShot(page, "metronome", size);
        await switchLanguage(page, locale);

        // The placeholder first: it is the one string in this bar the locale
        // decides, and in German it is three times the length of the English.
        const placeholder = await page.waitForSelector(
          ".preset-save-area .preset-active-name--unsaved",
        );
        expect((await placeholder.textContent())?.trim().length, "no placeholder").toBeGreaterThan(0);
        await expectBarIntact(page, `${locale} @ ${size.width}, placeholder`);

        await page.$eval(
          ".preset-save-area .preset-active-name",
          (el, text) => {
            el.textContent = text;
          },
          LONG_NAME,
        );
        await page.evaluate(
          () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
        );

        expect(
          await isClipped(page, ".preset-save-area .preset-active-name"),
          "a name too long for the bar is not being cut with an ellipsis",
        ).toBe(true);
        await expectBarIntact(page, `${locale} @ ${size.width}, long name`);
      });
    }
  }
});

/**
 * The setlist tab with a routine on it — the library sheet, then its row.
 *
 * The sheet is left open: it covers the stage, never the bar above it, and
 * the tab that opened it is under the sheet's own layer, so pressing that tab
 * again is a click the sheet intercepts.
 */
async function openSetlist(page: Page, size: { width: number; height: number }) {
  await openShot(page, "metronome", size);
  await page.click('.mobile-tab[data-tab="setlist"]');
  await page.click(".mobile-tab-library");
  await page.waitForSelector(".sheet--library");
  await page.click(".preset-sidebar-item.setlist-item");
  await page.waitForSelector(".setlist-paragraph");
}

/**
 * The whole page's language, through Settings → General → the dropdown — the
 * door a person uses, and the one `scripts/mobile-shots.mjs` drives for its
 * `--locale` runs. The list names each language in its own words, so the
 * option is found by that name rather than by the code.
 */
const NATIVE_NAME: Record<string, string> = {
  de: "Deutsch",
  ru: "\u0420\u0443\u0441\u0441\u043a\u0438\u0439",
  ja: "\u65e5\u672c\u8a9e",
};

async function switchLanguage(page: Page, code: keyof typeof NATIVE_NAME | string) {
  const settings = '.mobile-tab[data-tab="settings"]';
  await page.click(settings);
  await page.waitForSelector(".settings-section");
  await page.click(".lang-select-btn");
  await page.waitForSelector(".lang-options");
  await page.getByText(NATIVE_NAME[code], { exact: true }).first().click();
  // Back to the tab the test came from.
  await page.click(settings);
  await page.waitForSelector(".main-header");
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
}

/** Is this element's text being cut off with an ellipsis? */
async function isClipped(page: Page, selector: string) {
  return page.$eval(selector, (el) => el.scrollWidth > el.clientWidth + 1);
}

/**
 * Nothing in the bar's right-hand half has been pushed off the screen, and
 * the left half has not run into it. This is the failure the name is allowed
 * to prevent by ellipsising, and the one it must never cause.
 */
async function expectBarIntact(page: Page, where: string) {
  const measured = await page.evaluate(() => {
    const bar = document.querySelector(".main-header")!.getBoundingClientRect();
    const actions = [...document.querySelectorAll(".main-header .header-actions > *")].map((n) => {
      const r = n.getBoundingClientRect();
      return { left: r.left, right: r.right, what: (n.getAttribute("class") || n.tagName).slice(0, 40) };
    });
    const nameEl = document.querySelector(".main-header .preset-active-name");
    const name = nameEl ? nameEl.getBoundingClientRect().right : null;
    return { bar: { left: bar.left, right: bar.right }, actions, name, vw: window.innerWidth };
  });

  expect(measured.actions.length, `${where}: nothing in the bar's right half`).toBeGreaterThan(1);
  for (const control of measured.actions) {
    expect(
      Math.round(control.right),
      `${where}: "${control.what}" ends at ${Math.round(control.right)}, past the screen's ${measured.vw}`,
    ).toBeLessThanOrEqual(measured.vw);
    expect(
      Math.round(control.left),
      `${where}: "${control.what}" starts at ${Math.round(control.left)}, off the left of the bar`,
    ).toBeGreaterThanOrEqual(Math.round(measured.bar.left) - 1);
  }
  if (measured.name !== null) {
    const leftmost = Math.min(...measured.actions.map((c) => c.left));
    expect(
      Math.round(measured.name),
      `${where}: the name reaches ${Math.round(measured.name)}, over the first chip at ${Math.round(leftmost)}`,
    ).toBeLessThanOrEqual(Math.round(leftmost) + 1);
  }
}
