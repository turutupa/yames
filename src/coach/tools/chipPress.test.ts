/**
 * A suggestion chip's own press (leg chip1): the rules, proven by walking the
 * list.
 *
 * The owner's decision: one press of the chip IS the press for a reversible
 * one-step change, always with Undo; anything multi-step or not undoable
 * still goes through a proposal. Which tools qualify is registry data
 * (`CHIP_PRESS`, `chipPress`), and this file holds every flagged tool to it,
 * against the recording fake host (`fakeHost.ts`): a flagged tool with no
 * case here fails; a flagged tool whose press calls any host member but one
 * of the value setters, or any member on the NEVER list below (sound, the
 * screen, plans, loads), fails; one whose undo does not put the fake's value
 * back exactly, fails. "No sound, no screen" here means: no such member was
 * called, and the fake's own `sounding()` and `where()` read the same after.
 * What a REAL setter does besides (on the jam tab `setTempo` also edits the
 * jam; the engine reacts to a tempo) is not visible from here: that is
 * `useCoachToolHost.test.tsx`'s and the layout suite's (`ask-tools.spec.ts`).
 * Also here (leg chip1b): a run of presses chains into one Undo (review M1),
 * and a jam take being written keeps the proposal (review M2).
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Exercise } from "../../paths/format";
import type { Subdivision } from "../../types";
import type { CoachContext } from "../context";
import { fakeHost, toolCtx, type FakeHost } from "./fakeHost";
import type { CoachToolHost, SafeSettingKey, SafeSettingOption, SafeSettingValue, Sounding } from "./host";
import { SAFE_SETTING_KEYS } from "./host";
import { CHIP_PRESS, COACH_TOOLS } from "./registry";
import { chipPressable, pressCoachChip, runCoachTool, runCoachUndo, undoStillGood } from "./run";
import { ALT, runIn } from "./testPaths";
import { line, type CoachTool, type ConfirmTool, type ToolCall, type ToolDone } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The members a chip's press may call to change something: one value's own setter. */
const SETTERS = new Set<keyof CoachToolHost>(["setTempo", "nudgeTempo", "setClickSubdivision", "setSafeSetting"]);

/** The members that start or stop sound, move the screen, store a plan or a goal, or follow: never from a chip's press. */
const NEVER_FROM_A_CHIP = new Set<keyof CoachToolHost>([
  "setView",
  "movePaths",
  "openSettingsSection",
  "startToday",
  "playExercise",
  "findEdge",
  "testOut",
  "confirmSwap",
  "undoSwap",
  "setMinutes",
  "setTodayFocus",
  "followPath",
  "loadJam",
  "loadPreset",
  "setGoal",
  "loopBars",
]);

const flaggedTools = (): CoachTool[] => COACH_TOOLS.filter((t) => t.chipPress === true);

// ---------------------------------------------------------------------------
// One case per flagged tool (and screen): a host with the value, the call a
// chip makes, how to read the value, and how a hand moves it back.
// ---------------------------------------------------------------------------

type Case = {
  name: string;
  tool: string;
  call: ToolCall;
  host: FakeHost;
  ctx: () => CoachContext;
  read: () => unknown;
  /** The player puts it back to where it was by hand (not through the coach). */
  byHand: () => void;
};

function tempoCase(view: "beat" | "drill" | "jam", sounding: Sounding | null, direction: "slower" | "faster"): Case {
  let bpm = 100;
  const host = fakeHost({ view, sounding }, {
    tempo: () => bpm,
    setTempo: (next) => {
      bpm = next;
      return "done";
    },
  });
  return {
    name: `set_tempo ${direction} on ${view}, ${sounding ?? "silent"}`,
    tool: "set_tempo",
    call: { tool: "set_tempo", args: { direction } },
    host,
    ctx: () => toolCtx({ screen: view }),
    read: () => bpm,
    byHand: () => {
      bpm = 100;
    },
  };
}

const steady = ALT.steps.flatMap((s) => s.exercises).find((e) => e.id === "ap-1-a") as Exercise; // graded 60, 70, 80
const RUNGS: Readonly<Record<number, { slower?: number; faster?: number }>> = { 60: { faster: 70 }, 70: { slower: 60, faster: 80 }, 80: { slower: 70 } };

function sessionCase(direction: "slower" | "faster"): Case {
  let bpm = 70;
  const host = fakeHost({ view: "session", session: true }, {
    nudges: () => ({ slower: RUNGS[bpm].slower !== undefined, faster: RUNGS[bpm].faster !== undefined }),
    nudgeTempo: (way) => {
      bpm = RUNGS[bpm][way] ?? bpm;
      return "done";
    },
  });
  return {
    name: `set_tempo ${direction} in a Session, between Takes`,
    tool: "set_tempo",
    call: { tool: "set_tempo", args: { direction } },
    host,
    ctx: () => toolCtx({ screen: "session", run: { ...runIn("ready"), bpm }, exercise: steady }),
    read: () => bpm,
    byHand: () => {
      bpm = 70;
    },
  };
}

function subdivisionCase(sounding: Sounding | null): Case {
  let sub = 1;
  const host = fakeHost({ view: "beat", sounding }, {
    clickSubdivision: () => sub as Subdivision,
    setClickSubdivision: (next) => {
      sub = next;
      return "done";
    },
  });
  return {
    name: `click_subdivision, ${sounding ?? "silent"}`,
    tool: "click_subdivision",
    call: { tool: "click_subdivision", args: { subdivision: 2 } },
    host,
    ctx: () => toolCtx({ screen: "beat" }),
    read: () => sub,
    byHand: () => {
      sub = 1;
    },
  };
}

const SETTING_CASES: Readonly<Record<SafeSettingKey, { from: SafeSettingValue; said: string; options: SafeSettingOption[] }>> = {
  theme: { from: "ember", said: "velvet", options: [{ value: "ember", names: ["ember"] }, { value: "velvet", names: ["velvet"] }] },
  language: { from: "en", said: "es", options: [{ value: "en", names: ["en", "English"] }, { value: "es", names: ["es", "Español"] }] },
  practiceView: { from: "neck", said: "tab", options: [{ value: "neck", names: ["neck"] }, { value: "tab", names: ["tab"] }] },
  // Never chosen: the undo gives the choice back to the app.
  bandVolume: { from: "auto", said: "50", options: [{ value: "auto", names: ["auto"] }] },
  countIn: { from: false, said: "on", options: [{ value: false, names: ["off"] }, { value: true, names: ["on"] }] },
  coachVoice: { from: false, said: "on", options: [{ value: false, names: ["off"] }, { value: true, names: ["on"] }] },
  coachSuggestions: { from: true, said: "off", options: [{ value: false, names: ["off"] }, { value: true, names: ["on"] }] },
};

function settingCase(key: SafeSettingKey, sounding: Sounding | null): Case {
  const spec = SETTING_CASES[key];
  let value: SafeSettingValue = spec.from;
  const host = fakeHost({ view: "beat", sounding }, {
    safeSetting: (k) => (k === key ? value : "notWiredYet"),
    safeSettingOptions: (k) => (k === key ? spec.options : "notWiredYet"),
    setSafeSetting: (k, next) => {
      if (k === key) value = next;
      return "done";
    },
  });
  return {
    name: `set_setting ${key}, ${sounding ?? "silent"}`,
    tool: "set_setting",
    call: { tool: "set_setting", args: { key, value: spec.said } },
    host,
    ctx: () => toolCtx({ screen: "beat" }),
    read: () => value,
    byHand: () => {
      value = spec.from;
    },
  };
}

function cases(): Case[] {
  return [
    tempoCase("beat", null, "slower"),
    tempoCase("beat", "click", "faster"),
    tempoCase("drill", "click", "slower"),
    tempoCase("jam", "band", "slower"),
    sessionCase("slower"),
    sessionCase("faster"),
    subdivisionCase(null),
    subdivisionCase("click"),
  ];
}

/** `set_setting`, unflagged (review L3): its chip press must stay a proposal for every key. */
function settingCases(): Case[] {
  return SAFE_SETTING_KEYS.flatMap((key) => [settingCase(key, null), settingCase(key, "band")]);
}

function receiptOf(outcome: ReturnType<typeof pressCoachChip>): ToolDone {
  if (!outcome.ok || "proposal" in outcome) throw new Error(`not a receipt: ${JSON.stringify(outcome)}`);
  return outcome;
}

describe("the flag is registry data", () => {
  it("every flagged tool is in CHIP_PRESS with its reason, and every CHIP_PRESS entry is a flagged tool", () => {
    const flagged = flaggedTools().map((t) => t.name).sort();
    expect(flagged).toEqual(Object.keys(CHIP_PRESS).sort());
    for (const name of flagged) expect(CHIP_PRESS[name].length, name).toBeGreaterThan(20);
  });

  it("every flagged tool is a player's `confirm` tool that does not leave the screen", () => {
    for (const tool of flaggedTools()) {
      expect(tool.kind, tool.name).toBe("confirm");
      expect(tool.audience, tool.name).toBe("player");
      expect(tool.leaves, tool.name).toBeUndefined();
      expect(chipPressable(tool), tool.name).toBe(true);
    }
  });

  it("the list, as the owner's rules leave it (set_setting unflagged: review L3)", () => {
    expect(flaggedTools().map((t) => t.name)).toEqual(["set_tempo", "click_subdivision"]);
  });

  it("every flagged tool has a case here", () => {
    const covered = new Set(cases().map((c) => c.tool));
    for (const tool of flaggedTools()) expect(covered.has(tool.name), `add a chip case for ${tool.name}`).toBe(true);
  });

  it("a set_setting chip, for every safe key, is still a proposal and changes nothing (no chip offers one; language is not exactly undoable)", () => {
    const all = settingCases();
    expect(new Set(all.map((c) => c.call.args.key))).toEqual(new Set(SAFE_SETTING_KEYS));
    for (const c of all) {
      const before = c.read();
      expect("proposal" in pressCoachChip(c.call, c.host, c.ctx()), c.name).toBe(true);
      expect(c.host.changes(), c.name).toEqual([]);
      expect(c.read()).toEqual(before);
    }
  });

  it("a tool marked to leave the screen, or the app's own, is never chip-pressable whatever its data says", () => {
    const tempo = COACH_TOOLS.find((t) => t.name === "set_tempo")!;
    expect(chipPressable({ ...tempo, leaves: true } as CoachTool)).toBe(false);
    expect(chipPressable({ ...tempo, audience: "app" } as CoachTool)).toBe(false);
    expect(chipPressable({ ...tempo, chipPress: undefined } as CoachTool)).toBe(false);
  });
});

describe("a flagged tool's chip press: one value, its setter, its undo, no sound and no screen", () => {
  it.each(cases().map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const before = c.read();
    const sounding = c.host.sounding();
    const where = c.host.where();
    const out = receiptOf(pressCoachChip(c.call, c.host, c.ctx()));
    expect(out.undo, "a receipt with Undo").toBeDefined();
    const changes = c.host.changes();
    expect(changes, "exactly one change").toHaveLength(1);
    expect(SETTERS.has(changes[0].member), changes[0].member).toBe(true);
    expect(NEVER_FROM_A_CHIP.has(changes[0].member)).toBe(false);
    expect(c.read()).not.toEqual(before);
    expect(c.host.sounding()).toBe(sounding);
    expect(c.host.where()).toEqual(where);

    expect(undoStillGood(out.undo, c.host, c.ctx())).toBe(true);
    expect(runCoachUndo(out.undo, c.host, c.ctx()).ok).toBe(true);
    expect(c.read(), "the undo puts back exactly what was there").toEqual(before);
    const after = c.host.changes();
    expect(after).toHaveLength(2);
    expect(after.every((call) => SETTERS.has(call.member) && !NEVER_FROM_A_CHIP.has(call.member))).toBe(true);
    expect(c.host.sounding()).toBe(sounding);
    expect(c.host.where()).toEqual(where);
    // Single use.
    expect(undoStillGood(out.undo, c.host, c.ctx())).toBe(false);
    expect(runCoachUndo(out.undo, c.host, c.ctx()).ok).toBe(false);
  });

  it.each(cases().map((c) => [c.name, c] as const))("%s: moved by hand since, the Undo is no longer good and does nothing", (_name, c) => {
    const before = c.read();
    const out = receiptOf(pressCoachChip(c.call, c.host, c.ctx()));
    c.byHand();
    expect(undoStillGood(out.undo, c.host, c.ctx())).toBe(false);
    expect(runCoachUndo(out.undo, c.host, c.ctx()).ok).toBe(false);
    expect(c.read()).toEqual(before);
    expect(c.host.changes()).toHaveLength(1);
  });

  it.each(cases().map((c) => [c.name, c] as const))("%s: during a Take, nothing", (_name, c) => {
    const before = c.read();
    const take = { ...c.ctx(), run: { ...(c.ctx().run ?? runIn("playing")), phase: "playing" as const } };
    expect(pressCoachChip(c.call, c.host, take)).toMatchObject({ ok: false, why: "notNow", line: { key: "coachTools.why.notNow.take" } });
    expect(c.host.changes()).toEqual([]);
    expect(c.read()).toEqual(before);
  });

  it("in a Session on a result, the nudge stays a proposal: the nudge would also leave the result, which no Undo puts back", () => {
    const c = sessionCase("slower");
    const result = { ...c.ctx(), run: { ...c.ctx().run!, phase: "result" as const } };
    const out = pressCoachChip(c.call, c.host, result);
    expect("proposal" in out).toBe(true);
    expect(c.host.changes()).toEqual([]);
    expect(c.read()).toBe(70);
  });

  it("the Undo is good only where it was issued: on another screen it is not, and a press there changes nothing", () => {
    const c = tempoCase("beat", "click", "slower");
    const out = receiptOf(pressCoachChip(c.call, c.host, c.ctx()));
    c.host.setView("drill");
    expect(undoStillGood(out.undo, c.host, toolCtx({ screen: "drill" }))).toBe(false);
    expect(runCoachUndo(out.undo, c.host, toolCtx({ screen: "drill" })).ok).toBe(false);
    expect(c.read()).toBe(95);
    expect(c.host.changes().filter((x) => x.member === "setTempo")).toHaveLength(1);
  });
});

describe("a run of presses is one change to undo (leg chip1b, review M1)", () => {
  it("Slower, Slower, Slower, Undo: back to the tempo before the run; the receipt says the whole change", () => {
    const c = tempoCase("beat", null, "slower");
    const one = receiptOf(pressCoachChip(c.call, c.host, c.ctx()));
    const two = receiptOf(pressCoachChip(c.call, c.host, c.ctx(), undefined, one.undo));
    const three = receiptOf(pressCoachChip(c.call, c.host, c.ctx(), undefined, two.undo));
    expect(c.read()).toBe(85);
    expect(three.receipt.values).toMatchObject({ from: 100, to: 85 });
    expect(three.undo!.args).toEqual({ bpm: 100, at: 85 });
    // The single Undos of the run are spent: only the run's is good.
    expect(undoStillGood(one.undo, c.host, c.ctx())).toBe(false);
    expect(undoStillGood(two.undo, c.host, c.ctx())).toBe(false);
    expect(runCoachUndo(three.undo, c.host, c.ctx()).ok).toBe(true);
    expect(c.read()).toBe(100);
  });

  it("a subdivision run chains the same way", () => {
    let sub = 1;
    const host = fakeHost({ view: "beat" }, { clickSubdivision: () => sub as Subdivision, setClickSubdivision: (next) => ((sub = next), "done") });
    const ctx = toolCtx({ screen: "beat" });
    const one = receiptOf(pressCoachChip({ tool: "click_subdivision", args: { subdivision: 2 } }, host, ctx));
    const two = receiptOf(pressCoachChip({ tool: "click_subdivision", args: { subdivision: 3 } }, host, ctx, undefined, one.undo));
    expect(two.undo!.args).toEqual({ subdivision: 1, at: 3 });
    expect(runCoachUndo(two.undo, host, ctx).ok).toBe(true);
    expect(sub).toBe(1);
  });

  it("not a run: the value moved since the earlier press (or the press read it before the echo), so the new Undo is its own", () => {
    const c = tempoCase("beat", null, "slower");
    const one = receiptOf(pressCoachChip(c.call, c.host, c.ctx()));
    c.byHand(); // back at 100 by hand: the earlier press's 95 is gone
    const two = receiptOf(pressCoachChip(c.call, c.host, c.ctx(), undefined, one.undo));
    expect(two.undo!.args).toEqual({ bpm: 100, at: 95 });
    expect(two.receipt.values).toMatchObject({ from: 100, to: 95 });
  });

  it("a run back to where it started keeps the last press's own Undo (an Undo to where it is would do nothing)", () => {
    const c = tempoCase("beat", null, "slower");
    const one = receiptOf(pressCoachChip(c.call, c.host, c.ctx()));
    const two = receiptOf(pressCoachChip({ tool: "set_tempo", args: { direction: "faster" } }, c.host, c.ctx(), undefined, one.undo));
    expect(c.read()).toBe(100);
    expect(two.undo!.args).toEqual({ bpm: 95, at: 100 });
  });

  it("in a Session a second press while the first one's Undo is live is the proposal (one rung per press: no one Undo puts a run back)", () => {
    const up = sessionCase("faster");
    const one = receiptOf(pressCoachChip(up.call, up.host, up.ctx()));
    expect(up.read()).toBe(80);
    const two = pressCoachChip({ tool: "set_tempo", args: { direction: "slower" } }, up.host, up.ctx(), undefined, one.undo);
    expect("proposal" in two).toBe(true);
    expect(up.read()).toBe(80);
    expect(up.host.changes()).toHaveLength(1);
    // The first Undo is untouched and still puts back what the player had.
    expect(runCoachUndo(one.undo, up.host, up.ctx()).ok).toBe(true);
    expect(up.read()).toBe(70);
  });
});

describe("a jam take being written is a Take for the chip (leg chip1b, review M2)", () => {
  it("the chip falls back to the proposal and changes nothing; once the take stops, it is at once again", () => {
    let bpm = 100;
    let writing = true;
    const host = fakeHost({ view: "jam", sounding: "band" }, { tempo: () => bpm, setTempo: (b) => ((bpm = b), "done"), jamTakeRunning: () => writing });
    const ctx = toolCtx({ screen: "jam" });
    expect("proposal" in pressCoachChip({ tool: "set_tempo", args: { direction: "slower" } }, host, ctx)).toBe(true);
    expect(host.changes()).toEqual([]);
    expect(bpm).toBe(100);
    writing = false;
    receiptOf(pressCoachChip({ tool: "set_tempo", args: { direction: "slower" } }, host, ctx));
    expect(bpm).toBe(95);
  });

  it("a read that throws counts as a take being written", () => {
    let bpm = 100;
    const host = fakeHost({ view: "jam" }, { tempo: () => bpm, setTempo: (b) => ((bpm = b), "done"), jamTakeRunning: () => {
      throw new Error("no");
    } });
    expect("proposal" in pressCoachChip({ tool: "set_tempo", args: { direction: "slower" } }, host, toolCtx({ screen: "jam" }))).toBe(true);
    expect(bpm).toBe(100);
  });

  it("an Undo pressed while a jam take is written is 'not now', changes nothing, and stays good for after it (leg chip1c, review chip1b MEDIUM)", () => {
    let bpm = 100;
    let writing = false;
    const host = fakeHost({ view: "jam", sounding: "band" }, { tempo: () => bpm, setTempo: (b) => ((bpm = b), "done"), jamTakeRunning: () => writing });
    const ctx = toolCtx({ screen: "jam" });
    const done = receiptOf(pressCoachChip({ tool: "set_tempo", args: { direction: "slower" } }, host, ctx));
    expect(bpm).toBe(95);
    writing = true;
    const now = runCoachUndo(done.undo, host, ctx);
    expect(now.ok).toBe(false);
    expect(!now.ok && now.why).toBe("notNow");
    expect(bpm).toBe(95);
    writing = false;
    expect(runCoachUndo(done.undo, host, ctx).ok).toBe(true);
    expect(bpm).toBe(100);
  });
});

describe("only a flagged tool, and only this door", () => {
  /** Every unflagged `confirm` tool, its `propose` made to say yes and its `commit` recorded. */
  function yesRegistry(committed: string[]): CoachTool[] {
    return COACH_TOOLS.map((tool) => {
      if (tool.kind !== "confirm" || chipPressable(tool)) return tool;
      const yes: ConfirmTool = {
        ...tool,
        when: () => true,
        propose: () => ({ ok: true, line: line("coachTools.propose.fixture"), resolved: 1 }),
        commit: () => {
          committed.push(tool.name);
          return { ok: true, receipt: line("coachTools.receipt.fixture"), undo: { tool: tool.name, args: {} } };
        },
      };
      return yes;
    });
  }

  it("a chip for an unflagged `confirm` tool comes back a proposal, and nothing is committed", () => {
    const committed: string[] = [];
    const registry = yesRegistry(committed);
    const unflagged = registry.filter((t) => t.kind === "confirm" && t.audience === "player" && !chipPressable(t));
    expect(unflagged.map((t) => t.name)).toEqual(expect.arrayContaining(["start_today", "play_exercise", "follow_path", "load_jam", "load_preset", "set_minutes", "set_focus", "swap_part"]));
    for (const tool of unflagged) {
      const args = Object.fromEntries(tool.args.filter((a) => !a.optional).map((a) => [a.name, a.type.kind === "integer" ? a.type.min : a.type.kind === "enum" ? a.type.values[0] : "x"]));
      const out = pressCoachChip({ tool: tool.name, args }, fakeHost({ view: "beat" }), toolCtx({ screen: "beat" }), registry);
      expect("proposal" in out, tool.name).toBe(true);
    }
    expect(committed).toEqual([]);
  });

  it("a flagged tool whose proposal carries a plan, or says it cannot be undone, stays a proposal", () => {
    for (const extra of [{ noUndo: true as const }, { plan: { steps: [] } as never }]) {
      const committed: string[] = [];
      const registry = COACH_TOOLS.map((tool) =>
        tool.name === "set_tempo" && tool.kind === "confirm"
          ? ({
              ...tool,
              propose: () => ({ ok: true, line: line("coachTools.propose.fixture"), resolved: 1, ...extra }),
              commit: () => {
                committed.push(tool.name);
                return { ok: true, receipt: line("x") };
              },
            } as ConfirmTool)
          : tool,
      );
      const out = pressCoachChip({ tool: "set_tempo", args: { direction: "slower" } }, fakeHost({ view: "beat" }), toolCtx({ screen: "beat" }), registry);
      expect("proposal" in out).toBe(true);
      expect(committed).toEqual([]);
    }
  });

  it("the same flagged call through `runCoachTool` (a typed command, a choice, a model) is still a proposal, and changes nothing", () => {
    for (const c of cases()) {
      const out = runCoachTool(c.call, c.host, c.ctx());
      expect("proposal" in out, c.name).toBe(true);
      expect(c.host.changes(), c.name).toEqual([]);
    }
  });

  it("only Ask's suggestion chips reach the chip door: `pressCoachChip` and `pressChip` are called nowhere else in the app", () => {
    const src = join(HERE, "..", "..");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(path);
      }
    };
    walk(src);
    const callers = (pattern: RegExp) =>
      files.filter((f) => pattern.test(readFileSync(f, "utf8"))).map((f) => relative(src, f).split("\\").join("/")).sort();
    expect(callers(/\bpressCoachChip\(/)).toEqual(["coach/tools/run.ts", "containers/coach/askTools.ts"]);
    expect(callers(/\bpressChip\(/)).toEqual(["containers/coach/AskPanel.tsx", "containers/coach/askTools.ts"]);
  });
});
