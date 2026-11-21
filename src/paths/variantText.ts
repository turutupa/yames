/**
 * A variant's own why and how-to, rewritten from the Exercise's.
 *
 * An Exercise has one `purpose` and one `howTo`, written for its first variant.
 * A string-set, key or position variant plays other frets, strings and notes,
 * so those words name the wrong ones. This module says the Exercise's own
 * sentences again for one variant's notes: a teacher saying the same thing
 * with this string's frets. It never invents teaching, and it knows nothing a
 * spec did not write.
 *
 * The rule that governs all of it: a sentence that is wrong is worse than
 * none. So:
 *
 * 1. Only a variant whose notes line up with the Exercise's one to one (same
 *    count, ticks, lengths, techniques, accents) is described at all.
 * 2. Everything is read off the aligned notes: where each string, each fret and
 *    each pitch class went. A map must be a function (one fret of the Exercise
 *    is one fret of the variant), and the things one sentence names must stay
 *    different things (two frets that become one fret lose the sentence).
 * 3. Every specific in a sentence is classified, and must first be TRUE OF THE
 *    EXERCISE'S OWN NOTES before it is mapped: a fret must be a fret the
 *    Exercise plays, a string a string it plays, a note letter one of its
 *    pitch classes, a key or chord name something it declares. A number that
 *    is in no known context, or a letter nothing verifies, is unknown, and an
 *    unknown refuses the sentence.
 * 4. Words that claim something the maps cannot carry (a finger, a distance, an
 *    interval, a direction, a stroke, an open string, "the top two strings")
 *    are written only when the move keeps that thing: the same fingers on the
 *    aligned notes, a uniform transposition, the same contour, the same
 *    strokes.
 * 5. A text (the purpose, or one how-to line) is kept up to its first sentence
 *    that cannot be written. A purpose whose first sentence cannot be written
 *    leaves the variant with no text at all, so it reads the Exercise's, with
 *    its "for the first version" line.
 *
 * `describeVariant` also says what it refused and why, for the report a person
 * reads; `variantText` is what the generator calls.
 */
import { nameToPitchClass } from "../jam/harmony";
import { fingerPlan } from "./fingering";
import type { HandPosition, Harmony, PathNote } from "./format";
import { chordRootName, spellChord } from "./theory";

/** One set of notes with what is declared about it: the Exercise (its first variant), or one variant. */
export type TextSide = {
  notes: readonly PathNote[];
  position: HandPosition;
  harmony?: Harmony;
  chords?: readonly string[];
  params?: Partial<Record<string, string>>;
};

export type ExerciseText = TextSide & { purpose: string; howTo: readonly string[] };

export type VariantText = { purpose?: string; howTo?: string[] };

export type Refusal = {
  /** `purpose`, or `howTo.<n>` of the Exercise. */
  where: string;
  sentence: string;
  /** A short kind, the same words for the same cause, so they can be counted. */
  reason: string;
};

export type VariantDescription = {
  /** Null: the variant reads the Exercise's text. */
  text: VariantText | null;
  /** The Exercise's how-to line each line of `text.howTo` was rewritten from. */
  howToFrom: number[];
  refusals: Refusal[];
};

/**
 * The line every varied Exercise of some Paths ends with. Never part of a variant's own how-to, and the
 * generator drops it from an Exercise whose other variants all have a how-to of their own.
 */
export const FIRST_VERSION_LINE = /for the first version/i;
const DISCLAIMER = FIRST_VERSION_LINE;

// ---------------------------------------------------------------------------
// The move: what happened to every aligned note
// ---------------------------------------------------------------------------

type Move = {
  /** Where each string, fret and pitch class of the Exercise went. Null: to more than one place. */
  strings: Map<number, number | null>;
  frets: Map<number, number | null>;
  pcs: Map<number, number | null>;
  /** Every note moved by this many semitones, exactly. */
  transposition: number | null;
  /** Every note's pitch class moved by this much (0 to 11). */
  pcShift: number | null;
  /** Every fret moved by this much. */
  fretShift: number | null;
  /** Every string moved by this many strings. */
  stringShift: number | null;
  sameFingers: boolean;
  /** Open stays open, fretted stays fretted. */
  sameOpen: boolean;
  /** From each note to the next: pitch and string go the same way. */
  sameContour: boolean;
  sameStrokes: boolean;
  sameShifts: boolean;
  /** The Exercise's frets in the order played, to recognise a list of them. */
  fretRun: number[];
};

const pcOf = (midi: number) => ((midi % 12) + 12) % 12;

function sameTech(a: PathNote, b: PathNote): boolean {
  if (a.tech.length !== b.tech.length) return false;
  const left = [...a.tech].sort();
  const right = [...b.tech].sort();
  return left.every((t, i) => t === right[i]);
}

function aligned(a: readonly PathNote[], b: readonly PathNote[]): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return a.every((n, i) => {
    const m = b[i];
    return n.tick === m.tick && n.dur === m.dur && sameTech(n, m) && !!n.accent === !!m.accent && (n.bend ?? 0) === (m.bend ?? 0);
  });
}

function put(map: Map<number, number | null>, from: number, to: number) {
  if (!map.has(from)) map.set(from, to);
  else if (map.get(from) !== to) map.set(from, null);
}

function uniform(values: number[]): number | null {
  return values.every((v) => v === values[0]) ? values[0] : null;
}

/**
 * The fingers already worked out, by everything `fingerPlan` reads. A pack's build asks for the
 * Exercise's own fingers once per variant and again per cue check; the key is the content, not the
 * array, so a note changed in place can never be answered from a stale entry.
 */
const FINGERS = new Map<string, ReadonlyArray<number | null>>();
const FINGERS_KEPT = 4096;

function fingersOf(side: TextSide): ReadonlyArray<number | null> {
  const key = `${side.position.fret}|${side.position.shifts}|${side.notes
    .map((n) => `${n.string},${n.fret},${n.tick},${n.tech.join("+")},${n.bend ?? ""},${n.finger ?? ""}`)
    .join(";")}`;
  const known = FINGERS.get(key);
  if (known) return known;
  const fingers = fingerPlan(side.notes, { fret: side.position.fret, shifts: side.position.shifts }).map((s) => s.finger);
  if (FINGERS.size >= FINGERS_KEPT) FINGERS.clear();
  FINGERS.set(key, fingers);
  return fingers;
}

function moveOf(ex: TextSide, v: TextSide): Move | null {
  if (!aligned(ex.notes, v.notes)) return null;
  const strings = new Map<number, number | null>();
  const frets = new Map<number, number | null>();
  const pcs = new Map<number, number | null>();
  ex.notes.forEach((n, i) => {
    const m = v.notes[i];
    put(strings, n.string, m.string);
    put(frets, n.fret, m.fret);
    put(pcs, pcOf(n.midi), pcOf(m.midi));
  });
  const exFingers = fingersOf(ex);
  const vFingers = fingersOf(v);
  const isTap = (n: PathNote) => n.tech.includes("tap");
  const sameFingers = ex.notes.every((n, i) => {
    if (isTap(n)) return true;
    // A fretted note the rules give no finger is not a finger anyone can name.
    return exFingers[i] !== null && exFingers[i] === vFingers[i];
  });
  const sign = (x: number) => (x > 0 ? 1 : x < 0 ? -1 : 0);
  let sameContour = true;
  for (let i = 0; i < ex.notes.length; i += 1) {
    const j = (i + 1) % ex.notes.length;
    const [a, b, c, d] = [ex.notes[i], ex.notes[j], v.notes[i], v.notes[j]];
    if (sign(b.midi - a.midi) !== sign(d.midi - c.midi) || sign(b.string - a.string) !== sign(d.string - c.string)) {
      sameContour = false;
      break;
    }
  }
  return {
    strings,
    frets,
    pcs,
    transposition: uniform(ex.notes.map((n, i) => v.notes[i].midi - n.midi)),
    pcShift: uniform(ex.notes.map((n, i) => (((v.notes[i].midi - n.midi) % 12) + 12) % 12)),
    fretShift: uniform(ex.notes.map((n, i) => v.notes[i].fret - n.fret)),
    stringShift: uniform(ex.notes.map((n, i) => v.notes[i].string - n.string)),
    sameFingers,
    sameOpen: ex.notes.every((n, i) => (n.fret === 0) === (v.notes[i].fret === 0)),
    sameContour,
    sameStrokes: ex.notes.every((n, i) => n.pick === v.notes[i].pick),
    sameShifts: ex.position.shifts === v.position.shifts,
    fretRun: ex.notes.map((n) => n.fret),
  };
}

// ---------------------------------------------------------------------------
// What each side declares: key, scale, chord, chart
// ---------------------------------------------------------------------------

type Family = "major" | "minor";

const MINOR_SCALES = new Set(["naturalMinor", "harmonicMinor", "melodicMinor", "minorPentatonic", "blues", "dorian", "phrygian", "aeolian", "locrian"]);

function scaleFamily(scale: string): Family {
  return MINOR_SCALES.has(scale) ? "minor" : "major";
}

function chordParts(symbol: string): { root: string; suffix: string } | null {
  const match = /^([A-G][#b]?)(.*)$/.exec(symbol.trim());
  return match ? { root: match[1], suffix: match[2] } : null;
}

function suffixFamily(suffix: string): Family {
  return /^(m(?!aj)|dim)/.test(suffix) ? "minor" : "major";
}

/** The root a `key` value names: "A", "F#", "Gm", "A minor". Null: the value is not a key (a fret offset, a label). */
function keyRoot(params: TextSide["params"]): { root: string; family: Family | null } | null {
  const value = params?.key;
  if (!value) return null;
  const match = /^([A-G][#b]?)(m|[ -]minor|[ -]major)?$/.exec(value.trim());
  if (!match) return null;
  return { root: match[1], family: match[2] ? (/major/.test(match[2]) ? "major" : "minor") : null };
}

const pcOfName = (name: string): number => {
  const pc = nameToPitchClass(name);
  if (pc === null) throw new Error(`not a note name: ${name}`);
  return pc;
};

const harmonyRoot = (h: Harmony | undefined): string | null =>
  h && (h.kind === "scale" || h.kind === "scaleOverChords") ? h.root : null;

/**
 * Did everything the Exercise declares move by `t` semitones, and nothing else
 * change? With `t` 0 the names themselves must be the same, letter for letter.
 */
function declarationsMoved(ex: TextSide, v: TextSide, t: number): boolean {
  const moved = (from: string, to: string) => (t === 0 ? from === to : (pcOfName(from) + t) % 12 === pcOfName(to));
  const a = ex.harmony;
  const b = v.harmony;
  if (!a !== !b) return false;
  if (a && b) {
    if (a.kind !== b.kind) return false;
    if ((a.kind === "scale" || a.kind === "scaleOverChords") && (b.kind === "scale" || b.kind === "scaleOverChords")) {
      if (a.scale !== b.scale || !moved(a.root, b.root)) return false;
    }
    if (a.kind === "arpeggio" && b.kind === "arpeggio") {
      const [x, y] = [chordParts(a.chord), chordParts(b.chord)];
      if (!x || !y || x.suffix !== y.suffix || !moved(x.root, y.root)) return false;
    }
  }
  if (!ex.chords !== !v.chords) return false;
  if (ex.chords && v.chords) {
    if (ex.chords.length !== v.chords.length) return false;
    for (let i = 0; i < ex.chords.length; i += 1) {
      const [x, y] = [chordParts(ex.chords[i]), chordParts(v.chords[i])];
      if (!x || !y || x.suffix !== y.suffix || !moved(x.root, y.root)) return false;
    }
  }
  const [k, l] = [keyRoot(ex.params), keyRoot(v.params)];
  if (k) {
    if (!l || k.family !== l.family || !moved(k.root, l.root)) return false;
  }
  return true;
}

/** The same kinds of scale and chord on both sides, whatever their roots. */
function sameQualities(ex: TextSide, v: TextSide): boolean {
  const a = ex.harmony;
  const b = v.harmony;
  if (!a !== !b) return false;
  if (a && b) {
    if (a.kind !== b.kind) return false;
    if ((a.kind === "scale" || a.kind === "scaleOverChords") && (b.kind === "scale" || b.kind === "scaleOverChords") && a.scale !== b.scale) return false;
    if (a.kind === "arpeggio" && b.kind === "arpeggio" && chordParts(a.chord)?.suffix !== chordParts(b.chord)?.suffix) return false;
  }
  if (!ex.chords !== !v.chords) return false;
  if (ex.chords && v.chords) {
    if (ex.chords.length !== v.chords.length) return false;
    if (ex.chords.some((c, i) => chordParts(c)?.suffix !== chordParts(v.chords![i])?.suffix)) return false;
  }
  return true;
}

/** A pitch class as this side's declared harmony spells it. Null: it has no spelling there. */
function spellPc(side: TextSide, pc: number): string | null {
  const h = side.harmony;
  if (h && h.kind !== "chordTones") {
    const found = h.spelled.find((name) => nameToPitchClass(name) === pc);
    if (found) return found;
    if (h.kind === "scaleOverChords") {
      const extra = h.allowed.find((name) => nameToPitchClass(name) === pc);
      if (extra) return extra;
    }
  }
  const names = new Set<string>();
  for (const chord of side.chords ?? []) {
    let tones: string[] = [];
    try {
      tones = spellChord(chord);
    } catch {
      try {
        tones = [chordRootName(chord)];
      } catch {
        tones = [];
      }
    }
    for (const name of tones) if (nameToPitchClass(name) === pc) names.add(name);
  }
  if (names.size === 1) return [...names][0];
  if (names.size > 1) return null;
  const key = keyRoot(side.params);
  if (key && nameToPitchClass(key.root) === pc) return key.root;
  return null;
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

type Tok = {
  text: string;
  low: string;
  start: number;
  end: number;
  kind: "note" | "word" | "num" | "punct";
  /** Inside quotes: something said or counted out loud, never a specific. */
  quoted: boolean;
  /** Claimed by a pass, so later passes leave it. */
  used?: boolean;
};

// A chord symbol's suffix. "E9" is a chord (a ninth), never a string and a fret: those are "E 9" or "E string 9".
const TOKEN = /[A-G](?:#|b)?(?:maj7|maj9|m7b5|m7|m9|dim7|dim|aug|sus2|sus4|m|7|9|5)?(?![A-Za-z0-9#])|[A-Za-z]+(?:['’][a-z]+)*|\d+|\S/g;

function tokenize(sentence: string): Tok[] {
  const toks: Tok[] = [];
  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(sentence))) {
    const text = match[0];
    const start = match.index;
    const before = start > 0 ? sentence[start - 1] : " ";
    let kind: Tok["kind"] = /^\d/.test(text) ? "num" : /^[A-Za-z]/.test(text) ? "word" : "punct";
    if (kind === "word" && /^[A-G](?:#|b)?(?:maj7|maj9|m7b5|m7|m9|dim7|dim|aug|sus2|sus4|m|7|9|5)?$/.test(text) && !/[A-Za-z0-9]/.test(before)) kind = "note";
    toks.push({ text, low: text.toLowerCase(), start, end: start + text.length, kind, quoted: false });
  }
  // Quoted spans: an opening quote after a space, a bracket or the start; a closing one before a space, punctuation or the end.
  const quote = /(^|[\s(:,])(['"‘“])([^'"‘’“”]*)(['"’”])(?=$|[\s,.;:)!?])/g;
  let q: RegExpExecArray | null;
  while ((q = quote.exec(sentence))) {
    const from = q.index + q[1].length;
    const to = from + q[2].length + q[3].length + q[4].length;
    for (const tok of toks) if (tok.start >= from && tok.end <= to) tok.quoted = true;
  }
  return toks;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, sixty: 60, hundred: 100, thousand: 1000,
};
const ORDINALS = [
  "zeroth", "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth",
  "thirteenth", "fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth", "twentieth",
  "twenty-first", "twenty-second", "twenty-third", "twenty-fourth",
];
/** "eighth" is a note value in these texts, never the eighth of anything. */
const ORDINAL_OF: Record<string, number> = Object.fromEntries(ORDINALS.slice(1, 13).map((w, i) => [w, i + 1]).filter(([w]) => w !== "eighth"));

/** Nouns an ordinal may count without claiming anything about the notes ("the first note", "the third bar"). */
const COUNTED = new Set([
  "note", "notes", "bar", "bars", "beat", "beats", "time", "times", "step", "steps", "tap", "taps", "pull", "pulls", "hammer", "hammers",
  "pick", "picks", "stroke", "strokes", "one", "ones", "group", "groups", "half", "syllable", "syllables", "rung", "rungs", "take", "takes",
  "pass", "thing", "click", "clicks", "level", "cell", "cells", "loop", "loops", "repeat", "repeats", "phrase", "phrases", "lick", "licks",
  "eighth", "eighths", "quarter", "quarters", "triplet", "triplets", "ten", "minute", "minutes", "second", "seconds", "few", "two", "three", "four",
  "chorus", "choruses", "day", "days", "week", "weeks", "riff", "riffs", "pulloff", "downstroke", "upstroke", "short", "long", "picked", "and",
]);

const FINGER_NAMES = new Set(["first", "second", "third", "fourth", "little", "ring", "middle", "index", "pinky"]);
const STRING_FULL: Record<number, string> = { 1: "top string", 2: "B string", 3: "G string", 4: "D string", 5: "A string", 6: "low E string" };
const STRING_LETTER: Record<string, number[]> = { E: [1, 6], B: [2], G: [3], D: [4], A: [5] };
/** The pitch class of each open string. */
const OPEN_PC: Record<number, number> = { 1: 4, 2: 11, 3: 7, 4: 2, 5: 9, 6: 4 };
/** What another Exercise did, said in the past: "the last Exercise ended on A", "in Step 2 the root was at fret 5". */
const PAST = new Set(["was", "were", "had", "did", "ended", "started", "began", "played", "used", "went", "came", "stopped", "landed", "sat", "climbed", "walked", "stayed", "moved", "took"]);
const WHICH_EXERCISE = new Set(["last", "previous", "earlier", "first", "second", "third", "next", "other", "another"]);
const ELSEWHERE = new Set(["exercise", "exercises", "step", "steps", "take", "takes"]);

const DIRECTION = new Set([
  "up", "down", "higher", "lower", "upper", "climb", "climbs", "climbing", "climbed", "rise", "rises", "rising", "fall", "falls", "falling",
  "descend", "descends", "descending", "descent", "ascend", "ascends", "ascending", "ascent", "above", "below", "top", "bottom", "highest",
  "lowest", "back", "upward", "upwards", "downward", "downwards", "high", "low", "raised", "lowered", "mirror", "reverse",
  "reversed", "turn", "turns",
]);
const STROKES = new Set([
  "downstroke", "downstrokes", "upstroke", "upstrokes", "stroke", "strokes", "strict", "strictly", "alternate", "alternating", "alternates",
  "outside", "inside", "sweep", "sweeps", "swept", "economy", "push", "rake", "up", "down",
]);
const NEIGHBOUR = new Set([
  "next", "adjacent", "neighbouring", "neighboring", "pair", "pairs", "skip", "skips", "skipping", "skipped", "crossing", "crossings", "cross",
  "crosses", "across", "outside", "inside", "hop", "hops",
]);
/** Pitch distances and what they are called: true after the move only if every note moved the same interval. */
const INTERVALS = new Set([
  "root", "roots", "octave", "octaves", "interval", "intervals", "tone", "tones", "semitone", "semitones", "step", "steps", "third", "thirds",
  "fourth", "fourths", "fifth", "fifths", "sixth", "sixths", "seventh", "sevenths", "ninth", "unison", "whole", "sharp", "flat", "natural",
  "degree", "degrees",
]);
/** A layout on the neck: true after the move only if it is the same layout somewhere else. */
const LAYOUT = new Set([
  "box", "boxes", "shape", "shapes", "pattern", "patterns", "grip", "grips", "barre", "barres", "laid", "stretch", "stretches", "stretched",
  "reach", "reaches", "span", "row", "staircase", "apart",
]);
const QUALITY = new Set([
  "major", "minor", "diminished", "dominant", "augmented", "pentatonic", "blues", "dorian", "mixolydian", "harmonic", "chord", "chords",
  "scale", "scales", "arpeggio", "arpeggios", "triad", "triads", "progression", "changes", "mode", "modes",
]);
const WIDTH = new Set(["wide", "wider", "narrow", "narrower"]);
const WIDTH_OF = ["fret", "frets", "finger", "fingers", "hand", "string", "strings", "shape", "reach", "stretch", "neck"];
const NECK_WHERE = ["high", "higher", "low", "lower", "middle", "top", "bottom", "end", "whole", "width"];
/** After a key's name at the start of a sentence: a thing that takes "The" ("The G minor pentatonic box"). */
const KEY_THINGS = new Set(["box", "scale", "shape", "chord", "arpeggio", "triad", "lick", "run", "riff", "pattern", "line", "phrase", "figure", "sweep"]);
/** After a key's name that stands alone: "B natural minor on the low three strings", "B minor climbing". */
const KEY_ALONE = new Set(["on", "in", "from", "across", "over", "up", "down", "climbing", "one", "with", "at", "through", "to", "and", "is", "as", "for"]);
/** Where the figure lies among the strings: true only on the same strings. */
const BESIDE = new Set(["below", "above", "beside", "between", "beneath", "underneath"]);
const STRETCH = new Set(["stretch", "stretches", "stretched", "reach", "reaches", "reaching"]);
const HAND = new Set(["shift", "shifts", "shifted", "shifting", "position", "positions"]);
const HAND_MOVES = new Set(["move", "moves", "moving", "moved", "stay", "stays", "travel", "travels", "drop", "drops", "jump", "jumps", "goes", "stretch"]);
const STRING_KIND = new Set(["wound", "thick", "thicker", "thickest", "thin", "thinner", "thinnest", "heavy", "heavier", "bass", "treble"]);
const ABSOLUTE_STRINGS = new Set(["top", "bottom", "high", "low", "middle", "highest", "lowest", "outer", "inner", "upper", "lower", "higher"]);
const ROMAN = /^(?:i{1,3}|iv|vi{0,3}|II|III|IV|VI{0,3}|V)$/;
const CONNECT = new Set([",", "and", "to", "then", "or", "-", "of", "from", "on", "at", ";"]);
const LIST_JOIN = new Set([",", "and", "to", "then", "or", "-", "of"]);

// ---------------------------------------------------------------------------
// One sentence
// ---------------------------------------------------------------------------

type Ctx = {
  ex: TextSide;
  v: TextSide;
  move: Move;
  /** The Exercise's whole text, for style: "high E" or "top E", "F#" or "F sharp". */
  all: string;
  exFrets: Set<number>;
  exStrings: Set<number>;
  exPcs: Set<number>;
  movedBy: number | null;
  sameDeclared: boolean;
  qualities: boolean;
};

type Written = { ok: true; text: string } | { ok: false; reason: string };

class Refuse extends Error {}
const refuse = (reason: string): never => {
  throw new Refuse(reason);
};

type Edit = { start: number; end: number; text: string; article?: boolean };

function needsAn(text: string): boolean {
  if (/^[AEF](?![a-z])/.test(text)) return true;
  if (/^(8|11|18)(?!\d)/.test(text) || /^8\d(?!\d)/.test(text)) return true;
  return /^(eight|eleven|eighteen|eighth|eleventh|open)/.test(text);
}

function rewriteSentence(
  sentence: string,
  ctx: Ctx,
  countCarried: boolean,
  placedBefore: ReadonlySet<number> = new Set(),
): Written & { counting?: boolean; specific?: boolean; placed?: number[] } {
  const toks = tokenize(sentence);
  const edits: Edit[] = [];
  const { move, ex, v } = ctx;
  const at = (i: number): Tok | undefined => (i >= 0 && i < toks.length ? toks[i] : undefined);
  const word = (i: number): string => {
    const t = at(i);
    return t && !t.quoted && (t.kind === "word" || t.kind === "note") ? t.low : "";
  };
  const is = (i: number, ...texts: string[]) => {
    const t = at(i);
    return !!t && !t.quoted && texts.includes(t.low);
  };
  const adjacent = (i: number, j: number) => !!at(i) && !!at(j) && at(i)!.end === at(j)!.start;
  const hasWord = (...words: string[]) => toks.some((t) => !t.quoted && t.kind === "word" && words.includes(t.low));
  const bareLetter = (i: number): string | null => {
    const t = at(i);
    return t && !t.quoted && t.kind === "note" && /^[A-G]$/.test(t.text) ? t.text : null;
  };

  /** The same figure somewhere else: every note moved the same interval and the same number of frets, none to or from an open string. */
  const rigid = move.transposition !== null && move.fretShift !== null && move.sameOpen;
  const counting = toks.some((t) => t.quoted) || hasWord("count", "beat", "beats", "clap", "say");
  let specific = false;
  /** A key, scale or chart name left as it was because the key did not move, while the notes did. */
  let keptKey = false;
  /** A note said by another name. */
  let renamedNote = false;
  /**
   * Notes this sentence puts at a fret ("D at fret 3", "C at 8"), with those an earlier sentence of the
   * same text put there. Such a name is a label for the note at that place, so where the notes did not
   * all move one interval it may still be said again: it names the note the variant plays at that place.
   * Any other name of a note is its identity ("each A", "the one sharp in G major"), true only under a
   * transposition.
   */
  const placed = new Set<number>(placedBefore);
  {
    /** The note named from token `i` and the token it ends on, or null. */
    const noteAt = (i: number): { pc: number; end: number } | null => {
      const t = toks[i];
      if (!t || t.quoted || t.kind !== "note" || !/^[A-G](#|b)?$/.test(t.text)) return null;
      if (t.text.length === 1 && ["sharp", "flat"].includes(toks[i + 1]?.low ?? "")) return { pc: pcOfName(t.text + (toks[i + 1].low === "sharp" ? "#" : "b")), end: i + 1 };
      return { pc: pcOfName(t.text), end: i };
    };
    const stringFrom = (i: number): boolean => {
      const [a, b, c] = [toks[i], toks[i + 1], toks[i + 2]];
      if (!a || a.quoted) return false;
      if (["low", "high", "top"].includes(a.low)) return true;
      return a.kind === "note" && /^[A-G]$/.test(a.text) && !!b && /^strings?$/.test(b.low) && !c?.quoted;
    };
    for (let i = 0; i < toks.length; i += 1) {
      const first = noteAt(i);
      if (!first) continue;
      // "D at fret 3", "C at 8".
      const next = toks[first.end + 1];
      const num = toks[first.end + 2]?.low === "fret" ? toks[first.end + 3] : toks[first.end + 2];
      if (next && !next.quoted && next.low === "at" && num && num.kind === "num" && !num.quoted) placed.add(first.pc);
      // "E, F, G on the B string": a list of notes, every one of them on that string.
      const run = [first];
      let j = first.end + 1;
      for (;;) {
        let k = j;
        while (toks[k] && !toks[k].quoted && LIST_JOIN.has(toks[k].low) && k - j < 3) k += 1;
        const more = k > j ? noteAt(k) : null;
        if (!more) break;
        run.push(more);
        j = more.end + 1;
      }
      if (toks[j]?.low === "on" && toks[j + 1]?.low === "the" && stringFrom(j + 2)) for (const n of run) placed.add(n.pc);
      // "C, B, A, B: pick, pull, pull, hammer": three or more names that are the notes in the order played.
      const played = ex.notes.map((n) => pcOf(n.midi));
      const inOrder = (s: number) => run.every((n, k) => played[s + k] === n.pc);
      if (run.length >= 3 && played.some((_p, s) => s + run.length <= played.length && inOrder(s))) for (const n of run) placed.add(n.pc);
      i = first.end;
    }
  }
  const sentenceFrets = new Map<number, number>();
  const sentenceStrings = new Map<number, number>();
  const sentencePcs = new Map<number, number>();
  const classes = new Map<number, string>();
  /** What was said, by the token it starts at: to catch "a picked A on the A string" at fret 12. */
  const saidStrings = new Map<number, { target: number; changed: boolean; letter: string }>();
  const saidNotes = new Map<number, { out: string; changed: boolean }>();
  /** Token indices that name a fret, a string, a note or a key, to catch "X or Y". */
  const named = new Set<number>();
  const keyish = new Set<number>();

  try {
    // ----- strings ---------------------------------------------------------
    const stringOf = (letter: string, which?: "low" | "high"): number => {
      const options = STRING_LETTER[letter];
      if (!options) return refuse("a string it cannot name");
      if (options.length === 1) return options[0];
      if (which) return which === "low" ? 6 : 1;
      const usedHere = options.filter((s) => ctx.exStrings.has(s));
      return usedHere.length === 1 ? usedHere[0] : refuse("an E string it cannot tell apart");
    };
    const shortName = (s: number): string =>
      s === 1 ? (/\bhigh E\b/.test(ctx.all) ? "high E" : "top E") : s === 6 ? "low E" : STRING_FULL[s].split(" ")[0];
    const mapString = (s: number): number => {
      if (!ctx.exStrings.has(s)) return refuse("a string the Exercise does not play");
      const to = move.strings.get(s);
      if (to === null || to === undefined) return refuse("a string that goes to two strings");
      sentenceStrings.set(s, to);
      specific = true;
      return to;
    };
    /** A string named from token `from` to `to` (inclusive); `full` when the word "string" is part of it. */
    const claimString = (from: number, to: number, s: number, full: boolean, possessive = false) => {
      const target = mapString(s);
      // The same string keeps the words it had ("top E string", "the high E").
      let said = sentence.slice(toks[from].start, toks[to].end);
      if (target !== s) {
        let text = full ? STRING_FULL[target] + (possessive ? "'s" : "") : shortName(target);
        if (/^[A-Z]/.test(toks[from].text) && (toks[from].kind === "word" || from === 0)) text = text[0].toUpperCase() + text.slice(1);
        edits.push({ start: toks[from].start, end: toks[to].end, text, article: true });
        said = text;
      }
      // The letter the words give the string, if any: "B string", "low E"; "top string" gives none.
      saidStrings.set(from, { target, changed: target !== s, letter: /(?:^| )([A-G])(?: |'|$)/.exec(said)?.[1] ?? "" });
      for (let k = from; k <= to; k += 1) {
        toks[k].used = true;
        named.add(k);
      }
      classes.set(to, "string");
    };
    const isStringWord = (i: number) => is(i, "string", "string's");
    /**
     * "low E" from token `from` to `to` can only be the string: frets follow it ("low E 5, 7, 8", "the low
     * E's fret 5", "the low E (5, 7, 8)"), a fret is put on it ("5 on the low E", "A at fret 5 on the low E"),
     * or it is one of a list that ends in "strings" ("the low E, A and D strings").
     */
    const plainlyString = (from: number, to: number): boolean => {
      let after = to + 1;
      if (is(after, "'", "’") && is(after + 1, "s")) return true;
      if (is(after, "(")) after += 1;
      if (at(after)?.kind === "num" && !at(after)!.quoted) return true;
      // "12 on the A and top E": back over the strings it is listed with, to the fret put on them.
      let before = from - 1;
      for (;;) {
        if (is(before, "the")) before -= 1;
        if (!is(before, "and", "or", ",")) break;
        const letter = bareLetter(before - 1);
        if (!letter || !STRING_LETTER[letter]) break;
        before -= 2;
      }
      if (is(before, "on") && at(before - 1)?.kind === "num") return true;
      for (let j = to + 1; j < toks.length; j += 1) {
        if (is(j, "strings")) return true;
        if (!(is(j, ",", "and", "or", "the", "top") || (bareLetter(j) && STRING_LETTER[bareLetter(j)!]))) break;
      }
      return false;
    };

    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.quoted || t.used) continue;
      // "low E", "high E", "top E", with or without "string".
      if ((t.low === "low" || t.low === "high" || t.low === "top") && bareLetter(i + 1) === "E") {
        const s = t.low === "low" ? 6 : 1;
        if (isStringWord(i + 2)) claimString(i, i + 2, s, true, toks[i + 2].low === "string's");
        else {
          // "the low E" with no "string" is also what a reader calls the note, where the Exercise plays
          // an E on that string ("the riff rests on the low E"). Unless the words around it make it the
          // string, both readings must come out as the same words: the E's must go to the open note of
          // the string the words will name (the low E stays, or an open-E figure moves to the open A).
          const eNotes = ex.notes.some((n) => n.string === s && pcOf(n.midi) === 4);
          if (eNotes && !plainlyString(i, i + 1)) {
            const to = move.strings.get(s);
            const pc = move.pcs.get(4);
            if (to === null || to === undefined || pc === null || pc === undefined || pc !== OPEN_PC[to]) {
              refuse("'low E' that could be the string or the note, and they moved differently");
            }
          }
          claimString(i, i + 1, s, false);
        }
        continue;
      }
      if (t.low === "top" && isStringWord(i + 1)) {
        claimString(i, i + 1, 1, true, toks[i + 1].low === "string's");
        continue;
      }
      if (t.low === "bottom" && is(i + 1, "string", "strings")) refuse("a string it cannot name");
      const letter = bareLetter(i);
      if (letter && STRING_LETTER[letter]) {
        if (isStringWord(i + 1)) {
          claimString(i, i + 1, stringOf(letter), true, toks[i + 1].low === "string's");
          continue;
        }
        // "B string 5, 6, 8" is above; "A 5, 7, 8" is a string and its frets.
        if (at(i + 1)?.kind === "num" && !adjacent(i, i + 1) && !at(i + 1)!.quoted) {
          claimString(i, i, stringOf(letter), false);
          continue;
        }
      }
    }
    // A list that ends in "strings": "the G and B strings", "low E, A, D and G strings", "the B and top strings".
    for (let i = 0; i < toks.length; i += 1) {
      if (!is(i, "strings")) continue;
      let j = i - 1;
      let found = 0;
      for (;;) {
        const t = at(j);
        if (!t || t.quoted) break;
        if (t.used && classes.get(j) === "string") {
          // Already a string ("low E"): walk past its tokens.
          while (j >= 0 && toks[j].used) j -= 1;
          found += 1;
        } else if (bareLetter(j) && STRING_LETTER[bareLetter(j)!]) {
          claimString(j, j, stringOf(bareLetter(j)!), false);
          found += 1;
          j -= 1;
        } else if (t.low === "top" && j === i - 1 && is(j - 1, "and", "or") && (bareLetter(j - 2) || classes.get(j - 2) === "string")) {
          // "the B and top strings"
          claimString(j, j, 1, false);
          found += 1;
          j -= 1;
        } else break;
        if (is(j, "and", "or") && is(j - 1, ",")) j -= 2;
        else if (is(j, "and", "or", ",")) j -= 1;
        else break;
      }
    }
    // "7 on the G", "at fret 5 on the E": a fret number, then a string by its letter.
    for (let i = 0; i < toks.length; i += 1) {
      if (toks[i].kind !== "num" || toks[i].quoted) continue;
      if (is(i + 1, "on") && is(i + 2, "the") && bareLetter(i + 3) && !toks[i + 3].used && STRING_LETTER[bareLetter(i + 3)!]) {
        claimString(i + 3, i + 3, stringOf(bareLetter(i + 3)!), false);
      }
    }
    // "the low E and A", "the low E or the A": a letter joined to a string is a string.
    for (let i = 0; i < toks.length; i += 1) {
      if (classes.get(i) !== "string") continue;
      let j = i + 1;
      if (!is(j, "and", "or", "to")) continue;
      j += 1;
      if (is(j, "the")) j += 1;
      const letter = bareLetter(j);
      if (!letter || toks[j].used || !STRING_LETTER[letter]) continue;
      if (is(j + 1, "at", "to") || at(j + 1)?.kind === "note") continue;
      claimString(j, j, stringOf(letter), false);
    }
    // Strings named by where they lie, not by letter: true only if the strings are the same ones.
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.quoted || t.used || !ABSOLUTE_STRINGS.has(t.low)) continue;
      const ahead = [word(i + 1), word(i + 2)];
      const noun = ahead.find((w) => ["string", "strings", "pair", "pairs", "set", "sets"].includes(w));
      if (!noun) continue;
      if (ahead[0] !== noun && !NUMBER_WORDS[ahead[0]] && !["e", "few"].includes(ahead[0])) continue;
      specific = true;
      const relative = ["upper", "lower", "higher"].includes(t.low) && (noun === "string" || noun === "pair");
      if (relative) {
        if (move.stringShift === null || !move.sameContour) refuse("which string is higher: the strings moved differently");
      } else if (move.stringShift !== 0) refuse("strings named by where they lie, on other strings");
      t.used = true;
    }

    // ----- names: chord symbols, and a letter with a kind ("A minor", "E minor pentatonic") ----
    const style = (name: string, from: string): string => {
      const words = / (sharp|flat)\b/.test(from) || (!/[#b]$/.test(from.slice(1, 2)) && /[A-G] (sharp|flat)\b/.test(ctx.all) && !/[A-G][#b]/.test(ctx.all));
      if (name.length > 2) return refuse("a note with no plain spelling");
      if (!words) return name;
      return `${name[0]}${name[1] === "#" ? " sharp" : name[1] === "b" ? " flat" : ""}`;
    };
    /** What the Exercise declares with this root, strongest first. */
    type Slot = { kind: "harmony" | "arpeggio" | "chart" | "key"; family: Family | null; scale?: string; index?: number };
    const slotsFor = (pc: number): Slot[] => {
      const slots: Slot[] = [];
      const h = ex.harmony;
      const root = harmonyRoot(h);
      if (h && root !== null && pcOfName(root) === pc && (h.kind === "scale" || h.kind === "scaleOverChords")) {
        slots.push({ kind: "harmony", family: scaleFamily(h.scale), scale: h.scale });
      }
      if (h && h.kind === "arpeggio") {
        const parts = chordParts(h.chord);
        if (parts && pcOfName(parts.root) === pc) slots.push({ kind: "arpeggio", family: suffixFamily(parts.suffix) });
      }
      (ex.chords ?? []).forEach((chord, index) => {
        const parts = chordParts(chord);
        if (parts && pcOfName(parts.root) === pc) slots.push({ kind: "chart", family: suffixFamily(parts.suffix), index });
      });
      const key = keyRoot(ex.params);
      if (key && pcOfName(key.root) === pc) slots.push({ kind: "key", family: key.family });
      return slots;
    };
    const variantRoot = (slot: Slot): string | null => {
      if (slot.kind === "harmony") return harmonyRoot(v.harmony);
      if (slot.kind === "arpeggio") return v.harmony?.kind === "arpeggio" ? (chordParts(v.harmony.chord)?.root ?? null) : null;
      if (slot.kind === "chart") return chordParts(v.chords?.[slot.index!] ?? "")?.root ?? null;
      return keyRoot(v.params)?.root ?? null;
    };
    /**
     * A key, scale or chord name's root after the move. `ofNotes`: the name says
     * what the notes spell out ("an A minor chord"), not what key they are in.
     */
    const mapName = (pc: number, family: Family | null, scaleWord: string | null, ofNotes: boolean, original: string): string => {
      const slots = slotsFor(pc).filter((s) => {
        if (family && s.family && family !== s.family) return false;
        if (scaleWord && s.kind === "harmony" && !s.scale!.toLowerCase().includes(scaleWord)) return false;
        if (scaleWord && s.kind !== "harmony" && s.kind !== "key") return false;
        return true;
      });
      if (slots.length === 0) return refuse("a key or chord name the Exercise does not declare");
      specific = true;
      const slot = slots[0];
      if (ctx.sameDeclared) {
        if (move.pcShift === 0) return original;
        // The same key, other notes: a key or scale name still holds; what the notes spell does not.
        if (!ofNotes || slot.kind !== "harmony") {
          keptKey = true;
          return original;
        }
        if (move.pcShift === null) return refuse("a chord name, and the notes did not all move the same interval");
        const spelled = spellPc(v, (pc + move.pcShift) % 12);
        return spelled === null ? refuse("a note with no spelling in the variant's harmony") : style(spelled, original);
      }
      if (ctx.movedBy === null) return refuse("a key or chord name, and the move is not a uniform transposition");
      const root = variantRoot(slot);
      if (root === null || pcOfName(root) !== (pc + ctx.movedBy) % 12) return refuse("a key or chord name, and the move is not a uniform transposition");
      return style(root, original);
    };

    const QUALITY_PHRASES: Array<[string[], Family | null, string | null]> = [
      [["natural", "minor"], "minor", null],
      [["harmonic", "minor"], "minor", "harmonic"],
      [["minor", "pentatonic"], "minor", "pentatonic"],
      [["major", "pentatonic"], "major", "pentatonic"],
      [["minor", "seven"], "minor", null],
      [["major", "seven"], "major", null],
      [["minor", "blues"], "minor", "blues"],
      [["minor"], "minor", null],
      [["major"], "major", null],
      [["pentatonic"], null, "pentatonic"],
      [["blues"], null, "blues"],
      [["dorian"], "minor", "dorian"],
      [["mixolydian"], "major", "mixolydian"],
      [["diminished"], "minor", null],
      [["seven"], "major", null],
    ];
    const CHORD_NOUNS = ["chord", "chords", "triad", "triads", "arpeggio", "arpeggios", "shape", "shapes"];
    // Where "A" may be the article: only where the sentence starts. After a colon the article is a
    // lower-case "a" ("one thing: a new string"), so a capital there is a note, a string or a key
    // ("Three roots: A while the band is on Dm7, ...").
    const sentenceStart = (i: number) => i === 0 || (i === 1 && toks[0].kind === "punct");

    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.quoted || t.used || t.kind !== "note") continue;
      const match = /^([A-G])(#|b)?(.*)$/.exec(t.text)!;
      let rootText = `${match[1]}${match[2] ?? ""}`;
      let end = i;
      // "F sharp", "B flat"
      if (!match[2] && !match[3] && is(i + 1, "sharp", "flat")) {
        rootText = `${match[1]}${toks[i + 1].low === "sharp" ? "#" : "b"}`;
        end = i + 1;
      }
      const original = sentenceSlice(sentence, toks[i], toks[end]);
      const pc = pcOfName(rootText);

      // A chord symbol: "Am", "E7", "C#dim". True of the variant's chart at the same bars.
      if (match[3]) {
        const symbol = t.text;
        const bars = (ex.chords ?? []).map((c, bar) => (c === symbol ? bar : -1)).filter((bar) => bar >= 0);
        const arpeggio = ex.harmony?.kind === "arpeggio" && ex.harmony.chord === symbol;
        if (bars.length === 0 && !arpeggio) refuse("a chord symbol the Exercise does not declare");
        specific = true;
        if (!ctx.sameDeclared && ctx.movedBy === null) refuse("a chord symbol, and the move is not a uniform transposition");
        const targets = new Set<string>();
        for (const bar of bars) targets.add(v.chords?.[bar] ?? "");
        if (arpeggio && v.harmony?.kind === "arpeggio") targets.add(v.harmony.chord);
        if (targets.size !== 1 || targets.has("")) refuse("a chord symbol that becomes two chords");
        if (ctx.sameDeclared && move.pcShift !== 0) keptKey = true;
        edits.push({ start: t.start, end: t.end, text: [...targets][0], article: true });
        t.used = true;
        named.add(i);
        keyish.add(i);
        continue;
      }

      // A letter and a kind: "A minor", "E minor pentatonic", "A Dorian".
      // "G major's names" is the key too: the possessive is one token, "major's".
      const phrase = QUALITY_PHRASES.find(([words]) =>
        words.every((w, k) => word(end + 1 + k) === w || (k === words.length - 1 && /^(.+)['’]s$/.exec(word(end + 1 + k))?.[1] === w)),
      );
      const article = match[1] === "A" && !match[2] && end === i && sentenceStart(i);
      if (phrase) {
        const [words, family, scaleWord] = phrase;
        const after = end + words.length + 1;
        const ofNotes = CHORD_NOUNS.includes(word(after)) || (words[words.length - 1] === "seven");
        if (article && slotsFor(pc).length === 0) {
          // "A major scale walked up one string": the article, in an Exercise that declares another key.
          if (!ex.harmony && !ex.chords) refuse("'A' that may be a key or an article");
          continue;
        }
        let root = mapName(pc, family, scaleWord, ofNotes, original);
        if (article && root !== original) {
          // "A minor pentatonic box going up": that "A" may have been the article. With another key
          // in its place a countable thing needs "The"; a key standing alone ("B natural minor on the
          // low three strings", "C Dorian, one octave") needs nothing; anything else is not written.
          const next = at(after);
          const follows = next && !next.quoted ? next.low : "";
          if (KEY_THINGS.has(follows)) root = `${i === 0 ? "The" : "the"} ${root}`;
          else if (next && next.kind !== "punct" && !KEY_ALONE.has(follows)) refuse("a key name where 'A' may have been the article");
        }
        if (root !== original) edits.push({ start: toks[i].start, end: toks[end].end, text: root, article: true });
        for (let k = i; k <= end + words.length; k += 1) {
          toks[k].used = true;
          named.add(k);
        }
        keyish.add(i);
        continue;
      }
      if (is(end + 1, "natural")) {
        // "G natural": a note, and it must still be a natural one.
        const to = mapNote(pc, original);
        if (to.length > 1) refuse("a natural note that is no longer natural");
        if (to !== original) edits.push({ start: toks[i].start, end: toks[end].end, text: to, article: true });
        toks[i].used = true;
        toks[end + 1].used = true;
        named.add(i);
        continue;
      }
      // "A different key each time": the article.
      if (article && at(i + 1)?.kind === "word" && /^[a-z]/.test(toks[i + 1].text) && !["string", "strings", "at", "to", "on", "and", "or", "then", "is", "in", "twice", "again", "from", "with", "as"].includes(toks[i + 1].low)) {
        continue;
      }

      // A bare letter: a note, or after "in", "for", "over", "on" (or before a colon) perhaps a key or a chord.
      const before = word(i - 1);
      const label = is(end + 1, ":") || ["in", "for", "over"].includes(before) || (before === "on" && !is(end + 1, "string")) || (before === "to" && word(i - 2) === "home") || (before === "of" && word(i - 2) === "key");
      const outputs = new Set<string>();
      const asNote = ctx.exPcs.has(pc);
      const asName = label && slotsFor(pc).length > 0;
      if (!asNote && !asName) refuse(label ? "a key or chord name the Exercise does not declare" : "a note letter the Exercise does not play");
      // "C at 8": the Exercise must play that note at that fret.
      if (is(end + 1, "at") && (at(end + 2)?.kind === "num" || (is(end + 2, "fret") && at(end + 3)?.kind === "num"))) {
        const fretTok = at(end + 2)!.kind === "num" ? toks[end + 2] : toks[end + 3];
        const fret = Number(fretTok.text);
        if (!ex.notes.some((n) => pcOf(n.midi) === pc && n.fret === fret)) refuse("a note at a fret the Exercise does not play it at");
      }
      if (asNote) outputs.add(mapNote(pc, original));
      if (asName) {
        outputs.add(mapName(pc, null, null, false, original));
        keyish.add(i);
      }
      // "on the B": a string or a note. Both readings must say the same thing.
      if (before === "the" && STRING_LETTER[rootText] && end === i && !is(end + 1, "at")) {
        const strings = STRING_LETTER[rootText].filter((s) => ctx.exStrings.has(s));
        if (strings.length > 1) refuse("an E string it cannot tell apart");
        if (strings.length === 1) {
          const to = move.strings.get(strings[0]);
          if (to === null || to === undefined) refuse("a string that goes to two strings");
          outputs.add(shortName(to!));
        }
      }
      if (outputs.size !== 1) refuse("a letter that could be a note, a string or a key, and they moved differently");
      const out = [...outputs][0];
      saidNotes.set(i, { out, changed: out !== original });
      if (out !== original) edits.push({ start: toks[i].start, end: toks[end].end, text: out, article: true });
      for (let k = i; k <= end; k += 1) toks[k].used = true;
      named.add(i);
      classes.set(i, "note");
    }

    function mapNote(pc: number, original: string): string {
      if (!ctx.exPcs.has(pc)) return refuse("a note letter the Exercise does not play");
      const to = move.pcs.get(pc);
      if (to === null || to === undefined) return refuse("a note that becomes two notes");
      specific = true;
      if (to !== pc) {
        // A name is said again only where the variant is that transposition: every note moved the same
        // interval. The same key on another string, or another box of it, puts another note at the same
        // place, and "F sharp, the one sharp in G major" read as "A, the one sharp in G major". A note put
        // at a fret is the exception: "D at fret 3" names the note at that place, and so does its answer.
        if (move.pcShift === null && !placed.has(pc)) return refuse("a note name, and the notes did not all move the same interval");
        // "The key note, G, is the open string": a name given a part in the key is its identity, whatever
        // place the sentence before put it at.
        if (move.pcShift === null && hasWord("key", "keys", "tonic", "home")) return refuse("a note's part in the key, and the notes did not all move the same interval");
        renamedNote = true;
      }
      sentencePcs.set(pc, to);
      const spelled = spellPc(v, to);
      if (spelled !== null) return style(spelled, original);
      // No harmony to spell it: the same pitch keeps the name the Exercise gave it.
      return to === pc ? original : refuse("a note with no spelling in the variant's harmony");
    }

    // ----- numbers ---------------------------------------------------------
    const mapFret = (fret: number): number => {
      if (!ctx.exFrets.has(fret)) return refuse("a fret the Exercise does not play");
      const to = move.frets.get(fret);
      if (to === null || to === undefined) return refuse("a fret that goes to two frets");
      // "Fret 0" is not a fret a teacher names, and a fretted note is not an open one.
      if ((fret === 0) !== (to === 0)) return refuse("a fretted note that becomes an open string");
      sentenceFrets.set(fret, to);
      specific = true;
      return to;
    };
    const numClass = new Map<number, string>();
    const TECH_VERBS = new Set(["tap", "taps", "tapped", "hammer", "hammers", "hammered", "pick", "picks", "picked", "onto"]);
    /** The class a number has from the words right before and after it. */
    const triggered = (i: number): string | null => {
      const value = Number(toks[i].text);
      if (is(i + 1, "%")) return "count";
      if (word(i + 1) === "bpm") return "count";
      if (is(i + 1, "to") && at(i + 2)?.kind === "num" && word(i + 3) === "bpm") return "count";
      if (is(i - 1, "+") || is(i + 1, "+")) return "count";
      const p1 = word(i - 1);
      const p2 = word(i - 2);
      if (p1 === "at" && p2 === "pass") return "count";
      if (["bar", "bars", "beat", "beats", "step", "steps", "level", "rung", "rungs", "take", "takes", "about"].includes(p1)) return "count";
      if (p1 === "box" || p1 === "boxes") return "box";
      if (p1 === "finger" || p1 === "fingers") return value >= 1 && value <= 4 ? "finger" : null;
      if (p1 === "fret" || p1 === "frets") return "fret";
      if (p1 === "at" && (p2 === "fret" || p2 === "frets")) return "fret";
      if (classes.get(i - 1) === "string") return "fret";
      if (TECH_VERBS.has(p1)) return "fret";
      if ((p1 === "to" || p1 === "from") && ["off", "back", "slide", "slides", "on"].includes(p2)) return "fret";
      if (p1 === "at" && p2 === "on" && ["hammer", "hammers"].includes(word(i - 3))) return "fret";
      if (p1 === "at" && classes.get(i - 2) === "note") return "fret";
      // "the 8 on the B string", "7 on the G"
      if (is(i + 1, "on") && (classes.get(i + 2) === "string" || classes.get(i + 3) === "string" || toks[i + 2]?.used || toks[i + 3]?.used)) {
        const next = [i + 2, i + 3, i + 4].find((k) => classes.get(k) === "string");
        if (next !== undefined) return "fret";
      }
      const fretsSoFar = [...numClass.values()].includes("fret");
      if (p1 === "its" && fretsSoFar) return "fret";
      // "the fret-12 figure": a name, not a place. It may stay only if that fret did.
      if (is(i - 1, "-") && word(i - 2) === "fret" && adjacent(i - 2, i - 1) && adjacent(i - 1, i)) return "fretName";
      const fingerWord = (w: string) => ORDINAL_OF[w] !== undefined || FINGER_NAMES.has(w) || w === "finger";
      if (["on", "for", "at", "takes"].includes(p1) && fingerWord(p2)) return "fret";
      if (is(i + 1, "with") && is(i + 2, "the", "your") && (fingerWord(word(i + 3)) || word(i + 4) === "finger")) return "fret";
      // "the 8s": the notes at that fret.
      if (adjacent(i, i + 1) && is(i + 1, "s")) return "fret";
      if (!counting && p1 === "on" && ["lands", "land", "landing", "stops", "stop", "ends", "end"].includes(p2)) return "fret";
      if (!counting && fretsSoFar && ["on", "to", "at", "from"].includes(p1)) return "fret";
      return null;
    };
    /** The numbers of a list from `i`: joined only by commas, "and", "to", "then", a dash. */
    const listFrom = (i: number): number[] => {
      const out = [i];
      let j = i + 1;
      for (;;) {
        let k = j;
        while (at(k) && !toks[k].quoted && LIST_JOIN.has(toks[k].low) && k - j < 3) k += 1;
        if (k === j || at(k)?.kind !== "num" || toks[k].quoted) break;
        out.push(k);
        j = k + 1;
      }
      return out;
    };
    const runOf = (values: number[]): boolean => {
      const run = move.fretRun;
      for (let s = 0; s + values.length <= run.length; s += 1) {
        if (values.every((val, k) => run[s + k] === val)) return true;
      }
      return false;
    };
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.kind !== "num" || t.quoted) continue;
      const value = Number(t.text);
      let cls = triggered(i);
      if (!cls) {
        // A list goes on in the class it started in: "frets 5, 7 and 8", "beats 1 and 3".
        let j = i - 1;
        let steps = 0;
        while (at(j) && !toks[j].quoted && CONNECT.has(toks[j].low) && LIST_JOIN.has(toks[j].low) && steps < 3) {
          j -= 1;
          steps += 1;
        }
        // "the 8s"
        if (steps > 0 && at(j)?.low === "s" && at(j - 1)?.kind === "num") j -= 1;
        if (steps > 0 && at(j)?.kind === "num" && numClass.has(j)) cls = numClass.get(j)!;
        if (cls === "finger" && (value < 1 || value > 4)) cls = null;
      }
      if (!cls) {
        // "12, 5, 8, 5": a list with no label is frets only when the Exercise plays those frets in that order.
        const list = listFrom(i);
        const values = list.map((k) => Number(toks[k].text));
        const fingerLike = values.every((val) => val >= 1 && val <= 4) && hasWord("finger", "fingers");
        if (list.length >= 2 && !fingerLike && !list.some((k) => (triggered(k) ?? "fret") !== "fret") && runOf(values)) {
          for (const k of list) numClass.set(k, "fret");
          cls = "fret";
        }
      }
      // Said in a sentence that counts ("Count '1, 2' ... on 3 and 4"), a small number is a beat. Carried over
      // from the sentence before, only if it could not be a fret that moved.
      const fretTalk = hasWord("fret", "frets", "tap", "hammer", "pull", "pick", "slide") || [...classes.values()].includes("string");
      if (!cls && value >= 1 && value <= 4 && (counting || (countCarried && (!fretTalk || !ctx.exFrets.has(value) || move.frets.get(value) === value)))) {
        cls = "count";
      }
      if (!cls) refuse("a number it cannot place");
      numClass.set(i, cls!);
    }
    for (const [i, cls] of numClass) {
      const t = toks[i];
      const value = Number(t.text);
      if (cls === "fret") {
        const to = mapFret(value);
        // "frets 5 to 8" is every fret between: only a move that shifts them all alike keeps it.
        if (word(i - 1) === "frets" && is(i + 1, "to") && at(i + 2)?.kind === "num" && move.fretShift === null) refuse("a range of frets, and the frets moved differently");
        if (to !== value) edits.push({ start: t.start, end: t.end, text: String(to), article: true });
        named.add(i);
      } else if (cls === "fretName") {
        specific = true;
        if (!ctx.exFrets.has(value) || move.frets.get(value) !== value) refuse("a figure's name with a fret in it, and the fret moved");
      } else if (cls === "finger") {
        specific = true;
        if (!move.sameFingers) refuse("a finger, and the fingers differ");
        named.add(i);
      } else if (cls === "box") {
        specific = true;
        if (!rigid) refuse("a box or shape, and the move is not a uniform transposition");
      }
    }

    // ----- number words and ordinals ---------------------------------------
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.quoted || t.used || t.kind !== "word") continue;
      if (NUMBER_WORDS[t.low] !== undefined) {
        // What is being counted: the first telling noun among the next three words.
        const ahead = [1, 2, 3].map((k) => (at(i + k)?.kind === "punct" ? "." : word(i + k)));
        const stop = ahead.indexOf(".");
        const near = stop < 0 ? ahead : ahead.slice(0, stop);
        const noun = near.find((w) => /^(frets?|strings?|fingers?|positions?|box|boxes|shapes?|octaves?|steps?|tones?|semitones?|places|keys)$/.test(w));
        if (!noun) continue;
        specific = true;
        if (/^frets?$/.test(noun) || /^(octaves?|steps?|tones?|semitones?)$/.test(noun)) {
          if (!rigid) refuse("a distance, and the move is not a uniform transposition");
        } else if (/^strings?$/.test(noun)) {
          const where = [word(i - 1), ...near.slice(0, near.indexOf(noun))];
          if (where.some((w) => ABSOLUTE_STRINGS.has(w))) {
            if (move.stringShift !== 0) refuse("strings named by where they lie, on other strings");
          } else if (new Set([...move.strings.values()]).size !== move.strings.size || [...move.strings.values()].includes(null)) {
            refuse("a number of strings, and the strings moved differently");
          }
        } else if (/^fingers?$/.test(noun)) {
          if (!move.sameFingers) refuse("a finger, and the fingers differ");
        } else if (!rigid) {
          refuse("a box or shape, and the move is not a uniform transposition");
        }
        continue;
      }
      const ordinal = ORDINAL_OF[t.low];
      if (ordinal !== undefined) {
        const next = word(i + 1);
        // "first, second and third fingers", "first finger"
        let k = i + 1;
        while (is(k, ",", "and", "or") || FINGER_NAMES.has(word(k))) k += 1;
        const fingerAhead = /^fingers?('s)?$/.test(word(k));
        if (fingerAhead || (hasWord("finger", "fingers", "finger's") && !COUNTED.has(next) && next !== "fret" && next !== "position")) {
          specific = true;
          if (!move.sameFingers) refuse("a finger, and the fingers differ");
          continue;
        }
        if (next === "fret") {
          const to = mapFret(ordinal);
          if (to !== ordinal) edits.push({ start: t.start, end: t.end, text: caseLike(ORDINALS[to] ?? refuse("a fret it has no word for"), t.text), article: true });
          named.add(i);
          continue;
        }
        if (next === "position") {
          specific = true;
          if (ex.position.fret !== ordinal) refuse("a position the Exercise does not start in");
          if (move.fretShift === null || !move.sameShifts || !move.sameOpen) refuse("the hand's position, and the frets moved differently");
          const to = v.position.fret;
          if (to !== ordinal) edits.push({ start: t.start, end: t.end, text: caseLike(ORDINALS[to] ?? refuse("a fret it has no word for"), t.text), article: true });
          toks[i + 1].used = true;
          continue;
        }
        if (COUNTED.has(next) || t.low === "first" || t.low === "second") continue;
        // "two eighths with a third squeezed in": one more of what is being counted.
        if (is(i - 1, "a") && hasWord("eighths", "sixteenths", "quarters") && !hasWord("root", "chord", "scale")) continue;
        // "the fifth tapped", "root, third, fifth": an interval.
        specific = true;
        if (move.transposition === null) refuse("an interval, and the move is not a uniform transposition");
        continue;
      }
      if (["little", "ring", "middle", "index", "pinky"].includes(t.low)) {
        // "little finger", or "ring for 12" where the sentence is about fingers; never "a little", "let it ring".
        const named = /^fingers?('s)?$/.test(word(i + 1)) || (hasWord("finger", "fingers", "finger's") && !is(i - 1, "a", "it", "them", "note", "notes", "string", "strings") && is(i + 1, "for", "on", "at", "takes", ",", "and", "hammers", "pulls"));
        if (named) {
          specific = true;
          if (!move.sameFingers) refuse("a finger, and the fingers differ");
        }
      }
    }

    // ----- words that claim what the maps cannot carry ---------------------
    /** Another Exercise, Step or Take is named ("the last Exercise", "the Exercise before", "Step 2"), and is what the sentence tells of. */
    const aboutAnother = (): boolean => {
      let subject = false;
      let found = false;
      for (let i = 0; i < toks.length; i += 1) {
        if (toks[i].quoted || !ELSEWHERE.has(word(i))) continue;
        const named =
          WHICH_EXERCISE.has(word(i - 1)) || is(i + 1, "before", "after", "above") || (word(i) === "step" && at(i + 1)?.kind === "num" && !toks[i + 1].quoted);
        // "Step 1's figure" is a name for something this Exercise plays.
        if (!named || is(i + (at(i + 1)?.kind === "num" ? 2 : 1), "'", "’")) continue;
        found = true;
        // The sentence opens with it: "The Exercise before climbs ...", "In Step 2 the root ...", "Step 2 has ...".
        let first = 0;
        if (is(first, "in", "from")) first += 1;
        if (is(first, "the")) first += 1;
        if (i === first || (i === first + 1 && WHICH_EXERCISE.has(word(first)))) subject = true;
      }
      return found && (subject || toks.some((t) => !t.quoted && t.kind === "word" && PAST.has(t.low)));
    };
    let meta = false;
    for (let i = 0; i < toks.length; i += 1) {
      const t = toks[i];
      if (t.quoted || t.used || t.kind !== "word") continue;
      const w = t.low;
      if (w === "variant" || w === "variants") meta = true;
      if ((w === "other" || w === "another") && /^(takes?|strings?|keys?|positions?|pairs?|frets?|box|boxes|shapes?|days?|variants?|sets?)$/.test(word(i + 1))) meta = true;
      if (w === "or" && (named.has(i - 1) || named.has(i + 1) || named.has(i + 2) || (is(i - 1, "(") && at(i + 1)?.kind !== "word"))) {
        refuse("a choice between the variants ('or')");
      }
      if (w === "up" && is(i + 1, "to") && is(i + 2, "a") && is(i + 3, "pass")) continue;
      if (w === "open") {
        specific = true;
        if (!ex.notes.some((n) => n.fret === 0)) refuse("an open string the Exercise does not play");
        if (!move.sameOpen) refuse("an open string, and the open notes differ");
      }
      const idiom = (w === "fall" || w === "falls") && is(i + 1, "on", "in", "into", "early", "late", "between", "just", "exactly", "halfway");
      if (DIRECTION.has(w) && !idiom && !move.sameContour) {
        specific = true;
        refuse("a direction, and the line's contour differs");
      }
      if (STROKES.has(w) && !move.sameStrokes) {
        specific = true;
        refuse("a pick stroke, and the strokes differ");
      }
      if (NEIGHBOUR.has(w) && (move.stringShift === null || !move.sameContour)) {
        specific = true;
        refuse("which string is next, and the strings moved differently");
      }
      if (INTERVALS.has(w) && !(w === "step" && /^[A-Z]/.test(t.text)) && !COUNTED.has(word(i + 1)) && !(w === "whole" && word(i + 1) !== "step" && word(i + 1) !== "tone")) {
        const ordinalWord = ORDINAL_OF[w] !== undefined || ORDINAL_OF[w.replace(/s$/, "")] !== undefined;
        if (!ordinalWord && w !== "sharp" && w !== "flat" && w !== "natural") {
          specific = true;
          if (move.transposition === null) refuse("an interval, and the move is not a uniform transposition");
        } else if (w.endsWith("s") && ordinalWord) {
          // "thirds", "sixths": always the interval.
          specific = true;
          if (move.transposition === null) refuse("an interval, and the move is not a uniform transposition");
        }
      }
      if (LAYOUT.has(w)) {
        specific = true;
        if (!rigid) refuse("a box or shape, and the move is not a uniform transposition");
      }
      if (STRETCH.has(w)) {
        // A full stretch at fret 7 is an easy reach at fret 12: the frets are that much closer.
        specific = true;
        if (!rigid || Math.abs(move.fretShift ?? 0) >= 5) refuse("a stretch or a reach, and the frets are much wider or closer");
      }
      if (BESIDE.has(w)) {
        // "the strings below", "the string between": said of strings, it is where the figure lies.
        const stringAt = (k: number) => /^strings?('s)?$/.test(word(k)) || classes.get(k) === "string" || saidStrings.has(k);
        let ofStrings = stringAt(i - 1) || stringAt(i - 2);
        for (let k = i + 1; k <= i + 5 && at(k) && !(toks[k].kind === "punct" && toks[k].text !== "'"); k += 1) ofStrings = ofStrings || stringAt(k);
        if (ofStrings) {
          specific = true;
          if (move.stringShift !== 0) refuse("strings named by where they lie, on other strings");
        }
      }
      if (QUALITY.has(w)) {
        specific = true;
        if (move.pcShift === null && !ctx.qualities) refuse("a kind of chord or scale, and the variant declares another");
        if (move.pcShift !== null && move.pcShift !== 0 && !ctx.qualities) refuse("a kind of chord or scale, and the variant declares another");
      }
      const roman = ROMAN.test(t.text) && (t.text !== "I" || is(i + 1, ",", "-") || is(i - 1, ",", "-", "of", "round", "follow", "and"));
      if (roman) {
        specific = true;
        if (move.pcShift === null || !ctx.qualities) refuse("chord numbers, and the move is not a uniform transposition");
      }
      if (HAND.has(w) || (w === "hand" && toks.some((o) => !o.quoted && HAND_MOVES.has(o.low)))) {
        specific = true;
        if (move.fretShift === null || !move.sameShifts || !move.sameOpen) refuse("the hand's position, and the frets moved differently");
      }
      if (w === "nut" || (w === "neck" && hasWord(...NECK_WHERE))) {
        specific = true;
        if (move.fretShift !== 0) refuse("a place on the neck, and the frets moved");
      }
      if (WIDTH.has(w) && hasWord(...WIDTH_OF)) {
        specific = true;
        if (move.fretShift !== 0) refuse("a place on the neck, and the frets moved");
      }
      if (w === "fret" || w === "frets") {
        // "one finger per fret", "the same fret", "the low fret": a layout unless a number follows.
        const numbered = at(i + 1)?.kind === "num" || (is(i + 1, "at") && at(i + 2)?.kind === "num") || ORDINAL_OF[word(i - 1)] !== undefined || NUMBER_WORDS[word(i - 1)] !== undefined;
        if (!numbered) {
          specific = true;
          if (move.fretShift === null || !move.sameOpen) refuse("a layout of frets, and the frets moved differently");
        }
      }
      if (STRING_KIND.has(w) && move.stringShift !== 0) {
        specific = true;
        refuse("a kind of string, on other strings");
      }
    }
    if (meta && specific) refuse("a sentence about the other variants");
    // What another Exercise did is not this variant's notes: its letters and frets do not move with this
    // Exercise's, and nothing here says where they went. "The turn from the last Exercise: C# held over A7"
    // names this Exercise's own notes and is written; "the last Exercise ended on A" is not.
    if (specific && aboutAnother()) refuse("a sentence about another Exercise");
    // "fret 3 for G, fret 8 for C": a table of keys, one of them this variant's.
    const keyLetters = new Set<string>();
    for (const i of keyish) if (["in", "for"].includes(word(i - 1))) keyLetters.add(toks[i].text);
    if (keyLetters.size >= 2) refuse("a sentence about the other variants");

    // "a picked A on the A string" at fret 12 reads as the open string. Not written, unless it is the open string.
    for (const [from, string] of saidStrings) {
      let j = from - 1;
      if (is(j, "the")) j -= 1;
      if (!is(j, "on")) continue;
      // Which notes are said to be on it: "B at 9 and D at 12 on the D string" (each with its fret), or a plain
      // list, "D, D, A and G on the A string". Not the notes before a "then", nor a list before a placed note.
      let placed = false;
      for (j -= 1; j >= 0; j -= 1) {
        const t = toks[j];
        const note = saidNotes.get(j);
        if (note) {
          const hasFret = is(j + 1, "at");
          if (placed && !hasFret) break;
          placed = placed || hasFret;
          const open = v.notes.some((n) => n.string === string.target && n.fret === 0);
          if (note.out === string.letter && (note.changed || string.changed) && !open) refuse("a note with the name of the string it is on, not open");
          continue;
        }
        if (t.quoted) break;
        if (t.kind === "num" || [",", "and", "at", "fret", "a", "an", "picked", "held", "long", "the"].includes(t.low)) continue;
        break;
      }
    }

    // "Play B, the third of G major" with the figure a string over in the same key: B became D, G major
    // stayed G major, and D is not its third. A note renamed beside a key that stayed is not written.
    if (keptKey && renamedNote) refuse("a note renamed beside a key name that did not move");
    const distinct = (map: Map<number, number>) => new Set(map.values()).size === map.size;
    if (!distinct(sentenceFrets)) refuse("two frets that become one fret");
    if (!distinct(sentenceStrings)) refuse("two strings that become one string");
    if (!distinct(sentencePcs)) refuse("two notes that become one note");
  } catch (error) {
    if (error instanceof Refuse) return { ok: false, reason: error.message };
    throw error;
  }

  // Apply the edits from the right, and agree "a" or "an" with what follows it.
  let out = sentence;
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
    if (edit.article) {
      // Never a capital "A": before a number or a letter that is a string or a note ("A 5, 7, 8"), not an article.
      const before = /(^|[^A-Za-z])(a|an|An) $/.exec(out.slice(0, edit.start));
      const quoted = toks.find((t) => t.end === edit.start - 1 && t.quoted);
      if (before && !quoted) {
        const was = before[2];
        const want = needsAn(edit.text) ? "an" : "a";
        const article = was[0] === "A" ? want[0].toUpperCase() + want.slice(1) : want;
        const from = edit.start - 1 - was.length;
        // Only where it was an article: "a" before a letter or a number that took one.
        if (needsAn(sentence.slice(edit.start, edit.end)) === (was.toLowerCase() === "an")) out = out.slice(0, from) + article + out.slice(from + was.length);
      }
    }
  }
  return { ok: true, text: out, counting, specific, placed: [...placed] };
}

function sentenceSlice(sentence: string, from: Tok, to: Tok): string {
  return sentence.slice(from.start, to.end);
}

function caseLike(word: string, like: string): string {
  return /^[A-Z]/.test(like) ? word[0].toUpperCase() + word.slice(1) : word;
}

// ---------------------------------------------------------------------------
// A text, and a variant
// ---------------------------------------------------------------------------

/** Sentences, each with the space that followed it left off. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.?!])\s+(?=[A-Z0-9'"(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type TextResult = { text: string | null; firstRefused: boolean };

const ON_STRING = /^On the ((?:low |top |high )?[A-G]) string,? (.+)\.$/;

/**
 * Sentences next to each other that say the same thing of different strings become one: "On the A string
 * the fretted note is at fret 2. On the D string it is at fret 2." reads "On the A and D strings the fretted
 * note is at fret 2." The later sentence may name the subject again or say "it"; anything else that differs
 * keeps the sentences apart.
 */
export function mergeSameFacts(sentences: readonly string[]): string[] {
  const out: string[] = [];
  let run: { strings: string[]; fact: string; sentence: string } | null = null;
  const flush = () => {
    if (!run) return;
    const [first, ...rest] = run.strings;
    out.push(
      rest.length === 0
        ? run.sentence
        : `On the ${[first, ...rest.slice(0, -1)].join(", ")} and ${rest[rest.length - 1]} strings ${run.fact}.`,
    );
    run = null;
  };
  for (const sentence of sentences) {
    const m = ON_STRING.exec(sentence);
    if (!m) {
      flush();
      out.push(sentence);
      continue;
    }
    const [, name, fact] = m;
    const sameFact = (said: string, before: string): boolean => {
      if (said === before) return true;
      // "it is at fret 2" after "the fretted note is at fret 2": the subject, said again as "it".
      const pronoun = /^it (.+)$/.exec(said);
      if (!pronoun) return false;
      const subject = before.slice(0, before.length - pronoun[1].length).trim();
      return before.endsWith(" " + pronoun[1]) && /^the [a-z ]+$/.test(subject);
    };
    if (run && !run.strings.includes(name) && sameFact(fact, run.fact)) {
      run.strings.push(name);
      continue;
    }
    flush();
    // A sentence that begins a run keeps its own words until a second string joins it.
    if (/^it /.test(fact)) {
      out.push(sentence);
      continue;
    }
    run = { strings: [name], fact, sentence };
  }
  flush();
  return out;
}

function rewriteText(text: string, where: string, ctx: Ctx, refusals: Refusal[]): TextResult {
  const kept: string[] = [];
  // The notes this text has put at a place so far (see `rewriteSentence`): "Bar 2: ... then D held" is the
  // D the sentence before put at fret 3. Not carried from one how-to line to the next.
  const placed = new Set<number>();
  let counting = false;
  const sentences = sentencesOf(text);
  for (let i = 0; i < sentences.length; i += 1) {
    const result = rewriteSentence(sentences[i], ctx, counting, placed);
    if (!result.ok) {
      refusals.push({ where, sentence: sentences[i], reason: result.reason });
      for (const later of sentences.slice(i + 1)) refusals.push({ where, sentence: later, reason: "after a sentence that was not written" });
      return { text: kept.length ? mergeSameFacts(kept).join(" ") : null, firstRefused: i === 0 };
    }
    counting = counting || !!result.counting;
    for (const pc of result.placed ?? []) placed.add(pc);
    kept.push(result.text);
  }
  return { text: mergeSameFacts(kept).join(" "), firstRefused: false };
}

function ctxOf(exercise: ExerciseText, variant: TextSide, move: Move): Ctx {
  const pcShift = move.pcShift;
  return {
    ex: exercise,
    v: variant,
    move,
    all: [exercise.purpose, ...exercise.howTo].join(" "),
    exFrets: new Set(exercise.notes.map((n) => n.fret)),
    exStrings: new Set(exercise.notes.map((n) => n.string)),
    exPcs: new Set(exercise.notes.map((n) => pcOf(n.midi))),
    movedBy: pcShift !== null && pcShift !== 0 && declarationsMoved(exercise, variant, pcShift) ? pcShift : null,
    sameDeclared: declarationsMoved(exercise, variant, 0),
    qualities: sameQualities(exercise, variant),
  };
}

/** One cue said for one variant: its words for those notes, or why it cannot be said there. */
export type CueText = { ok: true; text: string } | { ok: false; reason: string };

/**
 * Cues (`Exercise.cues[].say`) said again for a variant's notes, by the same
 * rules as the how-to: every fret, string, note and finger a cue names must
 * be true of the Exercise's own notes and must move to one place in the
 * variant's. A cue that names nothing specific ("Count every note out loud.")
 * is the same for every variant, even one whose notes do not line up; one
 * that names something is refused there. Each sentence of a cue must be
 * written, or the whole cue is refused: half an order is not an order.
 *
 * Called with the Exercise as its own variant it says which cues name
 * something the Exercise does not play (the validator's `cue.specific`).
 */
export function cueTexts(exercise: ExerciseText, variant: TextSide, says: readonly string[]): CueText[] {
  const move = moveOf(exercise, variant);
  const own = moveOf(exercise, exercise);
  const ctx = move ? ctxOf(exercise, variant, move) : null;
  const ownCtx = own ? ctxOf(exercise, exercise, own) : null;
  return says.map((say): CueText => {
    const sentences = sentencesOf(say);
    if (sentences.length === 0) return { ok: false, reason: "no words" };
    const out: string[] = [];
    let counting = false;
    let placed = new Set<number>();
    for (const sentence of sentences) {
      if (ctx) {
        const written = rewriteSentence(sentence, ctx, counting, placed);
        if (!written.ok) return { ok: false, reason: written.reason };
        counting = counting || !!written.counting;
        placed = new Set(written.placed);
        out.push(written.text);
        continue;
      }
      // Notes that do not line up: only a sentence that names nothing of them is still true.
      const checked = ownCtx ? rewriteSentence(sentence, ownCtx, counting) : null;
      if (!checked || !checked.ok) return { ok: false, reason: checked && !checked.ok ? checked.reason : "no notes" };
      if (checked.specific) return { ok: false, reason: "the notes do not line up with the Exercise's one to one" };
      counting = counting || !!checked.counting;
      out.push(sentence);
    }
    return { ok: true, text: out.join(" ") };
  });
}

export function describeVariant(exercise: ExerciseText, variant: TextSide): VariantDescription {
  const refusals: Refusal[] = [];
  const none = (reason?: string): VariantDescription => {
    if (reason) refusals.push({ where: "variant", sentence: "", reason });
    return { text: null, howToFrom: [], refusals };
  };
  const move = moveOf(exercise, variant);
  if (!move) return none("the notes do not line up with the Exercise's one to one");
  const ctx = ctxOf(exercise, variant, move);

  const purpose = rewriteText(exercise.purpose, "purpose", ctx, refusals);
  // A purpose that names the wrong frets must keep its disclaimer: no text at all.
  if (purpose.firstRefused || purpose.text === null || purpose.text.trim().length < 20) return none();

  const howTo: string[] = [];
  const howToFrom: number[] = [];
  exercise.howTo.forEach((line, index) => {
    if (DISCLAIMER.test(line)) return;
    const result = rewriteText(line, `howTo.${index}`, ctx, refusals);
    if (result.text === null || !result.text.trim()) return;
    howTo.push(result.text);
    howToFrom.push(index);
  });
  // Nothing left, or next to nothing ("Sixteenths."): the Exercise's how-to says more, and it stays.
  if (howTo.length === 0 || howTo.join(" ").trim().length < 20) return none();

  const text: VariantText = {};
  if (purpose.text !== exercise.purpose) text.purpose = purpose.text;
  if (howTo.length !== exercise.howTo.length || howTo.some((line, i) => line !== exercise.howTo[i])) text.howTo = howTo;
  if (text.purpose === undefined && text.howTo === undefined) return { text: null, howToFrom: [], refusals };
  return { text, howToFrom: text.howTo ? howToFrom : [], refusals };
}

/** A variant's own purpose and how-to, or null: it reads the Exercise's. */
export function variantText(exercise: ExerciseText, variant: TextSide): VariantText | null {
  return describeVariant(exercise, variant).text;
}
