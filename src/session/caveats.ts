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

/**
 * The "what I hear, and that down-up is on you" line, worded from what this
 * Exercise actually grades, or null where it does not belong. "I hear notes
 * and timing" is only true where the pitches are checked (`noteIdentity`): a
 * timing-only Path such as Sweep must not claim it (content review,
 * 2026-11-17), and a self-checked Exercise grades nothing at all.
 */
export function honestLineKey(
  exercise: Pick<Exercise, "pickPlan" | "notes" | "grading" | "graded">,
): "session.run.honest" | "session.run.honestTiming" | null {
  if (exercise.grading !== "graded" || !pickDirectionMatters(exercise)) return null;
  return exercise.graded.includes("noteIdentity") ? "session.run.honest" : "session.run.honestTiming";
}

/** A Step page's line: the plainer wording when any graded Exercise there is timing-only. */
export function stepHonestLineKey(step: Step): "session.run.honest" | "session.run.honestTiming" | null {
  const keys = step.exercises.map(honestLineKey).filter((k) => k !== null);
  if (keys.length === 0) return null;
  return keys.includes("session.run.honestTiming") ? "session.run.honestTiming" : "session.run.honest";
}
