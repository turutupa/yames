/**
 * The screenshot page.
 *
 * `shots.html?shot=drill&theme=ember` mounts the real app against a mock
 * backend, drives it into the state the shot wants, and then sets
 * `window.__SHOT_READY__` so the capture script knows it may photograph.
 *
 * This is not a mockup. Every pixel below the mock IPC boundary is the
 * shipping UI — same components, same stylesheets, same engine, since WebView2
 * and Edge are the same Chromium. On Windows the app runs frameless
 * (`set_decorations(false)` at startup; see TitleBar.tsx), so the titlebar and
 * the window buttons in these pictures are the app's own, not a browser's.
 */
import ReactDOM from "react-dom/client";
import App from "../App";
import "../i18n";
import "../styles/global.css";
import "../styles/session-narrative.css";
import { installShotMock } from "./mockIpc";
import { shotById, SHOTS, SHOT_THEMES } from "./scenarios";

declare global {
  interface Window {
    __SHOT_READY__?: boolean;
    __SHOT_ERROR__?: string;
    /** The shot list, for the capture script. See `?manifest=1` below. */
    __SHOT_MANIFEST__?: { themes: readonly string[]; shots: readonly unknown[] };
  }
}

const params = new URLSearchParams(window.location.search);

/**
 * `?manifest=1` — hand the shot list to the capture script and mount nothing.
 *
 * The script used to read scenarios.ts with a regex, which is how a comment
 * mentioning `height: 100vh` silently became a shot 100 pixels tall. This file
 * is the one that already imports the list; letting it say what the list is
 * removes the second reader, and with it the chance of the two disagreeing.
 */
window.__SHOT_MANIFEST__ = { themes: SHOT_THEMES, shots: SHOTS };
if (params.get("manifest")) {
  window.__SHOT_READY__ = true;
}

const shot = params.get("manifest") ? undefined : shotById(params.get("shot") ?? "metronome");
const theme = params.get("theme") ?? "ember";

if (!params.get("manifest") && !shot) {
  window.__SHOT_ERROR__ = `unknown shot "${params.get("shot")}" (have: ${SHOTS.map((s) => s.id).join(", ")})`;
  throw new Error(window.__SHOT_ERROR__);
}

if (shot) installShotMock(shot, theme);

/** Wait for `check` to hold, or give up and say what never happened. */
function until(what: string, check: () => boolean, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (check()) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error(`timed out waiting for ${what}`));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * The faces shots.html pulls from Google. A theme naming one of these as its
 * first choice must actually get it.
 *
 * Anything else in a theme's stack is a system font — 'Avenir Next', 'SF Mono'
 * — which is absent on Windows on purpose and falls back by design. Only a
 * *web* font going missing means the network failed and the picture is wrong.
 */
const WEB_FONTS = new Set([
  "Archivo", "Comfortaa", "Inter", "Nunito", "Outfit",
  "Orbitron", "Quicksand", "Rajdhani", "Source Serif 4",
]);

function assertThemeFontLoaded() {
  const stack = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-family")
    .trim();
  const first = stack.split(",")[0].trim().replace(/^['"]|['"]$/g, "");
  if (!WEB_FONTS.has(first)) return;
  if (!document.fonts.check(`16px "${first}"`)) {
    throw new Error(
      `the theme's font "${first}" did not load — the shot would be of the fallback stack`,
    );
  }
}

async function drive() {
  // The app is mounted once its own root element exists. For the widget that
  // is the pill; for the main window it is the frame the rail sits in.
  const root = shot!.window === "floating" ? ".floating-widget" : ".main-window";
  await until(root, () => !!document.querySelector(root));

  /**
   * A jam, loaded and part-way through its form.
   *
   * Driven by clicking, not by reaching into state: the library row and the
   * transport are the two things a person would press, and a shot taken
   * through any other door is a picture of a state the app cannot reach.
   */
  if (shot!.jam) {
    const rows = ".preset-sidebar-item.jam-item";
    await until("the jam library", () => document.querySelectorAll(rows).length > shot!.jam!.row);
    (document.querySelectorAll(rows)[shot!.jam!.row] as HTMLElement).click();
    await until("the jam stage", () => !!document.querySelector(".jam-view"));

    const wanted = shot!.jam.bar ?? 1;
    if (wanted > 1) {
      await until("the transport", () => !!document.querySelector(".transport-play"));
      (document.querySelector(".transport-play") as HTMLButtonElement).click();
      // The mock's beat loop runs at the jam's own tempo, so this is a real
      // wait of real bars rather than a number poked into a counter.
      // By the sentence, not by an nth-child: the cells are grouped into the
      // form's sections, so the fifth BAR is the first child of the second
      // group and `:nth-child(5)` would match bar one of every group.
      await until(
        `bar ${wanted} of the form`,
        () =>
          (document.querySelector(".jam-timeline-where")?.textContent ?? "").includes(
            `bar ${wanted} of`,
          ),
        30000,
      );
    }

    /**
     * The two docked sheets (JAM_UX_DECISIONS A1, A8).
     *
     * Opened through the context bar's own buttons, which is the only door a
     * person has. Everything that used to be on the stage — the grooves, the
     * key, the kit, the meter — is behind the first of them now, so most of
     * the jam shots below start here.
     */
    if (shot!.jam.sheet) {
      const wantedLabel = shot!.jam.sheet === "setup" ? "set up" : "chords";
      await until("the context bar", () => !!document.querySelector(".jam-sheet-btn"));
      const button = [...document.querySelectorAll<HTMLElement>(".jam-sheet-btn")].find(
        (b) => (b.textContent ?? "").trim().toLowerCase() === wantedLabel,
      );
      if (!button) throw new Error(`no "${wantedLabel}" button in the context bar`);
      button.click();
      await until(
        `the ${shot!.jam.sheet} sheet`,
        () => !!document.querySelector(`.jam-sheet[data-sheet="${shot!.jam!.sheet}"]`),
      );
    }

    if (shot!.jam.more) {
      await until("the MORE toggle", () => !!document.querySelector(".jam-more-toggle"));
      (document.querySelector(".jam-more-toggle") as HTMLElement).click();
      await until("the MORE block", () => !!document.querySelector(".jam-more-body"));
    }

    if (shot!.jam.chordCard !== undefined) {
      await until("the chord grid", () => !!document.querySelector(".jam-chord-card"));
      const cards = document.querySelectorAll<HTMLElement>(".jam-chord-card");
      cards[shot!.jam.chordCard].click();
      await until("the shapes row", () => !!document.querySelector(".jam-chord-shapes"));
    }

    if (shot!.jam.meter) {
      // The meter buttons are inside MORE on the setup sheet.
      await until("the meter control", () => !!document.querySelector(".jam-meters"));
      const meters = [...document.querySelectorAll<HTMLElement>(".jam-meters .jam-meter")];
      const wantedMeter = meters.find((b) => b.textContent?.trim() === shot!.jam!.meter);
      if (!wantedMeter) throw new Error(`no meter button "${shot!.jam.meter}"`);
      wantedMeter.click();
      await until("the rule-groove note", () => !!document.querySelector(".jam-meter-note"));
    }

    if (shot!.jam.editChords) {
      // The mode first, then the cell — the two presses a person makes.
      await until("the EDIT CHANGES link", () =>
        [...document.querySelectorAll(".jam-link")].some((b) =>
          (b.textContent ?? "").toLowerCase().includes("edit changes"),
        ),
      );
      const edit = [...document.querySelectorAll<HTMLElement>(".jam-link")].find((b) =>
        (b.textContent ?? "").toLowerCase().includes("edit changes"),
      )!;
      edit.click();
      await until(
        "the editable cells",
        () => !!document.querySelector(".jam-timeline-cell[data-editable]"),
      );
      const cells = document.querySelectorAll<HTMLElement>(".jam-timeline-cell");
      cells[shot!.jam.editChords - 1].click();
      await until("the chord picker", () => !!document.querySelector(".jam-chord-picker"));
    }

    if (shot!.jam.editor) {
      // The "make your own" card, which is the last one in the groove row and
      // the door a person actually opens the editor through.
      const cards = document.querySelectorAll(".jam-cards-groove .jam-card");
      (cards[cards.length - 1] as HTMLElement).click();
      await until("the editor grid", () => !!document.querySelector(".jam-editor__grid"));
    }

    if (shot!.jam.scrollTo) {
      await until(shot!.jam.scrollTo, () => !!document.querySelector(shot!.jam!.scrollTo!));
      document.querySelector(shot!.jam.scrollTo)!.scrollIntoView({ block: "start" });
      // One frame for the scroll to land before the capture is allowed.
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  /**
   * A setlist, loaded and open in the paragraph.
   *
   * By clicking the library row, like the jam above and for the same reason:
   * a shot taken through any other door is a picture of a state the app
   * cannot reach.
   */
  if (shot!.setlist) {
    const rows = ".preset-sidebar-item.setlist-item";
    await until(
      "the setlist library",
      () => document.querySelectorAll(rows).length > shot!.setlist!.row,
    );
    (document.querySelectorAll(rows)[shot!.setlist!.row] as HTMLElement).click();
    await until("the setlist paragraph", () => !!document.querySelector(".setlist-paragraph"));

    if (shot!.setlist.scrollTo) {
      await until(shot!.setlist.scrollTo, () => !!document.querySelector(shot!.setlist!.scrollTo!));
      document.querySelector(shot!.setlist.scrollTo)!.scrollIntoView({ block: "start" });
      await new Promise((r) => requestAnimationFrame(r));
    }
  }

  if (shot!.zen) {
    // The rail's Zen button, by the anchor the tour already puts on it.
    await until("the Zen button", () => !!document.querySelector('[data-tour="zen-widget"]'));
    (document.querySelector('[data-tour="zen-widget"]') as HTMLButtonElement).click();
    await until("the Zen canvas", () => !!document.querySelector("[data-zen-style]"));
  }

  // Web fonts decide the metrics of every label in the picture, and a capture
  // taken before they land is a screenshot of the fallback stack.
  await document.fonts.ready;
  assertThemeFontLoaded();

  // Two frames after the last mutation: one for React to commit, one for the
  // compositor to paint it.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  window.__SHOT_READY__ = true;
}

if (shot) {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    // No StrictMode: its double-invoked effects make the transport fire twice,
    // and a screenshot wants one pass through the app's startup, not two.
    <App />,
  );

  drive().catch((err) => {
    window.__SHOT_ERROR__ = String(err?.message ?? err);
  });
}
