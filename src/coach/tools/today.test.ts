/**
 * The tools that change what Today plans, as tables: allowed and refused,
 * the numbers snapped, the resolution cases, nothing until the press, the
 * press re-checked, and the undo back to where the app was.
 */

import { describe, expect, it } from "vitest";
import { playerPaths } from "../../containers/session/hooks/useSessionRun";
import type { TodayFocus } from "../../session/focus";
import type { PlanMinutes, PlanStep, SessionPlan } from "../../session/planner";
import type { PlayerProgress } from "../../session/progress";
import type { SwapChoice, SwapOptions } from "../../session/swap";
import { ALT as REAL_ALT, progress, state } from "../../session/testKit";
import { fakeHost, toolCtx } from "./fakeHost";
import type { CoachToolHost } from "./host";
import { confirmCoachTool, runCoachTool, runCoachUndo } from "./run";
import { ALT, ALT_BLUES, LEGATO_ES, TEST_PATHS, runIn } from "./testPaths";
import { followedPaths } from "./today";
import type { Proposal, RunOutcome, ToolArgs, ToolResult } from "./types";

function proposalOf(out: RunOutcome): Proposal {
  if (!out.ok || !("proposal" in out)) throw new Error(`no proposal: ${JSON.stringify(out)}`);
  return out.proposal;
}

function done(out: ToolResult): Extract<ToolResult, { ok: true }> {
  if (!out.ok) throw new Error(`refused: ${JSON.stringify(out)}`);
  return out;
}

const call = (tool: string, args: ToolArgs = {}) => ({ tool, args });
const session = toolCtx({ screen: "session", run: runIn("ready") });

function planOf(titles: string[], minutes: PlanMinutes = 15): SessionPlan {
  return {
    minutes,
    mood: "returning",
    daysAway: 1,
    steps: titles.map((title, i) => ({ kind: "exercise", id: `row-${i}`, title, minutes: 5 }) as unknown as PlanStep),
  } as SessionPlan;
}

/** Today, kept in the fake: minutes, focus, the swaps, as the real hooks keep them. */
function today(start: { minutes?: PlanMinutes; focus?: TodayFocus; prog?: PlayerProgress } = {}, over: Partial<CoachToolHost> = {}) {
  let minutes: PlanMinutes = start.minutes ?? 15;
  let focus: TodayFocus = start.focus ?? "mix";
  let rows = ["Warm up", "Outside picking", "Slow blues"];
  const planned = [...rows];
  const host = fakeHost(
    { paths: TEST_PATHS },
    {
      plan: () => planOf(rows, minutes),
      minutes: () => minutes,
      todayFocus: () => focus,
      progress: () => start.prog ?? progress(),
      previewPlan: (change) => planOf(change.minutes === 20 ? [...rows, "Box one, up and down"] : rows, change.minutes ?? minutes),
      setMinutes: (next) => {
        minutes = next;
        return "done";
      },
      setTodayFocus: (next) => {
        focus = next;
        return "done";
      },
      swapOptions: (index: number, choice: SwapChoice): SwapOptions =>
        choice === "style"
          ? { candidates: [], none: "style" }
          : choice === "different"
            ? { candidates: [{ id: `row-${index}`, title: "Inside picking" }, { id: `row-${index}`, title: "Three-string rolls" }] as PlanStep[], none: null }
            : { candidates: [{ id: `row-${index}`, title: "Inside picking" }] as PlanStep[], none: null },
      confirmSwap: (index, replacement) => {
        rows = rows.map((r, i) => (i === index ? replacement.title : r));
        return "done";
      },
      undoSwap: (index) => {
        rows = rows.map((r, i) => (i === index ? planned[i] : r));
        return "done";
      },
      followPath: () => "done",
      ...over,
    },
  );
  return Object.assign(host, { rows: () => rows, minutesNow: () => minutes, focusNow: () => focus });
}

describe("set_minutes", () => {
  it.each([
    [20, 20],
    [17, 15],
    [3, 5],
    [12, 10],
    [240, 20],
  ])("%i minutes snaps to %i", (asked, to) => {
    const h = today({ minutes: to === 15 ? 10 : 15 });
    const proposal = proposalOf(runCoachTool(call("set_minutes", { minutes: asked }), h, toolCtx()));
    expect(proposal.line.values).toMatchObject({ to });
  });

  it("proposes the plan as it would be, changes it only on the press, and the undo puts it back", () => {
    const h = today();
    const proposal = proposalOf(runCoachTool(call("set_minutes", { minutes: 20 }), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.setMinutes", values: { from: 15, to: 20, parts: 4 } });
    expect(proposal.plan?.minutes).toBe(20);
    expect(proposal.plan?.steps.map((s) => s.title)).toContain("Box one, up and down");
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(h.minutesNow()).toBe(20);
    expect(out.undo).toEqual({ tool: "set_minutes", args: { minutes: 15 } });
    expect(done(runCoachUndo(out.undo, h, toolCtx())).receipt).toEqual({ key: "coachTools.receipt.setMinutes", values: { from: 20, to: 15 } });
    expect(h.minutesNow()).toBe(15);
  });

  it("refuses the length it already is, a Session, and a length changed by hand before the press", () => {
    expect(runCoachTool(call("set_minutes", { minutes: 16 }), today(), toolCtx())).toMatchObject({ line: { key: "coachTools.why.notNow.alreadyMinutes" } });
    expect(runCoachTool(call("set_minutes", { minutes: 20 }), today(), session)).toMatchObject({ why: "notNow" });
    const h = today();
    const proposal = proposalOf(runCoachTool(call("set_minutes", { minutes: 20 }), h, toolCtx()));
    h.setMinutes(5);
    expect(confirmCoachTool(proposal, h, toolCtx())).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(h.minutesNow()).toBe(5);
  });
});

describe("set_focus", () => {
  const following = progress({ states: [state({ pathId: "alternate-picking" }), state({ pathId: "legato" })] });

  it("only a Path the player follows; plans from it on the press; the undo goes back to the mix", () => {
    const h = today({ prog: following });
    const proposal = proposalOf(runCoachTool(call("set_focus", { path: "ligado" }), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.setFocus", values: { from: "mix", to: "Ligado", parts: 3 } });
    expect(proposal.plan).toBeDefined();
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(h.focusNow()).toBe("legato");
    expect(out.undo).toEqual({ tool: "set_focus", args: {} });
    runCoachUndo(out.undo, h, toolCtx());
    expect(h.focusNow()).toBe("mix");
  });

  it("from one Path to another, the undo names the first by its title", () => {
    const h = today({ prog: following, focus: "legato" });
    const out = done(confirmCoachTool(proposalOf(runCoachTool(call("set_focus", { path: "alternate picking" }), h, toolCtx())), h, toolCtx()));
    expect(out.undo).toEqual({ tool: "set_focus", args: { path: "Ligado" } });
    runCoachUndo(out.undo, h, toolCtx());
    expect(h.focusNow()).toBe("legato");
  });

  it("a Path not followed is notNow, offering to follow it; the focus it already has is notNow", () => {
    const out = runCoachTool(call("set_focus", { path: "alternate blues" }), today({ prog: following }), toolCtx());
    expect(out).toMatchObject({ why: "notNow", line: { key: "coachTools.why.notNow.notFollowed", values: { path: "Alternate Blues" } } });
    expect(!out.ok && out.choices?.[0].call).toEqual({ tool: "follow_path", args: { path: "Alternate Blues" } });
    expect(runCoachTool(call("set_focus"), today({ prog: following }), toolCtx())).toMatchObject({ line: { key: "coachTools.why.notNow.alreadyFocus" } });
    expect(runCoachTool(call("set_focus", { path: "sweep" }), today({ prog: following }), toolCtx())).toMatchObject({ line: { key: "coachTools.why.notFound.path" } });
  });

  it("the Paths it offers are the ones Today plans from (`playerPaths`)", () => {
    const cases: PlayerProgress[] = [
      progress(),
      following,
      progress({ states: [state({ pathId: "legato" }), state({ pathId: "blues-pentatonics" })], unsubscribed: ["legato"] }),
    ];
    const paths = [...TEST_PATHS, { ...ALT_BLUES, id: "rhythm-foundations", title: "Rhythm" }];
    for (const prog of cases) expect(followedPaths(paths, prog).map((p) => p.id)).toEqual(playerPaths(paths, prog).map((p) => p.id));
  });
});

describe("swap_part", () => {
  it("one replacement: proposed by title, swapped on the press, and the undo puts the planner's back", () => {
    const h = today();
    const proposal = proposalOf(runCoachTool(call("swap_part", { at: 2, choice: "harder" }), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.swapPart", values: { part: 2, from: "Outside picking", to: "Inside picking", choice: "harder" } });
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(h.rows()[1]).toBe("Inside picking");
    expect(out.undo).toEqual({ tool: "restore_part", args: { at: 2, title: "Inside picking" } });
    expect(runCoachUndo(out.undo, h, toolCtx()).ok).toBe(true);
    expect(h.rows()[1]).toBe("Outside picking");
  });

  it("several replacements are choices, each naming one; a part number snaps to one that exists", () => {
    const out = runCoachTool(call("swap_part", { at: 9, choice: "different" }), today(), toolCtx());
    expect(out).toMatchObject({ why: "notFound", line: { key: "coachTools.why.which" } });
    const choices = !out.ok ? (out.choices ?? []) : [];
    expect(choices.map((c) => c.call.args)).toEqual([
      { at: 3, choice: "different", to: "Inside picking" },
      { at: 3, choice: "different", to: "Three-string rolls" },
    ]);
    const proposal = proposalOf(runCoachTool(choices[1].call, today(), toolCtx()));
    expect(proposal.line.values).toMatchObject({ part: 3, from: "Slow blues", to: "Three-string rolls" });
  });

  it("nothing to swap to is notNow; a replacement named that is not offered is notFound; a Session refuses", () => {
    expect(runCoachTool(call("swap_part", { at: 1, choice: "style" }), today(), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.noSwap", values: { part: 1, none: "style" } },
    });
    expect(runCoachTool(call("swap_part", { at: 1, choice: "different", to: "sweeps" }), today(), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notFound.swap" },
    });
    expect(runCoachTool(call("swap_part", { at: 1, choice: "harder" }), today(), session)).toMatchObject({ why: "notNow" });
  });

  it("a part that changed before the press, or before the undo, is left alone", () => {
    const h = today();
    const proposal = proposalOf(runCoachTool(call("swap_part", { at: 2, choice: "harder" }), h, toolCtx()));
    h.confirmSwap(1, { id: "row-1", title: "Tirones" } as PlanStep);
    expect(confirmCoachTool(proposal, h, toolCtx())).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(h.rows()[1]).toBe("Tirones");
    const swapped = today();
    const out = done(confirmCoachTool(proposalOf(runCoachTool(call("swap_part", { at: 2, choice: "harder" }), swapped, toolCtx())), swapped, toolCtx()));
    swapped.confirmSwap(1, { id: "row-1", title: "Tirones" } as PlanStep);
    expect(runCoachUndo(out.undo, swapped, toolCtx())).toMatchObject({ ok: false });
    expect(swapped.rows()[1]).toBe("Tirones");
  });

  it("the swap's undo is the app's own: a player cannot call it", () => {
    expect(runCoachTool(call("restore_part", { at: 2, title: "Inside picking" }), today(), toolCtx())).toMatchObject({ why: "refused" });
  });
});

describe("follow_path", () => {
  /** Nothing followed yet (`progress()`'s default follows Alternate Picking). */
  const nothing = progress({ states: [] });
  const host = (prog: PlayerProgress, over: Partial<CoachToolHost> = {}) =>
    fakeHost({ paths: [...TEST_PATHS, REAL_ALT].filter((p) => p !== ALT) }, { progress: () => prog, followPath: () => "done", ...over });

  it("proposes the Path (and Level) by title, says it has no undo, and follows on the press", () => {
    const h = host(nothing);
    const proposal = proposalOf(runCoachTool(call("follow_path", { path: "alternate picking", level: "intermediate" }), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.followPath", values: { path: "Alternate Picking", level: "Intermediate: across the strings" } });
    expect(proposal.noUndo).toBe(true);
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(out.undo).toBeUndefined();
    expect(h.changes()).toEqual([{ member: "followPath", args: ["alternate-picking", "intermediate"] }]);
  });

  it("refuses at four Paths, a Path already followed, a Level it does not have, and the app's own cap on the press", () => {
    const four = progress({ states: ["a", "b", "c", "d"].map((id) => state({ pathId: id })) });
    expect(runCoachTool(call("follow_path", { path: "ligado" }), host(four), toolCtx())).toMatchObject({
      why: "refused",
      line: { key: "coachTools.why.refused.cap", values: { cap: 4 } },
    });
    expect(runCoachTool(call("follow_path", { path: "ligado" }), host(progress({ states: [state({ pathId: "legato" })] })), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.following" },
    });
    expect(runCoachTool(call("follow_path", { path: "alternate picking", level: "expert" }), host(nothing), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notFound.level" },
    });
    const capped = host(progress(), { followPath: () => "cap" });
    const proposal = proposalOf(runCoachTool(call("follow_path", { path: "ligado" }), capped, toolCtx()));
    expect(confirmCoachTool(proposal, capped, toolCtx())).toMatchObject({ why: "refused", line: { key: "coachTools.why.refused.cap" } });
  });

  it("a Path followed between the proposal and the press is left where it is (review 4)", () => {
    let prog = nothing;
    const h = host(nothing, { progress: () => prog });
    const proposal = proposalOf(runCoachTool(call("follow_path", { path: "alternate picking", level: "intermediate" }), h, toolCtx()));
    // The player starts it from its page, or plays it, and moves on.
    prog = progress({ states: [state({ pathId: "alternate-picking" })] });
    expect(confirmCoachTool(proposal, h, toolCtx())).toMatchObject({ why: "refused", line: { key: "coachTools.why.refused.proposal" } });
    expect(h.changes()).toEqual([]);
  });

  it("several Paths are choices; a Session refuses", () => {
    const out = runCoachTool(call("follow_path", { path: "alternate" }), host(progress()), toolCtx());
    expect(!out.ok && out.choices?.map((c) => c.call.args.path)).toEqual(["Alternate Blues", "Alternate Picking"]);
    expect(runCoachTool(call("follow_path", { path: "ligado" }), host(progress()), session)).toMatchObject({ why: "notNow" });
    expect(LEGATO_ES.id).toBe("legato");
  });
});
