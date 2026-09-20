/**
 * Jam — the bass player, second pass (2026-09-16).
 *
 * `./bassline` gave the bass one line per groove and nothing to choose: the
 * drummer's groove decided, and every bar of a chorus was the same bar. This
 * module is the player the owner asked for — "same thing we did for the
 * drummer": a set of FIGURES you can pick from, a BUSYNESS, fills where a
 * phrase turns round, and notes that are played rather than printed.
 *
 * ## What a note is now
 *
 * Every note carries three things, one entry per tick (`JamBassLine`):
 *
 * - **pitch** — as before; `0` is a rest, and every non-zero tick is struck.
 * - **velocity** — how hard. The one of a bar leans in, off-beats sit back,
 *   ghost notes are ghosts. The engine turns it into gain AND into which
 *   recorded layer plays, so an accent is a harder stroke, not a volume.
 * - **length** — how long it rings, in ticks. `0` is "until the next note",
 *   which is legato; a figure that is played short (funk, reggae, a disco
 *   octave) says so, and a figure that is played long (a ballad) says that.
 *   Where a figure leaves it at `0`, the VOICE decides: a picked or slap bass
 *   lets go after half a beat, a fingered one after a beat, an upright and a
 *   synth ring on (`BASS_VOICE_HOLD_BEATS` — the rule `./bassline` wrote
 *   down and nothing ever applied, because there was no field to write it in).
 *
 * ## Deterministic, and not a loop
 *
 * Nothing is random. What varies is WHERE in the form a bar is: a walking
 * line turns a different way on alternate bars, the fourth bar of every
 * phrase and the last bar of the form get a fill into the next chord, and a
 * velocity wobble of a few percent is hashed from the bar and the tick. The
 * same jam plays the same way every time, and no two neighbouring bars are
 * the same bar.
 *
 * ## Two chords in a bar
 *
 * A bar may hold a second chord from its middle (rhythm changes, the jazz
 * blues). Every figure reads the chord of the BEAT it is placing, so the
 * second half follows the second chord — which the first pass could not do.
 */
import {
  BASS_VOICE_HOLD_BEATS,
  andTick,
  approachNote,
  bassRoot,
  bassStyleForGroove,
  chordFifth,
  chordThird,
  chordTones,
  firstPlayable,
  nearestInRange,
  SHUFFLE_FLAT_SEVENTH,
  SHUFFLE_SIXTH,
  swallowed,
  toBassRange,
} from "./bassline";
import type { BassChord, BassChordQuality } from "./bassline";
import type {
  JamBassBusy,
  JamBassLine,
  JamBassStyle,
  JamBassVoice,
  JamFeel,
  JamPattern,
} from "./types";

/** Every figure, in the order the picker offers them. */
export const JAM_BASS_STYLES: readonly JamBassStyle[] = [
  "kick",
  "eighths",
  "rootFifth",
  "octaves",
  "boogie",
  "walking",
  "twoFeel",
  "pedal",
  "bossa",
  "tumbao",
  "funk",
  "countryAlt",
  "gallop",
  "ballad",
  "reggae",
];

export const JAM_BASS_BUSY: readonly JamBassBusy[] = ["sparse", "normal", "busy"];

export type BassPartInput = {
  /** The drum bar as written; `kick` and `funk` read its kick. */
  groove: JamPattern;
  feel: JamFeel;
  /**
   * This bar's chord, the chord of its second half when it has one, and the
   * next bar's chord for the notes that lead into it.
   */
  chords: { bar: BassChord; half?: BassChord | null; next?: BassChord | null };
  beatsPerBar: number;
  ticksPerBeat: number;
  figure: JamBassStyle;
  busy?: JamBassBusy;
  /** Where in the form this bar is, 0-based, and how long the form is. */
  barIndex?: number;
  formBars?: number;
  /** The key's tonic as a pitch class, for the pedal figure. */
  keyRoot?: number;
  voice?: JamBassVoice;
  /** The bass lane's own gain, 1.0 as written. */
  gain?: number;
};

// ---------------------------------------------------------------------------
// The auto choice
// ---------------------------------------------------------------------------

/**
 * Grooves whose bass is a figure of its own rather than the family's —
 * where "follow the drummer" means a specific part.
 */
const AUTO_BY_GROOVE: Record<string, JamBassStyle> = {
  oneDrop: "reggae",
  worldSteppers: "reggae",
  worldRockers: "reggae",
  worldRocksteady: "reggae",
  worldSka: "walking",
  metalGallop: "gallop",
  doubleKick: "gallop",
  metalThrash: "eighths",
  metalDbeat: "eighths",
  punkEighths: "eighths",
  punkSkank: "eighths",
  rockDriving: "eighths",
  rockMotorik: "eighths",
  rockGarage: "eighths",
  rockSurf: "eighths",
  countryBoomChick: "countryAlt",
  twoStep: "countryAlt",
  train: "countryAlt",
  countryBluegrass: "countryAlt",
  countryRockabilly: "boogie",
  countryWaltz: "rootFifth",
  countryBallad: "ballad",
  ballad: "ballad",
  popBallad: "ballad",
  jazzBallad: "twoFeel",
  jazzTwoFeel: "twoFeel",
  jazzTrad: "twoFeel",
  latinSon: "tumbao",
  latinSongo: "tumbao",
  latinCascara: "tumbao",
  mambo: "tumbao",
  latinGuaguanco: "tumbao",
  latinBolero: "ballad",
  popDisco: "octaves",
  popHouse: "octaves",
  fourOnFloor: "octaves",
  popSynthPop: "eighths",
  popElectro: "eighths",
  funkSlowJam: "ballad",
  funkGospel: "walking",
  bluesStopTime: "kick",
};

/** The first pass's seven lines, as figures. */
const FROM_FIRST_PASS = {
  rock: "kick",
  shuffle: "boogie",
  swing: "walking",
  bossa: "bossa",
  waltz: "rootFifth",
  sixeight: "rootFifth",
  funk: "funk",
} as const satisfies Record<string, JamBassStyle>;

/** What `auto` plays under this groove. A custom groove plays roots on the kick. */
export function autoBassFigure(grooveId: string | null | undefined): JamBassStyle {
  if (!grooveId) return "kick";
  return AUTO_BY_GROOVE[grooveId] ?? FROM_FIRST_PASS[bassStyleForGroove(grooveId)];
}

/** The figure a jam plays: its own choice, or the groove's. */
export function resolveBassFigure(
  requested: JamBassStyle | "auto" | null | undefined,
  grooveId: string | null | undefined,
): JamBassStyle {
  return requested && requested !== "auto" && (JAM_BASS_STYLES as readonly string[]).includes(requested)
    ? requested
    : autoBassFigure(grooveId);
}

// ---------------------------------------------------------------------------
// Scales, for lines that step rather than leap
// ---------------------------------------------------------------------------

/** The scale a bass walks through over each chord quality. */
const CHORD_SCALE: Record<BassChordQuality, readonly number[]> = {
  maj: [0, 2, 4, 5, 7, 9, 11],
  maj7: [0, 2, 4, 5, 7, 9, 11],
  "6": [0, 2, 4, 5, 7, 9, 11],
  "7": [0, 2, 4, 5, 7, 9, 10],
  "9": [0, 2, 4, 5, 7, 9, 10],
  "5": [0, 2, 3, 5, 7, 9, 10],
  min: [0, 2, 3, 5, 7, 8, 10],
  m7: [0, 2, 3, 5, 7, 9, 10],
  m6: [0, 2, 3, 5, 7, 9, 11],
  m7b5: [0, 1, 3, 5, 6, 8, 10],
  dim7: [0, 2, 3, 5, 6, 8, 9, 11],
};

/**
 * `count` notes stepping through the chord's scale from `from`, up or down,
 * each folded into the range and kept next to the one before.
 */
function scaleSteps(chord: BassChord, from: number, count: number, up: boolean): number[] {
  const root = bassRoot(chord.rootMidi);
  const scale = CHORD_SCALE[chord.quality];
  // Every scale note across the range, sorted.
  const pool: number[] = [];
  for (let base = root - 24; base <= root + 36; base += 12) {
    for (const step of scale) {
      const m = base + step;
      if (m >= 28 && m <= 55) pool.push(m);
    }
  }
  pool.sort((a, b) => a - b);
  const out: number[] = [];
  let cur = from;
  let turns = 0;
  while (out.length < count && turns < 2) {
    const next = up ? pool.find((m) => m > cur) : [...pool].reverse().find((m) => m < cur);
    if (next === undefined) {
      // Ran off the end of the range: turn round, once.
      up = !up;
      turns += 1;
      continue;
    }
    out.push(next);
    cur = next;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The bar being written
// ---------------------------------------------------------------------------

type Note = { pitch: number; velocity: number; lengthBeats: number };

class Bar {
  readonly length: number;
  readonly notes: (Note | null)[];

  constructor(
    readonly beats: number,
    readonly tpb: number,
    readonly feel: JamFeel,
  ) {
    this.length = Math.max(0, Math.trunc(beats)) * tpb;
    this.notes = new Array(this.length).fill(null);
  }

  /**
   * The tick at `beat` plus `frac` of a beat, or null when the grid has no
   * such tick. `frac` 0.5 is the "and" as the feel plays it (the third
   * triplet under a shuffle).
   */
  at(beat: number, frac = 0): number | null {
    if (beat < 0 || beat >= this.beats) return null;
    let off: number | null;
    if (frac === 0) off = 0;
    else if (frac === 0.5) off = andTick(this.tpb);
    else {
      const exact = frac * this.tpb;
      off = Math.abs(exact - Math.round(exact)) < 1e-9 ? Math.round(exact) : null;
    }
    if (off === null) return null;
    const t = beat * this.tpb + off;
    return t < this.length ? t : null;
  }

  /** The tick for a downbeat, moved off a swallowed triplet. */
  beat(beat: number): number | null {
    const t = this.at(beat);
    return t === null ? null : firstPlayable(this.feel, this.tpb, t, this.length);
  }

  put(t: number | null, pitch: number, velocity = 1, lengthBeats = 0): void {
    if (t === null || t < 0 || t >= this.length) return;
    if (swallowed(this.feel, this.tpb, t) && t % this.tpb !== 0) return;
    this.notes[t] = { pitch, velocity, lengthBeats };
  }

  clear(from: number, to: number): void {
    for (let t = Math.max(0, from); t < Math.min(this.length, to); t += 1) this.notes[t] = null;
  }

  /** The last struck note before tick `t`. */
  before(t: number): Note | null {
    for (let u = t - 1; u >= 0; u -= 1) if (this.notes[u]) return this.notes[u];
    return null;
  }
}

// ---------------------------------------------------------------------------
// The part
// ---------------------------------------------------------------------------

/**
 * A tiny, stable hash of the tick: the same place in the bar always leans the
 * same way. Per TICK and not per bar, deliberately — a vamp is the same bar
 * played again, and a line whose every bar differed by a few percent of
 * velocity would be "new music" to the bar-ahead handshake on every downbeat.
 * The bars that really differ (a fill, the other half of a two-bar figure)
 * differ in their notes.
 */
function wobble(tick: number): number {
  let h = (tick * 668265263 + 374761393) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h & 0xffff) / 0xffff) * 2 - 1;
}

export function bassPartFor(input: BassPartInput): JamBassLine {
  const beats = Math.max(0, Math.trunc(input.beatsPerBar));
  const tpb = Math.max(1, Math.trunc(input.ticksPerBeat));
  const bar = new Bar(beats, tpb, input.feel);
  const empty: JamBassLine = { pitches: new Array(bar.length).fill(0), gain: input.gain ?? 1 };
  if (bar.length === 0) return empty;

  const busy = input.busy ?? "normal";
  const barIndex = Math.max(0, Math.trunc(input.barIndex ?? 0));
  const formBars = Math.max(1, Math.trunc(input.formBars ?? 1));
  const first = input.chords.bar;
  const half = input.chords.half ?? null;
  const next = input.chords.next ?? first;
  const halfBeat = Math.floor(beats / 2);
  const chordAt = (beat: number): BassChord => (half && beat >= halfBeat ? half : first);
  const rootAt = (beat: number) => bassRoot(chordAt(beat).rootMidi);
  const nextRoot = bassRoot(next.rootMidi);
  const changing = ((next.rootMidi - chordAt(beats - 1).rootMidi) % 12 + 12) % 12 !== 0;
  const phraseEnd = (barIndex + 1) % 4 === 0 || barIndex === formBars - 1;
  const odd = barIndex % 2 === 1;

  const ctx: FigureCtx = {
    bar, beats, tpb, busy, barIndex, odd, chordAt, rootAt, next, nextRoot, changing, phraseEnd,
    halfBeat, groove: input.groove, keyRoot: input.keyRoot,
  };
  FIGURES[input.figure](ctx);

  if (busy === "sparse") thin(ctx, input.figure);
  const filled = fillsItself(input.figure) ? false : phraseFill(ctx);
  if (!filled && busy !== "sparse" && changing && !fillsItself(input.figure)) leadIn(ctx);

  return render(bar, input);
}

type FigureCtx = {
  bar: Bar;
  beats: number;
  tpb: number;
  busy: JamBassBusy;
  barIndex: number;
  odd: boolean;
  chordAt: (beat: number) => BassChord;
  rootAt: (beat: number) => number;
  next: BassChord;
  nextRoot: number;
  changing: boolean;
  phraseEnd: boolean;
  halfBeat: number;
  groove: JamPattern;
  keyRoot?: number;
};

/** Strong beats: the one, and the middle of an even bar. */
const strong = (c: FigureCtx, beat: number) => beat === 0 || (c.beats % 2 === 0 && beat === c.halfBeat);

const FIGURES: Record<JamBassStyle, (c: FigureCtx) => void> = {
  /** Roots on the kick — the first pass's rock line, now with dynamics. */
  kick(c) {
    for (let t = 0; t < c.bar.length; t += 1) {
      if ((c.groove.kick[t] ?? 0) === 0) continue;
      const beat = Math.floor(t / c.tpb);
      const on = t % c.tpb === 0;
      c.bar.put(t, c.rootAt(beat), beat === 0 && on ? 1.12 : on ? 1 : 0.9);
    }
    if (!c.bar.notes.some(Boolean)) c.bar.put(0, c.rootAt(0), 1.1);
    if (c.busy === "busy") {
      // Busy: the octave answers on the "and" of each backbeat.
      for (let beat = 1; beat < c.beats; beat += 2) {
        const t = c.bar.at(beat, 0.5);
        if (t !== null && !c.bar.notes[t]) c.bar.put(t, c.rootAt(beat) + 12, 0.8, 0.4);
      }
    }
  },

  /** Driving eighths on the root, played short and even. */
  eighths(c) {
    const and = andTick(c.tpb);
    for (let beat = 0; beat < c.beats; beat += 1) {
      const r = c.rootAt(beat);
      c.bar.put(c.bar.beat(beat), r, beat === 0 ? 1.1 : 0.98, and === null ? 0 : 0.45);
      if (and !== null && c.busy !== "sparse") c.bar.put(c.bar.at(beat, 0.5), r, 0.82, 0.45);
    }
    if (c.busy === "busy" && c.odd && and !== null) {
      // Every other bar the last "and" jumps the octave, the way a player
      // keeps a pedal of eighths from sounding like a machine.
      c.bar.put(c.bar.at(c.beats - 1, 0.5), c.rootAt(c.beats - 1) + 12, 0.9, 0.4);
    }
  },

  /** Root on the strong beats, fifth between: half notes, alternating. */
  rootFifth(c) {
    const threeish = c.beats % 3 === 0;
    for (let beat = 0; beat < c.beats; beat += 1) {
      const r = c.rootAt(beat);
      const fifthUp = r + chordFifth(c.chordAt(beat));
      // Alternate bars take the fifth below — the country and polka habit.
      const fifth = c.odd ? fifthUp - 12 : fifthUp;
      if (threeish) {
        if (beat === 0) c.bar.put(c.bar.beat(0), r, 1.1);
        else if (beat === c.beats / 2 || (c.beats === 3 && beat === 2 && c.busy === "busy")) {
          c.bar.put(c.bar.beat(beat), fifth, 0.95);
        } else if (c.beats === 6 && beat === 3) c.bar.put(c.bar.beat(beat), fifth, 0.95);
        continue;
      }
      if (beat % 2 === 0) {
        // The middle of the bar takes the fifth — unless a new chord arrives
        // there, which the bass announces with its root.
        const isHalf = beat === c.halfBeat && c.beats > 2 && !half(c, beat);
        c.bar.put(c.bar.beat(beat), isHalf ? fifth : r, beat === 0 ? 1.1 : 0.98);
      } else if (c.busy === "busy") {
        c.bar.put(c.bar.beat(beat), beat % 4 === 1 ? r : fifth, 0.85);
      }
    }
  },

  /** The disco octave: root on the beat, octave on the "and", short. */
  octaves(c) {
    const and = andTick(c.tpb);
    for (let beat = 0; beat < c.beats; beat += 1) {
      const r = c.rootAt(beat);
      c.bar.put(c.bar.beat(beat), r, beat === 0 ? 1.08 : 0.98, 0.35);
      if (and !== null) c.bar.put(c.bar.at(beat, 0.5), r + 12, 0.9, 0.35);
      else c.bar.put(c.bar.beat(beat), beat % 2 === 0 ? r : r + 12, 0.98, 0.5);
    }
    if (c.busy === "busy" && c.tpb >= 4) {
      // Sixteenth pickups into the octave on the backbeats.
      for (let beat = 1; beat < c.beats; beat += 2) {
        c.bar.put(c.bar.at(beat, 0.25), c.rootAt(beat), 0.6, 0.2);
      }
    }
  },

  /** The boogie: up the chord in quarters, or in swung eighths when busy. */
  boogie(c) {
    const and = andTick(c.tpb);
    if (c.busy === "busy" && and !== null) {
      const figure = [0, 4, 7, SHUFFLE_SIXTH, SHUFFLE_FLAT_SEVENTH, SHUFFLE_SIXTH, 7, 4];
      for (let beat = 0; beat < c.beats; beat += 1) {
        const r = c.rootAt(beat);
        const third = chordThird(c.chordAt(beat));
        const deg = (i: number) => (figure[i] === 4 ? third : figure[i]);
        c.bar.put(c.bar.beat(beat), r + deg((beat * 2) % 8), beat === 0 ? 1.1 : 1, 0);
        c.bar.put(c.bar.at(beat, 0.5), r + deg((beat * 2 + 1) % 8), 0.85, 0);
      }
      return;
    }
    for (let beat = 0; beat < c.beats; beat += 1) {
      const chord = c.chordAt(beat);
      const r = c.rootAt(beat);
      const up = [0, chordThird(chord), chordFifth(chord), SHUFFLE_SIXTH];
      const down = [SHUFFLE_FLAT_SEVENTH, SHUFFLE_SIXTH, chordFifth(chord), chordThird(chord)];
      const degrees = c.odd ? down : up;
      c.bar.put(c.bar.beat(beat), r + degrees[beat % degrees.length], beat === 0 ? 1.1 : 0.98);
    }
  },

  /** A walking line: scale steps and chord tones, and a chromatic approach. */
  walking(c) {
    let prev = c.rootAt(0);
    c.bar.put(c.bar.beat(0), prev, 1.08);
    for (let beat = 1; beat < c.beats; beat += 1) {
      const chord = c.chordAt(beat);
      const last = beat === c.beats - 1;
      // A new chord in the middle of the bar is landed on, root first.
      if (half(c, beat)) {
        prev = nearestInRange(c.rootAt(beat), prev);
        c.bar.put(c.bar.beat(beat), prev, 1.02);
        continue;
      }
      let pitch: number;
      if (last) {
        pitch = approachNote(prev, c.next);
      } else {
        const target = nearestInRange(c.nextRoot, prev);
        const up = c.odd ? target <= prev : target >= prev;
        if ((c.barIndex + beat) % 3 === 2) {
          // Every third beat or so, a chord tone instead of a step, so the
          // line outlines the harmony as well as moving through it.
          const tones = chordTones(chord).slice(1).map((i) => bassRoot(chord.rootMidi) + i);
          pitch = nearestInRange(tones[(beat + c.barIndex) % tones.length], prev);
          if (pitch === prev) pitch = scaleSteps(chord, prev, 1, up)[0] ?? pitch;
        } else {
          pitch = scaleSteps(chord, prev, 1, up)[0] ?? prev;
        }
      }
      c.bar.put(c.bar.beat(beat), pitch, last ? 0.95 : 0.92 + 0.06 * Number(beat % 2 === 0));
      prev = pitch;
    }
    if (c.busy === "busy" && c.tpb === 3) {
      // The skip: a ghosted repeat on the swung "and" before a beat.
      const beat = c.odd ? 1 : 2;
      const into = c.bar.notes[c.bar.beat(beat + 1) ?? -1];
      const t = c.bar.at(beat, 0.5);
      if (into && t !== null) c.bar.put(t, into.pitch, 0.5, 0.3);
    }
  },

  /** Two in the bar: root and fifth in half notes, an approach at the turn. */
  twoFeel(c) {
    c.bar.put(c.bar.beat(0), c.rootAt(0), 1.08);
    if (c.beats < 3) return;
    const beat = c.halfBeat || 1;
    const r = c.rootAt(beat);
    const pitch = half(c, beat)
      ? r
      : c.changing && c.odd
        ? approachNote(r, c.next)
        : nearestInRange(r + chordFifth(c.chordAt(beat)), r);
    c.bar.put(c.bar.beat(beat), pitch, 0.98);
    if (c.busy === "busy") {
      const t = c.bar.at(beat - 1, 0.5);
      if (t !== null) c.bar.put(t, pitch, 0.55, 0.3);
    }
  },

  /** A pedal: the key's tonic under everything, pulsing. */
  pedal(c) {
    const tonic = bassRoot(c.keyRoot ?? c.rootAt(0));
    const and = andTick(c.tpb);
    for (let beat = 0; beat < c.beats; beat += 1) {
      c.bar.put(c.bar.beat(beat), tonic, beat === 0 ? 1.1 : 0.95, and === null ? 0 : 0.45);
      if (c.busy !== "sparse" && and !== null) c.bar.put(c.bar.at(beat, 0.5), tonic, 0.78, 0.45);
    }
    if (c.busy === "busy") c.bar.put(c.bar.at(c.beats - 1, 0.5), tonic + 12, 0.9, 0.4);
  },

  /** Bossa: root on the beat, fifth pushed onto the "and". */
  bossa(c) {
    for (let beat = 0; beat < c.beats; beat += 1) {
      const r = c.rootAt(beat);
      const fifth = nearestInRange(r + chordFifth(c.chordAt(beat)), r);
      if (beat % 2 === 0) c.bar.put(c.bar.beat(beat), r, beat === 0 ? 1.05 : 0.98);
      else {
        const t = c.bar.at(beat, 0.5) ?? c.bar.beat(beat);
        // Alternate bars answer with the root instead of the fifth on the last push.
        c.bar.put(t, c.odd && beat === c.beats - 1 ? r : fifth, 0.9);
      }
    }
    if (c.busy === "busy") {
      // The anticipation: the next bar's root on the last "and".
      const t = c.bar.at(c.beats - 1, 0.5);
      if (t !== null) c.bar.put(t, nearestInRange(c.nextRoot, c.rootAt(c.beats - 1)), 0.9);
    }
  },

  /**
   * The tumbao: nothing on the one — the "and" of two and beat four, the
   * second anticipating the next chord. The bass that makes salsa lean.
   */
  tumbao(c) {
    const andTwo = c.bar.at(1, 0.5);
    const four = c.bar.beat(Math.min(3, c.beats - 1));
    if (andTwo === null || c.beats < 4) {
      FIGURES.bossa(c);
      return;
    }
    const r = c.rootAt(1);
    const fifth = nearestInRange(r + chordFifth(c.chordAt(1)), r);
    c.bar.put(andTwo, c.odd ? r : fifth, 1.05, 1.5);
    c.bar.put(four, nearestInRange(c.nextRoot, fifth), 1.0, 1);
    if (c.busy === "busy" || c.barIndex === 0) c.bar.put(c.bar.beat(0), c.rootAt(0), 0.9, 1);
    if (c.busy === "busy") {
      const t = c.bar.at(2, 0.5);
      if (t !== null) c.bar.put(t, r, 0.75, 0.4);
    }
  },

  /** Funk: the one, octave pops on the kick, ghosts, a slide into the turn. */
  funk(c) {
    c.bar.put(0, c.rootAt(0), 1.15, 0.5);
    for (let t = 1; t < c.bar.length; t += 1) {
      if ((c.groove.kick[t] ?? 0) === 0) continue;
      const beat = Math.floor(t / c.tpb);
      const r = c.rootAt(beat);
      c.bar.put(t, t % c.tpb === 0 ? r : r + 12, t % c.tpb === 0 ? 1.02 : 0.95, 0.3);
    }
    if (c.busy !== "normal") return;
    if (c.tpb === 4 && c.odd) {
      // The b7-to-octave slide at the end of every other bar.
      const r = c.rootAt(c.beats - 1);
      c.bar.put(c.bar.at(c.beats - 1, 0.5), r + 10, 0.85, 0.2);
      c.bar.put(c.bar.at(c.beats - 1, 0.75), r + 12, 0.95, 0.2);
    }
  },

  /** Country: root on one, fifth on three, a walk-up into a new chord. */
  countryAlt(c) {
    const two = c.beats >= 4 ? 2 : c.beats > 1 ? 1 : 0;
    const r = c.rootAt(0);
    c.bar.put(c.bar.beat(0), r, 1.08, 0.9);
    if (two > 0) {
      const r2 = c.rootAt(two);
      const fifth = nearestInRange(r2 + chordFifth(c.chordAt(two)) - 12, r2);
      c.bar.put(c.bar.beat(two), half(c, two) ? r2 : fifth, 0.98, 0.9);
    }
    if (c.busy === "busy" && c.beats >= 4) {
      c.bar.put(c.bar.beat(1), r + chordThird(c.chordAt(1)), 0.8, 0.9);
      c.bar.put(c.bar.beat(3), nearestInRange(r + chordFifth(c.chordAt(3)), r), 0.8, 0.9);
    }
    if (c.changing && c.beats >= 4 && c.busy !== "sparse") {
      // The walk-up: three steps on beats 2, 3 and 4... into the next root,
      // the most country thing a bass does.
      const target = nearestInRange(c.nextRoot, r);
      const up = target >= r;
      const steps = scaleSteps(c.chordAt(c.beats - 1), up ? target - 5 : target + 5, 2, up);
      c.bar.put(c.bar.beat(c.beats - 2), steps[0] ?? r, 0.88, 0.9);
      c.bar.put(c.bar.beat(c.beats - 1), approachNote(steps[0] ?? r, c.next), 0.92, 0.9);
    }
  },

  /** The gallop: an eighth and two sixteenths, root, very short. */
  gallop(c) {
    for (let beat = 0; beat < c.beats; beat += 1) {
      const r = c.rootAt(beat);
      const accent = beat === 0 ? 1.12 : 1;
      c.bar.put(c.bar.beat(beat), r, accent, 0.22);
      if (c.busy === "sparse") continue;
      const a = c.bar.at(beat, 0.5);
      const b = c.bar.at(beat, 0.75) ?? c.bar.at(beat, 2 / 3);
      if (a !== null && b !== null && b > a) {
        c.bar.put(a, r, 0.82, 0.15);
        c.bar.put(b, r, 0.88, 0.15);
      } else if (a !== null) c.bar.put(a, r, 0.85, 0.22);
    }
  },

  /** A ballad: long notes, the chord's root and a step to the next. */
  ballad(c) {
    c.bar.put(c.bar.beat(0), c.rootAt(0), 1.0, c.busy === "sparse" ? c.beats : c.halfBeat || c.beats);
    if (c.busy === "sparse") return;
    if (c.beats >= 4) {
      const beat = c.halfBeat;
      const r = c.rootAt(beat);
      const pitch = half(c, beat) ? r : nearestInRange(r + chordThird(c.chordAt(beat)) + (c.odd ? 3 : 0), r);
      c.bar.put(c.bar.beat(beat), c.odd ? pitch : r, 0.9, c.beats - beat);
    }
    if (c.busy === "busy" && c.changing) {
      const t = c.bar.at(c.beats - 1, 0.5) ?? c.bar.beat(c.beats - 1);
      c.bar.put(t, approachNote(c.rootAt(c.beats - 1), c.next), 0.8, 0.5);
    }
  },

  /** One-drop reggae: nothing on the one; the bass lands with the drop on three. */
  reggae(c) {
    const three = c.beats >= 4 ? 2 : c.beats - 1;
    const r = c.rootAt(0);
    if (c.busy !== "sparse") {
      c.bar.put(c.bar.at(0, 0.5), r, 0.9, 0.45);
      c.bar.put(c.bar.beat(1), r, 0.95, 0.8);
    }
    const r3 = c.rootAt(three);
    c.bar.put(c.bar.beat(three), r3, 1.15, 0.6);
    if (c.busy === "sparse") return;
    const t = c.bar.at(three, 0.5);
    if (t !== null) c.bar.put(t, nearestInRange(r3 + chordFifth(c.chordAt(three)), r3), 0.85, 0.45);
    if (c.busy === "busy" && c.beats >= 4) {
      c.bar.put(c.bar.beat(3), nearestInRange(r3 + chordThird(c.chordAt(3)), r3), 0.85, 0.45);
    }
  },
};

/** Is `beat` where the bar's second chord comes in? */
function half(c: FigureCtx, beat: number): boolean {
  return beat === c.halfBeat && beat > 0 && c.chordAt(beat) !== c.chordAt(0);
}

/** Figures whose own writing already leads into the next chord. */
function fillsItself(figure: JamBassStyle): boolean {
  return figure === "walking" || figure === "twoFeel" || figure === "countryAlt" || figure === "tumbao";
}

/**
 * Sparse: the notes on the strong beats and nothing else — but never an
 * empty bar, and the figures whose whole point is where they AVOID the one
 * keep their own first note.
 */
function thin(c: FigureCtx, figure: JamBassStyle): void {
  const keepFirstOnly = figure === "tumbao" || figure === "reggae";
  let kept = false;
  for (let t = 0; t < c.bar.length; t += 1) {
    const n = c.bar.notes[t];
    if (!n) continue;
    const onStrong = t % c.tpb === 0 && strong(c, t / c.tpb);
    if (keepFirstOnly ? !kept : onStrong) {
      kept = true;
      continue;
    }
    if (keepFirstOnly && onStrong) continue;
    c.bar.notes[t] = null;
  }
  if (!kept) c.bar.put(c.bar.beat(0), c.rootAt(0), 1.05);
}

/**
 * The phrase fill: the fourth bar of a phrase and the last bar of the form
 * turn round into what comes next. Normal is one approach note; busy is a
 * short run through the last beat.
 */
function phraseFill(c: FigureCtx): boolean {
  if (!c.phraseEnd || c.busy === "sparse") return false;
  const lastBeat = c.beats - 1;
  const start = c.bar.at(lastBeat);
  if (start === null) return false;
  const prev = c.bar.before(start)?.pitch ?? c.rootAt(lastBeat);
  const target = nearestInRange(c.nextRoot, prev);
  if (c.busy === "busy" && c.tpb >= 2) {
    const ticks = c.tpb >= 3 ? [0, 1, 2].map((i) => start + Math.round((i * c.tpb) / 3)) : [start, start + 1];
    const up = target >= prev;
    const run = scaleSteps(c.chordAt(lastBeat), up ? target - 6 : target + 6, ticks.length - 1, up);
    c.bar.clear(start, c.bar.length);
    ticks.forEach((t, i) => {
      const pitch = i === ticks.length - 1 ? approachNote(run[run.length - 1] ?? prev, c.next) : run[i] ?? prev;
      c.bar.put(t, pitch, 0.85 + 0.05 * i, 0);
    });
    return true;
  }
  const t = c.bar.at(lastBeat, 0.5) ?? start;
  c.bar.clear(t, c.bar.length);
  if (c.changing) {
    // Into a new chord: the chromatic step onto its root.
    c.bar.put(t, approachNote(prev, c.next), 0.9, 0);
  } else {
    // Back round to the same chord: the fifth or the octave, not a
    // chromatic note — which over a rock vamp's power chord is a wrong note
    // rather than a lead.
    const r = c.rootAt(lastBeat);
    const fifth = toBassRange(r + chordFifth(c.chordAt(lastBeat)));
    c.bar.put(t, c.odd ? toBassRange(r + 12) : fifth, 0.9, 0.5);
  }
  return true;
}

/** Into a new chord at the bar line: the fifth or octave on the last "and". */
function leadIn(c: FigureCtx): void {
  const t = c.bar.at(c.beats - 1, 0.5);
  if (t === null || c.bar.notes[t]) return;
  const r = c.rootAt(c.beats - 1);
  const target = nearestInRange(c.nextRoot, r);
  const fifth = toBassRange(r + chordFifth(c.chordAt(c.beats - 1)));
  const octave = toBassRange(r + 12);
  c.bar.put(t, Math.abs(fifth - target) <= Math.abs(octave - target) ? fifth : octave, 0.85, 0.5);
}

/** The bar as the engine reads it: pitches, velocities and lengths per tick. */
function render(bar: Bar, input: BassPartInput): JamBassLine {
  const hold = input.voice ? BASS_VOICE_HOLD_BEATS[input.voice] : Infinity;
  const pitches: number[] = [];
  const velocities: number[] = [];
  const lengths: number[] = [];
  for (let t = 0; t < bar.length; t += 1) {
    const n = bar.notes[t];
    if (!n) {
      pitches.push(0);
      velocities.push(1);
      lengths.push(0);
      continue;
    }
    pitches.push(toBassRange(n.pitch));
    const v = n.velocity * (1 + 0.04 * wobble(t));
    velocities.push(Math.round(Math.max(0.3, Math.min(1.4, v)) * 1000) / 1000);
    const beats = n.lengthBeats > 0 ? n.lengthBeats : hold;
    // Fractions of a tick are fine: the engine caps a note in ticks, not in
    // whole ticks, and a gallop's sixteenths are shorter than their grid.
    lengths.push(Number.isFinite(beats) ? Math.round(Math.max(0.3, beats * bar.tpb) * 100) / 100 : 0);
  }
  return { pitches, gain: input.gain ?? 1, velocities, lengths };
}
