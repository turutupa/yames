/**
 * The stated difficulty metric. Steps must not get easier by this number, or
 * must say why (`Step.difficultyException`).
 *
 * The metric is what is hard about playing the thing at its pass tempo:
 *
 *   onsets per second
 *   × (1 + 0.4 string crossings + 0.6 string skips + 0.3 position shifts
 *        + 0.25 if swept)
 *   + 0.3 per legato-or-bent share of the onsets × 10
 *
 * and, on a Theory Path, what is hard about choosing:
 *
 *   + freedom (written 0, landings 1.5, self-checked 0.5, practice-only 1.5)
 *   + 0.5 per chord change in four bars
 *
 * It counts ONSETS, not notes. Notes that share a tick are one onset: a
 * six-string strum, a double stop and a power chord are each one attack of
 * the picking hand, and one expected onset to the grader
 * (`src/songs/schedule.ts`). A strum in quarters reads what one note in
 * quarters reads. The rates (crossings, skips, shifts, legato or bent) are
 * per onset.
 *
 * Between two consecutive onsets the string distance is the SMALLEST distance
 * between a string of the first and a string of the second: zero when they
 * share a string, 1 a crossing, more a skip. For two single notes that is the
 * distance it always was, so a single-note line reads exactly what it read
 * when the metric counted notes (`difficulty.test.ts` holds every pack to
 * that). For chords it asks how far the picking hand travels to its next
 * attack: a downstroke over six strings and the upstroke back over the top
 * three is one swing and no crossing, a bass note and then the strings above
 * it is a crossing, an octave shape moved over a string is a crossing. The
 * lowest or the highest string of each onset would call the swing back up a
 * skip, which it is not.
 *
 * An onset is legato or bent when any note in it is hammered, pulled, tapped,
 * slid into (from a note of the onset before, on its own string) or bent: a
 * double stop with one string bent is a bent attack.
 *
 * It is a yardstick for ordering, not a measure of a player. It does not see
 * the fretting hand's work inside one attack (how many fingers a chord takes,
 * or a change of chord shape), so a Step that is easier by the number for a
 * stated reason declares it.
 */
import type { Exercise, PathKind, PathNote, Step } from "./format";
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

/** Notes that share a tick are one onset: one attack, however many strings it crosses. */
export function onsetsOf<N extends { tick: number }>(notes: readonly N[]): N[][] {
  const onsets: N[][] = [];
  for (const note of notes) {
    const current = onsets[onsets.length - 1];
    if (current && current[0].tick === note.tick) current.push(note);
    else onsets.push([note]);
  }
  return onsets;
}

/** How far the picking hand travels between two onsets: zero when they share a string. */
function stringDistance(from: readonly PathNote[], to: readonly PathNote[]): number {
  let distance = Infinity;
  for (const a of from) for (const b of to) distance = Math.min(distance, Math.abs(a.string - b.string));
  return distance;
}

/** Legato or bent: any note of the onset hammered, pulled, tapped, slid into or bent. */
function isExpressive(onset: readonly PathNote[], previous: readonly PathNote[] | undefined): boolean {
  return onset.some((note) => {
    // A slide arrives along its own string; a single note before is the note before, as it always was.
    const before = previous?.find((p) => p.string === note.string) ?? previous?.[0];
    return !isPicked(note, before) || note.tech.includes("bend");
  });
}

export function exerciseDifficulty(
  ex: Pick<Exercise, "tempo" | "notes" | "bars" | "meter" | "pickPlan" | "chords" | "grading">,
  kind: PathKind,
  handShifts: number,
): number {
  const onsets = onsetsOf(ex.notes);
  const bpm = referenceBpm(ex);
  const beats = (ex.bars * ex.meter.numerator * 4) / ex.meter.denominator;
  const seconds = (beats * 60) / bpm;
  const ops = onsets.length / Math.max(seconds, 0.001);
  let crossings = 0;
  let skips = 0;
  let expressive = 0;
  onsets.forEach((onset, index) => {
    const previous = onsets[index - 1];
    if (previous) {
      const distance = stringDistance(previous, onset);
      if (distance === 1) crossings += 1;
      if (distance > 1) skips += 1;
    }
    if (isExpressive(onset, previous)) expressive += 1;
  });
  const count = Math.max(onsets.length, 1);
  const mechanical =
    ops *
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
