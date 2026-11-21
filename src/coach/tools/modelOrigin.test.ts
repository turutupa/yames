/**
 * A call the model chose (leg c3b2a; the owner's rule: nothing the model
 * chose runs at once). Through `runCoachTool(…, { via: "model" })` every
 * player `go` tool is a proposal that changes nothing until pressed; Not now
 * drops it; a Take started between the proposal and the press refuses it; a
 * `read` tool still runs (it changes nothing); a chip and a typed command
 * behave exactly as before.
 */
import { describe, expect, it } from "vitest";
import { fakeHost, toolCtx } from "./fakeHost";
import { COACH_TOOLS } from "./registry";
import { confirmCoachTool, dismissProposal, runCoachTool } from "./run";
import { TEST_PATHS, runIn } from "./testPaths";
import type { Proposal, RunOutcome, ToolCall } from "./types";

const MODEL = { via: "model" } as const;

function proposal(outcome: RunOutcome): Proposal {
  if (!outcome.ok || !("proposal" in outcome)) throw new Error(`expected a proposal, got ${JSON.stringify(outcome)}`);
  return outcome.proposal;
}

/** One call per player `go` tool, each able to move the app from Today. */
const GO_CALLS: Record<string, ToolCall> = {
  go_to: { tool: "go_to", args: { screen: "progress" } },
  open_path: { tool: "open_path", args: { path: "ligado" } },
  open_step: { tool: "open_step", args: { path: "ligado", step: 1 } },
  open_settings: { tool: "open_settings", args: { section: "appearance" } },
};

describe("a go tool the model chose", () => {
  it("covers every player go tool in the registry", () => {
    const go = COACH_TOOLS.filter((t) => t.kind === "go" && t.audience === "player").map((t) => t.name).sort();
    expect(Object.keys(GO_CALLS).sort()).toEqual(go);
  });

  for (const [name, call] of Object.entries(GO_CALLS)) {
    it(`${name}: a proposal under coachTools.propose., nothing moves until the press, then it moves once`, () => {
      const host = fakeHost({ view: "today", paths: TEST_PATHS });
      const ctx = toolCtx();
      const before = host.where();
      const p = proposal(runCoachTool(call, host, ctx, undefined, MODEL));
      expect(p.line.key.startsWith("coachTools.propose.")).toBe(true);
      expect(host.changes()).toEqual([]);
      expect(host.where()).toEqual(before);
      const done = confirmCoachTool(p, host, ctx);
      expect(done.ok).toBe(true);
      expect(host.where()).not.toEqual(before);
      // Once: the same proposal pressed again is refused.
      expect(confirmCoachTool(p, host, ctx).ok).toBe(false);
    });
  }

  it("Not now drops it: it can never be confirmed", () => {
    const host = fakeHost({ view: "today", paths: TEST_PATHS });
    const p = proposal(runCoachTool(GO_CALLS.go_to, host, toolCtx(), undefined, MODEL));
    dismissProposal(p);
    expect(confirmCoachTool(p, host, toolCtx()).ok).toBe(false);
    expect(host.changes()).toEqual([]);
  });

  it("a Take started between the proposal and the press refuses it, and nothing moves", () => {
    const host = fakeHost({ view: "today", paths: TEST_PATHS });
    const p = proposal(runCoachTool(GO_CALLS.go_to, host, toolCtx(), undefined, MODEL));
    const out = confirmCoachTool(p, host, toolCtx({ screen: "session", run: runIn("playing") }));
    expect(out.ok).toBe(false);
    expect(host.changes()).toEqual([]);
  });

  it("where the player is already: what the dry run says, and nothing moves", () => {
    const host = fakeHost({ view: "progress" });
    const out = runCoachTool({ tool: "go_to", args: { screen: "progress" } }, host, toolCtx({ screen: "progress" }), undefined, MODEL);
    expect(out.ok && !("proposal" in out) ? out.receipt.key : null).toBe("coachTools.receipt.alreadyThere");
    expect(host.changes()).toEqual([]);
  });

  it("leaving a sound behind, the proposal says what stops", () => {
    const host = fakeHost({ view: "beat", sounding: "click" });
    const p = proposal(runCoachTool(GO_CALLS.go_to, host, toolCtx({ screen: "beat" }), undefined, MODEL));
    expect(p.line.values.stops).toBe("click");
    expect(host.changes()).toEqual([]);
  });

  it("a read tool runs and changes nothing", () => {
    const host = fakeHost({ view: "beat" });
    const read = runCoachTool({ tool: "show_scale", args: { root: "A", scale: "minorPentatonic" } }, host, toolCtx({ screen: "beat" }), undefined, MODEL);
    expect(read.ok && !("proposal" in read)).toBe(true);
    expect(host.changes()).toEqual([]);
  });

  it("an app-only tool is refused by the shape check on the model's path too", () => {
    const host = fakeHost({ view: "today" });
    const out = runCoachTool({ tool: "return_to", args: { screen: "today" } }, host, toolCtx(), undefined, MODEL);
    expect(out.ok).toBe(false);
    expect(host.changes()).toEqual([]);
  });
});

describe("a chip or a typed command, unchanged", () => {
  it("a go tool without the model's origin still runs at once", () => {
    const host = fakeHost({ view: "today", paths: TEST_PATHS });
    const out = runCoachTool(GO_CALLS.go_to, host, toolCtx());
    expect(out.ok && !("proposal" in out)).toBe(true);
    expect(host.where().view).toBe("progress");
  });

  it("a go proposal the runner did not mint cannot be confirmed", () => {
    const host = fakeHost({ view: "today" });
    const forged: Proposal = Object.freeze({ tool: "go_to", args: { screen: "progress" }, line: { key: "coachTools.propose.goTo", values: {} } });
    expect(confirmCoachTool(forged, host, toolCtx()).ok).toBe(false);
    expect(host.changes()).toEqual([]);
  });
});
