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
 * The tempo, the sound and the volume are fired off unawaited: none of them
 * is checked against anything, and every one of the runner's applications
 * lands on a downbeat, so the `measure_beat` reset that `set_beat_groups`
 * triggers is a no-op there. Selecting a step while stopped has no bar to
 * cut in half either.
 *
 * The table and the meter are the pair that IS ordered — see the two branches
 * below, which are the same rule read from opposite ends.
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

  /*
   * The band goes away FIRST, and then the step's meter follows it.
   *
   * `jamEngine.ts` states the rule and this is the other half of it: the
   * engine checks `ticksPerBeat × beatsPerBar` against the table it is
   * holding, so a meter that arrives while a jam's table is still loaded is a
   * meter it may refuse — and its way of refusing is silence, not an error.
   * The plain step after a blues sent its 4/4 into a table written in
   * shuffled twelve-eight and then took the table away, in that order.
   *
   * Each call is awaited so the engine sees them in order, and each is
   * guarded on its own: one setter rejecting must not take the rest of the
   * step's configuration down with it, the same rule `handleLoadPreset`
   * follows.
   *
   * Taking the band away is unconditional, and it costs one `set_jam(null)`
   * per step change — at most once every few bars. The alternative is this
   * module remembering whether the last step it applied was a jam, and a
   * module-level memory shared by the runner and the editor's selection is a
   * memory two callers can disagree about. A step is a complete description
   * of what the engine should be doing, and "no band" is part of it.
   *
   * The metronome's own meter is left alone: the step is setting its own, and
   * handing back a remembered one here would undo it. Restoring that is the
   * END of a run's job, and `useSetlistRunner` does it there.
   */
  void (async () => {
    await clearJam(null);
    const steps: Array<() => Promise<unknown>> = [
      () => setSubdivision(step.subdivision as Subdivision),
    ];
    if (step.beatGroups.length > 0) steps.push(() => setBeatGroups(step.beatGroups));
    if (typeof step.freeMode === "boolean") steps.push(() => setFreeMode(step.freeMode as boolean));
    for (const run of steps) {
      try {
        await run();
      } catch {
        /* One setter failing must not take the other two with it. */
      }
    }
  })();
}
