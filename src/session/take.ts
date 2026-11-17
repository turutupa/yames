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
 * The notes a Take plays: the variant the planner picked (`variantSeed`, an
 * index into the Exercise's variants), or the Exercise as written. The id stays
 * the Exercise's own, so progress and the clean tempo pool across its variants.
 */
export function withVariant(exercise: Exercise, variantSeed: number | null | undefined): Exercise {
  const variants = exercise.variation?.variants;
  if (variantSeed === null || variantSeed === undefined || !variants?.length) return exercise;
  const variant = variants[((variantSeed % variants.length) + variants.length) % variants.length];
  return { ...exerciseWithVariant(exercise, variant), id: exercise.id };
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
  };
}
