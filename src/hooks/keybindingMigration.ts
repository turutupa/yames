/**
 * Moving players off old navigation keys, once per layout.
 *
 * Layout 1 (to 2026-11-16): Today ⌘0, the tools ⌘1–⌘5, Paths, Progress and
 * Tools ⌘6–⌘8. Layout 2 (2026-11-17, beta 3–6): the learning side ⌘1–⌘4 and the
 * tools ⌥1–⌥5. Layout 3 (2026-11-18, owner): all nine on ⌘1–⌘9 in rail order,
 * no Alt, because tiling window managers (GlazeWM, i3…) take Alt+digit.
 * Layout 4 (acceptance 4, 2026-11-18): Record the picture leaves C, which is
 * the coach's key and opens it on a jam too, for ⇧R in Jam and Songs.
 *
 * `useKeybindings` saves the WHOLE map, defaults included, so a stored ⌘3 does
 * not say whether the player chose it. The rule: a binding still on its old
 * default moves to its new default; anything else was the player's choice and
 * stays. A new default another of their own bindings already uses is not taken
 * from it: that action keeps its old key instead. And it happens once, marked
 * by `KEYMAP_VERSION_KEY`, so a player who later puts Today back on ⌘0 keeps it.
 */
import { HOTKEYS } from "../hotkeys";

type Bindings = Record<string, string>;

/** The settings key that marks which default layout a stored map has been moved to. */
export const KEYMAP_VERSION_KEY = "keyBindingsVersion";
/**
 * 4: the camera on ⇧R. 3: ⌘1–⌘9 in rail order (2026-11-18). 2: the
 * 2026-11-17 keys. Absent or 1: the first.
 */
export const KEYMAP_VERSION = 4;

/** Layout 1's navigation defaults, by action. */
export const OLD_NAV_DEFAULTS: Readonly<Record<string, string>> = {
  "tab-today": "⌘0",
  "tab-1": "⌘1",
  "tab-2": "⌘2",
  "tab-3": "⌘3",
  "tab-4": "⌘4",
  "tab-5": "⌘5",
  "tab-paths": "⌘6",
  "tab-progress": "⌘7",
  "tab-tools": "⌘8",
};

/** Layout 2's navigation defaults, by action. */
export const NAV_DEFAULTS_V2: Readonly<Record<string, string>> = {
  "tab-today": "⌘1",
  "tab-paths": "⌘2",
  "tab-progress": "⌘3",
  "tab-tools": "⌘4",
  "tab-1": "⌥1",
  "tab-2": "⌥2",
  "tab-3": "⌥3",
  "tab-4": "⌥4",
  "tab-5": "⌥5",
};

/** Layout 3's keys that layout 4 moved: the camera was the coach's C. */
export const CAMERA_DEFAULTS_V3: Readonly<Record<string, string>> = {
  "jam-camera": "C",
  "songs-camera": "C",
};

/** The old defaults a stored map at `version` may still carry. */
export function oldDefaultsFor(version: number): Readonly<Record<string, string>> {
  if (version >= 4) return {};
  const nav = version >= 3 ? {} : version >= 2 ? NAV_DEFAULTS_V2 : OLD_NAV_DEFAULTS;
  return { ...nav, ...CAMERA_DEFAULTS_V3 };
}

const defaultOf = (id: string) => HOTKEYS.find((h) => h.id === id)?.key ?? "";

/**
 * A stored map moved to the current defaults where it was still on the
 * defaults of the layout it was saved under (navigation keys, and since
 * layout 4 the camera's). Pure; returns the same object
 * when there is nothing to move.
 */
export function migrateNavKeys(stored: Bindings, fromVersion = 1): Bindings {
  const old = oldDefaultsFor(fromVersion);
  const moving = Object.keys(old).filter((id) => stored[id] === old[id] && defaultOf(id) !== old[id]);
  if (moving.length === 0) return stored;
  const next: Bindings = { ...stored };
  // Vacate first: a key one action leaves is often another's new default.
  for (const id of moving) next[id] = "";
  for (const id of moving) {
    const target = defaultOf(id);
    // Taken by another of the player's bindings, that is: the two cameras
    // share ⇧R by design, one per tab.
    const taken = Object.entries(next).some(
      ([action, key]) => action !== id && key === target && !moving.includes(action),
    );
    next[id] = taken ? old[id] : target;
  }
  return next;
}
