/**
 * The command tables of every language (leg t1b2b): the same dozen commands
 * as English reach the same calls, and each language's near-miss table (a
 * question, a statement with a number, a negation, a never-list request)
 * never becomes a call. A near-miss that routes to a call is fixed in the
 * table, never here.
 *
 * Each language's lines are data beside its table:
 * `commands/lines/<code>.json` (out of `COMMAND_TABLES`' glob, which reads
 * `commands/*.json` only).
 */
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { toolCtx } from "../tools/fakeHost";
import { runIn } from "../tools/testPaths";
import type { ToolArgs } from "../tools/types";
import { NEVER_ITEMS } from "../../containers/coach/neverList";
import { COMMAND_TABLES, validateCommandTable, type CommandTable } from "./commandTable";
import { commandFacts, routeCommand, type CommandFacts } from "./router";

const HERE = dirname(fileURLToPath(import.meta.url));

const facts = {
  today: commandFacts(toolCtx({ screen: "today" }), "today"),
  paths: commandFacts(toolCtx({ screen: "paths" }), "paths"),
  progress: commandFacts(toolCtx({ screen: "progress" }), "progress"),
  beat: commandFacts(toolCtx({ screen: "beat" }), "beat"),
  jam: commandFacts(toolCtx({ screen: "jam" }), "jam"),
  settings: commandFacts(toolCtx({ screen: "today" }), "settings"),
  ready: commandFacts(toolCtx({ screen: "session", run: runIn("ready") }), "session"),
  take: commandFacts(toolCtx({ screen: "session", run: runIn("playing") }), "session"),
} satisfies Record<string, CommandFacts>;
const SCREENS = Object.entries(facts);

/**
 * The dozen (and two): what each id must become, and where it is typed. `null`
 * args: a name, which goes to the tool as the player wrote it, so the line
 * carries its own args.
 */
const DOZEN: Readonly<Record<string, [keyof typeof facts, string, ToolArgs | null]>> = {
  openPaths: ["today", "go_to", { screen: "paths" }],
  settings: ["today", "go_to", { screen: "settings" }],
  practiceSettings: ["today", "open_settings", { section: "practice" }],
  start: ["today", "start_today", {}],
  slower: ["beat", "set_tempo", { direction: "slower" }],
  faster: ["beat", "set_tempo", { direction: "faster" }],
  bpm80: ["jam", "set_tempo", { bpm: 80 }],
  bare80: ["beat", "set_tempo", { bpm: 80 }],
  minutes15: ["today", "set_minutes", { minutes: 15 }],
  loopBar3: ["today", "loop_bars", { from: 3 }],
  showScale: ["today", "show_scale", { root: "A", scale: "minorPentatonic" }],
  step7: ["paths", "open_step", { step: 7 }],
  openPath: ["today", "open_path", null],
  followPath: ["today", "follow_path", null],
};

type Lines = {
  language: string;
  commands: Array<{ id: string; text: string; args?: ToolArgs }>;
  nearMissNone: string[];
  nearMissYours: Array<[string, string]>;
};

const LINE_FILES = import.meta.glob<Lines>("./commands/lines/*.json", { eager: true, import: "default" });
const LINES: Record<string, Lines> = Object.fromEntries(
  Object.entries(LINE_FILES).map(([file, lines]) => [file.replace(/^.*\/([^/]+)\.json$/, "$1"), lines]),
);
const LANGUAGES = Object.keys(LINES).sort();

/** The app's locales (`src/locales/<code>/`). */
const LOCALES = readdirSync(join(HERE, "../../locales"), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort();

describe("every locale has a command table and its lines", () => {
  it("one table and one lines file per locale, and nothing else", () => {
    expect(Object.keys(COMMAND_TABLES).sort()).toEqual(LOCALES);
    expect(LANGUAGES).toEqual(LOCALES);
  });

  it.each(LANGUAGES)("%s: the table passes the validator and names its language", (lng) => {
    const table = COMMAND_TABLES[lng];
    expect(table, lng).toBeDefined();
    expect(validateCommandTable(table)).toEqual([]);
    expect(table.language).toBe(lng);
    expect(LINES[lng].language).toBe(lng);
  });
});

describe.each(LANGUAGES)("%s", (lng) => {
  const table = (): CommandTable => COMMAND_TABLES[lng];
  const lines = LINES[lng];

  it("has every one of the dozen commands, each reaching the same call as English", () => {
    for (const id of Object.keys(DOZEN)) expect(lines.commands.some((c) => c.id === id), `no line for ${id}`).toBe(true);
    for (const { id, text, args } of lines.commands) {
      const want = DOZEN[id];
      expect(want, `${id} is not one of the dozen`).toBeDefined();
      const [where, tool, fixed] = want;
      if (fixed) expect(args, `${text}: ${id} carries no args of its own`).toBeUndefined();
      else expect(args, `${text}: a name carries its args`).toBeDefined();
      const r = routeCommand(text, table(), facts[where]);
      expect(r, `${text} (on ${where})`).toEqual({ kind: "call", call: { tool, args: fixed ?? args } });
    }
  });

  it("during a Take, none of them is a call", () => {
    for (const { text } of lines.commands) expect(routeCommand(text, table(), facts.take).kind, text).not.toBe("call");
  });

  it("its near-miss table has at least fifteen lines, a never-list request among them", () => {
    expect(lines.nearMissNone.length + lines.nearMissYours.length).toBeGreaterThanOrEqual(15);
    expect(lines.nearMissYours.length).toBeGreaterThan(0);
  });

  it.each(SCREENS)("on %s, no near-miss is a command", (_name, f) => {
    for (const text of lines.nearMissNone) expect(routeCommand(text, table(), f), text).toEqual({ kind: "none" });
  });

  it.each(SCREENS)("on %s, a never-list request is 'that one is yours'", (_name, f) => {
    for (const [text, item] of lines.nearMissYours) {
      expect(NEVER_ITEMS as readonly string[], text).toContain(item);
      expect(routeCommand(text, table(), f), text).toEqual({ kind: "yours", item });
    }
  });

  it("every never-list word, alone and after every verb, is never a call", () => {
    const t = table();
    for (const [item, words] of Object.entries(t.never)) {
      for (const word of words) {
        expect(routeCommand(word, t, facts.today), word).toEqual({ kind: "yours", item });
        for (const verbs of Object.values(t.verbs)) {
          for (const verb of verbs) {
            for (const text of t.noSpaces ? [`${verb}${word}`, `${word}${verb}`] : [`${verb} ${word}`, `${word} ${verb}`]) {
              expect(routeCommand(text, t, facts.beat).kind, text).not.toBe("call");
              expect(routeCommand(text, t, facts.today).kind, text).not.toBe("call");
            }
          }
        }
      }
    }
  });
});
