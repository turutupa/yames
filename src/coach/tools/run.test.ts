/**
 * The runner: the three checks, the two ways a tool runs, and the block
 * actions going through the same host.
 *
 * The `confirm` path is built here and proven with a fixture tool defined in
 * this file, so leg t1a2 only adds real tools to it.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../../test/mocks";
import { fakeHost, toolCtx } from "./fakeHost";
import { COACH_TOOLS } from "./registry";
import { checkCall, confirmCoachTool, dismissProposal, runBlockAction, runCoachTool, runCoachUndo } from "./run";
import { runIn } from "./testPaths";
import { defineConfirmTool, line, refuse, takeRunning, type CoachTool, type Proposal, type RunOutcome } from "./types";

/**
 * A `confirm` tool for the test: "set the minutes". It proposes the change
 * (reading only), commits it through the host, and returns the call that
 * puts the old value back, as t1a2's `set_minutes` will.
 */
const fixture = defineConfirmTool<{ from: number; to: 5 | 10 | 15 | 20 }>({
  name: "fixture_minutes",
  kind: "confirm",
  audience: "player",
  note: "test only",
  args: [{ name: "minutes", type: { kind: "integer", min: 1, max: 60 }, note: "minutes" }],
  when: (ctx) => !takeRunning(ctx),
  propose(args, host) {
    const to = args.minutes === 5 || args.minutes === 10 || args.minutes === 20 ? args.minutes : 15;
    if (args.minutes === 42) return refuse("refused", "fixture.no");
    return { ok: true, line: line("fixture.proposal", { from: host.minutes(), to }), resolved: { from: host.minutes(), to } };
  },
  commit(resolved, host) {
    const outcome = host.setMinutes(resolved.to);
    if (outcome !== "done") return refuse("notWiredYet", "coachTools.why.notWiredYet", { tool: "fixture_minutes" });
    return {
      ok: true,
      receipt: line("fixture.receipt", { to: resolved.to }),
      undo: { tool: "fixture_minutes", args: { minutes: resolved.from } },
    };
  },
});

const REGISTRY: readonly CoachTool[] = [...COACH_TOOLS, fixture];

function minutesHost() {
  let minutes: 5 | 10 | 15 | 20 = 10;
  const host = fakeHost(
    {},
    {
      minutes: () => minutes,
      setMinutes: (next) => {
        minutes = next;
        return "done";
      },
    },
  );
  return { host, minutes: () => minutes };
}

function proposalOf(outcome: RunOutcome): Proposal {
  if (!("proposal" in outcome)) throw new Error(`expected a proposal, got ${JSON.stringify(outcome)}`);
  return outcome.proposal;
}

describe("check 1: the call's shape", () => {
  it.each([
    ["not an object", "go_to"],
    ["no tool", { args: {} }],
    ["an unknown tool", { tool: "delete_takes", args: {} }],
    ["an unknown argument", { tool: "go_to", args: { screen: "today", fast: 1 } }],
    ["a missing argument", { tool: "go_to", args: {} }],
    ["args that are not an object", { tool: "go_to", args: ["today"] }],
    ["a value outside the set", { tool: "go_to", args: { screen: "devices" } }],
    ["a number outside its range", { tool: "open_step", args: { step: 0 } }],
    ["a fraction", { tool: "open_step", args: { step: 2.5 } }],
    ["words too long", { tool: "open_path", args: { path: "x".repeat(81) } }],
    ["empty words", { tool: "open_path", args: { path: "   " } }],
    ["the app's own tool, from a player", { tool: "return_to", args: { screen: "today" } }],
  ])("refuses %s, and touches nothing", (_, call) => {
    const host = fakeHost();
    const out = runCoachTool(call, host, toolCtx());
    expect(out).toMatchObject({ ok: false, why: "refused", line: { key: "coachTools.why.refused.shape" } });
    expect(host.calls).toEqual([]);
  });

  it("a whole number written as digits is a number; words are trimmed", () => {
    const checked = checkCall({ tool: "open_step", args: { step: " 3 ", query: "  roll " } });
    expect(checked.ok && checked.call.args).toEqual({ step: 3, query: "roll" });
  });

  it("args may be left out when none is required", () => {
    expect(checkCall({ tool: "explain_screen" }).ok).toBe(true);
  });
});

describe("check 2: the context", () => {
  it("a Take stops a tool before its own `when` is asked", () => {
    const when = vi.fn(() => true);
    const tool: CoachTool = { ...fixture, name: "fixture_when", when };
    const host = minutesHost().host;
    for (const phase of ["playing", "listening"] as const) {
      const out = runCoachTool({ tool: "fixture_when", args: { minutes: 5 } }, host, toolCtx({ run: runIn(phase) }), [tool]);
      expect(out).toMatchObject({ ok: false, why: "notNow", line: { key: "coachTools.why.notNow.take" } });
    }
    expect(when).not.toHaveBeenCalled();
    expect(host.calls).toEqual([]);
  });

  it("a `when` that says no", () => {
    const tool: CoachTool = { ...fixture, name: "fixture_never", when: () => false };
    const out = runCoachTool({ tool: "fixture_never", args: { minutes: 5 } }, fakeHost(), toolCtx(), [tool]);
    expect(out).toMatchObject({ ok: false, why: "notNow", line: { key: "coachTools.why.notNow.here", values: { tool: "fixture_never" } } });
  });
});

describe("a confirm tool does nothing until confirmed", () => {
  it("proposes, reading only; the press commits it", () => {
    const { host, minutes } = minutesHost();
    const proposal = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY));
    expect(proposal.line).toEqual({ key: "fixture.proposal", values: { from: 10, to: 20 } });
    expect(host.changes()).toEqual([]);
    expect(minutes()).toBe(10);

    const done = confirmCoachTool(proposal, host, toolCtx(), REGISTRY);
    expect(done).toMatchObject({ ok: true, receipt: { key: "fixture.receipt", values: { to: 20 } } });
    expect(host.changes()).toEqual([{ member: "setMinutes", args: [20] }]);
    expect(minutes()).toBe(20);
  });

  it("its undo runs at once from the Undo press, and puts the old value back", () => {
    const { host, minutes } = minutesHost();
    const proposal = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 5 } }, host, toolCtx(), REGISTRY));
    const done = confirmCoachTool(proposal, host, toolCtx(), REGISTRY);
    expect(done.ok && done.undo).toEqual({ tool: "fixture_minutes", args: { minutes: 10 } });
    expect(runCoachUndo(done.ok ? done.undo : null, host, toolCtx(), REGISTRY).ok).toBe(true);
    expect(minutes()).toBe(10);
  });

  it("a proposal is confirmed once", () => {
    const { host } = minutesHost();
    const proposal = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY));
    confirmCoachTool(proposal, host, toolCtx(), REGISTRY);
    const again = confirmCoachTool(proposal, host, toolCtx(), REGISTRY);
    expect(again).toMatchObject({ ok: false, why: "refused" });
    expect(host.changes()).toHaveLength(1);
  });

  it("one built by hand, or changed after it was shown, does nothing", () => {
    const { host } = minutesHost();
    const forged: Proposal = { tool: "fixture_minutes", args: { minutes: 20 }, line: line("x") };
    expect(confirmCoachTool(forged, host, toolCtx(), REGISTRY)).toMatchObject({ ok: false, why: "refused" });
    const real = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY));
    expect(Object.isFrozen(real)).toBe(true);
    expect(() => {
      (real as { resolved?: unknown }).resolved = { from: 10, to: 5 };
    }).toThrow();
    expect(host.changes()).toEqual([]);
  });

  it("what the tool resolved is out of the caller's reach: the press does what was proposed (review 6)", () => {
    const { host, minutes } = minutesHost();
    const real = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY));
    expect("resolved" in real).toBe(false);
    expect(() => {
      (real.args as Record<string, unknown>).minutes = 5;
    }).toThrow();
    expect(() => {
      (real.line.values as Record<string, unknown>).to = 5;
    }).not.toThrow();
    expect(confirmCoachTool(real, host, toolCtx(), REGISTRY)).toMatchObject({ ok: true, receipt: { values: { to: 20 } } });
    expect(minutes()).toBe(20);
  });

  it("a go proposal's arguments are kept by the runner: changing the call afterwards changes nothing (review 6)", () => {
    const call = { tool: "go_to", args: { screen: "paths" } };
    const host = fakeHost({ view: "beat", sounding: "click" });
    const out = runCoachTool(call, host, toolCtx({ screen: "beat" }));
    call.args.screen = "progress";
    const done = confirmCoachTool(proposalOf(out), host, toolCtx({ screen: "beat" }));
    expect(done).toMatchObject({ ok: true, receipt: { values: { screen: "paths" } } });
    expect(host.where().view).toBe("paths");
  });

  // An undo is the runner's, and runs once (review 5).
  it("a made-up undo, even naming a real tool or an app-only one, is refused and runs nothing", () => {
    const { host, minutes } = minutesHost();
    for (const forged of [
      { tool: "fixture_minutes", args: { minutes: 5 } },
      { tool: "return_to", args: { screen: "paths" } },
      { tool: "set_tempo", args: { bpm: 80 } },
      null,
      "fixture_minutes",
    ]) {
      expect(runCoachUndo(forged, host, toolCtx(), REGISTRY), JSON.stringify(forged)).toMatchObject({ ok: false, why: "refused", detail: "not a live undo" });
    }
    expect(host.changes()).toEqual([]);
    expect(minutes()).toBe(10);
  });

  it("an issued undo runs once; a copy of it is not it; pressed twice, the second does nothing", () => {
    const { host, minutes } = minutesHost();
    const done = confirmCoachTool(proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY)), host, toolCtx(), REGISTRY);
    if (!done.ok || !done.undo) throw new Error("no undo");
    expect(Object.isFrozen(done.undo) && Object.isFrozen(done.undo.args)).toBe(true);
    expect(runCoachUndo({ ...done.undo }, host, toolCtx(), REGISTRY)).toMatchObject({ ok: false, detail: "not a live undo" });
    expect(runCoachUndo(done.undo, host, toolCtx(), REGISTRY).ok).toBe(true);
    expect(minutes()).toBe(10);
    host.setMinutes(20);
    expect(runCoachUndo(done.undo, host, toolCtx(), REGISTRY)).toMatchObject({ ok: false, detail: "not a live undo" });
    expect(minutes()).toBe(20);
  });

  it("an undo refused for now (a Take running) stays good for the next press", () => {
    const { host, minutes } = minutesHost();
    const done = confirmCoachTool(proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY)), host, toolCtx(), REGISTRY);
    if (!done.ok || !done.undo) throw new Error("no undo");
    expect(runCoachUndo(done.undo, host, toolCtx({ screen: "session", run: runIn("playing") }), REGISTRY)).toMatchObject({ why: "notNow" });
    expect(runCoachUndo(done.undo, host, toolCtx(), REGISTRY).ok).toBe(true);
    expect(minutes()).toBe(10);
  });

  it("Not now: a dismissed proposal can never be confirmed", () => {
    const { host } = minutesHost();
    const proposal = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY));
    dismissProposal(proposal);
    expect(confirmCoachTool(proposal, host, toolCtx(), REGISTRY)).toMatchObject({ ok: false, why: "refused" });
    expect(host.changes()).toEqual([]);
  });

  it("a Take that started after the proposal was shown stops the press", () => {
    const { host, minutes } = minutesHost();
    const proposal = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY));
    const out = confirmCoachTool(proposal, host, toolCtx({ screen: "session", run: runIn("playing") }), REGISTRY);
    expect(out).toMatchObject({ ok: false, why: "notNow" });
    expect(minutes()).toBe(10);
  });

  it("a refusal at proposal time comes back as it is", () => {
    const out = runCoachTool({ tool: "fixture_minutes", args: { minutes: 42 } }, minutesHost().host, toolCtx(), REGISTRY);
    expect(out).toMatchObject({ ok: false, why: "refused", line: { key: "fixture.no" } });
  });

  it("a host that is not wired says so at the press", () => {
    const host = fakeHost();
    const proposal = proposalOf(runCoachTool({ tool: "fixture_minutes", args: { minutes: 20 } }, host, toolCtx(), REGISTRY));
    expect(confirmCoachTool(proposal, host, toolCtx(), REGISTRY)).toMatchObject({ ok: false, why: "notWiredYet" });
  });
});

describe("a tool or a host that throws", () => {
  it("is a refusal with the reason in the log, not a crash", () => {
    const host = fakeHost(
      {},
      {
        setView: () => {
          throw new Error("boom");
        },
      },
    );
    const out = runCoachTool({ tool: "go_to", args: { screen: "paths" } }, host, toolCtx());
    expect(out).toMatchObject({ ok: false, why: "refused", line: { key: "coachTools.why.failed" }, detail: "Error: boom" });
  });
});

describe("the block actions, through the tools' host", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
  });

  it("reach the same members the tools call, by id", () => {
    const host = fakeHost({}, { loadJam: () => "done", loadPreset: () => "done", setClickSubdivision: () => "done" });
    expect(runBlockAction({ kind: "loadJam", jam: "blues" }, host)).toBe("done");
    expect(runBlockAction({ kind: "loadPreset", preset: "warmup" }, host)).toBe("done");
    expect(runBlockAction({ kind: "clickSubdivision", subdivision: 3 }, host)).toBe("done");
    expect(host.changes()).toEqual([
      { member: "loadJam", args: ["blues"] },
      { member: "loadPreset", args: ["warmup"] },
      { member: "setClickSubdivision", args: [3] },
    ]);
    // The host is the door; nothing goes round it to the engine.
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("pass on a host's not-wired-yet rather than claiming it was done", () => {
    const host = fakeHost();
    expect(runBlockAction({ kind: "loadPreset", preset: "warmup" }, host)).toBe("notWiredYet");
    expect(runBlockAction({ kind: "loadJam", jam: "blues" }, host)).toBe("notWiredYet");
  });

  it("the three waiting on later legs stay not wired", () => {
    const host = fakeHost();
    expect(runBlockAction({ kind: "loopBars", score: "s", fromBar: 1, toBar: 4 }, host)).toBe("notWiredYet");
    expect(runBlockAction({ kind: "ramp", fromBpm: 90, toBpm: 120 }, host)).toBe("notWiredYet");
    expect(runBlockAction({ kind: "comeBack", days: 2 }, host)).toBe("notWiredYet");
    expect(host.changes()).toEqual([]);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("a block's loopBars names a song's bars: it never reaches the Session's loop door (leg lb1)", () => {
    const host = fakeHost({ session: true }, { loopAsk: () => ({ fromBar: 1, toBar: 4, bpm: 60, loopId: "s#loop", variantSeed: null }), loopBars: () => "done" });
    expect(runBlockAction({ kind: "loopBars", score: "s", fromBar: 1, toBar: 4 }, host)).toBe("notWiredYet");
    expect(host.calls).toEqual([]);
  });
});
