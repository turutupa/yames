/**
 * Where a jam take is, while you are watching it back (W33 item 1).
 *
 * The screen that plays a take needs three things the compositor already
 * knows how to work out, and one it does not. Which bar of the form is
 * sounding, which time round it is, and what the chord is: `jamStrip.ts`
 * answers all three for the canvas, and this answers them for the DOM off the
 * same `JamTapeShape`, so the bar lit under the picture and the bar lit in the
 * video a player then saves cannot disagree.
 *
 * The one it does not is the other direction — "put me at the top of bar
 * nine" — which is what scrubbing by bar is, and which a compositor never has
 * to do because a clip only ever runs forwards.
 *
 * Pure arithmetic over a shape and a number of milliseconds, in its own file
 * with its own tests, because "the fifth bar of the second chorus is lit at
 * the moment the fifth bar of the second chorus sounds" is exactly the kind
 * of off-by-one that is invisible on a screen and obvious in a test.
 */
import type { JamTapeShape } from "./jamStrip";
import { chordAt } from "./jamStrip";

/** Where the take is, said the way a musician counts. */
export type JamAt = {
  /** Bars since the take's first sample, 0-based. Never negative. */
  barsIn: number;
  /** The bar of the FORM, 0-based — what the grid lights. */
  formBar: number;
  /** Which time round the form, 1-based — what a player calls a chorus. */
  chorus: number;
  /** The beat inside the bar, 0-based and fractional. */
  beat: number;
  /** The chord on this bar, or "" when the jam is not showing chords. */
  chord: string;
  /** The chord on the next bar, or "" — left out when it is this one again. */
  next: string;
};

/**
 * Read the clock.
 *
 * `ms` is milliseconds from the take's FIRST SAMPLE, not from bar one of the
 * form: a take that began half way through a chorus has `shape.startBar` to
 * account for, and that offset is the shape's business rather than the
 * caller's. Before the start and past the end both clamp, because a media
 * element hands out both and neither is a bug.
 */
export function jamAt(shape: JamTapeShape, ms: number): JamAt {
  const barMs = shape.barMs > 0 ? shape.barMs : 1;
  const at = Math.max(0, Math.min(ms, shape.lengthMs));
  const barsIn = Math.floor(at / barMs);
  const formBars = Math.max(1, shape.formBars);
  const absolute = shape.startBar + barsIn;
  const next = chordAt(shape, barsIn + 1);
  const chord = chordAt(shape, barsIn);
  return {
    barsIn,
    formBar: ((absolute % formBars) + formBars) % formBars,
    chorus: Math.floor(absolute / formBars) + 1,
    beat: shape.beatMs > 0 ? (at - barsIn * barMs) / shape.beatMs : 0,
    chord,
    // The same rule the clip's "next Bb7" keeps: on a blues most bars are
    // followed by themselves, and saying so reads as a stutter.
    next: next && next !== chord ? next : "",
  };
}

/** The instant the `barsIn`th bar of the take starts, clamped into it. */
export function msAtJamBar(shape: JamTapeShape, barsIn: number): number {
  const barMs = shape.barMs > 0 ? shape.barMs : 1;
  return Math.max(0, Math.min(Math.max(0, Math.round(barsIn)) * barMs, shape.lengthMs));
}

/**
 * How many bars the take holds — at least one, so a grid is never empty.
 *
 * A take that stopped a beat into a bar still shows that bar: it is a bar you
 * played into, and a grid that dropped it would end on the wrong number.
 */
export function jamBarCount(shape: JamTapeShape): number {
  const barMs = shape.barMs > 0 ? shape.barMs : 1;
  return Math.max(1, Math.ceil(shape.lengthMs / barMs));
}

/**
 * One time round the form, as cells to draw.
 *
 * The grid shows the CHORUS you are in and not the whole take, and that is a
 * reading decision before it is a layout one: a jam is read as "bar five of
 * twelve, third time round", which is how the stage's own timeline draws it
 * and how a player counts out loud. A six-minute take is a hundred and fifty
 * bars, and a hundred and fifty cells is a wall — it was also four hundred
 * pixels of drawer and put the play button below the fold at 480×780.
 *
 * `barsIn` is null for a cell the take does not contain: a take that started
 * on bar eight has seven empty cells before it, and a take that stopped in
 * the middle of a chorus has empty ones after. Drawn rather than dropped, so
 * the grid is the FORM and always the same width — the bar you are looking
 * for is in the same place every time round.
 */
export function jamChorusBars(
  shape: JamTapeShape,
  chorus: number,
): { formBar: number; barsIn: number | null; chord: string }[] {
  const formBars = Math.max(1, shape.formBars);
  const last = jamBarCount(shape) - 1;
  const out: { formBar: number; barsIn: number | null; chord: string }[] = [];
  for (let i = 0; i < formBars; i++) {
    const barsIn = (Math.max(1, chorus) - 1) * formBars + i - shape.startBar;
    const real = barsIn >= 0 && barsIn <= last;
    out.push({ formBar: i, barsIn: real ? barsIn : null, chord: real ? chordAt(shape, barsIn) : "" });
  }
  return out;
}

/** How many times the form comes round in this take, at least one. */
export function jamChorusCount(shape: JamTapeShape): number {
  const formBars = Math.max(1, shape.formBars);
  return Math.max(1, Math.ceil((shape.startBar + jamBarCount(shape)) / formBars));
}

/**
 * Where the scrub buttons go from here.
 *
 * Back is "the top of THIS bar" unless you are already within a breath of it,
 * which is how every transport a musician has used behaves — the first press
 * puts you on the bar line you are hearing, the second takes you off the back
 * of it. Forward is always the next bar line.
 */
export function jamScrub(shape: JamTapeShape, ms: number, delta: -1 | 1): number {
  const barMs = shape.barMs > 0 ? shape.barMs : 1;
  const barsIn = Math.floor(Math.max(0, Math.min(ms, shape.lengthMs)) / barMs);
  if (delta === 1) return msAtJamBar(shape, barsIn + 1);
  const into = Math.max(0, Math.min(ms, shape.lengthMs)) - barsIn * barMs;
  // A quarter of a bar, which at any tempo is about as long as it takes to
  // decide you meant the bar before.
  return msAtJamBar(shape, into > barMs * 0.25 ? barsIn : barsIn - 1);
}
