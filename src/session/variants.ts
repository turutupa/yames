/**
 * Where Levels, Exercise variants and warm-up Exercises plug in.
 *
 * The Path format has these as additive fields (`paths/format.ts`: `levels`,
 * `Exercise.variation`, `Level.warmups`). A pack without them must behave
 * exactly as it did before, so everything here answers "none" for such a pack,
 * and the rest of the runtime asks only here, never reads the fields.
 */
import type { Exercise, Level, PathDoc } from "../paths/format";

/** The Levels this Path offers, none of them locked. Empty: no choice to make. */
export function levelsOf(path: PathDoc): Level[] {
  return path.levels ?? [];
}

/** How many variants an Exercise has. Zero: its notes are its notes. */
export function variantCountOf(exercise: Exercise): number {
  return exercise.variation?.variants.length ?? 0;
}

/**
 * Which variant to play, deterministically, and never the last one again.
 *
 * Walks the variants in order by how many Takes there have been, and steps past
 * the one just played. Null when the Exercise has none. The result is stored
 * with the Take, so history and grading know exactly which notes these were.
 */
export function pickVariantSeed(
  exercise: Exercise,
  takesSoFar: number,
  lastSeed: number | undefined,
): number | null {
  const count = variantCountOf(exercise);
  if (count === 0) return null;
  const seed = takesSoFar % count;
  if (count > 1 && seed === lastSeed) return (seed + 1) % count;
  return seed;
}

/**
 * The warm-ups of the Level a Step belongs to. Empty: a warm-up borrows one of
 * the Path's Exercises, as in a pack written before Levels.
 */
export function warmupsOf(path: PathDoc, stepId: string): Exercise[] {
  return levelsOf(path).find((level) => level.stepIds.includes(stepId))?.warmups ?? [];
}
