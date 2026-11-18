/**
 * The Session planner: given minutes, Paths and history, what to play and why.
 *
 * Plain deterministic code, no model and no randomness (`BRIEF.md` rule 3): the
 * same input gives the same Session, so it can be tested and argued with. A
 * reason is data, a code plus the measured values, and `coachWords.ts` turns it
 * into a sentence. That is why no sentence can state something the planner did
 * not compute.
 *
 * ## How the time is spent
 *
 * The total always equals what the player chose (`shape`).
 *
 * | Minutes | Coming back as usual              | After a break                    |
 * |---------|-----------------------------------|----------------------------------|
 * | 5       | lead 5                            | recap 5                          |
 * | 10      | warm-up 2, lead 4, other 4        | recap 3, lead 3, other 4         |
 * | 15      | warm-up 2, lead 5, 4, 4           | recap 3, lead 4, 4, 4            |
 * | 20      | warm-up 2, lead 6, 4, 4, last 4   | recap 3, lead 5, 4, 4, last 4    |
 *
 * Across every subscribed Path (`plans/tasks/mvp/CONTENT.md`, the adopted
 * algorithm; the questions it asks of the history are in `rotation.ts`):
 *
 * - One Path leads: the one that has waited longest to lead, ties to the
 *   player's order; a Path unplayed four days or more jumps the queue.
 * - The warm-up slot is a benchmark Take on days 1, 7, 14 and 21 of a Path.
 * - Each other Path gets one block, the one played longest ago first; then
 *   reviews that are due (1, 3, 7, 14, 30 days); then the lead's next Exercise.
 * - At twenty the last block is a finisher with the band (a jam-backed
 *   Exercise at a tempo already passed), else a review, else Find my edge, else
 *   the band.
 * - At most four graded, blocks of three minutes or more, one Session in three
 *   (from fifteen minutes) gives two of the lead's minutes to a self-checked
 *   "your turn" item. A new Path's first block is placement; an Exercise three
 *   Sessions without a new clean rung is parked for two days. A Path with
 *   nothing today says why in `skipped`.
 *
 * Five minutes is one thing rather than two thin slices: splitting it leaves no
 * time for a second Take of anything (the mocks' open question 12).
 *
 * ## What counts as a break
 *
 * Seven days or more since the last Take. A week away drops one rung, two weeks
 * two, a month three. These are design values with no player behind them yet
 * (the mocks' open question 11).
 */
import type { Exercise, PathDoc, Step } from "../paths/format";
import { firstRung, hasRungBelow, rungAbove, rungBelow } from "./ladder";
import {
  calendarDaysBetween,
  cleanTempoOf,
  currentStepOf,
  daysBetween,
  factsOf,
  isExercisePassed,
  isGradable,
  isStepSkipped,
  lastCaughtTake,
  takesOf,
} from "./progress";
import type { PlayerProgress } from "./progress";
import { pickVariantSeed, warmupsOf } from "./variants";
import {
  PARK_DAYS,
  benchmarkDue,
  dueReviews,
  finisherPick,
  isNewPath,
  isParked,
  lastPlayedAt,
  othersByLastPlayed,
  pickFocus,
  placementPicks,
  sessionCount,
  yourTurnPicks,
} from "./rotation";

export const PLAN_MINUTES = [5, 10, 15, 20] as const;
export type PlanMinutes = (typeof PLAN_MINUTES)[number];

/** Days away that make a coming-back Session. */
export const BREAK_DAYS = 7;

/** How far a value must clear its bar to climb two rungs instead of one. */
const CLEAR_MARGIN = 0.08;
/** How far below its bar a value must be to drop a rung straight away. */
const FAR_BELOW_MARGIN = 0.15;
/** Failed Takes in a row at one tempo before it eases off. */
const STRUGGLING_STREAK = 2;
/** A warm-up sits this far under the clean tempo. */
const WARMUP_SHARE = 0.8;
const MIN_WARMUP_BPM = 40;

/** Every reason a step can have. Each is a sentence in `session.why`. */
export type ReasonCode =
  | "firstEver"
  | "newExercise"
  | "newStep"
  | "belowBar"
  | "easing"
  | "climb"
  | "climbFast"
  | "notCaught"
  | "passedKeepGoing"
  | "nextInStep"
  | "review"
  | "recap"
  | "backEased"
  | "warmUp"
  | "warmUpClean"
  | "jam"
  | "edge"
  | "edgeCheck"
  | "edgeFirst"
  | "chosen"
  // Play now across every subscribed Path (`rotation.ts`).
  | "focusTurn"
  | "keepWarm"
  | "reviewDue"
  | "parked"
  | "skippedToday"
  | "finisher"
  | "placement"
  | "testOut"
  | "benchmark"
  | "yourTurn";

export type Reason = {
  code: ReasonCode;
  /** Measured values and names the sentence quotes. Nothing else may be quoted. */
  values: Record<string, string | number>;
};

/**
 * `edge` is Find my edge: the same Exercise, climbing while it passes.
 * `review` is two Takes at the stored clean tempo; `placement` is one easy Take
 * then one at the pass tempo; `test` is one Take at the pass tempo (Test out);
 * `benchmark` is the one Take a day-1/7/14/21 benchmark is.
 */
export type ExerciseRole =
  | "focus"
  | "next"
  | "recap"
  | "edge"
  | "review"
  | "placement"
  | "test"
  | "benchmark";

export type PlanStep =
  | {
      kind: "exercise";
      id: string;
      role: ExerciseRole;
      pathId: string;
      stepId: string;
      exerciseId: string;
      title: string;
      bpm: number;
      minutes: number;
      /** Which notes, when the Exercise has variants. */
      variantSeed: number | null;
      why: Reason;
      /** Why this Path is here today (whose turn it is), beside why this tempo. */
      context?: Reason;
      /** Placement: passing at this tempo moves on to `then`, the next Step's try. */
      placement?: { passAtBpm: number; then: PlanStep | null };
      /** A benchmark Take's tag, written into its facts. */
      benchmark?: { day: number };
    }
  | {
      /** The click and nothing else, for a set time. Not graded. */
      kind: "metronome";
      id: string;
      title: string;
      bpm: number;
      subdivision: number;
      /** An Exercise to play over it, shown but not graded. */
      pathId?: string;
      exerciseId?: string;
      minutes: number;
      why: Reason;
    }
  | {
      /** A band, for a set time. Not graded. */
      kind: "jam";
      id: string;
      title: string;
      /** A key the jam should suit. A hint; the library decides. */
      key?: string;
      /** The fun finisher: an Exercise played over the band at a tempo already passed. */
      pathId?: string;
      exerciseId?: string;
      bpm?: number;
      minutes: number;
      why: Reason;
    }
  | {
      /**
       * Ramp up, reached from a Session. The seam for Find my edge: the planner
       * does not choose this yet, and a result can offer it.
       */
      kind: "drill";
      id: string;
      title: string;
      startBpm: number;
      targetBpm: number;
      minutes: number;
      why: Reason;
    };

export type SessionMood = "first" | "returning" | "back";

export type SessionPlan = {
  minutes: PlanMinutes;
  mood: SessionMood;
  /** Whole days since the last Take. Null on a first Session. */
  daysAway: number | null;
  steps: PlanStep[];
  /** The Path that leads today, when there is one. */
  focusPathId?: string | null;
  /** Subscribed Paths with nothing today, and why. Today's footer. */
  skipped?: Array<{ pathId: string; why: Reason }>;
};

export type PlannerInput = {
  minutes: PlanMinutes;
  /** The clock, passed in so a test can name the day. */
  now: number;
  /** The player's Paths. Only those with something gradable get a step. */
  paths: readonly PathDoc[];
  progress: PlayerProgress;
};

/** How many rungs to come down after this long away. */
export function rungsToDrop(daysAway: number): number {
  if (daysAway >= 30) return 3;
  if (daysAway >= 14) return 2;
  if (daysAway >= BREAK_DAYS) return 1;
  return 0;
}

/** Percent, for a sentence. */
function pct(value: number): number {
  return Math.round(value * 100);
}

type Tempo = { bpm: number; why: Reason };

/**
 * What tempo to play an Exercise at next, from its own history.
 *
 * - Nothing yet: the first rung.
 * - Last Take unheard: the same tempo. It said nothing about the player.
 * - Passed: up a rung, or two if it cleared the bar by a distance.
 * - Below the bar: stay; come down a rung if it was far below or it is the
 *   second miss in a row here.
 */
export function tempoFor(path: PathDoc, exercise: Exercise, progress: PlayerProgress): Tempo {
  const takes = takesOf(progress, path.id, exercise.id);
  const passAt = exercise.tempo.passAtBpm ?? firstRung(exercise);
  const values = { exercise: exercise.title };

  if (takes.length === 0) {
    return { bpm: firstRung(exercise), why: { code: "newExercise", values } };
  }

  const last = lastCaughtTake(takes);
  if (!last || takes[0].id !== last.id) {
    return {
      bpm: takes[0].bpm,
      why: { code: "notCaught", values: { ...values, bpm: takes[0].bpm } },
    };
  }

  const facts = factsOf(last);
  if (last.passed) {
    const clean = cleanTempoOf(progress, path.id, exercise.id) ?? last.bpm;
    if (clean >= passAt) {
      return {
        bpm: Math.min(rungAbove(exercise, clean), rungAbove(exercise, passAt)),
        why: { code: "passedKeepGoing", values: { ...values, bpm: clean } },
      };
    }
    const value = facts.headlineValue;
    const min = facts.headlineMin;
    const cleared = typeof value === "number" && typeof min === "number" && value >= min + CLEAR_MARGIN;
    const next = Math.min(rungAbove(exercise, last.bpm, cleared ? 2 : 1), passAt);
    return {
      bpm: next,
      why: {
        code: cleared ? "climbFast" : "climb",
        values: {
          ...values,
          bpm: last.bpm,
          next,
          ...(cleared && typeof value === "number" ? { value: pct(value) } : {}),
        },
      },
    };
  }

  const value = facts.headlineValue;
  const min = facts.headlineMin;
  const metric = facts.headlineMetric ?? "timingEvenness";
  const measured = typeof value === "number" && typeof min === "number";
  const farBelow = measured && value < min - FAR_BELOW_MARGIN;

  let streak = 0;
  for (const take of takes) {
    if (!take.caught) continue;
    if (take.bpm !== last.bpm || take.passed) break;
    streak += 1;
  }

  if ((farBelow || streak >= STRUGGLING_STREAK) && hasRungBelow(exercise, last.bpm)) {
    const next = rungBelow(exercise, last.bpm);
    return {
      bpm: next,
      why: {
        code: "easing",
        values: {
          ...values,
          metric,
          bpm: last.bpm,
          next,
          count: streak,
          ...(measured ? { value: pct(value), bar: pct(min) } : {}),
        },
      },
    };
  }

  return {
    bpm: last.bpm,
    why: {
      code: "belowBar",
      values: {
        ...values,
        metric,
        bpm: last.bpm,
        ...(measured ? { value: pct(value), bar: pct(min) } : {}),
      },
    },
  };
}

type Pick = { path: PathDoc; step: Step; exercise: Exercise };

/** The gradable Exercises of a Path from a Step on, in order. */
function exercisesFrom(path: PathDoc, step: Step): Pick[] {
  const from = path.steps.findIndex((s) => s.id === step.id);
  const out: Pick[] = [];
  for (const s of path.steps.slice(Math.max(0, from))) {
    for (const exercise of s.exercises) {
      if (isGradable(exercise)) out.push({ path, step: s, exercise });
    }
  }
  return out;
}

/** The next things to work on in a Path, most urgent first. */
function worklist(path: PathDoc, progress: PlayerProgress): Pick[] {
  const step = currentStepOf(progress, path);
  const open = exercisesFrom(path, step).filter(
    (pick) => !isExercisePassed(progress, path.id, pick.exercise),
  );
  if (open.length > 0) return open;
  // Everything from here on is passed, so go back over what is left anywhere,
  // the least recently played first.
  // A Step skipped by the chosen Level is not "left" anywhere: it stays out.
  const every = path.steps
    .filter((s) => !isStepSkipped(progress, path, s))
    .flatMap((s) => s.exercises.filter(isGradable).map((exercise) => ({ path, step: s, exercise })));
  const lastPlayed = (pick: Pick) =>
    takesOf(progress, path.id, pick.exercise.id)[0]?.startedAt ?? 0;
  return [...every].sort((a, b) => lastPlayed(a) - lastPlayed(b));
}

function variantFor(pick: Pick, progress: PlayerProgress): number | null {
  const takes = takesOf(progress, pick.path.id, pick.exercise.id);
  return pickVariantSeed(pick.exercise, takes.length, takes[0]?.variantSeed);
}

/**
 * A warm-up tempo: comfortably under what the player has shown is clean.
 *
 * Not held to the ladder. A warm-up is not graded, so it can go under the first
 * rung, which is the whole point when the first rung is all they have passed.
 */
export function warmupBpm(exercise: Exercise, clean: number | null): number {
  if (clean === null) return firstRung(exercise);
  return Math.max(MIN_WARMUP_BPM, Math.round((clean * WARMUP_SHARE) / 5) * 5);
}

function warmupStep(focus: Pick, progress: PlayerProgress, minutes: number): PlanStep {
  const { path, exercise } = focus;
  // A pack's own warm-ups go first, in turn, so the notes change from day to
  // day. Without them it is the focus Exercise, slower, and not graded.
  const own = warmupsOf(path, focus.step.id);
  const warmup = own.length > 0 ? own[progress.takes.length % own.length] : exercise;
  // A pack's warm-up says whose clean tempo it reads and what share of it to
  // start at; with no history it has a tempo of its own.
  const plan = warmup.warmup;
  const clean = cleanTempoOf(progress, path.id, plan?.referenceExercise ?? exercise.id);
  const bpm = plan
    ? clean === null
      ? plan.fallbackBpm
      : Math.max(MIN_WARMUP_BPM, Math.round((clean * plan.startAtCleanRatio) / 5) * 5)
    : warmupBpm(exercise, clean);
  // Its own backing: a warm-up's grid need not be the focus Exercise's.
  const backing = warmup.backing.kind === "click" ? warmup.backing.subdivision : 1;
  return {
    kind: "metronome",
    id: "warmup",
    title: warmup.title,
    bpm,
    subdivision: backing,
    pathId: path.id,
    exerciseId: warmup.id,
    minutes,
    why:
      clean === null
        ? { code: "warmUp", values: { bpm } }
        : { code: "warmUpClean", values: { bpm, clean } },
  };
}

/** Minutes Find my edge gets, planned or added from a result. */
export const EDGE_MINUTES = 3;

/**
 * Find my edge on one Exercise, from `bpm`.
 *
 * Starts where the player is known to be clean when nothing else is said, so
 * the first Take is one they can pass and the climb begins from a real number.
 */
export function edgeStep(
  pick: { path: PathDoc; step: Step; exercise: Exercise },
  progress: PlayerProgress,
  options: { id?: string; bpm?: number; why?: Reason; minutes?: number } = {},
): PlanStep {
  const clean = cleanTempoOf(progress, pick.path.id, pick.exercise.id);
  const bpm = options.bpm ?? clean ?? tempoFor(pick.path, pick.exercise, progress).bpm;
  const why: Reason =
    options.why ??
    (clean === null
      ? { code: "edgeFirst", values: { bpm } }
      : { code: "edgeCheck", values: { clean } });
  return exerciseStep(
    pick,
    options.id ?? "edge",
    "edge",
    { bpm, why },
    options.minutes ?? EDGE_MINUTES,
    progress,
  );
}

function exerciseStep(
  pick: Pick,
  id: string,
  role: ExerciseRole,
  tempo: Tempo,
  minutes: number,
  progress: PlayerProgress,
): PlanStep {
  return {
    kind: "exercise",
    id,
    role,
    pathId: pick.path.id,
    stepId: pick.step.id,
    exerciseId: pick.exercise.id,
    title: pick.exercise.title,
    bpm: tempo.bpm,
    minutes,
    variantSeed: variantFor(pick, progress),
    why: tempo.why,
  };
}

/** Come down `drop` rungs from where it would be, and say so. */
function eased(pick: Pick, tempo: Tempo, drop: number, daysAway: number, progress: PlayerProgress): Tempo {
  const clean = cleanTempoOf(progress, pick.path.id, pick.exercise.id);
  const bpm = rungBelow(pick.exercise, tempo.bpm, drop);
  return {
    bpm,
    why: {
      code: "backEased",
      values: { days: daysAway, bpm, ...(clean === null ? {} : { clean }) },
    },
  };
}

/** What a player just coming back last played, the point to pick up from. */
function recapPick(paths: readonly PathDoc[], progress: PlayerProgress): Pick | null {
  const last = progress.takes[0];
  if (!last) return null;
  const path = paths.find((p) => p.id === last.pathId);
  if (!path) return null;
  for (const step of path.steps) {
    const exercise = step.exercises.find((e) => e.id === last.exerciseId);
    if (exercise && isGradable(exercise)) return { path, step, exercise };
  }
  return null;
}


/** The most graded Exercises one Session holds. */
export const MAX_GRADED = 4;
/** A block is at least this long: time for two Takes and a breath. */
export const MIN_BLOCK_MINUTES = 3;
/** A "your turn" block: short, self-checked, not graded. */
export const YOUR_TURN_MINUTES = 2;
/** One Session in this many, from fifteen minutes up, has a "your turn" block. */
export const YOUR_TURN_EVERY = 3;
/** Each further Step placement tries, inside the placement block. */
const PLACEMENT_NEXT_MINUTES = 2;

/**
 * How the chosen minutes are split. See the table at the top of this file.
 * `blocks[0]` is the focus Path's; the others are one each for the rest.
 */
function shape(minutes: PlanMinutes, back: boolean): { warm: number; blocks: number[] } {
  const table: Record<PlanMinutes, { warm: number; blocks: number[] }> = {
    5: { warm: 0, blocks: [5] },
    10: { warm: 2, blocks: [4, 4] },
    15: { warm: 2, blocks: [5, 4, 4] },
    20: { warm: 2, blocks: [6, 4, 4, 4] },
  };
  const row = table[minutes];
  // The recap takes the warm-up's place and a minute of the focus, so it is a
  // block of its own length.
  if (back && row.warm > 0) {
    return { warm: row.warm + 1, blocks: [row.blocks[0] - 1, ...row.blocks.slice(1)] };
  }
  return { warm: row.warm, blocks: [...row.blocks] };
}

const key = (pick: { path: PathDoc; exercise: Exercise }) => `${pick.path.id}/${pick.exercise.id}`;

/**
 * The worklist with parking applied: an Exercise that has gone three Sessions
 * without a new clean rung waits behind the open ones for two days.
 */
function openWork(path: PathDoc, progress: PlayerProgress, now: number) {
  const list = worklist(path, progress);
  const parked = list.filter((p) => isParked(progress, path.id, p.exercise, now));
  const fresh = list.filter((p) => !parked.includes(p));
  return { list: [...fresh, ...parked], parkedHead: parked.includes(list[0]) ? list[0] : null };
}

/** Placement on a new Path: one easy Take, then one at the pass tempo, Step by Step. */
function placementStep(
  picks: Pick[],
  progress: PlayerProgress,
  minutes: number,
  id: string,
  context?: Reason,
): PlanStep | null {
  const build = (at: number): PlanStep | null => {
    const pick = picks[at];
    if (!pick) return null;
    const passAt = pick.exercise.tempo.passAtBpm ?? firstRung(pick.exercise);
    const bpm = firstRung(pick.exercise);
    const step = exerciseStep(
      pick,
      at === 0 ? id : `${id}-${at}`,
      "placement",
      {
        bpm,
        why: {
          code: "placement",
          values: { path: pick.path.title, step: pick.step.title, bpm, pass: passAt },
        },
      },
      at === 0 ? minutes : PLACEMENT_NEXT_MINUTES,
      progress,
    );
    if (step.kind !== "exercise") return step;
    return {
      ...step,
      ...(context && at === 0 ? { context } : {}),
      placement: { passAtBpm: passAt, then: build(at + 1) },
    };
  };
  return build(0);
}

/**
 * Whether a benchmark can take the warm-up slot without the Session playing an
 * Exercise twice: when it is the focus Path's head, the Path needs another open
 * Exercise for the focus block. Otherwise the warm-up is the click as usual and
 * the benchmark waits for the next Session in its window.
 */
function benchmarkFits(bench: Pick, focus: Pick | undefined, focusList: readonly Pick[]): boolean {
  if (!focus || key(bench) !== key(focus)) return true;
  return focusList.some((p) => key(p) !== key(bench));
}

/** Calendar days since, for a sentence ("yesterday", "3 days ago"). */
function daysSince(at: number | null, now: number): number | null {
  return at === null ? null : Math.max(0, calendarDaysBetween(at, now));
}

/**
 * Play now, across every subscribed Path.
 *
 * `paths` is the player's subscribed Paths in their order. One Path leads (the
 * one that has waited longest to, or one unplayed for four days); each other
 * Path gets one block, the one played longest ago first; what is left goes to
 * reviews that have come due, then to the focus Path's next Exercise. At twenty
 * minutes the last block is a finisher over the band, else a review, else Find
 * my edge. Never more than four graded Exercises, never a block under three
 * minutes, and a Path with nothing today says why in `skipped`.
 */
export function planSession(input: PlannerInput): SessionPlan {
  const { minutes, now, progress } = input;
  const paths = input.paths.filter((path) => path.steps.some((s) => s.exercises.some(isGradable)));
  const lastTake = progress.takes[0];
  const daysAway = lastTake ? Math.max(0, daysBetween(lastTake.startedAt, now)) : null;
  const drop = daysAway === null ? 0 : rungsToDrop(daysAway);
  const back = drop > 0;
  const mood: SessionMood = daysAway === null ? "first" : back ? "back" : "returning";

  const base = { minutes, mood, daysAway };
  const choice = pickFocus(paths, progress, now);
  if (!choice) return { ...base, steps: [], focusPathId: null, skipped: [] };
  const focusPath = choice.path;

  const work = new Map(paths.map((path) => [path.id, openWork(path, progress, now)]));
  const focusWork = work.get(focusPath.id)!;
  let focus = focusWork.list[0];
  const row = shape(minutes, back);
  const used = new Set<string>();
  const firstEver = mood === "first";

  const tempoOf = (pick: Pick): Tempo => {
    const tempo = tempoFor(pick.path, pick.exercise, progress);
    if (back) return eased(pick, tempo, drop, daysAway ?? 0, progress);
    return tempo;
  };
  /** The block's head Exercise, saying whose turn it is and what got parked. */
  const headContext = (path: PathDoc, lead: boolean): Reason => {
    const parked = work.get(path.id)?.parkedHead;
    if (parked) {
      return {
        code: "parked",
        values: { path: path.title, exercise: parked.exercise.title, days: PARK_DAYS },
      };
    }
    if (lead) {
      return {
        code: "focusTurn",
        values: { path: path.title, ...(choice.awayDays === null ? {} : { days: choice.awayDays }) },
      };
    }
    const played = daysSince(lastPlayedAt(progress, path.id), now);
    return { code: "keepWarm", values: { path: path.title, ...(played === null ? {} : { days: played }) } };
  };

  const steps: PlanStep[] = [];
  const recap = back ? recapPick(paths, progress) : null;

  if (back && recap && row.warm === 0) {
    // Five minutes after a break: the recap is the whole Session.
    steps.push(exerciseStep(recap, "recap", "recap", tempoOf(recap), row.blocks[0], progress));
    return { ...base, steps, focusPathId: recap.path.id, skipped: skippedOf(paths, steps, progress, now) };
  }

  // --- the warm-up slot: a recap, a benchmark, or the click under the focus ---
  if (row.warm > 0) {
    const bench =
      [focusPath, ...paths.filter((p) => p.id !== focusPath.id)]
        .map((path) => benchmarkDue(path, progress, now))
        .find((b) => b !== null) ?? null;
    if (back && recap && recap.exercise.id !== focus.exercise.id) {
      steps.push(exerciseStep(recap, "recap", "recap", tempoOf(recap), row.warm, progress));
      used.add(key(recap));
    } else if (bench && !back && benchmarkFits(bench, focus, focusWork.list)) {
      used.add(key(bench));
      const step = exerciseStep(
        bench,
        "benchmark",
        "benchmark",
        { bpm: bench.bpm, why: { code: "benchmark", values: { path: bench.path.title, day: bench.day, bpm: bench.bpm } } },
        row.warm,
        progress,
      );
      steps.push(step.kind === "exercise" ? { ...step, benchmark: { day: bench.day } } : step);
    } else {
      steps.push(warmupStep(focus, progress, row.warm));
    }
  }

  // One Exercise once per Session: a benchmark on the focus Path's head moves
  // the focus block on to its next open Exercise.
  if (used.has(key(focus))) focus = focusWork.list.find((p) => !used.has(key(p))) ?? focus;

  // --- the focus block ---
  let focusMinutes = row.blocks[0];
  const turn = mood === "returning" && paths.length > 1 ? headContext(focusPath, true) : undefined;
  const sessions = sessionCount(progress);
  const yourTurn =
    minutes >= 15 && sessions % YOUR_TURN_EVERY === YOUR_TURN_EVERY - 1
      ? ([focusPath, ...paths.filter((p) => p.id !== focusPath.id)]
          .map((path) => yourTurnPicks(path, progress))
          .find((list) => list.length > 0) ?? [])
      : [];
  const yourPick = yourTurn.length > 0 ? yourTurn[Math.floor(sessions / YOUR_TURN_EVERY) % yourTurn.length] : null;
  if (yourPick && focusMinutes - YOUR_TURN_MINUTES >= MIN_BLOCK_MINUTES) focusMinutes -= YOUR_TURN_MINUTES;

  const focusIndex = steps.length;
  if (isNewPath(progress, focusPath.id)) {
    const placed = placementStep(placementPicks(focusPath, progress), progress, focusMinutes, "focus", turn);
    if (placed) steps.push(placed);
  } else {
    const tempo = tempoOf(focus);
    const why: Tempo = firstEver
      ? { bpm: tempo.bpm, why: { code: "firstEver", values: { bpm: tempo.bpm } } }
      : tempo;
    const step = exerciseStep(focus, "focus", "focus", why, focusMinutes, progress);
    const context = focusWork.parkedHead ? headContext(focusPath, true) : turn;
    steps.push(step.kind === "exercise" && context ? { ...step, context } : step);
  }
  used.add(key(focus));
  if (yourPick && focusMinutes < row.blocks[0]) {
    const backing = yourPick.exercise.backing;
    const bpm = yourPick.exercise.tempo.rungs[0]?.bpm ?? 70;
    steps.push({
      kind: "metronome",
      id: "your-turn",
      title: yourPick.exercise.title,
      bpm,
      subdivision: backing.kind === "click" ? backing.subdivision : 1,
      pathId: yourPick.path.id,
      exerciseId: yourPick.exercise.id,
      minutes: YOUR_TURN_MINUTES,
      why: { code: "yourTurn", values: { exercise: yourPick.exercise.title } },
    });
  }

  // --- one block for each other Path, then reviews, then the focus Path again ---
  const others = othersByLastPlayed(paths, focusPath, progress);
  const due = back ? [] : dueReviews(paths, progress, now);
  const reviewStep = (id: string, mins: number): PlanStep | null => {
    const item = due.find((d) => !used.has(key(d)));
    if (!item) return null;
    used.add(key(item));
    if (item.kind === "review") {
      return exerciseStep(
        item,
        id,
        "review",
        {
          bpm: item.bpm,
          why: {
            code: "reviewDue",
            values: {
              exercise: item.exercise.title,
              path: item.path.title,
              bpm: item.bpm,
              days: daysSince(item.since, now) ?? 0,
              ...(item.slips > 0 ? { slipped: 1 } : {}),
            },
          },
        },
        mins,
        progress,
      );
    }
    const tempo = tempoFor(item.path, item.exercise, progress);
    return exerciseStep(
      item,
      id,
      "review",
      {
        bpm: tempo.bpm,
        why: {
          code: "reviewDue",
          values: { exercise: item.exercise.title, path: item.path.title, step: item.step.title, bpm: tempo.bpm, left: 1 },
        },
      },
      mins,
      progress,
    );
  };

  const rest = row.blocks.slice(1);
  rest.forEach((mins, i) => {
    const id = `block-${i + 1}`;
    const last = i === rest.length - 1;
    if (minutes === 20 && last) {
      const fun = finisherPick(paths, progress, used);
      const full = steps.filter((x) => x.kind === "exercise").length >= MAX_GRADED;
      if (fun && !back) {
        const backing = fun.exercise.backing;
        steps.push({
          kind: "jam",
          id: "finisher",
          title: fun.exercise.title,
          key: backing.kind === "jam" ? backing.key : "A minor",
          pathId: fun.path.id,
          exerciseId: fun.exercise.id,
          bpm: fun.bpm,
          minutes: mins,
          why: { code: "finisher", values: { exercise: fun.exercise.title, bpm: fun.bpm } },
        });
        return;
      }
      // Four graded already: the band, which grades nothing.
      const review = full ? null : reviewStep(id, mins);
      if (review) {
        steps.push(review);
        return;
      }
      if (!full && mood === "returning" && cleanTempoOf(progress, focus.path.id, focus.exercise.id) !== null) {
        steps.push(edgeStep(focus, progress, { minutes: mins }));
        return;
      }
      steps.push({ kind: "jam", id: "jam", title: "", key: "A minor", minutes: mins, why: { code: "jam", values: {} } });
      return;
    }
    // The next other Path's head Exercise.
    const other = others.shift();
    if (other) {
      const list = work.get(other.id)!.list;
      const head = list.find((p) => !used.has(key(p)));
      if (head) {
        used.add(key(head));
        const context = mood === "first" ? undefined : headContext(other, false);
        if (isNewPath(progress, other.id)) {
          const placed = placementStep(placementPicks(other, progress), progress, mins, id, context);
          if (placed) {
            steps.push(placed);
            return;
          }
        }
        const tempo = tempoOf(head);
        const why: Reason =
          takesOf(progress, head.path.id, head.exercise.id).length > 0
            ? tempo.why
            : { code: "newStep", values: { step: head.step.title, bpm: tempo.bpm } };
        const step = exerciseStep(head, id, "next", { bpm: tempo.bpm, why }, mins, progress);
        steps.push(step.kind === "exercise" && context ? { ...step, context } : step);
        return;
      }
    }
    const review = reviewStep(id, mins);
    if (review) {
      steps.push(review);
      return;
    }
    // The focus Path's next Exercise, when nothing else wants the time.
    const next = focusWork.list.find((p) => !used.has(key(p)));
    if (next) {
      used.add(key(next));
      const tempo = tempoOf(next);
      const sameStep = next.step.id === focus.step.id;
      const why: Reason =
        takesOf(progress, next.path.id, next.exercise.id).length > 0
          ? tempo.why
          : { code: sameStep ? "nextInStep" : "newStep", values: { step: next.step.title, bpm: tempo.bpm } };
      steps.push(exerciseStep(next, id, "next", { bpm: tempo.bpm, why }, mins, progress));
      return;
    }
    const lead = steps[focusIndex];
    if (lead) steps[focusIndex] = { ...lead, minutes: lead.minutes + mins };
  });

  // At most four graded: any beyond go back to the focus block.
  let graded = 0;
  const kept: PlanStep[] = [];
  for (const step of steps) {
    if (step.kind === "exercise") {
      graded += 1;
      if (graded > MAX_GRADED && step.id !== "focus") {
        const at = kept.findIndex((s) => s.id === "focus");
        if (at >= 0) kept[at] = { ...kept[at], minutes: kept[at].minutes + step.minutes };
        continue;
      }
    }
    kept.push(step);
  }

  return {
    ...base,
    steps: kept,
    focusPathId: focusPath.id,
    skipped: skippedOf(paths, kept, progress, now),
  };
}

/** Subscribed Paths with no block today, and why: when they were last played. */
function skippedOf(
  paths: readonly PathDoc[],
  steps: readonly PlanStep[],
  progress: PlayerProgress,
  now: number,
): Array<{ pathId: string; why: Reason }> {
  const here = new Set(steps.flatMap((s) => ("pathId" in s && s.pathId ? [s.pathId] : [])));
  return paths
    .filter((path) => !here.has(path.id))
    .map((path) => {
      const days = daysSince(lastPlayedAt(progress, path.id), now);
      return {
        pathId: path.id,
        why: { code: "skippedToday" as const, values: { path: path.title, ...(days === null ? {} : { days }) } },
      };
    });
}

/** Minutes a Test out gives each Exercise: one Take at the pass tempo. */
export const TEST_OUT_MINUTES = 2;

/**
 * Test out of a Step: one Take at the pass tempo for each gradable Exercise
 * not passed yet (QA 2026-11-17 #18). When every one is passed already there is
 * nothing left to prove, so it re-tests them all, and the Step page says so
 * (`testOutRetests`).
 */
export function testOutSteps(path: PathDoc, step: Step, progress: PlayerProgress): PlanStep[] {
  const gradable = step.exercises.filter(isGradable);
  const open = gradable.filter((e) => !isExercisePassed(progress, path.id, e));
  return (open.length > 0 ? open : gradable).map((exercise, i) => {
    const bpm = exercise.tempo.passAtBpm ?? exercise.tempo.rungs[0]?.bpm ?? 60;
    return {
      kind: "exercise",
      id: `test-${i}`,
      role: "test",
      pathId: path.id,
      stepId: step.id,
      exerciseId: exercise.id,
      title: exercise.title,
      bpm,
      minutes: TEST_OUT_MINUTES,
      variantSeed: null,
      why: { code: "testOut", values: { step: step.title, bpm } },
    };
  });
}

/** Whether Test out on this Step would re-test Exercises already passed: all of them are. */
export function testOutRetests(path: PathDoc, step: Step, progress: PlayerProgress): boolean {
  const gradable = step.exercises.filter(isGradable);
  return gradable.length > 0 && gradable.every((e) => isExercisePassed(progress, path.id, e));
}
