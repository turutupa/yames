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
 * | snare | the backbeat peaks every fourth bar | hits and accents become ghosts |
 * | hat, off-beats | move to the `hatOpen` row | — |
 * | hat | — | accents close to hits |
 * | hatOpen | — | closes back onto the hat, and the row empties |
 * | crash | one on tick 0 | the lane is cleared |
 * | peaks | — | come back to accents |
 * | shaker, cabasa | ghosts become hits | accents close to hits |
 * | the other eight percussion rows | ghosts become hits | — |
 *
 * ## The percussionist (fifth pass)
 *
 * The ten percussion rows go through the two rules that are about LEVELS and
 * not about drums — Loud's ghosts, Soft's peaks — because those are true of
 * anybody's hands. Beyond that only the shaker and the cabasa are touched, and
 * they are touched exactly as the hat is: they are the one part of the set
 * that plays a running subdivision rather than a figure, so they are the one
 * part a rule written for a hi-hat is true of (`JAM_PERC_TIMEKEEPERS`). The
 * clave, the tambourine, the cowbell, the güiro, the congas and the bongos are
 * left alone at every intensity, because a figure softened until its accents
 * are gone is not a quiet figure, it is a different one.
 *

 * ## The fourth bar (third pass)
 *
 * A drummer playing loud does not hit every backbeat the same. Every fourth
 * bar — the bar that ends a four-bar phrase — the backbeat gets the whole arm,
 * and that is a PEAK: the hardest stroke on the kit, and on a recorded kit a
 * different sample rather than the same one louder.
 *
 * Which is why this takes a bar number. `compileJam` re-sends the config on
 * every bar line already (the bass has to), so the drummer's phrasing can ride
 * along on a counter the caller is keeping anyway; nothing new is asked of the
 * audio thread. Bar 0 of the chorus is the first bar of the phrase, so the
 * peak lands on bars 3, 7, 11 … counted from zero.
 *
 * A ghost on the snare is left alone by that rule and raised to a hit by the
 * one above it, which is also how a loud cross-stick groove stops being a
 * cross-stick groove: a bossa played loud is played on the head.
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
import { JAM_ALL_OPTIONAL_LANES, JAM_LANES, JAM_PERC_TIMEKEEPERS } from "./types";
import type { JamIntensity, JamLevel, JamPattern } from "./types";

/** How often a loud drummer leans the whole arm into the backbeat. */
const PHRASE_BARS = 4;

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
 * The optional rows — the open hat, the two toms and the percussionist's ten —
 * are copied only where they exist: a pattern with no open hats has no row,
 * and inventing an empty one would put a lane in every table the engine has to
 * read past.
 */
function copy(pattern: JamPattern): JamPattern {
  const out = {} as JamPattern;
  for (const lane of JAM_LANES) out[lane] = [...(pattern[lane] ?? [])];
  for (const lane of JAM_ALL_OPTIONAL_LANES) {
    const row = pattern[lane];
    if (row) out[lane] = [...row];
  }
  return out;
}

/** Every row the pattern actually carries, required and optional. */
function rowsOf(pattern: JamPattern): JamLevel[][] {
  const rows: JamLevel[][] = JAM_LANES.map((lane) => pattern[lane]);
  for (const lane of JAM_ALL_OPTIONAL_LANES) {
    const row = pattern[lane];
    if (row) rows.push(row);
  }
  return rows;
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
  formBar = 0,
): JamPattern {
  if (intensity === "normal") return pattern;
  return intensity === "loud" ? loud(pattern, meter, formBar) : soft(pattern);
}

/** Is this the bar a loud drummer leans on — the last of a four-bar phrase? */
export function isPhraseEnd(formBar: number): boolean {
  const bar = Math.trunc(formBar);
  if (!Number.isFinite(bar)) return false;
  return ((bar % PHRASE_BARS) + PHRASE_BARS) % PHRASE_BARS === PHRASE_BARS - 1;
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
 *
 * On the last bar of every four-bar phrase the snare's accents — which is
 * where the backbeat is written — go to PEAK. That is the arm going in at the
 * end of the phrase, and it is what stops a loud drummer sounding like a
 * normal drummer turned up.
 */
function loud(pattern: JamPattern, meter: IntensityMeter, formBar: number): JamPattern {
  const out = copy(pattern);
  for (const row of rowsOf(out)) {
    for (let t = 0; t < row.length; t += 1) {
      if (row[t] === 3) row[t] = 1;
    }
  }
  if (isPhraseEnd(formBar)) {
    for (let t = 0; t < out.snare.length; t += 1) {
      if (out.snare[t] === 2) out.snare[t] = 4;
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
 * And every PEAK comes back to an accent. A quiet drummer still marks the top
 * of the fill and still lands the one — they just do not take the arm back to
 * do it. The snare goes through this rule second, so a peak on the snare
 * lands on an accent and stops there rather than falling all the way to a
 * ghost: the top of a fill you cannot hear is not a soft fill, it is no fill.
 *
 * No meter needed: none of these rules asks where the beats are.
 */
function soft(pattern: JamPattern): JamPattern {
  const out = copy(pattern);
  for (let t = 0; t < out.snare.length; t += 1) {
    const level = out.snare[t];
    if (level === 1 || level === 2) out.snare[t] = 3;
  }
  for (const row of rowsOf(out)) {
    for (let t = 0; t < row.length; t += 1) {
      if (row[t] === 4) row[t] = 2;
    }
  }
  for (let t = 0; t < out.hat.length; t += 1) {
    if (out.hat[t] === 2) out.hat[t] = 1;
  }
  /**
   * The shaker and the cabasa close the same way the hat does, and the other
   * eight percussion rows are left exactly as written.
   *
   * Those two are the percussionist's hi-hat — a stroke on every subdivision,
   * accent on the beat and a lighter one off it — so the rule that softens a
   * hat is the rule that softens them: the hand keeps moving, it just stops
   * digging in. Every other row in the set is a FIGURE, and a figure quietened
   * into flatness stops being the figure. A clave played soft is still a
   * clave: two strokes and three, at the weights the pattern says. A tumbao
   * whose open tones came back to the level of its slaps is not a quiet
   * tumbao, it is a conga player nobody told what a tumbao is.
   */
  for (const lane of JAM_PERC_TIMEKEEPERS) {
    const row = out[lane];
    if (!row) continue;
    for (let t = 0; t < row.length; t += 1) {
      if (row[t] === 2) row[t] = 1;
    }
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
 *
 * The fill does NOT get the fourth-bar peak, and that is the one asymmetry
 * here. `formBar` is the bar the caller is about to play; the fill is played
 * on the bar that ends the chorus, which is a different bar, so phrasing the
 * fill by this number would be phrasing it by somebody else's count. It has
 * no need of the rule anyway — a fill written to this pass's shape already
 * ends on a peak of its own.
 */
export function applyIntensityToGroove<G extends Intensifiable>(
  groove: G,
  intensity: JamIntensity,
  formBar = 0,
): G {
  if (intensity === "normal") return groove;
  const meter = { beatsPerBar: groove.beatsPerBar, ticksPerBeat: groove.ticksPerBeat };
  return {
    ...groove,
    bar: applyIntensity(groove.bar, intensity, meter, formBar),
    fill: groove.fill ? applyIntensity(groove.fill, intensity, meter) : null,
  };
}
