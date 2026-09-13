/**
 * What the screenshots are OF.
 *
 * One file, shared by the page that renders a shot and the script that
 * captures it, so the two can never disagree about what `?shot=drill` means.
 */

/**
 * Every theme in src/themes.ts, in that file's order.
 *
 * The dark themes come first and the light ones after, and the grouping is the
 * point: a swatch row that reads dark, dark, light, light, dark makes you hunt.
 * scenarios.test.ts asserts this matches `THEMES` element for element, not
 * just as a set — appending to the end rather than inserting into the right
 * group is exactly how it went wrong.
 */
export const SHOT_THEMES = [
  // dark
  "mono",
  "obsidian",
  "velvet",
  "neon",
  "aurora",
  "ash",
  "ember",
  // light
  "ivory",
  "arctic",
  "sand",
  "lavender",
  "prism",
  "manuscript",
] as const;

export type ShotTheme = (typeof SHOT_THEMES)[number];

export interface Shot {
  /** `?shot=` value, and the folder under docs/img/. */
  id: string;
  /** `<theme>-<suffix>.webp` — the names the site and README already use. */
  suffix: string;
  /** Which of the app's two windows to mount. */
  window: "main" | "floating";
  /** The tab to open on. Absent for the widget, which has no tabs. */
  tab?: "beat" | "drill" | "jam";
  /**
   * The Jam tab, with a jam actually on it.
   *
   * The tab opens empty — a jam is loaded by clicking one in the library, and
   * nothing about the shot can be told from the empty state. `row` is which
   * library row to click, `bar` is which bar of the form to photograph: the
   * mode's whole subject is moving through a form, and bar one of chorus one
   * is the one bar that says nothing about it.
   */
  jam?: {
    row: number;
    bar?: number;
    /** Open the groove editor drawer before the capture. */
    editor?: boolean;
    /**
     * Turn "Edit changes" on and open the picker on this bar (1-based).
     *
     * Pressed rather than poked, like everything else here: the EDIT CHANGES
     * link and then the cell, which is the only route a person has.
     */
    editChords?: number;
    /**
     * Pick this meter before the capture, by its label ("7/8").
     *
     * A jam in seven is the one picture that says the mode is not four-four
     * only, and it cannot be reached from a starter jam any other way.
     */
    meter?: string;
    /** Scroll this selector to the top of the stage — the screen is taller
     *  than a window, and the band and the practice tools live below the
     *  fold of the one the chord is in. */
    scrollTo?: string;
  };
  /** Enter Zen once the app has mounted. */
  zen?: boolean;
  /**
   * Which Zen visual. Read from the store by `FullscreenView`, which defaults
   * to "focus" — a deliberately empty screen, and not the one the files are
   * named after.
   */
  zenStyle?: string;
  /** Start the transport. Zen is a visual of a running metronome. */
  playing?: boolean;
  /**
   * Fields merged over `speedRamp` before the app mounts.
   *
   * A stopped drill draws a dash where the tempo goes — deliberately, since
   * "the '80' this used to show was a tempo nothing was sounding" (DrillView).
   * Correct, and a poor picture: the screen's whole subject is a climb, and a
   * stopped one has not climbed. A snapshot of a ramp part-way up needs no
   * animation and no waiting — it is just the state the app would be in.
   */
  ramp?: Record<string, number | boolean | string>;
  /** CSS pixels. Doubled by the capture's device scale factor. */
  width: number;
  height: number;
  /**
   * Capture only this element's box rather than the viewport.
   *
   * The floating widget is a transparent window with the pill drawn inside
   * it, so a viewport capture would be mostly empty space.
   */
  clip?: string;
  /**
   * Milliseconds to let the shot settle after it reports ready.
   *
   * Everything here is deterministic except the Zen visuals, which are
   * animations with no natural resting frame — they get long enough to have
   * drawn something worth looking at.
   */
  settleMs: number;
}

/**
 * The four shots.
 *
 * 1400×900 for the window, not the 1400×1050 the old assets were. The app's
 * layout changed under the rail redesign: the controls sit in a column that
 * ends well above 1050, so a 4:3 frame spent its bottom fifth on empty
 * background. 14:9 is the tallest frame the metronome screen actually fills.
 * `docs/style.css` and `docs/site.js` carry the same ratio — they must agree
 * or the cards jump as the images load.
 */
export const SHOTS: Shot[] = [
  {
    id: "metronome",
    suffix: "metronome",
    window: "main",
    tab: "beat",
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "drill",
    suffix: "drill",
    window: "main",
    tab: "drill",
    // Six steps up a sixteen-step climb: the readout has a tempo in it, the
    // chart has a played half and a remaining half, and the numbers agree
    // with the plan sentence above them.
    ramp: { active: true, currentStep: 5, currentBpm: 85, barsInStep: 2 },
    playing: true,
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "zen",
    suffix: "cosmos",
    window: "main",
    tab: "beat",
    zen: true,
    zenStyle: "cosmos",
    playing: true,
    width: 1400,
    height: 900,
    settleMs: 2600,
  },
  {
    id: "jam",
    suffix: "jam",
    window: "main",
    tab: "jam",
    // The slow blues, part-way through its fifth bar: the chord has changed
    // to the IV, the strip and the shapes row have followed it, and the
    // timeline is lit somewhere other than the start.
    // No `playing` — the transport is pressed after the jam is loaded, the
    // way a person presses it. Starting the click before the jam was on the
    // stage would count bars against no form at all.
    jam: { row: 0, bar: 5 },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-band",
    suffix: "jam-band",
    window: "main",
    tab: "jam",
    // The lower half: the band's rows with the bass's notes for this bar, the
    // practice tools, the grooves, and the key and kit.
    jam: { row: 0, bar: 5, scrollTo: ".jam-band" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-editor",
    suffix: "jam-editor",
    window: "main",
    tab: "jam",
    // The groove editor, docked under a jam that is still playing.
    jam: { row: 0, bar: 3, editor: true, scrollTo: ".jam-band" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-setup",
    suffix: "jam-setup",
    window: "main",
    tab: "jam",
    // Key, kit and the part you read — the half of the screen you touch once
    // and then leave alone for an hour.
    jam: { row: 0, scrollTo: ".jam-setup" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-changes",
    suffix: "jam-changes",
    window: "main",
    tab: "jam",
    // The timeline in edit mode with the picker open on bar 5 — the one
    // screen that says the changes are yours rather than the form's.
    jam: { row: 0, editChords: 5, scrollTo: ".jam-timeline-section" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-seven",
    suffix: "jam-seven",
    window: "main",
    tab: "jam",
    // A jam in 7/8: the meter control, and the sentence saying the groove
    // does not fit it so the drummer plays the rule.
    jam: { row: 0, meter: "7/8", scrollTo: ".jam-setup" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-mix",
    suffix: "jam-mix",
    window: "main",
    tab: "jam",
    // The band's three rows with their volume sliders, and the keys row's
    // comping style.
    jam: { row: 0, bar: 5, scrollTo: ".jam-band" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-zen",
    suffix: "jam-zen",
    window: "main",
    tab: "jam",
    // Zen over a jam: the chord and the beat, nothing else.
    jam: { row: 0, bar: 5 },
    zen: true,
    zenStyle: "focus",
    width: 1400,
    height: 900,
    settleMs: 1200,
  },
  {
    id: "jam-empty",
    suffix: "jam-empty",
    window: "main",
    tab: "jam",
    // The tab opened cold, which is the first thing anybody sees.
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "widget",
    suffix: "widget",
    window: "floating",
    // The floating window's real size, from src-tauri/tauri.conf.json. No clip:
    // on Windows `.floating-widget.os-other` sets `height: 100vh` and drops the
    // corner radius, so the pill IS the window — give it a larger frame and it
    // stretches to fill it, pillarboxed in its own background.
    width: 400,
    height: 160,
    settleMs: 400,
  },
];

export function shotById(id: string): Shot | undefined {
  return SHOTS.find((s) => s.id === id);
}

/** `docs/img/metronome/ember-metronome.webp` */
export function shotPath(shot: Shot, theme: string): string {
  return `${shot.id}/${theme}-${shot.suffix}.webp`;
}
