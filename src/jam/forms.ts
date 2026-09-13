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

/** A run of bars, 0-based and inclusive at both ends — what a loop is. */
export type BarRange = { start: number; end: number };

/**
 * Each section as the range of bars it covers, inclusive.
 *
 * Inclusive because that is what `JamPositionCommand.loop` is, and a loop of a
 * section is the only thing this is for. Converting between half-open and
 * inclusive at the call site is exactly the off-by-one that would loop three
 * bars of a four-bar section and be blamed on the engine.
 */
export function sectionRanges(form: JamForm): BarRange[] {
  const ranges: BarRange[] = [];
  let cursor = 0;
  for (const length of formSections(form)) {
    ranges.push({ start: cursor, end: cursor + length - 1 });
    cursor += length;
  }
  return ranges;
}

/** Which section a bar falls in, 0-based. Out-of-range bars clamp to an end. */
export function sectionIndexAt(form: JamForm, bar: number): number {
  const ranges = sectionRanges(form);
  if (ranges.length === 0) return 0;
  for (let i = 0; i < ranges.length; i += 1) {
    if (bar <= ranges[i].end) return i;
  }
  return ranges.length - 1;
}

/**
 * The section you land on stepping `by` sections from `bar`, wrapping.
 *
 * Wrapping rather than stopping: a footswitch pressed on the last section of a
 * chorus means "round to the top", not "do nothing" — the form is a circle and
 * the button that walks it should be too.
 */
export function stepSection(form: JamForm, bar: number, by: number): BarRange {
  const ranges = sectionRanges(form);
  const at = sectionIndexAt(form, bar);
  const count = ranges.length;
  return ranges[(((at + by) % count) + count) % count];
}

// ---------------------------------------------------------------------------
// Fills
// ---------------------------------------------------------------------------

/**
 * The choices the Fills control offers, as `fillEvery` values.
 *
 * 0 is the chorus end and nothing else, which is what the contract's
 * `fillEvery` means when it is absent or zero. "Off" is not in this list
 * because off is `fills: false` — a separate switch on the record, and the
 * one the crash on the one hangs off as well.
 */
export const JAM_FILL_EVERY_CHOICES: readonly number[] = [0, 4, 8];

/**
 * Does this bar carry a fill?
 *
 * The last bar of the chorus always does when fills are on — that is the
 * gesture the crash on the next one answers — and `fillEvery` adds every bar
 * whose 1-BASED number within the chorus is a multiple of it. One-based
 * because that is what the contract says and what a player counts: "a fill
 * every four bars" means bars 4, 8 and 12, not bars 5, 9 and 13.
 */
export function barHasFill(args: {
  /** 0-based bar within the chorus. */
  index: number;
  /** Bars in the chorus. */
  total: number;
  fills: boolean;
  /** 0 or absent: the last bar only. */
  fillEvery?: number;
}): boolean {
  const { index, total, fills } = args;
  if (!fills || total <= 0 || index < 0 || index >= total) return false;
  if (index === total - 1) return true;
  const every = Math.trunc(args.fillEvery ?? 0);
  if (every <= 0) return false;
  return (index + 1) % every === 0;
}
