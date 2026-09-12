/**
 * The shape of a chorus: how many bars it is, and where its sections fall.
 *
 * Losing your place in the form is the number one bedroom improv problem
 * (JAM_MODE §4.2), and the timeline that fixes it needs two things — a bar
 * count, and the seams between sections so twelve cells read as three fours
 * rather than as twelve of something.
 */
import { JAM_FORM_BARS, JAM_MAX_FORM_BARS } from "./types";
import type { JamForm, JamFormKind } from "./types";

export const JAM_FORM_KINDS: readonly JamFormKind[] = [
  "blues12",
  "loop8",
  "bars16",
  "aaba32",
  "one",
  "custom",
];

/** 1..64, whole bars — the engine's own limit, applied before it is asked. */
export function clampFormBars(bars: number): number {
  return Math.max(1, Math.min(JAM_MAX_FORM_BARS, Math.round(bars || 1)));
}

/** Bars in one chorus. `custom` carries its own; everything else is fixed. */
export function formBars(form: JamForm): number {
  if (form.kind === "custom") return clampFormBars(form.bars);
  return JAM_FORM_BARS[form.kind];
}

/**
 * The sections, as bar counts that sum to the form's length.
 *
 * A blues is three fours because that is how it is counted — four of the one
 * chord, two of the four and two back, then the turnaround — and the seams are
 * where a player checks whether they are still with it. A custom form is one
 * run of bars until the section editor arrives (JAM_MODE §4.2, second
 * release).
 */
export function formSections(form: JamForm): number[] {
  switch (form.kind) {
    case "blues12":
      return [4, 4, 4];
    case "loop8":
      return [8];
    case "bars16":
      return [8, 8];
    case "aaba32":
      return [8, 8, 8, 8];
    case "one":
      return [4];
    case "custom":
      return [clampFormBars(form.bars)];
  }
}

/**
 * What to write above each section, or an empty string for "nothing".
 *
 * Only AABA is lettered, because only there are the letters the form's own
 * name — they are how the shape is described and how a player counts it. The
 * three fours of a blues have no names, and inventing A, B, C for them would
 * put a label on the screen that no musician uses for that music. The seam
 * between sections is drawn either way; it is the seam that does the work.
 */
export function formSectionNames(form: JamForm): string[] {
  if (form.kind === "aaba32") return ["A", "A", "B", "A"];
  return formSections(form).map(() => "");
}

/** The 0-based bar each section starts on — what the timeline draws rules at. */
export function sectionStarts(form: JamForm): number[] {
  const starts: number[] = [];
  let cursor = 0;
  for (const section of formSections(form)) {
    starts.push(cursor);
    cursor += section;
  }
  return starts;
}
