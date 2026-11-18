/**
 * Keyboard / global-shortcut binding catalog and helpers.
 *
 * - `HotkeyAction` is the closed set of action ids the app dispatches on.
 * - `HOTKEYS` is the default binding table (used as the seed for the
 *   user-configurable keymap stored in settings).
 * - `eventToCombo` normalizes a KeyboardEvent into the same string format
 *   used in HOTKEYS so we can match user input against bindings.
 * - `platformKey` swaps Mac glyphs for Windows/Linux labels in tooltips.
 *
 * Extracted from MainWindow.tsx — pure helpers with no React or component
 * scope.
 */

export type HotkeyAction =
  | "play"
  | "bpm-down"
  | "bpm-up"
  | "bpm-down-1"
  | "bpm-up-1"
  | "sub-next"
  | "sub-prev"
  | "sub-1"
  | "sub-2"
  | "sub-3"
  | "sub-4"
  | "sig-next"
  | "sig-prev"
  | "fullscreen"
  | "os-fullscreen"
  | "toggle-widget"
  | "toggle-sidebar"
  | "toggle-coach"
  | "tab-1"
  | "tab-2"
  | "tab-3"
  | "tab-4"
  | "tab-5"
  // Jam, hands-free (JAM_MODE §4.7). These exist so a MIDI footswitch can
  // reach them: your hands are on the instrument, which is the whole point of
  // playing over a band rather than setting one up.
  | "jam-next-groove"
  | "jam-prev-groove"
  | "jam-trade"
  | "jam-dropout"
  | "jam-next-shape"
  | "jam-next-section"
  | "jam-prev-section"
  | "jam-loop-section"
  | "jam-take"
  | "jam-camera"
  // Songs, hands-free (W18, 2026-09-20). Choosing the portion you are working
  // on is the centre of the mode, and a player choosing it has a guitar in
  // their hands: these exist so the bars can be set from a footswitch, while
  // the music is running, without looking away from the page.
  | "songs-loop-start"
  | "songs-loop-end"
  | "songs-loop"
  | "songs-loop-clear"
  | "songs-loop-earlier"
  | "songs-loop-later"
  // ...and the two that decide what is KEPT of the pass (W25). A player who
  // wants the next go filmed is holding a guitar exactly as much as one
  // marking out a portion, and reaching for a chip on the strip costs them
  // the same hand.
  | "songs-take"
  | "songs-camera"
  // The new front door. A new id rather than a sixth number: `tab-1` to `tab-5`
  // are positional and stored, and Today sits above them.
  | "tab-today"
  // The rest of the rail's learning side (owner, 2026-11-17). Ids of their own
  // rather than `tab-1`…: those count the tools and are stored by name. The
  // keys moved later that day: ⌘1–⌘4 are the learning side, the tools ⌘5–⌘9 (2026-11-18).
  | "tab-paths"
  | "tab-progress"
  | "tab-tools"
  // A Session, hands-free. A player between Takes has a guitar in their hands.
  // `session-pedal` is the one to bind to a single footswitch: tap, double tap
  // and hold are decided from its presses (`src/session/pedalGesture.ts`).
  | "session-go"
  | "session-slower"
  | "session-faster"
  | "session-next"
  | "session-pedal"
  /** Escape in a Session: what Exit does. */
  | "session-exit"
  /** V in a Session: Neck, Runway, Tab, round again (2026-11-17). */
  | "session-view"
  /** K in a Session: pause or resume a warm-up or a timed block (owner, beta 5). */
  | "session-pause"
  /** R in a Session: a timed block from the top, or a graded Take again. */
  | "session-restart"
  | "settings";

export interface HotkeyEntry {
  action: string;
  key: string;
  globalKey?: string;
  id: HotkeyAction;
  desc: string;
  globalAllowed?: boolean;
  group: "metronome" | "view" | "navigation" | "jam" | "songs" | "session";
}

export const IS_MAC = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
export const IS_WINDOWS = navigator.platform.toUpperCase().indexOf("WIN") >= 0;
export const IS_LINUX = navigator.platform.toUpperCase().indexOf("LINUX") >= 0;

/** Convert macOS-style symbols to platform-appropriate labels */
export function platformKey(key: string): string {
  if (IS_MAC) return key;
  return key
    .replace(/⌘/g, "Ctrl")
    .replace(/⇧/g, "Shift")
    .replace(/⌥/g, "Alt")
    .replace(/Ctrl\+?/g, "Ctrl+")
    .replace(/Shift\+?/g, "Shift+")
    .replace(/Alt\+?/g, "Alt+")
    .replace(/\+$/g, "");
}

/** Convert a KeyboardEvent to a normalized binding string */
/**
 * Is this event coming from somewhere the user is *typing*?
 *
 * Hotkey handlers have to stand aside while a name is being entered, or Space
 * starts the metronome in the middle of a word. The guard used to be
 * `INPUT || TEXTAREA || SELECT`, which is too broad by one very important
 * case: the tempo ruler is an `input[type=range]`. Click or drag it — which is
 * to say, set the tempo, the most ordinary thing on the screen — and it keeps
 * focus, and from then on every hotkey in the app was swallowed until you
 * clicked something else. The owner found it as "hotkeys stop working until I
 * click the rail".
 *
 * You cannot type into a range, a checkbox, a radio or a button, so a keypress
 * with one of them focused is a hotkey and nothing else.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (el as HTMLInputElement).type;
  return !NON_TEXT_INPUTS.has(type);
}

/**
 * Does Enter or Space belong to the control that has focus, not to a hotkey?
 *
 * Acceptance pass 2, N-P1-1: the skip link puts focus on Today's Start, and
 * Enter there did nothing. Enter is `session-go`, the handler took the key
 * and `preventDefault`ed it, and outside a running Session the action means
 * nothing, so the button never heard its own key. Space only worked because
 * `play` on Today happens to start the Session too.
 *
 * The rule: a plain Enter or Space on a focused button, link or tab-like
 * control activates that control, as it does on every other page on the web.
 * Two exceptions keep the keyboard and pedal flows the owner relies on:
 *
 *  - In the running Session (or a tool) a control that was CLICKED keeps
 *    focus, and Space there must go on meaning the hotkey ("space not working
 *    for play pause is by far the most annoying thing ever"). So off the
 *    learning pages the control only takes the key when it was reached by
 *    keyboard (see `trackFocusModality`; `:focus-visible` alone is not
 *    enough). In Zen only Zen's own controls can take it.
 *  - The Session's big button IS the Session action, and its click is not
 *    the key's (a key pauses a running warm-up; see `goKey`), so the key
 *    stays the Session's there.
 */
export function focusedControlTakesKey(
  e: KeyboardEvent,
  view: string,
  opts: { zen?: boolean } = {},
): boolean {
  if (e.key !== "Enter" && e.key !== " ") return false;
  if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return false;
  const el = e.target as HTMLElement | null;
  if (!el || typeof el.matches !== "function") return false;
  if (!el.matches(ACTIVATABLE)) return false;
  // Zen covers the whole window, and the button that opened it (the rail's
  // Zen, a tool's own) keeps focus behind it. Space there "pressed" a button
  // nobody can see, and the jam in front never started (the owner,
  // 2026-11-18: "spacebar for playing on zen mode not working"). Only Zen's
  // own controls can take the key while it is up.
  if (opts.zen && !el.closest(".fullscreen-view")) return false;
  // A checkbox or radio toggles on Space only; Enter there is still a hotkey.
  if (e.key === "Enter" && el.matches('input[type="checkbox"], input[type="radio"]')) return false;
  if (LEARNING_VIEWS.has(view)) return true;
  if (el.closest(".session-big")) return false;
  return focusedByKeyboard(el);
}

/*
 * Was this control reached by keyboard, or clicked?
 *
 * `:focus-visible` alone cannot say, at the moment it is asked. Chromium (and
 * so the Windows and Linux webviews) starts matching it on a clicked button
 * as soon as a key goes down, BEFORE the key's listeners run: the
 * heuristic is "the user is using the keyboard now". So every clicked button
 * read as keyboard-focused to the key handler, and Space after any click in a
 * tool or in Zen pressed that button again instead of Play/Stop.
 *
 * So the window remembers how each control got its focus: a focus that
 * arrives on the heels of a pointer press is a click's, any other is the
 * keyboard's (Tab, an arrow, or a script moving focus after a key).
 */
const pointerFocused = new WeakSet<Element>();
let pointerDown = false;
let modalityInstalled = false;

/** Start tracking how focus arrives. Idempotent; the main window calls it. */
export function trackFocusModality(doc: Document = document): void {
  if (modalityInstalled) return;
  modalityInstalled = true;
  const onPointer = (e: Event) => {
    pointerDown = true;
    // A press on the control that already has focus makes it a clicked one,
    // even though no focus event follows.
    const active = doc.activeElement;
    if (active && e.target instanceof Node && active.contains(e.target)) pointerFocused.add(active);
  };
  doc.addEventListener("pointerdown", onPointer, true);
  doc.addEventListener("mousedown", onPointer, true);
  doc.addEventListener("keydown", () => void (pointerDown = false), true);
  doc.addEventListener(
    "focusin",
    (e) => {
      if (!(e.target instanceof Element)) return;
      if (pointerDown) pointerFocused.add(e.target);
      else pointerFocused.delete(e.target);
    },
    true,
  );
}

function focusedByKeyboard(el: HTMLElement): boolean {
  if (pointerFocused.has(el)) return false;
  return matchesFocusVisible(el);
}

/**
 * A `session-` action pressed anywhere but the Session does nothing (the
 * dispatcher returns before it), so the key handler must not `preventDefault`
 * it: that is how Enter on Today's Start died. The pedal is the exception,
 * since off the Session it is Play/Stop.
 */
export function sessionKeyIsInert(actionId: string, view: string): boolean {
  return view !== "session" && actionId.startsWith("session-") && actionId !== "session-pedal";
}

const ACTIVATABLE = [
  "button",
  "a[href]",
  "summary",
  'input[type="button"]',
  'input[type="submit"]',
  'input[type="reset"]',
  'input[type="checkbox"]',
  'input[type="radio"]',
  '[role="button"]',
  '[role="link"]',
  '[role="tab"]',
  '[role="menuitem"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="option"]',
].join(", ");

/** The pages where no hotkey applies to Enter or Space but starting Today. */
const LEARNING_VIEWS = new Set(["today", "paths", "progress", "tools"]);

function matchesFocusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(":focus-visible");
  } catch {
    // An engine that cannot parse the selector: treat the focus as keyboard
    // focus, since a click-focused control is the case that can be wrong.
    return document.activeElement === el;
  }
}

/** Input types that hold no text, so a keypress in them is not typing. */
const NON_TEXT_INPUTS = new Set([
  "range",
  "checkbox",
  "radio",
  "button",
  "submit",
  "reset",
  "color",
  "file",
  "image",
]);

/**
 * What Shift does to a punctuation key, undone (W34 item 3).
 *
 * `⇧[` and `⇧]` nudge a song's portion a bar earlier or later, and neither of
 * them worked: the browser reports `key: "{"` for Shift and the bracket, so
 * the combo built here was `⇧{`, which is bound to nothing. Two hotkeys in
 * the settings list that could not be pressed.
 *
 * `code` is the key's PHYSICAL position and is the only thing that can say
 * "that was the bracket". It is used as a cross-check rather than as the
 * answer, because a German keyboard's bracket position is `ü`: the mapping
 * applies only when the character the browser reported is the one a US
 * layout produces from that position, so a layout where it is not simply
 * keeps what the browser said.
 *
 * Only the punctuation this app binds is listed. A letter needs nothing —
 * Shift turns `t` into `T` and `T` is what `⇧T` already means.
 */
const SHIFTED_PUNCTUATION: Record<string, { shifted: string; plain: string }> = {
  BracketLeft: { shifted: "{", plain: "[" },
  BracketRight: { shifted: "}", plain: "]" },
  Backslash: { shifted: "|", plain: "\\" },
  Comma: { shifted: "<", plain: "," },
  Period: { shifted: ">", plain: "." },
};

export function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  const cmdMod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (cmdMod) parts.push("⌘");
  if (IS_MAC && e.ctrlKey) parts.push("⌃");
  if (e.altKey) parts.push("⌥");
  if (e.shiftKey) parts.push("⇧");
  const unshifted = e.shiftKey ? SHIFTED_PUNCTUATION[e.code] : undefined;
  // A digit with Shift or Option is still the digit (2026-11-17): a player may
  // bind ⌥1 or ⇧1 (the tools sat on ⌥1–5 for a day), and the browser reports
  // Shift+1 as "!" on a US keyboard, '"' on
  // a German one, and Option+1 as "¡" on a Mac. The digit row's PHYSICAL key
  // is the same everywhere, so `code` answers.
  const digit = (e.shiftKey || e.altKey) && /^Digit[0-9]$/.test(e.code ?? "") ? e.code.slice(5) : null;
  const key = digit ?? (unshifted && e.key === unshifted.shifted ? unshifted.plain : e.key);
  if (["Meta", "Control", "Alt", "Shift"].includes(key)) return parts.join("");
  switch (key) {
    case " ":
      parts.push("Space");
      break;
    case "ArrowUp":
      parts.push("↑");
      break;
    case "ArrowDown":
      parts.push("↓");
      break;
    case "ArrowLeft":
      parts.push("←");
      break;
    case "ArrowRight":
      parts.push("→");
      break;
    default:
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      break;
  }
  return parts.join("");
}

/**
 * Actions that only mean anything on their own tab, by their own prefix.
 *
 * `L` loops a section in Jam and a portion in Songs; `[` and `]` step the
 * metronome's subdivision everywhere except Songs, where they mark where a
 * portion starts and stops. Both are the right key in both places.
 */
export const MODE_ACTION_PREFIXES = ["jam-", "songs-", "session-"];

/**
 * Which action a key press means, on the tab it was pressed on.
 *
 * One combo can belong to more than one action, and which one it means
 * depends on where you are: the mode's own action wins on the mode's own tab,
 * the plain one wins everywhere else. Taking the first match — which is what
 * this did before 2026-09-20 — meant whichever action was written higher up
 * the table below silently owned the key in every mode.
 *
 * Here rather than inside `MainWindow` since W34 item 3, so the question
 * "does this key reach anything on the Songs tab" can be asked of a function
 * instead of of a window.
 */
export function actionForCombo(
  bindings: Record<string, string>,
  combo: string,
  view: string,
): string | undefined {
  const bound = Object.entries(bindings)
    .filter(([, key]) => key === combo)
    .map(([action]) => action)
    // Leaving a Session is only ever the Session's. Off it, Escape belongs to
    // whatever is open (the Songs tab's portion, the jam's sheets), so the
    // fallback below must not hand it out.
    .filter((action) => action !== "session-exit" || view === "session");
  const modeOnly = (action: string) => MODE_ACTION_PREFIXES.some((p) => action.startsWith(p));
  return (
    bound.find((action) => action.startsWith(`${view}-`)) ??
    bound.find((action) => !modeOnly(action)) ??
    bound[0]
  );
}

export const HOTKEYS: HotkeyEntry[] = [
  {
    id: "play",
    action: "Play / Stop",
    key: "Space",
    globalKey: "⌘⇧Space",
    desc: "Start or stop the metronome",
    globalAllowed: true,
    group: "metronome",
  },
  {
    id: "bpm-up",
    action: "BPM +5",
    key: "↑",
    globalKey: "⌘⇧↑",
    desc: "Increase tempo by 5 BPM",
    globalAllowed: true,
    group: "metronome",
  },
  {
    id: "bpm-down",
    action: "BPM −5",
    key: "↓",
    globalKey: "⌘⇧↓",
    desc: "Decrease tempo by 5 BPM",
    globalAllowed: true,
    group: "metronome",
  },
  {
    id: "bpm-up-1",
    action: "BPM +1",
    key: "⇧↑",
    globalKey: "⌘⇧⌥↑",
    desc: "Fine increase by 1 BPM",
    globalAllowed: true,
    group: "metronome",
  },
  {
    id: "bpm-down-1",
    action: "BPM −1",
    key: "⇧↓",
    globalKey: "⌘⇧⌥↓",
    desc: "Fine decrease by 1 BPM",
    globalAllowed: true,
    group: "metronome",
  },
  {
    id: "sub-next",
    action: "Subdivision +",
    key: "]",
    desc: "Cycle to next subdivision",
    group: "metronome",
  },
  {
    id: "sub-prev",
    action: "Subdivision −",
    key: "[",
    desc: "Cycle to previous subdivision",
    group: "metronome",
  },
  {
    id: "sub-1",
    action: "Quarter notes",
    key: "1",
    desc: "Set subdivision to quarter notes (÷1)",
    group: "metronome",
  },
  {
    id: "sub-2",
    action: "Eighth notes",
    key: "2",
    desc: "Set subdivision to eighth notes (÷2)",
    group: "metronome",
  },
  {
    id: "sub-3",
    action: "Triplets",
    key: "3",
    desc: "Set subdivision to triplets (÷3)",
    group: "metronome",
  },
  {
    id: "sub-4",
    action: "Sixteenth notes",
    key: "4",
    desc: "Set subdivision to sixteenth notes (÷4)",
    group: "metronome",
  },
  {
    id: "sig-next",
    action: "Time signature +",
    key: "T",
    desc: "Cycle to next time signature — adds a beat in FREE mode",
    group: "metronome",
  },
  {
    id: "sig-prev",
    action: "Time signature −",
    key: "⇧T",
    desc: "Cycle to previous time signature — removes a beat in FREE mode",
    group: "metronome",
  },
  {
    id: "fullscreen",
    action: "Zen toggle",
    key: "Z",
    desc: "Enter or exit zen mode",
    group: "view",
  },
  {
    id: "os-fullscreen",
    action: "OS Fullscreen",
    key: "F",
    desc: "Toggle native fullscreen",
    group: "view",
  },
  {
    id: "toggle-widget",
    action: "Toggle Widget",
    key: "W",
    globalKey: "⌘⇧O",
    desc: "Switch to floating widget",
    globalAllowed: true,
    group: "navigation",
  },
  /**
   * The tools are ⌘5–⌘9 since 2026-11-18 (owner): all nine rail entries on
   * ⌘1–⌘9 in rail order, one modifier. ⌥+digit (the 2026-11-17 layout) is
   * what tiling window managers such as GlazeWM and i3 take for workspaces,
   * and ⌘⇧3/4/5 are macOS screenshots; ⌘+digit is free in the app on every OS.
   * Players on an older layout's defaults move once
   * (`hooks/keybindingMigration.ts`); keys they chose themselves stay.
   */
  {
    id: "tab-1",
    action: "Metronome tab",
    key: "⌘5",
    desc: "Switch to Metronome tab",
    group: "navigation",
  },
  /**
   * The numbers count down the rail, which reads Metronome, Setlist, Drill.
   *
   * That moved Drill from ⌘2 to ⌘3 when setlists became a mode. Keeping Drill
   * on ⌘2 would have spared the habit once and then left every user for the
   * rest of the app's life pressing ⌘2 for the third item and ⌘3 for the
   * second. These are positional keys or they are arbitrary ones.
   */
  {
    id: "tab-2",
    action: "Setlist tab",
    key: "⌘6",
    desc: "Switch to Setlist tab",
    group: "navigation",
  },
  {
    id: "tab-3",
    action: "Drill tab",
    key: "⌘7",
    desc: "Switch to Drill tab",
    group: "navigation",
  },
  {
    id: "tab-4",
    action: "Jam tab",
    key: "⌘8",
    desc: "Switch to Jam tab",
    group: "navigation",
  },
  {
    id: "tab-5",
    action: "Songs tab",
    key: "⌘9",
    desc: "Switch to Songs tab",
    group: "navigation",
  },
  {
    id: "settings",
    action: "Settings",
    key: "⌘,",
    desc: "Open or close settings",
    group: "navigation",
  },
  {
    id: "toggle-sidebar",
    action: "Toggle Presets",
    key: "B",
    desc: "Open or close the presets sidebar",
    group: "navigation",
  },
  {
    id: "toggle-coach",
    action: "Toggle Coach",
    key: "C",
    desc: "Open or close the practice coach panel",
    group: "navigation",
  },
  /**
   * Jam, hands-free.
   *
   * These do nothing outside the Jam tab, which is why they are a group of
   * their own rather than five more lines under Metronome, and why they take
   * bare letters: they are safe to bind to a footswitch that is also sending
   * play and stop, and the keys they use (G, X, D, S) are ones the metronome
   * does not want.
   */
  {
    id: "jam-next-groove",
    action: "Next groove",
    key: "G",
    desc: "Step to the next groove without taking a hand off the instrument",
    group: "jam",
  },
  {
    id: "jam-prev-groove",
    action: "Previous groove",
    key: "⇧G",
    desc: "Step back to the previous groove",
    group: "jam",
  },
  {
    id: "jam-trade",
    action: "Trade fours",
    key: "X",
    desc: "Turn trading on or off — the band plays four bars, you play four",
    group: "jam",
  },
  {
    id: "jam-dropout",
    action: "Drop-out bars",
    key: "D",
    desc: "Turn the drop-out bars on or off",
    group: "jam",
  },
  {
    id: "jam-next-shape",
    action: "Next chord shape",
    key: "S",
    desc: "Page through the ways to play the chord you are on",
    group: "jam",
  },
  /**
   * Moving through the form, hands-free.
   *
   * "Skip to the bridge with a footswitch" is JAM_MODE §4.2 in one line, and
   * the reason these are keys at all: your hands are on the instrument, and
   * the section you want is the one you are about to play, not the one you
   * can reach the mouse in time for. N and L were free; ⇧N follows ⇧G.
   */
  {
    id: "jam-next-section",
    action: "Next section",
    key: "N",
    desc: "Jump to the start of the next section at the bar line",
    group: "jam",
  },
  {
    id: "jam-prev-section",
    action: "Previous section",
    key: "⇧N",
    desc: "Jump back to the start of the previous section at the bar line",
    group: "jam",
  },
  {
    id: "jam-loop-section",
    action: "Loop this section",
    key: "L",
    desc: "Loop the section you are in, or stop looping it",
    group: "jam",
  },
  /**
   * Recording, hands-free.
   *
   * It arms the NEXT play rather than starting a take now, which is the only
   * behaviour a footswitch can have here: a take begins after the count-in,
   * and a key that started one mid-chorus would produce a recording of the
   * back half of a tune. R was free, and it is the letter every recorder in
   * the world uses.
   */
  {
    id: "jam-take",
    action: "Record the take",
    key: "R",
    desc: "Record the next time you press play, or stop recording",
    group: "jam",
  },
  /**
   * The picture, hands-free (W32).
   *
   * Exactly Songs' `C` and exactly its meaning, because a player who has
   * learned what `C` does on one tab has learned it on the other. It arms the
   * NEXT play for the same reason `R` does, and it goes through the switch
   * rather than the record, so a first press still shows the promise.
   */
  {
    id: "jam-camera",
    action: "Record the picture",
    key: "C",
    desc: "Film the next time you press play, or turn the camera off",
    group: "jam",
  },
  /**
   * Songs, hands-free (W18, 2026-09-20).
   *
   * The owner: choosing a portion of a song so it repeats is *"super critical
   * for song learning"*. A player choosing one has a guitar in their hands —
   * so the bars can be set from a footswitch, while the music is running,
   * without a hand leaving the neck. `[` and `]` mark where the loop starts
   * and stops AT THE BAR YOU ARE IN, which is the gesture every looper pedal
   * in the world already taught everybody.
   *
   * Three of these keys are the metronome's elsewhere (`[`, `]`, `L` is
   * Jam's). That is deliberate and handled where a key is turned into an
   * action: on the Songs tab the Songs meaning wins, everywhere else the old
   * one does. A subdivision stepper on a screen whose click follows the
   * score's own tempo map was not doing much anyway.
   */
  {
    id: "songs-loop-start",
    action: "Loop starts here",
    key: "[",
    desc: "Start the portion at the bar you are playing",
    group: "songs",
  },
  {
    id: "songs-loop-end",
    action: "Loop ends here",
    key: "]",
    desc: "End the portion at the bar you are playing",
    group: "songs",
  },
  {
    id: "songs-loop",
    action: "Repeat the portion",
    key: "L",
    desc: "Play the chosen bars round and round, or stop",
    group: "songs",
  },
  {
    id: "songs-loop-clear",
    action: "The whole song again",
    key: "\\",
    desc: "Forget the portion and play the piece from the top",
    group: "songs",
  },
  {
    id: "songs-loop-earlier",
    action: "Portion a bar earlier",
    key: "⇧[",
    desc: "Slide the chosen bars one bar towards the start, keeping their length",
    group: "songs",
  },
  {
    id: "songs-loop-later",
    action: "Portion a bar later",
    key: "⇧]",
    desc: "Slide the chosen bars one bar towards the end, keeping their length",
    group: "songs",
  },
  /**
   * Recording, hands-free, on a song (W25).
   *
   * Exactly Jam's `R` and exactly Jam's meaning — it arms the NEXT play
   * rather than starting a take now, because a take begins after the
   * count-in and a key that started one mid-chorus would produce a recording
   * of the back half of a passage. Two actions can share `R`: the tab
   * decides which one a press means (`MainWindow`'s `MODE_ACTION_PREFIXES`),
   * and a player who has learned what R does in Jam has learned it here.
   *
   * `C` is the camera, and it is the coach's key everywhere else. Same rule,
   * and the same reason it is worth the collision: `C` for camera is what
   * somebody would guess, and the coach card is not on the Songs tab at all.
   *
   * Both go through the SWITCHES rather than the settings behind them, so a
   * first press still shows the promise. A camera that came on from a
   * footswitch without anybody having read what it records would be the one
   * thing this feature may not do.
   */
  {
    id: "songs-take",
    action: "Record the take",
    key: "R",
    desc: "Record the next time you press play, or stop recording",
    group: "songs",
  },
  {
    id: "songs-camera",
    action: "Record the picture",
    key: "C",
    desc: "Film the next time you press play, or turn the camera off",
    group: "songs",
  },
  {
    id: "tab-today",
    action: "Today",
    key: "⌘1",
    desc: "Go to Today",
    group: "navigation",
  },
  // ⌘1–⌘4 down the rail's learning side, Today first (owner, 2026-11-17; they
  // were ⌘0 and ⌘6–⌘8 behind the tools' ⌘1–⌘5). ⌘P, ⌘R and the other letters a
  // webview or an OS already means are left alone on purpose, and so is ⌘0,
  // which is "actual size" in every browser engine.
  {
    id: "tab-paths",
    action: "Paths",
    key: "⌘2",
    desc: "Go to Paths",
    group: "navigation",
  },
  {
    id: "tab-progress",
    action: "Progress",
    key: "⌘3",
    desc: "Go to Progress",
    group: "navigation",
  },
  {
    id: "tab-tools",
    action: "Tools",
    key: "⌘4",
    desc: "Go to Tools",
    group: "navigation",
  },
  // The Session's own keys. By the prefix rule in `actionForCombo` these only
  // mean this on the running Session, so the arrows go on being the tempo
  // everywhere else and N goes on being the jam's.
  {
    id: "session-go",
    action: "The next thing",
    key: "Enter",
    desc: "In a Session: start the Take, stop it, or do whatever the big button says",
    group: "session",
  },
  {
    id: "session-slower",
    action: "Slower",
    key: "↓",
    desc: "Between Takes: one rung slower",
    group: "session",
  },
  {
    id: "session-faster",
    action: "Faster",
    key: "↑",
    desc: "Between Takes: one rung faster",
    group: "session",
  },
  {
    id: "session-next",
    action: "Next step",
    key: "N",
    desc: "Between Takes: move on to the next thing in the Session",
    group: "session",
  },
  {
    id: "session-pedal",
    action: "One pedal",
    key: "",
    desc: "For a single footswitch. Tap: the next thing. Double tap: slower. Hold: next step",
    group: "session",
  },
  // Escape leaves a Session the way Exit does. A `session-` action, so by the
  // prefix rule it means nothing on any other tab, and Escape there goes on
  // closing whatever it closed before.
  {
    id: "session-exit",
    action: "Leave the Session",
    key: "Escape",
    desc: "In a Session: leave it, as Exit does. A running Take stops first.",
    group: "session",
  },
  // What the practice screen shows. Live through a warm-up; a graded Take
  // keeps the view it started with, so it does nothing while one runs.
  {
    id: "session-view",
    action: "Switch view",
    key: "V",
    desc: "In a Session: Neck, Runway or Tab. Any time in a warm-up; between Takes in a graded one",
    group: "session",
  },
  // A warm-up or a timed block can be held and played again without leaving
  // (owner, beta 5). Space and Enter also pause one while it runs.
  {
    id: "session-pause",
    action: "Pause",
    // K, as a video player pauses: P is a common rebinding of Play.
    key: "K",
    desc: "In a warm-up or a timed block: pause it, or carry on",
    group: "session",
  },
  {
    id: "session-restart",
    action: "Go again",
    key: "R",
    desc: "In a warm-up or a timed block: from the top. After a Take: the same Take again",
    group: "session",
  },
];

export const HOTKEY_GROUPS: { key: string; label: string }[] = [
  { key: "metronome", label: "Metronome" },
  { key: "view", label: "View" },
  { key: "navigation", label: "Navigation" },
  { key: "jam", label: "Jam" },
  { key: "songs", label: "Songs" },
  { key: "session", label: "In a Session" },
];

// Delay for macOS fullscreen exit animation to complete before restoring window state
export const FULLSCREEN_EXIT_DELAY = 600;

export function splitCombo(combo: string): string[] {
  const parts: string[] = [];
  let i = 0;
  const modifiers = new Set(["⌘", "⌃", "⌥", "⇧", "↑", "↓", "←", "→"]);
  while (i < combo.length) {
    if (modifiers.has(combo[i])) {
      parts.push(combo[i]);
      i++;
    } else {
      // Rest of the string is the key name (e.g. "Space", "Tab", "F1", or single char)
      parts.push(combo.slice(i));
      break;
    }
  }
  return parts;
}
