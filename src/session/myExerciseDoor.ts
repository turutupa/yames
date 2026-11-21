/**
 * The coach's door to My exercises (leg t2c): `make_exercise`'s press adds a
 * recipe, and its receipt's Undo takes out exactly that entry. Both go through
 * the store's one writer, `updateMyExercises`, and t2b's list functions; nothing
 * here writes the key any other way. The generator half (`myExerciseBuild.ts`)
 * is loaded on the first press, never with the shell.
 */
import type { Recipe } from "../paths/custom";
import type { MyExerciseAdd, MyExerciseUndo } from "../coach/tools/host";
import { myExercisesStoredEntries, removeMyExercise, updateMyExercises } from "./myExercises";

/** Add `recipe` at the top, dated `addedAt`: what the list said, or that it could not be kept. */
export async function addRecipeToMyExercises(recipe: Recipe, addedAt: number): Promise<MyExerciseAdd> {
  const { addMyExercise } = await import("./myExerciseBuild");
  let refused: "full" | "already" | "badRecipe" | null = null;
  const update = await updateMyExercises((list) => {
    const result = addMyExercise(list, recipe, addedAt);
    refused = result.ok ? null : result.why;
    return result.ok ? result.list : null;
  });
  if (update === "saved") return "added";
  if (update === "unchanged") return refused ?? "failed";
  return update;
}

/**
 * The Undo of one add: the entry with this recipe key AND this date, the one the
 * press added, taken out with `removeMyExercise`. Another entry with the same
 * notes (it cannot exist: `already`), an older one, or one the player removed
 * since: `gone`, and nothing is written.
 */
export async function undoAddedRecipe(key: string, addedAt: number): Promise<MyExerciseUndo> {
  const { keyOf } = await import("./myExerciseBuild");
  let found = false;
  const update = await updateMyExercises((list) => {
    const entry = list.find((e) => e.addedAt === addedAt && keyOf(e) === key);
    found = entry !== undefined;
    return entry ? removeMyExercise(list, entry, myExercisesStoredEntries()).list : null;
  });
  if (update === "saved") return "undone";
  if (update === "unchanged") return found ? "failed" : "gone";
  return update;
}
