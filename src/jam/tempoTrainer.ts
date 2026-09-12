/**
 * Jam — the tempo trainer.
 *
 * "Up 4 BPM every two choruses. Drill's ramp wearing a band"
 * (plans/JAM_MODE.md §4.2). One pure function: given the chorus that just
 * finished, what tempo should the next one start at. The UI applies the
 * answer on the beat event that starts a chorus, so the change lands on a
 * downbeat and never mid-bar.
 *
 * Nothing here reads a clock or holds state. The same chorus always returns
 * the same tempo, which is what makes it testable and what keeps it off the
 * audio thread's conscience.
 */

import { MAX_BPM, MIN_BPM } from "../constants/metronome";

export type TempoTrainerInput = {
  /** The tempo the chorus that just finished was played at. */
  bpm: number;
  /** Which chorus just finished, 1-based. */
  chorus: number;
  /** BPM added per step. 0 is off. Negative steps down. */
  tempoStep: number;
  /** Step after every N choruses. 0 is off. */
  tempoEveryChoruses: number;
  /** The tempo the trainer will not climb past. The engine's own ceiling. */
  ceiling?: number;
};

/**
 * The tempo the next chorus should start at.
 *
 * Unchanged when the trainer is off, when the chorus is not a step boundary,
 * or when the tempo is already at or past the ceiling. Never returns a tempo
 * above the ceiling that it was not handed, and never pulls a tempo the
 * player chose back down to it.
 */
export function tempoAfterChorus(a: TempoTrainerInput): number {
  const bpm = a.bpm;
  const ceiling = a.ceiling ?? MAX_BPM;
  const step = Math.trunc(a.tempoStep);
  const every = Math.trunc(a.tempoEveryChoruses);

  if (step === 0 || every <= 0) return bpm;
  if (a.chorus < 1) return bpm;
  if (a.chorus % every !== 0) return bpm;

  if (step > 0) {
    if (bpm >= ceiling) return bpm;
    return Math.min(bpm + step, ceiling);
  }
  if (bpm <= MIN_BPM) return bpm;
  return Math.max(bpm + step, MIN_BPM);
}

/**
 * The tempo after `choruses` complete choruses, starting from `bpm`. The
 * timeline uses it to say where the trainer is taking you; it is the loop the
 * player would run in their head, not a closed form, because the ceiling
 * makes the sequence flatten rather than continue.
 */
export function tempoAfterChoruses(
  a: Omit<TempoTrainerInput, "chorus"> & { choruses: number },
): number {
  let bpm = a.bpm;
  const total = Math.max(0, Math.trunc(a.choruses));
  for (let chorus = 1; chorus <= total; chorus += 1) {
    bpm = tempoAfterChorus({
      bpm,
      chorus,
      tempoStep: a.tempoStep,
      tempoEveryChoruses: a.tempoEveryChoruses,
      ceiling: a.ceiling,
    });
  }
  return bpm;
}
