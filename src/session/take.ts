/**
 * An Exercise, made ready to play as a Take.
 *
 * A Take is at least eight bars (`grade.ts`), and most Exercises are a bar or
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
import { barLengthTicks } from "../paths/format";
import type { Exercise, PathDoc } from "../paths/format";
import { buildSchedule, wholeSong } from "../songs/schedule";
import type { BarRange } from "../songs/schedule";
import type { ScoreSchedule, SongScore } from "../songs/types";
import { takeBarsOf } from "./grade";

/** One bar of counting before a Take, so nobody is caught out by bar one. */
export const TAKE_COUNT_IN_BARS = 1;

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
};

/** The same Exercise, written out `times` over. */
export function writtenOut(exercise: Exercise, times: number): Exercise {
  if (times <= 1) return exercise;
  const barTicks = barLengthTicks(exercise.meter);
  const passTicks = barTicks * exercise.bars;
  const passes = Array.from({ length: times }, (_unused, pass) => pass * passTicks);
  return {
    ...exercise,
    bars: exercise.bars * times,
    loops: false,
    notes: passes.flatMap((offset) =>
      exercise.notes.map((note) => ({ ...note, tick: note.tick + offset })),
    ),
    rests: passes.flatMap((offset) =>
      exercise.rests.map((rest) => ({ ...rest, tick: rest.tick + offset })),
    ),
  };
}

export function buildTake(path: PathDoc, exercise: Exercise, bpm: number): TakePlan {
  const bars = takeBarsOf(exercise);
  const whole = writtenOut(exercise, Math.round(bars / Math.max(1, exercise.bars)));
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
  };
}
