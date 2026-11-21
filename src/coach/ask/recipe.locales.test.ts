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
  it("a name is read as its root; a null letter leaves the whole line unread", () => {
    const t = { ...en, recipe: { ...en.recipe, rootNames: { h: "B", b: null } } } as CommandTable;
    expect(routeCommand("make h major exercise", t, today)).toEqual({ kind: "call", call: { tool: "make_exercise", args: { root: "B", scale: "major" } } });
    expect(routeCommand("make b major exercise", t, today).kind).not.toBe("call");
    expect(routeCommand("make c major exercise in b", t, today).kind).not.toBe("call");
    expect(routeCommand("make c major exercise", t, today)).toEqual({ kind: "call", call: { tool: "make_exercise", args: { root: "C", scale: "major" } } });
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
