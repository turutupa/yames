/**
 * The coach's door to My exercises (`myExerciseDoor.ts`; leg t2cb, review t2c
 * finding 2) against the store as the app has it (`updateMyExercises` over the
 * mocked settings store, as `myExercises.test.ts` does): the Undo takes out the
 * entry with this key AND this date and nothing else, answers `gone` with
 * nothing written when that entry is not there, and is queued behind its add.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Recipe } from "../paths/custom";
import { installSettings } from "../test/parity/store";
import { keyOf } from "./myExerciseBuild";
import { addRecipeToMyExercises, undoAddedRecipe } from "./myExerciseDoor";
import {
  MY_EXERCISES_KEY,
  loadMyExercises,
  myExercisesNow,
  myExercisesStoredEntries,
  removeMyExercise,
  resetMyExercisesForTest,
  updateMyExercises,
  type MyExercise,
} from "./myExercises";

const MOCK_17: Recipe = { v: 1, shape: "box", root: "A", scale: "minorPentatonic", position: 5, subdivision: "eighths", bars: 3, direction: "upAndBack" };
const CHROMATIC: Recipe = { v: 1, shape: "chromatic", position: 5, subdivision: "eighths", bars: 6, direction: "up" };
const entry = (recipe: Recipe, addedAt: number): MyExercise => ({ recipe, addedAt });
const KEY = keyOf(entry(MOCK_17, 0))!;

afterEach(() => resetMyExercisesForTest());

describe("the coach's door to My exercises", () => {
  it("add, then undo: the entry is gone, and only it", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [entry(CHROMATIC, 1)] });
    await loadMyExercises();
    expect(await addRecipeToMyExercises(MOCK_17, 100)).toBe("added");
    expect(myExercisesNow()).toEqual([entry(MOCK_17, 100), entry(CHROMATIC, 1)]);
    expect(await undoAddedRecipe(KEY, 100)).toBe("undone");
    expect(myExercisesNow()).toEqual([entry(CHROMATIC, 1)]);
    expect(fake.writes.map(([key]) => key)).toEqual([MY_EXERCISES_KEY, MY_EXERCISES_KEY]);
    expect(fake.writes[1][1]).toEqual([entry(CHROMATIC, 1)]);
  });

  it("an older entry with the same key, an add refused as already, then the Undo with the new date: the older entry stays, gone", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [entry(MOCK_17, 7)] });
    await loadMyExercises();
    // "root" is fret 5 for A's box: the same notes, the same key.
    expect(await addRecipeToMyExercises({ ...MOCK_17, position: "root" }, 200)).toBe("already");
    expect(await undoAddedRecipe(KEY, 200)).toBe("gone");
    expect(myExercisesNow()).toEqual([entry(MOCK_17, 7)]);
    expect(fake.writes).toEqual([]);
  });

  it("add, then the list's own Remove, then the Undo: gone, and nothing written", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [] });
    await loadMyExercises();
    expect(await addRecipeToMyExercises(MOCK_17, 300)).toBe("added");
    const added = myExercisesNow()[0];
    expect(await updateMyExercises((list) => removeMyExercise(list, added, myExercisesStoredEntries()).list)).toBe("saved");
    const writes = fake.writes.length;
    expect(await undoAddedRecipe(KEY, 300)).toBe("gone");
    expect(fake.writes).toHaveLength(writes);
    expect(myExercisesNow()).toEqual([]);
  });

  it("the same key with another date (the entry the player added later by Ask) is not this Undo's", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [entry(MOCK_17, 400)] });
    await loadMyExercises();
    expect(await undoAddedRecipe(KEY, 399)).toBe("gone");
    expect(myExercisesNow()).toEqual([entry(MOCK_17, 400)]);
    expect(fake.writes).toEqual([]);
  });

  it("add and Undo issued back to back, before the store was read: the Undo is queued behind the add and finds it", async () => {
    const fake = await installSettings({ [MY_EXERCISES_KEY]: [entry(CHROMATIC, 1)] });
    const add = addRecipeToMyExercises(MOCK_17, 500);
    const undo = undoAddedRecipe(KEY, 500);
    expect(await add).toBe("added");
    expect(await undo).toBe("undone");
    expect(myExercisesNow()).toEqual([entry(CHROMATIC, 1)]);
    expect(fake.writes.map(([, rows]) => rows)).toEqual([[entry(MOCK_17, 500), entry(CHROMATIC, 1)], [entry(CHROMATIC, 1)]]);
  });
});
