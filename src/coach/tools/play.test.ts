/**
 * The tool screens' `confirm` tools and the settings and goal, as tables:
 * allowed and refused, the values resolved and snapped, nothing until the
 * press, the press re-checked, and the undo back to where the app was.
 */

import { describe, expect, it } from "vitest";
import type { Subdivision } from "../../types";
import { fakeHost, toolCtx } from "./fakeHost";
import type { CoachToolHost, SafeSettingKey, SafeSettingOption, SafeSettingValue } from "./host";
import { confirmCoachTool, runCoachTool, runCoachUndo } from "./run";
import { runIn } from "./testPaths";
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
const JAMS = [
  { id: "j1", name: "Slow blues in A" },
  { id: "j2", name: "Fast blues in E" },
  { id: "j3", name: "Funk vamp" },
];

describe("load_jam and load_preset", () => {
  const host = (over: Partial<CoachToolHost> = {}) =>
    fakeHost({}, { jams: () => JAMS, presets: () => [{ id: "p1", name: "Warm up 80" }], loadJam: () => "done", loadPreset: () => "done", ...over });

  it.each([
    ["load_jam", { jam: "funk" }, "coachTools.propose.loadJam", { jam: "Funk vamp" }, "loadJam", "j3"],
    ["load_preset", { preset: "warm up" }, "coachTools.propose.loadPreset", { preset: "Warm up 80" }, "loadPreset", "p1"],
  ])("%s names it by its name and loads it on the press", (tool, args, key, values, member, id) => {
    const h = host();
    const proposal = proposalOf(runCoachTool(call(tool, args), h, toolCtx()));
    expect(proposal.line).toEqual({ key, values });
    expect(h.changes()).toEqual([]);
    expect(done(confirmCoachTool(proposal, h, toolCtx())).undo).toBeUndefined();
    expect(h.changes()).toEqual([{ member, args: [id] }]);
  });

  it("several jams are choices; none is notFound; a jam deleted before the press is not loaded", () => {
    const several = runCoachTool(call("load_jam", { jam: "blues" }), host(), toolCtx());
    expect(!several.ok && several.choices?.map((c) => c.call)).toEqual([
      { tool: "load_jam", args: { jam: "Slow blues in A" } },
      { tool: "load_jam", args: { jam: "Fast blues in E" } },
    ]);
    expect(runCoachTool(call("load_jam", { jam: "bossa" }), host(), toolCtx())).toMatchObject({ line: { key: "coachTools.why.notFound.jam" } });
    let jams = JAMS;
    const h = host({ jams: () => jams });
    const proposal = proposalOf(runCoachTool(call("load_jam", { jam: "funk" }), h, toolCtx()));
    jams = JAMS.slice(0, 2);
    expect(confirmCoachTool(proposal, h, toolCtx())).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(h.changes()).toEqual([]);
  });

  it("a jam shown from elsewhere says what stops; from the jam screen nothing does", () => {
    const away = fakeHost({ view: "beat", sounding: "click" }, { jams: () => JAMS });
    expect(proposalOf(runCoachTool(call("load_jam", { jam: "funk" }), away, toolCtx({ screen: "beat" }))).line.values).toEqual({ jam: "Funk vamp", stops: "click" });
    const here = fakeHost({ view: "jam", sounding: "band" }, { jams: () => JAMS });
    expect(proposalOf(runCoachTool(call("load_jam", { jam: "funk" }), here, toolCtx({ screen: "jam" }))).line.values).toEqual({ jam: "Funk vamp" });
  });

  it("not in a Session, and not before the presets can be read", () => {
    expect(runCoachTool(call("load_jam", { jam: "funk" }), host(), session)).toMatchObject({ why: "notNow" });
    expect(runCoachTool(call("load_preset", { preset: "warm" }), host({ presets: () => "notWiredYet" }), toolCtx())).toMatchObject({ why: "notWiredYet" });
  });
});

describe("click_subdivision", () => {
  function host(start: Subdivision) {
    let now = start;
    const h = fakeHost({ view: "beat" }, {
      clickSubdivision: () => now,
      setClickSubdivision: (next) => {
        now = next;
        return "done";
      },
    });
    return Object.assign(h, { now: () => now });
  }

  it("proposes from and to, sets it on the press, and the undo puts it back", () => {
    const h = host(1);
    const proposal = proposalOf(runCoachTool(call("click_subdivision", { subdivision: 3 }), h, toolCtx({ screen: "beat" })));
    expect(proposal.line).toEqual({ key: "coachTools.propose.clickSubdivision", values: { from: 1, to: 3 } });
    expect(h.now()).toBe(1);
    const out = done(confirmCoachTool(proposal, h, toolCtx({ screen: "beat" })));
    expect(h.now()).toBe(3);
    runCoachUndo(out.undo, h, toolCtx({ screen: "beat" }));
    expect(h.now()).toBe(1);
  });

  it("refuses 7 and 0 (the shape), the one it is, and a Session", () => {
    expect(runCoachTool(call("click_subdivision", { subdivision: 7 }), host(1), toolCtx())).toMatchObject({ why: "refused" });
    expect(runCoachTool(call("click_subdivision", { subdivision: 0 }), host(1), toolCtx())).toMatchObject({ why: "refused" });
    expect(runCoachTool(call("click_subdivision", { subdivision: 2 }), host(2), toolCtx())).toMatchObject({ line: { key: "coachTools.why.notNow.alreadySubdivision" } });
    expect(runCoachTool(call("click_subdivision", { subdivision: 2 }), host(1), session)).toMatchObject({ why: "notNow" });
  });
});

describe("set_setting", () => {
  const OPTIONS: Record<string, SafeSettingOption[]> = {
    theme: [
      { value: "ember", names: ["ember", "Ember"] },
      { value: "velvet", names: ["velvet", "Velvet"] },
      { value: "neon", names: ["neon", "Neon"] },
    ],
    language: [
      { value: "en", names: ["en", "English"] },
      { value: "es", names: ["es", "Español"] },
      { value: "de", names: ["de", "Deutsch"] },
    ],
    practiceView: [
      { value: "neck", names: ["neck"] },
      { value: "runway", names: ["runway"] },
      { value: "tab", names: ["tab"] },
    ],
    countIn: [
      { value: false, names: ["off"] },
      { value: true, names: ["on"] },
    ],
    // No voice installed: only Off.
    coachVoice: [{ value: false, names: ["off"] }],
  };

  function host(start: Partial<Record<SafeSettingKey, SafeSettingValue>>, view: "today" | "beat" = "today") {
    const values: Partial<Record<SafeSettingKey, SafeSettingValue>> = { ...start };
    const h = fakeHost({ view }, {
      safeSetting: (key) => values[key] ?? "notWiredYet",
      safeSettingOptions: (key) => OPTIONS[key] ?? "notWiredYet",
      setSafeSetting: (key, value) => {
        values[key] = value;
        return "done";
      },
    });
    return Object.assign(h, { values });
  }

  it.each<[SafeSettingKey, string, SafeSettingValue, SafeSettingValue, string | number, string | number]>([
    ["theme", "Velvet", "ember", "velvet", "ember", "velvet"],
    ["language", "espanol", "en", "es", "en", "es"],
    ["practiceView", "tab", "neck", "tab", "neck", "tab"],
    ["bandVolume", "70", 1, 0.7, 100, 70],
    ["bandVolume", "73%", 1, 0.75, 100, 75],
    ["bandVolume", "400", 1, 1.5, 100, 150],
  ])("%s to %s: proposes from → to, sets it on the press, and the undo puts it back", (key, words, from, to, fromSaid, toSaid) => {
    const h = host({ [key]: from });
    const proposal = proposalOf(runCoachTool(call("set_setting", { key, value: words }), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.setSetting", values: { key, from: fromSaid, to: toSaid } });
    expect(h.changes()).toEqual([]);
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(h.values[key]).toBe(to);
    expect(out.undo).toEqual({ tool: "set_setting", args: { key, value: String(fromSaid) } });
    expect(runCoachUndo(out.undo, h, toolCtx()).ok).toBe(true);
    expect(h.values[key]).toBe(from);
  });

  it("count-in only where a transport has one", () => {
    expect(runCoachTool(call("set_setting", { key: "countIn", value: "on" }), host({ countIn: false }), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.here" },
    });
    const h = host({ countIn: false }, "beat");
    const proposal = proposalOf(runCoachTool(call("set_setting", { key: "countIn", value: "on" }), h, toolCtx({ screen: "beat" })));
    expect(proposal.line.values).toEqual({ key: "countIn", from: "off", to: "on" });
  });

  it("a value the control does not offer now is notFound, with what it does offer", () => {
    const voice = runCoachTool(call("set_setting", { key: "coachVoice", value: "on" }), host({ coachVoice: false }), toolCtx());
    expect(voice).toMatchObject({ why: "notFound", line: { key: "coachTools.why.notFound.settingValue" } });
    expect(runCoachTool(call("set_setting", { key: "theme", value: "plaid" }), host({ theme: "ember" }), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notFound.settingValue" },
      choices: [{ call: { args: { value: "ember" } } }, { call: { args: { value: "velvet" } } }, { call: { args: { value: "neon" } } }],
    });
    expect(runCoachTool(call("set_setting", { key: "bandVolume", value: "loud" }), host({ bandVolume: 1 }), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notFound.settingValue" },
    });
  });

  it("refuses the value it has, a key off the list, and a setting changed before the press; not wired says so", () => {
    expect(runCoachTool(call("set_setting", { key: "theme", value: "ember" }), host({ theme: "ember" }), toolCtx())).toMatchObject({
      line: { key: "coachTools.why.notNow.alreadySetting" },
    });
    for (const key of ["model", "coachBrainTier", "grading", "inputDevice", "microphone", "keepTakes"]) {
      expect(runCoachTool(call("set_setting", { key, value: "on" }), host({}), toolCtx()), key).toMatchObject({ why: "refused" });
    }
    const h = host({ theme: "ember" });
    const proposal = proposalOf(runCoachTool(call("set_setting", { key: "theme", value: "neon" }), h, toolCtx()));
    h.setSafeSetting("theme", "velvet");
    expect(confirmCoachTool(proposal, h, toolCtx())).toMatchObject({ line: { key: "coachTools.why.refused.proposal" } });
    expect(h.values.theme).toBe("velvet");
    expect(runCoachTool(call("set_setting", { key: "coachSuggestions", value: "on" }), host({}), toolCtx())).toMatchObject({ why: "notWiredYet" });
  });

  it("is allowed in a Session between Takes (the practice view, the band's volume)", () => {
    const h = host({ practiceView: "neck" });
    expect(runCoachTool(call("set_setting", { key: "practiceView", value: "runway" }), h, session).ok).toBe(true);
  });
});

describe("set_goal", () => {
  it("not wired (the Notebook is leg c4a's) says so and touches nothing", () => {
    const h = fakeHost();
    expect(runCoachTool(call("set_goal", { text: "Play the solo at 120" }), h, toolCtx())).toMatchObject({ why: "notWiredYet" });
    expect(h.changes()).toEqual([]);
  });

  it("with a Notebook: proposes the words, keeps them on the press, and the undo puts the old goal back", () => {
    let goal: string | null = "Clean eighths at 100";
    const h = fakeHost({}, {
      goal: () => goal,
      setGoal: (text) => {
        goal = text;
        return "done";
      },
    });
    const proposal = proposalOf(runCoachTool(call("set_goal", { text: "Play the solo at 120" }), h, toolCtx()));
    expect(proposal.line).toEqual({ key: "coachTools.propose.setGoal", values: { from: "Clean eighths at 100", to: "Play the solo at 120" } });
    expect(goal).toBe("Clean eighths at 100");
    const out = done(confirmCoachTool(proposal, h, toolCtx()));
    expect(goal).toBe("Play the solo at 120");
    runCoachUndo(out.undo, h, toolCtx());
    expect(goal).toBe("Clean eighths at 100");
    goal = null;
    const first = done(confirmCoachTool(proposalOf(runCoachTool(call("set_goal", { text: "A" }), h, toolCtx())), h, toolCtx()));
    expect(first.undo).toBeUndefined();
  });
});
