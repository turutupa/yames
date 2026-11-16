/**
 * The tempo ladder: which rungs an Exercise has, and how to move on them.
 *
 * Only `graded` rungs. A self-checked rung is one the app has said it cannot
 * judge, so a Session never climbs onto one by itself.
 */
import type { Exercise } from "../paths/format";

/** The graded rungs, slowest first. */
export function gradedRungs(exercise: Exercise): number[] {
  return exercise.tempo.rungs
    .filter((rung) => rung.grading === "graded")
    .map((rung) => rung.bpm)
    .sort((a, b) => a - b);
}

/** The first rung, where someone who has never played this begins. */
export function firstRung(exercise: Exercise): number {
  const rungs = gradedRungs(exercise);
  return rungs[0] ?? exercise.tempo.rungs[0]?.bpm ?? 60;
}

/** The rung `steps` above `bpm`, or the top one. `bpm` need not be a rung. */
export function rungAbove(exercise: Exercise, bpm: number, steps = 1): number {
  const rungs = gradedRungs(exercise);
  if (rungs.length === 0) return bpm;
  const at = rungs.findIndex((rung) => rung > bpm);
  if (at < 0) return rungs[rungs.length - 1];
  return rungs[Math.min(rungs.length - 1, at + steps - 1)];
}

/** The rung `steps` below `bpm`, or the bottom one. */
export function rungBelow(exercise: Exercise, bpm: number, steps = 1): number {
  const rungs = gradedRungs(exercise);
  if (rungs.length === 0) return bpm;
  let at = -1;
  for (let i = 0; i < rungs.length; i += 1) if (rungs[i] < bpm) at = i;
  if (at < 0) return rungs[0];
  return rungs[Math.max(0, at - steps + 1)];
}

/** Is there a rung faster than this one? */
export function hasRungAbove(exercise: Exercise, bpm: number): boolean {
  return gradedRungs(exercise).some((rung) => rung > bpm);
}

/** Is there a rung slower than this one? */
export function hasRungBelow(exercise: Exercise, bpm: number): boolean {
  return gradedRungs(exercise).some((rung) => rung < bpm);
}
