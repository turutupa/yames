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
  tab?: "beat" | "drill" | "jam" | "setlist" | "songs";
  /**
   * The Jam tab, with a jam actually on it.
   *
   * The tab opens empty — a jam is loaded by clicking one in the library, and
   * nothing about the shot can be told from the empty state. `row` is which
   * library row to click, `bar` is which bar of the form to photograph: the
   * mode's whole subject is moving through a form, and bar one of chorus one
   * is the one bar that says nothing about it.
   */
  /**
   * The Songs tab, with a song drawn on it.
   *
   * Same shape as `jam`, and for the same reason: the tab opens on a library
   * and a shot of the library says nothing about the mode. `section` presses
   * one of the section chips; `picker` is alphaTex to bring in through the
   * file input, which is the only door the track picker has.
   */
  songs?: {
    row: number;
    section?: string;
    picker?: string;
    /**
     * Play a pass, stop it, and photograph the verdict.
     *
     * The harness presses the transport, hands the mocked analyzer a pass
     * built from the schedule the app actually sent it, and presses stop —
     * so the review in the picture is the shipping component drawing the
     * shipping blocks, not a mock-up of one. The three recipes are the three
     * shapes a review takes (`review/reviewFixtures.ts`):
     *
     *   `rushing`  — a tendency, with a loop as its fix
     *   `missed`   — a passage lost on every pass, three goes to step through
     *   `clean`    — praise that names bars and a count of goes
     *   `improved` — the passage is better than it was, which is the one
     *                finding that offers to show you the difference (W25)
     *
     * `openMore` opens "what else", which is the one part of A4 a screenshot
     * of the headline alone cannot show.
     */
    review?: "rushing" | "missed" | "clean" | "improved";
    openMore?: boolean;
    /**
     * W21 — turn the camera on before the pass, and film it.
     *
     * Chromium's `--use-fake-device-for-media-stream` gives the page a real
     * `MediaStream` from a synthetic camera and
     * `--use-fake-ui-for-media-stream` answers the permission prompt, so this
     * scene records with the shipping `MediaRecorder`, streams the chunks the
     * shipping way, and shows the shipping review playing a real video
     * element — no camera, no person, no mock of anything but the disk.
     *
     * Only meaningful with `review`: the picture belongs to a pass, and a
     * pass is what the review is about.
     */
    camera?: boolean;
    /**
     * W25 — open "Save as a video" on the review, and optionally make one.
     *
     * `"open"` presses the button and photographs the choices: which bars,
     * which way up, marks on or off, and how long it will take. `"make"` goes
     * on to press Make the video and waits for the file — which runs the
     * shipping compositor, the shipping `canvas.captureStream()` and the
     * shipping `MediaRecorder` in real time, so it is only worth doing in a
     * test that is going to look at the bytes afterwards.
     *
     * Only meaningful with `review`: a clip is made out of a take, and a take
     * is what the review is about.
     */
    clip?: "open" | "make";
    /**
     * W25 — then and now (addendum 11).
     *
     * Puts one earlier run at these bars in the store and its recording on
     * the shelf, so the coach's `improved` finding has a pair to offer. Only
     * meaningful with `review: "improved"`, which is the one finding that
     * offers to show the difference.
     */
    compare?: boolean;
    /**
     * Press play and photograph the stage with the transport running.
     *
     * The state A13 is about: every control you might reach for mid-passage
     * has to be on screen WHILE the band is playing, and a picture of a
     * stopped stage cannot say whether it is. Pressed, not poked — the
     * transport button, the way a person starts.
     *
     * Ignored when `review` is set: that recipe presses play itself, and
     * what it photographs is the stop.
     */
    playing?: boolean;
    /** Open the takes shelf — it is a popover now, not a section. */
    takes?: boolean;
    /**
     * Choose a portion, by dragging across the tab.
     *
     * Printed bar numbers, 1-based, the way a person would say them. Dragged
     * rather than poked: the band, the handles and the strip's sentence all
     * come from one selection, and a scene that set the state directly would
     * photograph a state the pointer might not actually be able to reach.
     */
    select?: { fromBar: number; toBar: number };
    /** Save the chosen portion under this name before the capture. */
    keepAs?: string;
  };
  /**
   * A download that has just finished, offered on the Songs screen (S0.9).
   *
   * Driven the way the real thing is: the app starts the watch when Songs
   * opens, the mocked backend answers that a file has arrived, and the
   * shipping banner draws itself. Its own flag rather than a field of
   * `songs` because it is not about a song being loaded — the offer appears
   * over the empty state too, which is the screen most players will meet it
   * on.
   */
  downloadOffer?: boolean;
  /**
   * The shelf Yames ships with, seeded into the library (W19, S0.9).
   *
   * Every other Songs scene has it turned OFF — `mockIpc` writes the "already
   * seeded" flag into the store — because seven extra library rows would
   * change which song row 0 is and quietly re-point every songs shot at a
   * different piece. This is the one scene that lets the seeding run.
   */
  starterShelf?: boolean;
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
    /**
     * Open one of the two docked sheets first (JAM_UX_DECISIONS A1, A8).
     *
     * The playing screen is five blocks now, and everything else — grooves,
     * key, kit, meter, takes — is behind the "Set up" button in the context
     * bar. The chord sheet is behind "Chords". Pressed rather than poked,
     * like the library row above.
     */
    sheet?: "setup" | "chords";
    /** Expand the setup sheet's MORE block: meter, what you read, takes. */
    more?: boolean;
    /**
     * Turn Record the take AND the camera on, and wait for the picture.
     *
     * Pressed rather than poked, like everything else here: the two
     * switches are in the takes group of the setup sheet and a person has
     * no other way to reach them. Chromium's fake device stands in for a
     * camera (`playwright.config.ts` passes the two flags), so the scene
     * arms the shipping code and gets a real `MediaStream`.
     */
    camera?: boolean;
    /** Tap this chord on the chord sheet (0-based) to expand its shapes. */
    chordCard?: number;
    /**
     * The cheat sheet's two switches, and nothing else — there is nothing
     * else. `cheatTab` picks chords or scales; `chordPage` thins the chart
     * to the key or opens it to all twelve. Pressed rather than poked, like
     * everything else here: the controls are on the sheet and a person has
     * no other way to reach them.
     */
    cheatTab?: "Chords" | "Scales";
    chordPage?: "In key" | "All keys";
  };
  /**
   * The Setlist tab, with a setlist actually on it.
   *
   * Same shape as `jam` above and for the same reason: the tab opens empty,
   * and a setlist is loaded by clicking one in the library. `row` is which
   * library row to click.
   */
  setlist?: {
    row: number;
    /** Scroll this selector to the top of the stage. */
    scrollTo?: string;
  };
  /**
   * Open Settings, and optionally hand the updater something to report.
   *
   * Settings is a sheet over whatever mode is showing rather than a fifth
   * tab, so it is reached the way a person reaches it: the rail's own
   * button. `update: "available"` makes the mocked updater answer with a
   * pending version, which is the only way to photograph the install
   * banner — and the only way to measure it against the panel below, which
   * it spent a release overlapping by four pixels.
   */
  settings?: { update?: "available" };
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
   * Build the scene at this size, then narrow to `width`×`height` (W25).
   *
   * The scenes here are driven the way a person drives the app — a library
   * row is CLICKED — and below about 900 px the rail collapses and there is
   * no library to click, so a scene born at 480 px never finishes building.
   * `tests/layout/fits.ts` has always done this; a shot of the smallest
   * window the app opens needs the same, and it is the truer test anyway: a
   * window is a thing people drag.
   */
  buildAt?: { width: number; height: number };
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
    // The groove editor, docked under a jam that is still playing. The way
    // in is the last card of the groove row, which lives on the setup sheet.
    jam: { row: 0, bar: 3, sheet: "setup", editor: true },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-camera",
    suffix: "jam-camera",
    window: "main",
    tab: "jam",
    // The stage with the camera armed: the little mirror in a corner of
    // it, and the setup sheet's takes group with both switches on. What
    // the layout suite measures on this scene is that the mirror covers
    // neither the chord nor the form's bar grid.
    jam: { row: 0, sheet: "setup", camera: true },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-setup",
    suffix: "jam-setup",
    window: "main",
    tab: "jam",
    // The setup sheet, docked to the right with the playing screen dimmed
    // behind it: the vibe tiles, the drummer, the form and the band — the
    // half of the mode you touch once and then leave alone for an hour.
    jam: { row: 0, sheet: "setup" },
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
    // screen that says the changes are yours rather than the form's. EDIT
    // CHANGES lives on the setup sheet; the cells it unlocks are on the
    // playing screen behind it, which is the point of a docked sheet.
    jam: { row: 0, sheet: "setup", editChords: 5 },
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
    // does not fit it so the drummer plays the rule. Both are inside MORE
    // now, which is where a thing true of one jam in twenty belongs.
    jam: { row: 0, sheet: "setup", more: true, meter: "7/8", scrollTo: ".jam-more-body" },
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
    id: "jam-chords",
    suffix: "jam-chords",
    window: "main",
    tab: "jam",
    // The chord sheet, open over a jam that is playing: the key's chords as
    // one basic shape each, and every way to play the first of them expanded
    // underneath. The playing screen is NOT dimmed behind it, which is the
    // difference between a cheat sheet and a dialog (A8).
    jam: { row: 0, bar: 5, sheet: "chords", chordCard: 0 },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-chords-colours",
    suffix: "jam-chords-colours",
    window: "main",
    tab: "jam",
    // The In key page at Colours: the sus, add9, 6 and 9 chords of the key,
    // gathered under the degree each belongs to. The page that says the sheet
    // knows more than seven chords (A10).
    jam: { row: 0, bar: 5, sheet: "chords", cheatTab: "Scales" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-chords-power",
    suffix: "jam-chords-power",
    window: "main",
    tab: "jam",
    // Every degree as a power chord — I5, IV5, V5 — with the real two-note
    // grips under them. A rock jam opens here without being asked.
    jam: { row: 0, bar: 5, sheet: "chords", cheatTab: "Scales", chordPage: "All keys" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "jam-chords-all",
    suffix: "jam-chords-all",
    window: "main",
    tab: "jam",
    // The poster: twelve roots down the side, all sixteen chord types
    // across the top in their three bands, with the filter on so the gaps
    // draw the shape of the key. The printed card the owner had in front of
    // them — "that's what i want to build".
    jam: { row: 0, bar: 5, sheet: "chords", chordPage: "All keys" },
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
    id: "jam-takes",
    suffix: "jam-takes",
    window: "main",
    tab: "jam",
    // The shelf inside MORE: three takes of the slow blues. The section is
    // the only place in the app that keeps a file, so the picture has to show
    // what that looks like rather than an empty heading.
    jam: { row: 0, sheet: "setup", more: true, scrollTo: ".jam-takes" },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    id: "setlist-jam",
    suffix: "setlist-jam",
    window: "main",
    tab: "setlist",
    // A routine that ends with ten minutes of playing: three plain steps and
    // a jam step, which is the whole argument for JAM_MODE §8.5 in one
    // screenshot.
    setlist: { row: 0 },
    width: 1400,
    height: 900,
    settleMs: 400,
  },
  {
    // Settings with an update pending. Not a screenshot for the site — the
    // layout suite is what opens it — but it lives here because this is
    // where "what the app can be put into" is written down.
    id: "settings-update",
    suffix: "settings-update",
    window: "main",
    tab: "beat",
    settings: { update: "available" },
    width: 1400,
    height: 900,
    settleMs: 300,
  },
  {
    id: "songs",
    suffix: "songs",
    window: "main",
    tab: "songs",
    // A song on the stage: the tab drawn, the facts about it above, and the
    // bar range, sections, speed and repeat under it.
    songs: { row: 0 },
    width: 1400,
    height: 900,
    // alphaTab lays the score out on this thread; give it room to finish.
    settleMs: 900,
  },
  {
    id: "songs-playing",
    suffix: "songs-playing",
    window: "main",
    tab: "songs",
    // The stage with the band playing: the bars, the sections, the speed, the
    // repeat, recording and the faders all on screen at once, under a tab that
    // has the cursor on it. The picture A13 is argued from, and the one the
    // layout suite measures "can you reach it while playing" against.
    songs: { row: 0, playing: true },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-portion",
    suffix: "songs-portion",
    window: "main",
    tab: "songs",
    // The centre of the mode: four bars dragged out on the tab, the band
    // drawn behind them with a handle at each end, the strip saying the same
    // thing in words, and one portion already kept under a name beside the
    // sections. Bars 5–8 of the fixture, which is the chorus — and the
    // fixture's two systems mean bars 4–8 would cross a line break, which is
    // the case `selectionBands` exists for.
    songs: { row: 0, select: { fromBar: 5, toBar: 8 }, keepAs: "The chorus" },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-takes",
    suffix: "songs-takes",
    window: "main",
    tab: "songs",
    // The shelf, open off its own switch. It is a popover now rather than a
    // section under the stage, so this is the only way to photograph it.
    songs: { row: 0, takes: true },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-empty",
    suffix: "songs-empty",
    window: "main",
    tab: "songs",
    // The mode before you have brought anything in. No `songs` block, so no
    // library row is pressed and the empty state is what is on screen.
    width: 1400,
    height: 900,
    settleMs: 300,
  },
  {
    id: "songs-review-rushing",
    suffix: "songs-review-rushing",
    window: "main",
    tab: "songs",
    // The coach's one thing, with its fix as a button: a tendency in the back
    // half of the passage, the bars it is about drawn underneath the
    // sentence, and a loop ready to press. The screen COACH_UX A4 is about.
    songs: { row: 0, review: "rushing" },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-review-missed",
    suffix: "songs-review-missed",
    window: "main",
    tab: "songs",
    // The same passage lost on every go: three goes to step through, extras
    // between the notes where the hand kept going, and a second finding
    // behind "what else" — which is the half of A4 that says everything
    // else is there if you open it and never pushed.
    songs: { row: 0, review: "missed", openMore: true },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-review-clean",
    suffix: "songs-review-clean",
    window: "main",
    tab: "songs",
    // Praise that is about something: the bars, the number of goes, and
    // "come back to this" rather than a correction nobody needed. A4 again —
    // never generic praise.
    songs: { row: 0, review: "clean" },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-camera",
    suffix: "songs-camera",
    window: "main",
    tab: "songs",
    // W21 — the whole of the camera, end to end: the switch on, the promise
    // read, three seconds filmed by Chromium's fake device, and the review
    // playing it back with the verdict painted on the tape underneath. The
    // scene the layout suite measures for "does the review with a picture fit
    // the frame W18 gives it".
    songs: { row: 0, review: "rushing", camera: true },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-camera-small",
    suffix: "songs-camera-small",
    window: "main",
    tab: "songs",
    // W25 item 1 — the same review, at the smallest window the app will open
    // (`tauri.conf.json`: 480×780). The one the strip used to leave 181px of,
    // and the picture the layout suite's restored rule is argued from.
    songs: { row: 0, review: "rushing", camera: true },
    buildAt: { width: 1440, height: 900 },
    width: 480,
    height: 780,
    settleMs: 900,
  },
  {
    id: "songs-compare",
    suffix: "songs-compare",
    window: "main",
    tab: "songs",
    // W25 item 3 — then and now. The coach says this passage has come on, and
    // under the sentence are the two runs it is talking about: a month ago at
    // 70 % and tonight, side by side, held together by the BAR rather than by
    // the clock so the slower one still lines up.
    songs: { row: 0, review: "improved", camera: true, compare: true },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-clip",
    suffix: "songs-clip",
    window: "main",
    tab: "songs",
    // W25 item 2 — "Save as a video", open on its choices: which bars, which
    // way up, marks on or off, how long it will take and which container the
    // player is going to get. The clip itself is not made here; that takes as
    // long as the music does and belongs in a test that reads the bytes.
    songs: { row: 0, review: "rushing", camera: true, clip: "open" },
    width: 1100,
    height: 720,
    settleMs: 600,
  },
  {
    id: "songs-clip-make",
    suffix: "songs-clip-make",
    window: "main",
    tab: "songs",
    // ...and the same screen with the clip actually MADE. It runs the
    // compositor in real time, so it is here for `songs-camera.spec.ts` to
    // pull the bytes off `window.__SHOT_CLIP__` and ask whether they are a
    // video — which is the only question about a video worth asking, and one
    // no assertion about a Blob can answer.
    songs: { row: 0, review: "rushing", camera: true, clip: "make" },
    width: 1100,
    height: 720,
    settleMs: 200,
  },
  {
    id: "songs-camera-armed",
    suffix: "songs-camera-armed",
    window: "main",
    tab: "songs",
    // The stage with the camera OPEN and nothing recorded yet: the little
    // mirror over the tab, the switch lit, the strip still a strip. It is
    // what "the camera costs the strip no height" is measured against, now
    // that a review takes the strip's room (W25 item 1).
    songs: { row: 0, camera: true },
    width: 1100,
    height: 720,
    settleMs: 600,
  },
  {
    id: "songs-picker",
    suffix: "songs-picker",
    window: "main",
    tab: "songs",
    // The track picker, over the stage. Two tracks, so the ordering (guitars
    // before basses) and the tuning line are both visible.
    songs: {
      row: 0,
      picker: `\\title "Two parts"
\\tempo 120
.
\\track "Bass"
\\tuning d3 a2 d2 g1
\\ts 4 4 2.1.4 2.1.4 2.1.4 2.1.4 |
\\track "Guitar"
\\tuning e5 b4 g4 d4 a3 e3
\\ts 4 4 3.3.4 3.3.4 3.3.4 3.3.4 |`,
    },
    width: 1400,
    height: 900,
    settleMs: 900,
  },
  {
    id: "songs-offer",
    suffix: "songs-offer",
    window: "main",
    tab: "songs",
    // A download caught, over the empty state — the screen a player meets
    // this on the first time. Not a marketing picture: it is here so the
    // layout suite can ask whether the strip and its two buttons fit at the
    // smallest window the app opens.
    downloadOffer: true,
    width: 1400,
    height: 900,
    settleMs: 300,
  },
  {
    id: "songs-starter",
    suffix: "songs-starter",
    window: "main",
    tab: "songs",
    // The library on a fresh install: the seven pieces Yames ships with, each
    // marked as having come with the app, and the first of them on the stage.
    // The layout suite is what this is for — it asks whether the marker fits
    // beside a song's name without pushing anything out of the row.
    starterShelf: true,
    songs: { row: 0 },
    width: 1400,
    height: 900,
    settleMs: 900,
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
