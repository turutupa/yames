/**
 * Moving players off the old navigation keys, once (owner, 2026-11-17).
 *
 * The defaults were Today ⌘0, the tools ⌘1–⌘5 and Paths, Progress and Tools
 * ⌘6–⌘8. They are now the learning side on ⌘1–⌘4 and the tools on ⌘⇧1–⌘⇧5.
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
/** 2: the 2026-11-17 navigation keys. Absent (or 1): the ones before. */
export const KEYMAP_VERSION = 2;

/** The navigation defaults before 2026-11-17, by action. */
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

const defaultOf = (id: string) => HOTKEYS.find((h) => h.id === id)?.key ?? "";

/**
 * A stored map moved to the new navigation defaults where it was still on the
 * old ones. Pure; returns the same object when there is nothing to move.
 */
export function migrateNavKeys(stored: Bindings): Bindings {
  const moving = Object.keys(OLD_NAV_DEFAULTS).filter(
    (id) => stored[id] === OLD_NAV_DEFAULTS[id] && defaultOf(id) !== OLD_NAV_DEFAULTS[id],
  );
  if (moving.length === 0) return stored;
  const next: Bindings = { ...stored };
  // Vacate first: Today moves onto the ⌘1 the Metronome is leaving.
  for (const id of moving) next[id] = "";
  for (const id of moving) {
    const target = defaultOf(id);
    const taken = Object.entries(next).some(([action, key]) => action !== id && key === target);
    next[id] = taken ? OLD_NAV_DEFAULTS[id] : target;
  }
  return next;
}
