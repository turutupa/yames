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
import { fakeHost, toolCtx } from "../tools/fakeHost";
import { runCoachTool } from "../tools/run";
import { EVAL_CARDS } from "./evalCards";
import { EVAL_LANGUAGES, parseSetFile } from "./evalWorld";
import { CHOICE_ANSWERS, ONE_OF, choiceGrammar, gbnfLiteral, parseChoice } from "./grammar";

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
    // A card with no declared arguments keeps the generic bounded argument.
    expect(withCards).toContain("card-arg ::=");
  });

  it("types each card's own arguments as a tool's are (c3b1b)", () => {
    expect(EVAL_CARDS.map((c) => c.id)).toEqual(expect.arrayContaining(["where_slipped", "early_or_late", "why_not_counted", "improving"]));
    // Every card on `coach` declares its arguments: no free-form card argument in the shipped grammar.
    expect(full).not.toContain("card-arg ::=");
    expect(full).toMatch(/c-early-or-late ::= .*"\\"premise\\"".*v-card-early-or-late-premise/);
    expect(full).toContain('v-card-early-or-late-premise ::= ( "\\"early\\"" | "\\"late\\"" )');
    expect(full).toMatch(/v-card-why-not-counted-what ::= \( "\\"take\\"" \| "\\"pitch\\""/);
    // A card with no arguments takes only an empty object.
    expect(full).toContain('c-improving ::= "\\"card\\"" ws ":" ws "\\"improving\\"" ( "," ws "\\"args\\"" ws ":" ws "{" ws "}" )?');
  });

  it("escapes a literal the way GBNF reads it", () => {
    expect(gbnfLiteral('a"b\\c\n')).toBe('"a\\"b\\\\c\\x0a"');
  });
});

// ---------------------------------------------------------------------------
// A GBNF recognizer for the subset `choiceGrammar` writes (literals, classes,
// rule names, groups, `|`, `?`, `{m,n}`), so a test can ask "does the
// grammar let this answer through?" without llama.cpp (leg c3bp).
// ---------------------------------------------------------------------------

type Node =
  | { t: "lit"; s: string }
  | { t: "cls"; neg: boolean; ranges: Array<[number, number]> }
  | { t: "ref"; name: string }
  | { t: "alt"; alts: Node[][] }
  | { t: "rep"; node: Node; min: number; max: number };

function parseGbnf(text: string): Map<string, Node> {
  const rules = new Map<string, Node>();
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const at = line.indexOf(" ::= ");
    const name = line.slice(0, at);
    let i = at + 5;
    const src = line;
    const esc = (): number => {
      // After a backslash.
      const c = src[i++];
      if (c === "x") {
        const code = parseInt(src.slice(i, i + 2), 16);
        i += 2;
        return code;
      }
      return c.codePointAt(0)!;
    };
    const alts = (): Node[][] => {
      const out: Node[][] = [[]];
      for (;;) {
        while (src[i] === " ") i++;
        const c = src[i];
        if (c === undefined || c === ")") return out;
        if (c === "|") {
          i++;
          out.push([]);
          continue;
        }
        let node: Node;
        if (c === '"') {
          i++;
          let s = "";
          while (src[i] !== '"') {
            if (src[i] === "\\") {
              i++;
              s += String.fromCodePoint(esc());
            } else s += src[i++];
          }
          i++;
          node = { t: "lit", s };
        } else if (c === "[") {
          i++;
          const neg = src[i] === "^";
          if (neg) i++;
          const ranges: Array<[number, number]> = [];
          while (src[i] !== "]") {
            const lo = src[i] === "\\" ? (i++, esc()) : src[i++].codePointAt(0)!;
            let hi = lo;
            if (src[i] === "-" && src[i + 1] !== "]") {
              i++;
              hi = src[i] === "\\" ? (i++, esc()) : src[i++].codePointAt(0)!;
            }
            ranges.push([lo, hi]);
          }
          i++;
          node = { t: "cls", neg, ranges };
        } else if (c === "(") {
          i++;
          const inner = alts();
          i++;
          node = { t: "alt", alts: inner };
        } else {
          const m = /^[a-z0-9-]+/.exec(src.slice(i))!;
          i += m[0].length;
          node = { t: "ref", name: m[0] };
        }
        if (src[i] === "?") {
          i++;
          node = { t: "rep", node, min: 0, max: 1 };
        } else if (src[i] === "{") {
          const m = /^\{(\d+),(\d+)\}/.exec(src.slice(i))!;
          i += m[0].length;
          node = { t: "rep", node, min: Number(m[1]), max: Number(m[2]) };
        }
        out[out.length - 1].push(node);
      }
    };
    rules.set(name, { t: "alt", alts: alts() });
  }
  return rules;
}

/** Whether `grammar` (from `root`) matches all of `input`. */
function accepts(grammar: string, input: string): boolean {
  const rules = parseGbnf(grammar);
  const chars = Array.from(input);
  const ends = (node: Node, pos: number): Set<number> => {
    switch (node.t) {
      case "lit": {
        const s = Array.from(node.s);
        for (let k = 0; k < s.length; k++) if (chars[pos + k] !== s[k]) return new Set();
        return new Set([pos + s.length]);
      }
      case "cls": {
        const c = chars[pos];
        if (c === undefined) return new Set();
        const code = c.codePointAt(0)!;
        const inside = node.ranges.some(([lo, hi]) => code >= lo && code <= hi);
        return inside !== node.neg ? new Set([pos + 1]) : new Set();
      }
      case "ref":
        return ends(rules.get(node.name)!, pos);
      case "alt": {
        const out = new Set<number>();
        for (const seq of node.alts) {
          let at = new Set([pos]);
          for (const n of seq) {
            const next = new Set<number>();
            for (const p of at) for (const e of ends(n, p)) next.add(e);
            at = next;
          }
          for (const p of at) out.add(p);
        }
        return out;
      }
      case "rep": {
        const out = new Set<number>(node.min === 0 ? [pos] : []);
        let at = new Set([pos]);
        for (let k = 1; k <= node.max && at.size > 0; k++) {
          const next = new Set<number>();
          for (const p of at) for (const e of ends(node.node, p)) next.add(e);
          at = next;
          if (k >= node.min) for (const p of at) out.add(p);
        }
        return out;
      }
    }
  };
  return ends(rules.get("root")!, 0).has(chars.length);
}

/** A call as the model writes it: the tool's fields in the order it declares them. */
function callText(tool: string, args: Record<string, unknown>): string {
  const spec = catalogue.tools.find((t) => t.name === tool);
  if (!spec) throw new Error(`no player tool ${tool}`);
  const ordered: Record<string, unknown> = {};
  for (const f of spec.args) if (args[f.name] !== undefined) ordered[f.name] = args[f.name];
  return JSON.stringify({ tool, args: ordered });
}

const EVAL_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../../evals/coach/tools");

describe("the grammar against the calls the runner takes (leg c3bp)", () => {
  it("the recognizer reads the grammar as GBNF does", () => {
    expect(accepts(full, '{"answer":"which"}')).toBe(true);
    expect(accepts(full, '{ "answer": "none" }')).toBe(true);
    expect(accepts(full, '{"answer":"maybe"}')).toBe(false);
    expect(accepts(full, '{"tool":"go_to","args":{"screen":"paths"}}')).toBe(true);
    expect(accepts(full, '{"tool":"go_to","args":{"screen":"devices"}}')).toBe(false);
    expect(accepts(full, '{"tool":"show_chord","args":{"chord":"Am7"}}')).toBe(true);
  });

  it("accepts every call the held-out set expects (read only: the set is not changed)", () => {
    let calls = 0;
    for (const lng of EVAL_LANGUAGES) {
      const file = join(EVAL_DIR, `${lng}.jsonl`);
      if (!existsSync(file)) continue;
      for (const item of parseSetFile(readFileSync(file, "utf8"))) {
        if (item.expect.kind !== "call") continue;
        calls++;
        const text = callText(item.expect.tool, item.expect.args);
        expect(accepts(full, text), `${item.id}: ${text}`).toBe(true);
      }
    }
    expect(calls).toBeGreaterThan(100);
  });

  it("accepts the undo calls the tools hand back (the guards included)", () => {
    for (const [tool, args] of [
      ["set_tempo", { bpm: 90, at: 95 }],
      ["set_setting", { key: "theme", value: "mono", at: "obsidian" }],
      ["set_setting", { key: "bandVolume", value: "auto", at: "80" }],
      ["click_subdivision", { subdivision: 2 }],
      ["set_goal", { text: "play the solo at 120" }],
    ] as const) {
      expect(accepts(full, callText(tool, args)), `${tool} ${JSON.stringify(args)}`).toBe(true);
    }
  });

  it("set_tempo: exactly one of bpm and direction, as the runner takes it", () => {
    const ok = [{ bpm: 120 }, { direction: "slower" }, { bpm: 120, at: 100 }, { direction: "faster", at: 100 }];
    const no = [{}, { at: 100 }, { bpm: 120, direction: "faster" }, { bpm: 120, direction: "faster", at: 100 }];
    for (const args of ok) expect(accepts(full, callText("set_tempo", args)), JSON.stringify(args)).toBe(true);
    for (const args of no) expect(accepts(full, callText("set_tempo", args)), JSON.stringify(args)).toBe(false);
    // The runner: the same two refused, the same two taken, on a tempo screen.
    const run = (args: Record<string, unknown>) => runCoachTool({ tool: "set_tempo", args }, fakeHost({ view: "beat" }, { tempo: () => 100 }), toolCtx({ screen: "beat" }));
    for (const args of ok.filter((a) => !("at" in a))) expect(run(args), JSON.stringify(args)).toMatchObject({ ok: true });
    for (const args of no) expect(run(args), JSON.stringify(args)).toMatchObject({ ok: false, why: "refused", line: { key: "coachTools.why.refused.shape" } });
  });

  it("ONE_OF names only optional fields of player tools", () => {
    for (const [tool, groups] of Object.entries(ONE_OF)) {
      const spec = catalogue.tools.find((t) => t.name === tool);
      expect(spec, tool).toBeDefined();
      for (const g of groups) for (const name of g) expect(spec!.args.find((f) => f.name === name)?.optional, `${tool}.${name}`).toBe(true);
    }
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
