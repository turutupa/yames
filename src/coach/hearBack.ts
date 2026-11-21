/**
 * "Hear bar N: yours, then the demo" (DESIGN 4.2 "Hear it back", leg c5b2):
 * which bar, whether the chip is there, and what it says. Pure, so each is a
 * table test; the sequence itself is `containers/session/hooks/useHearBack.ts`.
 *
 * "Bar N" is a PLAYED bar (c5b1b, L6): the bar of the Take as the note's strip
 * numbers it, counted from the first downbeat after the count-in, which is
 * how the engine holds the Take's bars. The demo half plays the PATTERN bar
 * that played bar is a round of, at the Take's tempo.
 */
import type { HeldTake } from "../ipc";
import type { RunPhase } from "../session/runner";
import type { Line } from "../session/coachWords";
import type { TakeNote } from "./takeNote";

export type HearBar = {
  /** The bar of the Take, from 1, as the strip numbers it: what `hearTake` is asked for. */
  played: number;
  /** The tune's own bar it is a round of, from 1: what the demo plays. */
  pattern: number;
};

/**
 * The bar the note's place points to: the first bar of the Take where the
 * compared pattern bar slipped (its first crossed cell on the strip). With no
 * strip (no per-bar figures), the first round of that pattern bar. Null when
 * the note names no place in the tune (none, or "from round N on").
 */
export function hearBarOf(note: TakeNote | null): HearBar | null {
  if (!note || note.kind !== "result") return null;
  const place = note.place;
  if (!place || place.shape === "fromRound" || place.patternBars.length === 0) return null;
  const pattern = place.patternBars[0];
  if (!Number.isInteger(pattern) || pattern < 1) return null;
  const cells = note.strip?.cells ?? [];
  const slipped = cells.find((cell) => cell.spot && cell.patternBar === pattern);
  if (slipped) return { played: slipped.n, pattern };
  const any = cells.find((cell) => cell.patternBar === pattern);
  return { played: any ? any.n : pattern, pattern };
}

export type HearBackFacts = {
  phase: RunPhase;
  /** The Take was played without grading. */
  ungraded: boolean;
  /** `hearBarOf` the result's note. */
  bar: HearBar | null;
  /** `heardTake` for THIS Take's serial; null until it has answered, or with no serial at all. */
  held: HeldTake | null;
  /** "Hear it first" has the engine. */
  demo: boolean;
  /** A loop runs (or has not let the engine go yet). */
  loop: boolean;
};

/**
 * The chip is there, and for this bar, or it is absent: never greyed out with
 * an apology. Only on a graded result whose note names a place, whose Take's
 * audio the engine holds (not an ungraded Take, input off, MIDI, a gap, an
 * older Take) up to that bar; never during a Take, a count-in, a loop or a demo.
 */
export function hearBackOffer(facts: HearBackFacts): HearBar | null {
  if (facts.phase !== "result" || facts.ungraded || facts.demo || facts.loop) return null;
  const { bar, held } = facts;
  if (!bar || !held?.held) return null;
  if (bar.played < 1 || bar.played > held.bars) return null;
  return bar;
}

/** Where the hear-back is: idle, the player's bar, or the demo of it. */
export type HearStage = "off" | "yours" | "demo" | "stopped";

/** The chip's words in each stage (`session.note.chip.*`). Nothing in them praises or judges. */
export function hearBackLabel(stage: HearStage, bar: number): Line {
  if (stage === "yours") return { key: "session.note.chip.hearYours", values: { bar } };
  if (stage === "demo") return { key: "session.note.chip.hearDemo", values: { bar } };
  return { key: "session.note.chip.hearBack", values: { bar } };
}
