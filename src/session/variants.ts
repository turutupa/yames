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

/** One key an Exercise can be played in: its variant's seed and the key's name ("Bb"). */
export type KeyChoice = { seed: number; key: string };

/**
 * The keys a key-moved Exercise offers (card #93), in the variants' order.
 * Empty unless every variant names a key and there are two or more of them:
 * an Exercise whose variants move the hand, not the key, has nothing to choose.
 */
export function keyChoicesOf(exercise: Exercise): KeyChoice[] {
  const variants = exercise.variation?.variants ?? [];
  if (!exercise.variation?.dimensions.includes("key") || variants.length < 2) return [];
  const out = variants.map((v, seed) => ({ seed, key: v.params.key ?? "" }));
  if (out.some((c) => !c.key)) return [];
  return new Set(out.map((c) => c.key)).size === out.length ? out : [];
}

/** A key as the chooser shows it: "Bb" is "B♭", "F# minor" is "F♯m". */
export function keySymbol(key: string): string {
  const match = /^([A-G])([#b]?)\s*(m|minor)?$/.exec(key.trim());
  if (!match) return key;
  const accidental = match[2] === "#" ? "\u266f" : match[2] === "b" ? "\u266d" : "";
  return `${match[1]}${accidental}${match[3] ? "m" : ""}`;
}

/** The store's key for the keys chosen, Exercise by Exercise. */
export const CHOSEN_KEYS_KEY = "session.chosenKeys";

/** Where a chosen key is kept: one entry per Exercise of a Path. */
export function chosenKeyId(pathId: string, exerciseId: string): string {
  return `${pathId}/${exerciseId}`;
}

/** The chosen keys as stored: variant ids by `chosenKeyId`. Anything else reads as none. */
export function readChosenKeys(saved: unknown): Record<string, string> {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return {};
  const out: Record<string, string> = {};
  for (const [id, variant] of Object.entries(saved as Record<string, unknown>)) {
    if (typeof variant === "string" && variant) out[id] = variant;
  }
  return out;
}

/**
 * The variant an Exercise played from its Step page starts in: the key the
 * player chose for it, while that key is still one of its variants; else the
 * next one in turn, exactly as Today picks it (`pickVariantSeed` over this
 * Exercise's Takes, newest first).
 */
export function stepPageSeed(
  exercise: Exercise,
  takes: readonly { variantSeed?: number | null }[],
  chosenVariantId: string | undefined,
): number | null {
  const variants = exercise.variation?.variants ?? [];
  if (chosenVariantId) {
    const at = variants.findIndex((v) => v.id === chosenVariantId);
    if (at >= 0) return at;
  }
  return pickVariantSeed(exercise, takes.length, takes[0]?.variantSeed ?? undefined);
}

