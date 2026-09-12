/**
 * Every way to play a chord.
 *
 * Pick a chord in the key and this hands back the shapes for it, ordered
 * along the neck: the three-string triads, the open shapes where the chord
 * has one, the movable barre families rooted on the sixth, fifth and fourth
 * strings, and the seventh voicings. Bass gets the same for its four
 * strings. See plans/JAM_MODE.md §4.3.
 *
 * ## Where the shapes come from
 *
 * Fret and finger numbers, written down here as musical fact. The movable
 * families are the CAGED E-, A- and D-forms every player already has under
 * their hands; the three-string triads are generated from the tuning itself,
 * which is the only honest way to get thirty-six of them right. Nothing was
 * copied from a diagram book: a shape is a set of positions on a tuned
 * instrument, and the test beside this file proves every one of them spells
 * its chord at all twelve roots.
 *
 * ## How a shape becomes a placement
 *
 * A library `Shape` is stored at one reference position — the E-form major
 * barre lives at fret 1, where it is an F. `shapesFor` slides it so its root
 * matches the chord you asked for, and reports the absolute frets. An open
 * shape is nailed to the nut and only appears for its own root.
 *
 * ## A note for the integrator
 *
 * The chord type and the qualities come from `./diatonic`, written at the
 * same time as `src/jam/harmony.ts` (W4). Nothing here touches the engine,
 * the store or the clock.
 */

import { type ChordQuality, type PitchClass, chordTones, mod12 } from "./diatonic";

export type Instrument = "guitar" | "bass";

/**
 * A string, numbered the way players do: 1 is the thinnest. A guitar has 6,
 * a bass 4, so 4 is the lowest string on a bass and 6 on a guitar.
 *
 * The movable barre families root on 6, 5 and 4 as you would expect. The
 * three-string triads root wherever the inversion puts the root, which is
 * why this is not narrowed to those three.
 */
export type GuitarString = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * How full a shape is, so the UI can run from the smallest to the fullest.
 * "triad" is three strings, "open" uses open strings and sits at the nut,
 * "barre" is a movable triad-quality grip, "seventh" is a movable grip for a
 * chord with a seventh, a sixth or a ninth in it.
 */
export type ShapeSize = "triad" | "open" | "barre" | "seventh";

export type Barre = {
  fret: number;
  /** The lower-sounding end, e.g. 6. */
  from: GuitarString;
  /** The higher-sounding end, e.g. 1. */
  to: GuitarString;
};

export type Shape = {
  id: string;
  /** What a player would call this grip: "E-form barre", "open C". */
  name: string;
  quality: ChordQuality;
  instrument: Instrument;
  /** The chord's root in THIS reference placement. */
  root: PitchClass;
  /** The string the root sits on in the reference placement. */
  rootString: GuitarString;
  /** Absolute frets, lowest string first. null = muted, 0 = open. */
  frets: (number | null)[];
  /** 1 index … 4 little finger, per string. null where nothing is fretted. */
  fingers: (number | null)[];
  /** The fret the diagram's top row shows. 1 means the box shows the nut. */
  baseFret: number;
  barre?: Barre;
  /** Open shapes are nailed to the nut; movable ones slide. */
  movable: boolean;
  /**
   * Semitones between repeats of a grip that spells the same chord again
   * further up. 12 for everything except the diminished seventh, which is a
   * stack of minor thirds and so comes round every 3 frets.
   */
  repeatEvery: number;
  size: ShapeSize;
};

export type PlacedShape = {
  /** Unique for this root, quality and neck position. */
  id: string;
  shapeId: string;
  name: string;
  quality: ChordQuality;
  /** The root you asked for. */
  root: PitchClass;
  instrument: Instrument;
  /** The string carrying the root here, or null if the grip omits it. */
  rootString: GuitarString | null;
  frets: (number | null)[];
  fingers: (number | null)[];
  baseFret: number;
  barre?: Barre;
  size: ShapeSize;
  /** What each string sounds, lowest first. null = muted. */
  pitches: (PitchClass | null)[];
  /** The lowest fret used; 0 when the shape has open strings. */
  position: number;
};

/** Standard guitar, lowest string first: E2 A2 D3 G3 B3 E4. */
export const GUITAR_TUNING: readonly number[] = [40, 45, 50, 55, 59, 64];

/** Four-string bass, lowest string first: E1 A1 D2 G2. */
export const BASS_TUNING: readonly number[] = [28, 33, 38, 43];

/** Nothing in the library is placed above here; past it a diagram is a lie. */
export const MAX_FRET = 15;

export function tuningFor(instrument: Instrument): readonly number[] {
  return instrument === "bass" ? BASS_TUNING : GUITAR_TUNING;
}

/** Array index (0 = lowest string) for a player's string number. */
function indexOfString(instrument: Instrument, n: number): number {
  return tuningFor(instrument).length - n;
}

/** A player's string number for an array index. */
function stringNumber(instrument: Instrument, index: number): GuitarString {
  return (tuningFor(instrument).length - index) as GuitarString;
}

/**
 * Which fret the diagram's top row shows.
 *
 * Anything that fits in the first four frets is drawn against the nut,
 * because that is where the hand actually is. Everything else starts at its
 * own lowest fretted note.
 */
export function baseFretFor(frets: (number | null)[]): number {
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  if (fretted.length === 0) return 1;
  return Math.max(...fretted) <= 4 ? 1 : Math.min(...fretted);
}

function pitchClassesFor(instrument: Instrument, frets: (number | null)[]): (PitchClass | null)[] {
  const tuning = tuningFor(instrument);
  return frets.map((f, i) => (f === null ? null : mod12(tuning[i] + f)));
}

function positionOf(frets: (number | null)[]): number {
  const played = frets.filter((f): f is number => f !== null);
  return played.length === 0 ? 0 : Math.min(...played);
}

/**
 * A voicing may drop the perfect fifth and nothing else.
 *
 * That is not a convenience: the fifth is the one note that carries no
 * information about the chord's quality, which is why guitarists and
 * bassists drop it and never drop the third or the seventh. The library
 * builder refuses any shape that loses anything else, so a grip labelled
 * m7b5 always has its flat five in it.
 */
const OMITTABLE_INTERVAL = 7;

export function spellsChord(
  quality: ChordQuality,
  root: PitchClass,
  pitches: (PitchClass | null)[],
): boolean {
  const want = new Set(chordTones(quality).map((t) => mod12(root + t)));
  const got = new Set(pitches.filter((p): p is PitchClass => p !== null));
  for (const p of got) if (!want.has(p)) return false;
  for (const t of chordTones(quality)) {
    if (t === OMITTABLE_INTERVAL) continue;
    if (!got.has(mod12(root + t))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The library
// ---------------------------------------------------------------------------

type Seed = {
  id: string;
  name: string;
  quality: ChordQuality;
  /** The chord's root at this reference placement. */
  root: PitchClass;
  frets: (number | null)[];
  fingers: (number | null)[];
  barre?: Barre;
  movable: boolean;
  size: ShapeSize;
  repeatEvery?: number;
  instrument?: Instrument;
};

/**
 * The movable guitar grips.
 *
 * Every one is written at the lowest fret it can live at, which for the
 * E-, A- and D-form families means fret 1 — so the major E-form reads as an
 * F and the A-form as a B flat. That is only bookkeeping: `shapesFor` slides
 * them wherever the chord is.
 */
const MOVABLE_GUITAR: Seed[] = [
  // --- major: the E, A and D forms, full and partial ------------------------
  {
    id: "maj-e-form",
    name: "E-form barre",
    quality: "maj",
    root: 5,
    frets: [1, 3, 3, 2, 1, 1],
    fingers: [1, 3, 4, 2, 1, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "barre",
  },
  {
    id: "maj-a-form",
    name: "A-form barre",
    quality: "maj",
    root: 10,
    frets: [null, 1, 3, 3, 3, 1],
    fingers: [null, 1, 3, 3, 3, 1],
    barre: { fret: 1, from: 5, to: 1 },
    movable: true,
    size: "barre",
  },
  {
    id: "maj-a-form-partial",
    name: "A-form, four strings",
    quality: "maj",
    root: 10,
    frets: [null, 1, 3, 3, 3, null],
    fingers: [null, 1, 2, 3, 4, null],
    movable: true,
    size: "barre",
  },
  {
    id: "maj-d-form",
    name: "D-form",
    quality: "maj",
    root: 3,
    frets: [null, null, 1, 3, 4, 3],
    fingers: [null, null, 1, 3, 4, 2],
    movable: true,
    size: "barre",
  },
  {
    id: "maj-root4-small",
    name: "small barre, root on 4",
    quality: "maj",
    root: 5,
    frets: [null, null, 3, 2, 1, 1],
    fingers: [null, null, 4, 3, 1, 1],
    barre: { fret: 1, from: 2, to: 1 },
    movable: true,
    size: "barre",
  },

  // --- minor ----------------------------------------------------------------
  {
    id: "min-e-form",
    name: "E-form barre",
    quality: "min",
    root: 5,
    frets: [1, 3, 3, 1, 1, 1],
    fingers: [1, 3, 4, 1, 1, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "barre",
  },
  {
    id: "min-a-form",
    name: "A-form barre",
    quality: "min",
    root: 10,
    frets: [null, 1, 3, 3, 2, 1],
    fingers: [null, 1, 3, 4, 2, 1],
    barre: { fret: 1, from: 5, to: 1 },
    movable: true,
    size: "barre",
  },
  {
    id: "min-a-form-partial",
    name: "A-form, four strings",
    quality: "min",
    root: 10,
    frets: [null, 1, 3, 3, 2, null],
    fingers: [null, 1, 3, 4, 2, null],
    movable: true,
    size: "barre",
  },
  {
    id: "min-d-form",
    name: "D-form",
    quality: "min",
    root: 3,
    frets: [null, null, 1, 3, 4, 2],
    fingers: [null, null, 1, 3, 4, 2],
    movable: true,
    size: "barre",
  },
  {
    id: "min-root4-small",
    name: "small barre, root on 4",
    quality: "min",
    root: 5,
    frets: [null, null, 3, 1, 1, 1],
    fingers: [null, null, 3, 1, 1, 1],
    barre: { fret: 1, from: 3, to: 1 },
    movable: true,
    size: "barre",
  },

  // --- diminished and augmented triads --------------------------------------
  {
    id: "dim-root6",
    name: "root on 6",
    quality: "dim",
    root: 5,
    frets: [1, 2, 3, 1, null, null],
    fingers: [1, 2, 3, 1, null, null],
    barre: { fret: 1, from: 6, to: 3 },
    movable: true,
    size: "barre",
  },
  {
    id: "dim-root5",
    name: "root on 5",
    quality: "dim",
    root: 10,
    frets: [null, 1, 2, 3, 2, null],
    fingers: [null, 1, 2, 4, 3, null],
    movable: true,
    size: "barre",
  },
  {
    id: "dim-root4",
    name: "root on 4",
    quality: "dim",
    root: 3,
    frets: [null, null, 1, 2, 4, 2],
    fingers: [null, null, 1, 2, 4, 3],
    movable: true,
    size: "barre",
  },
  {
    id: "aug-root6",
    name: "root on 6",
    quality: "aug",
    root: 5,
    frets: [1, null, 3, 2, 2, null],
    fingers: [1, null, 4, 2, 3, null],
    movable: true,
    size: "barre",
  },
  {
    id: "aug-root5",
    name: "root on 5",
    quality: "aug",
    root: 0,
    frets: [null, 3, 2, 1, 1, null],
    fingers: [null, 4, 3, 1, 1, null],
    barre: { fret: 1, from: 3, to: 2 },
    movable: true,
    size: "barre",
  },

  // --- dominant seventh -----------------------------------------------------
  {
    id: "dom7-e-form",
    name: "E-form barre",
    quality: "7",
    root: 5,
    frets: [1, 3, 1, 2, 1, 1],
    fingers: [1, 3, 1, 2, 1, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "dom7-a-form",
    name: "A-form barre",
    quality: "7",
    root: 10,
    frets: [null, 1, 3, 1, 3, 1],
    fingers: [null, 1, 3, 1, 4, 1],
    barre: { fret: 1, from: 5, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "dom7-d-form",
    name: "D-form",
    quality: "7",
    root: 3,
    frets: [null, null, 1, 3, 2, 3],
    fingers: [null, null, 1, 3, 2, 4],
    movable: true,
    size: "seventh",
  },

  // --- major seventh --------------------------------------------------------
  {
    id: "maj7-e-form",
    name: "E-form barre",
    quality: "maj7",
    root: 5,
    frets: [1, 3, 2, 2, 1, 1],
    fingers: [1, 4, 2, 3, 1, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "maj7-a-form",
    name: "A-form barre",
    quality: "maj7",
    root: 10,
    frets: [null, 1, 3, 2, 3, 1],
    fingers: [null, 1, 4, 2, 3, 1],
    barre: { fret: 1, from: 5, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "maj7-d-form",
    name: "D-form",
    quality: "maj7",
    root: 3,
    frets: [null, null, 1, 3, 3, 3],
    fingers: [null, null, 1, 3, 3, 3],
    barre: { fret: 3, from: 3, to: 1 },
    movable: true,
    size: "seventh",
  },

  // --- minor seventh --------------------------------------------------------
  {
    id: "m7-e-form",
    name: "E-form barre",
    quality: "m7",
    root: 5,
    frets: [1, 3, 1, 1, 1, 1],
    fingers: [1, 3, 1, 1, 1, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "m7-a-form",
    name: "A-form barre",
    quality: "m7",
    root: 10,
    frets: [null, 1, 3, 1, 2, 1],
    fingers: [null, 1, 3, 1, 2, 1],
    barre: { fret: 1, from: 5, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "m7-d-form",
    name: "D-form",
    quality: "m7",
    root: 3,
    frets: [null, null, 1, 3, 2, 2],
    fingers: [null, null, 1, 4, 2, 3],
    movable: true,
    size: "seventh",
  },

  // --- half-diminished and diminished sevenths ------------------------------
  {
    id: "m7b5-root5",
    name: "root on 5",
    quality: "m7b5",
    root: 10,
    frets: [null, 1, 2, 1, 2, null],
    fingers: [null, 2, 3, 1, 4, null],
    movable: true,
    size: "seventh",
  },
  {
    id: "m7b5-root6",
    name: "root on 6",
    quality: "m7b5",
    root: 7,
    frets: [3, null, 3, 3, 2, null],
    fingers: [2, null, 3, 4, 1, null],
    movable: true,
    size: "seventh",
  },
  {
    // A stack of minor thirds: the same grip is four different diminished
    // sevenths, and the same chord, three frets up. `repeatEvery` is why
    // this one shape fills the neck.
    id: "dim7-root4",
    name: "root on 4",
    quality: "dim7",
    root: 3,
    frets: [null, null, 1, 2, 1, 2],
    fingers: [null, null, 1, 3, 2, 4],
    movable: true,
    repeatEvery: 3,
    size: "seventh",
  },

  // --- suspended ------------------------------------------------------------
  {
    id: "sus4-e-form",
    name: "E-form barre",
    quality: "sus4",
    root: 5,
    frets: [1, 3, 3, 3, 1, 1],
    fingers: [1, 2, 3, 4, 1, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "barre",
  },
  {
    id: "sus4-a-form",
    name: "A-form barre",
    quality: "sus4",
    root: 10,
    frets: [null, 1, 3, 3, 4, 1],
    fingers: [null, 1, 2, 3, 4, 1],
    barre: { fret: 1, from: 5, to: 1 },
    movable: true,
    size: "barre",
  },
  {
    id: "sus4-d-form",
    name: "D-form",
    quality: "sus4",
    root: 3,
    frets: [null, null, 1, 3, 4, 4],
    fingers: [null, null, 1, 2, 3, 4],
    movable: true,
    size: "barre",
  },
  {
    id: "sus2-a-form",
    name: "A-form barre",
    quality: "sus2",
    root: 10,
    frets: [null, 1, 3, 3, 1, 1],
    fingers: [null, 1, 3, 4, 1, 1],
    barre: { fret: 1, from: 5, to: 1 },
    movable: true,
    size: "barre",
  },
  {
    id: "sus2-d-form",
    name: "D-form",
    quality: "sus2",
    root: 3,
    frets: [null, null, 1, 3, 4, 1],
    fingers: [null, null, 1, 3, 4, 2],
    movable: true,
    size: "barre",
  },
  {
    id: "sus2-root6",
    name: "root on 6",
    quality: "sus2",
    root: 5,
    frets: [1, 3, 5, null, null, null],
    fingers: [1, 2, 4, null, null, null],
    movable: true,
    size: "barre",
  },

  // --- sixths ---------------------------------------------------------------
  {
    id: "six-e-form",
    name: "E-form barre",
    quality: "6",
    root: 5,
    frets: [1, 3, 3, 2, 3, 1],
    fingers: [1, 3, 3, 2, 4, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "six-a-form",
    name: "A-form barre",
    quality: "6",
    root: 10,
    frets: [null, 1, 3, 3, 3, 3],
    fingers: [null, 1, 3, 3, 3, 3],
    barre: { fret: 3, from: 4, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "m6-e-form",
    name: "E-form barre",
    quality: "m6",
    root: 5,
    frets: [1, 3, 3, 1, 3, 1],
    fingers: [1, 3, 3, 1, 4, 1],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "m6-a-form",
    name: "A-form barre",
    quality: "m6",
    root: 10,
    frets: [null, 1, 3, 3, 2, 3],
    fingers: [null, 1, 3, 3, 2, 4],
    movable: true,
    size: "seventh",
  },

  // --- added ninth and dominant ninth ---------------------------------------
  {
    id: "add9-e-form",
    name: "E-form barre",
    quality: "add9",
    root: 5,
    frets: [1, 3, 3, 2, 1, 3],
    fingers: [1, 3, 3, 2, 1, 4],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "add9-root5",
    name: "root on 5",
    quality: "add9",
    root: 10,
    frets: [null, 1, 3, 5, 3, null],
    fingers: [null, 1, 2, 4, 3, null],
    movable: true,
    size: "seventh",
  },
  {
    id: "dom9-e-form",
    name: "E-form barre",
    quality: "9",
    root: 5,
    frets: [1, 3, 1, 2, 1, 3],
    fingers: [1, 3, 1, 2, 1, 4],
    barre: { fret: 1, from: 6, to: 1 },
    movable: true,
    size: "seventh",
  },
  {
    id: "dom9-root5",
    name: "root on 5",
    quality: "9",
    root: 0,
    frets: [null, 3, 2, 3, 3, 3],
    fingers: [null, 2, 1, 3, 3, 3],
    barre: { fret: 3, from: 3, to: 1 },
    movable: true,
    size: "seventh",
  },
];

/**
 * The open shapes.
 *
 * Everything a beginner learns first, and a few a working player uses every
 * night. There is no open F or open B in here because neither chord has one:
 * for those the movable grips above are what people actually play, and the
 * four-string A-form is the B most players reach for.
 */
const OPEN_GUITAR: Seed[] = [
  { id: "open-c", name: "open C", quality: "maj", root: 0, frets: [null, 3, 2, 0, 1, 0], fingers: [null, 3, 2, null, 1, null], movable: false, size: "open" },
  { id: "open-a", name: "open A", quality: "maj", root: 9, frets: [null, 0, 2, 2, 2, 0], fingers: [null, null, 1, 2, 3, null], movable: false, size: "open" },
  { id: "open-g", name: "open G", quality: "maj", root: 7, frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, null, null, null, 3], movable: false, size: "open" },
  { id: "open-e", name: "open E", quality: "maj", root: 4, frets: [0, 2, 2, 1, 0, 0], fingers: [null, 2, 3, 1, null, null], movable: false, size: "open" },
  { id: "open-d", name: "open D", quality: "maj", root: 2, frets: [null, null, 0, 2, 3, 2], fingers: [null, null, null, 1, 3, 2], movable: false, size: "open" },

  { id: "open-am", name: "open Am", quality: "min", root: 9, frets: [null, 0, 2, 2, 1, 0], fingers: [null, null, 2, 3, 1, null], movable: false, size: "open" },
  { id: "open-em", name: "open Em", quality: "min", root: 4, frets: [0, 2, 2, 0, 0, 0], fingers: [null, 2, 3, null, null, null], movable: false, size: "open" },
  { id: "open-dm", name: "open Dm", quality: "min", root: 2, frets: [null, null, 0, 2, 3, 1], fingers: [null, null, null, 2, 3, 1], movable: false, size: "open" },

  { id: "open-e7", name: "open E7", quality: "7", root: 4, frets: [0, 2, 0, 1, 0, 0], fingers: [null, 2, null, 1, null, null], movable: false, size: "open" },
  { id: "open-a7", name: "open A7", quality: "7", root: 9, frets: [null, 0, 2, 0, 2, 0], fingers: [null, null, 2, null, 3, null], movable: false, size: "open" },
  { id: "open-d7", name: "open D7", quality: "7", root: 2, frets: [null, null, 0, 2, 1, 2], fingers: [null, null, null, 2, 1, 3], movable: false, size: "open" },
  { id: "open-b7", name: "open B7", quality: "7", root: 11, frets: [null, 2, 1, 2, 0, 2], fingers: [null, 2, 1, 3, null, 4], movable: false, size: "open" },
  { id: "open-g7", name: "open G7", quality: "7", root: 7, frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, null, null, null, 1], movable: false, size: "open" },
  { id: "open-c7", name: "open C7", quality: "7", root: 0, frets: [null, 3, 2, 3, 1, 0], fingers: [null, 3, 2, 4, 1, null], movable: false, size: "open" },

  { id: "open-amaj7", name: "open Amaj7", quality: "maj7", root: 9, frets: [null, 0, 2, 1, 2, 0], fingers: [null, null, 2, 1, 3, null], movable: false, size: "open" },
  { id: "open-cmaj7", name: "open Cmaj7", quality: "maj7", root: 0, frets: [null, 3, 2, 0, 0, 0], fingers: [null, 3, 2, null, null, null], movable: false, size: "open" },
  { id: "open-dmaj7", name: "open Dmaj7", quality: "maj7", root: 2, frets: [null, null, 0, 2, 2, 2], fingers: [null, null, null, 1, 2, 3], movable: false, size: "open" },
  { id: "open-emaj7", name: "open Emaj7", quality: "maj7", root: 4, frets: [0, 2, 1, 1, 0, 0], fingers: [null, 3, 1, 2, null, null], movable: false, size: "open" },

  { id: "open-am7", name: "open Am7", quality: "m7", root: 9, frets: [null, 0, 2, 0, 1, 0], fingers: [null, null, 2, null, 1, null], movable: false, size: "open" },
  { id: "open-em7", name: "open Em7", quality: "m7", root: 4, frets: [0, 2, 0, 0, 0, 0], fingers: [null, 2, null, null, null, null], movable: false, size: "open" },
  { id: "open-dm7", name: "open Dm7", quality: "m7", root: 2, frets: [null, null, 0, 2, 1, 1], fingers: [null, null, null, 2, 1, 1], barre: { fret: 1, from: 2, to: 1 }, movable: false, size: "open" },

  { id: "open-asus2", name: "open Asus2", quality: "sus2", root: 9, frets: [null, 0, 2, 2, 0, 0], fingers: [null, null, 1, 2, null, null], movable: false, size: "open" },
  { id: "open-dsus2", name: "open Dsus2", quality: "sus2", root: 2, frets: [null, null, 0, 2, 3, 0], fingers: [null, null, null, 1, 3, null], movable: false, size: "open" },
  { id: "open-asus4", name: "open Asus4", quality: "sus4", root: 9, frets: [null, 0, 2, 2, 3, 0], fingers: [null, null, 1, 2, 3, null], movable: false, size: "open" },
  { id: "open-dsus4", name: "open Dsus4", quality: "sus4", root: 2, frets: [null, null, 0, 2, 3, 3], fingers: [null, null, null, 1, 3, 4], movable: false, size: "open" },
  { id: "open-esus4", name: "open Esus4", quality: "sus4", root: 4, frets: [0, 2, 2, 2, 0, 0], fingers: [null, 1, 2, 3, null, null], movable: false, size: "open" },

  { id: "open-cadd9", name: "open Cadd9", quality: "add9", root: 0, frets: [null, 3, 2, 0, 3, 3], fingers: [null, 2, 1, null, 3, 4], movable: false, size: "open" },
  { id: "open-aadd9", name: "open Aadd9", quality: "add9", root: 9, frets: [null, 0, 2, 4, 2, 0], fingers: [null, null, 1, 3, 2, null], movable: false, size: "open" },

  { id: "open-e9", name: "open E9", quality: "9", root: 4, frets: [0, 2, 0, 1, 0, 2], fingers: [null, 3, null, 1, null, 4], movable: false, size: "open" },
];

// ---------------------------------------------------------------------------
// The three-string triads, generated from the tuning
// ---------------------------------------------------------------------------

const TRIAD_SETS: { label: string; strings: [number, number, number] }[] = [
  { label: "5-4-3", strings: [5, 4, 3] },
  { label: "4-3-2", strings: [4, 3, 2] },
  { label: "3-2-1", strings: [3, 2, 1] },
];

const INVERSIONS = ["root position", "first inversion", "second inversion"];

/**
 * The lowest close voicing of three given pitch classes on three given
 * strings, within a four-fret reach and sounding in ascending order.
 * Returns null when the tuning simply cannot hold it.
 */
function findVoicing(indices: number[], wantPcs: number[]): number[] | null {
  const candidates = indices.map((idx, k) => {
    const out: number[] = [];
    for (let f = 0; f <= MAX_FRET; f++) {
      if (mod12(GUITAR_TUNING[idx] + f) === mod12(wantPcs[k])) out.push(f);
    }
    return out;
  });
  let best: number[] | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const a of candidates[0]) {
    for (const b of candidates[1]) {
      for (const c of candidates[2]) {
        const low = GUITAR_TUNING[indices[0]] + a;
        const mid = GUITAR_TUNING[indices[1]] + b;
        const high = GUITAR_TUNING[indices[2]] + c;
        if (!(low < mid && mid < high)) continue;
        const top = Math.max(a, b, c);
        const span = top - Math.min(a, b, c);
        if (span > 4) continue;
        const score = top * 100 + span;
        if (score < bestScore) {
          bestScore = score;
          best = [a, b, c];
        }
      }
    }
  }
  return best;
}

/**
 * Three notes on three strings, in root position and both inversions, on the
 * top, middle and lower string sets.
 *
 * These are generated rather than typed out: thirty-six voicings written by
 * hand would contain mistakes, and the tuning already knows the answer.
 * Every one is then normalised to start at fret 1 so it slides like any
 * other movable shape.
 */
function buildTriadSeeds(): Seed[] {
  const seeds: Seed[] = [];
  for (const quality of ["maj", "min", "dim", "aug"] as const) {
    const tones = chordTones(quality);
    for (const set of TRIAD_SETS) {
      const indices = set.strings.map((n) => indexOfString("guitar", n));
      for (let inv = 0; inv < 3; inv++) {
        const order = [tones[inv], tones[(inv + 1) % 3], tones[(inv + 2) % 3]];
        const found = findVoicing(indices, order);
        if (!found) continue;
        const shift = 1 - Math.min(...found);
        const placed = found.map((f) => f + shift);
        const frets: (number | null)[] = [null, null, null, null, null, null];
        const fingers: (number | null)[] = [null, null, null, null, null, null];
        const lowest = Math.min(...placed);
        indices.forEach((idx, k) => {
          frets[idx] = placed[k];
          fingers[idx] = Math.min(4, placed[k] - lowest + 1);
        });
        seeds.push({
          id: "triad-" + quality + "-" + set.label + "-" + String(inv),
          name: "triad on " + set.label + ", " + INVERSIONS[inv],
          quality,
          root: mod12(shift),
          frets,
          fingers,
          movable: true,
          size: "triad",
        });
      }
    }
  }
  return seeds;
}

// ---------------------------------------------------------------------------
// Bass
// ---------------------------------------------------------------------------

/**
 * Bass shapes as offsets from the root's fret, one note per string, starting
 * on the string the root sits on.
 *
 * The four strings are a fourth apart all the way up, so the same offsets
 * work rooted on the E string and rooted on the A string — the A-string
 * version is simply the first three notes, one string over. Where that drops
 * a note the chord cannot do without, the builder throws the shape away
 * rather than ship a grip whose name lies.
 *
 * Shells are deliberate. A bassist plays a seventh chord as root, third and
 * seventh; the fifth is what you leave out, and a four-note seventh arpeggio
 * does not fit a five-fret box on four strings.
 */
const BASS_PATTERNS: { id: string; name: string; quality: ChordQuality; offsets: (number | null)[] }[] = [
  { id: "bass-maj-triad", name: "major triad", quality: "maj", offsets: [0, -1, -3] },
  { id: "bass-maj-octave", name: "one-octave arpeggio", quality: "maj", offsets: [0, -1, -3, -3] },
  { id: "bass-min-triad", name: "minor triad", quality: "min", offsets: [0, -2, -3] },
  { id: "bass-min-octave", name: "one-octave arpeggio", quality: "min", offsets: [0, -2, -3, -3] },
  { id: "bass-dim-triad", name: "diminished triad", quality: "dim", offsets: [0, -2, -4] },
  { id: "bass-dim-close", name: "diminished triad, close", quality: "dim", offsets: [0, 1, null, 0] },
  { id: "bass-aug-triad", name: "augmented triad", quality: "aug", offsets: [0, -1, -2] },
  { id: "bass-dom7", name: "seventh shell", quality: "7", offsets: [0, -1, 0] },
  { id: "bass-maj7", name: "major seventh shell", quality: "maj7", offsets: [0, -1, 1] },
  { id: "bass-m7", name: "minor seventh shell", quality: "m7", offsets: [0, -2, 0] },
  { id: "bass-m7b5", name: "half-diminished arpeggio", quality: "m7b5", offsets: [0, 1, 0, 0] },
  { id: "bass-dim7", name: "diminished seventh arpeggio", quality: "dim7", offsets: [0, 1, -1, 0] },
  { id: "bass-six", name: "sixth", quality: "6", offsets: [0, -1, -1, -3] },
  { id: "bass-m6", name: "minor sixth", quality: "m6", offsets: [0, -2, -1, -3] },
  { id: "bass-sus4", name: "suspended fourth", quality: "sus4", offsets: [0, 0, -3] },
  { id: "bass-sus2", name: "suspended second", quality: "sus2", offsets: [0, -3, -3] },
  { id: "bass-add9", name: "added ninth", quality: "add9", offsets: [0, -1, -3, -1] },
  { id: "bass-dom9", name: "ninth", quality: "9", offsets: [0, -1, 0, -1] },
];

function buildBassSeeds(): Seed[] {
  const seeds: Seed[] = [];
  for (const pattern of BASS_PATTERNS) {
    // Sit the reference on the lowest fret that keeps every note on the
    // fingerboard, so the grip slides as far up the neck as it can.
    const lowestOffset = Math.min(...pattern.offsets.filter((o): o is number => o !== null));
    const referenceFret = 1 - lowestOffset;
    for (const rootString of [4, 3] as const) {
      const startIndex = indexOfString("bass", rootString);
      const usable = pattern.offsets.slice(0, BASS_TUNING.length - startIndex);
      if (usable.filter((o) => o !== null).length < 3) continue;
      const frets: (number | null)[] = [null, null, null, null];
      usable.forEach((offset, k) => {
        if (offset !== null) frets[startIndex + k] = referenceFret + offset;
      });
      const root = mod12(BASS_TUNING[startIndex] + referenceFret);
      if (!spellsChord(pattern.quality, root, pitchClassesFor("bass", frets))) continue;
      const lowest = Math.min(...frets.filter((f): f is number => f !== null));
      const fingers = frets.map((f) => (f === null ? null : Math.min(4, f - lowest + 1)));
      seeds.push({
        id: pattern.id + "-root" + String(rootString),
        name: pattern.name + ", root on " + (rootString === 4 ? "E" : "A"),
        quality: pattern.quality,
        root,
        frets,
        fingers,
        movable: true,
        size: usable.filter((o) => o !== null).length >= 4 ? "seventh" : "triad",
        instrument: "bass",
      });
    }
  }
  return seeds;
}

// ---------------------------------------------------------------------------
// Building the library
// ---------------------------------------------------------------------------

function toShape(seed: Seed): Shape {
  const instrument = seed.instrument ?? "guitar";
  const pitches = pitchClassesFor(instrument, seed.frets);
  let rootString: GuitarString = stringNumber(instrument, 0);
  for (let i = 0; i < pitches.length; i++) {
    if (pitches[i] === seed.root) {
      rootString = stringNumber(instrument, i);
      break;
    }
  }
  return {
    id: seed.id,
    name: seed.name,
    quality: seed.quality,
    instrument,
    root: seed.root,
    rootString,
    frets: seed.frets,
    fingers: seed.fingers,
    baseFret: baseFretFor(seed.frets),
    ...(seed.barre ? { barre: seed.barre } : {}),
    movable: seed.movable,
    repeatEvery: seed.repeatEvery ?? 12,
    size: seed.size,
  };
}

/** Every shape the app knows, guitar and bass. */
export const SHAPES: readonly Shape[] = [
  ...MOVABLE_GUITAR,
  ...OPEN_GUITAR,
  ...buildTriadSeeds(),
  ...buildBassSeeds(),
].map(toShape);

// ---------------------------------------------------------------------------
// Placing a shape
// ---------------------------------------------------------------------------

function shiftBarre(barre: Barre | undefined, by: number): Barre | undefined {
  return barre ? { ...barre, fret: barre.fret + by } : undefined;
}

function place(shape: Shape, root: PitchClass, shift: number): PlacedShape {
  const frets = shape.frets.map((f) => (f === null ? null : f + shift));
  const barre = shiftBarre(shape.barre, shift);
  const pitches = pitchClassesFor(shape.instrument, frets);
  let rootString: GuitarString | null = null;
  for (let i = 0; i < pitches.length; i++) {
    if (pitches[i] === root) {
      rootString = stringNumber(shape.instrument, i);
      break;
    }
  }
  return {
    id: shape.id + "@" + String(shift),
    shapeId: shape.id,
    name: shape.name,
    quality: shape.quality,
    root,
    instrument: shape.instrument,
    rootString,
    frets,
    fingers: shape.fingers,
    baseFret: baseFretFor(frets),
    ...(barre ? { barre } : {}),
    size: shape.size,
    pitches,
    position: positionOf(frets),
  };
}

const SIZE_ORDER: Record<ShapeSize, number> = { triad: 0, open: 1, barre: 2, seventh: 3 };

function soundingStrings(frets: (number | null)[]): number {
  return frets.filter((f) => f !== null).length;
}

export type ShapesOptions = { instrument?: Instrument };

/**
 * Every way to play this chord on this instrument, low on the neck first.
 *
 * Open shapes come out only for their own root, movable ones wherever they
 * land, and the diminished seventh grip comes out at all four of the minor
 * thirds it lives on. Nothing above fret 15, nothing twice.
 */
export function shapesFor(
  root: PitchClass,
  quality: ChordQuality,
  options: ShapesOptions = {},
): PlacedShape[] {
  const instrument = options.instrument ?? "guitar";
  const target = mod12(root);
  const out: PlacedShape[] = [];
  const seen = new Set<string>();

  for (const shape of SHAPES) {
    if (shape.instrument !== instrument) continue;
    if (shape.quality !== quality) continue;
    const first = mod12(target - shape.root);
    if (!shape.movable) {
      if (first !== 0) continue;
      const placed = place(shape, target, 0);
      const key = placed.frets.join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(placed);
      continue;
    }
    const highest = Math.max(...shape.frets.filter((f): f is number => f !== null));
    // A grip that comes round every few frets — the diminished seventh — is
    // the same chord at every repeat, so start at the lowest one that works
    // rather than at the first shift the arithmetic happened to give.
    const start = shape.repeatEvery > 0 ? first % shape.repeatEvery : first;
    for (let shift = start; highest + shift <= MAX_FRET; shift += shape.repeatEvery) {
      const placed = place(shape, target, shift);
      const key = placed.frets.join(",");
      if (!seen.has(key)) {
        seen.add(key);
        out.push(placed);
      }
      if (shape.repeatEvery <= 0) break;
    }
  }

  out.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    const strings = soundingStrings(a.frets) - soundingStrings(b.frets);
    if (strings !== 0) return strings;
    if (SIZE_ORDER[a.size] !== SIZE_ORDER[b.size]) return SIZE_ORDER[a.size] - SIZE_ORDER[b.size];
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return out;
}

/** How many shapes the library holds for a quality, per instrument. */
export function shapeCount(quality: ChordQuality, instrument: Instrument = "guitar"): number {
  return SHAPES.filter((s) => s.quality === quality && s.instrument === instrument).length;
}
