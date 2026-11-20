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

  it("an Undo that would leave while something sounds waits, moves nothing, and stays good for later", () => {
    const host = fakeHost({ view: "today" });
    const out = runCoachTool({ tool: "go_to", args: { screen: "beat" } }, host, toolCtx());
    if (!out.ok || "proposal" in out || !out.undo) throw new Error(JSON.stringify(out));
    host.play("click");
    expect(runCoachUndo(out.undo, host, toolCtx({ screen: "beat" }))).toMatchObject({
      ok: false,
      why: "notNow",
      line: { key: "coachTools.why.notNow.sounding", values: { stops: "click" } },
    });
    expect(host.where().view).toBe("beat");
    host.play(null);
    expect(runCoachUndo(out.undo, host, toolCtx({ screen: "beat" })).ok).toBe(true);
    expect(host.where().view).toBe("today");
  });
});

describe("Settings is an overlay: opening it stops nothing (review 7 and 8)", () => {
  it("open_settings with the click playing runs at once, and its Undo goes back without stopping anything", () => {
    const host = fakeHost({ view: "beat", sounding: "click" });
    const out = runCoachTool({ tool: "open_settings", args: { section: "appearance" } }, host, toolCtx({ screen: "beat" }));
    expect(out).toMatchObject({ ok: true, receipt: { key: "coachTools.receipt.openSettings" }, undo: { tool: "return_to", args: { screen: "beat" } } });
    expect(host.where().view).toBe("settings");
    expect(host.sounding()).toBe("click");
    if (!out.ok || "proposal" in out) return;
    expect(runCoachUndo(out.undo, host, toolCtx({ screen: "beat" }))).toMatchObject({ ok: true });
    expect(host.where().view).toBe("beat");
    expect(host.sounding()).toBe("click");
  });

  it("go_to settings with a band playing runs at once too", () => {
    const host = fakeHost({ view: "jam", sounding: "band" });
    expect(runCoachTool({ tool: "go_to", args: { screen: "settings" } }, host, jamCtx)).toMatchObject({ ok: true, receipt: { key: "coachTools.receipt.goTo" } });
    expect(host.where().view).toBe("settings");
  });

  it("from Settings over a playing jam: back to the jam is at once; elsewhere is a proposal naming the band", () => {
    const host = fakeHost({ view: "settings", mode: "jam", sounding: "band" });
    const away = runCoachTool({ tool: "go_to", args: { screen: "paths" } }, host, toolCtx());
    expect(away.ok && "proposal" in away && away.proposal.line.values.stops).toBe("band");
    expect(runCoachTool({ tool: "go_to", args: { screen: "jam" } }, host, toolCtx())).toMatchObject({ ok: true, receipt: { key: "coachTools.receipt.goTo" } });
    expect(host.sounding()).toBe("band");
  });

  it("open_settings from Settings while the click plays scrolls to the section", () => {
    const host = fakeHost({ view: "settings", mode: "beat", sounding: "click" });
    const out = runCoachTool({ tool: "open_settings", args: { section: "coach" } }, host, toolCtx({ screen: "beat" }));
    expect(out).toMatchObject({ ok: true, receipt: { key: "coachTools.receipt.openSettings" } });
    expect(host.calls.filter((c) => c.member === "openSettingsSection")).toEqual([{ member: "openSettingsSection", args: ["coach"] }]);
  });
});

describe("a proposal to leave", () => {
  it("is good once, and re-checked against a Take", () => {
    const host = fakeHost({ view: "beat", sounding: "click" });
    const out = runCoachTool({ tool: "go_to", args: { screen: "paths" } }, host, toolCtx({ screen: "beat" }));
    if (!out.ok || !("proposal" in out)) throw new Error("no proposal");
    expect(confirmCoachTool(out.proposal, host, toolCtx({ screen: "beat" })).ok).toBe(true);
    expect(confirmCoachTool(out.proposal, host, toolCtx({ screen: "beat" }))).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
  });
});
