/**
 * What a note gets drawn as, once the pass is over.
 *
 * Pure arithmetic over what scoring and the pitch tracker already said. No
 * React, no IPC, no thresholds of its own — the bands come from
 * `score_timing_bands`, which is `timing::window_thresholds` over the
 * schedule's own smallest gap, which is exactly what the scorer judged the
 * pass on. A review that invented its own boundaries would colour a note
 * green that the same pass counted as merely "ok", and the player would be
 * right to believe neither.
 *
 * ## Colour is never the only signal
 *
 * Every state carries a MARK as well as a colour — a dot, one or two carets,
 * a cross, a dash — because a player who cannot tell the theme's green from
 * its amber still has to be able to read the page, and because two of the
 * thirteen themes are deliberately low-contrast. The carets also carry
 * something the colour cannot: which side of the beat the note fell on.
 */
import type { NoteVerdict, OnsetResult } from "../../../songs/types";
import type { TimingBands } from "../../../ipc";

/**
 * How a note landed. Two steps either side of the beat, from the scorer's own
 * thresholds — `perfect`, then `good`, then the edge of the matching window.
 */
export type TimingMark =
  | "onTime"
  | "slightlyEarly"
  | "early"
  | "slightlyLate"
  | "late"
  | "missed"
  /** A soft onset — a hammer-on, a pull-off — that never arrived. Never a
   *  miss: the contract says it may be too quiet to hear (`BRIEF.md`). */
  | "notAssessed";

/** The mark drawn beside the fret number, in the order a reader meets them. */
export const MARK_GLYPH: Record<TimingMark, string> = {
  onTime: "●",
  slightlyEarly: "‹",
  early: "‹‹",
  slightlyLate: "›",
  late: "››",
  missed: "✕",
  notAssessed: "–",
};

/** Which of the theme's four feedback colours a mark wears. */
export const MARK_TOKEN: Record<TimingMark, string> = {
  onTime: "var(--feedback-perfect)",
  slightlyEarly: "var(--feedback-good)",
  early: "var(--feedback-ok)",
  slightlyLate: "var(--feedback-good)",
  late: "var(--feedback-ok)",
  missed: "var(--feedback-miss)",
  notAssessed: "var(--text-faint)",
};

/**
 * One onset's verdict, drawn.
 *
 * `bands` absent means the command did not answer — an older build, a schedule
 * with nothing in it. Rather than guess at boundaries, everything that was hit
 * is drawn as on time and everything that was missed as missed: a coarser
 * picture, and not a wrong one.
 */
export function markFor(result: OnsetResult, bands: TimingBands | null): TimingMark {
  if (result.state === "softAbsent") return "notAssessed";
  if (result.state === "miss") return "missed";
  const deviation = result.deviationMs;
  if (deviation === null) return "onTime";
  if (!bands) return "onTime";
  const off = Math.abs(deviation);
  if (off < bands.perfect) return "onTime";
  const early = deviation < 0;
  if (off < bands.good) return early ? "slightlyEarly" : "slightlyLate";
  return early ? "early" : "late";
}

/** Whether a mark is one the player should look at. */
export function isWrong(mark: TimingMark): boolean {
  return mark === "missed" || mark === "early" || mark === "late";
}

/**
 * What the ear had to say about which note it was.
 *
 * `notAssessed` is the honest one and it is the common one: a chord is three
 * notes at one tick and a monophonic tracker asked about three answers about
 * whichever won (`SONGS.md` S0.5). The review says so once, in words, rather
 * than drawing a shrug on every chord.
 */
export type PitchMark =
  | { kind: "right" }
  | { kind: "wrong"; heardMidi: number; centsOff: number | null }
  | { kind: "octave"; heardMidi: number }
  | { kind: "unheard" }
  | { kind: "notAssessed" };

export function pitchMarkFor(verdict: NoteVerdict | undefined): PitchMark | null {
  if (!verdict) return null;
  switch (verdict.state) {
    case "right":
      return { kind: "right" };
    case "wrong":
      return verdict.heardMidi === null
        ? { kind: "unheard" }
        : { kind: "wrong", heardMidi: verdict.heardMidi, centsOff: verdict.centsOff };
    case "octave":
      return verdict.heardMidi === null
        ? { kind: "unheard" }
        : { kind: "octave", heardMidi: verdict.heardMidi };
    case "unheard":
      return { kind: "unheard" };
    case "notAssessed":
      return { kind: "notAssessed" };
  }
}

/** Sharps only — a review has no key to spell a flat against. */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** A MIDI number as a player says it: "F#4". */
export function noteNameOf(midi: number): string {
  const rounded = Math.round(midi);
  const pc = ((rounded % 12) + 12) % 12;
  const octave = Math.floor(rounded / 12) - 1;
  return `${NOTE_NAMES[pc]}${String(octave)}`;
}

/**
 * Whether an accent the score wrote was actually heard.
 *
 * `accentHeard` is absent when there was nothing to say — no accent written,
 * the note was not played, the amplitudes around it were unusable — so only
 * an explicit `false` earns the quiet mark. Reported and never scored
 * (`LP C3` is open on what an accent should cost).
 */
export function accentMissed(result: OnsetResult): boolean {
  return result.accentHeard === false;
}

/**
 * The passes an attempt has, in order.
 *
 * The last one is shown by default: it is the one that just happened, and the
 * one a player has in their hands.
 */
export function passesIn(results: readonly OnsetResult[], extras: readonly { pass: number }[]): number[] {
  let max = 0;
  for (const r of results) if (r.pass > max) max = r.pass;
  for (const e of extras) if (e.pass > max) max = e.pass;
  return Array.from({ length: max + 1 }, (_, i) => i);
}
