/**
 * The practice screens' instruction, as data (the panel's redesign,
 * 2026-11-17): every view carries WHERE, WHEN and WHAT NEXT on its own.
 *
 * Pure, so the arithmetic is tested without a browser. `NeckInstruction.tsx`
 * draws it; `useWarmupBeat.ts` gives a warm-up the position a Take gets from
 * the engine.
 *
 * The neck as the instruction:
 * - a number on a dot is always a FINGER, as in a chord or scale diagram
 *   (1 index to 4 little finger, 0 an open string), never the order: the owner
 *   read the old order numbers as fingers (2026-11-18). Where the fingering is
 *   not certain the dot carries no number rather than a guess (`fingering`);
 * - the order is shown in time, never drawn: the Watch preview before the
 *   start, and NOW and NEXT once it runs: the note to play NOW is solid
 *   amber, the NEXT one an amber outline;
 * - the notes just played keep the colour of their verdict for a moment,
 *   where there is one (a Take); with none (a warm-up) they go quiet;
 * - the rest of the shape stays on the neck, quiet (`box`), so the hand still sees
 *   where it is. Letters only on a theory Exercise, where the note's name is
 *   the lesson.
 */
import type { NeckKind, NeckNote, NeckView } from "../../../stage3d/api";
import type { HandPosition } from "../../../paths/format";
import type { BeatPosition } from "../../../songs/position";
import type { RunwayModel } from "../highway/runwayModel";

type Place = { string: number; fret: number };
type Onsets = RunwayModel["onsets"];

const key = (p: Place) => `${p.string}:${p.fret}`;

/** How many notes behind NOW keep their verdict's colour. */
export const PLAYED_SHOWN = 2;

/**
 * The neck while the pattern runs.
 *
 * `index` is the onset to play now (`nextOnsetIndex`). `verdicts` maps an
 * onset id to the colour its verdict earned; a warm-up passes none. What is
 * NOW wins a place, then NEXT, then a verdict, then the quiet shape.
 */
export function nowNextNeck(
  shape: readonly NeckNote[],
  onsets: Onsets,
  index: number,
  verdicts: ReadonlyMap<number, NeckKind> | null = null,
  theory = false,
  fingers: ReadonlyMap<string, string> | null = null,
): NeckNote[] {
  const kinds = new Map<string, { kind: NeckKind; label?: string }>();
  const put = (places: readonly Place[] | undefined, kind: NeckKind, label?: (p: Place) => string | undefined) => {
    for (const p of places ?? []) {
      const k = key(p);
      if (!kinds.has(k)) kinds.set(k, { kind, label: label?.(p) });
    }
  };
  const finger = (p: Place) => fingers?.get(key(p));
  put(onsets[index]?.places, "now", finger);
  put(onsets[index + 1]?.places, "next", finger);
  if (verdicts) {
    for (let i = index - 1; i >= Math.max(0, index - PLAYED_SHOWN); i--) {
      const kind = verdicts.get(onsets[i].id);
      // A played note keeps its finger: the colour is the verdict, the number the hand.
      if (kind) put(onsets[i].places, kind, finger);
    }
  }
  const out: NeckNote[] = shape.map((n) => {
    const hit = kinds.get(key(n));
    if (hit) return { ...n, kind: hit.kind, label: hit.label };
    return { ...n, kind: "box", label: fingers?.get(key(n)) ?? (theory ? n.label : undefined) };
  });
  // NOW and NEXT are on the neck even when the shape somehow lacks them.
  const seen = new Set(shape.map(key));
  for (const [k, v] of kinds) {
    if (seen.has(k) || (v.kind !== "now" && v.kind !== "next")) continue;
    const [s, f] = k.split(":").map(Number);
    if (s >= 1 && s <= 6) out.push({ string: s as NeckNote["string"], fret: f, kind: v.kind, label: v.label });
  }
  return out;
}

/**
 * Before the start: the pattern with its fingers. The first note is NOW
 * ("start here"); the rest of the pattern is the quiet outline, each dot with
 * its finger where it is known. The order is not on the dots, and not drawn:
 * the Watch preview plays it (`watchIndex`).
 */
export function readyNeck(
  shape: readonly NeckNote[],
  onsets: Onsets,
  fingers: ReadonlyMap<string, string>,
  theory = false,
): NeckNote[] {
  const first = onsets[0]?.places[0];
  const played = new Set<string>();
  for (const o of onsets) for (const p of o.places) played.add(key(p));
  return shape.map((note) => {
    const k = key(note);
    if (!played.has(k)) return { ...note, kind: "dim", label: theory ? note.label : undefined };
    return {
      ...note,
      kind: first && key(first) === k ? "now" : "box",
      label: fingers.get(k) ?? (theory ? note.label : undefined),
    };
  });
}

/**
 * The fingers, by place ("string:fret" to "1".."4", or "0" for an open
 * string), as a chord or scale diagram writes them. Only what the Exercise
 * makes certain:
 *
 * - its hand position is the index finger's fret, one finger per fret, so a
 *   fret one to three above it is the middle, ring and little finger;
 * - a fret past the four is the little finger's stretch, but only when it is
 *   the one fret out there and the little finger's own fret is not used (the
 *   C major sweep at 8: 8, 9, 10 and the 12 above them);
 * - a hand that may shift gets fingers only when every note is under the four
 *   fingers where it starts; otherwise which finger takes a note after a shift
 *   is a choice, and a dot with a guessed number is worse than one without.
 *
 * A tapped note is the picking hand's, and gets no number.
 */
export function fingering(
  notes: readonly { string: number; fret: number; tech?: readonly string[] }[],
  position: HandPosition | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const n of notes) if (n.fret === 0) out.set(key(n), "0");
  if (!position) return out;
  const fretted = notes.filter((n) => n.fret > 0 && !n.tech?.includes("tap"));
  const base = Math.max(1, position.fret);
  const frets = new Set(fretted.map((n) => n.fret));
  const beyond = [...frets].filter((f) => f > base + 3);
  if (position.shifts !== "none" && (beyond.length > 0 || [...frets].some((f) => f < base))) return out;
  const stretch = beyond.length === 1 && beyond[0] - base <= 5 && !frets.has(base + 3) ? beyond[0] : null;
  for (const n of fretted) {
    const d = n.fret - base;
    const finger = d >= 0 && d <= 3 ? d + 1 : n.fret === stretch ? 4 : null;
    if (finger !== null) out.set(key(n), String(finger));
  }
  return out;
}

/**
 * The Watch preview's position: which onset sounds at `ms` into the preview,
 * looping over the pattern from its first bar to its end at `bpm`. -1 before
 * the first note of a pass.
 */
export function watchIndex(
  model: Pick<RunwayModel, "onsets" | "barTicks" | "endTick">,
  ms: number,
  bpm: number,
  perQuarter: number,
): { index: number; tick: number } {
  const start = model.barTicks[0] ?? model.onsets[0]?.tick ?? 0;
  const span = Math.max(1, model.endTick - start);
  const ticks = (ms / 60_000) * Math.max(1, bpm) * perQuarter;
  const tick = start + (ticks % span);
  let index = -1;
  for (let i = 0; i < model.onsets.length; i++) {
    if (model.onsets[i].tick <= tick) index = i;
    else break;
  }
  return { index, tick };
}

/**
 * The finger for a fret, when the Exercise says where the hand sits and that
 * it does not shift: one finger per fret from the index at `position.fret`.
 * Null for an open string, a shifting hand, or a fret outside the four.
 */
export function fingerFor(position: HandPosition | undefined, fret: number): number | null {
  if (!position || position.shifts !== "none" || fret <= 0) return null;
  const base = Math.max(1, position.fret);
  const finger = fret - base + 1;
  return finger >= 1 && finger <= 4 ? finger : null;
}

/** How many frets the camera keeps in view while a pattern runs. */
export const WINDOW_FRETS = 7;

/**
 * The fewest frets a still picture of a pattern shows: the pattern's own
 * frets with one either side, widened to this. The ready neck, and the camera
 * all through a pattern that fits, so it never moves or zooms out at Start.
 */
export const SPAN_FRETS = 5;

/** A window of about `width` frets holding `lo`..`hi`, with a fret of air either side where it fits. */
export function windowOver(lo: number, hi: number, width = WINDOW_FRETS): { from: number; to: number } {
  let from = Math.max(0, lo - 1);
  let to = Math.min(24, Math.max(hi + 1, from + width));
  if (to - from < width) from = Math.max(0, to - width);
  return { from, to };
}

/**
 * Where the camera sits for each bar: about seven frets around the action,
 * moved only on a bar line and only when the bar's notes would not fit where
 * it already is. So it pans at most once a bar, and not at all when the whole
 * pattern fits.
 *
 * Index 0 is the count-in and the first bar; one entry per bar after that.
 */
export function cameraPlan(model: Pick<RunwayModel, "onsets" | "barTicks">, width = WINDOW_FRETS): { from: number; to: number }[] {
  const bars = Math.max(1, model.barTicks.length - 1);
  const fretsIn = (b: number) => {
    const start = model.barTicks[b] ?? 0;
    const end = model.barTicks[b + 1] ?? Number.POSITIVE_INFINITY;
    const out: number[] = [];
    for (const o of model.onsets) {
      if (o.tick < start || o.tick >= end) continue;
      // Open strings count: a ring at the nut must be in the picture (SES-7).
      for (const p of o.places) if (p.fret >= 0) out.push(p.fret);
    }
    return out;
  };
  // The whole pattern in one window when it nearly fits: the camera then never
  // moves while it runs, and never zooms out under the player (SES-7).
  const all: number[] = [];
  for (const o of model.onsets) for (const p of o.places) if (p.fret >= 0) all.push(p.fret);
  // Framed as the ready screen frames it (the pattern's frets and one either
  // side), so Start neither moves the camera nor zooms out on a narrow window.
  if (all.length > 0 && Math.max(...all) - Math.min(...all) <= width) {
    const one = windowOver(Math.min(...all), Math.max(...all), Math.min(width, SPAN_FRETS));
    return Array.from({ length: bars }, () => one);
  }
  const plan: { from: number; to: number }[] = [];
  let current: { from: number; to: number } | null = null;
  for (let b = 0; b < bars; b++) {
    const frets = fretsIn(b);
    if (frets.length > 0) {
      const lo = Math.min(...frets);
      const hi = Math.max(...frets);
      if (!current || lo < current.from || hi > current.to) current = windowOver(lo, hi, width);
    }
    plan.push(current ?? windowOver(0, 4, width));
  }
  return plan;
}

/** The zoom view a camera window asks for. */
export function windowView(w: { from: number; to: number }): NeckView {
  return { kind: "zoom", from: w.from, to: w.to };
}

/** Which bar a tick is in (0 through the count-in), by the model's bar lines. */
export function barAt(barTicks: readonly number[], tick: number): number {
  let bar = 0;
  for (let i = 0; i < barTicks.length - 1; i++) {
    if (tick >= barTicks[i]) bar = i;
    else break;
  }
  return bar;
}

/**
 * The beat of the bar a tick falls on, 0-based. Through the count-in it
 * counts the count-in's own bar, so the dots count the player in.
 */
export function beatInBar(model: Pick<RunwayModel, "barTicks" | "barLength" | "countInTicks">, tick: number, perQuarter: number): number {
  const first = model.barTicks[0] ?? 0;
  const start = tick < first ? model.countInTicks : model.barTicks[barAt(model.barTicks, tick)];
  const beats = Math.max(1, Math.round(model.barLength / perQuarter));
  return Math.max(0, Math.min(beats - 1, Math.floor((tick - start) / perQuarter)));
}

// ─── A warm-up's position, from the click ────────────────────────────────

/**
 * What a warm-up has to work with: the engine plays only the click, so there
 * is no song position. The click's own beats are: each `beat` event says
 * which beat it is (`beat`, counting from the start) and which tick of it
 * (`subdivision`, 0 on the beat). That is enough to give the pattern a
 * position without asking the engine for anything.
 */
export type ClickBeat = { beat: number; subdivision: number; isDownbeat: boolean };

export type WarmupClock = {
  /** The pattern's first tick in the score (its first bar's start). */
  start: number;
  /** One pass of the pattern, in ticks. The position wraps here: a loop seam. */
  passTicks: number;
  /** Ticks to the quarter note: one click beat. */
  perQuarter: number;
  /** Beats of count-in before the first note (one bar of the click). */
  countInBeats: number;
};

/**
 * The position a click beat puts a warm-up at, in the shape a Take's engine
 * report has, so the neck, the runway and the tab follow it the same way.
 *
 * `beatsIn` is how many beats have sounded since the first one counted (0 on
 * that first beat). The first `countInBeats` are the count-in; then the
 * pattern runs and wraps on every pass, `songPass` counting the passes.
 */
export function warmupPosition(clock: WarmupClock, beatsIn: number, fromBeats = 0): BeatPosition {
  if (beatsIn < clock.countInBeats) {
    return { songBar: null, songTick: 0, songPass: 0, songCountIn: true };
  }
  // A Resume counts in again, then carries on from the bar it was paused in.
  const into = (beatsIn - clock.countInBeats + Math.max(0, fromBeats)) * clock.perQuarter;
  const pass = clock.passTicks > 0 ? Math.floor(into / clock.passTicks) : 0;
  const at = clock.passTicks > 0 ? into - pass * clock.passTicks : into;
  return { songBar: 0, songTick: clock.start + at, songPass: pass, songCountIn: false };
}
