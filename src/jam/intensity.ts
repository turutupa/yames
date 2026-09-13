/**
 * Soft, normal, loud — as things the drummer PLAYS, not as a volume knob.
 *
 * The first pass made intensity a gain multiplier (`JAM_INTENSITY_GAIN`: 0.7,
 * 1.0, 1.25) and the owner's verdict was that nothing on the screen made the
 * band sound raw. A gain cannot: turning a ghost note up makes a louder ghost
 * note, and turning the whole kit down makes a quiet version of the same
 * smooth thing. A drummer asked to play louder does not play the same bar
 * harder — they stop bothering with the ghosts, they let the hat ring open on
 * the off-beats, and they hit the crash. Asked to play softer they do the
 * reverse: the backbeat goes to the ghost the brushes make, the hat closes,
 * the crash goes away.
 *
 * So intensity has two halves, and this file is the half that changes the
 * table. The gain stays exactly as it was and stays in the contract; nothing
 * here touches it (plans/JAM_UX_DECISIONS.md B5).
 *
 * The rules, in full:
 *
 * | | Loud | Soft |
 * |---|---|---|
 * | ghosts | become hits (3 → 1) | — |
 * | snare | — | hits and accents become ghosts |
 * | hat, off-beats | rise to accent, which is the hat opening | — |
 * | hat | — | accents close to hits |
 * | crash | one on tick 0 | the lane is cleared |
 *
 * Normal is the groove as it was written, returned unchanged and by
 * reference, so a re-render that re-applies it does not hand the engine a new
 * table that is the same table (the same courtesy `applyFeel` does).
 *
 * Pure. Every lane comes back exactly as long as it went in, because a lane
 * that changed length is a bar the engine refuses — silently, by playing the
 * plain click.
 */
import type { GrooveTicks } from "./grooves";
import { JAM_LANES } from "./types";
import type { JamIntensity, JamLevel, JamPattern } from "./types";

/**
 * The meter the pattern is written in. Needed because "the off-beats" is not
 * a property of the array — on eighths it is every other tick, on sixteenths
 * it is three ticks in four, and on a triplet grid it is the two that follow
 * each beat.
 */
export type IntensityMeter = { beatsPerBar: number; ticksPerBeat: GrooveTicks };

/** Is this tick between the beats? A one-tick beat has no off-beats at all. */
export function isOffBeat(tick: number, ticksPerBeat: number): boolean {
  return ticksPerBeat > 1 && tick % ticksPerBeat !== 0;
}

/** A copy with every lane its own array, so nothing below edits the caller's. */
function copy(pattern: JamPattern): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) out[lane] = [...(pattern[lane] ?? [])];
  return out;
}

/**
 * The pattern as this intensity plays it.
 *
 * The returned pattern is the same shape as the one given: same lanes, same
 * length per lane, same tick 0. Only the levels move.
 */
export function applyIntensity(
  pattern: JamPattern,
  intensity: JamIntensity,
  meter: IntensityMeter,
): JamPattern {
  if (intensity === "normal") return pattern;
  return intensity === "loud" ? loud(pattern, meter) : soft(pattern);
}

/**
 * Loud.
 *
 * Ghosts become hits everywhere — that is the "no ghost notes" the driving
 * grooves are written with, applied to the ones that have them, and it is the
 * single biggest difference between a bar that sounds programmed and one that
 * sounds hit. The hat's off-beats rise to accent, which by the convention in
 * `./grooves` is the hat opening; a hat that was silent on an off-beat stays
 * silent, because opening a hat that is not being played is not a thing.
 * And a crash on tick 0, at accent, because that is where a drummer starting
 * loud puts one.
 */
function loud(pattern: JamPattern, meter: IntensityMeter): JamPattern {
  const out = copy(pattern);
  for (const lane of JAM_LANES) {
    const row = out[lane];
    for (let t = 0; t < row.length; t += 1) {
      if (row[t] === 3) row[t] = 1;
    }
  }
  for (let t = 0; t < out.hat.length; t += 1) {
    if (out.hat[t] !== 0 && isOffBeat(t, meter.ticksPerBeat)) out.hat[t] = 2;
  }
  if (out.crash.length > 0) out.crash[0] = 2;
  return out;
}

/**
 * Soft.
 *
 * The snare goes to ghosts: not silence, and not a quieter hit — the ghost is
 * the level the kits render as the soft snare, so a soft backbeat is a real
 * stroke played light rather than the same stroke at lower volume. The hat
 * closes: an accent, which was an open hat, becomes an ordinary hit. And the
 * crash lane goes to zero, so a fill lands without a cymbal on the other side
 * of it.
 *
 * The kick keeps its levels. A kick demoted to a ghost stops being the pulse,
 * and a jam with no findable pulse is not a quiet jam, it is a broken one —
 * the same reason `applyFeel`'s swing softens only the hat and the ride.
 *
 * No meter needed: none of these three rules asks where the beats are.
 */
function soft(pattern: JamPattern): JamPattern {
  const out = copy(pattern);
  for (let t = 0; t < out.snare.length; t += 1) {
    const level = out.snare[t];
    if (level === 1 || level === 2) out.snare[t] = 3;
  }
  for (let t = 0; t < out.hat.length; t += 1) {
    if (out.hat[t] === 2) out.hat[t] = 1;
  }
  out.crash = new Array<JamLevel>(out.crash.length).fill(0);
  return out;
}

/** The least a thing has to be for an intensity to apply to it. */
export type Intensifiable = {
  beatsPerBar: number;
  ticksPerBeat: GrooveTicks;
  bar: JamPattern;
  fill: JamPattern | null;
};

/**
 * A whole groove — its bar and its fill — as this intensity plays it.
 *
 * Written structurally, like `applyFeel`'s `Feelable`, so a groove drawn in
 * the editor gets loud and soft exactly as a preset does. The return type is
 * the caller's own, so a `Groove` comes back a `Groove` with its id intact.
 *
 * The fill goes through the same rules as the bar, which is what makes a loud
 * fill land: its snare figure keeps its accents, and the crash the engine
 * puts on the next one is answered by the one this adds on tick 0.
 */
export function applyIntensityToGroove<G extends Intensifiable>(
  groove: G,
  intensity: JamIntensity,
): G {
  if (intensity === "normal") return groove;
  const meter = { beatsPerBar: groove.beatsPerBar, ticksPerBeat: groove.ticksPerBeat };
  return {
    ...groove,
    bar: applyIntensity(groove.bar, intensity, meter),
    fill: groove.fill ? applyIntensity(groove.fill, intensity, meter) : null,
  };
}
