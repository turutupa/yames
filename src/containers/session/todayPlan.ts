/**
 * Today's plan as a list (panel review, 2026-11-17): what each row says.
 *
 * One rule for the words: the label names the step's ROLE in plain words
 * ("Find your level", "Review"), and the Path's kind (mechanics or theory) is a
 * colour only, on the row's dot and its stretch of the time bar. The tag used
 * to take its colour from the kind and its text from the role, so "PLACEMENT"
 * and "MECHANICS" stood in the same place meaning different things.
 *
 * The reason line is short because the row already says the rest: the target
 * BPM sits in the right-hand column and the Path's name on the meta line, so a
 * reason no longer repeats either. A reason that carries a measured value
 * ("Evenness was 78% at 80 BPM. The pass mark is 85%.") keeps its full sentence.
 */
import type { PathDoc } from "../../paths/format";
import type { Line } from "../../session/coachWords";
import { reasonLine } from "../../session/coachWords";
import { kindOfPath } from "../../session/kind";
import type { PlanStep, Reason } from "../../session/planner";
import { chosenLevelOf, currentStepOf, levelOfStep } from "../../session/progress";
import type { PlayerProgress } from "../../session/progress";

export type RoleWord =
  | "warmUp"
  | "new"
  | "nextUp"
  | "recap"
  | "edge"
  | "review"
  | "placement"
  | "benchmark"
  | "test"
  | "yourTurn"
  | "finisher"
  | "jam"
  | "drill";

/** Every role a row can name, for the locale tests. */
export const ROLE_WORDS: readonly RoleWord[] = [
  "warmUp",
  "new",
  "nextUp",
  "recap",
  "edge",
  "review",
  "placement",
  "benchmark",
  "test",
  "yourTurn",
  "finisher",
  "jam",
  "drill",
];

/** Reasons that start something the player has not played. */
const NEW_CODES = new Set(["firstEver", "newExercise", "newStep"]);

/** What the step is for, in plain words: the key under `session.today.role`. */
export function roleOf(step: PlanStep): RoleWord {
  switch (step.kind) {
    case "exercise":
      switch (step.role) {
        case "focus":
        case "next":
          return NEW_CODES.has(step.why.code) ? "new" : "nextUp";
        case "recap":
          return "recap";
        case "edge":
          return "edge";
        case "review":
          return "review";
        case "placement":
          return "placement";
        case "test":
          return "test";
        case "benchmark":
          return "benchmark";
      }
      return "nextUp";
    case "jam":
      return step.exerciseId ? "finisher" : "jam";
    case "drill":
      return "drill";
    case "metronome":
      return step.why.code === "yourTurn" ? "yourTurn" : "warmUp";
    case "loop":
      // Never a row of Today: a loop lives inside its Exercise's block.
      return "nextUp";
  }
}

export function roleKey(step: PlanStep): string {
  return `session.today.role.${roleOf(step)}`;
}

/** The colour a row carries: its Path's kind when it is graded work on a Path. */
export type RowKind = "mechanics" | "theory" | "plain";

export function rowKind(step: PlanStep, paths: readonly Pick<PathDoc, "id" | "kind">[]): RowKind {
  if (step.kind !== "exercise") return "plain";
  return kindOfPath(paths, step.pathId);
}

/** The Path a step belongs to, by name, for the meta line. */
export function pathTitleOf(step: PlanStep, paths: readonly Pick<PathDoc, "id" | "title">[]): string | null {
  const id = "pathId" in step ? step.pathId : undefined;
  if (!id) return null;
  return paths.find((p) => p.id === id)?.title ?? null;
}

/** The tempo under the minutes: one number, or "from → to" for placement and a ramp. */
export function bpmLine(step: PlanStep): Line | null {
  if (step.kind === "exercise" && step.placement && step.placement.passAtBpm !== step.bpm) {
    return { key: "session.today.bpmRange", values: { from: step.bpm, to: step.placement.passAtBpm } };
  }
  if (step.kind === "drill") {
    return { key: "session.today.bpmRange", values: { from: step.startBpm, to: step.targetBpm } };
  }
  const bpm = "bpm" in step ? step.bpm : undefined;
  return typeof bpm === "number" ? { key: "session.today.bpm", values: { bpm } } : null;
}

/**
 * The short reasons, by code: the ones whose full sentence repeats the BPM or
 * the Path. Every other code keeps its `session.why` sentence, which is either
 * short already or quotes a measured value worth its length.
 */
const SHORT_REASONS = new Set([
  "firstEver",
  "newExercise",
  "newStep",
  "nextInStep",
  "climb",
  "passedKeepGoing",
  "backEased",
  "warmUp",
  "warmUpClean",
  "edge",
  "edgeFirst",
  "reviewDue",
  "finisher",
  "placement",
  "testOut",
  "benchmark",
  "yourTurn",
  "jam",
]);

/** Today's sentence for why a step is here. `earlier` is the rows above it. */
export function shortReason(step: PlanStep, earlier: readonly PlanStep[] = []): Line {
  const why = step.why;
  const full = reasonLine(why);
  if (!SHORT_REASONS.has(why.code)) return full;
  // The variant the full sentence picked (reviewDueLeft, backEasedNoClean…),
  // under Today's own group.
  const name = full.key.replace(/^session\.why\./, "");
  // Two Exercises from one Step side by side said "Next in One-string
  // sixteenths. It starts at 60 BPM." twice, word for word (the owner's
  // screenshot). The second says it follows the first.
  if (why.code === "nextInStep" || why.code === "newStep") {
    const again = earlier.some(
      (s) =>
        (s.why.code === "nextInStep" || s.why.code === "newStep") &&
        s.why.values.step === why.values.step,
    );
    if (again) return { key: "session.today.reason.nextInStepAgain", values: why.values };
  }
  return { key: `session.today.reason.${name}`, values: why.values };
}

/** Whose turn it is, without the Path's name (the meta line has it). */
export function shortContext(context: Reason): Line {
  const full = reasonLine(context);
  if (context.code === "focusTurn" || context.code === "keepWarm" || context.code === "focusChosen") {
    return { key: full.key.replace(/^session\.why\./, "session.today.context."), values: full.values };
  }
  return full;
}

/** The time bar's ticks: every five minutes, and the end. */
export function ticksOf(total: number): number[] {
  const ticks: number[] = [];
  for (let m = 0; m < total; m += 5) ticks.push(m);
  ticks.push(total);
  return ticks;
}

/**
 * Where today's plan comes from, one line a Path (acceptance P1-11): "Sweep
 * Picking · Beginner · Step 1". The Paths in the order the plan first meets
 * them; a Path in the plan the player no longer follows is left out.
 */
export function planSources(
  steps: readonly PlanStep[],
  paths: readonly PathDoc[],
  progress: PlayerProgress,
): Array<{ pathId: string; title: string; levelId: string | null; step: number }> {
  const seen: string[] = [];
  for (const step of steps) {
    const id = "pathId" in step ? step.pathId : undefined;
    if (id && !seen.includes(id)) seen.push(id);
  }
  return seen.flatMap((id) => {
    const path = paths.find((p) => p.id === id);
    if (!path || !path.steps?.length) return [];
    const current = currentStepOf(progress, path);
    const level = chosenLevelOf(progress, path) ?? levelOfStep(path, current.id);
    return [{ pathId: id, title: path.title, levelId: level?.id ?? null, step: current.order }];
  });
}
