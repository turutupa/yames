/**
 * Straight, shuffle, swing — the same groove played three ways.
 *
 * A shuffle is not a different pattern, it is the same pattern on a triplet
 * grid with the middle tick left empty (JAM_MODE §4.1). So the conversion is
 * mechanical: an eighth-note groove has two ticks to the beat, and each beat's
 * off-beat moves from tick 1 of two to tick 2 of three. Nothing else changes,
 * and in particular the BAR does not — the meter is the groove's, and a feel
 * that quietly re-barred the music would break the form underneath it.
 *
 * A groove already written in triplets (the shuffle and the swing ride) keeps
 * its own pattern: it is already the thing the conversion is trying to make,
 * and running it through again would only push its off-beats out of place.
 */
import type { Groove, GrooveTicks } from "./grooves";
import type { JamFeel, JamLevel, JamPattern, JamLane } from "./types";
import { JAM_LANES } from "./types";

/** Straight eighths → triplets, off-beat on the third tick. */
function toTriplets(source: JamLevel[], beatsPerBar: number): JamLevel[] {
  const out: JamLevel[] = new Array<JamLevel>(beatsPerBar * 3).fill(0);
  for (let beat = 0; beat < beatsPerBar; beat++) {
    out[beat * 3] = source[beat * 2] ?? 0;
    out[beat * 3 + 2] = source[beat * 2 + 1] ?? 0;
  }
  return out;
}

function patternToTriplets(pattern: JamPattern, beatsPerBar: number): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) out[lane] = toTriplets(pattern[lane], beatsPerBar);
  return out;
}

/**
 * Swing's extra step: the hat's off-beat drops to a ghost.
 *
 * A shuffle plays both halves of the beat at the same weight; swing leans on
 * the first and brushes the second. Hats and ride only — a kick or a snare
 * demoted to a ghost stops being the beat it was written as.
 */
const SOFTENED: readonly JamLane[] = ["hat", "ride"];

function softenOffBeats(pattern: JamPattern, beatsPerBar: number): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) {
    const row = [...pattern[lane]];
    if (SOFTENED.includes(lane)) {
      for (let beat = 0; beat < beatsPerBar; beat++) {
        const i = beat * 3 + 2;
        if (row[i] === 1 || row[i] === 2) row[i] = 3;
      }
    }
    out[lane] = row;
  }
  return out;
}

/**
 * `groove` as this feel plays it.
 *
 * Returns the groove itself when there is nothing to do, so a re-render that
 * recompiles a jam does not hand the engine a new table that is the same
 * table.
 */
export function applyFeel(groove: Groove, feel: JamFeel): Groove {
  if (feel === "straight") return groove;
  if (groove.ticksPerBeat !== 2) return groove;

  const ticksPerBeat: GrooveTicks = 3;
  let bar = patternToTriplets(groove.bar, groove.beatsPerBar);
  let fill = patternToTriplets(groove.fill, groove.beatsPerBar);
  if (feel === "swing") {
    bar = softenOffBeats(bar, groove.beatsPerBar);
    fill = softenOffBeats(fill, groove.beatsPerBar);
  }
  return { ...groove, ticksPerBeat, bar, fill };
}
