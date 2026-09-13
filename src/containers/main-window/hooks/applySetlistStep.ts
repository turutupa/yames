import { setBeatGroups, setBpm, setFreeMode, setSoundType, setSubdivision, setVolume } from "../../../ipc";
import { compileJam } from "../../../jam";
import type { Jam, JamBand } from "../../../jam";
import { clearJam, pushJam } from "./jamEngine";
import type { SetlistStep, Subdivision } from "../../../types";

/**
 * Push a step's configuration onto the engine.
 *
 * Two callers need this and they must agree exactly: the runner applies a
 * step when the setlist lands on it, and selecting a step in the track applies
 * it so the metronome underneath is showing the thing you are editing. Two
 * copies would be two definitions of what a step *is*.
 *
 * Order is not load-bearing for the runner — every one of its applications
 * lands on a downbeat, so the `measure_beat` reset that `set_beat_groups`
 * triggers is a no-op there. Selecting a step while stopped has no bar to
 * cut in half either.
 *
 * Each call is guarded on its own: one setter rejecting must not take the
 * rest of the step's configuration down with it, the same rule
 * `handleLoadPreset` follows.
 */
export function applySetlistStep(step: SetlistStep, jam?: Jam | null, lineup?: JamBand): void {
  void setBpm(step.bpm).catch(() => {});
  void setSoundType(step.soundType).catch(() => {});
  void setVolume(step.volume).catch(() => {});

  if (jam) {
    /*
     * A jam step (JAM_MODE §8.5). The meter and the table go out together and
     * in the jam tab's own order — free mode, groups, subdivision, then the
     * table — because the engine checks `ticksPerBeat × beatsPerBar` against
     * its own bar and refuses a table that disagrees.
     *
     * So the three meter setters BELOW are skipped rather than run first:
     * they are unawaited, `pushJam` awaits each of its own, and a subdivision
     * from here landing after the one from there would be the engine holding
     * a meter the table it already accepted was not written for. The step
     * carries the jam's meter anyway — `jamToSetlistStep` copied it — so
     * nothing is lost by letting the jam be the one that sends it.
     */
    pushJam(jam, compileJam(jam, { formBar: 0, lineup }));
    return;
  }

  void setSubdivision(step.subdivision as Subdivision).catch(() => {});
  if (step.beatGroups.length > 0) void setBeatGroups(step.beatGroups).catch(() => {});
  if (typeof step.freeMode === "boolean") void setFreeMode(step.freeMode).catch(() => {});
  /*
   * And the band goes away.
   *
   * Unconditional, and it costs one `set_jam(null)` per step change — which is
   * at most once every few bars. The alternative is this module remembering
   * whether the last step it applied was a jam, and a module-level memory
   * shared by the runner and the editor's selection is a memory two callers
   * can disagree about. A step is a complete description of what the engine
   * should be doing, and "no band" is part of the description.
   *
   * The meter is left alone: the step above has just set its own, and handing
   * back a remembered one here would undo it. Restoring the metronome's meter
   * is the END of a run's job, and `useSetlistRunner` does it there.
   */
  clearJam(null);
}
