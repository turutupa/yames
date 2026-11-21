/**
 * The half of "Add to today" that needs the generator (leg t2e): each stored
 * key's exercise built again from the list, as the document the Session plays
 * it from. Loaded lazily by `ChosenTodayParts`, only when something is chosen;
 * the Session runner never imports it (the generator stays out of it).
 */
import type { TFunction } from "i18next";
import type { MyExercise } from "../../session/myExercises";
import type { ChosenPart, ChosenParts } from "../../session/chosenToday";
import { buildCustomExercise } from "../../paths/custom";
import { keyOf } from "../../session/myExerciseBuild";
import { playableDoc } from "./MyExercises";

/** Every key's exercise on the list, built in the language on screen; those that do not build, by key. */
export function buildChosenParts(t: TFunction, list: readonly MyExercise[], keys: readonly string[]): ChosenParts {
  const parts: ChosenPart[] = [];
  const unbuiltKeys: string[] = [];
  for (const key of keys) {
    const entry = list.find((e) => keyOf(e) === key);
    if (!entry) continue; // removed from the list: not planned, nothing said
    try {
      const built = buildCustomExercise(entry.recipe);
      if (!built.ok) {
        unbuiltKeys.push(key);
        continue;
      }
      const path = playableDoc(t, built.exercise, built.summary);
      const exercise = path.steps[0]?.exercises[0];
      if (exercise) parts.push({ key, path, exercise });
      else unbuiltKeys.push(key);
    } catch (err) {
      // A build that throws is one that cannot be built: left out and said, never a crash.
      console.warn("[yames] could not build an exercise chosen for today", err);
      unbuiltKeys.push(key);
    }
  }
  return { parts, unbuiltKeys };
}
