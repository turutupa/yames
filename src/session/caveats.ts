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

/**
 * Exercises whose own coach line already says that pick direction is the
 * player's to keep (acceptance P1-4, 2026-11-18): on their ready screen the
 * app's caveat would say it a second time, a line under the coach saying it.
 * Ids, not wording, so the check holds in every language; `caveats.test.ts`
 * reads the English packs and fails when a coach line says it and is not here.
 */
const COACH_SAYS_PICK = new Set([
  "even-eighths.open-string",
  "crossing.outside-shuttle",
  "crossing.outside-pairs",
  "economy.ascending-economy",
  "economy.descending-economy",
  "eighths.eighth-riff",
  "gallop.gallop-one",
  "gallop-changes.gallop-bar-changes",
  "gallop-changes.reverse-bar-changes",
  "gallop-changes.two-beat-changes",
  "gallop-changes.band-changes",
  "two-part-riff.pedal-part",
  "two-part-riff.gallop-part",
  "two-part-riff.two-parts-joined",
]);

export function coachSaysPick(exercise: Pick<Exercise, "id">): boolean {
  return COACH_SAYS_PICK.has(exercise.id);
}

/** The caveat for a ready screen: as `honestLineKey`, but never twice with the coach's own line. */
export function readyHonestLineKey(
  exercise: Pick<Exercise, "id" | "pickPlan" | "notes" | "grading" | "graded">,
): "session.run.honest" | "session.run.honestTiming" | null {
  return coachSaysPick(exercise) ? null : honestLineKey(exercise);
}
