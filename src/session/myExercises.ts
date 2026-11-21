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
 * Each entry read from the store → the stored row it was read from, exactly as
 * stored (unknown fields and all). A write puts that row back, never a copy
 * rebuilt from the three fields this build knows (t2bb, review item 3).
 */
const storedRowOf = new WeakMap<MyExercise, unknown>();

/** The row an entry is written back as: the one it was read from, or (a new one) its own fields. */
function rowOf(entry: MyExercise): unknown {
  const row = storedRowOf.get(entry);
  if (row !== undefined) return row;
  const made: Record<string, unknown> = { recipe: entry.recipe, addedAt: entry.addedAt };
  if (entry.name !== undefined) made.name = entry.name;
  storedRowOf.set(entry, made);
  return made;
}

/** The same stored entry (a list read again holds new objects for the same rows). */
function sameEntry(a: MyExercise, b: MyExercise): boolean {
  return a === b || rowOf(a) === rowOf(b);
}

/**
 * The stored value, read. Not a list: empty. An entry that is not
 * `{ recipe: object, addedAt: number }` is left out (it was never a recipe);
 * a recipe object that does not build is kept. At most fifty are shown; the
 * rows left out here stay in the store (`updateMyExercises` writes them back).
 */
export function readMyExercises(saved: unknown): MyExercise[] {
  if (!Array.isArray(saved)) return [];
  const out: MyExercise[] = [];
  for (const row of saved) {
    if (!isObject(row) || !isObject(row.recipe)) continue;
    if (typeof row.addedAt !== "number" || !Number.isFinite(row.addedAt)) continue;
    const entry: MyExercise = { recipe: row.recipe as Recipe, addedAt: row.addedAt };
    if (typeof row.name === "string" && row.name.trim() !== "") entry.name = row.name;
    storedRowOf.set(entry, row);
    out.push(entry);
    if (out.length === MY_EXERCISES_MAX) break;
  }
  return out;
}

export type RemovedMyExercise = { entry: MyExercise; index: number };

/** Take one out (found as the stored entry it is, not by a position that may be stale); `undo` puts it back where it was. */
export function removeMyExercise(
  list: readonly MyExercise[],
  entry: MyExercise,
): { list: MyExercise[]; removed: RemovedMyExercise | null } {
  const index = list.findIndex((e) => sameEntry(e, entry));
  if (index < 0) return { list: [...list], removed: null };
  return { list: list.filter((_, i) => i !== index), removed: { entry: list[index], index } };
}

/**
 * Put a removed one back at its place (or at the end, if the list got
 * shorter). Refused, and the list as it was, when it is already there (the
 * same stored entry, or the same notes added again since: `keyOf`, the
 * recipe's key, which the caller brings so this file needs no generator), or
 * when the list is full.
 */
export function restoreMyExercise(
  list: readonly MyExercise[],
  removed: RemovedMyExercise,
  keyOf: (entry: MyExercise) => string | null = () => null,
): { list: MyExercise[]; refused: null | "already" | "full" } {
  const key = keyOf(removed.entry);
  const already = list.some((e) => sameEntry(e, removed.entry) || (key !== null && keyOf(e) === key));
  if (already) return { list: [...list], refused: "already" };
  if (list.length >= MY_EXERCISES_MAX) return { list: [...list], refused: "full" };
  const at = Math.min(removed.index, list.length);
  return { list: [...list.slice(0, at), removed.entry, ...list.slice(at)], refused: null };
}

/** A Take of a custom Exercise. */
export function isCustomTake(take: Pick<PathTakeRow, "pathId">): boolean {
  return take.pathId === MY_EXERCISES_PATH_ID;
}

// ---------------------------------------------------------------------------
// The list as the app holds it: loaded once, the same for every screen.
// ---------------------------------------------------------------------------

/**
 * Where the key stands: not read yet; read (missing and null are read, as an
 * empty list); or unreadable: the read failed, or the value is there but is not
 * a list (a later build's shape, a hand edit). An unreadable key is never
 * written over: it shows as no list, and every writer is refused.
 */
export type MyExercisesState = "loading" | "read" | "unreadable";

let state: MyExercisesState = "loading";
/** The stored array exactly as read (or as last written): every row, shown or not. */
let stored: readonly unknown[] = [];
/** What the screen shows: `stored`, read. Display only: a writer goes through `updateMyExercises`. */
let held: MyExercise[] = [];
let loaded: Promise<void> | null = null;
/** Writers, one after the other: each starts from what the one before it wrote. */
let writing: Promise<unknown> = Promise.resolve();
const listeners = new Set<() => void>();

function set(next: MyExercisesState, rows: readonly unknown[]) {
  state = next;
  stored = rows;
  held = readMyExercises(rows);
  for (const fn of listeners) fn();
}

/**
 * Read the store once. A failed read leaves the key unreadable and is tried
 * again by the next load (the next screen that asks, the next writer).
 */
export function loadMyExercises(): Promise<void> {
  loaded ??= storeLoad<unknown>(MY_EXERCISES_KEY).then(
    (saved) => {
      if (saved === undefined || saved === null) set("read", []);
      else if (Array.isArray(saved)) set("read", saved);
      else set("unreadable", []);
    },
    (err) => {
      console.warn("[yames] could not read My exercises", err);
      loaded = null;
      set("unreadable", []);
    },
  );
  return loaded;
}

/**
 * The stored rows for a new list: each entry's own stored row, and every row
 * the reader left out (an entry it could not read, one past the fifty shown)
 * kept, unchanged, right after the stored row it followed (or first, when no
 * row before it is kept).
 */
function rowsFor(next: readonly MyExercise[]): unknown[] {
  const nextRows = next.map(rowOf);
  const shownBefore = new Set(held.map(rowOf));
  const keep = new Set(nextRows);
  const after = new Map<unknown, unknown[]>();
  let anchor: unknown = null;
  for (const row of stored) {
    if (keep.has(row)) anchor = row;
    else if (!shownBefore.has(row)) {
      const group = after.get(anchor) ?? [];
      group.push(row);
      after.set(anchor, group);
    }
  }
  const out: unknown[] = [...(after.get(null) ?? [])];
  for (const row of nextRows) out.push(row, ...(after.get(row) ?? []));
  return out;
}

/**
 * What a writer was told: `saved`; `unchanged` (its function returned null, so
 * nothing was written); `unreadable` (the stored value could not be read, or is
 * one this build cannot read: nothing was written, and the player must be told);
 * `failed` (the write itself failed: the list on screen is as it was).
 */
export type MyExercisesUpdate = "saved" | "unchanged" | "unreadable" | "failed";

/**
 * The one way to change the list (the list's Remove and Undo, t2c's Add). Waits
 * for the load, then hands `fn` the list as read (or as the writer before it
 * left it), never an empty stand-in; `fn` returns the new list, or null to
 * change nothing. Writes the whole stored array, with every row this build left
 * out of the list put back unchanged.
 */
export function updateMyExercises(fn: (list: readonly MyExercise[]) => MyExercise[] | null): Promise<MyExercisesUpdate> {
  const run = async (): Promise<MyExercisesUpdate> => {
    await loadMyExercises();
    if (state !== "read") return "unreadable";
    const next = fn(held);
    if (next === null) return "unchanged";
    const rows = rowsFor(next);
    try {
      await storeSave(MY_EXERCISES_KEY, rows);
    } catch (err) {
      console.warn("[yames] could not keep My exercises", err);
      return "failed";
    }
    set("read", rows);
    return "saved";
  };
  const result = writing.then(run, run);
  writing = result;
  return result;
}

/** The list on screen now. Display only: empty while loading or unreadable, so never a writer's starting point. */
export function myExercisesNow(): readonly MyExercise[] {
  return held;
}

/** Where the key stands (`MyExercisesState`). */
export function myExercisesState(): MyExercisesState {
  return state;
}

/** For tests: forget what was read. */
export function resetMyExercisesForTest(): void {
  state = "loading";
  stored = [];
  held = [];
  loaded = null;
  writing = Promise.resolve();
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
