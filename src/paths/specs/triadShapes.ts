/**
 * Triad shapes as tab: the helpers the harmony Paths share (Triads, Chords in a
 * Key, Arpeggios over Changes and their consolidation Steps). In a file of its
 * own so a Path and the Steps written for it can both import it.
 */
import type { ExerciseSpec } from "../spec";
import type { PassBar } from "../format";

type Grading = Pick<ExerciseSpec, "grade" | "alsoGraded" | "pass">;

export function named(evenness = 0.75, overBars = 4): Grading {
  const bars: PassBar[] = [
    { metric: "noteIdentity", min: 0.9, overBars },
    { metric: "notesHeard", min: 0.9, overBars },
    { metric: "extraNotes", max: 4, overBars: 4 },
    { metric: "timingEvenness", min: evenness, overBars },
  ];
  return { grade: "written", alsoGraded: ["timingEvenness"], pass: bars };
}


export const ROCK = (key: string) => ({ groove: "rock8", key });

// ---------------------------------------------------------------------------
// Shapes. A triad shape is three frets on three neighbouring strings, written
// low string first. Fingers are worked out once, here, the way a hand holds a
// small chord: notes on the lowest fret share the first finger, and each note
// above takes the finger its fret asks for, or the next free one.
// ---------------------------------------------------------------------------

export type Strings = readonly [number, number, number];
export type Shape = { strings: Strings; frets: readonly [number, number, number] };

export const TOP: Strings = [3, 2, 1];
export const MID: Strings = [4, 3, 2];
export const top = (g: number, b: number, e: number): Shape => ({ strings: TOP, frets: [g, b, e] });
export const mid = (d: number, g: number, b: number): Shape => ({ strings: MID, frets: [d, g, b] });

export function tokens(shape: Shape): [string, string, string] {
  const fretted = shape.frets.filter((f) => f > 0);
  const low = Math.min(...fretted);
  const order = shape.frets
    .map((fret, index) => ({ fret, index }))
    .filter((n) => n.fret > low)
    .sort((a, b) => a.fret - b.fret || a.index - b.index);
  const finger = new Map<number, number>();
  let next = 2;
  for (const n of order) {
    // One finger per fret, counted from the first finger's fret, or the next free finger.
    const wanted = Math.min(4, Math.max(next, n.fret - low + 1));
    finger.set(n.index, wanted);
    next = wanted + 1;
  }
  return shape.frets.map((fret, index) =>
    fret === 0 ? `${shape.strings[index]}:0` : `${shape.strings[index]}:${fret}f${finger.get(index) ?? 1}`,
  ) as [string, string, string];
}

/** Low, middle, high, middle: half a bar of eighths. */
export const roll = (shape: Shape) => {
  const [l, m, h] = tokens(shape);
  return `${l} ${m} ${h} ${m}`;
};
/** One bar of eighths: the roll twice. */
export const bar = (shape: Shape) => `/8 ${roll(shape)} ${roll(shape)}`;
/** One bar of quarter notes: low, middle, high, middle. */
export const slow = (shape: Shape) => `/4 ${roll(shape)}`;
/** One bar that ends on the top note, held for a beat. */
export const toTop = (shape: Shape) => {
  const [l, m, h] = tokens(shape);
  return `/8 ${l} ${m} ${h} ${m} ${l} ${m} /4 ${h}`;
};
/** The last bar of a line: low, middle, and the top note held. */
export const ending = (shape: Shape) => {
  const [l, m, h] = tokens(shape);
  return `/4 ${l} ${m} /2 ${h}`;
};
export const bars = (...shapes: Shape[]) => shapes.map(bar).join(" | ");
