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
 * The total always equals what the player chose.
 *
 * | Minutes | Coming back as usual            | After a break                   |
 * |---------|---------------------------------|---------------------------------|
 * | 5       | focus 5                         | recap 5                         |
 * | 10      | warm-up 2, focus 8              | recap 3, focus 7                |
 * | 15      | warm-up 2, focus 8, next 5      | recap 3, focus 7, next 5        |
 * | 20      | warm-up 2, focus 9, next 6, jam | recap 3, focus 8, next 6, jam 3 |
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
  cleanTempoOf,
  currentStepOf,
  daysBetween,
  factsOf,
  isExercisePassed,
  isGradable,
  lastCaughtTake,
  takesOf,
} from "./progress";
import type { PlayerProgress } from "./progress";
import { pickVariantSeed, warmupsOf } from "./variants";

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
  | "chosen";

export type Reason = {
  code: ReasonCode;
  /** Measured values and names the sentence quotes. Nothing else may be quoted. */
  values: Record<string, string | number>;
};

export type ExerciseRole = "focus" | "next" | "recap";

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
  const every = path.steps.flatMap((s) =>
    s.exercises.filter(isGradable).map((exercise) => ({ path, step: s, exercise })),
  );
  const lastPlayed = (pick: Pick) =>
    takesOf(progress, path.id, pick.exercise.id)[0]?.startedAt ?? 0;
  return [...every].sort((a, b) => lastPlayed(a) - lastPlayed(b));
}

/** Paths that have something to grade, the one played longest ago first. */
function orderedPaths(paths: readonly PathDoc[], progress: PlayerProgress): PathDoc[] {
  const lastPlayed = (path: PathDoc) =>
    progress.takes.find((t) => t.pathId === path.id)?.startedAt ?? 0;
  return paths
    .filter((path) => path.steps.some((s) => s.exercises.some(isGradable)))
    .map((path, order) => ({ path, order }))
    .sort((a, b) => lastPlayed(a.path) - lastPlayed(b.path) || a.order - b.order)
    .map(({ path }) => path);
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
  const clean = cleanTempoOf(progress, path.id, exercise.id);
  const bpm = warmupBpm(exercise, clean);
  const backing = exercise.backing.kind === "click" ? exercise.backing.subdivision : 1;
  // A pack's own warm-ups go first, in turn, so the notes change from day to
  // day. Without them it is the focus Exercise, slower, and not graded.
  const own = warmupsOf(path);
  const warmup = own.length > 0 ? own[progress.takes.length % own.length] : exercise;
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

/** How the chosen minutes are split. See the table at the top of this file. */
function shape(minutes: PlanMinutes, back: boolean) {
  const table: Record<PlanMinutes, { warm: number; focus: number; next: number; jam: number }> = {
    5: { warm: 0, focus: 5, next: 0, jam: 0 },
    10: { warm: 2, focus: 8, next: 0, jam: 0 },
    15: { warm: 2, focus: 8, next: 5, jam: 0 },
    20: { warm: 2, focus: 9, next: 6, jam: 3 },
  };
  const row = table[minutes];
  // The recap takes the warm-up's place and a minute of the focus.
  if (back && row.warm > 0) return { ...row, warm: row.warm + 1, focus: row.focus - 1 };
  return row;
}

export function planSession(input: PlannerInput): SessionPlan {
  const { minutes, now, progress } = input;
  const paths = orderedPaths(input.paths, progress);
  const lastTake = progress.takes[0];
  const daysAway = lastTake ? Math.max(0, daysBetween(lastTake.startedAt, now)) : null;
  const drop = daysAway === null ? 0 : rungsToDrop(daysAway);
  const back = drop > 0;
  const mood: SessionMood = daysAway === null ? "first" : back ? "back" : "returning";

  const base = { minutes, mood, daysAway };
  if (paths.length === 0) return { ...base, steps: [] };

  const lists = paths.map((path) => worklist(path, progress));
  const focus = lists[0][0];
  // The other Path when there is one: a mix is the point of having two.
  const next = lists[1]?.[0] ?? lists[0][1] ?? null;
  const row = shape(minutes, back);

  const firstEver = mood === "first";
  const tempoOf = (pick: Pick): Tempo => {
    const tempo = tempoFor(pick.path, pick.exercise, progress);
    if (back) return eased(pick, tempo, drop, daysAway ?? 0, progress);
    return tempo;
  };
  const focusTempo = tempoOf(focus);
  const focusWhy: Tempo = firstEver
    ? { bpm: focusTempo.bpm, why: { code: "firstEver", values: { bpm: focusTempo.bpm } } }
    : focusTempo;

  const steps: PlanStep[] = [];
  const recap = back ? recapPick(paths, progress) : null;

  if (back && recap && row.warm === 0) {
    // Five minutes after a break: the recap is the whole Session.
    steps.push(exerciseStep(recap, "recap", "recap", tempoOf(recap), row.focus, progress));
    return { ...base, steps };
  }

  let focusMinutes = row.focus;
  if (row.warm > 0) {
    if (back && recap && recap.exercise.id !== focus.exercise.id) {
      steps.push(exerciseStep(recap, "recap", "recap", tempoOf(recap), row.warm, progress));
    } else {
      steps.push(warmupStep(focus, progress, row.warm));
    }
  }
  if (!next) focusMinutes += row.next;
  steps.push(exerciseStep(focus, "focus", "focus", focusWhy, focusMinutes, progress));

  if (next && row.next > 0) {
    const tempo = tempoOf(next);
    const sameStep = next.step.id === focus.step.id && next.path.id === focus.path.id;
    const why: Reason =
      takesOf(progress, next.path.id, next.exercise.id).length > 0
        ? tempo.why
        : {
            code: sameStep ? "nextInStep" : "newStep",
            values: { step: next.step.title, bpm: tempo.bpm },
          };
    steps.push(exerciseStep(next, "next", "next", { bpm: tempo.bpm, why }, row.next, progress));
  }

  if (row.jam > 0) {
    steps.push({
      kind: "jam",
      id: "jam",
      title: "",
      key: "A minor",
      minutes: row.jam,
      why: { code: "jam", values: {} },
    });
  }

  return { ...base, steps };
}
