/**
 * Where Levels, Exercise variants and warm-up Exercises plug in.
 *
 * The Path format is gaining these as additive fields. A pack without them must
 * behave exactly as it does today, so everything here answers "none" for such a
 * pack, and the rest of the runtime asks only here, never reads the fields.
 * When the format lands, these readers are the part that changes.
 */
import type { Exercise, PathDoc } from "../paths/format";

/** A Level a player may choose, with no lock on any of them. */
export type PathLevel = { id: string; title: string };

/** The Levels this Path offers. Empty: the Path has no such choice to make. */
export function levelsOf(path: PathDoc): PathLevel[] {
  const levels = (path as PathDoc & { levels?: unknown }).levels;
  if (!Array.isArray(levels)) return [];
  return levels.filter(
    (level): level is PathLevel =>
      typeof level === "object" &&
      level !== null &&
      typeof (level as PathLevel).id === "string" &&
      typeof (level as PathLevel).title === "string",
  );
}

/** How many variants an Exercise has. Zero: its notes are its notes. */
export function variantCountOf(exercise: Exercise): number {
  const variants = (exercise as Exercise & { variants?: unknown }).variants;
  if (Array.isArray(variants)) return variants.length;
  return typeof variants === "number" && variants > 0 ? Math.floor(variants) : 0;
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

/** The Path's own warm-ups. Empty: a warm-up borrows one of its Exercises. */
export function warmupsOf(path: PathDoc): Exercise[] {
  const warmups = (path as PathDoc & { warmups?: unknown }).warmups;
  return Array.isArray(warmups) ? (warmups as Exercise[]) : [];
}
