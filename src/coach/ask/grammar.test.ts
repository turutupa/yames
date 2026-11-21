/**
 * The choice grammar is generated, never hand-written (leg c3b1a). The full
 * grammar is kept as a fixture, `choice-grammar.gbnf`, that a Rust test
 * (`coach.rs`, `the_generated_choice_grammar_passes_the_precheck`) feeds to
 * `coach::precheck_grammar`. A change to the registry that changes the
 * grammar fails here until the fixture is regenerated:
 *
 *     UPDATE_CHOICE_GRAMMAR=1 npx vitest run src/coach/ask/grammar.test.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { NEVER_ITEMS } from "../../containers/coach/neverList";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import { EVAL_CARDS } from "./evalCards";
import { CHOICE_ANSWERS, choiceGrammar, gbnfLiteral, parseChoice } from "./grammar";

// Not `new URL(…, import.meta.url)`: Vite rewrites that into an asset URL.
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "choice-grammar.gbnf");
const catalogue = toolCatalogue(COACH_TOOLS);
const full = choiceGrammar(catalogue, EVAL_CARDS);

/** The tool names a grammar lets the model write. */
function toolNames(grammar: string): string[] {
  return [...grammar.matchAll(/"\\"tool\\"" ws ":" ws "\\"([a-z_]+)\\""/g)].map((m) => m[1]);
}

describe("choiceGrammar", () => {
  it("is the fixture the Rust precheck reads (regenerate with UPDATE_CHOICE_GRAMMAR=1)", () => {
    if (process.env.UPDATE_CHOICE_GRAMMAR === "1") writeFileSync(FIXTURE, full);
    expect(existsSync(FIXTURE)).toBe(true);
    expect(readFileSync(FIXTURE, "utf8")).toBe(full);
  });

  it("names every player tool, and only those", () => {
    const players = catalogue.tools.map((t) => t.name).sort();
    expect(toolNames(full).sort()).toEqual(players);
    for (const tool of COACH_TOOLS.filter((t) => t.audience === "app")) expect(full).not.toContain(`\\"${tool.name}\\"`);
  });

  it("can name nothing on the never-list", () => {
    const never = /(mic|input|device|grad(e|ing)|consent|record|delete|remove|clear|forget|unfollow|unsubscribe|download|upload|share|export|model)/i;
    for (const name of toolNames(full)) expect(name, name).not.toMatch(never);
    for (const item of NEVER_ITEMS) expect(toolNames(full)).not.toContain(item);
  });

  it("narrows to the tools a situation allows", () => {
    const narrow = choiceGrammar(catalogue, EVAL_CARDS, { possible: { go_to: true, set_tempo: true, return_to: true } });
    expect(toolNames(narrow).sort()).toEqual(["go_to", "set_tempo"]);
    const none = choiceGrammar(catalogue, EVAL_CARDS, { possible: {} });
    expect(toolNames(none)).toEqual([]);
    expect(none).toContain('"\\"answer\\""');
  });

  it("is bounded: ws, queries and integers have a top, nothing repeats without one", () => {
    expect(full).toContain('ws ::= " "?');
    expect(full).not.toMatch(/[*+]/);
    for (const m of full.matchAll(/\{(\d+),(\d+)\}/g)) expect(Number(m[2])).toBeLessThanOrEqual(60);
  });

  it("offers the three answers, and cards only when there are some", () => {
    for (const a of CHOICE_ANSWERS) expect(full).toContain(`"\\"${a}\\""`);
    expect(full.includes('"\\"card\\""')).toBe(EVAL_CARDS.length > 0);
    const withCards = choiceGrammar(catalogue, [{ id: "best_tempo", note: "x" }]);
    expect(withCards).toContain('"\\"best_tempo\\""');
  });

  it("escapes a literal the way GBNF reads it", () => {
    expect(gbnfLiteral('a"b\\c\n')).toBe('"a\\"b\\\\c\\x0a"');
  });
});

describe("parseChoice", () => {
  it("reads the three shapes and nothing else", () => {
    expect(parseChoice('{"tool":"go_to","args":{"screen":"paths"}}')).toEqual({ kind: "call", tool: "go_to", args: { screen: "paths" } });
    expect(parseChoice('{"card": "best_tempo"}')).toEqual({ kind: "card", card: "best_tempo", args: {} });
    expect(parseChoice('{"answer":"which"}')).toEqual({ kind: "answer", answer: "which" });
    expect(parseChoice('{"answer":"maybe"}')).toBeNull();
    expect(parseChoice('{"tool":"go_to","args":{"screen":["x"]}}')).toBeNull();
    expect(parseChoice("{")).toBeNull();
  });
});
