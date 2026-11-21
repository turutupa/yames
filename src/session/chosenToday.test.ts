/**
 * Today's chosen exercises (leg t2e): the key is for one local day, written
 * only by a press, through the same queue as the list.
 */
import { afterEach, describe, expect, it } from "vitest";
import { installSettings } from "../test/parity/store";
import {
  CHOSEN_TODAY_KEY,
  CHOSEN_TODAY_MAX,
  chosenKeysOn,
  chosenNotPlayed,
  chosenTodayStored,
  customDocOf,
  keysOnList,
  loadChosenToday,
  readChosenToday,
  resetChosenTodayForTest,
  updateChosenToday,
  withKey,
  withKeyAt,
  withKeyOnList,
  withoutKey,
} from "./chosenToday";
import { MY_EXERCISES_KEY, loadMyExercises, resetMyExercisesForTest, updateMyExercises } from "./myExercises";
import { dayKey } from "./swap";
import { buildCustomExercise, customPathDoc, recipeKey } from "../paths/custom";
import { MOCK_17_KEY } from "../shots/scenarios";
import type { Recipe } from "../paths/custom";

const NOW = new Date(2026, 10, 21, 15, 0).getTime();
const TOMORROW = new Date(2026, 10, 22, 0, 1).getTime();
const TODAY = dayKey(NOW);

afterEach(() => {
  resetChosenTodayForTest();
  resetMyExercisesForTest();
});

describe("reading the key", () => {
  it("missing or null: nothing chosen; another shape: unreadable", () => {
    expect(readChosenToday(undefined)).toBeNull();
    expect(readChosenToday(null)).toBeNull();
    for (const bad of [[], "x", 3, { day: "today", keys: [] }, { day: TODAY }, { keys: [] }]) {
      expect(readChosenToday(bad)).toBeUndefined();
    }
    expect(readChosenToday({ day: TODAY, keys: ["a", 3, "", "a", "b"] })).toEqual({ day: TODAY, keys: ["a", "b"] });
  });

  it("the keys hold on their own day only", () => {
    const stored = { day: TODAY, keys: ["a"] };
    expect(chosenKeysOn(stored, NOW)).toEqual(["a"]);
    expect(chosenKeysOn(stored, TOMORROW)).toEqual([]);
    expect(chosenKeysOn(null, NOW)).toEqual([]);
  });

  it("loading writes nothing, on the day or after it", async () => {
    const fake = await installSettings({ [CHOSEN_TODAY_KEY]: { day: "2026-11-20", keys: ["a"] } });
    await loadChosenToday();
    expect(chosenKeysOn(chosenTodayStored(), NOW)).toEqual([]);
    expect(fake.writes).toEqual([]);
  });
});

describe("the press", () => {
  it("Add to today, Take off today, and the Undo of each", async () => {
    const fake = await installSettings({});
    expect(await updateChosenToday((k) => withKey(k, "a"), NOW)).toBe("saved");
    expect(await updateChosenToday((k) => withKey(k, "b"), NOW)).toBe("saved");
    expect(fake.writes.at(-1)).toEqual([CHOSEN_TODAY_KEY, { day: TODAY, keys: ["a", "b"] }]);
    // Take "a" off, then Undo: back where it was.
    expect(await updateChosenToday((k) => withoutKey(k, "a"), NOW)).toBe("saved");
    expect(chosenTodayStored()?.keys).toEqual(["b"]);
    expect(await updateChosenToday((k) => withKeyAt(k, "a", 0), NOW)).toBe("saved");
    expect(chosenTodayStored()?.keys).toEqual(["a", "b"]);
    // Undo of an Add.
    expect(await updateChosenToday((k) => withoutKey(k, "b"), NOW)).toBe("saved");
    expect(chosenTodayStored()?.keys).toEqual(["a"]);
  });

  it("the same one twice, or one past the most: unchanged, nothing written", async () => {
    const fake = await installSettings({ [CHOSEN_TODAY_KEY]: { day: TODAY, keys: ["a"] } });
    expect(await updateChosenToday((k) => withKey(k, "a"), NOW)).toBe("unchanged");
    expect(await updateChosenToday((k) => withoutKey(k, "zz"), NOW)).toBe("unchanged");
    const full = Array.from({ length: CHOSEN_TODAY_MAX }, (_, i) => `k${i}`);
    expect(await updateChosenToday(() => full, NOW)).toBe("saved");
    expect(await updateChosenToday((k) => withKey(k, "more"), NOW)).toBe("unchanged");
    expect(await updateChosenToday(() => [...full, "more"], NOW)).toBe("unchanged");
    expect(fake.writes).toHaveLength(1);
  });

  it("only exercises on the list fill a place; a removed one's key is dropped only by a press at the cap (t2eb M2)", async () => {
    const onList = new Set(["a", "b", "d"]);
    // "c" was removed from the list: it stays stored, and does not count.
    const keys = ["a", "b", "c"];
    expect(keys.length).toBe(CHOSEN_TODAY_MAX);
    expect(keysOnList(keys, onList)).toBe(2);
    expect(withKeyOnList(keys, "d", onList)).toEqual(["a", "b", "d"]);
    // Below the cap, a removed one's key is kept (the Remove's Undo brings it back to today).
    expect(withKeyOnList(["a", "c"], "d", onList)).toEqual(["a", "c", "d"]);
    // Full of exercises on the list, or already there: unchanged.
    expect(withKeyOnList(["a", "b", "d"], "e", new Set(["a", "b", "d", "e"]))).toBeNull();
    expect(withKeyOnList(["a"], "a", onList)).toBeNull();
    // Through the store: the press at the cap writes the new key and drops "c".
    const fake = await installSettings({ [CHOSEN_TODAY_KEY]: { day: TODAY, keys } });
    expect(await updateChosenToday((k) => withKeyOnList(k, "d", onList), NOW)).toBe("saved");
    expect(fake.writes).toEqual([[CHOSEN_TODAY_KEY, { day: TODAY, keys: ["a", "b", "d"] }]]);
  });

  it("the parts still to play after a Session are those it did not play (t2eb M1)", () => {
    const part = (id: string) => ({ exercise: { id } });
    const chosen = [part("my.a"), part("my.b")];
    expect(chosenNotPlayed(chosen, [])).toEqual(chosen);
    // Played "a" (twice, and a Path's Exercise beside it): only "b" is left; "b" ended early stays.
    expect(chosenNotPlayed(chosen, [{ exerciseId: "my.a" }, { exerciseId: "my.a" }, { exerciseId: "alt-1" }])).toEqual([
      part("my.b"),
    ]);
    expect(chosenNotPlayed(chosen, [{ exerciseId: "my.a" }, { exerciseId: "my.b" }])).toEqual([]);
  });

  it("a press on a new day starts from none: yesterday's keys are not carried over", async () => {
    const fake = await installSettings({ [CHOSEN_TODAY_KEY]: { day: TODAY, keys: ["a", "b"] } });
    expect(await updateChosenToday((k) => withKey(k, "c"), TOMORROW)).toBe("saved");
    expect(fake.writes).toEqual([[CHOSEN_TODAY_KEY, { day: dayKey(TOMORROW), keys: ["c"] }]]);
  });

  it("an unreadable value is never written over", async () => {
    const fake = await installSettings({ [CHOSEN_TODAY_KEY]: ["a"] });
    expect(await updateChosenToday((k) => withKey(k, "b"), NOW)).toBe("unreadable");
    expect(fake.writes).toEqual([]);
  });

  it("runs in the list's queue: a press waits for the list's writer before it", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [] });
    await loadMyExercises();
    const order: string[] = [];
    const list = updateMyExercises(() => {
      order.push("list");
      return [];
    });
    const today = updateChosenToday((k) => {
      order.push("today");
      return withKey(k, "a");
    }, NOW);
    await Promise.all([list, today]);
    expect(order).toEqual(["list", "today"]);
    expect(fake.writes.map(([k]) => k)).toEqual([MY_EXERCISES_KEY, CHOSEN_TODAY_KEY]);
  });
});

describe("the runner's one custom document", () => {
  const A: Recipe = {
    v: 1,
    shape: "box",
    root: "A",
    scale: "minorPentatonic",
    position: 5,
    subdivision: "eighths",
    bars: 3,
    direction: "upAndBack",
  };
  const B: Recipe = { v: 1, shape: "chromatic", position: 5, subdivision: "eighths", bars: 6, direction: "up" };
  const docOf = (r: Recipe) => {
    const built = buildCustomExercise(r);
    if (!built.ok) throw new Error(`does not build: ${JSON.stringify(built.why)}`);
    return customPathDoc(built.exercise);
  };

  it("the scenes' written-out key is mock 17's recipe key", () => {
    expect(recipeKey(A)).toBe(MOCK_17_KEY);
  });

  it("holds every chosen Exercise once, under one Path and Step", () => {
    expect(customDocOf([])).toBeNull();
    const a = docOf(A);
    const b = docOf(B);
    expect(customDocOf([a])).toBe(a);
    const both = customDocOf([a, b, a])!;
    expect(both.id).toBe(a.id);
    expect(both.steps).toHaveLength(1);
    expect(both.steps[0].exercises.map((e) => e.id)).toEqual([
      a.steps[0].exercises[0].id,
      b.steps[0].exercises[0].id,
    ]);
  });
});
