/**
 * "Add to today" (TOOLS 2.4, leg t2e): the player's own exercises chosen for
 * today's Session.
 *
 * One settings key, `myExercises.today`: `{ day: "yyyy-mm-dd", keys: [recipe
 * key] }`. The keys are for that local day only: on any other day they read as
 * none, and nothing is written to say so (not on load, not at midnight). No
 * SQLite table (DESIGN 9.5).
 *
 * Who changes it: only the player's press on a My exercises row ("Add to
 * today", "Take off today") and its Undo, through `updateChosenToday`, which
 * runs in the same queue as the list's writer (`queueMyExercisesWrite`). The
 * coach never writes it and the planner never chooses one by itself: it plans
 * what is here, nothing else.
 *
 * A key whose exercise is no longer on the list (the player removed it) is left
 * in the store and simply not planned: Undo of the Remove brings it back to
 * today too. Keys are recipe keys (`keyOf` in `myExerciseBuild.ts`), worked out
 * by the caller, so this file needs no generator.
 *
 * Also here, light: what the Session runner is handed (`ChosenParts`, built
 * outside it with the generator) and the one document it plays them from.
 */
import { useSyncExternalStore } from "react";
import { storeLoad, storeSave } from "../ipc";
import type { Exercise, PathDoc } from "../paths/format";
import { dayKey } from "./swap";
import { MY_EXERCISES_PATH_ID, queueMyExercisesWrite } from "./myExercises";

export const CHOSEN_TODAY_KEY = "myExercises.today";
/** The most parts a day can hold; the planner fits what the minutes allow. */
export const CHOSEN_TODAY_MAX = 4;

export type StoredChosenToday = { day: string; keys: string[] };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The stored value, checked. Missing or null: nothing chosen (`null`). A value
 * of another shape: `undefined`, unreadable, never written over.
 */
export function readChosenToday(raw: unknown): StoredChosenToday | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const r = raw as { day?: unknown; keys?: unknown };
  if (typeof r.day !== "string" || !DAY.test(r.day) || !Array.isArray(r.keys)) return undefined;
  const keys = [...new Set(r.keys.filter((k): k is string => typeof k === "string" && k.length > 0))];
  return { day: r.day, keys };
}

/** The keys chosen for the day `now` falls on: the stored ones on their own day, none on any other. */
export function chosenKeysOn(stored: StoredChosenToday | null, now: number): string[] {
  return stored && stored.day === dayKey(now) ? [...stored.keys] : [];
}

// ---------------------------------------------------------------------------
// The key as the app holds it.
// ---------------------------------------------------------------------------

type State = "loading" | "read" | "unreadable";
let state: State = "loading";
let stored: StoredChosenToday | null = null;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function set(next: State, value: StoredChosenToday | null) {
  state = next;
  stored = value;
  for (const fn of listeners) fn();
}

/** Read the key once. A failed read is tried again by the next load. Writes nothing. */
export function loadChosenToday(): Promise<void> {
  loaded ??= storeLoad<unknown>(CHOSEN_TODAY_KEY).then(
    (raw) => {
      const read = readChosenToday(raw);
      if (read === undefined) set("unreadable", null);
      else set("read", read);
    },
    (err) => {
      console.warn("[yames] could not read today's exercises", err);
      loaded = null;
      set("unreadable", null);
    },
  );
  return loaded;
}

/** What a press was told (as `updateMyExercises` answers). */
export type ChosenTodayUpdate = "saved" | "unchanged" | "unreadable" | "failed";

/**
 * The one way to change today's choice. `fn` gets today's keys (none when the
 * stored day is another) and returns the new keys, or null to change nothing.
 * Writes `{ day: today, keys }`; at most `CHOSEN_TODAY_MAX` keys (`fn` asking
 * for more: refused, nothing written).
 */
export function updateChosenToday(
  fn: (keys: readonly string[]) => string[] | null,
  now: number = Date.now(),
): Promise<ChosenTodayUpdate> {
  return queueMyExercisesWrite(async (): Promise<ChosenTodayUpdate> => {
    await loadChosenToday();
    if (state !== "read") return "unreadable";
    const next = fn(chosenKeysOn(stored, now));
    if (next === null) return "unchanged";
    const keys = [...new Set(next)];
    if (keys.length > CHOSEN_TODAY_MAX) return "unchanged";
    const value: StoredChosenToday = { day: dayKey(now), keys };
    try {
      await storeSave(CHOSEN_TODAY_KEY, value);
    } catch (err) {
      console.warn("[yames] could not keep today's exercises", err);
      return "failed";
    }
    set("read", value);
    return "saved";
  });
}

/** Add `key` to today, at the end. Already there or full: unchanged. */
export function withKey(keys: readonly string[], key: string): string[] | null {
  if (keys.includes(key) || keys.length >= CHOSEN_TODAY_MAX) return null;
  return [...keys, key];
}

/** Take `key` off today, or put it back at `at` (an Undo). Not there / already there: unchanged. */
export function withoutKey(keys: readonly string[], key: string): string[] | null {
  return keys.includes(key) ? keys.filter((k) => k !== key) : null;
}

export function withKeyAt(keys: readonly string[], key: string, at: number): string[] | null {
  if (keys.includes(key) || keys.length >= CHOSEN_TODAY_MAX) return null;
  const i = Math.max(0, Math.min(at, keys.length));
  return [...keys.slice(0, i), key, ...keys.slice(i)];
}

/** The stored value as read (display only). */
export function chosenTodayStored(): StoredChosenToday | null {
  return stored;
}

/** For tests: forget what was read. */
export function resetChosenTodayForTest(): void {
  state = "loading";
  stored = null;
  loaded = null;
  listeners.clear();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  void loadChosenToday();
  return () => {
    listeners.delete(fn);
  };
}

/** The stored value, kept current. Loads it the first time a screen asks. */
export function useChosenTodayStored(): StoredChosenToday | null {
  return useSyncExternalStore(subscribe, chosenTodayStored, chosenTodayStored);
}

// ---------------------------------------------------------------------------
// What the runner is handed, built outside it (`useChosenToday`).
// ---------------------------------------------------------------------------

/** One chosen exercise, built: its one-Step document and its Exercise. */
export type ChosenPart = { key: string; path: PathDoc; exercise: Exercise };

/**
 * The stored keys' exercises as the runner is handed them (`ChosenTodayParts`,
 * outside it): the ones built, and the keys of those on the list that could
 * not be built (a recipe this build cannot make any more), left out of the
 * plan and said on Today. A key whose exercise is not on the list is in
 * neither: the player removed it. The runner picks today's keys from these.
 */
export type ChosenParts = { parts: ChosenPart[]; unbuiltKeys: string[] };

export const NO_CHOSEN_PARTS: ChosenParts = { parts: [], unbuiltKeys: [] };

/** Today's keys (`chosenKeysOn`) resolved against what was built, in the order chosen. */
export function chosenForToday(
  built: ChosenParts,
  keys: readonly string[],
): { parts: ChosenPart[]; unbuilt: number } {
  const parts = keys.flatMap((k) => built.parts.filter((p) => p.key === k).slice(0, 1));
  const unbuilt = keys.filter((k) => built.unbuiltKeys.includes(k)).length;
  return { parts, unbuilt };
}

/**
 * The one document the Session plays every custom Exercise from: the first
 * document's Path and Step, holding each document's Exercises once. Null for
 * none. (Every custom document is one Step `my` under `my-exercises`.)
 */
export function customDocOf(docs: readonly PathDoc[]): PathDoc | null {
  const mine = docs.filter((d) => d.id === MY_EXERCISES_PATH_ID && d.steps.length > 0);
  if (mine.length === 0) return null;
  if (mine.length === 1) return mine[0];
  const [first] = mine;
  const seen = new Set<string>();
  const exercises: Exercise[] = [];
  for (const doc of mine) {
    for (const exercise of doc.steps[0].exercises) {
      if (seen.has(exercise.id)) continue;
      seen.add(exercise.id);
      exercises.push(exercise);
    }
  }
  return { ...first, steps: [{ ...first.steps[0], exercises }, ...first.steps.slice(1)] };
}
