/**
 * A suggestion chip's own press (leg chip1): the rules, proven by walking the
 * list.
 *
 * The owner's decision: one press of the chip IS the press for a reversible
 * one-step change, always with Undo; anything multi-step or not undoable
 * still goes through a proposal. Which tools qualify is registry data
 * (`CHIP_PRESS`, `chipPress`), and this file holds every flagged tool to it:
 * a flagged tool with no fixture here fails; a flagged tool whose press calls
 * anything but its one setter, starts or stops sound, moves the screen, or
 * whose undo does not put back exactly what was there, fails.
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
    ...SAFE_SETTING_KEYS.flatMap((key) => [settingCase(key, null), settingCase(key, "band")]),
  ];
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

  it("the list, as the owner's rules leave it", () => {
    expect(flaggedTools().map((t) => t.name)).toEqual(["set_tempo", "click_subdivision", "set_setting"]);
  });

  it("every flagged tool has a case here, and every safe setting is one", () => {
    const covered = new Set(cases().map((c) => c.tool));
    for (const tool of flaggedTools()) expect(covered.has(tool.name), `add a chip case for ${tool.name}`).toBe(true);
    const keys = new Set(cases().filter((c) => c.tool === "set_setting").map((c) => c.call.args.key));
    for (const key of SAFE_SETTING_KEYS) expect(keys.has(key), key).toBe(true);
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
