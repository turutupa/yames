/**
 * The words a screen shows for an Exercise as played: the variant's own
 * `purpose` and `howTo` when the Take plays a variant that has them, the
 * Exercise's otherwise (`plans/PATHS_PIPELINE.md`, per-variant text). The
 * packs arrive already in the player's language (`localizePack` resolves
 * `exercise.<id>.variant.<variantId>.*`), so nothing here translates.
 */
import type { Exercise } from "../paths/format";
import { withVariant } from "./take";

export type ExerciseWords = {
  purpose: string;
  /** Every how-to line, in order; empty lines dropped. */
  howTo: string[];
};

const said = (text: string | undefined | null): text is string => typeof text === "string" && text.trim() !== "";

/**
 * `played` is the concrete Exercise of the Take (`take.exercise`, the variant
 * merged in), `base` the Exercise as written. Each field falls back on its own:
 * a variant with its own how-to but no purpose keeps the Exercise's purpose.
 */
export function exerciseWords(
  base: Pick<Exercise, "purpose" | "howTo"> | null | undefined,
  played?: Pick<Exercise, "purpose" | "howTo"> | null,
): ExerciseWords {
  const playedHow = (played?.howTo ?? []).filter(said);
  const baseHow = (base?.howTo ?? []).filter(said);
  return {
    purpose: said(played?.purpose) ? played.purpose : said(base?.purpose) ? base.purpose : "",
    howTo: playedHow.length > 0 ? playedHow : baseHow,
  };
}

/** The purpose of a planned Exercise step, in its planned variant's words when it has some. */
export function plannedPurpose(exercise: Exercise, variantSeed: number | null | undefined): string {
  return exerciseWords(exercise, withVariant(exercise, variantSeed)).purpose;
}
