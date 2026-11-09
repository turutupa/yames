/**
 * What an Exercise's own content implies. Shared by the generator, which writes
 * it down, and the validator, which refuses a pack that says less.
 */
import type { Backing, Crossing, Exercise, PathNote } from "./format";
import { TICKS, barLengthTicks } from "./format";
import {
  ALWAYS_NOT_GRADED,
  FAST_PICKING_GAP_MS,
  GRADED_MIN_GAP_MS,
  SUSTAINED_PLAYING_SECONDS,
} from "./metrics";
import { isPicked } from "./tabDsl";
import { minGapMs } from "./difficulty";

type Content = Pick<
  Exercise,
  | "notes"
  | "pickPlan"
  | "graded"
  | "grading"
  | "notesRole"
  | "tempo"
  | "holdSeconds"
  | "landings"
> & { backing: Backing };

const hasTech = (notes: readonly PathNote[], ...techs: PathNote["tech"]) =>
  notes.some((n) => n.tech.some((t) => techs.includes(t)));

/** The fastest a rung of this Exercise may be graded at, as a gap in ms. */
export function gradedGapLimit(pickPlan: Exercise["pickPlan"]): number {
  return pickPlan === "sweep" ? GRADED_MIN_GAP_MS.swept : GRADED_MIN_GAP_MS.picked;
}

export function requiredFlags(ex: Content): string[] {
  const flags: string[] = [];
  if (ex.pickPlan === "sweep") flags.push("fastSweep");
  if (hasTech(ex.notes, "letRing")) flags.push("ringingNotes");
  if (hasTech(ex.notes, "hammer", "pull", "slide")) flags.push("softLegato");
  if (ex.backing.kind === "jam" && ex.grading !== "practiceOnly") flags.push("bandBleed");
  const gradedRungs = ex.tempo.rungs.filter((r) => r.grading === "graded");
  const top = gradedRungs[gradedRungs.length - 1];
  if (top && ex.notesRole === "target") {
    const gap = minGapMs(ex.notes, top.bpm);
    if (gap !== null && gap <= FAST_PICKING_GAP_MS && ex.pickPlan !== "sweep") {
      flags.push("fastPicking");
    }
  }
  if ((ex.holdSeconds ?? 0) >= SUSTAINED_PLAYING_SECONDS) flags.push("sustainedPlaying");
  if (hasTech(ex.notes, "bend")) flags.push("bendPitch");
  if (ex.graded.includes("accentPlacement")) flags.push("roughAccents");
  return flags;
}

export function requiredNotGraded(ex: Content): string[] {
  const out = [...ALWAYS_NOT_GRADED, "fingering", "tone", "feel"];
  if (hasTech(ex.notes, "bend")) out.push("bendPitch");
  if (hasTech(ex.notes, "vibrato")) out.push("vibrato");
  const free = ex.notesRole === "example" || (ex.landings?.length ?? 0) > 0;
  if (free) out.push("noteChoice");
  if (!ex.graded.includes("noteIdentity") && !ex.graded.includes("landingChordTone")) {
    out.push("notesWritten");
  }
  return out;
}

export type PickPair = { a: PathNote; b: PathNote; seam: boolean };

/**
 * Consecutive picked notes close enough that the stroke matters. A beat or more
 * between two onsets gives the hand time to reset, whichever way it went.
 */
export function pickedPairs(ex: Pick<Exercise, "notes" | "loops" | "meter" | "bars">): PickPair[] {
  const picked = ex.notes.filter((n, i) => isPicked(n, ex.notes[i - 1]));
  const pairs: PickPair[] = [];
  for (let i = 1; i < picked.length; i += 1) {
    const a = picked[i - 1];
    const b = picked[i];
    if (b.tick - a.tick < TICKS) pairs.push({ a, b, seam: false });
  }
  if (ex.loops && picked.length > 1) {
    const last = picked[picked.length - 1];
    const first = picked[0];
    const total = barLengthTicks(ex.meter) * ex.bars;
    if (total - last.tick + first.tick < TICKS) pairs.push({ a: last, b: first, seam: true });
  }
  return pairs;
}

export type CrossingKind = "inside" | "outside";

/**
 * Inside or outside, from the strokes: an upstroke on the lower-pitched string
 * and a downstroke on the higher-pitched one both start between the two strings
 * (inside); a downstroke on the lower-pitched and an upstroke on the higher both
 * start from outside the pair.
 */
export function crossingOf(a: PathNote, b: PathNote): CrossingKind | null {
  if (a.string === b.string || !a.pick || !b.pick || a.pick === b.pick) return null;
  const lowerPitched = a.string > b.string ? a : b;
  return lowerPitched.pick === "d" ? "outside" : "inside";
}

export function crossingsIn(pairs: readonly PickPair[]): Crossing {
  const kinds = new Set<CrossingKind>();
  for (const pair of pairs) {
    const kind = crossingOf(pair.a, pair.b);
    if (kind) kinds.add(kind);
  }
  if (kinds.size === 0) return "none";
  if (kinds.size === 2) return "both";
  return kinds.has("inside") ? "inside" : "outside";
}
