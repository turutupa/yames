/**
 * The `confirm` tools that start or shape playing (TOOLS 2.2): `start_today`,
 * `play_exercise`, `set_tempo`, `find_edge`, `test_out`, and the two typed
 * and waiting, `loop_bars` and `make_exercise`.
 *
 * Each `propose` resolves the call against the app's own data and says exactly
 * what a press will do (the Exercise by its title, the tempo it will start at,
 * the rung a tempo snaps to); nothing changes until `confirmCoachTool`. Each
 * `commit` checks the app is still where the proposal saw it.
 *
 * The doors are the Session's own (`sessionRun.actions`), through the host.
 * Two of them have no tempo: `playExercise` starts where the Step page's Play
 * does, and inside a Session only one-rung nudges exist (`slower`, `faster`).
 * So `play_exercise` says the tempo it will really start at, and `set_tempo`
 * in a Session proposes a nudge or says which rungs can be reached. What a
 * real door would need is in `plans/coach/progress/t1a2.md`.
 */

import { gradedRungs, rungAbove, rungBelow } from "../../session/ladder";
import { edgeStep, testOutSteps } from "../../session/planner";
import { isGradable, lastCaughtTake, takesOf } from "../../session/progress";
import { findExercise } from "../../session/packs";
import type { Exercise, PathDoc } from "../../paths/format";
import type { PlayerProgress } from "../../session/progress";
import type { CoachContext } from "../context";
import { MAX_STEP, MAX_QUERY, outsideSession, resolveStepCall, sessionOpen } from "./go";
import type { CoachToolHost } from "./host";
import { MAX_CHOICES, resolveExercise, resolvePath, snapPart, snapToRung, type ExerciseHit } from "./resolve";
import { NECK_POSITIONS, ROOT_NAMES, SCALE_NAMES } from "../blocks/spec";
import {
  argNumber,
  argString,
  defineConfirmTool,
  inSession,
  line,
  notWiredYet,
  refuse,
  takeRunning,
  type ConfirmTool,
  type ProposeResult,
  type Refusal,
  type ToolArgs,
  type ToolChoice,
  type ToolResult,
} from "./types";

/** The most parts a plan has, as the player counts them. Snapped to the plan's own. */
export const MAX_PART = 20;

/** The tempo a tool screen allows: `MainWindow.handleBpmChange` clamps to this. */
export const TOOL_BPM_MIN = 20;
export const TOOL_BPM_MAX = 300;
/** A tool screen's Slower / Faster: the 5 BPM the bpm-up / bpm-down keys move. */
export const TOOL_BPM_STEP = 5;

/** The tool screens whose tempo `set_tempo` sets (the jam's is saved with the jam). */
const TEMPO_SCREENS = new Set(["beat", "drill", "jam"]);

/** A Session's tempo moves on its ready screen and its result, as Slower and Faster do (`tempoNudges`). */
function betweenTakes(ctx: CoachContext): boolean {
  const phase = ctx.run?.phase;
  return phase === "ready" || phase === "result";
}

/** The plan changed, the Session ended, a Take started: the proposal is not what the press would do any more. */
const gone = (detail: string): Refusal => refuse("refused", "coachTools.why.refused.proposal", {}, { detail });

// ---------------------------------------------------------------------------
// Resolution shared by the Exercise tools
// ---------------------------------------------------------------------------

function exerciseChoices(tool: string, several: readonly ExerciseHit[], keep: ToolArgs): ToolChoice[] {
  return several.slice(0, MAX_CHOICES).map(({ path, step, exercise }) => ({
    label: line("coachTools.choice.exercise", { path: path.title, step: step.order, title: exercise.title }),
    call: { tool, args: { ...keep, path: path.title, exercise: exercise.title } },
  }));
}

/** An Exercise from a call's `exercise` (the player's words) and `path?`. */
export function resolveExerciseCall(tool: string, args: ToolArgs, host: CoachToolHost): ExerciseHit | Refusal {
  const query = argString(args, "exercise") ?? "";
  const pathQuery = argString(args, "path");
  const keep: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(args)) if (name !== "path" && name !== "exercise") keep[name] = value;
  const paths = host.paths();
  let on: { path: PathDoc } | { paths: readonly PathDoc[] } = { paths };
  if (pathQuery !== undefined) {
    const path = resolvePath(pathQuery, paths);
    if ("none" in path) return refuse("notFound", "coachTools.why.notFound.path", { query: pathQuery });
    if ("several" in path) {
      return refuse("notFound", "coachTools.why.which", { query: pathQuery }, {
        choices: path.several.map((p) => ({
          label: line("coachTools.choice.path", { path: p.title }),
          call: { tool, args: { ...keep, path: p.title, exercise: query } },
        })),
      });
    }
    on = { path: path.found };
  }
  const found = resolveExercise(query, on);
  if ("none" in found) return refuse("notFound", "coachTools.why.notFound.exercise", { query });
  if ("several" in found) {
    return refuse("notFound", "coachTools.why.which", { query }, { choices: exerciseChoices(tool, found.several, keep) });
  }
  return found.found;
}

/**
 * Where the Step page's Play starts an Exercise (`useSessionRun.playExercise`):
 * the tempo of the last Take heard on it, else its first rung, else 60.
 * `practice.test.ts` holds the two to the same rule.
 */
export function playStartBpm(progress: PlayerProgress, pathId: string, exercise: Exercise): number {
  return lastCaughtTake(takesOf(progress, pathId, exercise.id))?.bpm ?? exercise.tempo.rungs[0]?.bpm ?? 60;
}

const exerciseArgs = [
  { name: "exercise", type: { kind: "query", maxLength: MAX_QUERY }, note: "The Exercise, as the player names it." },
  {
    name: "path",
    type: { kind: "query", maxLength: MAX_QUERY },
    optional: true,
    note: "The Path it is on, as the player names it. Left out: every Path.",
  },
] as const;

// ---------------------------------------------------------------------------

type StartToday = { at: number | null; stepId: string; parts: number };

const startToday = defineConfirmTool<StartToday>({
  name: "start_today",
  kind: "confirm",
  audience: "player",
  leaves: true,
  note: "Start today's Session, from the beginning or at one of its parts.",
  args: [
    { name: "at", type: { kind: "integer", min: 1, max: MAX_PART }, optional: true, note: "The part to start at, counted from 1." },
  ],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const plan = host.plan();
    if (!plan || plan.steps.length === 0) return refuse("notNow", "coachTools.why.notNow.noPlan");
    const asked = argNumber(args, "at");
    const at = asked === undefined ? null : snapPart(asked, plan.steps.length);
    const step = plan.steps[at ?? 0];
    const resolved = { at, stepId: step.id, parts: plan.steps.length };
    return at === null
      ? { ok: true, line: line("coachTools.propose.startToday", { minutes: plan.minutes, parts: plan.steps.length, title: step.title }), resolved }
      : { ok: true, line: line("coachTools.propose.startTodayAt", { minutes: plan.minutes, part: at + 1, title: step.title }), resolved };
  },
  commit({ at, stepId, parts }, host) {
    if (host.sessionActive()) return sessionOpen();
    const plan = host.plan();
    // Started from what was shown, or not at all.
    if (!plan || plan.steps.length !== parts || plan.steps[at ?? 0]?.id !== stepId) return gone("the plan changed");
    if (host.startToday(at) === "notWiredYet") return notWiredYet("start_today");
    const title = plan.steps[at ?? 0].title;
    return { ok: true, receipt: line("coachTools.receipt.startToday", { part: (at ?? 0) + 1, title }) };
  },
});

type PlayExercise = { pathId: string; exerciseId: string; bpm: number };

const playExercise = defineConfirmTool<PlayExercise>({
  name: "play_exercise",
  kind: "confirm",
  audience: "player",
  leaves: true,
  note: "Play one Exercise now, as a short Session of its own.",
  args: [
    ...exerciseArgs,
    { name: "bpm", type: { kind: "integer", min: 1, max: 999 }, optional: true, note: "A tempo, snapped to one of the Exercise's rungs." },
  ],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const hit = resolveExerciseCall("play_exercise", args, host);
    if (!("exercise" in hit)) return hit;
    const { path, step, exercise } = hit;
    const bpm = playStartBpm(host.progress(), path.id, exercise);
    const wanted = argNumber(args, "bpm");
    const asked = wanted === undefined ? null : snapToRung(exercise, wanted);
    const values = { path: path.title, step: step.order, title: exercise.title, bpm };
    const resolved = { pathId: path.id, exerciseId: exercise.id, bpm };
    // The Step page's Play has no tempo: say where it really starts, and what was asked.
    return asked === null || asked === bpm
      ? { ok: true, line: line("coachTools.propose.playExercise", values), resolved }
      : { ok: true, line: line("coachTools.propose.playExerciseNotAt", { ...values, asked }), resolved };
  },
  commit({ pathId, exerciseId, bpm }, host) {
    if (host.sessionActive()) return sessionOpen();
    const path = host.paths().find((p) => p.id === pathId);
    const exercise = path ? findExercise(path, exerciseId)?.exercise : undefined;
    if (!path || !exercise) return gone("the Exercise is not there any more");
    if (playStartBpm(host.progress(), pathId, exercise) !== bpm) return gone("the start tempo moved");
    if (host.playExercise(pathId, exerciseId, null) === "notWiredYet") return notWiredYet("play_exercise");
    return { ok: true, receipt: line("coachTools.receipt.playExercise", { path: path.title, title: exercise.title, bpm }) };
  },
});

type SetTempo =
  | { mode: "nudge"; direction: "slower" | "faster"; from: number; to: number }
  | { mode: "set"; from: number; to: number };

const setTempo = defineConfirmTool<SetTempo>({
  name: "set_tempo",
  kind: "confirm",
  audience: "player",
  note: "Set the tempo: in a Session a rung of the Exercise (one step at a time); in the Metronome, the Drill or a jam, any tempo the app allows.",
  args: [
    { name: "bpm", type: { kind: "integer", min: 1, max: 999 }, optional: true, note: "The tempo asked for. Snapped to what the screen allows." },
    { name: "direction", type: { kind: "enum", values: ["slower", "faster"] }, optional: true, note: "One step slower or faster." },
  ],
  when: (ctx) => !takeRunning(ctx) && (inSession(ctx) ? betweenTakes(ctx) : TEMPO_SCREENS.has(ctx.screen)),
  propose(args, host, ctx) {
    const bpm = argNumber(args, "bpm");
    const direction = argString(args, "direction") as "slower" | "faster" | undefined;
    if ((bpm === undefined) === (direction === undefined)) {
      return refuse("refused", "coachTools.why.refused.shape", {}, { detail: "set_tempo needs `bpm` or `direction`, not both" });
    }
    if (inSession(ctx) || host.sessionActive()) return proposeRung(bpm, direction, host, ctx);
    if (!TEMPO_SCREENS.has(host.view())) return refuse("notNow", "coachTools.why.notNow.here", { tool: "set_tempo" });
    const now = host.tempo();
    if (now === "notWiredYet") return notWiredYet("set_tempo");
    const wanted = bpm ?? now + (direction === "slower" ? -TOOL_BPM_STEP : TOOL_BPM_STEP);
    const to = Math.max(TOOL_BPM_MIN, Math.min(TOOL_BPM_MAX, Math.round(wanted)));
    if (to === now) return refuse("notNow", "coachTools.why.notNow.alreadyAt", { bpm: now });
    return { ok: true, line: line("coachTools.propose.setTempo", { from: now, to }), resolved: { mode: "set", from: now, to } };
  },
  commit(resolved, host, ctx): ToolResult {
    if (resolved.mode === "nudge") {
      if (ctx.run?.bpm !== resolved.from || !betweenTakes(ctx)) return gone("the tempo moved");
      const can = host.nudges();
      if (can === "notWiredYet") return notWiredYet("set_tempo");
      if (!can[resolved.direction]) return gone("that way is closed now");
      if (host.nudgeTempo(resolved.direction) === "notWiredYet") return notWiredYet("set_tempo");
      return {
        ok: true,
        receipt: line("coachTools.receipt.setTempo", { from: resolved.from, to: resolved.to }),
        undo: { tool: "set_tempo", args: { direction: resolved.direction === "slower" ? "faster" : "slower" } },
      };
    }
    if (host.sessionActive()) return sessionOpen();
    if (host.tempo() !== resolved.from) return gone("the tempo moved");
    if (host.setTempo(resolved.to) === "notWiredYet") return notWiredYet("set_tempo");
    return {
      ok: true,
      receipt: line("coachTools.receipt.setTempo", { from: resolved.from, to: resolved.to }),
      undo: { tool: "set_tempo", args: { bpm: resolved.from } },
    };
  },
});

/**
 * `set_tempo` in a Session: the Exercise's rungs, one step at a time. A rung
 * one step away is a nudge (the only door the Session has); further away is
 * `notNow` with the rungs a step away as choices.
 */
function proposeRung(
  bpm: number | undefined,
  direction: "slower" | "faster" | undefined,
  host: CoachToolHost,
  ctx: CoachContext,
): ProposeResult<SetTempo> {
  const exercise = ctx.exercise;
  const now = ctx.run?.bpm;
  if (!exercise || now === undefined || !betweenTakes(ctx)) return refuse("notNow", "coachTools.why.notNow.here", { tool: "set_tempo" });
  const can = host.nudges();
  if (can === "notWiredYet") return notWiredYet("set_tempo");
  const nudge = (way: "slower" | "faster") => {
    const to = way === "slower" ? rungBelow(exercise, now) : rungAbove(exercise, now);
    return { ok: true as const, line: line("coachTools.propose.nudgeTempo", { direction: way, from: now, to }), resolved: { mode: "nudge" as const, direction: way, from: now, to } };
  };
  if (direction !== undefined) {
    return can[direction] ? nudge(direction) : refuse("notNow", "coachTools.why.notNow.tempoEnd", { direction, bpm: now });
  }
  const to = snapToRung(exercise, bpm ?? now);
  if (to === null) return refuse("notFound", "coachTools.why.notFound.rung", { bpm: bpm ?? now });
  if (to === now) return refuse("notNow", "coachTools.why.notNow.alreadyAt", { bpm: now });
  if (can.faster && to === rungAbove(exercise, now)) return nudge("faster");
  if (can.slower && to === rungBelow(exercise, now)) return nudge("slower");
  // No door for "again at a rung": the rungs a press away, as choices.
  const choices: ToolChoice[] = [];
  if (can.slower) choices.push({ label: line("coachTools.choice.rung", { bpm: rungBelow(exercise, now) }), call: { tool: "set_tempo", args: { direction: "slower" } } });
  if (can.faster) choices.push({ label: line("coachTools.choice.rung", { bpm: rungAbove(exercise, now) }), call: { tool: "set_tempo", args: { direction: "faster" } } });
  return refuse("notNow", "coachTools.why.notNow.rungFar", { asked: to, bpm: now, rungs: gradedRungs(exercise).length }, { choices });
}

type FindEdge = { pathId: string; exerciseId: string; bpm: number | null };

const findEdge = defineConfirmTool<FindEdge>({
  name: "find_edge",
  kind: "confirm",
  audience: "player",
  leaves: true,
  note: "Find my edge on one Exercise: a short climb from where the player is clean.",
  args: [...exerciseArgs],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const hit = resolveExerciseCall("find_edge", args, host);
    if (!("exercise" in hit)) return hit;
    const { path, step, exercise } = hit;
    if (!isGradable(exercise)) return refuse("notNow", "coachTools.why.notNow.notGradable", { title: exercise.title });
    const edge = edgeStep({ path, step, exercise }, host.progress());
    const bpm = edge.kind === "exercise" ? edge.bpm : null;
    return {
      ok: true,
      line: line("coachTools.propose.findEdge", { path: path.title, step: step.order, title: exercise.title, bpm: bpm ?? "" }),
      resolved: { pathId: path.id, exerciseId: exercise.id, bpm },
    };
  },
  commit({ pathId, exerciseId }, host) {
    if (host.sessionActive()) return sessionOpen();
    const path = host.paths().find((p) => p.id === pathId);
    const exercise = path ? findExercise(path, exerciseId)?.exercise : undefined;
    if (!path || !exercise) return gone("the Exercise is not there any more");
    if (host.findEdge(pathId, exerciseId) === "notWiredYet") return notWiredYet("find_edge");
    return { ok: true, receipt: line("coachTools.receipt.findEdge", { path: path.title, title: exercise.title }) };
  },
});

type TestOut = { pathId: string; stepId: string; takes: number };

const testOut = defineConfirmTool<TestOut>({
  name: "test_out",
  kind: "confirm",
  audience: "player",
  leaves: true,
  note: "Test out of a Step: one Take at each graded Exercise's pass tempo.",
  args: [
    { name: "path", type: { kind: "query", maxLength: MAX_QUERY }, optional: true, note: "The Path, as the player names it. Left out: the Path the player is on." },
    { name: "step", type: { kind: "integer", min: 1, max: MAX_STEP }, optional: true, note: "The Step's number on its Path." },
    { name: "query", type: { kind: "query", maxLength: MAX_QUERY }, optional: true, note: "The Step, as the player names it." },
  ],
  when: outsideSession,
  propose(args, host, ctx) {
    if (host.sessionActive()) return sessionOpen();
    const hit = resolveStepCall("test_out", args, host, ctx);
    if (!("step" in hit)) return hit;
    const { path, step } = hit;
    const takes = testOutSteps(path, step, host.progress()).length;
    if (takes === 0) return refuse("notNow", "coachTools.why.notNow.nothingToTest", { path: path.title, step: step.order });
    return {
      ok: true,
      line: line("coachTools.propose.testOut", { path: path.title, step: step.order, title: step.title, takes }),
      resolved: { pathId: path.id, stepId: step.id, takes },
    };
  },
  commit({ pathId, stepId, takes }, host) {
    if (host.sessionActive()) return sessionOpen();
    const path = host.paths().find((p) => p.id === pathId);
    const step = path?.steps.find((s) => s.id === stepId);
    if (!path || !step) return gone("the Step is not there any more");
    if (testOutSteps(path, step, host.progress()).length !== takes) return gone("the Step's Exercises changed");
    if (host.testOut(pathId, stepId) === "notWiredYet") return notWiredYet("test_out");
    return { ok: true, receipt: line("coachTools.receipt.testOut", { path: path.title, step: step.order, title: step.title }) };
  },
});

/** The Session's loop plays the bar that slipped, not bars named from outside (leg c1c): typed, waiting. */
const loopBars = defineConfirmTool<never>({
  name: "loop_bars",
  kind: "confirm",
  audience: "player",
  note: "Loop bars of the Exercise on screen, slow, until stopped.",
  args: [
    { name: "from", type: { kind: "integer", min: 1, max: 999 }, note: "The first bar, as printed." },
    { name: "to", type: { kind: "integer", min: 1, max: 999 }, optional: true, note: "The last bar, as printed. Left out: the first alone." },
  ],
  when: (ctx) => !takeRunning(ctx),
  propose: () => notWiredYet("loop_bars"),
  commit: () => notWiredYet("loop_bars"),
});

/** A custom Exercise (TOOLS 2.4, leg t2): typed, waiting. */
const makeExercise = defineConfirmTool<never>({
  name: "make_exercise",
  kind: "confirm",
  audience: "player",
  note: "Make a custom Exercise from a recipe, shown as a preview first.",
  args: [
    { name: "shape", type: { kind: "query", maxLength: MAX_QUERY }, note: "What to practise (a scale run, an arpeggio…), in the player's words." },
    { name: "root", type: { kind: "enum", values: ROOT_NAMES }, optional: true, note: "The root." },
    { name: "scale", type: { kind: "enum", values: SCALE_NAMES }, optional: true, note: "The scale." },
    { name: "position", type: { kind: "enum", values: NECK_POSITIONS }, optional: true, note: "Where on the neck." },
    { name: "subdivision", type: { kind: "integer", min: 1, max: 6 }, optional: true, note: "Notes per beat." },
    { name: "bars", type: { kind: "integer", min: 1, max: 8 }, optional: true, note: "How long." },
  ],
  when: (ctx) => !takeRunning(ctx),
  propose: () => notWiredYet("make_exercise"),
  commit: () => notWiredYet("make_exercise"),
});

export const PRACTICE_TOOLS: readonly ConfirmTool[] = [
  startToday,
  playExercise,
  setTempo,
  findEdge,
  testOut,
  loopBars,
  makeExercise,
];
