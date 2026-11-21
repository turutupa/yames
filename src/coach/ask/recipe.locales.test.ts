/**
 * Typed recipes in the fourteen languages beside English (leg t2d): each
 * language's hand-written lines (`recipeCases/<code>.ts`) against its command
 * table. A line that proposes must name only what the player said; a
 * near-miss is never a recipe. The rule that matters more than coverage: when
 * in doubt the line falls through.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { fakeHost, toolCtx } from "../tools/fakeHost";
import { loadExerciseGenerator } from "../tools/make";
import { runCoachTool } from "../tools/run";
import { COMMAND_TABLES, validateCommandTable, type CommandTable } from "./commandTable";
import { commandFacts, routeCommand } from "./router";
import type { RecipeCases } from "./recipeCases/types";

const FILES = import.meta.glob<RecipeCases>("./recipeCases/*.ts", { eager: true, import: "CASES" });
const CASES = Object.entries(FILES)
  .filter(([file]) => !file.endsWith("/types.ts"))
  .map(([, cases]) => cases)
  .sort((a, b) => a.language.localeCompare(b.language));

const today = commandFacts(toolCtx({ screen: "today" }), "today");

beforeAll(async () => {
  await loadExerciseGenerator();
});

describe("the rootNames override (leg t2d)", () => {
  const en = COMMAND_TABLES.en;
  it("a root the app does not know, or a phrase, is a problem", () => {
    const bad = { ...en, recipe: { ...en.recipe, rootNames: { h: "H", "c d": "C" } } } as CommandTable;
    const problems = validateCommandTable(bad).join("\n");
    expect(problems).toContain('recipe.rootNames.h: "H" is not a root the app knows');
    expect(problems).toContain('recipe.rootNames: "c d" is not one lower-case word');
  });
  it("a name that is also a filler, connector, verb, shape or not-a-command word is a problem (review t2d, L4)", () => {
    const bad = { ...en, recipe: { ...en.recipe, rootNames: { the: "C", at: "D", box: "E", i: "F" } } } as CommandTable;
    const problems = validateCommandTable(bad).join("\n");
    expect(problems).toContain('recipe.rootNames: "the" is also a word of fillers');
    expect(problems).toContain('recipe.rootNames: "at" is also a word of connectors.at');
    expect(problems).toContain('recipe.rootNames: "box" is also a word of recipe.shapes.box');
    expect(problems).toContain('recipe.rootNames: "i" is also a word of notCommand');
  });
  it("a name is read as its root; a null letter leaves the whole line unread", () => {
    const t = { ...en, recipe: { ...en.recipe, rootNames: { h: "B", b: null } } } as CommandTable;
    expect(routeCommand("make h major exercise", t, today)).toEqual({ kind: "call", call: { tool: "make_exercise", args: { root: "B", scale: "major" } } });
    expect(routeCommand("make b major exercise", t, today).kind).not.toBe("call");
    expect(routeCommand("make c major exercise in b", t, today).kind).not.toBe("call");
    expect(routeCommand("make c major exercise", t, today)).toEqual({ kind: "call", call: { tool: "make_exercise", args: { root: "C", scale: "major" } } });
  });
});

describe("show_scale and show_chord read a language's own note names (review t2d, M2)", () => {
  const scale = (root: string, s: string) => ({ kind: "call", call: { tool: "show_scale", args: { root, scale: s } } });
  const chord = (name: string) => ({ kind: "call", call: { tool: "show_chord", args: { chord: name } } });
  const shows = (lng: string, text: string) => {
    const r = routeCommand(text, COMMAND_TABLES[lng] as CommandTable, today);
    return r.kind === "call" && (r.call.tool === "show_scale" || r.call.tool === "show_chord") ? r.call : null;
  };
  it("German, Polish, Russian: h is B; b is never drawn as B", () => {
    expect(routeCommand("zeig mir h moll", COMMAND_TABLES.de as CommandTable, today)).toEqual(scale("B", "naturalMinor"));
    expect(routeCommand("zeig mir fis moll", COMMAND_TABLES.de as CommandTable, today)).toEqual(scale("F#", "naturalMinor"));
    expect(routeCommand("zeig mir akkord h7", COMMAND_TABLES.de as CommandTable, today)).toEqual(chord("B7"));
    expect(routeCommand("zeig mir akkord fism", COMMAND_TABLES.de as CommandTable, today)).toEqual(chord("F#m"));
    expect(routeCommand("zeig mir akkord bb7", COMMAND_TABLES.de as CommandTable, today)).toEqual(chord("Bb7"));
    expect(routeCommand("zeig mir akkord asus4", COMMAND_TABLES.de as CommandTable, today)).toEqual(chord("Asus4"));
    expect(shows("de", "zeig mir b dur")).toBeNull();
    expect(shows("de", "zeig mir b moll")).toBeNull();
    expect(shows("de", "zeig mir akkord b7")).toBeNull();
    expect(shows("de", "zeig mir akkord bm")).toBeNull();
    expect(routeCommand("pokaż h moll", COMMAND_TABLES.pl as CommandTable, today)).toEqual(scale("B", "naturalMinor"));
    expect(shows("pl", "pokaż b dur")).toBeNull();
    expect(shows("pl", "pokaż akord b7")).toBeNull();
    expect(routeCommand("покажи h минор", COMMAND_TABLES.ru as CommandTable, today)).toEqual(scale("B", "naturalMinor"));
    expect(shows("ru", "покажи b мажор")).toBeNull();
  });
  it("Dutch reads its -is / -es names; b stays B there", () => {
    expect(routeCommand("toon bes majeur", COMMAND_TABLES.nl as CommandTable, today)).toEqual(scale("Bb", "major"));
    expect(routeCommand("toon b mineur", COMMAND_TABLES.nl as CommandTable, today)).toEqual(scale("B", "naturalMinor"));
  });
  it("a bare 五声 / 五聲 / ngũ cung draws nothing: it does not say minor (review t2d, M1)", () => {
    expect(shows("zh-CN", "显示C五声音阶")).toBeNull();
    expect(shows("zh-TW", "顯示C五聲音階")).toBeNull();
    expect(shows("vi", "hiện c ngũ cung")).toBeNull();
    expect(routeCommand("显示C小调五声音阶", COMMAND_TABLES["zh-CN"] as CommandTable, today)).toEqual(scale("C", "minorPentatonic"));
    expect(routeCommand("hiện c ngũ cung thứ", COMMAND_TABLES.vi as CommandTable, today)).toEqual(scale("C", "minorPentatonic"));
  });
  it("English is unchanged: b is B", () => {
    expect(shows("en", "show b major")).toEqual(scale("B", "major").call);
    expect(shows("en", "show chord b7")).toEqual(chord("B7").call);
  });
});

it("every language beside English has its recipe lines", () => {
  const have = CASES.map((c) => c.language);
  const want = Object.keys(COMMAND_TABLES).filter((l) => l !== "en").sort((a, b) => a.localeCompare(b));
  expect(have).toEqual(want);
});

describe.each(CASES.map((c) => [c.language, c] as const))("typed recipes, %s", (language, cases) => {
  const table = COMMAND_TABLES[language] as CommandTable;
  const route = (text: string) => routeCommand(text, table, today);

  it("the table is valid and has a recipe group", () => {
    expect(validateCommandTable(table)).toEqual([]);
    expect(table.recipe).toBeDefined();
  });

  it("has at least eight lines that propose and six near-misses", () => {
    expect(cases.lines.length).toBeGreaterThanOrEqual(8);
    expect(cases.none.length).toBeGreaterThanOrEqual(6);
  });

  it.each(cases.lines.map(([text, args]) => [text, args] as const))("%s", (text, args) => {
    const r = route(text);
    expect(r, JSON.stringify(r)).toEqual({ kind: "call", call: { tool: "make_exercise", args } });
  });

  it("every line reaches the tool, which proposes or says why in a sentence; nothing is stored", () => {
    for (const [text] of [...cases.lines, ...(cases.keyless ?? [])]) {
      const r = route(text);
      if (r.kind !== "call") throw new Error(text);
      const host = fakeHost();
      const out = runCoachTool(r.call, host, toolCtx());
      if (out.ok) expect("proposal" in out, text).toBe(true);
      else expect(out.line.key, text).toMatch(/^coachTools\.why\.make\./);
      expect(host.changes()).toEqual([]);
    }
  });

  it("a line with no key reaches the tool without one, and the tool asks which", () => {
    for (const [text, args] of cases.keyless ?? []) {
      const r = route(text);
      expect(r, `${text}: ${JSON.stringify(r)}`).toEqual({ kind: "call", call: { tool: "make_exercise", args } });
      if (r.kind !== "call") continue;
      const out = runCoachTool(r.call, fakeHost(), toolCtx());
      expect(out.ok, text).toBe(false);
      if (!out.ok) expect(out.line.key, text).toBe("coachTools.why.make.root");
    }
  });

  it.each(cases.none.map((t) => [t] as const))("near-miss: %s", (text) => {
    const r = route(text);
    expect(r.kind === "call" && r.call.tool === "make_exercise", JSON.stringify(r)).toBe(false);
  });

  it("a never-list word is still `yours`", () => {
    for (const text of cases.yours ?? []) expect(route(text).kind, text).toBe("yours");
  });
});
