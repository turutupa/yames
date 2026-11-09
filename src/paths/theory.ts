/**
 * Note names and spelling, on top of the theory the app already has.
 *
 * `src/jam/scales.ts` and `src/jam/harmony.ts` own which pitch classes are in a
 * scale or a chord, and this module does not hold a second opinion about that.
 * What they do not have is SPELLING: they name a pitch class with a key-wide
 * sharp or flat preference, which is right for a chord sheet and wrong for a
 * lesson that has to say Eb in A blues and G# in E7. So the one thing here is a
 * table of letter offsets per scale and chord, and `spellScale` then checks
 * itself against the jam data.
 */
import { chordIntervals, chordNotes, nameToPitchClass, parseChordName } from "../jam/harmony";
import type { Chord, ChordQuality } from "../jam/harmony";
import { SCALES, scaleNotes } from "../jam/scales";
import type { ScaleId } from "../jam/scales";

const LETTERS = ["C", "D", "E", "F", "G", "A", "B"] as const;
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11] as const;

/** Letters above the root, per interval of the scale in `SCALES`. */
const SCALE_LETTER_OFFSETS: Partial<Record<ScaleId, readonly number[]>> = {
  major: [0, 1, 2, 3, 4, 5, 6],
  naturalMinor: [0, 1, 2, 3, 4, 5, 6],
  harmonicMinor: [0, 1, 2, 3, 4, 5, 6],
  dorian: [0, 1, 2, 3, 4, 5, 6],
  mixolydian: [0, 1, 2, 3, 4, 5, 6],
  minorPentatonic: [0, 2, 3, 4, 6],
  majorPentatonic: [0, 1, 2, 4, 5],
  // The flat five is a flat five: A C D Eb E G, whatever a chord sheet says.
  blues: [0, 2, 3, 4, 4, 6],
  majorBlues: [0, 1, 2, 2, 4, 5],
};

const CHORD_LETTER_OFFSETS: Partial<Record<ChordQuality, readonly number[]>> = {
  maj: [0, 2, 4],
  min: [0, 2, 4],
  dim: [0, 2, 4],
  aug: [0, 2, 4],
  "5": [0, 4],
  "7": [0, 2, 4, 6],
  maj7: [0, 2, 4, 6],
  m7: [0, 2, 4, 6],
  m7b5: [0, 2, 4, 6],
  dim7: [0, 2, 4, 6],
};

export function pcOfName(name: string): number {
  const pc = nameToPitchClass(name);
  if (pc === null) throw new Error(`not a note name: ${name}`);
  return pc;
}

/** The letter in the root, then an accidental that lands on the pitch class. */
function spell(root: string, intervals: readonly number[], offsets: readonly number[]): string[] {
  const rootLetter = LETTERS.indexOf(root[0].toUpperCase() as (typeof LETTERS)[number]);
  if (rootLetter < 0) throw new Error(`not a note name: ${root}`);
  const rootPc = pcOfName(root);
  return intervals.map((interval, index) => {
    const letter = (rootLetter + offsets[index]) % 7;
    const wanted = (rootPc + interval) % 12;
    let delta = (wanted - LETTER_PC[letter] + 12) % 12;
    if (delta > 6) delta -= 12;
    const accidental = delta >= 0 ? "#".repeat(delta) : "b".repeat(-delta);
    return `${LETTERS[letter]}${accidental}`;
  });
}

export function scaleIsKnown(scale: string): scale is ScaleId {
  return scale in SCALES;
}

export function canSpellScale(scale: string): boolean {
  return scaleIsKnown(scale) && SCALE_LETTER_OFFSETS[scale] !== undefined;
}

export function spellScale(root: string, scale: ScaleId): string[] {
  const offsets = SCALE_LETTER_OFFSETS[scale];
  if (!offsets) throw new Error(`no spelling table for scale ${scale}`);
  return spell(root, SCALES[scale].intervals, offsets);
}

export function scalePcs(root: string, scale: ScaleId): number[] {
  return scaleNotes(pcOfName(root), scale);
}

/** The root as written in a symbol: "Bb" in "Bbm7". */
export function chordRootName(symbol: string): string {
  const match = /^[A-Ga-g][#b]?/.exec(symbol.trim());
  if (!match) throw new Error(`no root in chord symbol: ${symbol}`);
  return match[0][0].toUpperCase() + match[0].slice(1);
}

export function parseChord(symbol: string): Chord | null {
  return parseChordName(symbol);
}

export function chordPcs(symbol: string): number[] {
  const chord = parseChordName(symbol);
  if (!chord) throw new Error(`not a chord symbol: ${symbol}`);
  return chordNotes(chord);
}

export function spellChord(symbol: string): string[] {
  const chord = parseChordName(symbol);
  if (!chord) throw new Error(`not a chord symbol: ${symbol}`);
  const offsets = CHORD_LETTER_OFFSETS[chord.quality];
  if (!offsets) throw new Error(`no spelling table for chord quality ${chord.quality}`);
  return spell(chordRootName(symbol), chordIntervals(chord.quality), offsets);
}

/** Guide tones: third and seventh, the two notes that define a dominant. */
export function guideTones(symbol: string): string[] {
  const spelled = spellChord(symbol);
  if (spelled.length < 4) throw new Error(`no seventh in ${symbol}`);
  return [spelled[1], spelled[3]];
}
