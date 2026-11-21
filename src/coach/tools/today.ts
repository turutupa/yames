/**
 * The `confirm` tools that change what Today plans (TOOLS 2.2): `swap_part`,
 * `set_minutes`, `set_focus`, `follow_path`, and the app's own
 * `restore_part` (the swap's undo).
 *
 * The plan redraws under the proposal before the press: `set_minutes` and
 * `set_focus` put the plan as it would be on the proposal (`plan`), built by
 * the same planner Today uses (`host.previewPlan`). `follow_path` has no undo
 * (leaving a Path is the player's alone, never a tool) and its proposal says
 * so (`noUndo`).
 */

import { FIRST_PATH_ID, isRunnable } from "../../session/packs";
import { MIX, type TodayFocus } from "../../session/focus";
import { isSubscribed, type PlayerProgress } from "../../session/progress";
import { SUBSCRIPTION_CAP } from "../../session/rotation";
import { SWAP_CHOICES, type SwapChoice } from "../../session/swap";
import { levelsOf } from "../../session/variants";
import type { PlanMinutes, PlanStep } from "../../session/planner";
import type { PathDoc } from "../../paths/format";
import { MAX_QUERY, outsideSession, sessionOpen } from "./go";
import type { CoachToolHost } from "./host";
import { MAX_PART } from "./practice";
import { matchByTitle, resolvePath, snapMinutes, snapPart } from "./resolve";
import {
  argNumber,
  argString,
  defineConfirmTool,
  line,
  notWiredYet,
  refuse,
  type ConfirmTool,
  type Refusal,
  type ToolChoice,
} from "./types";

const gone = (detail: string): Refusal => refuse("refused", "coachTools.why.refused.proposal", {}, { detail });

/**
 * The Paths the player follows, in the app's order, as Today plans from them
 * (`useSessionRun.playerPaths`, which lives in a container a tool may not
 * import): subscribed and runnable, or for a player who has started none, the
 * one everybody starts on. `today.test.ts` holds the two to the same rule.
 */
export function followedPaths(paths: readonly PathDoc[], progress: PlayerProgress): PathDoc[] {
  const mine = progress.states
    .filter((state) => isSubscribed(progress, state.pathId))
    .map((state) => paths.find((p) => p.id === state.pathId))
    .filter((path): path is PathDoc => !!path && isRunnable(path.id));
  if (mine.length > 0 || progress.states.length > 0) return mine;
  const first = paths.find((p) => p.id === FIRST_PATH_ID);
  return first ? [first] : [];
}

function noPlan(): Refusal {
  return refuse("notNow", "coachTools.why.notNow.noPlan");
}

// ---------------------------------------------------------------------------

type SwapPart = { index: number; shownId: string; from: string; replacement: PlanStep; wasSwapped: boolean };

const swapPart = defineConfirmTool<SwapPart>({
  name: "swap_part",
  kind: "confirm",
  audience: "player",
  note: "Swap one part of today's plan for something harder, different, or in another style, in the same minutes.",
  args: [
    { name: "at", type: { kind: "integer", min: 1, max: MAX_PART }, note: "The part, counted from 1." },
    { name: "choice", type: { kind: "enum", values: SWAP_CHOICES }, note: "What kind of swap." },
    { name: "to", type: { kind: "query", maxLength: MAX_QUERY }, optional: true, note: "Which of the offered replacements, by its title." },
  ],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const plan = host.plan();
    if (!plan || plan.steps.length === 0) return noPlan();
    const index = snapPart(argNumber(args, "at") ?? 1, plan.steps.length) ?? 0;
    const shown = plan.steps[index];
    const choice = argString(args, "choice") as SwapChoice;
    const options = host.swapOptions(index, choice);
    if (options === "notWiredYet") return notWiredYet("swap_part");
    const part = index + 1;
    if (options.candidates.length === 0) {
      return refuse("notNow", "coachTools.why.notNow.noSwap", { part, title: shown.title, none: options.none ?? choice });
    }
    const to = argString(args, "to");
    let replacement: PlanStep;
    if (to !== undefined) {
      const found = matchByTitle(to, options.candidates, (c) => c.title);
      if ("none" in found) return refuse("notFound", "coachTools.why.notFound.swap", { query: to, part });
      if ("several" in found) return refuse("notFound", "coachTools.why.which", { query: to }, { choices: swapChoices(found.several, part, choice) });
      replacement = found.found;
    } else if (options.candidates.length === 1) {
      replacement = options.candidates[0];
    } else {
      return refuse("notFound", "coachTools.why.which", { query: "" }, { choices: swapChoices(options.candidates, part, choice) });
    }
    return {
      ok: true,
      line: line("coachTools.propose.swapPart", { part, from: shown.title, to: replacement.title, choice }),
      resolved: { index, shownId: shown.id, from: shown.title, replacement, wasSwapped: "swappedFrom" in shown && !!shown.swappedFrom },
    };
  },
  commit({ index, shownId, from, replacement, wasSwapped }, host) {
    if (host.sessionActive()) return sessionOpen();
    const shown = host.plan()?.steps[index];
    if (!shown || shown.id !== shownId || shown.title !== from) return gone("the plan changed");
    if (host.confirmSwap(index, replacement) === "notWiredYet") return notWiredYet("swap_part");
    const part = index + 1;
    const receipt = line("coachTools.receipt.swapPart", { part, from, to: replacement.title });
    // Back to what the planner had: only when the part was the planner's before this swap.
    return wasSwapped
      ? { ok: true, receipt }
      : { ok: true, receipt, undo: { tool: "restore_part", args: { at: part, title: replacement.title } } };
  },
});

function swapChoices(candidates: readonly PlanStep[], part: number, choice: SwapChoice): ToolChoice[] {
  return candidates.map((c) => ({
    label: line("coachTools.choice.swap", { part, title: c.title }),
    call: { tool: "swap_part", args: { at: part, choice, to: c.title } },
  }));
}

type RestorePart = { index: number; shownId: string; title: string };

/** The swap's undo: the part back as the planner had it (`actions.undoSwap`). The app's own call. */
const restorePart = defineConfirmTool<RestorePart>({
  name: "restore_part",
  kind: "confirm",
  audience: "app",
  note: "Put a swapped part of today's plan back as the planner had it.",
  args: [
    { name: "at", type: { kind: "integer", min: 1, max: MAX_PART }, note: "The part, counted from 1." },
    { name: "title", type: { kind: "query", maxLength: MAX_QUERY }, note: "The title the part shows now, so a part that changed again is left alone." },
  ],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const plan = host.plan();
    const index = (argNumber(args, "at") ?? 1) - 1;
    const shown = plan?.steps[index];
    const title = argString(args, "title") ?? "";
    if (!shown || shown.title !== title) return gone("the part changed since the swap");
    return { ok: true, line: line("coachTools.propose.restorePart", { part: index + 1, title }), resolved: { index, shownId: shown.id, title } };
  },
  commit({ index, shownId, title }, host) {
    const shown = host.plan()?.steps[index];
    if (!shown || shown.id !== shownId || shown.title !== title) return gone("the part changed since the swap");
    if (host.undoSwap(index) === "notWiredYet") return notWiredYet("restore_part");
    return { ok: true, receipt: line("coachTools.receipt.restorePart", { part: index + 1, from: title }) };
  },
});

type SetMinutes = { from: PlanMinutes; to: PlanMinutes };

const setMinutes = defineConfirmTool<SetMinutes>({
  name: "set_minutes",
  kind: "confirm",
  audience: "player",
  note: "Change how long today's Session is: 5, 10, 15 or 20 minutes.",
  args: [{ name: "minutes", type: { kind: "integer", min: 1, max: 240 }, note: "Minutes, snapped to 5, 10, 15 or 20." }],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const from = host.minutes();
    const to = snapMinutes(argNumber(args, "minutes") ?? from);
    if (to === from) return refuse("notNow", "coachTools.why.notNow.alreadyMinutes", { minutes: from });
    const plan = host.previewPlan({ minutes: to });
    if (plan === "notWiredYet") return notWiredYet("set_minutes");
    return { ok: true, line: line("coachTools.propose.setMinutes", { from, to, parts: plan.steps.length }), resolved: { from, to }, plan };
  },
  commit({ from, to }, host) {
    if (host.sessionActive()) return sessionOpen();
    if (host.minutes() !== from) return gone("the minutes changed");
    if (host.setMinutes(to) === "notWiredYet") return notWiredYet("set_minutes");
    return {
      ok: true,
      receipt: line("coachTools.receipt.setMinutes", { from, to }),
      undo: { tool: "set_minutes", args: { minutes: from } },
    };
  },
});

/** A focus as the player reads it: a Path's title, or `"mix"` (the UI's word for the daily mix). */
function focusName(focus: TodayFocus, paths: readonly PathDoc[]): string {
  return focus === MIX ? MIX : (paths.find((p) => p.id === focus)?.title ?? focus);
}

type SetFocus = { from: TodayFocus; to: TodayFocus };

const setFocus = defineConfirmTool<SetFocus>({
  name: "set_focus",
  kind: "confirm",
  audience: "player",
  note: "Plan today from one followed Path, or from the daily mix.",
  args: [
    {
      name: "path",
      type: { kind: "query", maxLength: MAX_QUERY },
      optional: true,
      note: "The Path, as the player names it. Left out: the daily mix.",
    },
  ],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const paths = host.paths();
    const query = argString(args, "path");
    let to: TodayFocus = MIX;
    if (query !== undefined) {
      const mine = followedPaths(paths, host.progress());
      const found = resolvePath(query, mine);
      if ("several" in found) {
        return refuse("notFound", "coachTools.why.which", { query }, {
          choices: found.several.map((p) => ({ label: line("coachTools.choice.path", { path: p.title }), call: { tool: "set_focus", args: { path: p.title } } })),
        });
      }
      if ("none" in found) {
        // A Path the player does not follow: following it is its own press.
        const any = resolvePath(query, paths);
        if ("found" in any) {
          return refuse("notNow", "coachTools.why.notNow.notFollowed", { path: any.found.title }, {
            choices: [{ label: line("coachTools.choice.followPath", { path: any.found.title }), call: { tool: "follow_path", args: { path: any.found.title } } }],
          });
        }
        return refuse("notFound", "coachTools.why.notFound.path", { query });
      }
      to = found.found.id;
    }
    const from = host.todayFocus();
    if (to === from) return refuse("notNow", "coachTools.why.notNow.alreadyFocus", { focus: focusName(from, paths) });
    const plan = host.previewPlan({ focus: to });
    if (plan === "notWiredYet") return notWiredYet("set_focus");
    return {
      ok: true,
      line: line("coachTools.propose.setFocus", { from: focusName(from, paths), to: focusName(to, paths), parts: plan.steps.length }),
      resolved: { from, to },
      plan,
    };
  },
  commit({ from, to }, host) {
    if (host.sessionActive()) return sessionOpen();
    if (host.todayFocus() !== from) return gone("the focus changed");
    if (host.setTodayFocus(to) === "notWiredYet") return notWiredYet("set_focus");
    const paths = host.paths();
    const back: Record<string, string> = from === MIX ? {} : { path: focusName(from, paths) };
    return {
      ok: true,
      receipt: line("coachTools.receipt.setFocus", { from: focusName(from, paths), to: focusName(to, paths) }),
      undo: { tool: "set_focus", args: back },
    };
  },
});

type FollowPath = { pathId: string; levelId: string | null };

function subscribedCount(host: CoachToolHost): number {
  const progress = host.progress();
  return progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
}

const followPath = defineConfirmTool<FollowPath>({
  name: "follow_path",
  kind: "confirm",
  audience: "player",
  note: "Follow a Path (add it to the daily mix), optionally from one of its Levels. The app follows four at most.",
  args: [
    { name: "path", type: { kind: "query", maxLength: MAX_QUERY }, note: "The Path, as the player names it." },
    { name: "level", type: { kind: "query", maxLength: MAX_QUERY }, optional: true, note: "The Level to start at, by its title." },
  ],
  when: outsideSession,
  propose(args, host) {
    if (host.sessionActive()) return sessionOpen();
    const query = argString(args, "path") ?? "";
    const found = resolvePath(query, host.paths().filter((p) => isRunnable(p.id)));
    if ("none" in found) return refuse("notFound", "coachTools.why.notFound.path", { query });
    if ("several" in found) {
      return refuse("notFound", "coachTools.why.which", { query }, {
        choices: found.several.map((p) => ({
          label: line("coachTools.choice.path", { path: p.title }),
          call: { tool: "follow_path", args: { ...args, path: p.title } },
        })),
      });
    }
    const path = found.found;
    if (isSubscribed(host.progress(), path.id)) return refuse("notNow", "coachTools.why.notNow.following", { path: path.title });
    if (subscribedCount(host) >= SUBSCRIPTION_CAP) return refuse("refused", "coachTools.why.refused.cap", { cap: SUBSCRIPTION_CAP, path: path.title });
    const levelQuery = argString(args, "level");
    let level: { id: string; title: string } | null = null;
    if (levelQuery !== undefined) {
      const levels = matchByTitle(levelQuery, levelsOf(path), (l) => l.title);
      if ("none" in levels) return refuse("notFound", "coachTools.why.notFound.level", { query: levelQuery, path: path.title });
      if ("several" in levels) {
        return refuse("notFound", "coachTools.why.which", { query: levelQuery }, {
          choices: levels.several.map((l) => ({
            label: line("coachTools.choice.level", { path: path.title, level: l.title }),
            call: { tool: "follow_path", args: { path: path.title, level: l.title } },
          })),
        });
      }
      level = levels.found;
    }
    return {
      ok: true,
      line: line("coachTools.propose.followPath", level ? { path: path.title, level: level.title } : { path: path.title }),
      resolved: { pathId: path.id, levelId: level?.id ?? null },
      noUndo: true,
    };
  },
  commit({ pathId, levelId }, host) {
    if (host.sessionActive()) return sessionOpen();
    const path = host.paths().find((p) => p.id === pathId);
    if (!path) return gone("the Path is not there any more");
    // Followed since the proposal (from its page, or by playing it): starting it again
    // would move the player's place back to the Level's entry (review finding 4).
    if (isSubscribed(host.progress(), pathId)) return gone("the Path is followed already");
    const out = host.followPath(pathId, levelId);
    if (out === "notWiredYet") return notWiredYet("follow_path");
    if (out === "cap") return refuse("refused", "coachTools.why.refused.cap", { cap: SUBSCRIPTION_CAP, path: path.title });
    const level = levelId ? levelsOf(path).find((l) => l.id === levelId)?.title : undefined;
    // No undo: leaving a Path is the player's (the never-list).
    return { ok: true, receipt: line("coachTools.receipt.followPath", level ? { path: path.title, level } : { path: path.title }) };
  },
});

export const TODAY_TOOLS: readonly ConfirmTool[] = [swapPart, restorePart, setMinutes, setFocus, followPath];
