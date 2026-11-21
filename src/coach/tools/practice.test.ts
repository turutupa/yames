/**
 * The Session-side `confirm` tools, as tables: an allowed context and a
 * refused one, the snapping of each number, the resolution cases, nothing done
 * until the press, the press re-checked, and the undo where there is one.
 */

import { describe, expect, it } from "vitest";
import type { Exercise, PathDoc } from "../../paths/format";
import type { SessionPlan } from "../../session/planner";
import type { PlayerProgress } from "../../session/progress";
import { ALT as REAL_ALT, passed, progress } from "../../session/testKit";
import type { CoachContext } from "../context";
import { fakeHost, toolCtx, type FakeHost } from "./fakeHost";
import type { CoachToolHost } from "./host";
import { playStartBpm } from "./practice";
import { confirmCoachTool, runCoachTool, runCoachUndo } from "./run";
import { ALT, TEST_PATHS, runIn } from "./testPaths";
import type { Proposal, RunOutcome, ToolArgs, ToolResult } from "./types";

function proposalOf(out: RunOutcome): Proposal {
  if (!out.ok || !("proposal" in out)) throw new Error(`no proposal: ${JSON.stringify(out)}`);
  return out.proposal;
}

function done(out: ToolResult): Extract<ToolResult, { ok: true }> {
  if (!out.ok) throw new Error(`refused: ${JSON.stringify(out)}`);
  return out;
}

const PLAN: SessionPlan = {
  minutes: 15,
  mood: "returning",
  daysAway: 1,
  steps: [
    { kind: "metronome", id: "warm", title: "Warm up", bpm: 60, subdivision: 2, minutes: 3 },
    { kind: "exercise", id: "focus", title: "Outside picking", pathId: "alternate-picking", stepId: "ap-2", exerciseId: "ap-2-a", bpm: 60, minutes: 8 },
    { kind: "jam", id: "finish", title: "Slow blues", minutes: 4 },
  ],
} as unknown as SessionPlan;

const call = (tool: string, args: ToolArgs = {}) => ({ tool, args });

function exerciseOf(path: PathDoc, id: string): Exercise {
  return path.steps.flatMap((s) => s.exercises).find((e) => e.id === id)!;
}

describe("start_today", () => {
  const host = (over: Partial<CoachToolHost> = {}) =>
    fakeHost({ paths: TEST_PATHS }, { plan: () => PLAN, startToday: () => "done", ...over });

  it("proposes today's plan from the start, and starts it only on the press", () => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("start_today"), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.startToday", values: { minutes: 15, parts: 3, title: "Warm up" } });
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(out.receipt).toEqual({ key: "coachTools.receipt.startToday", values: { part: 1, title: "Warm up" } });
    expect(out.undo).toBeUndefined();
    expect(h.changes()).toEqual([{ member: "startToday", args: [null] }]);
  });

  it.each([
    [2, 1, "Outside picking"],
    [3, 2, "Slow blues"],
    [9, 2, "Slow blues"],
    [1, 0, "Warm up"],
  ])("a part %i snaps to the index %i that exists", (at, index, title) => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("start_today", { at }), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.startTodayAt", values: { minutes: 15, part: index + 1, title } });
    confirmCoachTool(proposal, h, toolCtx());
    expect(h.changes()).toEqual([{ member: "startToday", args: [index] }]);
  });

  it("refuses part 0, a Session open, and no plan", () => {
    expect(runCoachTool(call("start_today", { at: 0 }), host(), toolCtx())).toMatchObject({ why: "refused" });
    expect(runCoachTool(call("start_today"), host(), toolCtx({ screen: "session", run: runIn("ready") }))).toMatchObject({
      why: "notNow",
      line: { key: "coachTools.why.notNow.here" },
    });
    expect(runCoachTool(call("start_today"), host({ sessionActive: () => true }), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.session" },
    });
    expect(runCoachTool(call("start_today"), host({ plan: () => null }), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.noPlan" },
    });
  });

  it("a plan that changed under the proposal is not started; a proposal is good once", () => {
    let plan = PLAN;
    const h = host({ plan: () => plan });
    const proposal = proposalOf(runCoachTool(call("start_today", { at: 2 }), h, toolCtx()));
    plan = { ...PLAN, steps: [PLAN.steps[0], PLAN.steps[2]] };
    expect(confirmCoachTool(proposal, h, toolCtx())).toMatchObject({ why: "refused", line: { key: "coachTools.why.refused.proposal" } });
    plan = PLAN;
    const again = proposalOf(runCoachTool(call("start_today"), h, toolCtx()));
    expect(confirmCoachTool(again, h, toolCtx()).ok).toBe(true);
    expect(confirmCoachTool(again, h, toolCtx())).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(h.changes()).toEqual([{ member: "startToday", args: [null] }]);
  });

  it("says what it stops when the click is playing", () => {
    const h = fakeHost({ paths: TEST_PATHS, sounding: "click" }, { plan: () => PLAN });
    expect(proposalOf(runCoachTool(call("start_today"), h, toolCtx())).line.values).toMatchObject({ stops: "click" });
  });

  it("a Take started since the proposal: nothing", () => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("start_today"), h, toolCtx()));
    expect(confirmCoachTool(proposal, h, toolCtx({ screen: "session", run: runIn("playing") }))).toMatchObject({
      line: { key: "coachTools.why.notNow.take" },
    });
    expect(h.changes()).toEqual([]);
  });
});

describe("play_exercise", () => {
  const host = (over: Partial<CoachToolHost> = {}, prog?: PlayerProgress) =>
    fakeHost(
      { paths: TEST_PATHS },
      { playExercise: () => "done", ...(prog ? { progress: () => prog } : {}), ...over },
    );

  it("resolves the Exercise by its title and says the tempo it starts at", () => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("play_exercise", { exercise: "outside picking" }), h, toolCtx()));
    expect(proposal.line).toEqual({
      key: "coachTools.propose.playExercise",
      values: { path: "Alternate Picking", step: 2, title: "Outside picking", bpm: 60 },
    });
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(out.receipt.key).toBe("coachTools.receipt.playExercise");
    expect(h.changes()).toEqual([{ member: "playExercise", args: ["alternate-picking", "ap-2-a", null] }]);
  });

  it.each([
    [61, null],
    [75, 72],
    [90, 72],
    [5, null],
  ])("bpm %i snaps to a graded rung; one the Play cannot start at is said (%s)", (bpm, asked) => {
    const proposal = proposalOf(runCoachTool(call("play_exercise", { exercise: "outside picking", bpm }), host(), toolCtx()));
    if (asked === null) expect(proposal.line.key).toBe("coachTools.propose.playExercise");
    else expect(proposal.line).toMatchObject({ key: "coachTools.propose.playExerciseNotAt", values: { bpm: 60, asked } });
  });

  it("starts where the Step page's Play starts: the last Take heard", () => {
    const prog = progress({ takes: [{ ...passed("ap-2-a", 72), pathId: "alternate-picking" }] });
    expect(playStartBpm(prog, "alternate-picking", exerciseOf(ALT, "ap-2-a"))).toBe(72);
    const proposal = proposalOf(runCoachTool(call("play_exercise", { exercise: "outside picking", bpm: 72 }), host({}, prog), toolCtx()));
    expect(proposal.line).toMatchObject({ key: "coachTools.propose.playExercise", values: { bpm: 72 } });
  });

  it("several matches are choices that resolve to one; none is notFound; the Path narrows", () => {
    const several = runCoachTool(call("play_exercise", { exercise: "picking", bpm: 70 }), host(), toolCtx());
    expect(several).toMatchObject({ ok: false, why: "notFound", line: { key: "coachTools.why.which" } });
    const choices = !several.ok ? (several.choices ?? []) : [];
    expect(choices.map((c) => c.call.args)).toEqual([
      { bpm: 70, path: "Alternate Picking", exercise: "Outside picking" },
      { bpm: 70, path: "Alternate Picking", exercise: "Inside picking" },
    ]);
    expect(runCoachTool(choices[1].call, host(), toolCtx()).ok).toBe(true);
    expect(runCoachTool(call("play_exercise", { exercise: "arpeggio sweep" }), host(), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notFound.exercise", values: { query: "arpeggio sweep" } },
    });
    const spanish = proposalOf(runCoachTool(call("play_exercise", { path: "ligado", exercise: "tirones" }), host(), toolCtx()));
    expect(spanish.line.values).toMatchObject({ path: "Ligado", title: "Tirones" });
    expect(runCoachTool(call("play_exercise", { path: "ligado", exercise: "outside" }), host(), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notFound.exercise" },
    });
  });

  it("refused in a Session, and when the start tempo moved before the press", () => {
    expect(runCoachTool(call("play_exercise", { exercise: "outside picking" }), host(), toolCtx({ screen: "session", run: runIn("result") }))).toMatchObject({
      why: "notNow",
    });
    let prog = progress();
    const h = host({}, undefined);
    const moving = fakeHost({ paths: TEST_PATHS }, { playExercise: () => "done", progress: () => prog });
    const proposal = proposalOf(runCoachTool(call("play_exercise", { exercise: "outside picking" }), moving, toolCtx()));
    prog = progress({ takes: [{ ...passed("ap-2-a", 72), pathId: "alternate-picking" }] });
    expect(confirmCoachTool(proposal, moving, toolCtx())).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(moving.changes()).toEqual([]);
    expect(h.changes()).toEqual([]);
  });
});

describe("set_tempo, on a tool screen", () => {
  function tools(start: number, view: "beat" | "drill" | "jam" = "beat"): FakeHost & { bpm: () => number } {
    let bpm = start;
    const h = fakeHost({ view }, {
      tempo: () => bpm,
      setTempo: (next) => {
        bpm = next;
        return "done";
      },
    });
    return Object.assign(h, { bpm: () => bpm });
  }
  const beat = toolCtx({ screen: "beat" });

  it.each([
    [{ bpm: 120 }, 100, 120],
    [{ bpm: 999 }, 100, 300],
    [{ bpm: 3 }, 100, 20],
    [{ direction: "slower" }, 100, 95],
    [{ direction: "faster" }, 298, 300],
  ])("%o from %i proposes %i, sets it on the press, and the undo puts it back", (args, from, to) => {
    const h = tools(from);
    const proposal = proposalOf(runCoachTool(call("set_tempo", args), h, beat));
    expect(proposal.line).toEqual({ key: "coachTools.propose.setTempo", values: { from, to } });
    expect(h.bpm()).toBe(from);
    const out = done(confirmCoachTool(proposal, h, beat));
    expect(h.bpm()).toBe(to);
    expect(out.undo).toEqual({ tool: "set_tempo", args: { bpm: from, at: to } });
    expect(runCoachUndo(out.undo, h, beat).ok).toBe(true);
    expect(h.bpm()).toBe(from);
  });

  it("refuses the tempo it is at, both arguments or neither, and screens without a tempo", () => {
    expect(runCoachTool(call("set_tempo", { bpm: 100 }), tools(100), beat)).toMatchObject({ line: { key: "coachTools.why.notNow.alreadyAt" } });
    expect(runCoachTool(call("set_tempo", { bpm: 90, direction: "slower" }), tools(100), beat)).toMatchObject({ why: "refused" });
    expect(runCoachTool(call("set_tempo"), tools(100), beat)).toMatchObject({ why: "refused" });
    expect(runCoachTool(call("set_tempo", { bpm: 90 }), tools(100), toolCtx({ screen: "today" }))).toMatchObject({
      line: { key: "coachTools.why.notNow.here" },
    });
  });

  it("a tempo moved by hand since the proposal: nothing", () => {
    const h = tools(100);
    const proposal = proposalOf(runCoachTool(call("set_tempo", { bpm: 120 }), h, beat));
    h.setTempo(110);
    expect(confirmCoachTool(proposal, h, beat)).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(h.bpm()).toBe(110);
  });

  it("proposed on the Metronome, pressed on the jam tab at the same tempo: refused, the jam untouched (review 2)", () => {
    const h = tools(100, "beat");
    const proposal = proposalOf(runCoachTool(call("set_tempo", { bpm: 120 }), h, beat));
    h.setView("jam");
    expect(confirmCoachTool(proposal, h, toolCtx({ screen: "jam" }))).toMatchObject({ why: "refused", line: { key: "coachTools.why.refused.proposal" } });
    expect(h.changes().filter((c) => c.member === "setTempo")).toEqual([]);
    expect(h.bpm()).toBe(100);
  });

  it("the undo pressed on the jam tab at the same tempo is refused and spent, the jam untouched (review t1a2b A)", () => {
    const h = tools(100, "beat");
    const out = done(confirmCoachTool(proposalOf(runCoachTool(call("set_tempo", { bpm: 120 }), h, beat)), h, beat));
    // The jam's tempo reads 120 too: the guard alone would let it through.
    h.setView("jam");
    expect(runCoachUndo(out.undo, h, toolCtx({ screen: "jam" }))).toMatchObject({ ok: false, why: "refused", line: { key: "coachTools.why.refused.proposal" } });
    expect(h.changes().filter((c) => c.member === "setTempo")).toEqual([{ member: "setTempo", args: [120] }]);
    h.setView("beat");
    expect(runCoachUndo(out.undo, h, beat)).toMatchObject({ ok: false, detail: "not a live undo" });
    expect(h.bpm()).toBe(120);
  });

  it("the undo puts back only what the tool changed: moved by hand since, it is refused (review 5)", () => {
    const h = tools(100);
    const out = done(confirmCoachTool(proposalOf(runCoachTool(call("set_tempo", { bpm: 120 }), h, beat)), h, beat));
    h.setTempo(130);
    expect(runCoachUndo(out.undo, h, beat)).toMatchObject({ ok: false, line: { key: "coachTools.why.refused.proposal" } });
    expect(h.bpm()).toBe(130);
  });
});

describe("set_tempo, in a Session", () => {
  const outside = exerciseOf(ALT, "ap-2-a"); // graded 60, 72; 90 self-checked
  const steady = exerciseOf(ALT, "ap-1-a"); // graded 60, 70, 80
  const at = (bpm: number, exercise: Exercise, phase: "ready" | "result" = "ready"): CoachContext =>
    toolCtx({ screen: "session", run: { ...runIn(phase), bpm }, exercise });
  const host = (slower: boolean, faster: boolean) =>
    fakeHost({ view: "session", session: true }, { nudges: () => ({ slower, faster }), nudgeTempo: () => "done" });

  it("a rung one step away is the nudge, proposed; the press nudges; the undo nudges back", () => {
    const h = host(false, true);
    const proposal = proposalOf(runCoachTool(call("set_tempo", { bpm: 70 }), h, at(60, outside)));
    expect(proposal.line).toEqual({ key: "coachTools.propose.nudgeTempo", values: { direction: "faster", from: 60, to: 72 } });
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, at(60, outside)));
    expect(out.receipt).toEqual({ key: "coachTools.receipt.setTempo", values: { from: 60, to: 72 } });
    expect(out.undo).toEqual({ tool: "set_tempo", args: { bpm: 60, at: 72 } });
    const back = fakeHost({ view: "session", session: true }, { nudges: () => ({ slower: true, faster: false }), nudgeTempo: () => "done" });
    expect(runCoachUndo(out.undo, back, at(72, outside)).ok).toBe(true);
    expect(h.changes()).toEqual([{ member: "nudgeTempo", args: ["faster"] }]);
    expect(back.changes()).toEqual([{ member: "nudgeTempo", args: ["slower"] }]);
  });

  it("a nudge's undo is absolute and single-use: refused once the player moved the rung, and refused when pressed twice (review 5)", () => {
    const h = host(true, true);
    // 70 → 60 by the tool, then the player's own Faster takes it back to 70.
    const out = done(confirmCoachTool(proposalOf(runCoachTool(call("set_tempo", { direction: "slower" }), h, at(70, steady))), h, at(70, steady)));
    expect(runCoachUndo(out.undo, h, at(70, steady))).toMatchObject({ ok: false, line: { key: "coachTools.why.refused.proposal" } });
    expect(runCoachUndo(out.undo, h, at(80, steady))).toMatchObject({ ok: false });
    expect(h.changes()).toEqual([{ member: "nudgeTempo", args: ["slower"] }]);
    // Still at 60: the undo runs once, and the second press does nothing.
    const again = done(confirmCoachTool(proposalOf(runCoachTool(call("set_tempo", { direction: "slower" }), h, at(70, steady))), h, at(70, steady)));
    expect(runCoachUndo(again.undo, h, at(60, steady)).ok).toBe(true);
    // The same press again, as if the tempo were still at 60: only the single use stops it.
    expect(runCoachUndo(again.undo, h, at(60, steady))).toMatchObject({ ok: false, why: "refused", detail: "not a live undo" });
    expect(h.changes().map((c) => c.args[0])).toEqual(["slower", "slower", "faster"]);
  });

  it("a nudge's undo pressed on a later Exercise, or a later block, at the same tempo is refused and spent (review t1a2b A)", () => {
    const later = (bpm: number, exercise: Exercise, stepIndex: number): CoachContext =>
      toolCtx({ screen: "session", run: { ...runIn("ready"), bpm, stepIndex }, exercise });
    for (const [exercise, stepIndex] of [[steady, 0], [outside, 1]] as const) {
      const h = host(true, true);
      const out = done(confirmCoachTool(proposalOf(runCoachTool(call("set_tempo", { bpm: 70 }), h, at(60, outside))), h, at(60, outside)));
      expect(out.undo).toEqual({ tool: "set_tempo", args: { bpm: 60, at: 72 } });
      const wrong = later(72, exercise, stepIndex);
      expect(runCoachUndo(out.undo, h, wrong)).toMatchObject({ ok: false, why: "refused", line: { key: "coachTools.why.refused.proposal" } });
      expect(runCoachUndo(out.undo, h, at(72, outside))).toMatchObject({ ok: false, detail: "not a live undo" });
      expect(h.changes()).toEqual([{ member: "nudgeTempo", args: ["faster"] }]);
    }
  });

  it("a nudge's undo pressed after the Session, on the Metronome at that tempo, is refused (review t1a2b A)", () => {
    const h = host(true, true);
    const out = done(confirmCoachTool(proposalOf(runCoachTool(call("set_tempo", { bpm: 70 }), h, at(60, outside))), h, at(60, outside)));
    // The Metronome at 72, the guard: only the place tells the two tempos apart.
    const after = fakeHost({ view: "beat" }, { tempo: () => 72, setTempo: () => "done" });
    expect(runCoachUndo(out.undo, after, toolCtx({ screen: "beat" }))).toMatchObject({ ok: false, why: "refused" });
    expect(after.changes()).toEqual([]);
  });

  it.each([
    [{ direction: "slower" }, 70, true, true, "slower", 60],
    [{ bpm: 61 }, 70, true, true, "slower", 60],
    [{ bpm: 100 }, 70, true, true, "faster", 80],
  ])("%o at %i: the nudge", (args, bpm, slower, faster, direction, to) => {
    const proposal = proposalOf(runCoachTool(call("set_tempo", args), host(slower, faster), at(bpm, steady)));
    expect(proposal.line.values).toEqual({ direction, from: bpm, to });
  });

  it("further than a step is notNow, with the rungs a press away as choices", () => {
    const out = runCoachTool(call("set_tempo", { bpm: 80 }), host(false, true), at(60, steady));
    expect(out).toMatchObject({ why: "notNow", line: { key: "coachTools.why.notNow.rungFar", values: { asked: 80, bpm: 60 } } });
    expect(!out.ok && out.choices?.map((c) => [c.label.values.bpm, c.call.args])).toEqual([[70, { direction: "faster" }]]);
  });

  it("refuses a closed way (the floor, a Test out), the rung it is on, and outside the ready screen and the result", () => {
    expect(runCoachTool(call("set_tempo", { direction: "slower" }), host(false, true), at(60, steady))).toMatchObject({
      line: { key: "coachTools.why.notNow.tempoEnd" },
    });
    expect(runCoachTool(call("set_tempo", { direction: "faster" }), host(false, false), at(70, steady))).toMatchObject({
      line: { key: "coachTools.why.notNow.tempoEnd" },
    });
    expect(runCoachTool(call("set_tempo", { bpm: 69 }), host(true, true), at(70, steady))).toMatchObject({
      line: { key: "coachTools.why.notNow.alreadyAt" },
    });
    expect(runCoachTool(call("set_tempo", { bpm: 80 }), host(true, true), toolCtx({ screen: "session", run: { ...runIn("timed"), bpm: 70 }, exercise: steady }))).toMatchObject({
      line: { key: "coachTools.why.notNow.here" },
    });
  });

  it("a tempo that moved before the press: nothing", () => {
    const h = host(true, true);
    const proposal = proposalOf(runCoachTool(call("set_tempo", { direction: "faster" }), h, at(70, steady)));
    expect(confirmCoachTool(proposal, h, at(80, steady, "result"))).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(h.changes()).toEqual([]);
  });
});

describe("find_edge and test_out, on a real Path", () => {
  const host = () => fakeHost({ paths: [REAL_ALT] }, { findEdge: () => "done", testOut: () => "done" });

  it("find_edge resolves the Exercise and says the tempo the climb starts at", () => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("find_edge", { exercise: "the low e riff" }), h, toolCtx()));
    expect(proposal.line.key).toBe("coachTools.propose.findEdge");
    expect(proposal.line.values).toMatchObject({ path: "Alternate Picking", step: 1, title: "The low E riff" });
    expect(proposal.line.values.bpm).toBeGreaterThan(0);
    expect(h.changes()).toEqual([]);
    expect(done(confirmCoachTool(proposal, h, toolCtx())).undo).toBeUndefined();
    expect(h.changes()).toEqual([{ member: "findEdge", args: ["alternate-picking", "even-eighths.pedal-riff"] }]);
  });

  it("find_edge refuses an Exercise the app cannot grade, and in a Session", () => {
    const h = fakeHost({ paths: TEST_PATHS }, { findEdge: () => "done" });
    expect(runCoachTool(call("find_edge", { exercise: "outside picking" }), h, toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.notGradable" },
    });
    expect(runCoachTool(call("find_edge", { exercise: "the low e riff" }), host(), toolCtx({ screen: "session", run: runIn("ready") }))).toMatchObject({
      why: "notNow",
    });
  });

  it("test_out names the Step, by number or words, and how many Takes", () => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("test_out", { path: "alternate picking", step: 1 }), h, toolCtx()));
    expect(proposal.line).toMatchObject({ key: "coachTools.propose.testOut", values: { path: "Alternate Picking", step: 1, title: "Even eighths on one string" } });
    expect(proposal.line.values.takes).toBeGreaterThan(0);
    done(confirmCoachTool(proposal, h, toolCtx()));
    expect(h.changes()).toEqual([{ member: "testOut", args: ["alternate-picking", "even-eighths"] }]);
    const byWords = proposalOf(runCoachTool(call("test_out", { query: "every string one at a time" }), host(), toolCtx()));
    expect(byWords.line.values).toMatchObject({ step: 2 });
    expect(runCoachTool(call("test_out", { path: "alternate picking", step: 99 }), host(), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notFound.step" },
    });
  });

  it("test_out on a Step with nothing to test is notNow", () => {
    const h = fakeHost({ paths: TEST_PATHS }, { testOut: () => "done" });
    expect(runCoachTool(call("test_out", { path: "alternate picking", step: 2 }), h, toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.nothingToTest" },
    });
  });
});

describe("loop_bars (leg lb1)", () => {
  const session = (phase: Parameters<typeof runIn>[0] = "ready") => toolCtx({ screen: "session", run: runIn(phase) });
  /** A host whose Session answers like `runner.loopAsked` on a four-bar tune at 72 two rungs down. */
  const host = (over: Partial<CoachToolHost> = {}) =>
    fakeHost(
      { paths: TEST_PATHS, session: true },
      {
        loopAsk: (from, to) => (to > 12 ? { refused: "outsideTune" } : { fromBar: ((from - 1) % 4) + 1, toBar: ((to - 1) % 4) + 1, bpm: 72 }),
        loopBars: () => "done",
        ...over,
      },
    );

  it("proposes the bars and the tempo, and loops them only on the press", () => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("loop_bars", { from: 3, to: 4 }), h, session()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.loopBars", values: { from: 3, to: 4, bpm: 72 } });
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, session()));
    expect(out.receipt).toEqual({ key: "coachTools.receipt.loopBars", values: { from: 3, to: 4, bpm: 72 } });
    expect(out.undo).toBeUndefined();
    expect(h.changes()).toEqual([{ member: "loopBars", args: [3, 4] }]);
  });

  it("one bar, and a Take's bar named as printed: the pattern bar it is, the asked bars passed to the press", () => {
    const h = host();
    const one = proposalOf(runCoachTool(call("loop_bars", { from: 7 }), h, session("result")));
    expect(one.line).toEqual({ key: "coachTools.propose.loopBar", values: { bar: 3, bpm: 72 } });
    done(confirmCoachTool(one, h, session("result")));
    expect(h.changes()).toEqual([{ member: "loopBars", args: [7, 7] }]);
  });

  it.each([
    ["notHere", "notNow", "coachTools.why.notNow.loopHere", {}],
    ["outsideTune", "notFound", "coachTools.why.notFound.loopBar", { bar: 4 }],
    ["backwards", "refused", "coachTools.why.refused.loopBackwards", { from: 3, to: 4 }],
    ["acrossRounds", "notFound", "coachTools.why.notFound.loopAcross", { from: 3, to: 4 }],
  ] as const)("the runner's %s, in words, and nothing done", (refused, why, key, values) => {
    const h = host({ loopAsk: () => ({ refused }) });
    expect(runCoachTool(call("loop_bars", { from: 3, to: 4 }), h, session())).toMatchObject({ ok: false, why, line: { key, values } });
    expect(h.changes()).toEqual([]);
  });

  it("never during a Take: the tool's own when refuses before the host is asked", () => {
    const h = host();
    expect(runCoachTool(call("loop_bars", { from: 1 }), h, session("playing"))).toMatchObject({ ok: false, why: "notNow", line: { key: "coachTools.why.notNow.take" } });
    expect(h.calls.filter((c) => c.member === "loopAsk" || c.member === "loopBars")).toEqual([]);
  });

  it("the press re-checks: a tempo moved or a Take started since the proposal does nothing", () => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call("loop_bars", { from: 1, to: 2 }), h, session()));
    const moved = host({ loopAsk: (from, to) => ({ fromBar: from, toBar: to, bpm: 66 }) });
    expect(confirmCoachTool(proposal, moved, session())).toMatchObject({ ok: false, why: "refused", line: { key: "coachTools.why.refused.proposal" } });
    const taking = host({ loopAsk: () => ({ refused: "notHere" }) });
    expect(confirmCoachTool(proposal, taking, session())).toMatchObject({ ok: false, why: "refused", line: { key: "coachTools.why.refused.proposal" } });
    expect(confirmCoachTool(proposal, host({ loopBars: () => "notHere" }), session())).toMatchObject({ ok: false, line: { key: "coachTools.why.refused.proposal" } });
    expect(moved.changes()).toEqual([]);
    expect(taking.changes()).toEqual([]);
  });

  it("says not yet on a host without the door", () => {
    const h = fakeHost({ paths: TEST_PATHS });
    expect(runCoachTool(call("loop_bars", { from: 3 }), h, session())).toMatchObject({ why: "notWiredYet", line: { values: { tool: "loop_bars" } } });
    expect(h.changes()).toEqual([]);
  });
});

describe("typed and waiting", () => {
  it.each([
    ["make_exercise", { shape: "scale run", root: "A", scale: "minorPentatonic" }],
  ])("%s says not yet, and touches nothing", (tool, args) => {
    const h = fakeHost({ paths: TEST_PATHS });
    expect(runCoachTool(call(tool, args), h, toolCtx())).toMatchObject({ why: "notWiredYet", line: { values: { tool } } });
    expect(h.changes()).toEqual([]);
  });
});
