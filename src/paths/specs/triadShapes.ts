/**
 * Triad shapes as tab: the helpers the harmony Paths share (Triads, Chords in a
 * Key, Arpeggios over Changes and their consolidation Steps). In a file of its
 * own so a Path and the Steps written for it can both import it.
 */
import type { ExerciseSpec, VariantParams } from "../spec";
import type { PassBar } from "../format";
import { handAt, moveChart, shiftFrets } from "../templates";

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
export type Shape = {
  strings: Strings;
  frets: readonly [number, number, number];
  /** Fingers written by hand, low string first, where the rule's choice is not what the lesson needs. */
  fingers?: readonly [number, number, number];
};

export const TOP: Strings = [3, 2, 1];
export const MID: Strings = [4, 3, 2];
export const LOW: Strings = [5, 4, 3];
export const top = (g: number, b: number, e: number): Shape => ({ strings: TOP, frets: [g, b, e] });
/** The A, D and G strings, A string first. */
export const low = (a: number, d: number, g: number): Shape => ({ strings: LOW, frets: [a, d, g] });
export const mid = (d: number, g: number, b: number): Shape => ({ strings: MID, frets: [d, g, b] });

/** The same shape held with these fingers (low string first) instead of the rule's. */
export const fingered = (shape: Shape, fingers: readonly [number, number, number]): Shape => ({ ...shape, fingers });

export function tokens(shape: Shape): [string, string, string] {
  if (shape.fingers) {
    const held = shape.fingers;
    return shape.frets.map((fret, index) =>
      fret === 0 ? `${shape.strings[index]}:0` : `${shape.strings[index]}:${fret}f${held[index]}`,
    ) as [string, string, string];
  }
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

// ---------------------------------------------------------------------------
// Other keys. `moveChart` has one spelling per root (C#, Eb, F#, Ab, Bb); a
// chart reads better in its key's own accidentals: G sharp minor in E, D flat
// in A flat. Keys are named as the band wants them: "A", "E minor".
// ---------------------------------------------------------------------------

const SHARP_KEYS = ["G", "D", "A", "E", "B", "E minor", "B minor", "F# minor", "C# minor"];
const FLAT_KEYS = ["F", "Bb", "Eb", "Ab", "Db", "D minor", "G minor", "C minor", "F minor"];
export function chartIn(chart: string, by: number, key: string): string {
  const moved = moveChart(chart, by);
  if (SHARP_KEYS.includes(key)) return moved.replace(/Ab/g, "G#").replace(/Eb/g, "D#").replace(/Bb/g, "A#");
  if (FLAT_KEYS.includes(key)) return moved.replace(/C#/g, "Db").replace(/F#/g, "Gb").replace(/G#/g, "Ab").replace(/D#/g, "Eb");
  return moved;
}

/**
 * A line moved along the neck to other keys; the chart and the band move with
 * it. `shifts` is frets from the written line for each key, `home` the key the
 * written line is in when it is not C (so the chart's shift can be told from
 * the tab's when a key sits better an octave away).
 */
export function inKeys(
  tab: string,
  chart: string,
  shifts: Readonly<Record<string, number>>,
  jam: (key: string) => { groove: string; key: string } = ROCK,
) {
  return {
    values: { key: Object.keys(shifts) },
    pooled: ["key"] as const,
    label: (p: VariantParams) => `In ${p.key}`,
    build: (p: VariantParams) => {
      const moved = shiftFrets(tab, shifts[p.key]);
      return {
        tab: moved,
        position: handAt(moved),
        shifts: true,
        chords: chartIn(chart, shifts[p.key], p.key),
        jam: jam(p.key),
        harmony: { chordTones: true as const },
      };
    },
  };
}
