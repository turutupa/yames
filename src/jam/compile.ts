/**
 * A saved jam turned into the table the engine plays.
 *
 * Pure, and deliberately the only place that translation happens: the record
 * is what the user edits and the config is what the audio thread reads, and
 * keeping one function between them means a change to either shape has
 * exactly one place to meet the other.
 *
 * The rule the contract encodes is the caller's, not this function's: whoever
 * sends this config must already have set the engine's subdivision to
 * `ticksPerBeat` and its beat groups to `[beatsPerBar]`. The engine checks the
 * product against its own bar and plays the plain click when they disagree,
 * so a mismatch is audible rather than silently wrong.
 */
import { applyFeel } from "./feel";
import { formBars } from "./forms";
import { grooveById } from "./grooves";
import { JAM_INTENSITY_GAIN } from "./types";
import type { Jam, JamEngineConfig } from "./types";

export function compileJam(jam: Jam): JamEngineConfig {
  const groove = applyFeel(grooveById(jam.grooveId), jam.feel);
  return {
    ticksPerBeat: groove.ticksPerBeat,
    beatsPerBar: groove.beatsPerBar,
    bar: groove.bar,
    // One switch, two cues: the fill on the last bar and the crash that
    // answers it on the next one. They are the same musical gesture, and a
    // crash with no fill in front of it sounds like a mistake.
    fill: jam.fills ? groove.fill : null,
    formBars: formBars(jam.form),
    crashOnOne: jam.fills,
    intensity: JAM_INTENSITY_GAIN[jam.intensity] ?? 1,
    kit: jam.kit || "room",
  };
}

/** The meter a jam runs in — what the UI sets on the engine before sending. */
export function jamMeter(jam: Jam): { beatsPerBar: number; ticksPerBeat: 1 | 2 | 3 | 4 | 6 } {
  const groove = applyFeel(grooveById(jam.grooveId), jam.feel);
  return { beatsPerBar: groove.beatsPerBar, ticksPerBeat: groove.ticksPerBeat };
}
