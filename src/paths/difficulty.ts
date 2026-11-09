/**
 * The stated difficulty metric. Steps must not get easier by this number, or
 * must say why (`Step.difficultyException`).
 *
 * The metric is what is hard about playing the thing at its pass tempo:
 *
 *   notes per second
 *   × (1 + 0.4 string crossings + 0.6 string skips + 0.3 position shifts
 *        + 0.25 if swept)
 *   + 0.3 per legato-or-bent share of the notes × 10
 *
 * and, on a Theory Path, what is hard about choosing:
 *
 *   + freedom (written 0, landings 1.5, self-checked 0.5, practice-only 1.5)
 *   + 0.5 per chord change in four bars
 *
 * The rates are per note. It is a yardstick for ordering, not a measure of a
 * player: a Step that is easier for a stated reason declares it.
 */
import type { Exercise, PathKind, Step } from "./format";
import { TICKS } from "./format";
import { isPicked } from "./tabDsl";

const FREEDOM: Readonly<Record<Exercise["grading"], number>> = {
  graded: 0,
  landings: 1.5,
  selfChecked: 0.5,
  practiceOnly: 1.5,
};

/** The tempo difficulty is read at: the pass rung, else the middle of the ladder. */
export function referenceBpm(ex: Pick<Exercise, "tempo">): number {
  if (ex.tempo.passAtBpm !== null) return ex.tempo.passAtBpm;
  const rungs = ex.tempo.rungs;
  return rungs[Math.floor((rungs.length - 1) / 2)]?.bpm ?? 60;
}

export function exerciseDifficulty(
  ex: Pick<Exercise, "tempo" | "notes" | "bars" | "meter" | "pickPlan" | "chords" | "grading">,
  kind: PathKind,
  handShifts: number,
): number {
  const notes = ex.notes;
  const bpm = referenceBpm(ex);
  const beats = (ex.bars * ex.meter.numerator * 4) / ex.meter.denominator;
  const seconds = (beats * 60) / bpm;
  const nps = notes.length / Math.max(seconds, 0.001);
  let crossings = 0;
  let skips = 0;
  let expressive = 0;
  notes.forEach((note, index) => {
    const previous = notes[index - 1];
    if (previous) {
      const distance = Math.abs(previous.string - note.string);
      if (distance === 1) crossings += 1;
      if (distance > 1) skips += 1;
    }
    if (!isPicked(note, previous) || note.tech.includes("bend")) expressive += 1;
  });
  const count = Math.max(notes.length, 1);
  const mechanical =
    nps *
    (1 +
      (0.4 * crossings) / count +
      (0.6 * skips) / count +
      (0.3 * handShifts) / count +
      (ex.pickPlan === "sweep" ? 0.25 : 0));
  let value = mechanical + (0.3 * expressive * 10) / count;
  if (kind === "theory") {
    let changes = 0;
    (ex.chords ?? []).forEach((chord, index, all) => {
      if (index > 0 && chord !== all[index - 1]) changes += 1;
    });
    value += FREEDOM[ex.grading] + (0.5 * changes * 4) / Math.max(ex.bars, 1);
  }
  return Math.round(value * 100) / 100;
}

/** A Step's difficulty: the median of its Exercises. */
export function stepDifficulty(step: Pick<Step, "exercises">): number {
  const values = step.exercises.map((e) => e.computed.difficulty).sort((a, b) => a - b);
  if (values.length === 0) return 0;
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
  return Math.round(median * 100) / 100;
}

/** Onset gap at a tempo: the tightest pair of adjacent onsets, in ms. */
export function minGapMs(notes: readonly { tick: number }[], bpm: number): number | null {
  let gap = Infinity;
  for (let i = 1; i < notes.length; i += 1) {
    const d = notes[i].tick - notes[i - 1].tick;
    if (d > 0 && d < gap) gap = d;
  }
  if (!Number.isFinite(gap)) return null;
  return Math.round(((gap * 60000) / bpm / TICKS) * 100) / 100;
}
