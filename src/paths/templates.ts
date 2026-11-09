/**
 * Parametric templates: "this picking pattern, across these strings, in these
 * positions and keys" as a function call instead of typed tab.
 *
 * Every template returns a tab in the notation of `tabDsl.ts`, so a spec can
 * mix generated and hand-written bars in one string and the pack keeps the
 * expanded tab beside the notes. All of them are pure: same arguments, same
 * tab. Pitches come from `src/jam/scales.ts` and `src/jam/harmony.ts`, never
 * from a table of frets, so a wrong shape is an impossible thing to type.
 */
import { STANDARD_TUNING } from "./format";
import { fretMm } from "./reach";
import { chordPcs, pcOfName, scalePcs } from "./theory";
import type { ScaleId } from "../jam/scales";

export type FretCell = { string: number; fret: number };

const open = (string: number) => STANDARD_TUNING[string - 1];
const token = (c: FretCell, suffix = "") => `${c.string}:${c.fret}${suffix}`;
const tokens = (cells: readonly FretCell[]) => cells.map((c) => token(c)).join(" ");

/** The same tab, `times` times, with an optional bar check between. */
export function repeat(cell: string, times: number, separator = " "): string {
  return Array.from({ length: times }, () => cell).join(separator);
}

/** Move every note of a tab up or down the neck, keeping suffixes. */
export function shiftFrets(tab: string, frets: number): string {
  return tab.replace(/(\d):(\d+)/g, (_all, string, fret) => {
    const moved = Number(fret) + frets;
    if (moved < 0) throw new Error(`shift of ${frets} takes fret ${fret} below the nut`);
    return `${string}:${moved}`;
  });
}

/** The same tab at several offsets: one pattern, in these positions or keys. */
export function inPositions(tab: string, offsets: readonly number[], separator = " | "): string {
  return offsets.map((offset) => shiftFrets(tab, offset)).join(separator);
}

/** A fret pattern played on each string in turn, optionally climbing the neck. */
export function acrossStrings(args: {
  /** Frets, relative to `fret`. */
  cell: readonly number[];
  strings: readonly number[];
  fret: number;
  /** Frets to move up per string. */
  climb?: number;
}): string {
  const { cell, strings, fret, climb = 0 } = args;
  return strings
    .map((string, index) => cell.map((f) => `${string}:${fret + f + climb * index}`).join(" "))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Pentatonic boxes
// ---------------------------------------------------------------------------

const MINOR_PENT_ON_LOW_E: readonly number[] = [0, 3, 5, 7, 10];

/**
 * Box `box` (1 to 5) of a minor pentatonic or blues scale, low string first.
 *
 * Box 1 starts on the root on the low E string; box N on the Nth scale tone
 * there. On every string the box is the two scale tones at or above one fret
 * under that start. That one rule gives the five shapes everybody knows, which
 * `templates.test.ts` pins against them. The blues scale adds its flat five
 * wherever it falls inside the box's frets.
 */
export function boxCells(root: string, box: number, scale: "minorPentatonic" | "blues"): FretCell[] {
  if (box < 1 || box > 5) throw new Error(`no box ${box}`);
  const rootPc = pcOfName(root);
  const rootFret = (rootPc - open(6) + 120) % 12;
  const start = rootFret + MINOR_PENT_ON_LOW_E[box - 1];
  const pent = new Set(scalePcs(root, "minorPentatonic"));
  const shape = new Map<number, number[]>();
  let lowest = Infinity;
  let highest = -Infinity;
  for (let string = 6; string >= 1; string -= 1) {
    const frets: number[] = [];
    for (let fret = Math.max(0, start - 1); frets.length < 2; fret += 1) {
      if (pent.has((open(string) + fret) % 12)) frets.push(fret);
    }
    shape.set(string, frets);
    lowest = Math.min(lowest, frets[0]);
    highest = Math.max(highest, frets[1]);
  }
  if (scale === "blues") {
    const flatFive = (rootPc + 6) % 12;
    for (let string = 6; string >= 1; string -= 1) {
      for (let fret = lowest; fret <= highest; fret += 1) {
        if ((open(string) + fret) % 12 === flatFive) {
          const frets = shape.get(string)!;
          frets.push(fret);
          frets.sort((a, b) => a - b);
        }
      }
    }
  }
  const cells: FretCell[] = [];
  for (let string = 6; string >= 1; string -= 1) {
    for (const fret of shape.get(string)!) cells.push({ string, fret });
  }
  return cells;
}

export type Sequence =
  | "up"
  | "down"
  | "updown"
  | "threesUp"
  | "threesDown"
  | "foursUp"
  | "foursDown";

/** Walk an ascending list of cells in a practice sequence. */
export function sequenced(cells: readonly FretCell[], sequence: Sequence): FretCell[] {
  const reversed = [...cells].reverse();
  const groups = (list: readonly FretCell[], size: number) => {
    const out: FretCell[] = [];
    for (let i = 0; i + size <= list.length; i += 1) out.push(...list.slice(i, i + size));
    return out;
  };
  switch (sequence) {
    case "up":
      return [...cells];
    case "down":
      return reversed;
    case "updown":
      return [...cells, ...reversed.slice(1, -1)];
    case "threesUp":
      return groups(cells, 3);
    case "threesDown":
      return groups(reversed, 3);
    case "foursUp":
      return groups(cells, 4);
    case "foursDown":
      return groups(reversed, 4);
  }
}

/** A box in a sequence, as tab. `strings` limits it, in low-to-high order. */
export function pentatonic(args: {
  root: string;
  box: number;
  scale?: "minorPentatonic" | "blues";
  sequence: Sequence;
  strings?: readonly number[];
}): string {
  const { root, box, scale = "minorPentatonic", sequence, strings } = args;
  const cells = boxCells(root, box, scale).filter((c) => !strings || strings.includes(c.string));
  return tokens(sequenced(cells, sequence));
}

// ---------------------------------------------------------------------------
// Three notes per string
// ---------------------------------------------------------------------------

/** Scale tones, three to a string, starting from a note on the lowest string. */
export function threeNpsCells(args: {
  root: string;
  scale: ScaleId;
  string: number;
  fret: number;
  strings: number;
}): FretCell[] {
  const { root, scale, string, fret, strings } = args;
  const pcs = new Set(scalePcs(root, scale));
  let midi = open(string) + fret;
  if (!pcs.has(midi % 12)) throw new Error(`${string}:${fret} is not in ${root} ${scale}`);
  const cells: FretCell[] = [];
  for (let s = string; s > string - strings; s -= 1) {
    for (let i = 0; i < 3; i += 1) {
      const onString = midi - open(s);
      if (onString < 0) throw new Error(`three-per-string fell below the nut on string ${s}`);
      cells.push({ string: s, fret: onString });
      midi += 1;
      while (!pcs.has(midi % 12)) midi += 1;
    }
  }
  return cells;
}

export function threeNps(args: {
  root: string;
  scale: ScaleId;
  string: number;
  fret: number;
  strings: number;
  sequence: Sequence;
}): string {
  const { sequence, ...rest } = args;
  return tokens(sequenced(threeNpsCells(rest), sequence));
}

// ---------------------------------------------------------------------------
// Sweeps
// ---------------------------------------------------------------------------

/**
 * A stacked arpeggio across strings: the chord tone nearest `near` on the first
 * string, then the next chord tone up on each string after it.
 *
 * `doubleLow` plays two chord tones on the first string, as the five-string
 * minor shape does. `top` adds the next chord tone on the top string.
 */
export function arpeggioCells(args: {
  chord: string;
  strings: readonly number[];
  near: number;
  doubleLow?: boolean;
  top?: boolean;
}): { up: FretCell[]; top: FretCell | null; low: FretCell | null } {
  const { chord, strings, near, doubleLow = false, top = false } = args;
  const pcs = new Set(chordPcs(chord));
  const first = strings[0];
  let bestFret = -1;
  for (let fret = 0; fret <= 22; fret += 1) {
    if (!pcs.has((open(first) + fret) % 12)) continue;
    if (bestFret < 0 || Math.abs(fret - near) < Math.abs(bestFret - near)) bestFret = fret;
  }
  const nextAbove = (midi: number) => {
    let next = midi + 1;
    while (!pcs.has(next % 12)) next += 1;
    return next;
  };
  const up: FretCell[] = [{ string: first, fret: bestFret }];
  let midi = open(first) + bestFret;
  let low: FretCell | null = null;
  if (doubleLow) {
    midi = nextAbove(midi);
    low = { string: first, fret: midi - open(first) };
  }
  for (const string of strings.slice(1)) {
    midi = nextAbove(midi);
    const fret = midi - open(string);
    if (fret < 0) throw new Error(`${chord} falls below the nut on string ${string}`);
    up.push({ string, fret });
  }
  let topCell: FretCell | null = null;
  if (top) {
    midi = nextAbove(midi);
    topCell = { string: strings[strings.length - 1], fret: midi - open(strings[strings.length - 1]) };
  }
  return { up, top: topCell, low };
}

export type SweepArgs = {
  chord: string;
  strings: readonly number[];
  near: number;
  doubleLow?: boolean;
  /** Slide to the top note and back, for a reach no hand spans at this fret. */
  slideTop?: boolean;
};

/** One way up the shape, no turnaround: toward the higher strings. */
export function sweepUp(args: SweepArgs): string {
  const { up, low } = arpeggioCells({ ...args });
  const [first, ...rest] = up;
  return [token(first), ...(low ? [token(low, "h")] : []), ...rest.map((c) => token(c))].join(" ");
}

/** One way down the shape: from the top string back to the lowest. */
export function sweepDown(args: SweepArgs): string {
  const { up, low } = arpeggioCells({ ...args });
  const reversed = [...up].reverse();
  const cells = reversed.map((c) => token(c));
  if (low) {
    // The double on the low string is pulled off on the way down.
    return [...cells.slice(0, -1), token(low), token(up[0], "p")].join(" ");
  }
  return cells.join(" ");
}

/**
 * The whole loop: up, a hammer to the top note, a pull back, down, and round.
 * The note the loop returns to is not repeated: the last written note walks
 * into the first.
 */
export function sweepLoop(args: SweepArgs): string {
  const { slideTop = false, ...shape } = args;
  const { up, top, low } = arpeggioCells({ ...shape, top: true });
  if (!top) throw new Error("a loop needs a top note");
  // Too wide to hammer at the bottom: it slides there, and the return is picked.
  const slideLow = !!low && fretMm(low.fret) - fretMm(up[0].fret) > 85;
  const inner = up.slice(1, -1).map((c) => token(c));
  const last = up[up.length - 1];
  const back = up.slice(1, -1).reverse().map((c) => token(c));
  return [
    token(up[0], slideLow ? "s" : ""),
    ...(low ? [token(low, slideLow ? "" : "h")] : []),
    ...inner,
    token(last, slideTop ? "s" : ""),
    token(top, slideTop ? "s" : "h"),
    token(last, slideTop ? "" : "p"),
    ...back,
    ...(low ? [token(low)] : []),
  ].join(" ");
}

// ---------------------------------------------------------------------------
// Linked arpeggios
// ---------------------------------------------------------------------------

const ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"] as const;

/** A chord symbol moved by semitones, spelled the way a chart would. */
export function moveChord(symbol: string, semitones: number): string {
  const match = /^([A-G][#b]?)(.*)$/.exec(symbol.trim());
  if (!match) throw new Error(`not a chord symbol: ${symbol}`);
  const pc = (pcOfName(match[1]) + semitones + 120) % 12;
  // A dominant's leading tone reads better as a sharp in a minor key.
  const name = match[2].startsWith("dim") && ROOTS[pc] === "Ab" ? "G#" : ROOTS[pc];
  return `${name}${match[2]}`;
}

/** A chart moved by semitones. */
export function moveChart(chart: string, semitones: number): string {
  return chart
    .split("|")
    .map((chord) => moveChord(chord, semitones))
    .join(" | ");
}

/** Move the hand up a loop's worth of frets without leaving the neck. */
export function nearFret(base: number, semitones: number): number {
  let fret = base + semitones;
  while (fret > 17) fret -= 12;
  while (fret < 3) fret += 12;
  return fret;
}

/**
 * Chained loops, one shape to a bar, each starting as close as it can to the last
 * shape: the voice-led choice a player would make, so the hand barely moves and
 * the bass of each shape walks. The upward push out of one shape carries on into
 * the next, with no stop at the bar line. A top note too wide to hammer is a slide.
 */
export function sweepChain(args: {
  chords: readonly string[];
  strings: readonly number[];
  /** Where the first shape sits on its lowest string. */
  near: number;
  /** Loops of a shape per bar. */
  perBar?: number;
  doubleLow?: boolean;
  /** Fixed spots for each shape, overriding the walk. */
  nears?: readonly number[];
  rhythm: string;
}): string {
  const { chords, strings, near, perBar = 1, doubleLow = false, nears, rhythm } = args;
  let at = near;
  return chords
    .map((chord, index) => {
      const spot = nears?.[index] ?? at;
      const shape = arpeggioCells({ chord, strings, near: spot, doubleLow, top: true });
      at = shape.up[0].fret;
      const last = shape.up[shape.up.length - 1];
      const wide = fretMm(shape.top!.fret) - fretMm(last.fret) > 85;
      const loop = sweepLoop({ chord, strings, near: spot, doubleLow, slideTop: wide });
      return `${rhythm} ${repeat(loop, perBar)}`;
    })
    .join(" | ");
}

/**
 * The link itself: one sweep up a chord, then a single legato step on the top
 * string into the next chord, and one sweep down it; a step on the bottom string,
 * and up the next. Each chord gets one pass, a bar long. No note is picked at a
 * link, which is what lets the sweep keep going across the change.
 *
 * `extra` adds a second note on the string a pass ends on, for a pass that needs
 * one more note to fill its bar.
 */
export function linkedSweep(args: {
  chords: readonly string[];
  /** Low to high. */
  strings: readonly number[];
  near: number;
  rhythm: string;
  extra?: boolean;
  /** Add a second note on the string a pass begins on, too. */
  doubleStart?: boolean;
}): string {
  const { chords, strings, near, rhythm, extra = false, doubleStart = false } = args;
  const low = strings[0];
  const high = strings[strings.length - 1];
  const pcsOf = (chord: string) => new Set(chordPcs(chord));
  const closest = (pcs: Set<number>, string: number, to: number, avoid: number | null) => {
    let best = -1;
    for (let fret = 1; fret <= 22; fret += 1) {
      if (fret === avoid || !pcs.has((open(string) + fret) % 12)) continue;
      if (best < 0 || Math.abs(fret - to) < Math.abs(best - to)) best = fret;
    }
    return best;
  };
  const step = (pcs: Set<number>, midi: number, direction: 1 | -1) => {
    let next = midi + direction;
    while (!pcs.has(((next % 12) + 12) % 12)) next += direction;
    return next;
  };
  const bars: string[] = [];
  let previous: FretCell | null = null;
  chords.forEach((chord, index) => {
    const pcs = pcsOf(chord);
    const ascending = index % 2 === 0;
    const order = ascending ? [...strings] : [...strings].reverse();
    const direction: 1 | -1 = ascending ? 1 : -1;
    const startString = ascending ? low : high;
    const startFret: number = previous
      ? closest(pcs, startString, previous.fret, previous.fret)
      : closest(pcs, startString, near, null);
    const tokensOut: string[] = [];
    const arrive = (cell: FretCell, from: FretCell | null) => {
      if (!from || from.string !== cell.string) return token(cell);
      if (Math.abs(from.fret - cell.fret) > 3) {
        // Too far to hammer: the last pass ends by sliding out to this note.
        bars[bars.length - 1] = bars[bars.length - 1].replace(/(\S+)$/, "$1s");
        return token(cell);
      }
      return token(cell, cell.fret > from.fret ? "h" : "p");
    };
    let cell: FretCell = { string: startString, fret: startFret };
    tokensOut.push(arrive(cell, previous));
    let midi = open(cell.string) + cell.fret;
    if (doubleStart) {
      midi = step(pcs, midi, direction);
      const next = { string: startString, fret: midi - open(startString) };
      tokensOut.push(token(next, direction > 0 ? "h" : "p"));
      cell = next;
    }
    for (const string of order.slice(1)) {
      midi = step(pcs, midi, direction);
      cell = { string, fret: midi - open(string) };
      if (cell.fret < 0) throw new Error(`${chord} falls off the neck on string ${string}`);
      tokensOut.push(token(cell));
    }
    if (extra) {
      midi = step(pcs, midi, direction);
      const next = { string: cell.string, fret: midi - open(cell.string) };
      tokensOut.push(token(next, direction > 0 ? "h" : "p"));
      cell = next;
    }
    bars.push(`${rhythm} ${tokensOut.join(" ")}`);
    previous = cell;
  });
  return bars.join(" | ");
}

/** Just the join: the last two notes of one pass and the first two of the next. */
export function linkFragment(args: { chords: readonly [string, string]; strings: readonly number[]; near: number }): string {
  const whole = linkedSweep({ ...args, rhythm: "" });
  const [first, second] = whole.split("|").map((bar) => bar.trim().split(/\s+/));
  return `/2 ${first.slice(-2).join(" ")} | ${second.slice(0, 2).join(" ")}`;
}

/** Index-finger fret for a tab: the lowest fretted note of its first bar. */
export function handAt(tab: string): number {
  const firstBar = tab.split("|")[0];
  const frets = [...firstBar.matchAll(/\d:(\d+)/g)].map((m) => Number(m[1])).filter((f) => f > 0);
  return frets.length ? Math.min(...frets) : 1;
}

/** A melody that climbs the scale on one string, a scale step higher each bar. */
export function oneStringClimb(args: {
  root: string;
  scale: ScaleId;
  string: number;
  /** The lowest fret the climb may start from. */
  from: number;
  /** Scale steps of the cell, relative to where each bar starts. */
  cell: readonly number[];
  bars: number;
}): string {
  const { root, scale, string, from, cell, bars } = args;
  const pcs = new Set(scalePcs(root, scale));
  const tones: number[] = [];
  for (let fret = 0; fret <= 22; fret += 1) {
    if (pcs.has((open(string) + fret) % 12)) tones.push(fret);
  }
  const first = tones.findIndex((fret) => fret >= from);
  return Array.from({ length: bars }, (_v, bar) =>
    cell
      .map((offset) => {
        const fret = tones[first + bar + offset];
        if (fret === undefined) throw new Error(`the climb runs off string ${string}`);
        return `${string}:${fret}`;
      })
      .join(" "),
  ).join(" | ");
}

// ---------------------------------------------------------------------------
// Feel
// ---------------------------------------------------------------------------

/**
 * Turn the straight eighths of a tab into shuffle eighths: long on the beat,
 * short off it, on the triplet grid. Over a shuffle band a written straight
 * eighth is a sixth of a beat from where the player will put it, and at 90 BPM
 * that is 110 ms, outside the matching window: a correct take would read as
 * wrong. `backing.feel` in the validator refuses the straight version.
 */
export function swing(tab: string): string {
  const out: string[] = [];
  let inEighths = false;
  let written = "";
  let tick = 0;
  let value = 960;
  const write = (duration: string) => {
    if (duration !== written) out.push(duration);
    written = duration;
  };
  for (const item of tab.trim().split(/\s+/)) {
    if (item === "|") {
      out.push(item);
    } else if (item.startsWith("/")) {
      inEighths = item === "/8";
      if (!inEighths) {
        const match = /^\/(\d+)([.t]?)$/.exec(item)!;
        const base = 3840 / Number(match[1]);
        value = match[2] === "." ? (base * 3) / 2 : match[2] === "t" ? (base * 2) / 3 : base;
        write(item);
      }
    } else if (item === "hold" || item === "rest") {
      out.push(item);
      tick += 3840 - (tick % 3840 || 3840);
    } else if (inEighths) {
      const onBeat = tick % 960 === 0;
      write(onBeat ? "/4t" : "/8t");
      out.push(item);
      tick += 480;
    } else {
      out.push(item);
      tick += value;
    }
  }
  return out.join(" ");
}

// ---------------------------------------------------------------------------
// Ladders
// ---------------------------------------------------------------------------

/** `from`, `from + by` and so on up to and including `to`. */
export function ladder(from: number, to: number, by: number): number[] {
  const rungs: number[] = [];
  for (let bpm = from; bpm <= to; bpm += by) rungs.push(bpm);
  if (rungs[rungs.length - 1] !== to) rungs.push(to);
  return rungs;
}
