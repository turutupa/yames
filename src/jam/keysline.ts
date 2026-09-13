/**
 * The keys player: one voicing per tick, comping under the changes.
 *
 * The third member of the band (JAM_MODE §4.3), and the one for people who
 * want harmony under them rather than just a root. Like the bass it is
 * deterministic and generated, never a model and never a sample: the engine
 * gets `JamKeysLine` — an array as long as the drum lanes, each entry the MIDI
 * notes to sound on that tick and an empty array for a rest.
 *
 * ## Two styles, because there are two things a keys player does
 *
 * - **Pads**: one voicing on beat one, held through the bar. Under a soloist
 *   this is a bed, and it is what you want when the drums are busy.
 * - **Stabs**: the chord on the "and" of two and four — the Count Basie
 *   placement, off the beat and answering the snare. In a meter with no two
 *   and four it lands on the snare's own beats instead, read off the groove
 *   rather than assumed, so a 7/8 rule groove still gets stabs where its
 *   backbeats are.
 *
 * ## The voicing, and why it moves as little as it does
 *
 * Close voicings inside MIDI 55–79 (G3 to G5): the range a keys player's
 * right hand comps in, low enough to sound like harmony and high enough to
 * stay out of the bass's way. At most four notes, so a ninth chord loses its
 * fifth rather than turning into a cluster.
 *
 * Between bars the voicing takes the **nearest inversion to the one before**.
 * That is not a refinement, it is the difference between comping and a chord
 * chart being read aloud: root-position triads leaping round the keyboard is
 * the sound of a MIDI file, and a hand that moves a tone or two to the next
 * chord is the sound of a player. Every note of a new voicing lands within a
 * fourth of a note of the previous one, which is the constraint the search
 * below is filtered on rather than merely scored by — see `chooseVoicing`.
 */
import { chordNotes } from "./harmony";
import type { Chord } from "./harmony";
import type { JamKeysLine, JamKeysStyle, JamLevel, JamPattern } from "./types";

export const JAM_KEYS_STYLES: readonly JamKeysStyle[] = ["pads", "stabs"];

/** The comping range, MIDI. G3 to G5 — a right hand, above the bass. */
export const KEYS_LOW = 55;
export const KEYS_HIGH = 79;

/** More than four notes in one hand stops being a voicing and starts being a chord symbol. */
export const KEYS_MAX_NOTES = 4;

/** How far a voice may move between bars and still be voice leading: a fourth. */
export const KEYS_MAX_LEAP = 5;

export type KeysLineArgs = {
  chord: Chord;
  /** The groove's bar, for the ticks the snare falls on. */
  groove: JamPattern;
  style: JamKeysStyle;
  meter: { beatsPerBar: number; ticksPerBeat: number };
  /**
   * The voicing the previous bar ended on, for the voice leading. Absent on
   * the first bar of a take, which is why the opening voicing is built in the
   * middle of the range rather than wherever the search happens to land.
   */
  previous?: number[] | null;
  /** Gain on the keys voice, 0.5..1.5. Default 1. */
  gain?: number;
};

/** Every octave placement of `pc` that fits in the comping range. */
function placements(pc: number): number[] {
  const out: number[] = [];
  const base = ((pc % 12) + 12) % 12;
  for (let midi = KEYS_LOW + ((base - KEYS_LOW) % 12 + 12) % 12; midi <= KEYS_HIGH; midi += 12) {
    out.push(midi);
  }
  return out;
}

/**
 * The chord as at most four pitch classes.
 *
 * A ninth is root, third, seventh, ninth: the fifth is the note that says
 * least and the one a keys player drops first, so the trim takes it from the
 * MIDDLE of the stack rather than the top. Dropping the top would throw away
 * the ninth, which is the whole reason the chord is a ninth.
 */
function voicingTones(chord: Chord): number[] {
  const notes = chordNotes(chord);
  if (notes.length <= KEYS_MAX_NOTES) return notes;
  const kept = [...notes];
  // Index 2 is the fifth in every stacked-thirds quality this module sees.
  kept.splice(2, notes.length - KEYS_MAX_NOTES);
  return kept;
}

/** How far `note` is from the closest note of `from`; Infinity when `from` is empty. */
function distanceToSet(from: readonly number[], note: number): number {
  let best = Infinity;
  for (const other of from) best = Math.min(best, Math.abs(other - note));
  return best;
}

/**
 * Every close voicing of these pitch classes that fits the range.
 *
 * A close voicing is the notes packed into ONE OCTAVE above whichever of them
 * is at the bottom: pick a bottom note, then place every other pitch class at
 * its first appearance above it. Rotating which pitch class is at the bottom
 * is what an inversion IS, and every octave of every inversion that fits the
 * range is in this list.
 *
 * The stacking is by INTERVAL above the bottom, not by the order the chord is
 * spelled in. That is what keeps the span under an octave, and it is the
 * difference between a voicing and a chord symbol: stacked in spelling order
 * a ninth chord comes out root-third-seventh-ninth across fourteen semitones,
 * which no hand plays and which no amount of voice leading can then bring
 * within a fourth of the triad before it.
 */
function closeVoicings(pcs: number[]): number[][] {
  const unique = [...new Set(pcs.map((pc) => ((pc % 12) + 12) % 12))];
  const out: number[][] = [];
  for (const pc of unique) {
    const intervals = unique
      .filter((other) => other !== pc)
      .map((other) => ((other - pc) % 12 + 12) % 12)
      .sort((a, b) => a - b);
    for (const bottom of placements(pc)) {
      const voicing = [bottom, ...intervals.map((step) => bottom + step)];
      if (voicing[voicing.length - 1] > KEYS_HIGH) continue;
      out.push(voicing);
    }
  }
  return out;
}

/** How far the middle of a voicing sits from the middle of the range. */
function centreCost(voicing: number[]): number {
  const centre = (KEYS_LOW + KEYS_HIGH) / 2;
  const mean = voicing.reduce((sum, n) => sum + n, 0) / voicing.length;
  return Math.abs(mean - centre);
}

/**
 * The voicing to play, given the one before it.
 *
 * Two passes rather than one score. The **filter** comes first: keep only the
 * candidates in which every note is within a fourth of a note of the previous
 * voicing, because "the hand did not leap" is a property the result either has
 * or does not, and a scoring function will happily trade it away for a
 * slightly tidier sum. Only if nothing survives — which needs a range this
 * narrow and a chord with no common ground at all — does the whole field come
 * back, so the band never falls silent over a technicality.
 *
 * Among what is left, the least total movement wins, and a first voicing with
 * nothing to move from takes the one nearest the middle of the range.
 */
export function chooseVoicing(chord: Chord, previous?: readonly number[] | null): number[] {
  const candidates = closeVoicings(voicingTones(chord));
  if (candidates.length === 0) return [];
  if (!previous || previous.length === 0) {
    return [...candidates].sort((a, b) => centreCost(a) - centreCost(b))[0];
  }
  const near = candidates.filter((voicing) =>
    voicing.every((note) => distanceToSet(previous, note) <= KEYS_MAX_LEAP),
  );
  const pool = near.length > 0 ? near : candidates;
  let best = pool[0];
  let bestCost = Infinity;
  for (const voicing of pool) {
    const movement = voicing.reduce((sum, note) => sum + distanceToSet(previous, note), 0);
    // The centre term is a tie-break, not a force: a hundredth of a semitone
    // per semitone off centre, which decides between two equal-movement
    // voicings and never outvotes a smaller move.
    const cost = movement + centreCost(voicing) * 0.01;
    if (cost < bestCost) {
      bestCost = cost;
      best = voicing;
    }
  }
  return best;
}

/** The ticks a bar's snare lands on — where the stabs go in an odd meter. */
function snareTicks(groove: JamPattern, length: number): number[] {
  const out: number[] = [];
  const lane: JamLevel[] = groove?.snare ?? [];
  for (let tick = 0; tick < length; tick++) {
    // A ghost is not a backbeat, and comping on one would put the chord in a
    // place the drummer is deliberately being quiet.
    if (lane[tick] === 1 || lane[tick] === 2) out.push(tick);
  }
  return out;
}

/**
 * Which ticks of the bar the chord is struck on.
 *
 * Pads: tick zero, and the engine holds it. Stabs in a bar of four: the "and"
 * of two and four, which is where a comping hand lives. Stabs anywhere else:
 * the snare's own beats, because "two and four" is a statement about a bar of
 * four and a jam in seven has no such beats to put a chord on.
 */
export function keysTicks(args: {
  style: JamKeysStyle;
  groove: JamPattern;
  meter: { beatsPerBar: number; ticksPerBeat: number };
}): number[] {
  const { style, groove, meter } = args;
  const { beatsPerBar, ticksPerBeat } = meter;
  const length = Math.max(0, beatsPerBar * ticksPerBeat);
  if (length === 0) return [];
  if (style === "pads") return [0];

  if (beatsPerBar === 4 && ticksPerBeat >= 2) {
    const and = Math.round(ticksPerBeat / 2);
    return [1 * ticksPerBeat + and, 3 * ticksPerBeat + and].filter((tick) => tick < length);
  }
  const snare = snareTicks(groove, length);
  // A groove with no snare at all still gets comped, on the beats a backbeat
  // would have been: silence from the keys because the drummer is playing
  // brushes would be the wrong lesson to draw from the table.
  if (snare.length > 0) return snare;
  const beats: number[] = [];
  for (let beat = 1; beat < beatsPerBar; beat += 2) beats.push(beat * ticksPerBeat);
  return beats.length > 0 ? beats : [0];
}

/**
 * One bar of keys: the voicing, on the ticks the style puts it on.
 *
 * One bar, like `bassLineFor`, and for the same reason — the chord changes
 * from bar to bar and the config carries the bar that is about to be played.
 * `previous` is how the voice leading crosses that boundary: the caller hands
 * back the voicing the last bar used and the hand moves from where it was.
 */
export function keysLineFor(args: KeysLineArgs): JamKeysLine {
  const { chord, groove, style, meter, previous = null, gain = 1 } = args;
  const length = Math.max(0, meter.beatsPerBar * meter.ticksPerBeat);
  const voicing = chooseVoicing(chord, previous);
  const ticks = new Set(keysTicks({ style, groove, meter }));
  const voicings: number[][] = [];
  for (let tick = 0; tick < length; tick++) {
    voicings.push(ticks.has(tick) ? [...voicing] : []);
  }
  return { voicings, gain: Math.max(0.5, Math.min(1.5, gain)) };
}

/** The voicing a keys line struck, for the next bar to lead away from. */
export function lastVoicing(line: JamKeysLine | null | undefined): number[] | null {
  if (!line) return null;
  for (let i = line.voicings.length - 1; i >= 0; i--) {
    if (line.voicings[i].length > 0) return line.voicings[i];
  }
  return null;
}
