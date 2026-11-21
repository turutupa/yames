/**
 * What the coach knows at one moment (DESIGN 9.1), built when it is asked for.
 *
 * `buildCoachContext` reads from a `latest` object of getters the host keeps
 * current (refs, mostly), and is called when the coach has something to say
 * or answer: never in a render, never per beat. Nothing here holds state, and
 * nothing here reaches into React or the store: the host decides what it can
 * see, and a getter it does not have is a field the context leaves out.
 *
 * `contextForModel` is the same facts as a short text a model can read, held
 * under a token budget (450 by default; a test holds the cap). The facts are
 * the measured ones and the pack's own words; nothing is inferred here.
 *
 * Names follow the real types, which moved since the design was written:
 * `brain` is the model selector's state (`choice`, not the design's `tier`),
 * the exercise travels with the words of the variant played (`words`), and a
 * Session's run is the `RunState` fields the design picked.
 */
import type { SongAttemptReview } from "../containers/songs/review/useSongAttempt";
import type { ToolsInfo } from "../containers/session/ToolsView";
import type { HeardSummary, PathTakeRow } from "../ipc";
import type { Jam } from "../jam/types";
import type { Exercise, PathDoc, Step } from "../paths/format";
import { exerciseWords, type ExerciseWords } from "../session/exerciseWords";
import type { GradingChoice } from "../session/grading";
import type { InputFailure } from "../session/inputStart";
import type { SessionPlan } from "../session/planner";
import { cleanBeforeOutcome, outcomeCountsTowardCleanTempo, takesOf, type PlayerProgress, type TakeFacts } from "../session/progress";
import type { DueItem } from "../session/rotation";
import type { RunState, TakeOutcome } from "../session/runner";
import { withVariant } from "../session/take";
import type { SongRecord } from "../songs/library";
import type { BarRange } from "../songs/schedule";
import type { SessionReport } from "../types";

/** Where the player is. `path` and `step` are the Paths screen's two depths. */
export type CoachScreen =
  | "today"
  | "paths"
  | "path"
  | "step"
  | "session"
  | "progress"
  | "jam"
  | "songs"
  | "beat"
  | "drill"
  | "setlist"
  | "tools";

/**
 * The model selector's state, as the caller reports it. This file does not
 * load, unload or ask about a model; it is told.
 */
export type CoachBrain = {
  /** This build has the LLM compiled in (`coach::llm_compiled()`). */
  llmCompiled: boolean;
  /** What the player picked in the selector: "off", a local model's id, later "cloud". */
  choice: string;
  /** That model is loaded and stays loaded. */
  resident: boolean;
  /** Measured fast enough on this machine for the use at hand. */
  fastEnough: boolean;
};

export type CoachInput = {
  /** The input is on and listening. */
  listening: boolean;
  /** A direct input (an interface, not a room mic). */
  direct: boolean;
  /** Why it would not come on, when it would not. */
  failure?: InputFailure;
};

/**
 * The run, as the cards read it. `plan` is the plan the Session RUNS (not
 * Today's, review c2b2a H1) and `startedAt` its start (the result screen's
 * repeat count, M3): optional only so a fixture may leave them out.
 */
export type CoachRun = Pick<RunState, "phase" | "stepIndex" | "bpm" | "takes" | "outcomes" | "ungraded" | "untimed"> &
  Partial<Pick<RunState, "plan" | "startedAt">>;
export type CoachPath = Pick<PathDoc, "id" | "title" | "kind" | "goal" | "gradingLimits">;
export type CoachStep = Pick<Step, "id" | "order" | "title" | "goal" | "why" | "howTo" | "payoff">;

export type CoachContext = {
  screen: CoachScreen;
  locale: string;
  now: number;
  grading: GradingChoice;
  input: CoachInput;
  brain: CoachBrain;
  plan?: SessionPlan;
  run?: CoachRun;
  path?: CoachPath;
  step?: CoachStep;
  /** The Exercise as written; `words` are the variant played (`exerciseWords`). */
  exercise?: Exercise;
  variantSeed?: number | null;
  words?: ExerciseWords;
  lastTake?: TakeOutcome;
  /** The current Take's whole analysis: per-note results, findings, score, schedule. */
  review?: SongAttemptReview;
  /** `takesOf()` on this Exercise, newest five. */
  takesHere?: PathTakeRow[];
  /** The 500-Take window the app keeps in memory. */
  progress: PlayerProgress;
  due?: DueItem[];
  jam?: { jam: Jam; heard?: HeardSummary };
  song?: { song: SongRecord; range: BarRange; review?: SongAttemptReview };
  tool?: { info: ToolsInfo; report?: SessionReport };
};

type Get<T> = () => T | null | undefined;

/**
 * Where each fact comes from: a getter per field, read once per build. The
 * five without a `?` are always known; the rest the host passes when it has
 * them. `exercise` brings its variant, so the words are the ones played.
 */
export type CoachSources = {
  screen: () => CoachScreen;
  locale: () => string;
  /** The clock. Absent: `Date.now()`. */
  now?: () => number;
  grading: () => GradingChoice;
  input: () => CoachInput;
  brain: () => CoachBrain;
  progress: () => PlayerProgress;
  plan?: Get<SessionPlan>;
  run?: Get<RunState>;
  path?: Get<PathDoc>;
  step?: Get<Step>;
  exercise?: Get<{ exercise: Exercise; variantSeed: number | null }>;
  lastTake?: Get<TakeOutcome>;
  review?: Get<SongAttemptReview>;
  due?: Get<readonly DueItem[]>;
  jam?: Get<{ jam: Jam; heard?: HeardSummary }>;
  song?: Get<{ song: SongRecord; range: BarRange; review?: SongAttemptReview }>;
  tool?: Get<{ info: ToolsInfo; report?: SessionReport }>;
};

/** How many of this Exercise's Takes the context carries. */
export const TAKES_HERE = 5;

/**
 * The context, now. Call it from an event or a handler, never from a render:
 * it reads every getter, and some of what they return is large.
 */
export function buildCoachContext(latest: CoachSources): CoachContext {
  const progress = latest.progress();
  const ctx: CoachContext = {
    screen: latest.screen(),
    locale: latest.locale(),
    now: latest.now ? latest.now() : Date.now(),
    grading: latest.grading(),
    input: latest.input(),
    brain: latest.brain(),
    progress,
  };

  const plan = latest.plan?.();
  if (plan) ctx.plan = plan;

  const run = latest.run?.();
  if (run && run.phase !== "idle") {
    ctx.run = {
      phase: run.phase,
      stepIndex: run.stepIndex,
      bpm: run.bpm,
      takes: run.takes,
      outcomes: run.outcomes,
      ungraded: run.ungraded,
      untimed: run.untimed,
      plan: run.plan,
      startedAt: run.startedAt,
    };
  }

  const path = latest.path?.();
  if (path) {
    ctx.path = { id: path.id, title: path.title, kind: path.kind, goal: path.goal, gradingLimits: path.gradingLimits };
  }

  const step = latest.step?.();
  if (step) {
    ctx.step = {
      id: step.id,
      order: step.order,
      title: step.title,
      goal: step.goal,
      why: step.why,
      howTo: step.howTo,
      payoff: step.payoff,
    };
  }

  const played = latest.exercise?.();
  if (played) {
    ctx.exercise = played.exercise;
    ctx.variantSeed = played.variantSeed;
    ctx.words = exerciseWords(played.exercise, withVariant(played.exercise, played.variantSeed));
    if (path) ctx.takesHere = takesOf(progress, path.id, played.exercise.id).slice(0, TAKES_HERE);
  }

  const lastTake = latest.lastTake?.();
  if (lastTake) ctx.lastTake = lastTake;
  const review = latest.review?.();
  if (review) ctx.review = review;
  const due = latest.due?.();
  if (due) ctx.due = [...due];
  const jam = latest.jam?.();
  if (jam) ctx.jam = jam;
  const song = latest.song?.();
  if (song) ctx.song = song;
  const tool = latest.tool?.();
  if (tool) ctx.tool = tool;

  return ctx;
}

// ---------------------------------------------------------------------------
// For a model
// ---------------------------------------------------------------------------

/**
 * A conservative token count, without a tokenizer.
 *
 * English runs about four characters a token in the tokenizers this app
 * ships (Qwen3, Llama 3); this counts three, so it over-counts. Anything
 * outside ASCII counts a whole token a character, and a CJK character one and
 * a half: Cyrillic and accented Latin run two or three characters a token,
 * Chinese and Japanese often a token a character or more. Over-counting only
 * leaves the model a little less context; under-counting would overflow it.
 */
export function estimateTokens(text: string): number {
  let ascii = 0;
  let other = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) ascii += 1;
    else if (code >= 0x2e80) other += 1.5;
    else other += 1;
  }
  return Math.ceil(ascii / 3 + other);
}

/** The longest any one free-text value may run in the model's context, in characters. */
const CLIP = 160;

function clip(text: string | null | undefined, max = CLIP): string {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${Array.from(flat).slice(0, max - 1).join("")}…`;
}

function num(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "?";
  return digits === 0 ? String(Math.round(value)) : value.toFixed(digits);
}

function takeLine(take: TakeOutcome, progress: PlayerProgress, outcomes: readonly TakeOutcome[] = []): string {
  const g = take.grade;
  const m = take.measures;
  const parts = [`take ${String(take.takeNumber)} at ${String(take.bpm)} bpm: ${g.verdict}`];
  if (take.ungraded) parts.push(`ungraded (${take.ungraded})`);
  if (g.headline) {
    const limit =
      g.headline.min !== undefined ? ` (pass mark >= ${String(g.headline.min)})` : g.headline.max !== undefined ? ` (pass mark <= ${String(g.headline.max)})` : "";
    parts.push(`${g.headline.metric} ${num(g.headline.value, 2)}${limit}`);
  }
  if (m.caught) parts.push(`heard ${String(m.heard)} of ${String(m.expected)} notes, ${String(m.extras)} extra`);
  else parts.push("not enough heard to judge");
  if (m.evenness !== null) parts.push(`evenness ${num(m.evenness, 2)}`);
  if (m.noteIdentity !== null) parts.push(`right notes ${num(m.noteIdentity, 2)}`);
  // "Before" read now (nf1c L2): an earlier Take of this Session marked not
  // fair since drops out of it. The clause is said only while it still equals
  // the value frozen when the Take settled, so the model is never handed a
  // not-fair tempo as a fact; the "now" test below reads the live value.
  const self = outcomes.find((o) => o === take) ?? outcomes.find((o) => o.takeId !== undefined && o.takeId === take.takeId);
  const before = self ? cleanBeforeOutcome(progress, outcomes, self) : take.cleanBefore;
  if (take.cleanBefore !== null && before === take.cleanBefore) {
    parts.push(`clean tempo before ${String(take.cleanBefore)}`);
  }
  // "Now" only when this Take moved the clean tempo the app shows: not when it
  // stayed at or under the one before, and not once the player marked its grade
  // not fair (nf1b L3: the model must not quote a number Progress never shows).
  if (
    g.cleanBpm !== null &&
    (before === null || g.cleanBpm > before) &&
    outcomeCountsTowardCleanTempo(progress, take.takeId)
  ) {
    parts.push(`clean tempo now ${String(g.cleanBpm)}`);
  }
  return parts.join("; ");
}

function findingsLine(review: SongAttemptReview): string | null {
  if (review.findings.length === 0) return null;
  const said = review.findings.slice(0, 3).map((f) => {
    const bars = f.evidence.printedBars ?? (f.bars ? [f.bars[0] + 1, f.bars[1] + 1] : null);
    const where = bars ? ` bars ${String(bars[0])}-${String(bars[1])}` : "";
    return `${f.kind}${where}, ${num(f.evidence.meanDeviationMs)} ms (negative early), ${String(f.evidence.hits)}/${String(f.evidence.onsets)} hit`;
  });
  return `findings: ${said.join("; ")}`;
}

function historyLine(rows: readonly PathTakeRow[]): string | null {
  if (rows.length === 0) return null;
  const said = rows.map((row) => {
    const facts = (row.facts ?? {}) as TakeFacts;
    return `${String(row.bpm)} bpm ${facts.verdict ?? (row.passed ? "passed" : "?")}`;
  });
  return `takes here, newest first: ${said.join(", ")}`;
}

/**
 * The context as lines a model reads, most important first, inside
 * `maxTokens` by `estimateTokens`. A line that does not fit is left out whole
 * and the next, shorter one is tried; the first line (where the player is) is
 * clipped to fit rather than dropped, so the answer is never empty.
 */
export function contextForModel(ctx: CoachContext, maxTokens = 450): string {
  const lines: Array<string | null> = [];
  const add = (line: string | null | undefined) => {
    if (line) lines.push(line);
  };

  add(`screen ${ctx.screen}; language ${ctx.locale}; grading ${ctx.grading}; input ${ctx.input.listening ? "listening" : "off"}${ctx.input.direct ? " (direct)" : ""}${ctx.input.failure ? ` (failed: ${ctx.input.failure})` : ""}`);
  if (ctx.path) add(`path: ${clip(ctx.path.title, 80)} (${ctx.path.kind}); goal: ${clip(ctx.path.goal)}`);
  if (ctx.step) add(`step ${String(ctx.step.order)}: ${clip(ctx.step.title, 80)}; goal: ${clip(ctx.step.goal)}`);
  if (ctx.exercise) add(`exercise: ${clip(ctx.exercise.title, 80)}; purpose: ${clip(ctx.words?.purpose ?? ctx.exercise.purpose)}`);
  if (ctx.run) {
    const total = (ctx.run.plan ?? ctx.plan)?.steps.length;
    add(
      `session: ${ctx.run.phase}, block ${String(ctx.run.stepIndex + 1)}${total ? ` of ${String(total)}` : ""}, ${String(ctx.run.bpm)} bpm, ${String(ctx.run.takes)} takes on this block${ctx.run.ungraded ? `, ungraded (${ctx.run.ungraded})` : ""}`,
    );
  }
  if (ctx.lastTake) add(`last ${takeLine(ctx.lastTake, ctx.progress, ctx.run?.outcomes)}`);
  if (ctx.review) add(findingsLine(ctx.review));
  if (ctx.takesHere) add(historyLine(ctx.takesHere));
  if (ctx.song) add(`song: ${clip(ctx.song.song.name, 80)}, bars ${String(ctx.song.range.startBar)}-${String(ctx.song.range.endBar)}`);
  if (ctx.song?.review) add(findingsLine(ctx.song.review));
  if (ctx.jam) add(`jam: ${clip(ctx.jam.jam.name, 80)} at ${String(ctx.jam.jam.bpm)} bpm`);
  if (ctx.tool?.info.bpm !== undefined) add(`tool at ${String(ctx.tool.info.bpm)} bpm`);
  if (ctx.due) add(`reviews due: ${String(ctx.due.length)}`);
  add(`history: ${String(ctx.progress.takes.length)} takes kept, ${String(ctx.progress.states.length)} paths started`);
  if (ctx.step) add(`why this step: ${clip(ctx.step.why)}`);
  if (ctx.words && ctx.words.howTo.length > 0) add(`how to: ${clip(ctx.words.howTo.join(" / "), 240)}`);
  if (ctx.exercise && ctx.exercise.notGraded.length > 0) add(`not graded here: ${ctx.exercise.notGraded.join(", ")}`);
  if (ctx.path) add(`grading limits: ${clip(ctx.path.gradingLimits, 240)}`);

  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    if (line === null) continue;
    // Each line after the first costs its newline as well.
    const cost = estimateTokens(kept.length === 0 ? line : `\n${line}`);
    if (used + cost <= maxTokens) {
      kept.push(line);
      used += cost;
    } else if (kept.length === 0) {
      kept.push(clipToTokens(line, maxTokens));
      used = estimateTokens(kept[0]);
    }
  }
  return kept.join("\n");
}

/** The longest start of `text` that fits `maxTokens`, with an ellipsis. */
function clipToTokens(text: string, maxTokens: number): string {
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(`${chars.slice(0, mid).join("")}…`) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  return lo === 0 ? "" : `${chars.slice(0, lo).join("")}…`;
}
