/**
 * An Exercise, made ready to play as a Take.
 *
 * A Take is at least ten bars (`grade.ts` `takeBarsOf`), and most Exercises are a bar or
 * two that loop. So the notes are written out for the whole Take rather than
 * looped by the engine, for three reasons that all point the same way:
 *
 * - The engine stops itself at the last bar, on the sample, and nothing has to
 *   press stop on a beat event that arrives late. A loop has no such end.
 * - Every onset has one id and every bar one number, so per-bar evenness needs no
 *   arithmetic on which time round it was, and neither do the tab's lights.
 * - It stays the score path everything else uses: `SongScore`, then
 *   `buildSchedule`, then `match_attempt`. An Exercise gets no scoring of its own.
 *
 * The tab is drawn from the same written-out notes, so what lights up is what
 * was scored, note for note.
 */
import { exerciseAlphaTex, exerciseScore } from "../paths/toScore";
import { TICKS, barLengthTicks } from "../paths/format";
import { exerciseWithVariant } from "../paths/variants";
import type { Exercise, PathDoc } from "../paths/format";
import { buildSchedule, wholeSong } from "../songs/schedule";
import type { BarRange } from "../songs/schedule";
import type { ScoreSchedule, SongScore } from "../songs/types";
import { takeBarsOf } from "./grade";

/** One bar of counting before a Take, so nobody is caught out by bar one. */
export const TAKE_COUNT_IN_BARS = 1;

/**
 * How long a Take of this Exercise runs at `bpm`, count-in included, in
 * seconds. What the Session's minutes have to hold: `planner.ts` gives a block
 * at least `MIN_BLOCK_MINUTES` for two Takes and a breath, and Test out
 * `TEST_OUT_MINUTES` for one.
 */
export function takeSecondsOf(exercise: Exercise, bpm: number): number {
  const quarters = barLengthTicks(exercise.meter) / TICKS;
  return ((takeBarsOf(exercise) + TAKE_COUNT_IN_BARS) * quarters * 60) / Math.max(1, bpm);
}

export type TakePlan = {
  pathId: string;
  exercise: Exercise;
  bpm: number;
  bars: number;
  score: SongScore;
  /** The tab's own text, as bytes, the way `TabStage` is handed a file. */
  source: Uint8Array;
  schedule: ScoreSchedule;
  range: BarRange;
  /** The written pitch of every note, for the scorer's right-notes check. */
  pitches: { id: number; midi: number }[];
  /**
   * Length, bend and technique of every note, for the note verifier
   * (`score/verify.rs`): it listens differently for a hammer-on, a chord
   * tone and a bent note, and reports per technique.
   */
  details: { id: number; durBeats: number; bend?: number; bendShape?: "release" | "prebend"; string: number; tech: string[] }[];
};

/**
 * The same Exercise, written out to `bars` bars: whole passes, and the start of
 * one more when `bars` is not a multiple of the pattern (`grade.ts`
 * `takeBarsOf`). The cut is on a bar line, and a note never crosses one
 * (`exerciseAlphaTex` files every note under the bar it starts in), so the last
 * pass is the first bars of the pattern, note for note.
 */
export function writtenOut(exercise: Exercise, bars: number): Exercise {
  const own = Math.max(1, exercise.bars);
  if (bars === own) return exercise;
  const barTicks = barLengthTicks(exercise.meter);
  const passTicks = barTicks * own;
  const end = barTicks * bars;
  const times = Math.ceil(bars / own);
  const passes = Array.from({ length: times }, (_unused, pass) => pass * passTicks);
  return {
    ...exercise,
    bars,
    loops: false,
    notes: passes
      .flatMap((offset) => exercise.notes.map((note) => ({ ...note, tick: note.tick + offset })))
      .filter((note) => note.tick < end),
    rests: passes
      .flatMap((offset) => exercise.rests.map((rest) => ({ ...rest, tick: rest.tick + offset })))
      .filter((rest) => rest.tick < end),
  };
}

/**
 * Which of the Exercise's variants a seed plays (the seed modulo the variant
 * count); null: the Exercise as written, or one with no variants. The one copy
 * of the rule: `withVariant` picks by it, and two Takes are on the same notes
 * when it agrees (the history cards in `coach/ask/cards.ts`, the look-back's
 * benchmark in `coach/weekly.ts`).
 */
export function variantIndexOf(exercise: Exercise, variantSeed: number | null | undefined): number | null {
  const n = exercise.variation?.variants?.length ?? 0;
  if (n === 0 || variantSeed === null || variantSeed === undefined) return null;
  return ((variantSeed % n) + n) % n;
}

/**
 * The notes a Take plays: the variant the planner picked (`variantSeed`, an
 * index into the Exercise's variants), or the Exercise as written. The id stays
 * the Exercise's own, so progress and the clean tempo pool across its variants.
 */
export function withVariant(exercise: Exercise, variantSeed: number | null | undefined): Exercise {
  const at = variantIndexOf(exercise, variantSeed);
  if (at === null) return exercise;
  return { ...exerciseWithVariant(exercise, exercise.variation!.variants![at]), id: exercise.id };
}

export function buildTake(
  path: PathDoc,
  base: Exercise,
  bpm: number,
  variantSeed?: number | null,
): TakePlan {
  const exercise = withVariant(base, variantSeed);
  const bars = takeBarsOf(exercise);
  const whole = writtenOut(exercise, bars);
  const score = exerciseScore(path.id, whole, bpm);
  const range = wholeSong(score);
  return {
    pathId: path.id,
    exercise,
    bpm,
    bars,
    score,
    source: new TextEncoder().encode(exerciseAlphaTex(whole, bpm)),
    schedule: buildSchedule(score, range, { loops: false }),
    range,
    pitches: score.notes.map((n) => ({ id: n.id, midi: n.midi })),
    details: noteDetails(whole, score),
  };
}

/**
 * Bars `fromBar` to `toBar` of the pattern (from 1, inclusive), cut out on
 * their bar lines: the notes of a loop. A note never crosses a bar line
 * (`exerciseAlphaTex`), so the cut loses nothing.
 */
export function patternBars(exercise: Exercise, fromBar: number, toBar: number): Exercise {
  const own = Math.max(1, exercise.bars);
  const from = Math.max(1, Math.min(own, fromBar));
  const to = Math.max(from, Math.min(own, toBar));
  const barTicks = barLengthTicks(exercise.meter);
  const start = (from - 1) * barTicks;
  const end = to * barTicks;
  return {
    ...exercise,
    bars: to - from + 1,
    loops: true,
    notes: exercise.notes
      .filter((note) => note.tick >= start && note.tick < end)
      .map((note) => ({ ...note, tick: note.tick - start })),
    rests: exercise.rests
      .filter((rest) => rest.tick >= start && rest.tick < end)
      .map((rest) => ({ ...rest, tick: rest.tick - start })),
  };
}

/**
 * A loop (DESIGN 4.2, "Loop a bar"): a bar or two of the pattern on repeat,
 * built as the Songs screen loops a passage, `buildSchedule(score, range, {
 * loops: true })`. The same shape as a Take, so the neck and the tab draw it,
 * and nothing in it is graded: there are no pass marks to send.
 */
export type LoopPlan = TakePlan & { fromBar: number; toBar: number };

export function buildLoop(
  path: PathDoc,
  base: Exercise,
  bpm: number,
  variantSeed: number | null | undefined,
  fromBar: number,
  toBar: number,
): LoopPlan {
  const exercise = withVariant(base, variantSeed);
  const cut = patternBars(exercise, fromBar, toBar);
  const score = exerciseScore(path.id, cut, bpm);
  const range = wholeSong(score);
  return {
    pathId: path.id,
    exercise: cut,
    bpm,
    bars: cut.bars,
    score,
    source: new TextEncoder().encode(exerciseAlphaTex(cut, bpm)),
    schedule: buildSchedule(score, range, { loops: true }),
    range,
    pitches: score.notes.map((n) => ({ id: n.id, midi: n.midi })),
    details: noteDetails(cut, score),
    fromBar: Math.max(1, Math.min(Math.max(1, exercise.bars), fromBar)),
    toBar: Math.max(1, Math.min(Math.max(1, exercise.bars), toBar)),
  };
}

/**
 * `exerciseScore` numbers its notes in tick order, then string order; the
 * bend amount lives only on the Exercise's own notes, so they are walked in
 * the same order to find it.
 */
function noteDetails(whole: Exercise, score: SongScore): TakePlan["details"] {
  const written = [...whole.notes].sort((a, b) => a.tick - b.tick || a.string - b.string);
  return score.notes.map((n) => {
    const bend = written[n.id]?.bend;
    const shape = written[n.id]?.bendShape;
    return {
      id: n.id,
      durBeats: n.durTicks / score.ticksPerQuarter,
      ...(typeof bend === "number" && bend > 0 ? { bend } : {}),
      ...(typeof bend === "number" && bend > 0 && shape ? { bendShape: shape } : {}),
      string: n.string,
      tech: [...n.techniques],
    };
  });
}
