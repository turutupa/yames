/**
 * The words for a line moved to another key, made from that key's own tab and
 * chart, so they cannot name another key's frets.
 *
 * The harmony Paths move one written line along the neck (`inKeys`). The
 * Exercise's how-to is written by hand for the first key; every later key gets
 * its second line from here, in the same voice: "In E: G string 9, B string 9,
 * top string 7; then 9, 9, 9; then 9, 10, 9; then 8, 7, 7."
 *
 * A sentence that is wrong is worse than none, so everything here answers null
 * when a line is not what it knows how to describe, and the variant then reads
 * the Exercise's own text, as it did before.
 */
import { STANDARD_TUNING, barLengthTicks } from "../format";
import type { VariantBuild } from "../spec";
import { parseTab } from "../tabDsl";

/**
 * `shapes`: every bar holds one shape, three or four strings with one fret
 * each, rolled or swept. `line`: single notes that move; an arpeggio played
 * once through is a line, even where a bar happens to use each string once.
 */
export type KeyLineKind = "shapes" | "line";

export type KeyLine = {
  kind: KeyLineKind;
  /** The key as the variant is named: "E", "Bb", "D minor". */
  key: string;
  /** This key's tab: the written line already moved. */
  tab: string;
  /** This key's chart, one symbol a bar: "E | C#m | A | B". */
  chords: string;
  /** Frets from the written line. */
  shift: number;
  /** The key the written line is in. */
  home: string;
};

const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];
const STRING_NAMES: Record<number, string> = {
  1: "top string",
  2: "B string",
  3: "G string",
  4: "D string",
  5: "A string",
  6: "low E string",
};
const PITCH: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES: Record<string, string> = {
  "": "",
  m: " minor",
  dim: " diminished",
  "7": " seven",
  maj7: " major seven",
  m7: " minor seven",
  m7b5: " half-diminished",
};

/** "F#" as "F sharp", "Bb" as "B flat". Null: not a note name. */
function rootWords(root: string): string | null {
  const match = /^([A-G])([#b]?)$/.exec(root);
  if (!match) return null;
  return `${match[1]}${match[2] === "#" ? " sharp" : match[2] === "b" ? " flat" : ""}`;
}

function pitchClass(root: string): number {
  return (PITCH[root[0]] + (root[1] === "#" ? 1 : root[1] === "b" ? 11 : 0)) % 12;
}

/** A chord symbol as the Paths say it: "C#m" is "C sharp minor", "Em7b5" is "E half-diminished". */
export function chordWords(symbol: string): string | null {
  const match = /^([A-G][#b]?)(.*)$/.exec(symbol.trim());
  if (!match) return null;
  const root = rootWords(match[1]);
  const quality = QUALITIES[match[2]];
  return root === null || quality === undefined ? null : `${root}${quality}`;
}

/** A key as the Paths say it: "Bb" is "B flat", "F# minor" is "F sharp minor". */
export function keyWords(key: string): string | null {
  const match = /^([A-G][#b]?)( minor)?$/.exec(key.trim());
  if (!match) return null;
  const root = rootWords(match[1]);
  return root === null ? null : `${root}${match[2] ?? ""}`;
}

/** "two frets higher", "one fret lower". */
function distanceWords(shift: number): string | null {
  const by = Math.abs(shift);
  if (by === 0 || by >= NUMBERS.length) return null;
  return `${NUMBERS[by]} fret${by === 1 ? "" : "s"} ${shift > 0 ? "higher" : "lower"}`;
}

/** "E, C sharp minor, A and B". */
function listWords(items: readonly string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

type Shape = { strings: number[]; frets: number[] };

/** The notes of each bar, as (string, fret) pairs in the order played. */
function barsOf(tab: string): Array<Array<{ string: number; fret: number }>> | null {
  const barTicks = barLengthTicks({ numerator: 4, denominator: 4 });
  let parsed;
  try {
    parsed = parseTab(tab, STANDARD_TUNING, barTicks);
  } catch {
    return null;
  }
  const count = Math.max(1, Math.ceil(parsed.totalTicks / barTicks));
  const bars: Array<Array<{ string: number; fret: number }>> = Array.from({ length: count }, () => []);
  for (const note of parsed.notes) bars[Math.floor(note.tick / barTicks)]?.push({ string: note.string, fret: note.fret });
  return bars;
}

/** A bar as one shape, low string first. Null when a string plays two frets, or it is not three or four fretted strings. */
function shapeOf(bar: ReadonlyArray<{ string: number; fret: number }>): Shape | null {
  const held = new Map<number, number>();
  for (const note of bar) {
    if (held.has(note.string) && held.get(note.string) !== note.fret) return null;
    held.set(note.string, note.fret);
  }
  const strings = [...held.keys()].sort((a, b) => b - a);
  if (strings.length < 3 || strings.length > 4) return null;
  const frets = strings.map((s) => held.get(s)!);
  // An open string has no fret to name, and none of these lines has one.
  if (frets.some((f) => f <= 0) || strings.some((s) => !STRING_NAMES[s])) return null;
  return { strings, frets };
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Shapes in words: "G string 9, B string 9, top string 7" where the strings
 * have to be said (the first shape, and any shape on other strings than the
 * one before it), "9, 9, 9" where they are the ones just named.
 */
function shapeWriter() {
  let named: readonly number[] | null = null;
  return (shape: Shape): string => {
    const withStrings = named === null || !same(named, shape.strings);
    named = shape.strings;
    return shape.frets.map((fret, i) => (withStrings ? `${STRING_NAMES[shape.strings[i]]} ${fret}` : `${fret}`)).join(", ");
  };
}

function shapesLine(args: KeyLine, key: string, chords: readonly string[], bars: NonNullable<ReturnType<typeof barsOf>>): string | null {
  const shapes: Shape[] = [];
  for (const bar of bars) {
    const shape = shapeOf(bar);
    if (!shape) return null;
    shapes.push(shape);
  }
  const names: string[] = [];
  for (const chord of chords) {
    const words = chordWords(chord);
    if (words === null) return null;
    names.push(words);
  }
  const idOf = (i: number) => `${chords[i]}@${shapes[i].strings.join(",")}:${shapes[i].frets.join(",")}`;
  const ids = shapes.map((_s, i) => idOf(i));
  const say = shapeWriter();

  // Every bar its own shape: say them in order.
  if (new Set(ids).size === ids.length) return `In ${key}: ${shapes.map(say).join("; then ")}.`;

  // Bars come back. If each chord has one shape, say each chord once, then the form.
  const shapeByChord = new Map<string, string>();
  const oneShapeEach = chords.every((chord, i) => {
    const id = ids[i];
    if (!shapeByChord.has(chord)) shapeByChord.set(chord, id);
    return shapeByChord.get(chord) === id;
  });
  if (oneShapeEach) {
    const first = chords.map((chord, i) => (chords.indexOf(chord) === i ? `${names[i]} is ${say(shapes[i])}.` : null));
    return `In ${key}: ${first.filter((s) => s !== null).join(" ")} The form is ${names.join(", ")}, one bar each.`;
  }

  // Bars come back and a chord is played in two places (a verse low, a chorus
  // high): no short sentence lists that truthfully, so say only what holds for
  // the whole line, how far it has moved and where it starts.
  const distance = distanceWords(args.shift);
  const home = keyWords(args.home);
  if (distance === null || home === null) return null;
  return `In ${key}, everything is ${distance} than in ${home}: the first shape is ${say(shapes[0])}.`;
}

function singleLine(args: KeyLine, key: string, chords: readonly string[], bars: NonNullable<ReturnType<typeof barsOf>>): string | null {
  const names: string[] = [];
  for (const chord of chords) {
    const words = chordWords(chord);
    if (words === null) return null;
    if (!names.includes(words)) names.push(words);
  }
  const first = bars[0]?.[0];
  const distance = distanceWords(args.shift);
  const home = keyWords(args.home);
  if (!first || first.fret <= 0 || !STRING_NAMES[first.string] || distance === null || home === null) return null;
  return `In ${key} the chords are ${listWords(names)}, and the line starts on the ${STRING_NAMES[first.string]} at fret ${first.fret}. Everything is ${distance} than in ${home}.`;
}

/**
 * The second how-to line of a line in another key. Null when it cannot be
 * said truthfully: an unknown chord, a bar that is not one shape, an open
 * string, a chart that is not one chord a bar.
 *
 * Throws when `home` and `shift` do not lead to `key`: that is a mistake in the
 * spec, and the sentence would name the wrong key.
 */
export function keyLine(args: KeyLine): string | null {
  const key = keyWords(args.key);
  const home = keyWords(args.home);
  if (key === null || home === null) return null;
  const root = (k: string) => pitchClass(k.trim().split(" ")[0]);
  const minor = (k: string) => / minor$/.test(k.trim());
  if ((((root(args.home) + args.shift) % 12) + 12) % 12 !== root(args.key) || minor(args.home) !== minor(args.key)) {
    throw new Error(`keyLine: ${args.home} moved ${args.shift} frets is not ${args.key}`);
  }
  const chords = args.chords.split("|").map((c) => c.trim()).filter(Boolean);
  const bars = barsOf(args.tab);
  if (!bars || bars.length !== chords.length || bars.some((bar) => bar.length === 0)) return null;
  return args.kind === "shapes" ? shapesLine(args, key, chords, bars) : singleLine(args, key, chords, bars);
}

/**
 * A key's own how-to: the Exercise's first line (its tempo sentence) kept as it
 * is, then this key's line. Without a line to say, the Exercise's own how-to,
 * which the generator then does not write a second time.
 */
export function keyHowTo(args: KeyLine): NonNullable<VariantBuild["howTo"]> {
  const line = keyLine(args);
  return (exerciseHowTo) => (line === null || exerciseHowTo.length === 0 ? [...exerciseHowTo] : [exerciseHowTo[0], line]);
}
