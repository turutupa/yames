/**
 * Every tool by a chip (TOOLS 2.1, leg t1b1): what Ask offers in its empty
 * state and in the row above its text box, for the screen the player is on.
 *
 * `chooseToolChips` is pure: the facts in, at most `MAX_CHIPS` chips out, in
 * the order they are worth offering. `chipFacts` reads those facts from the
 * tools' host and the coach's context, and `toolChipsFor` drops any chip
 * whose tool says no here (`when(ctx)`, the same check the runner makes).
 * A chip press is an ordinary tool call through the runner.
 *
 * Tools that answer "not yet" (`loop_bars`, `make_exercise`, `explain_screen`,
 * `set_goal`) are never offered: a chip that can only say "not yet" is noise.
 * During a Take there are none: Ask is not mounted then.
 */
import type { CoachContext } from "../../coach/context";
import type { CoachToolHost } from "../../coach/tools/host";
import { findTool } from "../../coach/tools/registry";
import { line, takeRunning, type Line, type ToolCall } from "../../coach/tools/types";
import type { MainView } from "../main-window/MainHeader";

export const MAX_CHIPS = 4;

export type ToolChip = { id: string; label: Line; call: ToolCall };

export type ChipFacts = {
  /** The view on screen. */
  view: MainView;
  /** A Take is running (none then). */
  take: boolean;
  /** Today has a plan with something in it. */
  hasPlan: boolean;
  /** The plan's first Exercise's Step, by the titles the player reads. */
  nextStep: { path: string; step: number } | null;
  /** On a Step page: its Path and first Exercise. */
  stepPage: { path: string; exercise: string } | null;
  /** In a Session: which tempo nudges mean anything now; null outside one. */
  nudges: { slower: boolean; faster: boolean } | null;
  /** The click's subdivision on the tool screens, or null. */
  subdivision: number | null;
  /** A song is on screen. */
  song: boolean;
};

const chip = (id: string, key: string, call: ToolCall, values: Record<string, string | number> = {}): ToolChip => ({
  id,
  label: line(`coachTools.chip.${key}`, values),
  call,
});

const goTo = (screen: MainView) => chip(`go-${screen}`, "goTo", { tool: "go_to", args: { screen } }, { screen });
const slower = chip("slower", "slower", { tool: "set_tempo", args: { direction: "slower" } });
const faster = chip("faster", "faster", { tool: "set_tempo", args: { direction: "faster" } });
const startToday = chip("start-today", "startToday", { tool: "start_today", args: {} });
const settings = (section: string) => chip(`settings-${section}`, "openSettings", { tool: "open_settings", args: { section } }, { section });

function nextStepChip(next: ChipFacts["nextStep"]): ToolChip[] {
  if (!next) return [];
  return [chip("next-step", "openStep", { tool: "open_step", args: { path: next.path, step: next.step } }, next)];
}

/** The click's other common setting: one click a beat, or two. */
function subdivisionChip(sub: number | null): ToolChip[] {
  if (sub === null) return [];
  const to = sub === 1 ? 2 : 1;
  return [chip("subdivision", to === 2 ? "twoClicks" : "oneClick", { tool: "click_subdivision", args: { subdivision: to } })];
}

/** The chips for these facts, best first, at most `MAX_CHIPS`. Pure. */
export function chooseToolChips(f: ChipFacts): ToolChip[] {
  if (f.take) return [];
  let list: ToolChip[];
  switch (f.view) {
    case "today":
      list = [...(f.hasPlan ? [startToday] : []), ...nextStepChip(f.nextStep), goTo("paths"), settings("practice")];
      break;
    case "paths":
      list = [
        ...(f.stepPage ? [chip("play-first", "playExercise", { tool: "play_exercise", args: { exercise: f.stepPage.exercise, path: f.stepPage.path } }, { title: f.stepPage.exercise })] : []),
        ...(f.stepPage ? [] : nextStepChip(f.nextStep)),
        ...(f.hasPlan ? [startToday] : []),
        goTo("today"),
      ];
      break;
    case "progress":
      list = [...(f.hasPlan ? [startToday] : []), goTo("paths"), goTo("today")];
      break;
    case "tools":
      list = [goTo("beat"), goTo("drill"), goTo("jam"), goTo("songs")];
      break;
    case "beat":
    case "drill":
      list = [slower, faster, ...subdivisionChip(f.subdivision), goTo("today")];
      break;
    case "jam":
      list = [slower, faster, goTo("today")];
      break;
    case "setlist":
      list = [goTo("today"), settings("practice")];
      break;
    case "songs":
      list = [...(f.song ? [chip("bars", "showBars", { tool: "show_bars", args: { from: 1, to: 4 } }, { from: 1, to: 4 })] : []), goTo("today")];
      break;
    case "session":
      list = [
        ...(f.nudges?.slower ? [slower] : []),
        ...(f.nudges?.faster ? [faster] : []),
        settings("practice"),
      ];
      break;
    default:
      list = [];
  }
  return list.slice(0, MAX_CHIPS);
}

/** The facts, read once from the host and the context (in a handler or a memo, never per beat). */
export function chipFacts(host: CoachToolHost, ctx: CoachContext): ChipFacts {
  const view = host.view();
  const paths = host.paths();
  const plan = host.plan();
  const first = plan?.steps.find((s) => s.kind === "exercise");
  let nextStep: ChipFacts["nextStep"] = null;
  if (first && first.kind === "exercise") {
    const path = paths.find((p) => p.id === first.pathId);
    const step = path?.steps.find((s) => s.id === first.stepId);
    if (path && step) nextStep = { path: path.title, step: step.order };
  }
  let stepPage: ChipFacts["stepPage"] = null;
  const at = host.pathsAt();
  if (view === "paths" && at.pathId && at.stepId) {
    const path = paths.find((p) => p.id === at.pathId);
    const exercise = path?.steps.find((s) => s.id === at.stepId)?.exercises[0];
    if (path && exercise) stepPage = { path: path.title, exercise: exercise.title };
  }
  const nudges = host.sessionActive() ? host.nudges() : null;
  const sub = view === "beat" || view === "drill" ? host.clickSubdivision() : null;
  return {
    view,
    take: takeRunning(ctx),
    hasPlan: !!plan && plan.steps.length > 0,
    nextStep,
    stepPage,
    nudges: nudges === "notWiredYet" ? null : nudges,
    subdivision: typeof sub === "number" ? sub : null,
    song: ctx.song !== undefined,
  };
}

/** The chips for where the player is: chosen, then each checked against its tool's `when`. */
export function toolChipsFor(host: CoachToolHost, ctx: CoachContext): ToolChip[] {
  return chooseToolChips(chipFacts(host, ctx)).filter((c) => {
    const tool = findTool(c.call.tool);
    try {
      return tool !== undefined && tool.audience === "player" && tool.when(ctx);
    } catch {
      return false;
    }
  });
}
