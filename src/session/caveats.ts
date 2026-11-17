/**
 * When the "I can't hear pick direction" line belongs on a screen (QA
 * 2026-11-17 #15): only on an Exercise that prints pick strokes and asks for a
 * picking plan. A Blues lick, a band Take with free picking or a legato-only
 * line has no strokes to get wrong, so the caveat would be noise there.
 */
import type { Exercise, Step } from "../paths/format";

export function pickDirectionMatters(exercise: Pick<Exercise, "pickPlan" | "notes">): boolean {
  return exercise.pickPlan !== "free" && exercise.notes.some((n) => n.pick !== undefined);
}

/** A Step page shows it when any of its Exercises needs it. */
export function stepPickDirectionMatters(step: Step): boolean {
  return step.exercises.some(pickDirectionMatters);
}
