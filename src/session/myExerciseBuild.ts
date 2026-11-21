/**
 * My exercises, the half that needs the generator: a recipe's key, adding one
 * (t2c's door), building the list again, and the line a row shows. Loaded only
 * with the list on screen (`MyExercisesList`, lazy) or by a tool that adds one;
 * the store itself is `myExercises.ts`.
 */
import type { TFunction } from "i18next";
import { buildCustomExercise, recipeKey, recipeProblem } from "../paths/custom";
import type { BuildResult, CustomSummary, Recipe } from "../paths/custom";
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
