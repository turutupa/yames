/**
 * The `go` tools, each in a table: an allowed context and refused ones, the
 * resolution cases, the receipt, and the undo putting the app back exactly
 * where it was (against a fake host that records calls and keeps the view
 * and the Paths place).
 */

import { describe, expect, it } from "vitest";
import type { MainView } from "../../containers/main-window/MainHeader";
import { fakeHost, toolCtx } from "./fakeHost";
import { GO_TO_SCREENS } from "./go";
import { runCoachTool, runCoachUndo } from "./run";
import { TEST_PATHS, runIn } from "./testPaths";
import type { RunOutcome, ToolCall, ToolResult } from "./types";

function done(outcome: RunOutcome): Extract<ToolResult, { ok: true }> {
  if (!outcome.ok || "proposal" in outcome) throw new Error(`expected a receipt, got ${JSON.stringify(outcome)}`);
  return outcome;
}

function refused(outcome: RunOutcome) {
  if (outcome.ok) throw new Error(`expected a refusal, got ${JSON.stringify(outcome)}`);
  return outcome;
}

/** Run, check the receipt, run the undo, check the app is back. */
function roundTrip(call: ToolCall, start: Parameters<typeof fakeHost>[0], ctx = toolCtx()) {
  const host = fakeHost({ paths: TEST_PATHS, ...start });
  const before = host.where();
  const result = done(runCoachTool(call, host, ctx));
  const after = host.where();
  expect(result.undo).toBeDefined();
  const back = runCoachUndo(result.undo, host, ctx);
  expect(back.ok).toBe(true);
  expect(host.where()).toEqual(before);
  return { result, after, host };
}

const PLACES: Array<{ name: string; view: MainView; at: { pathId: string | null; stepId: string | null } }> = [
  { name: "Today", view: "today", at: { pathId: null, stepId: null } },
  { name: "a Step on Paths", view: "paths", at: { pathId: "alternate-picking", stepId: "ap-1" } },
  { name: "the Metronome, Paths remembering a Path", view: "beat", at: { pathId: "legato", stepId: null } },
];

describe("go_to", () => {
  it.each(GO_TO_SCREENS.filter((s) => s !== "today"))("goes to %s from Today, and back", (screen) => {
    const { result, after } = roundTrip({ tool: "go_to", args: { screen } }, { view: "today" });
    expect(after.view).toBe(screen);
    expect(result.receipt).toEqual({ key: "coachTools.receipt.goTo", values: { screen } });
  });

  it.each(PLACES)("comes back to $name", ({ view, at }) => {
    roundTrip({ tool: "go_to", args: { screen: "progress" } }, { view, at });
  });

  it("never takes `session`: a Session is started, not navigated to", () => {
    const host = fakeHost();
    const out = refused(runCoachTool({ tool: "go_to", args: { screen: "session" } }, host, toolCtx()));
    expect(out.why).toBe("refused");
    expect(host.changes()).toEqual([]);
  });

  it("already there: a receipt and nothing to undo", () => {
    const host = fakeHost({ view: "progress" });
    const out = done(runCoachTool({ tool: "go_to", args: { screen: "progress" } }, host, toolCtx()));
    expect(out.receipt.key).toBe("coachTools.receipt.alreadyThere");
    expect(out.undo).toBeUndefined();
    expect(host.changes()).toEqual([]);
  });

  it.each([
    ["a Take is running", toolCtx({ screen: "session", run: runIn("playing") }), "coachTools.why.notNow.take"],
    ["a Take is being scored", toolCtx({ screen: "session", run: runIn("listening") }), "coachTools.why.notNow.take"],
    ["a Session is open, between Takes", toolCtx({ screen: "session", run: runIn("result") }), "coachTools.why.notNow.here"],
  ])("refused while %s", (_, ctx, key) => {
    const host = fakeHost({ view: "session", session: true });
    const out = refused(runCoachTool({ tool: "go_to", args: { screen: "today" } }, host, ctx));
    expect(out.why).toBe("notNow");
    expect(out.line.key).toBe(key);
    expect(host.changes()).toEqual([]);
  });

  it("refused when the host says a Session is open though the context missed it (Settings over a Session)", () => {
    const host = fakeHost({ view: "settings", session: true });
    const out = refused(runCoachTool({ tool: "go_to", args: { screen: "today" } }, host, toolCtx()));
    expect(out.line.key).toBe("coachTools.why.notNow.session");
    expect(host.changes()).toEqual([]);
  });
});

describe("open_path", () => {
  it.each(PLACES)("opens a Path from $name, and the undo comes back", ({ view, at }) => {
    const { result, after } = roundTrip({ tool: "open_path", args: { path: "ligado" } }, { view, at });
    expect(after).toEqual({ view: "paths", at: { pathId: "legato", stepId: null } });
    expect(result.receipt).toEqual({ key: "coachTools.receipt.openPath", values: { path: "Ligado" } });
  });

  it("several Paths fit: Which one?, each choice a call that resolves to one", () => {
    const host = fakeHost({ paths: TEST_PATHS });
    const out = refused(runCoachTool({ tool: "open_path", args: { path: "alternate" } }, host, toolCtx()));
    expect(out.why).toBe("notFound");
    expect(out.line).toEqual({ key: "coachTools.why.which", values: { query: "alternate" } });
    expect(out.choices?.map((c) => c.label.values.path)).toEqual(["Alternate Picking", "Alternate Blues"]);
    expect(host.changes()).toEqual([]);
    const pick = done(runCoachTool(out.choices![1].call, host, toolCtx()));
    expect(pick.receipt.values).toEqual({ path: "Alternate Blues" });
    expect(host.where().at.pathId).toBe("blues-pentatonics");
  });

  it("no Path by those words", () => {
    const host = fakeHost({ paths: TEST_PATHS });
    const out = refused(runCoachTool({ tool: "open_path", args: { path: "tapping" } }, host, toolCtx()));
    expect(out.line).toEqual({ key: "coachTools.why.notFound.path", values: { query: "tapping" } });
    expect(host.changes()).toEqual([]);
  });

  it("an id is only words: it resolves only when it reads as a title", () => {
    const host = fakeHost({ paths: TEST_PATHS });
    // "legato" is the Path's id, but the player reads "Ligado".
    expect(refused(runCoachTool({ tool: "open_path", args: { path: "legato" } }, host, toolCtx())).why).toBe("notFound");
  });

  it("already on that Path: nothing to undo", () => {
    const host = fakeHost({ paths: TEST_PATHS, view: "paths", at: { pathId: "legato", stepId: null } });
    const out = done(runCoachTool({ tool: "open_path", args: { path: "ligado" } }, host, toolCtx()));
    expect(out.undo).toBeUndefined();
    expect(host.changes()).toEqual([]);
  });

  it("refused in a Session and during a Take", () => {
    const host = fakeHost({ paths: TEST_PATHS, view: "session", session: true });
    for (const ctx of [toolCtx({ screen: "session", run: runIn("ready") }), toolCtx({ screen: "session", run: runIn("playing") })]) {
      expect(refused(runCoachTool({ tool: "open_path", args: { path: "ligado" } }, host, ctx)).why).toBe("notNow");
    }
    expect(host.changes()).toEqual([]);
  });
});

describe("open_step", () => {
  it.each([
    ["a number, on the Path named", { path: "alternate picking", step: 2 }, ["alternate-picking", "ap-2"]],
    ["words, on the Path named", { path: "alternate picking", query: "three strings" }, ["alternate-picking", "ap-3"]],
    ["words, on every Path", { query: "martilleos" }, ["legato", "lg-1"]],
    ["a number written as digits", { path: "ligado", step: "2" }, ["legato", "lg-2"]],
  ] as const)("%s", (_, args, [pathId, stepId]) => {
    const { result, after } = roundTrip({ tool: "open_step", args }, { view: "today" });
    expect(after).toEqual({ view: "paths", at: { pathId, stepId } });
    expect(result.receipt.key).toBe("coachTools.receipt.openStep");
  });

  it("a number on the Path the player is on", () => {
    const { result } = roundTrip(
      { tool: "open_step", args: { step: 3 } },
      { view: "paths", at: { pathId: "alternate-picking", stepId: null } },
    );
    expect(result.receipt).toEqual({
      key: "coachTools.receipt.openStep",
      values: { path: "Alternate Picking", step: 3, title: "Crossing three strings" },
    });
  });

  it("a number on the Path of the context, when Paths is elsewhere", () => {
    const host = fakeHost({ paths: TEST_PATHS, view: "today" });
    const ctx = toolCtx({ path: { id: "legato" } as never });
    done(runCoachTool({ tool: "open_step", args: { step: 1 } }, host, ctx));
    expect(host.where().at).toEqual({ pathId: "legato", stepId: "lg-1" });
  });

  it("a number and no Path to count it on", () => {
    const host = fakeHost({ paths: TEST_PATHS });
    const out = refused(runCoachTool({ tool: "open_step", args: { step: 2 } }, host, toolCtx()));
    expect(out.line).toEqual({ key: "coachTools.why.notFound.whichPath", values: { step: 2 } });
  });

  it("several Steps fit: each choice names its Path and number", () => {
    const host = fakeHost({ paths: TEST_PATHS });
    const out = refused(runCoachTool({ tool: "open_step", args: { query: "crossing" } }, host, toolCtx()));
    expect(out.choices?.map((c) => c.call)).toEqual([
      { tool: "open_step", args: { path: "Alternate Picking", step: 2 } },
      { tool: "open_step", args: { path: "Alternate Picking", step: 3 } },
      { tool: "open_step", args: { path: "Ligado", step: 2 } },
    ]);
    done(runCoachTool(out.choices![2].call, host, toolCtx()));
    expect(host.where().at).toEqual({ pathId: "legato", stepId: "lg-2" });
  });

  it("several Paths fit: the choices keep the Step asked for", () => {
    const host = fakeHost({ paths: TEST_PATHS });
    const out = refused(runCoachTool({ tool: "open_step", args: { path: "alternate", step: 1 } }, host, toolCtx()));
    expect(out.choices?.map((c) => c.call)).toEqual([
      { tool: "open_step", args: { step: 1, path: "Alternate Picking" } },
      { tool: "open_step", args: { step: 1, path: "Alternate Blues" } },
    ]);
  });

  it.each([
    ["no such number", { path: "ligado", step: 7 }, "coachTools.why.notFound.step"],
    ["no such words", { path: "ligado", query: "sweep" }, "coachTools.why.notFound.step"],
    ["no such Path", { path: "tapping", step: 1 }, "coachTools.why.notFound.path"],
  ])("%s", (_, args, key) => {
    const host = fakeHost({ paths: TEST_PATHS });
    expect(refused(runCoachTool({ tool: "open_step", args }, host, toolCtx())).line.key).toBe(key);
    expect(host.changes()).toEqual([]);
  });

  it("neither a number nor words is a bad call", () => {
    expect(refused(runCoachTool({ tool: "open_step", args: { path: "ligado" } }, fakeHost({ paths: TEST_PATHS }), toolCtx())).why).toBe(
      "refused",
    );
  });

  it("refused in a Session", () => {
    const host = fakeHost({ paths: TEST_PATHS, view: "session", session: true });
    const ctx = toolCtx({ screen: "session", run: runIn("result") });
    expect(refused(runCoachTool({ tool: "open_step", args: { path: "ligado", step: 1 } }, host, ctx)).why).toBe("notNow");
  });
});

describe("open_settings", () => {
  it.each(PLACES)("opens a section from $name, and back", ({ view, at }) => {
    const { result, host } = roundTrip({ tool: "open_settings", args: { section: "grading" } }, { view, at });
    expect(result.receipt).toEqual({ key: "coachTools.receipt.openSettings", values: { section: "grading" } });
    expect(host.calls.find((c) => c.member === "openSettingsSection")?.args).toEqual(["grading"]);
  });

  it("from a Session between Takes, and back to it", () => {
    roundTrip(
      { tool: "open_settings", args: { section: "devices" } },
      { view: "session", session: true },
      toolCtx({ screen: "session", run: runIn("ready") }),
    );
  });

  it("not during a Take", () => {
    const host = fakeHost({ view: "session", session: true });
    const out = refused(runCoachTool({ tool: "open_settings", args: { section: "devices" } }, host, toolCtx({ screen: "session", run: runIn("playing") })));
    expect(out.why).toBe("notNow");
    expect(host.changes()).toEqual([]);
  });

  it("a section the app does not have is a bad call", () => {
    expect(refused(runCoachTool({ tool: "open_settings", args: { section: "microphone" } }, fakeHost(), toolCtx())).why).toBe("refused");
  });

  it("already in Settings: moves to the section, nothing to undo", () => {
    const out = done(runCoachTool({ tool: "open_settings", args: { section: "coach" } }, fakeHost({ view: "settings" }), toolCtx()));
    expect(out.undo).toBeUndefined();
  });
});

describe("return_to, the undo", () => {
  it("cannot be called by a player", () => {
    const host = fakeHost({ paths: TEST_PATHS });
    const out = refused(runCoachTool({ tool: "return_to", args: { screen: "paths", path: "legato" } }, host, toolCtx()));
    expect(out.why).toBe("refused");
    expect(host.changes()).toEqual([]);
  });

  it("drops a place that no longer exists, to the deepest that does", () => {
    const host = fakeHost({ paths: TEST_PATHS, view: "today" });
    runCoachUndo({ tool: "return_to", args: { screen: "paths", path: "legato", step: "gone" } }, host, toolCtx());
    expect(host.where()).toEqual({ view: "paths", at: { pathId: "legato", stepId: null } });
    runCoachUndo({ tool: "return_to", args: { screen: "paths", path: "gone" } }, host, toolCtx());
    expect(host.where().at).toEqual({ pathId: null, stepId: null });
  });

  it("back to a Session that has ended: not now", () => {
    const host = fakeHost({ view: "settings", session: false });
    const out = runCoachUndo({ tool: "return_to", args: { screen: "session" } }, host, toolCtx());
    expect(out.ok).toBe(false);
    expect(host.changes()).toEqual([]);
  });

  it("never walks out of a Session the player is in", () => {
    const host = fakeHost({ view: "session", session: true });
    const out = runCoachUndo({ tool: "return_to", args: { screen: "today" } }, host, toolCtx({ screen: "session", run: runIn("ready") }));
    expect(out.ok).toBe(false);
    expect(host.changes()).toEqual([]);
  });

  it("not during a Take", () => {
    const host = fakeHost({ view: "settings", session: true });
    const out = runCoachUndo({ tool: "return_to", args: { screen: "session" } }, host, toolCtx({ screen: "session", run: runIn("playing") }));
    expect(out.ok).toBe(false);
    expect(host.changes()).toEqual([]);
  });
});
