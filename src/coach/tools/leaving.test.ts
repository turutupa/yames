/**
 * The owner's rule for "at once": reversible in one tap, and nothing sounds or
 * stops sounding. Leaving a tool stops its click, band or song, so while one
 * plays a navigating `go` tool waits for a press, and says what stops.
 */

import { describe, expect, it } from "vitest";
import { fakeHost, toolCtx } from "./fakeHost";
import type { Sounding } from "./host";
import { confirmCoachTool, runCoachTool, runCoachUndo } from "./run";
import { TEST_PATHS } from "./testPaths";

const jamCtx = toolCtx({ screen: "jam" });

describe("a navigating go tool while something sounds", () => {
  it.each<[string, Record<string, string | number>, string, Record<string, string | number>]>([
    ["go_to", { screen: "paths" }, "coachTools.propose.goTo", { screen: "paths" }],
    ["open_path", { path: "ligado" }, "coachTools.propose.openPath", { path: "Ligado" }],
    ["open_step", { path: "alternate picking", step: 2 }, "coachTools.propose.openStep", { path: "Alternate Picking", step: 2 }],
    ["open_settings", { section: "appearance" }, "coachTools.propose.openSettings", { section: "appearance" }],
  ])("%s is a proposal that says what stops, and goes only on the press", (tool, args, key, values) => {
    const host = fakeHost({ view: "jam", paths: TEST_PATHS, sounding: "band" });
    const out = runCoachTool({ tool, args }, host, jamCtx);
    if (!out.ok || !("proposal" in out)) throw new Error(JSON.stringify(out));
    expect(out.proposal.line.key).toBe(key);
    expect(out.proposal.line.values).toMatchObject({ ...values, stops: "band" });
    expect(host.changes()).toEqual([]);
    expect(host.where().view).toBe("jam");
    const done = confirmCoachTool(out.proposal, host, jamCtx);
    expect(done).toMatchObject({ ok: true, undo: { tool: "return_to", args: { screen: "jam" } } });
    expect(host.where().view).not.toBe("jam");
  });

  it.each<Sounding>(["click", "song"])("names what stops: %s", (sounding) => {
    const host = fakeHost({ view: "beat", sounding });
    const out = runCoachTool({ tool: "go_to", args: { screen: "today" } }, host, toolCtx({ screen: "beat" }));
    expect(out.ok && "proposal" in out && out.proposal.line.values.stops).toBe(sounding);
  });

  it("with nothing sounding it goes at once, as before", () => {
    const host = fakeHost({ view: "jam" });
    expect(runCoachTool({ tool: "go_to", args: { screen: "paths" } }, host, jamCtx)).toMatchObject({
      ok: true,
      receipt: { key: "coachTools.receipt.goTo" },
    });
    expect(host.where().view).toBe("paths");
  });

  it("a question or a screen already showing is answered at once: nothing would stop", () => {
    const host = fakeHost({ view: "jam", paths: TEST_PATHS, sounding: "band" });
    const which = runCoachTool({ tool: "open_path", args: { path: "alternate" } }, host, jamCtx);
    expect(which).toMatchObject({ ok: false, line: { key: "coachTools.why.which" } });
    expect(runCoachTool({ tool: "go_to", args: { screen: "jam" } }, host, jamCtx)).toMatchObject({
      ok: true,
      receipt: { key: "coachTools.receipt.alreadyThere" },
    });
    expect(host.changes()).toEqual([]);
  });

  it("a read tool is not held: reading stops nothing", () => {
    const host = fakeHost({ view: "jam", sounding: "band" });
    expect(runCoachTool({ tool: "show_chord", args: { chord: "Am7" } }, host, jamCtx)).toMatchObject({ ok: true });
  });

  it("an Undo that would leave while something sounds waits, and moves nothing", () => {
    const host = fakeHost({ view: "beat", sounding: "click" });
    expect(runCoachUndo({ tool: "return_to", args: { screen: "today" } }, host, toolCtx({ screen: "beat" }))).toMatchObject({
      ok: false,
      why: "notNow",
      line: { key: "coachTools.why.notNow.sounding", values: { stops: "click" } },
    });
    expect(host.where().view).toBe("beat");
  });

  it("a proposal to leave is good once, and re-checked against a Take", () => {
    const host = fakeHost({ view: "beat", sounding: "click" });
    const out = runCoachTool({ tool: "go_to", args: { screen: "paths" } }, host, toolCtx({ screen: "beat" }));
    if (!out.ok || !("proposal" in out)) throw new Error("no proposal");
    expect(confirmCoachTool(out.proposal, host, toolCtx({ screen: "beat" })).ok).toBe(true);
    expect(confirmCoachTool(out.proposal, host, toolCtx({ screen: "beat" }))).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
  });
});
