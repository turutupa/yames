/**
 * Swapping one block of today's plan for another (owner, 2026-11-18: "each card
 * should have an option for exchanging one exercise for another one").
 *
 * Three ways to swap, each a short list of ready-made steps the player can
 * page through before confirming:
 *
 * - `harder`: the same Path, later in it and no easier (`computed.difficulty`).
 * - `different`: another Exercise from the same Path at about the same level.
 * - `style`: the next open Exercise of another Path; the player's own Paths
 *   first, then the entry of one they have not started, another kind first.
 *
 * A warm-up only ever swaps for a warm-up, and never for one busier than the
 * block it warms up (`WARMUP_HARDER_THAN` in the planner): a candidate that
 * would be is slowed to fit, or left out.
 *
 * The replacement keeps the block's id and minutes, so the plan's total and
 * shape do not move. Swaps are remembered for the day (`SwapMemory`, kept in
 * the settings store beside the chosen minutes); the next plan puts what was
 * swapped away at the back of its Path's list (`PlannerInput.avoid`). Plain
 * deterministic code, like the planner.
 */
import type { Exercise, PathDoc, Step } from "../paths/format";
import {
  exerciseStep,
  notesPerSecond,
  openWork,
  tempoFor,
  warmupCeiling,
  warmupStepOn,
  warmupTempo,
} from "./planner";
import type { Pick, PlanStep, SessionPlan } from "./planner";
import { currentStepOf, isGradable, isStepSkipped, levelOfStep, takesOf } from "./progress";
import type { PlayerProgress } from "./progress";
import { othersByLastPlayed } from "./rotation";
import { levelsOf } from "./variants";

export const SWAP_CHOICES = ["harder", "different", "style"] as const;
export type SwapChoice = (typeof SWAP_CHOICES)[number];

/** Which Exercise of which Path. */
export type SwapRef = { pathId: string; exerciseId: string };

/** One swap: the block `slot` (a step id) held `from` in the planner's plan, and plays `to`. */
export type SwapRecord = { slot: string; from: SwapRef; to: SwapRef };

/** What is kept: today's swaps, and what the plan of `avoid.day` puts at the back. */
export type SwapMemory = {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  swaps: SwapRecord[];
  /** Every `path/exercise` swapped away on `day`: the next plan's light penalty. */
  away: string[];
  avoid: { day: string; keys: string[] } | null;
};

/** The settings-store key. */
export const SWAPS_KEY = "session.swaps";

/** How much harder (`computed.difficulty`) still counts as "about the same" for Something different. */
const LEVEL_SLACK = 0.5;

/** How many candidates one choice offers ("Show another" pages through them). */
export const SWAP_CANDIDATES = 4;

export type SwapContext = {
  /** The player's Paths, in their order. */
  paths: readonly PathDoc[];
  /** Every Path there is, for another style. */
  allPaths: readonly PathDoc[];
  progress: PlayerProgress;
  now: number;
};

/** Why a choice has nothing: a `session.today.swap.none.*` key's last part. */
export type SwapNone = "harder" | "harderWarmUp" | "different" | "style";

export type SwapOptions = { candidates: PlanStep[]; none: SwapNone | null };

const keyOf = (ref: SwapRef) => `${ref.pathId}/${ref.exerciseId}`;

/** The Exercise a step plays, when it plays one the player could swap. */
export function refOf(step: PlanStep): SwapRef | null {
  if (step.kind === "exercise") return { pathId: step.pathId, exerciseId: step.exerciseId };
  if (step.kind === "metronome" && step.id === "warmup" && step.pathId && step.exerciseId) {
    return { pathId: step.pathId, exerciseId: step.exerciseId };
  }
  return null;
}

/** Graded Exercises and the warm-up can be swapped; the band, a ramp and "your turn" cannot. */
export function canSwap(step: PlanStep): boolean {
  return refOf(step) !== null;
}

const isWarmup = (step: PlanStep) => step.kind === "metronome" && step.id === "warmup";

/** An Exercise of a Path, its Level warm-ups included, with the Step it belongs to. */
function findIn(path: PathDoc, exerciseId: string): { step: Step; exercise: Exercise } | null {
  for (const step of path.steps) {
    const exercise = step.exercises.find((e) => e.id === exerciseId);
    if (exercise) return { step, exercise };
  }
  for (const level of levelsOf(path)) {
    const exercise = level.warmups.find((e) => e.id === exerciseId);
    if (!exercise) continue;
    const step = path.steps.find((s) => level.stepIds.includes(s.id)) ?? path.steps[0];
    return step ? { step, exercise } : null;
  }
  return null;
}

function pickOf(paths: readonly PathDoc[], ref: SwapRef): Pick | null {
  const path = paths.find((p) => p.id === ref.pathId);
  const found = path ? findIn(path, ref.exerciseId) : null;
  return path && found ? { path, ...found } : null;
}

const difficultyOf = (exercise: Exercise) => exercise.computed?.difficulty ?? null;

/** Every gradable Exercise of a Path the player may be sent to, in the Path's order. */
function ordered(path: PathDoc, progress: PlayerProgress): Array<Pick & { at: number }> {
  return path.steps.flatMap((step, at) =>
    isStepSkipped(progress, path, step)
      ? []
      : step.exercises.filter(isGradable).map((exercise) => ({ path, step, exercise, at })),
  );
}

/** What the plan already plays, so a swap never brings in a second copy of it. */
function inPlan(plan: SessionPlan): Set<string> {
  return new Set(
    plan.steps.flatMap((s) => {
      const id = "exerciseId" in s ? s.exerciseId : undefined;
      const path = "pathId" in s ? s.pathId : undefined;
      return id && path ? [`${path}/${id}`] : [];
    }),
  );
}

/** The other Paths for another style: the player's own first, then the rest, another kind first. */
function otherPaths(ctx: SwapContext, from: PathDoc): PathDoc[] {
  const mine = othersByLastPlayed(ctx.paths, from, ctx.progress);
  const rest = ctx.allPaths
    .filter((p) => p.id !== from.id && !ctx.paths.some((m) => m.id === p.id))
    .filter((p) => p.steps.some((s) => s.exercises.some(isGradable)))
    .sort((a, b) => Number(a.kind === from.kind) - Number(b.kind === from.kind));
  return [...mine, ...rest];
}

/** Round-robin over lists: the first of each, then the second of each. */
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i += 1) {
    for (const list of lists) if (i < list.length) out.push(list[i]);
  }
  return out;
}

/** The step a pick plays in an Exercise block: its id and minutes, its own tempo. */
function swapInExercise(slot: Extract<PlanStep, { kind: "exercise" }>, pick: Pick, progress: PlayerProgress, swappedFrom: string): PlanStep {
  const tempo = tempoFor(pick.path, pick.exercise, progress);
  const role = slot.role === "focus" ? "focus" : "next";
  const step = exerciseStep(pick, slot.id, role, tempo, slot.minutes, progress);
  return { ...step, swappedFrom };
}

/** The block a warm-up warms up: the focus, else the first graded block. */
function focusOf(steps: readonly PlanStep[]): Extract<PlanStep, { kind: "exercise" }> | null {
  const exercises = steps.filter((s): s is Extract<PlanStep, { kind: "exercise" }> => s.kind === "exercise");
  return exercises.find((s) => s.id === "focus") ?? exercises[0] ?? null;
}

/**
 * A warm-up on `pick`, held under the focus block's notes a second: slowed to
 * fit, or null when even the slowest warm-up would be busier.
 */
function swapInWarmup(
  slot: PlanStep,
  pick: Pick,
  steps: readonly PlanStep[],
  ctx: SwapContext,
  swappedFrom: string,
): PlanStep | null {
  const tempo = warmupTempo(pick.path, pick.exercise, ctx.progress);
  let bpm = tempo.bpm;
  const focus = focusOf(steps);
  const focusPick = focus ? pickOf(ctx.allPaths, focus) : null;
  if (focus && focusPick) {
    const ceiling = warmupCeiling(pick.exercise, focusPick.exercise, focus.bpm);
    if (ceiling !== null) {
      if (ceiling < 40) return null;
      bpm = Math.min(bpm, ceiling);
    }
  }
  const step = warmupStepOn(pick.path, pick.exercise, ctx.progress, slot.minutes, bpm, tempo.clean);
  return { ...step, swappedFrom };
}

/**
 * Exercises that can warm up a Path: the current Level's warm-ups, the next
 * Level's (a busier one, held to the block's pace), and the current Step's own.
 * Not an Advanced warm-up for a beginner, slowed to a crawl.
 */
function warmupPool(path: PathDoc, progress: PlayerProgress): Pick[] {
  const current = currentStepOf(progress, path);
  const all = levelsOf(path);
  const level = levelOfStep(path, current.id);
  const at = level ? all.indexOf(level) : -1;
  const levels = at < 0 ? all.slice(0, 1) : all.slice(at, at + 2);
  const out: Pick[] = [];
  for (const l of levels) {
    for (const exercise of l.warmups) {
      const found = findIn(path, exercise.id);
      if (found) out.push({ path, ...found });
    }
  }
  for (const exercise of current.exercises.filter(isGradable)) out.push({ path, step: current, exercise });
  return out;
}

function rateOf(step: PlanStep, ctx: SwapContext): number | null {
  const ref = refOf(step);
  const pick = ref ? pickOf(ctx.allPaths, ref) : null;
  return pick && "bpm" in step && typeof step.bpm === "number" ? notesPerSecond(pick.exercise, step.bpm) : null;
}

function warmupOptions(plan: SessionPlan, index: number, choice: SwapChoice, ctx: SwapContext): SwapOptions {
  const slot = plan.steps[index];
  const ref = refOf(slot)!;
  const from = pickOf(ctx.allPaths, ref);
  if (!from) return { candidates: [], none: choice === "harder" ? "harderWarmUp" : choice };
  const others = inPlan(plan);
  const build = (picks: Pick[]) => {
    const seen = new Set<string>([keyOf(ref)]);
    const out: PlanStep[] = [];
    for (const pick of picks) {
      const k = `${pick.path.id}/${pick.exercise.id}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const step = swapInWarmup(slot, pick, plan.steps, ctx, slot.title);
      if (step) out.push(step);
    }
    return out;
  };
  const own = rateOf(slot, ctx);
  if (choice === "style") {
    const picks = interleave(
      otherPaths(ctx, from.path).map((p) =>
        warmupPool(p, ctx.progress).filter((x) => !others.has(`${x.path.id}/${x.exercise.id}`)),
      ),
    );
    const candidates = build(picks).slice(0, SWAP_CANDIDATES);
    return { candidates, none: candidates.length ? null : "style" };
  }
  const same = build(warmupPool(from.path, ctx.progress));
  if (choice === "harder") {
    const candidates =
      own === null
        ? []
        : same
            .map((step) => ({ step, rate: rateOf(step, ctx) }))
            .filter((x): x is { step: PlanStep; rate: number } => x.rate !== null && x.rate > own * 1.001)
            .sort((a, b) => a.rate - b.rate)
            .map((x) => x.step)
            .slice(0, SWAP_CANDIDATES);
    return { candidates, none: candidates.length ? null : "harderWarmUp" };
  }
  const candidates =
    own === null
      ? same.slice(0, SWAP_CANDIDATES)
      : same
          .map((step, order) => ({ step, order, gap: Math.abs((rateOf(step, ctx) ?? own) - own) }))
          .sort((a, b) => a.gap - b.gap || a.order - b.order)
          .map((x) => x.step)
          .slice(0, SWAP_CANDIDATES);
  return { candidates, none: candidates.length ? null : "different" };
}

/**
 * What block `index` of `plan` can be swapped for, by `choice`: ready-made
 * steps with the block's id and minutes, best first. Empty with `none` saying
 * why when there is nothing.
 */
export function swapOptions(plan: SessionPlan, index: number, choice: SwapChoice, ctx: SwapContext): SwapOptions {
  const slot = plan.steps[index];
  if (!slot || !canSwap(slot)) return { candidates: [], none: choice === "harder" ? "harder" : choice };
  if (isWarmup(slot)) return warmupOptions(plan, index, choice, ctx);
  if (slot.kind !== "exercise") return { candidates: [], none: choice };
  const from = pickOf(ctx.allPaths, slot);
  if (!from) return { candidates: [], none: choice };
  const taken = inPlan(plan);
  const free = (p: Pick) => !taken.has(`${p.path.id}/${p.exercise.id}`);
  const make = (picks: Pick[]) =>
    picks.slice(0, SWAP_CANDIDATES).map((p) => swapInExercise(slot, p, ctx.progress, slot.title));

  if (choice === "harder") {
    const list = ordered(from.path, ctx.progress);
    const at = list.findIndex((p) => p.exercise.id === from.exercise.id);
    const base = difficultyOf(from.exercise);
    // Later in the Path and a real step up, the nearest first: the Path's
    // order is its progression, so the next Exercise that is harder is it.
    const later = list.slice(at + 1).filter(free).filter((p) => {
      const d = difficultyOf(p.exercise);
      return base === null || d === null || d > base;
    });
    const candidates = make(later);
    return { candidates, none: candidates.length ? null : "harder" };
  }

  if (choice === "different") {
    const list = ordered(from.path, ctx.progress);
    const current = currentStepOf(ctx.progress, from.path);
    const reach =
      Math.max(
        from.path.steps.findIndex((s) => s.id === current.id),
        from.path.steps.findIndex((s) => s.id === from.step.id),
      ) + 1;
    const base = difficultyOf(from.exercise) ?? 0;
    const played = (p: Pick) => takesOf(ctx.progress, p.path.id, p.exercise.id)[0]?.startedAt ?? -1;
    const reachable = list
      .filter((p) => p.at <= reach && p.exercise.id !== from.exercise.id)
      .filter(free)
      .map((p, order) => ({ p, order, d: difficultyOf(p.exercise) ?? base }));
    // About as hard, not harder: that is what Harder is for. Anything, when
    // nothing is.
    const level = reachable.filter((x) => x.d <= base + LEVEL_SLACK);
    const near = (level.length > 0 ? level : reachable)
      .sort((a, b) => Math.abs(a.d - base) - Math.abs(b.d - base) || played(a.p) - played(b.p) || a.order - b.order)
      .map((x) => x.p);
    const candidates = make(near);
    return { candidates, none: candidates.length ? null : "different" };
  }

  const heads = otherPaths(ctx, from.path).map((path) =>
    openWork(path, ctx.progress, ctx.now).list.filter(free).slice(0, 2),
  );
  const candidates = make(interleave(heads));
  return { candidates, none: candidates.length ? null : "style" };
}

/**
 * Today's plan with the day's swaps in it. A swap applies while its block still
 * holds what it swapped away; once the plan has moved on (that block was played
 * and the plan rebuilt) it quietly stops. Exercise blocks go first, then the
 * warm-up, which is then held under whatever the focus block has become.
 */
export function applySwaps(plan: SessionPlan, swaps: readonly SwapRecord[], ctx: SwapContext): SessionPlan {
  if (swaps.length === 0) return plan;
  const steps = [...plan.steps];
  let changed = false;
  const inOrder = [...swaps].sort((a, b) => Number(a.slot === "warmup") - Number(b.slot === "warmup"));
  for (const swap of inOrder) {
    const at = steps.findIndex((s) => s.id === swap.slot);
    if (at < 0) continue;
    const slot = steps[at];
    const ref = refOf(slot);
    if (!ref || keyOf(ref) !== keyOf(swap.from)) continue;
    const pick = pickOf(ctx.allPaths, swap.to);
    if (!pick) continue;
    const next =
      slot.kind === "exercise"
        ? swapInExercise(slot, pick, ctx.progress, slot.title)
        : swapInWarmup(slot, pick, steps, ctx, slot.title);
    if (!next) continue;
    steps[at] = next;
    changed = true;
  }
  if (!changed) return plan;
  // A focus swapped for something slower: the warm-up comes down with it.
  const warm = steps.findIndex(isWarmup);
  const focus = focusOf(steps);
  if (warm >= 0 && focus) {
    const w = steps[warm];
    const wPick = refOf(w) ? pickOf(ctx.allPaths, refOf(w)!) : null;
    const fPick = pickOf(ctx.allPaths, focus);
    if (w.kind === "metronome" && wPick && fPick) {
      const ceiling = warmupCeiling(wPick.exercise, fPick.exercise, focus.bpm);
      if (ceiling !== null && w.bpm > ceiling) {
        const bpm = Math.max(40, ceiling);
        steps[warm] = { ...w, bpm, why: { ...w.why, values: { ...w.why.values, bpm } } };
      }
    }
  }
  return { ...plan, steps };
}

// --- remembering ------------------------------------------------------------

/** The local calendar day of `now`, YYYY-MM-DD. */
export function dayKey(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const isRef = (v: unknown): v is SwapRef =>
  !!v &&
  typeof v === "object" &&
  typeof (v as SwapRef).pathId === "string" &&
  typeof (v as SwapRef).exerciseId === "string";

const isDay = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** A stored value, checked; anything it does not recognise is dropped. */
export function readSwapMemory(raw: unknown): SwapMemory | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<SwapMemory>;
  if (!isDay(r.day)) return null;
  const swaps = Array.isArray(r.swaps)
    ? r.swaps.filter(
        (s): s is SwapRecord => !!s && typeof s.slot === "string" && isRef(s.from) && isRef(s.to),
      )
    : [];
  const away = Array.isArray(r.away) ? r.away.filter((k): k is string => typeof k === "string") : [];
  const avoid =
    r.avoid && isDay(r.avoid.day) && Array.isArray(r.avoid.keys)
      ? { day: r.avoid.day, keys: r.avoid.keys.filter((k): k is string => typeof k === "string") }
      : null;
  return { day: r.day, swaps, away, avoid };
}

/**
 * The memory as it stands on `now`'s day. The same day: as kept. A later day:
 * yesterday's swaps are over, and what they swapped away becomes this plan's
 * penalty (only this one: the day after, it is gone).
 */
export function swapMemoryOn(stored: SwapMemory | null, now: number): SwapMemory {
  const today = dayKey(now);
  if (!stored || stored.day > today) return { day: today, swaps: [], away: [], avoid: null };
  if (stored.day === today) return { ...stored, avoid: stored.avoid?.day === today ? stored.avoid : null };
  return { day: today, swaps: [], away: [], avoid: stored.away.length ? { day: today, keys: [...stored.away] } : null };
}

/** The keys the planner puts at the back today. */
export function avoidSet(memory: SwapMemory): Set<string> {
  return new Set(memory.avoid?.day === memory.day ? memory.avoid.keys : []);
}

/**
 * Remember a swap. `from` is what the planner put in the block (a block
 * swapped twice still answers to its first Exercise), `to` what plays now.
 */
export function rememberSwap(memory: SwapMemory, slot: string, from: SwapRef, to: SwapRef, shown: SwapRef): SwapMemory {
  const swaps = [...memory.swaps.filter((s) => s.slot !== slot), { slot, from, to }];
  const away = [...new Set([...memory.away, keyOf(shown)])].filter((k) => k !== keyOf(to));
  return { ...memory, swaps, away };
}

/** Put a block back as the planner had it. */
export function forgetSwap(memory: SwapMemory, slot: string): SwapMemory {
  const gone = memory.swaps.find((s) => s.slot === slot);
  if (!gone) return memory;
  return {
    ...memory,
    swaps: memory.swaps.filter((s) => s.slot !== slot),
    away: memory.away.filter((k) => k !== keyOf(gone.from)),
  };
}
