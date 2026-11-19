/**
 * The words for a line moved to another key, made from that key's own tab and
 * chart, so they cannot name another key's frets.
 *
 * The harmony Paths move one written line along the neck (`inKeys`). The
 * Exercise's how-to is written by hand for the first key; every later key gets
 * its lines after the tempo sentence from here. They say only what is true of
 * that key by itself, never how far it is from a key the player is not looking
 * at, and every shape has its chord's name:
 *
 *   "In E, on the G, B and top strings: E is 9, 9, 7. C sharp minor is 9, 9, 9.
 *    A is 9, 10, 9. B is 8, 7, 7."
 *
 * A chord that comes back gets a second line with the form by chord names
 * ("The form is four bars of E, two of A, ..."); a long form whose chords move
 * to a second place is said four bars at a time, a line for each four; a
 * single-note line says where each chord starts.
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
  /** Frets from the written line. Not said; with `home` it proves `key` is the key the line landed in. */
  shift: number;
  /** The key the written line is in. */
  home: string;
  /**
   * What each four bars is called, where the Exercise's own text names them:
   * `["the verse", "the verse", "the chorus", "the chorus"]`. Only a form said
   * four bars at a time uses them.
   */
  parts?: readonly string[];
};

const NUMBERS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen"];
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

const capital = (words: string) => `${words[0].toUpperCase()}${words.slice(1)}`;

/** "the G, B and top strings". */
function stringsWords(strings: readonly number[]): string {
  return `the ${listWords(strings.map((s) => STRING_NAMES[s].replace(/ string$/, "")))} strings`;
}

/** One bar of a line of shapes: its chord, said, and the shape it holds. */
type ShapeBar = { name: string; shape: Shape; id: string };
type Run = { bar: ShapeBar; bars: number };

/** Bars that follow each other with the same chord in the same place, as one. */
function runsOf(bars: readonly ShapeBar[]): Run[] {
  const runs: Run[] = [];
  for (const bar of bars) {
    const last = runs[runs.length - 1];
    if (last && last.bar.id === bar.id) last.bars += 1;
    else runs.push({ bar, bars: 1 });
  }
  return runs;
}

/**
 * The form by chord names, for a line whose chords come back: "The four bars
 * are E, A, B and E." where every chord has one bar, and otherwise bars
 * counted, "The form is four bars of E, two of A, two of E, then one bar each
 * of B, A, E and B."
 */
function formWords(runs: readonly Run[]): string | null {
  const total = runs.reduce((sum, run) => sum + run.bars, 0);
  if (total >= NUMBERS.length || runs.length < 2) return null;
  if (runs.every((run) => run.bars === 1)) return `The ${NUMBERS[total]} bars are ${listWords(runs.map((run) => run.bar.name))}.`;
  const parts: string[] = [];
  let counted = false;
  for (let i = 0; i < runs.length; ) {
    let end = i;
    while (end < runs.length && runs[end].bars === 1) end += 1;
    if (end - i >= 2) {
      parts.push(`one bar each of ${listWords(runs.slice(i, end).map((run) => run.bar.name))}`);
      i = end;
      continue;
    }
    const { bar, bars } = runs[i];
    parts.push(`${NUMBERS[bars]}${counted ? "" : bars === 1 ? " bar" : " bars"} of ${bar.name}`);
    counted = true;
    i += 1;
  }
  return `The form is ${parts.slice(0, -1).join(", ")}, then ${parts[parts.length - 1]}.`;
}

const SECTION_BARS = 4;

/**
 * A line of shapes. Every sentence about a shape names its chord: "E is 9, 9,
 * 7." The strings are said once ahead of the frets where a whole part is on
 * the same ones ("on the G, B and top strings"), so a chord called B is never
 * beside a string called B; where the strings change inside a part, each shape
 * names its own ("D string 3, G string 2, B string 1") when they are not the
 * ones just said.
 */
function shapesLines(args: KeyLine, key: string, chords: readonly string[], tabBars: NonNullable<ReturnType<typeof barsOf>>): string[] | null {
  const bars: ShapeBar[] = [];
  for (let i = 0; i < tabBars.length; i += 1) {
    const shape = shapeOf(tabBars[i]);
    const name = chordWords(chords[i]);
    if (!shape || name === null) return null;
    bars.push({ name, shape, id: `${name}@${shape.strings.join(",")}:${shape.frets.join(",")}` });
  }

  // The strings last said, and the shapes already said.
  let named: readonly number[] | null = null;
  const said = new Set<string>();
  const fretsOf = (shape: Shape, withStrings: boolean) =>
    shape.frets.map((fret, i) => (withStrings ? `${STRING_NAMES[shape.strings[i]]} ${fret}` : `${fret}`)).join(", ");
  /**
   * One part: what it is ("In E", "bars 5 to 8"), its strings where they are
   * one set and not the set just said, then a sentence a chord. `withBars`
   * says "for two bars" where a chord is held; a form sentence says it instead
   * when the chords come back.
   */
  const part = (label: readonly string[], runs: readonly Run[], withBars: boolean): string => {
    const oneSet = runs.every((run) => same(run.bar.shape.strings, runs[0].bar.shape.strings));
    const head = [...label];
    if (oneSet && (named === null || !same(named, runs[0].bar.shape.strings))) head.push(`on ${stringsWords(runs[0].bar.shape.strings)}`);
    if (oneSet) named = runs[0].bar.shape.strings;
    const sentences = runs.map(({ bar, bars: held }) => {
      const withStrings = !oneSet && (named === null || !same(named, bar.shape.strings));
      named = bar.shape.strings;
      const before = said.has(bar.id) ? ", as before" : "";
      said.add(bar.id);
      const length = withBars && held > 1 ? `, for ${NUMBERS[held]} bars` : "";
      return `${bar.name} is ${fretsOf(bar.shape, withStrings)}${before}${length}.`;
    });
    return `${capital(head.join(", "))}: ${sentences.join(" ")}`;
  };

  // A few chords, each in one place: say each once, and the form when a chord comes back.
  const places = new Map<string, Set<string>>();
  for (const bar of bars) places.set(bar.name, (places.get(bar.name) ?? new Set()).add(bar.id));
  if (places.size <= SECTION_BARS && [...places.values()].every((ids) => ids.size === 1)) {
    const runs = runsOf(bars);
    const comesBack = runs.length > places.size;
    const first = runs.filter((run, i) => runs.findIndex((r) => r.bar.id === run.bar.id) === i);
    const shapes = part([`In ${key}`], first, !comesBack);
    if (!comesBack) return [shapes];
    const form = formWords(runs);
    return form === null ? null : [shapes, form];
  }

  // A longer form, or a chord played in two places: four bars at a time, a line each.
  if (bars.length % SECTION_BARS !== 0) return null;
  const count = bars.length / SECTION_BARS;
  if (args.parts && args.parts.length !== count) {
    throw new Error(`keyLines: ${args.parts.length} parts named for ${count} sections of ${SECTION_BARS} bars`);
  }
  const span = (section: number) => `bars ${section * SECTION_BARS + 1} to ${(section + 1) * SECTION_BARS}`;
  const lines: string[] = [];
  const firstWith = new Map<string, number>();
  let partName: string | undefined;
  let reach: { low: number; high: number } | null = null;
  for (let section = 0; section < count; section += 1) {
    const own = bars.slice(section * SECTION_BARS, (section + 1) * SECTION_BARS);
    const signature = own.map((bar) => bar.id).join("|");
    const earlier = firstWith.get(signature);
    const name = args.parts?.[section];
    if (earlier !== undefined) {
      // Said already: point at it. The line before this one is where it belongs.
      const again = earlier === section - 1 ? "are the same" : `are ${span(earlier)} again`;
      lines[lines.length - 1] += ` ${capital(span(section))} ${again}.`;
      partName = name;
      continue;
    }
    firstWith.set(signature, section);
    const frets = own.flatMap((bar) => bar.shape.frets);
    const low = Math.min(...frets);
    const high = Math.max(...frets);
    const label: string[] = [];
    if (section === 0) label.push(`In ${key}`);
    if (name !== undefined && name !== partName) label.push(name);
    if (count > 1) label.push(span(section));
    if (reach && low > reach.low && high > reach.high) label.push("higher on the neck");
    if (reach && low < reach.low && high < reach.high) label.push("lower on the neck");
    partName = name;
    reach = { low, high };
    lines.push(part(label, runsOf(own), true));
  }
  return lines;
}

/**
 * A single-note line: where each chord starts. "In E flat, each chord starts
 * on the D string: E flat at fret 13, C minor at fret 10, A flat at fret 6 and
 * B flat at fret 8." Where they start on different strings every chord has its
 * string beside it, so a chord called A is never taken for the A string: "In
 * B: B major seven starts on the D string at fret 9, G sharp minor seven on
 * the G string at fret 8, ..." A chord held for two bars is said once, at its
 * first bar.
 */
function singleLines(key: string, chords: readonly string[], tabBars: NonNullable<ReturnType<typeof barsOf>>): string[] | null {
  const starts: Array<{ name: string; string: number; fret: number }> = [];
  for (let i = 0; i < chords.length; i += 1) {
    if (i > 0 && chords[i] === chords[i - 1]) continue;
    const name = chordWords(chords[i]);
    const first = tabBars[i][0];
    if (name === null || !first || first.fret <= 0 || !STRING_NAMES[first.string]) return null;
    starts.push({ name, string: first.string, fret: first.fret });
  }
  if (starts.length > 1 && starts.every((start) => start.string === starts[0].string)) {
    const frets = starts.map((start) => `${start.name} at fret ${start.fret}`);
    return [`In ${key}, each chord starts on the ${STRING_NAMES[starts[0].string]}: ${listWords(frets)}.`];
  }
  const places = starts.map((start, i) => `${start.name}${i === 0 ? " starts" : ""} on the ${STRING_NAMES[start.string]} at fret ${start.fret}`);
  return [`In ${key}: ${listWords(places)}.`];
}

/**
 * The how-to lines of a line in another key, after the tempo sentence. Null
 * when they cannot be said truthfully: an unknown chord, a bar that is not one
 * shape, an open string, a chart that is not one chord a bar.
 *
 * Throws when `home` and `shift` do not lead to `key`: that is a mistake in the
 * spec, and the lines would name the wrong key.
 */
export function keyLines(args: KeyLine): string[] | null {
  const key = keyWords(args.key);
  const home = keyWords(args.home);
  if (key === null || home === null) return null;
  const root = (k: string) => pitchClass(k.trim().split(" ")[0]);
  const minor = (k: string) => / minor$/.test(k.trim());
  if ((((root(args.home) + args.shift) % 12) + 12) % 12 !== root(args.key) || minor(args.home) !== minor(args.key)) {
    throw new Error(`keyLines: ${args.home} moved ${args.shift} frets is not ${args.key}`);
  }
  const chords = args.chords.split("|").map((c) => c.trim()).filter(Boolean);
  const bars = barsOf(args.tab);
  if (!bars || bars.length !== chords.length || bars.some((bar) => bar.length === 0)) return null;
  return args.kind === "shapes" ? shapesLines(args, key, chords, bars) : singleLines(key, chords, bars);
}

/**
 * A key's own how-to: the Exercise's first line (its tempo sentence) kept as it
 * is, then this key's lines. Without lines to say, the Exercise's own how-to,
 * which the generator then does not write a second time.
 */
export function keyHowTo(args: KeyLine): NonNullable<VariantBuild["howTo"]> {
  const lines = keyLines(args);
  return (exerciseHowTo) => (lines === null || exerciseHowTo.length === 0 ? [...exerciseHowTo] : [exerciseHowTo[0], ...lines]);
}
