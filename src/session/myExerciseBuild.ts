/**
 * My exercises, the half that needs the generator: a recipe's key, adding one
 * (t2c's door), building the list again, and the line a row shows. Loaded only
 * with the list on screen (`MyExercisesList`, lazy) or by a tool that adds one;
 * the store itself is `myExercises.ts`.
 */
import { buildCustomExercise, recipeKey, recipeProblem } from "../paths/custom";
import type { BuildResult, Recipe } from "../paths/custom";
import { MY_EXERCISES_MAX } from "./myExercises";
import type { MyExercise } from "./myExercises";

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

/** Each entry built again, in list order. */
export function buildMyExercises(list: readonly MyExercise[]): Array<{ entry: MyExercise; built: BuildResult }> {
  return list.map((entry) => ({ entry, built: buildCustomExercise(entry.recipe) }));
}

/** The words moved to the light `myExerciseWords.ts` (t2c: Ask's preview says them without the generator). */
export { myExerciseLine } from "./myExerciseWords";
