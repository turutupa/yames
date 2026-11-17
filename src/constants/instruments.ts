/**
 * Guitar first (owner decision, 2026-11-17).
 *
 * The learning side — Paths, the planner, Sessions — is written for guitar:
 * tab and a six-string neck. The tools (metronome, drills, jam) work for every
 * instrument in `INSTRUMENTS`, and Settings still offers all of them. This file
 * is the one place that decides what counts as a guitar, so the first run, the
 * Today note and anything later agree.
 */

/** What the first run offers: the two guitars, electric first. */
export const GUITAR_INSTRUMENTS = ["electric-guitar", "acoustic-guitar"] as const;

/** The fallback when nobody picked: a skipped or closed first run. */
export const DEFAULT_INSTRUMENT = "electric-guitar";

/** True for the instruments the Paths are written for. Bass is not, yet. */
export function isGuitar(id: string | null | undefined): boolean {
  return (GUITAR_INSTRUMENTS as readonly string[]).includes(id ?? "");
}

/**
 * How well the learning side fits this instrument: `guitar` fits, `bass` is
 * planned (its own copy says so), `other` is everything else.
 */
export type LearningFit = "guitar" | "bass" | "other";

export function learningFit(id: string | null | undefined): LearningFit {
  if (isGuitar(id)) return "guitar";
  return id === "bass" ? "bass" : "other";
}
