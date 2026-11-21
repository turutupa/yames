/**
 * My exercises: the player's custom Exercises, kept as recipes (DESIGN 13, TOOLS 2.4).
 *
 * One settings key, `myExercises`: a list of `{ recipe, addedAt, name? }`, newest
 * first, at most fifty. The recipe is kept, never the notes: every read builds it
 * again with `buildCustomExercise`, so a recipe a later generator refuses is kept
 * and shown as "can't be built any more", never dropped. No SQLite table (DESIGN
 * 9.5).
 *
 * Who changes it: adding is a tool's (t2c) after the player says yes; removing
 * is the player's own control on the list, with an Undo. The coach never removes.
 *
 * Takes of a custom Exercise are kept like any Take, under the reserved Path id
 * `CUSTOM_PATH_ID` ("my-exercises", which no pack uses), so its clean tempo is
 * kept. Every reader of Path standing, per-Path totals, Today's plan and the
 * tendencies resolves a Take through the pack documents, where that id is not:
 * `isCustomTake` is the one test for a reader that does not.
 *
 * Light on purpose: no generator in here. The app's shell and the Session runner
 * import this file, and the generator and validator behind `buildCustomExercise`
 * are only loaded when there is a list to show (`myExerciseBuild.ts`).
 */
import { useSyncExternalStore } from "react";
import { storeLoad, storeSave } from "../ipc";
import type { PathTakeRow } from "../ipc";
import type { Recipe } from "../paths/custom";

/**
 * The Path id custom Takes are kept under: `CUSTOM_PATH_ID` in `paths/custom.ts`,
 * written out here so the runner need not load the generator to know it (a test
 * holds the two equal).
 */
export const MY_EXERCISES_PATH_ID = "my-exercises";

export const MY_EXERCISES_KEY = "myExercises";
/** The most recipes the list keeps. Adding past it is refused, never an old one dropped. */
export const MY_EXERCISES_MAX = 50;

export type MyExercise = {
  /** As stored. Typed as a recipe; a value a later build does not know still reads, and fails to build. */
  recipe: Recipe;
  /** When it was added (ms). */
  addedAt: number;
  /** A name the player gave it. Nothing sets one yet. */
  name?: string;
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The stored value, read. Not a list: empty. An entry that is not
 * `{ recipe: object, addedAt: number }` is left out (it was never a recipe);
 * a recipe object that does not build is kept.
 */
export function readMyExercises(saved: unknown): MyExercise[] {
  if (!Array.isArray(saved)) return [];
  const out: MyExercise[] = [];
  for (const row of saved) {
    if (!isObject(row) || !isObject(row.recipe)) continue;
    if (typeof row.addedAt !== "number" || !Number.isFinite(row.addedAt)) continue;
    const entry: MyExercise = { recipe: row.recipe as Recipe, addedAt: row.addedAt };
    if (typeof row.name === "string" && row.name.trim() !== "") entry.name = row.name;
    out.push(entry);
    if (out.length === MY_EXERCISES_MAX) break;
  }
  return out;
}

/** Take one out; `undo` puts it back where it was. */
export function removeMyExercise(
  list: readonly MyExercise[],
  index: number,
): { list: MyExercise[]; removed: { entry: MyExercise; index: number } | null } {
  const entry = list[index];
  if (!entry) return { list: [...list], removed: null };
  return { list: list.filter((_, i) => i !== index), removed: { entry, index } };
}

/** Put a removed one back at its place (or at the end, if the list got shorter). Never twice. */
export function restoreMyExercise(list: readonly MyExercise[], removed: { entry: MyExercise; index: number }): MyExercise[] {
  if (list.includes(removed.entry) || list.length >= MY_EXERCISES_MAX) return [...list];
  const at = Math.min(removed.index, list.length);
  return [...list.slice(0, at), removed.entry, ...list.slice(at)];
}

/** A Take of a custom Exercise. */
export function isCustomTake(take: Pick<PathTakeRow, "pathId">): boolean {
  return take.pathId === MY_EXERCISES_PATH_ID;
}

// ---------------------------------------------------------------------------
// The list as the app holds it: loaded once, the same for every screen.
// ---------------------------------------------------------------------------

let held: MyExercise[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: MyExercise[]) {
  held = next;
  for (const fn of listeners) fn();
}

/** Read the store once; a failed read is an empty list. */
export function loadMyExercises(): Promise<void> {
  loaded ??= storeLoad<unknown>(MY_EXERCISES_KEY)
    .then((saved) => set(readMyExercises(saved)))
    .catch(() => set([]));
  return loaded;
}

/** Keep a new list: on screen at once, in the store as it will be. */
export function saveMyExercises(next: MyExercise[]): void {
  set(next);
  void storeSave(MY_EXERCISES_KEY, next).catch((err) => {
    console.warn("[yames] could not keep My exercises", err);
  });
}

/** The list now. */
export function myExercisesNow(): readonly MyExercise[] {
  return held;
}

/** For tests: forget what was read. */
export function resetMyExercisesForTest(): void {
  held = [];
  loaded = null;
  listeners.clear();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  void loadMyExercises();
  return () => {
    listeners.delete(fn);
  };
}

/** The list, kept current. Loads it the first time a screen asks. */
export function useMyExercises(): readonly MyExercise[] {
  return useSyncExternalStore(subscribe, myExercisesNow, myExercisesNow);
}
