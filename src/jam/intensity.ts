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
 * | hat, off-beats | move to the `hatOpen` row | — |
 * | hat | — | accents close to hits |
 * | hatOpen | — | closes back onto the hat, and the row empties |
 * | crash | one on tick 0 | the lane is cleared |
 *
 * The open hat is a ROW now (`JamPattern.hatOpen`, second pass), not a level.
 * It used to be an accent on the closed-hat lane, by a convention written
 * down in `./grooves` — and the engine has one voice per lane, so what "Loud
 * opens the hats" actually produced was a louder closed hat. A drummer told
 * to play loud does not hit the hat harder on the off-beats, they let it
 * ring. Moving the stroke to its own row is the honest version, and it is
 * honest in the other direction too: until the engine plays that row, those
 * off-beats are silent rather than wrong.
 *
 * Normal is the groove as it was written, returned unchanged and by
 * reference, so a re-render that re-applies it does not hand the engine a new
 * table that is the same table (the same courtesy `applyFeel` does).
 *
 * Pure. Every lane comes back exactly as long as it went in, because a lane
 * that changed length is a bar the engine refuses — silently, by playing the
 * plain click. `hatOpen` counts: where it is written it is the width of the
 * closed-hat lane, and where nothing opens it is not written at all.
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

/**
 * A copy with every lane its own array, so nothing below edits the caller's.
 *
 * `hatOpen` is copied only where it exists: a pattern with no open hats has
 * no row, and inventing an empty one would put a lane in every table the
 * engine has to read past.
 */
function copy(pattern: JamPattern): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) out[lane] = [...(pattern[lane] ?? [])];
  if (pattern.hatOpen) out.hatOpen = [...pattern.hatOpen];
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
 * sounds hit.
 *
 * The hat's off-beats MOVE: out of the closed-hat lane and into `hatOpen`, at
 * a hit, because that is one stroke played one way and not two strokes. A hat
 * that was silent on an off-beat stays silent, because opening a hat that is
 * not being played is not a thing. Raising the level instead — the old rule —
 * asked the closed hat to be louder and called it open.
 *
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
  const already = out.hatOpen;
  const open: JamLevel[] = new Array<JamLevel>(out.hat.length).fill(0);
  if (already) {
    for (let t = 0; t < already.length && t < open.length; t += 1) open[t] = already[t];
  }
  let opened = already !== undefined;
  for (let t = 0; t < out.hat.length; t += 1) {
    if (out.hat[t] === 0 || !isOffBeat(t, meter.ticksPerBeat)) continue;
    open[t] = 1;
    out.hat[t] = 0;
    opened = true;
  }
  if (opened) out.hatOpen = open;
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
 * An open hat closes rather than disappearing: a stroke in `hatOpen` comes
 * back as an ordinary hit on the closed lane, and the row is left empty. A
 * quiet drummer still plays the off-beat, they just do not let it ring.
 *
 * The kick keeps its levels. A kick demoted to a ghost stops being the pulse,
 * and a jam with no findable pulse is not a quiet jam, it is a broken one —
 * the same reason `applyFeel`'s swing softens only the hat and the ride.
 *
 * No meter needed: none of these rules asks where the beats are.
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
  if (out.hatOpen) {
    for (let t = 0; t < out.hatOpen.length; t += 1) {
      if (out.hatOpen[t] !== 0 && (out.hat[t] ?? 0) === 0) out.hat[t] = 1;
    }
    out.hatOpen = new Array<JamLevel>(out.hatOpen.length).fill(0);
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
