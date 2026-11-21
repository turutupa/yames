/**
 * The rules the list keeps, proven by walking it.
 *
 * Every test here walks `COACH_TOOLS` and `HOST_MEMBERS` rather than naming
 * tools, so the tools leg t1a2 adds are held to the same rules the day they
 * are added: a tool without a sample call below fails the first test.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CoachScreen } from "../context";
import { fakeHost, toolCtx } from "./fakeHost";
import { HOST_MEMBERS, SAFE_SETTING_KEYS, SETTINGS_SECTIONS, STILL_NOT_WIRED, WIRED_IN_T1A1, notWiredHost } from "./host";
import { COACH_TOOLS, toolCatalogue } from "./registry";
import { checkCall, runCoachTool, runCoachUndo } from "./run";
import { TEST_PATHS, runIn } from "./testPaths";
import type { ToolArgs } from "./types";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * One well-formed call per tool, so the walks below can run every one. A new
 * tool adds its line here (the first test says so).
 */
const SAMPLE_ARGS: Readonly<Record<string, ToolArgs>> = {
  go_to: { screen: "paths" },
  open_path: { path: "alternate picking" },
  open_step: { path: "alternate picking", step: 2 },
  open_settings: { section: "coach" },
  return_to: { screen: "today" },
  show_scale: { root: "A", scale: "minorPentatonic" },
  show_chord: { chord: "Am7" },
  show_bars: { from: 1 },
  explain_screen: {},
  start_today: { at: 2 },
  play_exercise: { exercise: "outside picking", bpm: 70 },
  set_tempo: { bpm: 80 },
  find_edge: { exercise: "outside picking" },
  test_out: { path: "alternate picking", step: 1 },
  loop_bars: { from: 1, to: 2 },
  make_exercise: { shape: "scale run", root: "A" },
  swap_part: { at: 2, choice: "harder" },
  restore_part: { at: 2, title: "Inside picking" },
  set_minutes: { minutes: 20 },
  set_focus: { path: "alternate picking" },
  follow_path: { path: "ligado" },
  load_jam: { jam: "slow blues" },
  load_preset: { preset: "warm up" },
  click_subdivision: { subdivision: 2 },
  set_setting: { key: "theme", value: "velvet" },
  set_goal: { text: "Play the solo at 120" },
};

describe("the list", () => {
  it("every tool has a sample call here, and it passes the shape check", () => {
    for (const tool of COACH_TOOLS) {
      expect(SAMPLE_ARGS[tool.name], `add a sample call for ${tool.name}`).toBeDefined();
      const checked = checkCall({ tool: tool.name, args: SAMPLE_ARGS[tool.name] }, COACH_TOOLS, tool.audience);
      expect(checked.ok, tool.name).toBe(true);
    }
  });

  it("names are unique, snake_case; kinds and audiences are the known ones", () => {
    const names = COACH_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of COACH_TOOLS) {
      expect(tool.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(["go", "confirm", "read"]).toContain(tool.kind);
      expect(["player", "app"]).toContain(tool.audience);
      expect(tool.note.length).toBeGreaterThan(0);
      for (const arg of tool.args) expect(arg.note.length, `${tool.name}.${arg.name}`).toBeGreaterThan(0);
    }
  });

  it("a player's tool never takes an id from outside: no `appId` argument", () => {
    for (const tool of COACH_TOOLS.filter((t) => t.audience === "player")) {
      for (const arg of tool.args) expect(arg.type.kind, `${tool.name}.${arg.name}`).not.toBe("appId");
    }
  });

  it("the catalogue a grammar is built from is plain data, without the app's own tools", () => {
    const catalogue = toolCatalogue();
    expect(JSON.parse(JSON.stringify(catalogue))).toEqual(catalogue);
    expect(catalogue.tools.map((t) => t.name)).not.toContain("return_to");
    expect(catalogue.tools.every((t) => t.audience === "player")).toBe(true);
  });

  it("go_to never offers a Session", () => {
    const goTo = COACH_TOOLS.find((t) => t.name === "go_to")!;
    const screen = goTo.args.find((a) => a.name === "screen")!;
    expect(screen.type.kind === "enum" && screen.type.values).not.toContain("session");
  });

  it("every Settings section a tool can open is a real element id in Settings", () => {
    const dir = join(HERE, "../../containers/settings");
    const sources = readdirSync(dir)
      .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
      .map((f) => readFileSync(join(dir, f), "utf8"))
      .join("\n");
    for (const [section, id] of Object.entries(SETTINGS_SECTIONS)) {
      expect(sources.includes(`id="${id}"`), `${section}: #${id}`).toBe(true);
    }
  });
});

/**
 * The never-list. These are not tools; the host has no member that could
 * reach them; and the tools cannot go round the host.
 */
const NEVER = [
  /mic/i,
  /input/i,
  /device/i,
  /listen/i,
  /grad(e|ing)/i,
  /consent/i,
  /record/i,
  /keep.?audio/i,
  /delete|remove|erase|clear|forget|wipe/i,
  /unfollow|unsubscribe/i,
  /download/i,
  /fair/i,
  /pass/i,
  /clean/i,
  /send|share|upload|export|feedback|link|url|open.?external|email/i,
];

/** The app functions that do never-list things today, by name: none may be a member. */
const NEVER_FUNCTIONS = [
  "setGrading",
  "setAskRemember",
  "startInput",
  "stopInput",
  "setListening",
  "selectDevice",
  "setSelectedDevice",
  "unsubscribe",
  "answerFair",
  "answerHeardIt",
  "gradeAgain",
  "playUngraded",
  "eyesTake",
  "decide",
  "downloadModel",
  "deleteModel",
  "deleteTake",
  "startRecording",
  "stopRecording",
  "sendFeedback",
  "openUrl",
];

describe("the never-list", () => {
  it("HOST_MEMBERS is the whole interface (a compile-time check), and has no never member", () => {
    for (const member of HOST_MEMBERS) {
      for (const never of NEVER) expect(never.test(member), `host member ${member} matches ${String(never)}`).toBe(false);
    }
    for (const fn of NEVER_FUNCTIONS) expect(HOST_MEMBERS as readonly string[]).not.toContain(fn);
  });

  it("set_setting reaches the short safe list and nothing else: no model, no input, no device, no grading", () => {
    const tool = COACH_TOOLS.find((t) => t.name === "set_setting")!;
    const key = tool.args.find((a) => a.name === "key")!;
    expect(key.type.kind === "enum" && [...key.type.values].sort()).toEqual([...SAFE_SETTING_KEYS].sort());
    expect([...SAFE_SETTING_KEYS].sort()).toEqual(["bandVolume", "coachSuggestions", "coachVoice", "countIn", "language", "practiceView", "theme"]);
    for (const value of SAFE_SETTING_KEYS) {
      for (const never of [...NEVER, /model|brain|tier|llm/i]) expect(never.test(value), `${value} matches ${String(never)}`).toBe(false);
    }
  });

  it("no tool's name is a never-action", () => {
    for (const tool of COACH_TOOLS) {
      for (const never of NEVER) expect(never.test(tool.name), `${tool.name} matches ${String(never)}`).toBe(false);
    }
  });

  it("the real host's stubs are exactly the members t1a1 does not wire", () => {
    const stub = notWiredHost() as unknown as Record<string, unknown>;
    expect(Object.keys(stub).sort()).toEqual([...HOST_MEMBERS].sort());
    expect(WIRED_IN_T1A1.every((m) => (HOST_MEMBERS as readonly string[]).includes(m))).toBe(true);
  });

  it("loop_bars has its door (leg lb1): a read that starts nothing, and the press", () => {
    expect(STILL_NOT_WIRED).not.toContain("loopBars");
    expect(STILL_NOT_WIRED).not.toContain("loopAsk");
    expect(STILL_NOT_WIRED).toEqual([]);
    // The proposal asks the read only; the press alone changes something.
    const host = fakeHost({ view: "session", session: true }, { loopAsk: () => ({ fromBar: 1, toBar: 2, bpm: 60 }), loopBars: () => "done" });
    const out = runCoachTool({ tool: "loop_bars", args: SAMPLE_ARGS.loop_bars }, host, toolCtx({ screen: "session", run: runIn("ready") }));
    expect(out).toMatchObject({ ok: true, proposal: { tool: "loop_bars" } });
    expect(host.changes()).toEqual([]);
  });

  it("the tools reach the app only through the host: no IPC, no Tauri, no hook, no store", () => {
    const files = readdirSync(HERE).filter((f) => f.endsWith(".ts") && !f.includes(".test.") && f !== "fakeHost.ts" && f !== "testPaths.ts");
    expect(files).toContain("go.ts");
    for (const file of files) {
      const source = readFileSync(join(HERE, file), "utf8");
      // Every import that is not type-only.
      const runtime = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gms)].map((m) => m[1]);
      for (const from of runtime) {
        expect(from, `${file} imports ${from}`).not.toMatch(/ipc|@tauri-apps|\/hooks\/|containers\/|settings\/store|react/);
      }
    }
  });
});

describe("nothing runs while a Take runs", () => {
  const SCREENS: CoachScreen[] = ["today", "paths", "path", "step", "session", "progress", "jam", "songs", "beat", "drill", "setlist", "tools"];

  it.each(["playing", "listening"] as const)("every tool's `when` is false in %s, on every screen", (phase) => {
    for (const tool of COACH_TOOLS) {
      for (const screen of SCREENS) {
        expect(tool.when(toolCtx({ screen, run: runIn(phase) })), `${tool.name} on ${screen}`).toBe(false);
      }
    }
  });

  it.each(["playing", "listening"] as const)("and the runner refuses every tool in %s, touching nothing", (phase) => {
    const ctx = toolCtx({ screen: "session", run: runIn(phase) });
    for (const tool of COACH_TOOLS) {
      const host = fakeHost({ view: "session", session: true, paths: TEST_PATHS });
      const call = { tool: tool.name, args: SAMPLE_ARGS[tool.name] };
      // An app tool is reached only through an undo the runner handed out (none here): refused before the Take is asked.
      const out = tool.audience === "app" ? runCoachUndo(call, host, ctx) : runCoachTool(call, host, ctx);
      expect(out, tool.name).toMatchObject(
        tool.audience === "app" ? { ok: false, why: "refused" } : { ok: false, why: "notNow", line: { key: "coachTools.why.notNow.take" } },
      );
      expect(host.calls, tool.name).toEqual([]);
    }
  });
});
