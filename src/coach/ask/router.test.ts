/**
 * The typed-command router (leg t1b2a): the near-miss table first, because a
 * wrong action is the failure that matters; then the commands; the bare
 * number; the never-list; every player tool reachable; and the router pure.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { CoachContext } from "../context";
import { toolCtx } from "../tools/fakeHost";
import { toolCatalogue } from "../tools/registry";
import { checkCall } from "../tools/run";
import { runIn } from "../tools/testPaths";
import type { ToolArgs } from "../tools/types";
import { NEVER_ITEMS } from "../../containers/coach/neverList";
import { COMMAND_TABLES, commandTableFor, validateCommandTable, type CommandTable } from "./commandTable";
import { commandFacts, routeCommand, type CommandFacts, type RouteResult } from "./router";
import en from "./commands/en.json";

const HERE = dirname(fileURLToPath(import.meta.url));
const EN = en as unknown as CommandTable;

const SONG = { song: { id: "s1", name: "Song" }, range: { from: 0, to: 3 } } as unknown as NonNullable<CoachContext["song"]>;

/** The facts on a screen, from a real context and the tools' own `when`. */
const facts = {
  today: commandFacts(toolCtx({ screen: "today" }), "today"),
  paths: commandFacts(toolCtx({ screen: "paths" }), "paths"),
  progress: commandFacts(toolCtx({ screen: "progress" }), "progress"),
  beat: commandFacts(toolCtx({ screen: "beat" }), "beat"),
  jam: commandFacts(toolCtx({ screen: "jam" }), "jam"),
  songs: commandFacts(toolCtx({ screen: "songs", song: SONG }), "songs"),
  settings: commandFacts(toolCtx({ screen: "today" }), "settings"),
  ready: commandFacts(toolCtx({ screen: "session", run: runIn("ready") }), "session"),
  result: commandFacts(toolCtx({ screen: "session", run: runIn("result") }), "session"),
  take: commandFacts(toolCtx({ screen: "session", run: runIn("playing") }), "session"),
} satisfies Record<string, CommandFacts>;

const SCREENS = Object.entries(facts);

const route = (text: string, f: CommandFacts = facts.today): RouteResult => routeCommand(text, EN, f);

function expectCall(r: RouteResult, tool: string, args: ToolArgs = {}): void {
  expect(r.kind, JSON.stringify(r)).toBe("call");
  if (r.kind === "call") expect(r.call).toEqual({ tool, args });
}

// ---------------------------------------------------------------------------
// The near-miss table: a verb or a number in it, and never a call.
// ---------------------------------------------------------------------------

/** Lines that contain a verb or a number and are not commands: `none`, on every screen. */
const NEAR_MISSES_NONE = [
  "why was I late?",
  "why was I late at 80?",
  "what is a pentatonic?",
  "what is a minor pentatonic",
  "can you open paths for me later?",
  "can you open paths",
  "could you show me a minor pentatonic",
  "how do I play faster?",
  "should I go slower",
  "is 80 too fast for me?",
  "I played it at 80 yesterday",
  "I want to play faster",
  "it was slower than the click",
  "the loop was too short",
  "my hands get tired after 15 minutes",
  "I practised for 20 minutes",
  "start was rough",
  "show me why I was late",
  "show me how to play faster",
  "play it again",
  "faster than yesterday",
  "I'm getting faster",
  "slower is better",
  "loop the part where I went wrong",
  "80 is my best",
  "I got 85% on step 7",
  "step 7 was hard",
  "bar 12 is where I slip",
  "15 minutes is not enough",
  "I only have 5 minutes",
  "open paths tomorrow",
  "go faster next time",
  "settings are confusing",
  "the metronome is too loud",
  "play along with me",
  "start over",
  "faster or slower?",
  "faster or slower",
  "show me the 80 bpm results",
  "set a reminder for 7",
  "120 bpm is my goal",
  "loop bar 3 again later",
  "don't open paths",
  "never start without me",
  "what does faster do",
  "can I play at 80?",
  "follow up on yesterday",
  "load of rubbish",
  "open your heart",
  "I'd like 15 minutes",
  "tempo?",
  "show a minor pentatonic later",
  "play the scale you showed me",
  "go back",
  "start the metronome",
  "open 15 minutes",
  "loop it",
  "show me",
  "set",
  "step",
  "80 percent of the time",
  "3 times faster",
  "2 more takes",
  "after step 7, what next",
  "thanks, that was faster",
  "follow me",
  "start a new session",
  "make it faster",
  "set it to 80",
  "open",
  "play the next exercise",
] as const;

/** Never-list requests: `yours` with the item, on every screen, never a call. */
const NEAR_MISSES_YOURS: ReadonlyArray<[string, string]> = [
  ["record", "recording"],
  ["start recording", "recording"],
  ["play the recording", "recording"],
  ["delete my last take", "deleting"],
  ["clear my takes", "deleting"],
  ["turn on the mic", "input"],
  ["switch the input on", "input"],
  ["change my audio device", "devices"],
  ["open the devices settings", "devices"],
  ["grade me", "grading"],
  ["stop grading", "grading"],
  ["open grading settings", "grading"],
  ["show my grades", "grades"],
  ["set my score to 100", "grades"],
  ["download the model", "model"],
  ["load the qwen model", "model"],
  ["unfollow blues", "unfollowing"],
  ["stop following alternate picking", "unfollowing"],
];

describe("the near-miss table: a wrong action is the failure that matters", () => {
  it("has at least forty lines", () => {
    expect(NEAR_MISSES_NONE.length + NEAR_MISSES_YOURS.length).toBeGreaterThanOrEqual(40);
  });

  it.each(SCREENS)("on %s, a question or a sentence with a verb or a number is not a command", (_name, f) => {
    for (const text of NEAR_MISSES_NONE) {
      const r = routeCommand(text, EN, f);
      expect(r, text).toEqual({ kind: "none" });
    }
  });

  it.each(SCREENS)("on %s, a never-list request is 'that one is yours', never a call", (_name, f) => {
    for (const [text, item] of NEAR_MISSES_YOURS) {
      expect(routeCommand(text, EN, f), text).toEqual({ kind: "yours", item });
    }
  });

  it("every never-list word of the table, alone and after each verb, is 'yours' (or not a command), never a call", () => {
    for (const [item, words] of Object.entries(EN.never)) {
      for (const word of words) {
        expect(route(word), word).toEqual({ kind: "yours", item });
        for (const verbs of Object.values(EN.verbs)) {
          for (const verb of verbs) {
            const text = `${verb} ${word}`;
            // "slow it down record": "it" makes it a sentence, not a command; either is no call.
            const expected = EN.notCommand.some((w) => ` ${verb} `.includes(` ${w} `)) ? "none" : "yours";
            expect(route(text, facts.beat).kind, text).toBe(expected);
          }
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// The commands
// ---------------------------------------------------------------------------

/** What was typed, where, and the call it must become. Also the report's command table. */
const COMMANDS: ReadonlyArray<[string, keyof typeof facts, string, ToolArgs]> = [
  ["open paths", "today", "go_to", { screen: "paths" }],
  ["Open Paths.", "today", "go_to", { screen: "paths" }],
  ["go to the metronome", "today", "go_to", { screen: "beat" }],
  ["go home", "paths", "go_to", { screen: "today" }],
  ["paths", "today", "go_to", { screen: "paths" }],
  ["please open progress", "paths", "go_to", { screen: "progress" }],
  ["settings", "today", "go_to", { screen: "settings" }],
  ["open the settings", "today", "go_to", { screen: "settings" }],
  ["open practice settings", "today", "open_settings", { section: "practice" }],
  ["settings appearance", "beat", "open_settings", { section: "appearance" }],
  ["start", "today", "start_today", {}],
  ["play", "paths", "start_today", {}],
  ["start today's session", "today", "start_today", {}],
  ["start at part 3", "today", "start_today", { at: 3 }],
  ["start today at 2", "today", "start_today", { at: 2 }],
  ["slower", "beat", "set_tempo", { direction: "slower" }],
  ["a bit faster please", "beat", "set_tempo", { direction: "faster" }],
  ["faster", "ready", "set_tempo", { direction: "faster" }],
  ["80", "beat", "set_tempo", { bpm: 80 }],
  ["80 bpm", "jam", "set_tempo", { bpm: 80 }],
  ["80bpm", "beat", "set_tempo", { bpm: 80 }],
  ["tempo 100", "beat", "set_tempo", { bpm: 100 }],
  ["set the tempo to 90", "beat", "set_tempo", { bpm: 90 }],
  ["90", "result", "set_tempo", { bpm: 90 }],
  ["15 minutes", "today", "set_minutes", { minutes: 15 }],
  ["15", "today", "set_minutes", { minutes: 15 }],
  ["set 20 min", "today", "set_minutes", { minutes: 20 }],
  ["loop bar 3", "today", "loop_bars", { from: 3 }],
  ["loop bars 3-4", "today", "loop_bars", { from: 3, to: 4 }],
  ["loop the first bar", "today", "loop_bars", { from: 1 }],
  ["show a minor pentatonic", "today", "show_scale", { root: "A", scale: "minorPentatonic" }],
  ["show me c sharp dorian", "jam", "show_scale", { root: "C#", scale: "dorian" }],
  ["show the e blues scale root on 5", "today", "show_scale", { root: "E", scale: "blues", position: "rootOn5" }],
  ["show am7", "today", "show_chord", { chord: "Am7" }],
  ["show the a chord", "today", "show_chord", { chord: "A" }],
  ["show bars 1 to 4", "songs", "show_bars", { from: 1, to: 4 }],
  ["open alternate picking", "today", "open_path", { path: "alternate picking" }],
  ["open the blues path", "today", "open_path", { path: "blues" }],
  ["open step 7", "paths", "open_step", { step: 7 }],
  ["step 7", "paths", "open_step", { step: 7 }],
  ["open alternate picking step 7", "today", "open_step", { path: "alternate picking", step: 7 }],
  ["step 2 of ligado", "today", "open_step", { path: "ligado", step: 2 }],
  ["follow blues", "today", "follow_path", { path: "blues" }],
  ["play outside picking", "paths", "play_exercise", { exercise: "outside picking" }],
  ["play outside picking at 80", "today", "play_exercise", { exercise: "outside picking", bpm: 80 }],
  ["find my edge on outside picking", "paths", "find_edge", { exercise: "outside picking" }],
  ["test out of step 3", "paths", "test_out", { step: 3 }],
  ["test out of string crossing", "paths", "test_out", { query: "string crossing" }],
  ["swap part 2 for something harder", "today", "swap_part", { at: 2, choice: "harder" }],
  ["focus on alternate picking", "today", "set_focus", { path: "alternate picking" }],
  ["focus on the mix", "today", "set_focus", {}],
  ["load jam slow blues", "today", "load_jam", { jam: "slow blues" }],
  ["load the warm up preset", "beat", "load_preset", { preset: "warm up" }],
  ["2 clicks per beat", "beat", "click_subdivision", { subdivision: 2 }],
  ["theme velvet", "today", "set_setting", { key: "theme", value: "velvet" }],
  ["set count in on", "beat", "set_setting", { key: "countIn", value: "on" }],
  ["band volume 80", "jam", "set_setting", { key: "bandVolume", value: "80" }],
  ["change the language to spanish", "settings", "set_setting", { key: "language", value: "spanish" }],
  ["set my goal to play the solo at 120", "today", "set_goal", { text: "play the solo at 120" }],
  ["explain this screen", "today", "explain_screen", {}],
  ["make a minor pentatonic exercise", "today", "make_exercise", { shape: "minor pentatonic exercise" }],
];

describe("commands", () => {
  it.each(COMMANDS)("%s (on %s) → %s", (text, where, tool, args) => {
    expectCall(route(text, facts[where]), tool, args);
  });

  it("every call it makes passes the runner's shape check", () => {
    for (const [text, where] of COMMANDS) {
      const r = route(text, facts[where]);
      if (r.kind !== "call") continue;
      expect(checkCall(r.call).ok, text).toBe(true);
    }
  });

  it("names go to the tool as the player wrote them; the router does not resolve them", () => {
    expectCall(route("open Alternate Pickin"), "open_path", { path: "alternate pickin" });
    expectCall(route("follow a path nobody wrote"), "follow_path", { path: "nobody wrote" });
  });

  it("a word left over that the command does not use is not a command", () => {
    for (const text of ["slower now and then", "loop bar 3 and 9", "show a minor pentatonic in the shed", "set the tempo to fast", "swap part 2 for a sandwich", "explain the plan"]) {
      expect(route(text, facts.beat).kind, text).toBe("none");
    }
  });
});

// ---------------------------------------------------------------------------
// The bare number, and "Which one?"
// ---------------------------------------------------------------------------

describe("a bare number", () => {
  it("is a tempo where a tempo can be set", () => {
    expectCall(route("120", facts.beat), "set_tempo", { bpm: 120 });
    expectCall(route("60", facts.jam), "set_tempo", { bpm: 60 });
    expectCall(route("72", facts.ready), "set_tempo", { bpm: 72 });
  });

  it("is minutes on Today, where that is the only number that makes sense", () => {
    expectCall(route("10", facts.today), "set_minutes", { minutes: 10 });
  });

  it("is never a guess: nothing where neither makes sense, or the number cannot be one", () => {
    for (const f of [facts.paths, facts.progress, facts.songs, facts.settings, facts.take]) {
      expect(route("80", f), f.view).toEqual({ kind: "none" });
      expect(route("15", f), f.view).toEqual({ kind: "none" });
    }
    expect(route("80", facts.today)).toEqual({ kind: "none" });
    expect(route("15", facts.beat)).toEqual({ kind: "none" });
    expect(route("500", facts.beat)).toEqual({ kind: "none" });
  });

  it("is 'Which one?' with both where both can be meant and both can run", () => {
    const both: CommandFacts = { ...facts.today, tempo: true, minutes: true, possible: { ...facts.today.possible, set_tempo: true } };
    const r = route("40", both);
    expect(r.kind).toBe("which");
    if (r.kind === "which") {
      expect(r.choices.map((c) => c.call)).toEqual([
        { tool: "set_tempo", args: { bpm: 40 } },
        { tool: "set_minutes", args: { minutes: 40 } },
      ]);
      expect(r.choices[0].label).toEqual({ key: "coachTools.choice.rung", values: { bpm: 40 } });
    }
  });
});

describe("nothing routes to a tool that cannot run here", () => {
  it("a command whose tool says no here is not a call: `none`, with the call for the runner to explain", () => {
    expect(route("slower", facts.today)).toEqual({ kind: "none", notHere: { tool: "set_tempo", args: { direction: "slower" } } });
    expect(route("open paths", facts.ready)).toEqual({ kind: "none", notHere: { tool: "go_to", args: { screen: "paths" } } });
    expect(route("show bars 1 to 4", facts.today).kind).toBe("none");
    expect(route("start", facts.beat)).toEqual({ kind: "none" });
  });

  it("during a Take nothing is a call", () => {
    for (const [text] of COMMANDS) expect(route(text, facts.take).kind, text).not.toBe("call");
  });

  it("'Which one?' offers only the calls that can run", () => {
    const r = route("load slow blues", facts.today);
    expect(r.kind).toBe("which");
    if (r.kind === "which") expect(r.choices.map((c) => c.call.tool)).toEqual(["load_jam", "load_preset"]);
    const noPresets: CommandFacts = { ...facts.today, possible: { ...facts.today.possible, load_preset: false } };
    expectCall(route("load slow blues", noPresets), "load_jam", { jam: "slow blues" });
    const swap = route("swap part 2", facts.today);
    expect(swap.kind).toBe("which");
    if (swap.kind === "which") expect(swap.choices.map((c) => c.call.args.choice)).toEqual(["harder", "different", "style"]);
    expect(route("swap part 2", facts.ready).kind).toBe("none");
  });

  it("no 'Which one?' anywhere mixes a possible and an impossible call", () => {
    for (const [, f] of SCREENS) {
      for (const text of [...COMMANDS.map(([t]) => t), "load slow blues", "swap part 2", "40"]) {
        const r = routeCommand(text, EN, f);
        if (r.kind === "which") for (const c of r.choices) expect(f.possible[c.call.tool], `${text} on ${f.view}`).toBe(true);
        if (r.kind === "call") expect(f.possible[r.call.tool], `${text} on ${f.view}`).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Every player tool reachable
// ---------------------------------------------------------------------------

/**
 * Player tools no typed English command reaches, with the reason. Empty
 * today: every tool has a command (`COMMANDS` above). A tool added to the
 * registry fails the test below until it gets a command or a line here.
 */
const CHIP_ONLY: Readonly<Record<string, string>> = {};

describe("every tool reachable", () => {
  it("each player tool has an English command that routes to it, or is chip-only with its reason", () => {
    const reached = new Set<string>();
    for (const [text, where] of COMMANDS) {
      const r = route(text, facts[where]);
      if (r.kind === "call") reached.add(r.call.tool);
    }
    for (const tool of toolCatalogue().tools) {
      if (CHIP_ONLY[tool.name]) continue;
      expect(reached.has(tool.name), `no English command reaches ${tool.name}: add one to COMMANDS, or to CHIP_ONLY with why`).toBe(true);
    }
    for (const name of Object.keys(CHIP_ONLY)) expect(CHIP_ONLY[name].length).toBeGreaterThan(0);
  });

  it("no command reaches an app-only tool", () => {
    const app = new Set(["return_to", "restore_part"]);
    for (const [text, where] of COMMANDS) {
      const r = route(text, facts[where]);
      if (r.kind === "call") expect(app.has(r.call.tool), text).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// The tables
// ---------------------------------------------------------------------------

describe("the command tables", () => {
  it("every table there is passes the validator", () => {
    expect(Object.keys(COMMAND_TABLES)).toContain("en");
    for (const [lng, table] of Object.entries(COMMAND_TABLES)) {
      expect(validateCommandTable(table), lng).toEqual([]);
      expect(table.language, lng).toBe(lng);
    }
  });

  it("the validator finds an empty list, a word under two verbs, a never-list verb, an unknown id", () => {
    const bad = structuredClone(en) as unknown as { verbs: Record<string, string[]>; never: Record<string, string[]>; screens: Record<string, string[]> };
    bad.verbs.loop = [];
    bad.verbs.show = ["show", "open"];
    bad.never.recording = ["record", "play"];
    bad.screens.lounge = ["lounge"];
    const problems = validateCommandTable(bad as unknown as CommandTable).join("\n");
    expect(problems).toContain("verbs.loop is an empty list");
    expect(problems).toContain('"open" is a word of two verbs');
    expect(problems).toContain('never.recording: "play" is also a verb');
    expect(problems).toContain("screens.lounge is not an id the app knows");
  });

  it("the never-list's items are the app's (`NEVER_ITEMS`), every one with words", () => {
    expect(Object.keys(EN.never).sort()).toEqual([...NEVER_ITEMS].sort());
  });

  it("a language with no table has none, and is not given English", () => {
    expect(commandTableFor("en")).toBe(COMMAND_TABLES.en);
    expect(commandTableFor("en-GB")).toBe(COMMAND_TABLES.en);
    expect(commandTableFor("xx")).toBeNull();
  });

  it("a language written without spaces matches by contained words, the verb anywhere", () => {
    const ja = structuredClone(en) as unknown as CommandTable & Record<string, unknown>;
    const t = ja as unknown as {
      noSpaces: boolean;
      language: string;
      verbs: Record<string, string[]>;
      screens: Record<string, string[]>;
      units: Record<string, string[]>;
      fillers: string[];
      questions: string[];
      notCommand: string[];
      never: Record<string, string[]>;
    };
    t.language = "ja";
    t.noSpaces = true;
    t.verbs.open = ["開いて", "開く"];
    t.screens.paths = ["パス"];
    t.units.step = ["ステップ"];
    t.fillers = [...t.fillers, "を", "に"];
    t.questions = ["なぜ", "か"];
    t.notCommand = [...t.notCommand, "昨日"];
    t.never.recording = ["録音"];
    expect(validateCommandTable(ja)).toEqual([]);
    expectCall(routeCommand("パスを開いて", ja, facts.today), "go_to", { screen: "paths" });
    expectCall(routeCommand("ステップ7を開いて", ja, facts.paths), "open_step", { step: 7 });
    expectCall(routeCommand("ステップ7", ja, facts.paths), "open_step", { step: 7 });
    expect(routeCommand("なぜパスを開くの", ja, facts.today)).toEqual({ kind: "none" });
    expect(routeCommand("昨日パスを開いた", ja, facts.today)).toEqual({ kind: "none" });
    expect(routeCommand("録音を開いて", ja, facts.today)).toEqual({ kind: "yours", item: "recording" });
  });

  it("a language that puts the verb last (`verbFinal`, leg t1b2b) takes a verb that ends the text, and only then", () => {
    const de = structuredClone(en) as unknown as CommandTable & { verbs: Record<string, string[]>; screens: Record<string, string[]>; notCommand: string[] };
    (de as { language: string }).language = "de";
    de.verbs.open = ["öffne", "öffnen"];
    de.screens.paths = ["pfade"];
    de.notCommand = [...de.notCommand, "nicht", "morgen"];
    expect(validateCommandTable(de)).toEqual([]);
    // Without the flag, a verb at the end is not a command.
    expect(routeCommand("pfade öffnen", de, facts.today)).toEqual({ kind: "none" });
    const final = { ...de, verbFinal: true } as CommandTable;
    expect(validateCommandTable(final)).toEqual([]);
    expectCall(routeCommand("pfade öffnen", final, facts.today), "go_to", { screen: "paths" });
    expectCall(routeCommand("öffne pfade", final, facts.today), "go_to", { screen: "paths" });
    expect(routeCommand("pfade morgen öffnen", final, facts.today)).toEqual({ kind: "none" });
    expect(routeCommand("pfade nicht öffnen", final, facts.today)).toEqual({ kind: "none" });
    expect(routeCommand("öffnen", final, facts.today)).toEqual({ kind: "none" });
    expect(validateCommandTable({ ...final, noSpaces: true } as CommandTable).join()).toContain("verbFinal");
  });

  it("an nth bar or Step written around its number (`ordinalPlaces`, leg t1b2b), and never a count", () => {
    const zh = structuredClone(en) as unknown as CommandTable & Record<string, unknown>;
    const t = zh as unknown as { language: string; noSpaces: boolean; verbs: Record<string, string[]>; units: Record<string, string[]>; fillers: string[] };
    t.language = "zh-CN";
    t.noSpaces = true;
    t.verbs.loop = ["循环"];
    t.verbs.open = ["打开"];
    t.units.bar = ["小节"];
    t.units.step = ["步骤"];
    const places = { ...zh, ordinalPlaces: { bar: ["第#小节"], step: ["第#步"] } } as CommandTable;
    expect(validateCommandTable(places)).toEqual([]);
    expectCall(routeCommand("循环第3小节", places, facts.today), "loop_bars", { from: 3 });
    expectCall(routeCommand("第7步", places, facts.paths), "open_step", { step: 7 });
    expectCall(routeCommand("打开第7步", places, facts.paths), "open_step", { step: 7 });
    expectCall(routeCommand("步骤7", places, facts.paths), "open_step", { step: 7 });
    // A number glued to the unit an ordinal place ends with ("7단계") is that place, said alone too.
    const ko = { ...zh, units: { ...zh.units, step: ["단계"] }, ordinalPlaces: { step: ["#단계"] } } as CommandTable;
    expectCall(routeCommand("7단계", ko, facts.paths), "open_step", { step: 7 });
    expect(routeCommand("7단계", { ...ko, ordinalPlaces: undefined } as CommandTable, facts.paths)).toEqual({ kind: "none" });
    // "3小节" is three bars: not a place.
    expect(routeCommand("循环3小节", places, facts.today)).toEqual({ kind: "none" });
    expect(routeCommand("循环第3小节", zh, facts.today)).toEqual({ kind: "none" });
    const bad = { ...zh, ordinalPlaces: { bar: ["第小节"], step: ["#"] } } as CommandTable;
    const problems = validateCommandTable(bad).join("\n");
    expect(problems).toContain("exactly one #");
    expect(problems).toContain("only the number");
  });
});

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

describe("the router is pure", () => {
  it("imports no React, no store, no i18n runtime, no IPC", () => {
    for (const file of ["router.ts", "commandTable.ts"]) {
      const source = readFileSync(join(HERE, file), "utf8");
      const imports = [...source.matchAll(/^import\s+(?!type\b)[^;]*?from\s+"([^"]+)"/gms)].map((m) => m[1]);
      for (const from of imports) {
        expect(from, `${file} imports ${from}`).not.toMatch(/react|i18next|ipc|@tauri-apps|Store|store|hooks\//);
      }
    }
  });

  it("changes nothing it is given and answers the same twice", () => {
    const before = JSON.stringify(EN);
    const f = facts.today;
    const factsBefore = JSON.stringify(f);
    const a = route("open alternate picking step 7", f);
    const b = route("open alternate picking step 7", f);
    expect(a).toEqual(b);
    expect(JSON.stringify(EN)).toBe(before);
    expect(JSON.stringify(f)).toBe(factsBefore);
  });

  it("the facts are plain data", () => {
    for (const [, f] of SCREENS) expect(JSON.parse(JSON.stringify(f))).toEqual(f);
  });
});
