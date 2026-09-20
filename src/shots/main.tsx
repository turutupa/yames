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
import i18n from "../i18n";
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
    /** The language this scene was actually built in. See `?lng=` below. */
    __SHOT_LOCALE__?: string;
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

/**
 * `?lng=de` — build the scene in another language.
 *
 * German is about a third longer than English and Russian is longer still, so
 * "does it fit" is a different question in every locale and the layout suite
 * is the only thing in this repo that can answer it. Changed before the app
 * mounts, and synchronously: `resources` are bundled by `../i18n`, nothing is
 * fetched, so the first render is already in the right language and the
 * harness never photographs a frame of English.
 *
 * An unknown tag would silently fall back to English and the run would pass
 * while measuring nothing, so it fails the scene instead.
 */
const lng = params.get("lng");
if (lng) {
  if (!Object.keys(i18n.options.resources ?? {}).includes(lng)) {
    window.__SHOT_ERROR__ = `unknown language "${lng}" (have: ${Object.keys(i18n.options.resources ?? {}).join(", ")})`;
    throw new Error(window.__SHOT_ERROR__);
  }
  void i18n.changeLanguage(lng);
}

/*
 * What the scene is really in, for whoever is measuring it.
 *
 * `changeLanguage` to a tag i18next does not hold resolves happily and leaves
 * the fallback in place, so "the page loaded" is not evidence the page is in
 * German. The check above rules that out here; this says so out loud, and
 * `openShot` refuses to measure a scene whose answer is not the language it
 * asked for.
 */
window.__SHOT_LOCALE__ = i18n.language;

if (!params.get("manifest") && !shot) {
  window.__SHOT_ERROR__ = `unknown shot "${params.get("shot")}" (have: ${SHOTS.map((s) => s.id).join(", ")})`;
  throw new Error(window.__SHOT_ERROR__);
}

if (shot) installShotMock(shot, theme);

/**
 * Press something until it has done what it was meant to do.
 *
 * Everything else in this file presses once, because everything else is
 * pressed at a moment the page has already been waited for. A control inside
 * a panel that has only just appeared is the one case where a single press
 * can land a frame early, and a screenshot harness that fails one run in four
 * is worse than no harness. `press` is called at most every 400 ms.
 */
async function pressUntil(
  what: string,
  press: () => void,
  done: () => boolean,
  timeoutMs = 15000,
): Promise<void> {
  const started = Date.now();
  while (!done()) {
    if (Date.now() - started > timeoutMs) throw new Error(`pressing ${what} never opened it`);
    press();
    await new Promise((r) => setTimeout(r, 400));
  }
}

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
      const wantedLabel = shot!.jam.sheet === "setup" ? "set up" : "cheat sheet";
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

    /**
     * The chord sheet's page, its reading and its filter (A10).
     *
     * By the label on the segment, not by an index: the four flavours are in
     * an order the data decides, and a shot pointing at "the third one" would
     * quietly photograph a different page the day that order changed.
     */
    const pressInSheet = async (label: string) => {
      await until(`the "${label}" control`, () =>
        [...document.querySelectorAll(".jam-sheet .accent-option, .jam-sheet .jam-switch")].some(
          (b) => (b.textContent ?? "").trim() === label,
        ),
      );
      const button = [...document.querySelectorAll<HTMLElement>(
        ".jam-sheet .accent-option, .jam-sheet .jam-switch",
      )].find((b) => (b.textContent ?? "").trim() === label);
      if (!button) throw new Error(`no "${label}" control on the sheet`);
      button.click();
    };

    if (shot!.jam.cheatTab) await pressInSheet(shot!.jam.cheatTab);
    if (shot!.jam.chordPage) await pressInSheet(shot!.jam.chordPage);

    if (shot!.jam.chordCard !== undefined) {
      await until("the chord chart", () => !!document.querySelector(".jam-chord-card"));
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
   * A song, loaded and drawn.
   *
   * Through the library row, like the jam above. The wait is on the RENDERED
   * tab rather than on the view, because alphaTab lays the score out
   * asynchronously and a shot taken before `data-ready` is a picture of an
   * empty box — which is exactly the failure the layout suite is here to
   * notice, so it must not be the thing the suite itself photographs.
   */
  if (shot!.songs) {
    const rows = ".preset-sidebar-item.song-item";
    await until("the song library", () => document.querySelectorAll(rows).length > shot!.songs!.row);
    (document.querySelectorAll(rows)[shot!.songs!.row] as HTMLElement).click();
    await until("the songs stage", () => !!document.querySelector(".songs-view"));
    await until("the drawn tab", () => !!document.querySelector(".songs-tab-host[data-ready]"));
    /*
     * And the band, which arrives after the tab does.
     *
     * The file's other tracks are read in a second pass and the engine send
     * is debounced, so the faders appear a moment after the score is drawn.
     * Without this wait the layout suite measures a stage that has a click
     * row and nothing else — which is the real narrow-window failure it is
     * here to catch, so it must not be the state it photographs.
     * Three rows: the click, the drums and the bass of `SHOT_SONG_TEX`.
     */
    await until(
      "the band's faders",
      () => document.querySelectorAll(".songs-band-lane").length >= 3,
    );

    if (shot!.songs.section) {
      const chips = [...document.querySelectorAll<HTMLElement>(".songs-section-chips .songs-chip")];
      const chip = chips.find((c) => c.textContent?.trim() === shot!.songs!.section);
      if (!chip) throw new Error(`no section chip called "${shot!.songs.section}"`);
      chip.click();
    }
    /**
     * A pass, and the verdict at the end of it.
     *
     * Pressed, not poked: the transport button and then the transport button
     * again, which is the only route a person has to a review. The mocked
     * analyzer answers the forced segment close with a pass over the
     * schedule the app itself derived, so what is photographed is the
     * shipping review drawing shipping blocks.
     */
    if (shot!.songs.review) {
      await until("the transport", () => !!document.querySelector(".transport-play"));
      const transport = document.querySelector(".transport-play") as HTMLButtonElement;
      transport.click();
      // Long enough for the schedule to have been pushed and a bar to pass.
      await new Promise((r) => setTimeout(r, 400));
      transport.click();
      await until("the review", () => !!document.querySelector(".songs-review"), 20000);
      if (shot!.songs.openMore) {
        /*
         * Pressed until it takes, rather than pressed once and hoped for.
         *
         * `until` resolves the frame the review appears, which is not
         * necessarily the frame its own disclosure is ready to be pressed —
         * and with four Playwright workers each engraving a score at the same
         * time, "not necessarily" became "one run in four". A person whose
         * press does not take presses again; so does this.
         */
        await pressUntil(
          '"what else"',
          () => document.querySelector<HTMLElement>(".songs-review-more .songs-link")?.click(),
          () => !!document.querySelector(".songs-review-others"),
        );
      }
    }

    if (shot!.songs.picker) {
      // The track picker, reached the only way a person reaches it — by
      // bringing a file in. The input is the view's own.
      const input = document.querySelector<HTMLInputElement>(".songs-file-input");
      if (!input) throw new Error("no file input on the songs view");
      const bytes = new TextEncoder().encode(shot!.songs.picker);
      const file = new File([bytes], "Picker.alphatex", { type: "text/plain" });
      const data = new DataTransfer();
      data.items.add(file);
      input.files = data.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      await until("the track picker", () => !!document.querySelector(".songs-picker"));
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

  if (shot!.settings) {
    // The rail's Settings button, by its label — the same press a person
    // makes. `view` becomes "settings" and the sheet covers the mode.
    //
    // Through `i18n.t` rather than the literal "settings", because `?lng=`
    // means the label on that button is whatever the locale says it is, and
    // a scene that cannot find its own button reads as "timed out waiting
    // for the settings panels" half a minute later.
    await until("the rail", () => !!document.querySelector(".rail-action"));
    const wanted = i18n.t("tooltip.settings").toLowerCase();
    const button = [...document.querySelectorAll<HTMLElement>(".rail-action")].find(
      (b) => (b.getAttribute("aria-label") ?? "").toLowerCase().includes(wanted),
    );
    if (!button) throw new Error("no Settings button on the rail");
    button.click();
    await until("the settings panels", () => !!document.querySelector(".settings-section"));
    if (shot!.settings.update === "available") {
      await until("the update banner", () => !!document.querySelector(".update-banner"));
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
