/**
 * Jam — the bass player.
 *
 * One MIDI note per tick for ONE bar, given that bar's chord and the next
 * bar's (for the note that walks you into it). Pure, deterministic, no model
 * anywhere: plans/JAM_MODE.md §3.2 says everything the band plays is
 * generated, and §4.3 says the bass line is "derived from the groove: roots
 * and fifths under a rock beat, walking under swing, the bossa pattern under
 * a bossa".
 *
 * The line is a column of the same table the drums are (§3.3): index `t` of
 * `pitches` is tick `t` of the bar, `0` is a rest, and the array is exactly
 * `beatsPerBar × ticksPerBeat` long. Nothing about timing changes.
 *
 * Two register rules hold for every style:
 *
 * - **Roots live low.** A root is folded into E1–D#2 (MIDI 28–39), the
 *   bottom octave of the bass range. That is where a bass player puts a
 *   root, and it leaves the octave above free, so `root + 12` and
 *   `root + fifth` are always inside the range without a second thought.
 * - **Nothing leaves E1–G3** (MIDI 28–55). Every pitch this module emits is
 *   folded by octaves until it is inside.
 *
 * The chord type is local on purpose. `src/jam/harmony.ts` is another
 * worker's file and has not landed; `BassChord` is the minimum this module
 * needs, and the integrator adapts it when harmony arrives.
 */

import type { JamBassLine, JamBassVoice, JamFeel, JamPattern } from "./types";

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

/** E1. The bottom of a four-string bass, and the bottom of a drop-D guitar. */
export const BASS_MIN_MIDI = 28;
/** G3. High enough for a walking line to breathe, low enough to stay bass. */
export const BASS_MAX_MIDI = 55;
/** Roots are folded into this octave, so `root + 12` always fits above. */
export const BASS_ROOT_MAX_MIDI = 39;

/** Fold any pitch into E1–G3 by octaves. */
export function toBassRange(midi: number): number {
  let m = Math.round(midi);
  while (m > BASS_MAX_MIDI) m -= 12;
  while (m < BASS_MIN_MIDI) m += 12;
  return m;
}

/** Fold a root into E1–D#2, the register a bass player actually plays it in. */
export function bassRoot(midi: number): number {
  let m = ((Math.round(midi) % 12) + 12) % 12;
  while (m < BASS_MIN_MIDI) m += 12;
  return m;
}

/**
 * The octave of `target` that sits closest to `reference`, still inside the
 * range. Ties go to the lower octave, so the line stays deterministic and
 * stays down where a bass belongs.
 */
export function nearestInRange(target: number, reference: number): number {
  let best = toBassRange(target);
  for (let m = best - 24; m <= best + 24; m += 12) {
    if (m < BASS_MIN_MIDI || m > BASS_MAX_MIDI) continue;
    const d = Math.abs(m - reference);
    const bd = Math.abs(best - reference);
    if (d < bd || (d === bd && m < best)) best = m;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

export type BassChordQuality =
  | "7"
  | "maj7"
  | "m7"
  | "maj"
  | "min"
  | "m7b5"
  | "dim7"
  | "6"
  | "m6"
  | "9";

/** A bar's chord: where its root is, and what kind of chord it is. */
export type BassChord = { rootMidi: number; quality: BassChordQuality };

/**
 * Semitones above the root, lowest first. Index 1 is always the third and
 * index 2 always the fifth, which is what the styles below rely on.
 */
export const CHORD_INTERVALS: Record<BassChordQuality, readonly number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  "6": [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  "9": [0, 4, 7, 10, 14],
};

/** The chord's tones as intervals from its root. */
export function chordTones(chord: BassChord): number[] {
  return [...CHORD_INTERVALS[chord.quality]];
}

/** The third: 4 semitones on a major-ish chord, 3 on a minor-ish one. */
export function chordThird(chord: BassChord): number {
  return CHORD_INTERVALS[chord.quality][1];
}

/** The fifth: 7, or 6 on a half-diminished or diminished chord. */
export function chordFifth(chord: BassChord): number {
  return CHORD_INTERVALS[chord.quality][2];
}

/**
 * The sixth and the flat seventh of the shuffle vocabulary — 9 and 10
 * semitones. These are degrees of the mode the boogie walks through, not
 * tones taken from the chord symbol, so they do not change with the quality.
 * On a plain major or minor triad the b7 is what makes it sound like blues,
 * which is the whole point of the figure.
 */
export const SHUFFLE_SIXTH = 9;
export const SHUFFLE_FLAT_SEVENTH = 10;

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

export type BassStyle = "rock" | "shuffle" | "swing" | "bossa" | "waltz" | "sixeight" | "funk";

/**
 * Which bass style a groove asks for. The ids are the ones
 * `plans/JAM_MODE.md` §4.1 names; `bassStyleForGroove` normalises spelling so
 * `rock8ths`, `rock-8ths` and `ROCK_8THS` all land in the same place, because
 * `src/jam/grooves.ts` belongs to another worker and has not landed yet.
 */
export const BASS_STYLE_FOR_GROOVE: Record<string, BassStyle> = {
  "rock-8ths": "rock",
  "rock-16ths": "rock",
  "half-time": "rock",
  shuffle: "shuffle",
  swing: "swing",
  funk: "funk",
  bossa: "bossa",
  waltz: "waltz",
  "six-eight": "sixeight",
  // The ids `src/jam/grooves.ts` actually shipped with. `swingRide` is the
  // one that matters: normalised it is "swingride", which no spelling of
  // "swing" reaches, so without this line every swing jam got a rock bass
  // under a ride cymbal.
  rock8: "rock",
  rock16: "rock",
  halfTime: "rock",
  sixEight: "sixeight",
  swingRide: "swing",
  /**
   * The five that came later.
   *
   * Four of them are `rock` — roots on the kick — and that is not a shrug: the
   * rock line reads the groove's own kick lane, so the same style writes four
   * different bass parts under these four drummers. Under the one-drop, whose
   * kick is on three and nowhere else, it puts the root on three with the side
   * stick, which is what a reggae bass does. Under four-on-the-floor it plays
   * every beat and takes the octave on the "and" of the bar when the chord is
   * about to change. Under the train beat it is one and three, and under boom
   * bap it is one and the "and" of two. Funk is the one that needs its own
   * line rather than the kick's, and it already has one above.
   */
  oneDrop: "rock",
  train: "rock",
  boomBap: "rock",
  fourOnFloor: "rock",
  /**
   * The seven the vibes brought (plans/JAM_UX_DECISIONS.md B4).
   *
   * Four of the drivers are `rock` again — roots on the kick — and again that
   * writes four different parts, because the four kicks are different. Under
   * double kick it is a root on every sixteenth, which the voice rule below
   * reads as one held note; under the stomp it is the four heavy ones and
   * nothing else; under two-step it is the walking rhythm the drum is already
   * playing.
   *
   * Samba and cha-cha get the bossa line — root down, fifth pushed onto the
   * "and" — which is the figure all three of those styles share. The second
   * line gets `funk`: the root on the one and octave pops wherever the street
   * beat's bass drum lands, which is exactly how that part is played.
   */
  hardRock: "rock",
  stomp: "rock",
  doubleKick: "rock",
  twoStep: "rock",
  samba: "bossa",
  chaCha: "bossa",
  secondLine: "funk",
};

function normaliseGrooveId(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const NORMALISED_STYLES: Record<string, BassStyle> = Object.fromEntries(
  Object.entries(BASS_STYLE_FOR_GROOVE).map(([id, style]) => [normaliseGrooveId(id), style]),
);

/**
 * The style for a groove id, spelling-insensitive. An id nobody has taught
 * this table gets `rock` — roots on the kick is the one line that is never
 * wrong under a beat you have not seen.
 */
export function bassStyleForGroove(grooveId: string): BassStyle {
  return NORMALISED_STYLES[normaliseGrooveId(grooveId)] ?? "rock";
}

// ---------------------------------------------------------------------------
// The voice, and how long a note is
// ---------------------------------------------------------------------------

/**
 * How long each bass voice holds a note, in beats.
 *
 * This is the only difference the voice makes to the LINE. Everything else a
 * voice is — the pick attack, the thumb, the round-wound growl of an upright,
 * the filter on a synth — is synthesis, and lives on the audio side
 * (plans/JAM_UX_DECISIONS.md B9). What lives here is note length, because
 * note length is written in the notes and a synthesiser cannot invent it:
 * a picked bass is short and separated, a slap line is shorter still and all
 * space, a fingered line lets the note ring for its beat, an upright rings
 * past it, and a synth bass holds until the next note or the bar ends.
 *
 * ## How a length is written
 *
 * `JamBassLine` has `pitches` and `gain` and nothing else — no durations —
 * and the contract is not ours to grow. So the length is written in the
 * phrasing, with one rule:
 *
 * > **The same pitch on consecutive ticks is ONE note held, not two notes.**
 *
 * A run of `[45, 45, 45, 0]` is a dotted half of A; `[45, 0, 45, 0]` is two
 * separate As. The engine re-attacks only where the pitch CHANGES from the
 * tick before, so a hold costs it nothing and a rest ends the note. Read a
 * line back with `sustainedRuns` rather than by counting non-zero ticks.
 *
 * Two ticks is the shortest anything can be held, so a voice whose hold
 * rounds below one tick simply gets one tick — the note as it was written,
 * which is the short, separated attack `picked` and `slap` are asking for
 * anyway.
 */
export const BASS_VOICE_HOLD_BEATS: Record<JamBassVoice, number> = {
  picked: 0.5,
  slap: 0.5,
  fingered: 1,
  upright: 2,
  // Held: the note runs to whatever comes next, which for a synth bass is
  // the whole point. `Infinity` rather than a big number, so the maths below
  // says "until the next note" instead of "for a very long time".
  synth: Infinity,
};

/**
 * `pitches`, with each note held for as long as its voice holds a note.
 *
 * Pure, and a copy: the caller's array is not touched. A note is extended
 * over the ticks that follow it until either its voice's hold runs out, the
 * next note starts, or the bar ends — so a hold can never swallow the note
 * after it, and the line's attacks land exactly where the style put them.
 *
 * A rest (`0`) is never extended, and a note is never shortened: this only
 * ever fills silence that was already after the note.
 *
 * ## The one place the hold stops short
 *
 * A held note runs up to the next attack — unless that attack is the SAME
 * pitch, in which case it stops one tick earlier and leaves a rest. It has
 * to: "hold" and "strike the same note again" are the same three ticks of
 * the same number otherwise, and the rule cannot read both. So a rock line
 * with roots on the kick at 1 and the "a" of 1 comes back as two notes with
 * a hair of silence between them, which is what a bass player's fingers do
 * anyway. The rest is one tick, and only one.
 */
export function applyBassVoice(
  pitches: readonly number[],
  a: { voice: JamBassVoice; ticksPerBeat: number },
): number[] {
  const out = [...pitches];
  const beats = BASS_VOICE_HOLD_BEATS[a.voice];
  const ticks = a.ticksPerBeat > 0 ? a.ticksPerBeat : 1;
  const hold = Number.isFinite(beats) ? Math.max(1, Math.round(beats * ticks)) : out.length;
  if (hold <= 1) return out;

  // Runs, not ticks: a style that already repeated a pitch wrote a hold, and
  // that hold is ONE note whose length is measured from where it was struck.
  // Walking it tick by tick would either re-start the hold on every tick of
  // it or refuse to lengthen it at all.
  const runs = sustainedRuns(pitches);
  for (let i = 0; i < runs.length; i += 1) {
    const run = runs[i];
    const after = run.start + run.length;
    const nextRun = runs[i + 1];
    const next = nextRun ? nextRun.start : out.length;
    // Room up to the next attack, minus the tick that keeps a same-pitch
    // attack readable as an attack.
    const until = nextRun && nextRun.pitch === run.pitch ? next - 1 : next;
    const end = Math.min(run.start + hold, until);
    for (let u = after; u < end; u += 1) out[u] = run.pitch;
  }
  return out;
}

/** One note of a line: where it is struck, how many ticks it sounds for, its pitch. */
export type BassRun = { start: number; length: number; pitch: number };

/**
 * A line read as notes rather than as ticks — the hold rule above, applied.
 *
 * This is what the engine wants (attack here, hold for this long) and what a
 * test wants (did the picked line come out shorter than the upright one).
 * Consecutive ticks at the same pitch are one run; a rest or a different
 * pitch ends it.
 */
export function sustainedRuns(pitches: readonly number[]): BassRun[] {
  const runs: BassRun[] = [];
  for (let t = 0; t < pitches.length; t += 1) {
    const pitch = pitches[t];
    if (!pitch) continue;
    const last = runs[runs.length - 1];
    if (last && last.pitch === pitch && last.start + last.length === t) last.length += 1;
    else runs.push({ start: t, length: 1, pitch });
  }
  return runs;
}

// ---------------------------------------------------------------------------
// The tick grid
// ---------------------------------------------------------------------------

/**
 * The tick that carries the "and" of a beat.
 *
 * On a triplet grid the "and" of a swung eighth is the *third* triplet, not
 * the middle one — the middle one is the tick shuffle and swing leave empty.
 * On a plain quarter-note grid there is no "and" to land on.
 */
export function andTick(ticksPerBeat: number): number | null {
  switch (ticksPerBeat) {
    case 2:
      return 1;
    case 3:
      return 2;
    case 4:
      return 2;
    case 6:
      return 3;
    default:
      return null;
  }
}

/**
 * The middle tick of a triplet, which shuffle and swing silence (§4.1: "a
 * triplet subdivision with the middle tick silent"). The bass never places a
 * note of its own there. A kick that lands there is a different matter: the
 * engine plays that tick, so the bass plays it too.
 */
function swallowed(feel: JamFeel, ticksPerBeat: number, tick: number): boolean {
  return (feel === "shuffle" || feel === "swing") && ticksPerBeat === 3 && tick % 3 === 1;
}

/** The first tick at or after `tick` that shuffle and swing do not swallow. */
function firstPlayable(feel: JamFeel, ticksPerBeat: number, tick: number, length: number): number {
  let t = tick;
  while (t < length && swallowed(feel, ticksPerBeat, t)) t += 1;
  return t < length ? t : tick;
}

// ---------------------------------------------------------------------------
// The line
// ---------------------------------------------------------------------------

export type BassLineInput = {
  /** The drum pattern for this bar; the rock and funk lines read its kick. */
  groove: JamPattern;
  feel: JamFeel;
  /** This bar's chord, and the next bar's for the note that leads into it. */
  chords: { bar: BassChord; next?: BassChord | null };
  beatsPerBar: number;
  ticksPerBeat: 1 | 2 | 3 | 4 | 6;
  style: BassStyle;
  /**
   * Which bar of the form this is, 0-based. Only the shuffle uses it, to know
   * whether it is the first or second bar of a two-bar boogie phrase.
   */
  barIndex?: number;
  /**
   * Which bass is playing. It does not change WHICH notes the style picks —
   * a walking line walks whoever is holding the instrument — only how long
   * each one is held (`applyBassVoice`).
   *
   * Absent means "leave the phrasing alone": every note is one tick, which is
   * what this module wrote before voices existed and what a caller that has
   * no voice to hand should still get.
   */
  voice?: JamBassVoice;
};

/** The bass for one bar. Gain is 1.0; the intensity multiplier is the mix's job. */
export function bassLineFor(input: BassLineInput): JamBassLine {
  const { groove, feel, chords, beatsPerBar, ticksPerBeat, style } = input;
  const length = Math.max(0, Math.trunc(beatsPerBar)) * ticksPerBeat;
  const pitches = new Array<number>(length).fill(0);
  if (length === 0) return { pitches, gain: 1.0 };

  const chord = chords.bar;
  const next = chords.next ?? chord;
  const barIndex = input.barIndex ?? 0;

  switch (style) {
    case "rock":
      rockLine(pitches, { groove, feel, chord, next, beatsPerBar, ticksPerBeat });
      break;
    case "shuffle":
      shuffleLine(pitches, { feel, chord, beatsPerBar, ticksPerBeat, barIndex });
      break;
    case "swing":
      swingLine(pitches, { feel, chord, next, beatsPerBar, ticksPerBeat });
      break;
    case "bossa":
      bossaLine(pitches, { feel, chord, beatsPerBar, ticksPerBeat });
      break;
    case "waltz":
    case "sixeight":
      rootFifthLine(pitches, { feel, chord, ticksPerBeat });
      break;
    case "funk":
      funkLine(pitches, { groove, chord, ticksPerBeat });
      break;
  }

  for (let t = 0; t < length; t += 1) {
    if (pitches[t] !== 0) pitches[t] = toBassRange(pitches[t]);
  }
  // Last, and after the folding: the hold rule compares pitches, and two
  // spellings of the same note an octave apart are two notes, not a hold.
  const voiced = input.voice
    ? applyBassVoice(pitches, { voice: input.voice, ticksPerBeat })
    : pitches;
  return { pitches: voiced, gain: 1.0 };
}

/**
 * Rock — roots on the kick.
 *
 * A root wherever the kick lane is non-zero, so the bass and the kick are one
 * sound. On the "and" of the last beat, when the next bar changes chord, one
 * lead-in note: the fifth or the octave, whichever sits closer to the next
 * bar's root (the fifth wins a tie, because it is the more common move). If
 * the kick already occupies that tick, the kick wins — a root on the kick is
 * the invariant this style is named for.
 */
function rockLine(
  out: number[],
  a: {
    groove: JamPattern;
    feel: JamFeel;
    chord: BassChord;
    next: BassChord;
    beatsPerBar: number;
    ticksPerBeat: number;
  },
): void {
  const root = bassRoot(a.chord.rootMidi);
  for (let t = 0; t < out.length; t += 1) {
    if ((a.groove.kick[t] ?? 0) !== 0) out[t] = root;
  }

  const and = andTick(a.ticksPerBeat);
  if (and === null) return;
  if (((a.next.rootMidi % 12) + 12) % 12 === ((a.chord.rootMidi % 12) + 12) % 12) return;

  const t = (a.beatsPerBar - 1) * a.ticksPerBeat + and;
  if (t < 0 || t >= out.length || out[t] !== 0) return;
  if (swallowed(a.feel, a.ticksPerBeat, t)) return;

  const nextRoot = nearestInRange(bassRoot(a.next.rootMidi), root);
  const fifth = toBassRange(root + chordFifth(a.chord));
  const octave = toBassRange(root + 12);
  out[t] = Math.abs(fifth - nextRoot) <= Math.abs(octave - nextRoot) ? fifth : octave;
}

/**
 * Shuffle — the classic blues boogie.
 *
 * Root, third, fifth, sixth on the four beats going up; on the second bar of
 * a two-bar phrase the figure comes back down through the flat seventh:
 * flat seven, sixth, fifth, third. One note per beat, on the downbeat, so the
 * swing lives entirely in the triplet grid the UI already built.
 *
 * The degree list cycles when the bar is not in four, so a shuffle in 5 or 7
 * still walks instead of stopping.
 */
function shuffleLine(
  out: number[],
  a: {
    feel: JamFeel;
    chord: BassChord;
    beatsPerBar: number;
    ticksPerBeat: number;
    barIndex: number;
  },
): void {
  const root = bassRoot(a.chord.rootMidi);
  const up = [0, chordThird(a.chord), chordFifth(a.chord), SHUFFLE_SIXTH];
  const down = [SHUFFLE_FLAT_SEVENTH, SHUFFLE_SIXTH, chordFifth(a.chord), chordThird(a.chord)];
  const degrees = a.barIndex % 2 === 1 ? down : up;

  for (let beat = 0; beat < a.beatsPerBar; beat += 1) {
    const t = firstPlayable(a.feel, a.ticksPerBeat, beat * a.ticksPerBeat, out.length);
    if (t >= out.length) break;
    out[t] = root + degrees[beat % degrees.length];
  }
}

/**
 * Swing — a walking line in quarter notes.
 *
 * The rule, in full, because "walking bass" is otherwise a word for guessing:
 *
 * 1. Beat 1 is the root, in the low octave.
 * 2. The middle beats are the chord's own tones in order — third, fifth,
 *    seventh, ninth — each placed in the octave nearest the note before it,
 *    so the line steps instead of leaping.
 * 3. The last beat is an approach to the next bar's root: a semitone below it
 *    if the line is already moving up into it, a semitone above if it is
 *    moving down. A line that is standing still approaches from below.
 * 4. If that semitone falls outside E1–G3, the approach flips to the other
 *    side; if both are outside, it becomes a whole step — a scale approach
 *    instead of a chromatic one.
 *
 * Nothing here is random, and the same bar always walks the same way.
 */
function swingLine(
  out: number[],
  a: {
    feel: JamFeel;
    chord: BassChord;
    next: BassChord;
    beatsPerBar: number;
    ticksPerBeat: number;
  },
): void {
  const root = bassRoot(a.chord.rootMidi);
  const tones = chordTones(a.chord).slice(1);
  const beats = a.beatsPerBar;

  const place = (beat: number, pitch: number): void => {
    const t = firstPlayable(a.feel, a.ticksPerBeat, beat * a.ticksPerBeat, out.length);
    if (t < out.length) out[t] = pitch;
  };

  place(0, root);
  if (beats === 1) return;

  let prev = root;
  for (let beat = 1; beat < beats - 1; beat += 1) {
    const interval = tones.length > 0 ? tones[(beat - 1) % tones.length] : 12;
    const pitch = nearestInRange(root + interval, prev);
    place(beat, pitch);
    prev = pitch;
  }

  place(beats - 1, approachNote(prev, a.next));
}

/** The last beat of a walking bar: see `swingLine` rule 3 and 4. */
export function approachNote(from: number, next: BassChord): number {
  const target = nearestInRange(bassRoot(next.rootMidi), from);
  const fromBelow = from <= target;
  const first = fromBelow ? target - 1 : target + 1;
  if (first >= BASS_MIN_MIDI && first <= BASS_MAX_MIDI) return first;
  const second = fromBelow ? target + 1 : target - 1;
  if (second >= BASS_MIN_MIDI && second <= BASS_MAX_MIDI) return second;
  const step = fromBelow ? target + 2 : target - 2;
  return toBassRange(step);
}

/**
 * Bossa — root, fifth, root, fifth, with the fifths pushed onto the "and".
 *
 * Root on 1, fifth on the and of 2, root on 3, fifth on the and of 4: the
 * dotted figure every bossa bass plays. Generalised, even beats carry the
 * root on the downbeat and odd beats carry the fifth on their "and". On a
 * plain quarter-note grid there is no "and" to push to, so the fifth sits on
 * the odd beat itself and the figure degrades to root-fifth.
 */
function bossaLine(
  out: number[],
  a: { feel: JamFeel; chord: BassChord; beatsPerBar: number; ticksPerBeat: number },
): void {
  const root = bassRoot(a.chord.rootMidi);
  const fifth = toBassRange(root + chordFifth(a.chord));
  const and = andTick(a.ticksPerBeat);

  for (let beat = 0; beat < a.beatsPerBar; beat += 1) {
    const even = beat % 2 === 0;
    const offset = even ? 0 : (and ?? 0);
    const t = firstPlayable(a.feel, a.ticksPerBeat, beat * a.ticksPerBeat + offset, out.length);
    if (t >= out.length) continue;
    out[t] = even ? root : fifth;
  }
}

/**
 * Waltz and 6/8 — root on 1, fifth on the strong beat of the second group.
 *
 * One rule serves both: the root on tick 0, the fifth on the tick that starts
 * the second half of the bar. In 6/8 that is the head of the second group of
 * three; in 3/4 it is beat 2, the oom of the oom-pah.
 */
function rootFifthLine(
  out: number[],
  a: { feel: JamFeel; chord: BassChord; ticksPerBeat: number },
): void {
  const root = bassRoot(a.chord.rootMidi);
  out[firstPlayable(a.feel, a.ticksPerBeat, 0, out.length)] = root;
  if (out.length < 2) return;
  const half = firstPlayable(a.feel, a.ticksPerBeat, Math.floor(out.length / 2), out.length);
  if (half < out.length && half !== 0) out[half] = toBassRange(root + chordFifth(a.chord));
}

/**
 * Funk — the one, and octave pops on the kick.
 *
 * The root on the one, always, however the drummer starts the bar. After
 * that the bass shadows the kick: an octave pop where the kick lands off the
 * beat, the root where it lands on one, and a rest everywhere the kick is
 * silent. The space is the style.
 */
function funkLine(
  out: number[],
  a: { groove: JamPattern; chord: BassChord; ticksPerBeat: number },
): void {
  const root = bassRoot(a.chord.rootMidi);
  const octave = toBassRange(root + 12);
  out[0] = root;
  for (let t = 1; t < out.length; t += 1) {
    if ((a.groove.kick[t] ?? 0) === 0) continue;
    out[t] = t % a.ticksPerBeat === 0 ? root : octave;
  }
}
