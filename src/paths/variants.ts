/**
 * Choosing a variant: the runtime half of the variation model, and safe to import
 * from the app. All of it is pure. Given the same seed, the same Take gets the same
 * notes on any machine, which is what keeps a Take's graded notes known and its
 * replay reproducible. Store `variantId` on the Take and `resolveVariant` gets the
 * notes back.
 */
import type { Exercise, ExerciseVariant, Level, PathDoc } from "./format";

/** FNV-1a: small, stable, and the same in every engine. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/** Mulberry32, so the order is defined here and not by `Math.random`. */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The Exercise as one concrete set of notes. Its id gains `#variantId`. */
export function exerciseWithVariant(ex: Exercise, variant: ExerciseVariant): Exercise {
  const { variation: _variation, ...base } = ex;
  const merged: Exercise = {
    ...base,
    id: `${ex.id}#${variant.id}`,
    tab: variant.tab,
    position: variant.position,
    crossing: variant.crossing,
    notes: variant.notes,
    rests: variant.rests,
    backing: variant.backing,
    computed: variant.computed,
  };
  for (const key of ["guide", "chords", "harmony", "landings"] as const) {
    delete merged[key];
  }
  if (variant.guide) merged.guide = variant.guide;
  if (variant.chords) merged.chords = variant.chords;
  if (variant.harmony) merged.harmony = variant.harmony;
  if (variant.landings) merged.landings = variant.landings;
  if (variant.passBars) merged.passBars = variant.passBars;
  return merged;
}

/** A seeded shuffle of the variants, as indices. Same seed, same order. */
export function variantOrder(ex: Exercise, seed: string | number): number[] {
  const count = ex.variation?.variants.length ?? 1;
  const order = Array.from({ length: count }, (_v, i) => i);
  const random = generator(hash(`${ex.id}|${seed}`));
  for (let i = count - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

export type TakeNotes = {
  /** Null when the Exercise has one fixed set of notes. */
  variantId: string | null;
  /** The concrete Exercise to hand to `exerciseScore`. */
  exercise: Exercise;
};

/**
 * The notes for a Take. `seed` is whatever the planner keeps per player or
 * Session; `takeIndex` counts Takes of this Exercise. Every variant comes round
 * before any repeats, so no two Takes in a row play the same notes.
 */
export function notesForTake(ex: Exercise, seed: string | number, takeIndex: number): TakeNotes {
  const variants = ex.variation?.variants;
  if (!variants || variants.length === 0) return { variantId: null, exercise: ex };
  const order = variantOrder(ex, seed);
  const at = ((Math.floor(takeIndex) % order.length) + order.length) % order.length;
  const variant = variants[order[at]];
  return { variantId: variant.id, exercise: exerciseWithVariant(ex, variant) };
}

/** Get a Take's notes back from what was stored on it. */
export function resolveVariant(ex: Exercise, variantId: string | null): Exercise | null {
  if (variantId === null) return ex.variation ? null : ex;
  const variant = ex.variation?.variants.find((v) => v.id === variantId);
  return variant ? exerciseWithVariant(ex, variant) : null;
}

/**
 * The key progress and clean tempo are stored under. Variants that share a pool
 * share it; an Exercise without variants has one pool of its own.
 */
export function progressKey(ex: Exercise, variantId: string | null): string {
  const pool = ex.variation?.variants.find((v) => v.id === variantId)?.pool;
  return `${ex.id}::${pool ?? "all"}`;
}

/**
 * The BPM a warm-up starts at, from the reference Exercise's recent clean tempo,
 * snapped to the nearest rung at or below it and kept on the ladder.
 */
export function warmupStartBpm(ex: Exercise, cleanBpm: number | null): number {
  const plan = ex.warmup;
  const rungs = ex.tempo.rungs.map((r) => r.bpm);
  if (!plan || rungs.length === 0) return rungs[0] ?? 60;
  if (cleanBpm === null || !(cleanBpm > 0)) return plan.fallbackBpm;
  const wanted = cleanBpm * plan.startAtCleanRatio;
  const atOrBelow = rungs.filter((bpm) => bpm <= wanted);
  return atOrBelow.length ? atOrBelow[atOrBelow.length - 1] : rungs[0];
}

/** The warm-ups for a Level, or for the first Level when none is named. */
export function warmupsFor(doc: PathDoc, levelId?: Level["id"]): Exercise[] {
  const levels = doc.levels ?? [];
  const level = levelId ? levels.find((l) => l.id === levelId) : levels[0];
  return level?.warmups ?? [];
}

/** Which Level a Step belongs to. Used for placement, never to lock anything. */
export function levelOfStep(doc: PathDoc, stepId: string): Level | null {
  return doc.levels?.find((l) => l.stepIds.includes(stepId)) ?? null;
}
