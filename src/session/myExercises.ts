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
 */
import { useSyncExternalStore } from "react";
import type { TFunction } from "i18next";
import { storeLoad, storeSave } from "../ipc";
import type { PathTakeRow } from "../ipc";
import { CUSTOM_PATH_ID, buildCustomExercise, recipeKey, recipeProblem } from "../paths/custom";
import type { BuildResult, CustomSummary, Recipe } from "../paths/custom";

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

/** The recipe's key, or null for one that is not a recipe this build knows. */
export function keyOf(entry: MyExercise): string | null {
  if (recipeProblem(entry.recipe) !== null) return null;
  try {
    return recipeKey(entry.recipe);
  } catch {
    return null;
  }
}

export type AddResult =
  | { ok: true; list: MyExercise[] }
  | { ok: false; why: "full" | "already" | "badRecipe"; list: MyExercise[] };

/** Add a recipe at the top. The same notes twice, a bad recipe or a full list: refused, the list as it was. */
export function addMyExercise(list: readonly MyExercise[], recipe: Recipe, now: number): AddResult {
  const entry: MyExercise = { recipe, addedAt: now };
  const key = keyOf(entry);
  if (key === null) return { ok: false, why: "badRecipe", list: [...list] };
  if (list.some((e) => keyOf(e) === key)) return { ok: false, why: "already", list: [...list] };
  if (list.length >= MY_EXERCISES_MAX) return { ok: false, why: "full", list: [...list] };
  return { ok: true, list: [entry, ...list] };
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
  return take.pathId === CUSTOM_PATH_ID;
}

/** Each entry built again, in list order. */
export function buildMyExercises(list: readonly MyExercise[]): Array<{ entry: MyExercise; built: BuildResult }> {
  return list.map((entry) => ({ entry, built: buildCustomExercise(entry.recipe) }));
}

// ---------------------------------------------------------------------------
// Words: the line a row shows, from the summary, in the language on screen.
// ---------------------------------------------------------------------------

/** A chord as its symbol: written the same in every language the app speaks. */
const CHORD_SUFFIX: Readonly<Record<string, string>> = {
  maj: "",
  min: "m",
  dim: "dim",
  aug: "+",
  "7": "7",
  maj7: "maj7",
  m7: "m7",
  m7b5: "m7♭5",
  dim7: "dim7",
};

/** One line: what it is, where it starts and which way it goes, then its length. Never stored. */
export function myExerciseLine(t: TFunction, s: CustomSummary): string {
  const shape = t(`session.myExercises.shape.${s.shape}`, {
    root: s.root ?? "",
    scale: s.scale ? t(`scale.${s.scale}`) : "",
    chord: s.chord !== null && s.root ? `${s.root}${CHORD_SUFFIX[s.chord] ?? s.chord}` : "",
    position: s.position,
    string: s.firstNote.string,
  });
  return t("session.myExercises.line", {
    shape,
    direction: t(`session.myExercises.direction.${s.direction}`),
    bars: t("session.myExercises.bars", { count: s.bars }),
  });
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
