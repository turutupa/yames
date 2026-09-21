import { test, expect } from "@playwright/test";
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
});
