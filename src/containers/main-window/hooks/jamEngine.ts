/**
 * The traffic a jam makes with the engine, with no React around it.
 *
 * This used to live inside `useJamSession`, where it was the jam tab's
 * private business. It is not private any more: a setlist step can BE a jam
 * (plans/JAM_MODE.md §8.5), and when the runner lands on one it has to hand
 * the engine exactly what the jam tab hands it, in exactly the same order —
 * a second implementation would be a second answer to "what does loading a
 * jam mean", and the one that got it wrong would be silent, because the
 * engine's way of refusing a table it cannot check is to play the plain click.
 *
 * So the order lives here, once, and both callers use it:
 *
 *   free mode off → beat groups → subdivision → the table
 *
 * The engine checks `ticksPerBeat × beatsPerBar` against its own bar length
 * and refuses a table that disagrees, rather than guessing. Sending the table
 * first would hand it the PREVIOUS meter to check against.
 */
import { setBeatGroups, setFreeMode, setJam, setSubdivision } from "../../../ipc";
import { jamMeter } from "../../../jam";
import type { Jam, JamEngineConfig } from "../../../jam";
import type { Subdivision } from "../../../types";
import { coachDebug } from "../../../coach/debug";

/** Said once per session, not once per beat: the command may not exist yet. */
let warnedAboutSetJam = false;

/** The metronome's own meter, remembered so the jam can hand it back. */
export type MeterSnapshot = { subdivision: number; beatGroups: number[]; freeMode: boolean };

/**
 * The last round trip `setJam` took, in milliseconds.
 *
 * Kept because the bar-ahead send only works if a config posted on one
 * downbeat has arrived before the next, and "it feels fine" is not a number.
 * Read it from the console as `window.__yamesJamLatency` while a jam plays.
 */
export const jamLatency = { last: 0, worst: 0, sends: 0 };

/** One `setJam`, timed, with the missing-command case said once. */
export async function sendJam(jam: Jam, config: JamEngineConfig | null): Promise<void> {
  const started = performance.now();
  try {
    await setJam(config);
  } catch (err) {
    if (warnedAboutSetJam) return;
    warnedAboutSetJam = true;
    console.warn(
      "[yames] set_jam is not available in this build — the click plays instead of the band",
      err,
    );
    return;
  } finally {
    const took = performance.now() - started;
    jamLatency.last = took;
    jamLatency.sends += 1;
    if (took > jamLatency.worst) jamLatency.worst = took;
    if (typeof window !== "undefined") {
      (window as unknown as { __yamesJamLatency?: typeof jamLatency }).__yamesJamLatency =
        jamLatency;
    }
    if (took > 20) coachDebug("jam.send-slow", { jam: jam.id, ms: Math.round(took) });
  }
}

/**
 * The meter and the table, in that order — what a jam needs on the way in.
 *
 * Only on load and on an edit. Never per bar: re-sending the meter under a
 * playing band would restack the bar on every downbeat.
 */
export function pushJam(jam: Jam, config: JamEngineConfig): void {
  // The GROUPS, not `[beatsPerBar]`. A jam given a meter of its own carries
  // the grouping the metronome's editor writes ([2, 2, 3] for 7/8), and the
  // grouping is what makes a bar of seven audible as a bar of seven rather
  // than as seven of something. A jam with no meter of its own has one group,
  // which is exactly what this used to send.
  const { beatGroups, ticksPerBeat } = jamMeter(jam);
  void (async () => {
    // Each step is awaited so the engine sees them in order, and each is
    // guarded so one rejecting does not take the rest with it — a jam that
    // applied its meter and nothing else is the worst of the failures.
    const steps: Array<[string, () => Promise<unknown>]> = [
      ["freeMode", () => setFreeMode(false)],
      ["beatGroups", () => setBeatGroups(beatGroups)],
      ["subdivision", () => setSubdivision(ticksPerBeat as Subdivision)],
    ];
    for (const [name, run] of steps) {
      try {
        await run();
      } catch (err) {
        coachDebug("jam.push-step-failed", { jam: jam.id, step: name, err });
      }
    }
    await sendJam(jam, config);
  })();
}

/**
 * What the engine is holding of the per-bar lines, as one comparable string.
 *
 * Both lines, not just the bass. They change on the same trigger — the chord
 * under the next bar — but not always together: over a one-chord jam neither
 * moves, and over a blues the keys re-voice on a bar where the walking bass
 * happens to repeat itself. Comparing only the bass would hold a stale voicing
 * under a changed chord.
 */
export function lineSignature(config: JamEngineConfig): string {
  const bass = config.bass ? config.bass.pitches.join(",") : "";
  const keys = config.keys ? config.keys.voicings.map((v) => v.join(".")).join(",") : "";
  return `${bass}|${keys}`;
}

/**
 * Take the band away, and give the metronome back the meter it came in with.
 *
 * `setJam(null)` alone is not enough, and the bug it leaves is a quiet one: a
 * jam sets the engine's subdivision and beat groups to the groove's, and those
 * are engine state, not jam state. Walk out of a bossa and the metronome tab
 * is a metronome again — in sixteenths, in four — whatever it was before. A
 * player who came in from 7/8 finds their own setting gone and no message
 * saying so.
 *
 * So the meter the jam found is remembered on the way in and handed back on
 * the way out, in the same order it was taken: free mode, groups, subdivision.
 * The table goes first, because the engine checks the two against each other
 * and a meter that arrives while a table is still loaded is a meter it may
 * refuse.
 *
 * `restore` of `null` takes the table away and leaves the meter alone — which
 * is what a setlist wants between a jam step and the plain step after it,
 * because that step carries a meter of its own and is about to set it.
 */
export function clearJam(restore: MeterSnapshot | null): void {
  void (async () => {
    try {
      await setJam(null);
    } catch {
      /* The command may not exist yet; the meter still has to go back. */
    }
    if (!restore) return;
    const steps: Array<() => Promise<unknown>> = [
      () => setFreeMode(restore.freeMode),
      () => setBeatGroups(restore.beatGroups),
      () => setSubdivision(restore.subdivision as Subdivision),
    ];
    for (const run of steps) {
      try {
        await run();
      } catch {
        /* One step failing must not take the other two with it. */
      }
    }
  })();
}
