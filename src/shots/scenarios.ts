/**
 * What the screenshots are OF.
 *
 * One file, shared by the page that renders a shot and the script that
 * captures it, so the two can never disagree about what `?shot=drill` means.
 */

/** Every theme in src/themes.ts, in the order the picker lists them. */
export const SHOT_THEMES = [
  "mono",
  "obsidian",
  "velvet",
  "neon",
  "aurora",
  "ivory",
  "arctic",
  "sand",
  "lavender",
  "prism",
  "ash",
  "ember",
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
  tab?: "beat" | "drill";
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
