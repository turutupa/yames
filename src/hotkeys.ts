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
  | "settings";

export interface HotkeyEntry {
  action: string;
  key: string;
  globalKey?: string;
  id: HotkeyAction;
  desc: string;
  globalAllowed?: boolean;
  group: "metronome" | "view" | "navigation";
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
export function eventToCombo(e: KeyboardEvent): string {
  const parts: string[] = [];
  const cmdMod = IS_MAC ? e.metaKey : e.ctrlKey;
  if (cmdMod) parts.push("⌘");
  if (IS_MAC && e.ctrlKey) parts.push("⌃");
  if (e.altKey) parts.push("⌥");
  if (e.shiftKey) parts.push("⇧");
  const key = e.key;
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
  {
    id: "tab-1",
    action: "Metronome tab",
    key: "⌘1",
    desc: "Switch to Metronome tab",
    group: "navigation",
  },
  {
    id: "tab-2",
    action: "Drill tab",
    key: "⌘2",
    desc: "Switch to Drill tab",
    group: "navigation",
  },
  {
    id: "tab-3",
    action: "Pocket Check tab",
    key: "⌘3",
    desc: "Switch to Pocket Check tab",
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
];

export const HOTKEY_GROUPS: { key: string; label: string }[] = [
  { key: "metronome", label: "Metronome" },
  { key: "view", label: "View" },
  { key: "navigation", label: "Navigation" },
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
