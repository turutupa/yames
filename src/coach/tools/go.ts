/**
 * The `go` tools: at once, with a receipt and the call that undoes it.
 *
 * TOOLS 2.2: `go_to`, `open_path`, `open_step`, `open_settings`, and the
 * app's own `return_to` (the undo every one of them returns). Going
 * somewhere because the player asked is not the coach acting on its own; it
 * is reversible in one tap, nothing sounds and nothing is stored.
 *
 * Two rules beside the kind's:
 *
 * - **A Session is started, not navigated to**, and left only by the player
 *   (its Exit, which asks). So `go_to` has no `session`, and the three that
 *   change the screen refuse while a Session is open. `open_settings` does
 *   not: Settings opened from a Session covers it and comes back to it, as
 *   "Check my sound" does.
 * - **Nothing runs while a Take runs** (`takeRunning`), for every tool.
 */

import type { MainView } from "../../containers/main-window/MainHeader";
import type { PathsAt } from "../../containers/main-window/hooks/usePathsPlace";
import type { PathDoc } from "../../paths/format";
import type { CoachContext } from "../context";
import { MAX_ID } from "../blocks/spec";
import { SETTINGS_SECTIONS, type CoachToolHost, type SettingsSection } from "./host";
import { MAX_CHOICES, resolvePath, resolveStep, type Resolved, type StepHit } from "./resolve";
import {
  argNumber,
  argString,
  inSession,
  line,
  refuse,
  takeRunning,
  type ActTool,
  type Refusal,
  type ToolArgs,
  type ToolCall,
  type ToolChoice,
  type ToolResult,
} from "./types";

/** Where `go_to` may go. Never `session`: a Session is started, not navigated to. */
export const GO_TO_SCREENS = [
  "today",
  "paths",
  "progress",
  "tools",
  "beat",
  "drill",
  "setlist",
  "jam",
  "songs",
  "settings",
] as const satisfies readonly Exclude<MainView, "session">[];

/** Every view, for `return_to` (the app's own undo may go back to a Session). */
const ALL_VIEWS = [...GO_TO_SCREENS, "session"] as const satisfies readonly MainView[];

/** The longest a player's words may be. */
export const MAX_QUERY = 80;

/** A Step's number on its Path, as the player counts it. */
export const MAX_STEP = 99;

/** Where the app is, as an undo needs it. */
type Place = { view: MainView; at: PathsAt };

function placeOf(host: CoachToolHost): Place {
  return { view: host.view(), at: host.pathsAt() };
}

/** The call that puts the app back at `place`. */
export function returnTo(place: Place): ToolCall {
  const args: Record<string, string> = { screen: place.view };
  if (place.at.pathId) args.path = place.at.pathId;
  if (place.at.pathId && place.at.stepId) args.step = place.at.stepId;
  return { tool: "return_to", args };
}

function samePlace(a: PathsAt, b: PathsAt): boolean {
  return a.pathId === b.pathId && a.stepId === b.stepId;
}

/** Between Takes, and not inside a Session. */
function outsideSession(ctx: CoachContext): boolean {
  return !takeRunning(ctx) && !inSession(ctx);
}

const sessionOpen = (): Refusal => refuse("notNow", "coachTools.why.notNow.session");

/** Show `at` on Paths, from wherever the app is, and say so. */
function openOnPaths(host: CoachToolHost, at: PathsAt, receipt: ToolResult & { ok: true }): ToolResult {
  const before = placeOf(host);
  if (before.view === "paths" && samePlace(before.at, at)) {
    return { ok: true, receipt: line("coachTools.receipt.alreadyThere", { screen: "paths" }) };
  }
  // The place first: `usePathsPlace` reads it when the view arrives on Paths.
  host.movePaths(at);
  host.setView("paths");
  return { ...receipt, undo: returnTo(before) };
}

function pathChoices(several: readonly PathDoc[], extra: ToolArgs = {}, tool = "open_path"): ToolChoice[] {
  return several.map((path) => ({
    label: line("coachTools.choice.path", { path: path.title }),
    call: { tool, args: { ...extra, path: path.title } },
  }));
}

function stepChoices(several: readonly StepHit[]): ToolChoice[] {
  return several.slice(0, MAX_CHOICES).map(({ path, step }) => ({
    label: line("coachTools.choice.step", { path: path.title, step: step.order, title: step.title }),
    call: { tool: "open_step", args: { path: path.title, step: step.order } },
  }));
}

// ---------------------------------------------------------------------------

const goTo: ActTool = {
  name: "go_to",
  kind: "go",
  audience: "player",
  note: "Show a screen.",
  args: [{ name: "screen", type: { kind: "enum", values: GO_TO_SCREENS }, note: "The screen to show." }],
  when: outsideSession,
  run(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const screen = argString(args, "screen") as MainView;
    const before = placeOf(host);
    if (before.view === screen) return { ok: true, receipt: line("coachTools.receipt.alreadyThere", { screen }) };
    host.setView(screen);
    return { ok: true, receipt: line("coachTools.receipt.goTo", { screen }), undo: returnTo(before) };
  },
};

const openPath: ActTool = {
  name: "open_path",
  kind: "go",
  audience: "player",
  note: "Open a Path's page, named in the player's words.",
  args: [{ name: "path", type: { kind: "query", maxLength: MAX_QUERY }, note: "The Path, as the player names it." }],
  when: outsideSession,
  run(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const query = argString(args, "path") ?? "";
    const found = resolvePath(query, host.paths());
    if ("none" in found) return refuse("notFound", "coachTools.why.notFound.path", { query });
    if ("several" in found) {
      return refuse("notFound", "coachTools.why.which", { query }, { choices: pathChoices(found.several) });
    }
    const path = found.found;
    return openOnPaths(host, { pathId: path.id, stepId: null }, {
      ok: true,
      receipt: line("coachTools.receipt.openPath", { path: path.title }),
    });
  },
};

/** The Path a Step is asked on: the one named, else the one the player is on. */
function pathForStep(args: ToolArgs, host: CoachToolHost, ctx: CoachContext): Resolved<PathDoc> | null {
  const named = argString(args, "path");
  const paths = host.paths();
  if (named !== undefined) return resolvePath(named, paths);
  const id = host.pathsAt().pathId ?? ctx.path?.id ?? null;
  const here = id ? paths.find((path) => path.id === id) : undefined;
  return here ? { found: here } : null;
}

const openStep: ActTool = {
  name: "open_step",
  kind: "go",
  audience: "player",
  note: "Open a Step's page, by its number on the Path or by the player's words.",
  args: [
    {
      name: "path",
      type: { kind: "query", maxLength: MAX_QUERY },
      optional: true,
      note: "The Path, as the player names it. Left out: the Path the player is on, or every Path for `query`.",
    },
    { name: "step", type: { kind: "integer", min: 1, max: MAX_STEP }, optional: true, note: "The Step's number on its Path." },
    { name: "query", type: { kind: "query", maxLength: MAX_QUERY }, optional: true, note: "The Step, as the player names it." },
  ],
  when: outsideSession,
  run(args, host, ctx) {
    if (host.sessionActive()) return sessionOpen();
    const number = argNumber(args, "step");
    const query = argString(args, "query");
    if (number === undefined && query === undefined) {
      return refuse("refused", "coachTools.why.refused.shape", {}, { detail: "open_step needs `step` or `query`" });
    }
    const path = pathForStep(args, host, ctx);
    if (path && "none" in path) return refuse("notFound", "coachTools.why.notFound.path", { query: argString(args, "path") ?? "" });
    if (path && "several" in path) {
      const keep: Record<string, string | number> = {};
      if (number !== undefined) keep.step = number;
      if (query !== undefined) keep.query = query;
      return refuse("notFound", "coachTools.why.which", { query: argString(args, "path") ?? "" }, {
        choices: pathChoices(path.several, keep, "open_step"),
      });
    }
    if (!path && number !== undefined) {
      // "Step 3", and no Path to count it on.
      return refuse("notFound", "coachTools.why.notFound.whichPath", { step: number });
    }
    const on = path ? { path: path.found } : { paths: host.paths() };
    const ask = number !== undefined ? { number } : { query: query ?? "" };
    const found = resolveStep(on, ask);
    if ("none" in found) {
      return refuse("notFound", "coachTools.why.notFound.step", number !== undefined ? { step: number } : { query: query ?? "" });
    }
    if ("several" in found) {
      return refuse("notFound", "coachTools.why.which", { query: query ?? "" }, { choices: stepChoices(found.several) });
    }
    const { path: doc, step } = found.found;
    return openOnPaths(host, { pathId: doc.id, stepId: step.id }, {
      ok: true,
      receipt: line("coachTools.receipt.openStep", { path: doc.title, step: step.order, title: step.title }),
    });
  },
};

const SECTION_NAMES = Object.keys(SETTINGS_SECTIONS) as SettingsSection[];

const openSettings: ActTool = {
  name: "open_settings",
  kind: "go",
  audience: "player",
  note: "Open Settings at a section: also how the player is shown a control that is theirs alone.",
  args: [{ name: "section", type: { kind: "enum", values: SECTION_NAMES }, note: "The section." }],
  // From a Session too, between Takes: Settings covers it and comes back to it.
  when: (ctx) => !takeRunning(ctx),
  run(args, host) {
    const section = argString(args, "section") as SettingsSection;
    const before = placeOf(host);
    host.openSettingsSection(section);
    const receipt = line("coachTools.receipt.openSettings", { section });
    return before.view === "settings" ? { ok: true, receipt } : { ok: true, receipt, undo: returnTo(before) };
  },
};

/**
 * The undo of every `go`: back to the view and the Paths place the app was
 * at. The app's own call (`audience: "app"`): never in the catalogue, never
 * reachable from `runCoachTool`, only from `runCoachUndo`. Its ids are the
 * app's, and still checked against the Paths as they are now.
 */
const returnToTool: ActTool = {
  name: "return_to",
  kind: "go",
  audience: "app",
  note: "Back to where the app was before a `go` tool ran.",
  args: [
    { name: "screen", type: { kind: "enum", values: ALL_VIEWS }, note: "The view to show." },
    { name: "path", type: { kind: "appId", maxLength: MAX_ID }, optional: true, note: "The Path Paths was on." },
    { name: "step", type: { kind: "appId", maxLength: MAX_ID }, optional: true, note: "The Step Paths was on." },
  ],
  when: (ctx) => !takeRunning(ctx),
  run(args, host) {
    const screen = argString(args, "screen") as MainView;
    const active = host.sessionActive();
    if (screen === "session" && !active) return refuse("notNow", "coachTools.why.notNow.sessionOver");
    // Back to a screen outside the Session would walk out of it.
    if (active && screen !== "session" && screen !== "settings") return sessionOpen();
    const pathId = argString(args, "path") ?? null;
    const stepId = argString(args, "step") ?? null;
    const path = pathId ? host.paths().find((p) => p.id === pathId) : undefined;
    const step = path && stepId ? path.steps.find((s) => s.id === stepId) : undefined;
    // What no longer exists is dropped: the deepest place that still does.
    const at: PathsAt = { pathId: path?.id ?? null, stepId: step?.id ?? null };
    if (!samePlace(host.pathsAt(), at)) host.movePaths(at);
    host.setView(screen);
    return { ok: true, receipt: line("coachTools.receipt.returnTo", { screen }) };
  },
};

export const GO_TOOLS: readonly ActTool[] = [goTo, openPath, openStep, openSettings, returnToTool];
