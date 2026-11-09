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
  const inner = up.slice(1, -1).map((c) => token(c));
  const last = up[up.length - 1];
  const back = up.slice(1, -1).reverse().map((c) => token(c));
  return [
    token(up[0]),
    ...(low ? [token(low, "h")] : []),
    ...inner,
    token(last, slideTop ? "s" : ""),
    token(top, slideTop ? "s" : "h"),
    token(last, slideTop ? "" : "p"),
    ...back,
    ...(low ? [token(low)] : []),
  ].join(" ");
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
