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
  chosenTodayStored,
  customDocOf,
  loadChosenToday,
  readChosenToday,
  resetChosenTodayForTest,
  updateChosenToday,
  withKey,
  withKeyAt,
  withoutKey,
} from "./chosenToday";
import { MY_EXERCISES_KEY, loadMyExercises, resetMyExercisesForTest, updateMyExercises } from "./myExercises";
import { dayKey } from "./swap";
import { buildCustomExercise, customPathDoc } from "../paths/custom";
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
