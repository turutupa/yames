/**
 * Reachability: can a human hand actually fret this, at this tempo?
 *
 * The model is deliberately physical rather than a list of forbidden shapes.
 * The hand is at a position `p`, the fret under the index finger. From there it
 * covers every fret within a span in millimetres, on a 25.5" scale, so the same
 * five frets that are a stretch at the nut are comfortable at the twelfth. To
 * reach anything else it shifts, and a shift takes time (a Fitts-style cost: a
 * reaction constant plus the log of the distance). A dynamic programme then
 * looks for the cheapest fingering across the whole Exercise, starting at the
 * declared position.
 *
 * The numbers are a teacher's estimate, not a study; what the check buys is that
 * a shape or a jump no hand can make fails with the bar and beat it dies on.
 */
import type { Exercise, PathLevel, PathNote } from "./format";
import { TICKS, barLengthTicks } from "./format";

const SCALE_MM = 648;

/** Where a fret sits, in millimetres from the nut. */
export function fretMm(fret: number): number {
  return SCALE_MM * (1 - 2 ** (-fret / 12));
}

/** Largest comfortable span, index to little finger, and how long a shift takes. */
export const LEVEL_LIMITS: Readonly<Record<PathLevel, { spanMm: number; shiftFactor: number }>> = {
  beginner: { spanMm: 80, shiftFactor: 2 },
  "early-intermediate": { spanMm: 90, shiftFactor: 1.6 },
  intermediate: { spanMm: 100, shiftFactor: 1.3 },
  advanced: { spanMm: 115, shiftFactor: 1 },
};

/** Never more than six frets under one hand, however high up the neck. */
const MAX_FRETS_IN_HAND = 6;

export function shiftMs(distanceMm: number, level: PathLevel): number {
  return (40 + 20 * Math.log2(1 + distanceMm / 10)) * LEVEL_LIMITS[level].shiftFactor;
}

/** A full stretch is for slow playing: the limit tightens to 85% as gaps shrink. */
export function spanLimitMm(level: PathLevel, gapMs: number): number {
  const full = LEVEL_LIMITS[level].spanMm;
  const t = Math.min(1, Math.max(0, (gapMs - 80) / (150 - 80)));
  return full * (0.85 + 0.15 * t);
}

function inHand(position: number, fret: number, limitMm: number): boolean {
  if (fret < position) return false;
  if (fret - position > MAX_FRETS_IN_HAND - 1) return false;
  return fretMm(fret) - fretMm(position) <= limitMm;
}

type Group = {
  tick: number;
  frets: number[];
  legato: boolean;
  slideIn: boolean;
  noteIndex: number;
};

/** Fretted notes grouped by onset. An open string asks nothing of the hand. */
function fretGroups(notes: readonly PathNote[]): Group[] {
  const groups: Group[] = [];
  notes.forEach((note, index) => {
    if (note.fret === 0) return;
    const legato = note.tech.includes("hammer") || note.tech.includes("pull");
    const previous = notes[index - 1];
    const slideIn = !!previous && previous.tech.includes("slide") && previous.string === note.string;
    const last = groups[groups.length - 1];
    if (last && last.tick === note.tick) {
      last.frets.push(note.fret);
      last.legato = last.legato || legato;
      last.slideIn = last.slideIn || slideIn;
    } else {
      groups.push({ tick: note.tick, frets: [note.fret], legato, slideIn, noteIndex: index });
    }
  });
  return groups;
}

function minGapTicks(notes: readonly PathNote[]): number {
  let gap = Infinity;
  for (let i = 1; i < notes.length; i += 1) {
    const d = notes[i].tick - notes[i - 1].tick;
    if (d > 0 && d < gap) gap = d;
  }
  return gap;
}

export type ReachFailure = {
  kind: "position" | "stretch" | "legato" | "shiftTime" | "seam";
  noteIndex: number;
  message: string;
};

export type ReachResult = { failure: ReachFailure | null; shifts: number };

function where(ex: Pick<Exercise, "meter">, tick: number): string {
  const bar = barLengthTicks(ex.meter);
  return `bar ${Math.floor(tick / bar) + 1}, beat ${((tick % bar) / TICKS + 1).toFixed(2).replace(/\.00$/, "")}`;
}

/** Run the search at one tempo. `bpm = Infinity` removes time from the question. */
export function checkReachAt(
  ex: Pick<Exercise, "notes" | "position" | "loops" | "meter" | "bars">,
  level: PathLevel,
  bpm: number,
): ReachResult {
  const groups = fretGroups(ex.notes);
  if (groups.length === 0) return { failure: null, shifts: 0 };

  const msPerTick = Number.isFinite(bpm) ? 60000 / bpm / TICKS : Infinity;
  const fastest = minGapTicks(ex.notes) * msPerTick;
  const limit = spanLimitMm(level, Number.isFinite(fastest) ? fastest : 1000);
  const candidates = (group: Group): number[] => {
    const out: number[] = [];
    for (let p = 1; p <= 24; p += 1) {
      if (group.frets.every((fret) => inHand(p, fret, limit))) out.push(p);
    }
    return out;
  };

  for (const group of groups) {
    if (candidates(group).length === 0) {
      return {
        failure: {
          kind: "stretch",
          noteIndex: group.noteIndex,
          message: `the frets at ${where(ex, group.tick)} (${group.frets.join(",")}) do not fit under one hand`,
        },
        shifts: 0,
      };
    }
  }

  const declared = ex.position.fret;
  const fixed = ex.position.shifts === "none";
  if (!candidates(groups[0]).includes(declared)) {
    return {
      failure: {
        kind: "position",
        noteIndex: groups[0].noteIndex,
        message: `the first fretted note, at fret ${groups[0].frets.join(",")}, is not under a hand at the declared position (index on fret ${declared})`,
      },
      shifts: 0,
    };
  }

  // Cheapest movement to each hand position, group by group.
  type Cell = { cost: number; shifts: number };
  let layer = new Map<number, Cell>([[declared, { cost: 0, shifts: 0 }]]);
  for (let i = 1; i < groups.length; i += 1) {
    const group = groups[i];
    const gapMs = (group.tick - groups[i - 1].tick) * msPerTick;
    const next = new Map<number, Cell>();
    for (const q of candidates(group)) {
      if (fixed && q !== declared) continue;
      for (const [p, cell] of layer) {
        let moved = 0;
        if (q !== p) {
          // A hammer or pull is the same hand, and a slide IS the shift.
          if (group.legato) continue;
          moved = Math.abs(fretMm(p) - fretMm(q));
          if (!group.slideIn && shiftMs(moved, level) > gapMs) continue;
        }
        const candidate = { cost: cell.cost + moved, shifts: cell.shifts + (q !== p ? 1 : 0) };
        const held = next.get(q);
        if (!held || candidate.cost < held.cost) next.set(q, candidate);
      }
    }
    if (next.size === 0) {
      const kind: ReachFailure["kind"] = group.legato
        ? "legato"
        : fixed
          ? "stretch"
          : "shiftTime";
      const reason =
        kind === "legato"
          ? "a hammer-on or pull-off cannot also be a position shift"
          : kind === "stretch"
            ? `it does not fit at the declared position (index on fret ${declared}, no shifts)`
            : `the shift to fret ${group.frets.join(",")} does not fit in the time`;
      return {
        failure: { kind, noteIndex: group.noteIndex, message: `${where(ex, group.tick)}: ${reason}` },
        shifts: 0,
      };
    }
    layer = next;
  }

  if (ex.loops && Number.isFinite(bpm)) {
    const barTicks = barLengthTicks(ex.meter);
    const total = barTicks * ex.bars;
    const seamGapMs = (total - groups[groups.length - 1].tick + groups[0].tick) * msPerTick;
    let bestShifts = Infinity;
    for (const [q, cell] of layer) {
      const moved = Math.abs(fretMm(q) - fretMm(declared));
      if (q === declared || shiftMs(moved, level) <= seamGapMs) {
        bestShifts = Math.min(bestShifts, cell.shifts + (q !== declared ? 1 : 0));
      }
    }
    if (!Number.isFinite(bestShifts)) {
      return {
        failure: {
          kind: "seam",
          noteIndex: groups[groups.length - 1].noteIndex,
          message: `looping: the jump from the last note back to the first does not fit in ${Math.round(seamGapMs)} ms`,
        },
        shifts: 0,
      };
    }
    return { failure: null, shifts: bestShifts };
  }
  let shifts = Infinity;
  for (const cell of layer.values()) shifts = Math.min(shifts, cell.shifts);
  return { failure: null, shifts };
}

/** The fastest tempo a fingering exists for, to the nearest BPM, capped at 400. */
export function maxPlayableBpm(
  ex: Pick<Exercise, "notes" | "position" | "loops" | "meter" | "bars">,
  level: PathLevel,
): number {
  if (checkReachAt(ex, level, 400).failure === null) return 400;
  if (checkReachAt(ex, level, 20).failure !== null) return 0;
  let low = 20;
  let high = 400;
  while (high - low > 1) {
    const mid = Math.floor((low + high) / 2);
    if (checkReachAt(ex, level, mid).failure === null) low = mid;
    else high = mid;
  }
  return low;
}
