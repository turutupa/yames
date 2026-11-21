/**
 * The choice grammar, generated from the tool registry (DESIGN 5.3 engine 4a,
 * TOOLS 2.1; leg c3b1a).
 *
 * `choiceGrammar(catalogue, cards, situation?)` returns GBNF for exactly one
 * JSON object, the model's whole answer to a typed question:
 *
 *     {"tool": "<name>", "args": {...}}    a player tool, its arguments typed
 *     {"card": "<id>", "args": {...}}      a fact card (when there are any)
 *     {"answer": "none" | "which" | "yours"}
 *
 * Nothing is written by hand: the tools, their arguments and every closed set
 * come from `toolCatalogue()` (player tools only, so the app's own undo and
 * the never-list, which is not a tool at all, cannot be named), and the cards
 * from `evalCards.ts`. `grammar.test.ts` writes the full grammar to a fixture
 * that a Rust test feeds to `coach::precheck_grammar`.
 *
 * Bounded everywhere c3a asked: `ws` is `" "?`, a query is at most its
 * `maxLength` characters, an integer at most its maximum's digits, and an
 * optional argument is a group, never a `*`. The range of an integer and the
 * shape of a call beyond the grammar are the runner's (`checkCall`), which
 * judges every call anyway.
 */
import { CHORD_SUFFIXES, ROOT_NAMES } from "../blocks/spec";
import type { ArgField, ArgType, ToolCatalogue, ToolSpec } from "../tools/types";
import type { EvalCard } from "./evalCards";

/** The three answers that are not an action or a card. */
export const CHOICE_ANSWERS = ["none", "which", "yours"] as const;
export type ChoiceAnswer = (typeof CHOICE_ANSWERS)[number];

/** What the grammar may be narrowed to: the tools that can run where the player is. */
export type GrammarSituation = { possible: Readonly<Record<string, boolean>> };

/** The longest query the grammar lets through, whatever a tool declares. */
export const GRAMMAR_QUERY_MAX = 60;
/** How many arguments a card may carry, and how long each string is. */
const CARD_ARGS_MAX = 2;
const CARD_ARG_CHARS = 40;

/** A GBNF string literal for `text` (quotes, backslashes and control characters escaped). */
export function gbnfLiteral(text: string): string {
  let out = '"';
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (ch === '"') out += '\\"';
    else if (ch === "\\") out += "\\\\";
    else if (code < 0x20) out += `\\x${code.toString(16).padStart(2, "0")}`;
    else out += ch;
  }
  return `${out}"`;
}

/** A JSON string, as a GBNF literal: `"go_to"` written so the model must emit the quotes. */
const jsonString = (text: string) => gbnfLiteral(JSON.stringify(text));

const ruleName = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

class Rules {
  private readonly rules = new Map<string, string>();
  add(name: string, body: string): string {
    const existing = this.rules.get(name);
    if (existing !== undefined && existing !== body) throw new Error(`grammar: two bodies for rule ${name}`);
    this.rules.set(name, body);
    return name;
  }
  text(): string {
    return [...this.rules].map(([name, body]) => `${name} ::= ${body}`).join("\n") + "\n";
  }
}

function digits(n: number): number {
  return String(Math.max(0, Math.floor(n))).length;
}

/** The rule for one argument's value. Shared rules are named by their shape, so twenty queries cost one rule. */
function valueRule(type: ArgType, tool: string, field: string, rules: Rules): string {
  switch (type.kind) {
    case "enum":
      return rules.add(`v-${ruleName(tool)}-${ruleName(field)}`, `( ${type.values.map(jsonString).join(" | ")} )`);
    case "integer": {
      const more = digits(type.max) - 1;
      const lead = type.min <= 0 ? '"0" | ' : "";
      const tail = more > 0 ? ` [0-9]{0,${more}}` : "";
      return rules.add(`int${digits(type.max)}${type.min <= 0 ? "z" : ""}`, `( ${lead}[1-9]${tail} )`);
    }
    case "query": {
      const max = Math.min(type.maxLength, GRAMMAR_QUERY_MAX);
      return rules.add(`q${max}`, `"\\"" qc{1,${max}} "\\""`);
    }
    case "chordName":
      return rules.add(
        "chord",
        `"\\"" ( ${ROOT_NAMES.map(gbnfLiteral).join(" | ")} ) ( ${CHORD_SUFFIXES.filter((s) => s.length > 0).map(gbnfLiteral).join(" | ")} )? "\\""`,
      );
    case "appId":
      // Only the app's own tools declare one, and they are not in the catalogue.
      throw new Error(`grammar: ${tool}.${field} is an app id`);
  }
}

/**
 * Optional arguments the runner takes exactly one of (leg c3bp): the grammar
 * writes each group as one required slot, its members alternatives, so a call
 * with both or with neither cannot be written. Only where the tool's own
 * `propose` refuses both and neither (`set_tempo`: "needs `bpm` or
 * `direction`, not both"); `grammar.test.ts` holds the runner to it, so the
 * grammar never refuses a call the runner would take.
 */
export const ONE_OF: Readonly<Record<string, readonly (readonly string[])[]>> = {
  set_tempo: [["bpm", "direction"]],
};

/** A place in the arguments object: one field, or a ONE_OF group (required, one of its members). */
type Slot = { optional: boolean; fields: readonly ArgField[] };

function slotsOf(fields: readonly ArgField[], tool: string): Slot[] {
  const groups = ONE_OF[tool] ?? [];
  const slots: Slot[] = [];
  const placed = new Set<string>();
  for (const f of fields) {
    if (placed.has(f.name)) continue;
    const group = groups.find((g) => g.includes(f.name));
    if (!group) {
      slots.push({ optional: f.optional === true, fields: [f] });
      continue;
    }
    const members = group.map((name) => fields.find((x) => x.name === name));
    if (members.some((m) => m === undefined || m.optional !== true)) throw new Error(`grammar: ONE_OF ${tool} names a field that is missing or required`);
    for (const m of members) placed.add(m!.name);
    slots.push({ optional: false, fields: members as ArgField[] });
  }
  return slots;
}

/**
 * The arguments object's body: each slot in the order the tool declares its
 * fields, the required ones always, the optional ones as groups. A comma goes
 * before every slot but the first one present, which is why the "nothing yet"
 * branch is spelled out (at most quadratic in the number of slots).
 */
function argsBody(fields: readonly ArgField[], tool: string, rules: Rules): string {
  const slots = slotsOf(fields, tool);
  const field = (f: ArgField) => `${jsonString(f.name)} ws ":" ws ${valueRule(f.type, tool, f.name, rules)}`;
  const item = (s: Slot) => (s.fields.length === 1 ? field(s.fields[0]) : `( ${s.fields.map(field).join(" | ")} )`);
  const after = (i: number): string => {
    // Something is written already: every later slot comes with its comma.
    const parts: string[] = [];
    for (let k = i; k < slots.length; k++) {
      const s = slots[k];
      parts.push(s.optional ? `( "," ws ${item(s)} )?` : `"," ws ${item(s)}`);
    }
    return parts.join(" ");
  };
  const first = (i: number): string => {
    // Nothing written yet: the first slot present has no comma.
    if (i >= slots.length) return "";
    const s = slots[i];
    const here = [item(s), after(i + 1)].filter(Boolean).join(" ");
    if (!s.optional) return here;
    const rest = first(i + 1);
    return rest === "" ? `( ${here} )?` : `( ${here} | ${rest} )`;
  };
  return first(0);
}

function toolRule(tool: ToolSpec, rules: Rules): string {
  const body = argsBody(tool.args, tool.name, rules);
  return rules.add(
    `t-${ruleName(tool.name)}`,
    `${jsonString("tool")} ws ":" ws ${jsonString(tool.name)} ws "," ws ${jsonString("args")} ws ":" ws "{" ws ${body ? `${body} ws ` : ""}"}"`,
  );
}

/**
 * The cards (leg c3b1b): each card with its own arguments, typed as a tool's
 * are (`argsBody`), and `"args"` left out entirely when it gives none. A card
 * that declares no `args` gets the generic bounded argument (two at most).
 */
function cardsRule(cards: readonly EvalCard[], rules: Rules): string {
  const one = (card: EvalCard): string => {
    const head = `${jsonString("card")} ws ":" ws ${jsonString(card.id)}`;
    if (card.args === undefined) {
      const cardArg = rules.add("card-arg", `"\\"" [a-z] [a-zA-Z]{0,15} "\\"" ws ":" ws ( "\\"" qc{1,${CARD_ARG_CHARS}} "\\"" | int3 )`);
      rules.add("int3", "( [1-9] [0-9]{0,2} )");
      return rules.add(
        `c-${ruleName(card.id)}`,
        `${head} ( "," ws ${jsonString("args")} ws ":" ws "{" ws ( ${cardArg} ( "," ws ${cardArg} ){0,${CARD_ARGS_MAX - 1}} )? ws "}" )?`,
      );
    }
    const body = argsBody(card.args, `card-${card.id}`, rules);
    const args = `"," ws ${jsonString("args")} ws ":" ws "{" ws ${body ? `${body} ws ` : ""}"}"`;
    return rules.add(`c-${ruleName(card.id)}`, `${head} ( ${args} )?`);
  };
  return rules.add("card", cards.map(one).join(" | "));
}

/**
 * The grammar for one choice. `situation` narrows the tools to those that can
 * run where the player is (`possible`, from `commandFacts`); left out, every
 * player tool is allowed. The cards and the three answers are always there.
 */
export function choiceGrammar(catalogue: ToolCatalogue, cards: readonly EvalCard[], situation?: GrammarSituation): string {
  const rules = new Rules();
  const tools = catalogue.tools.filter((t) => t.audience === "player" && (situation === undefined || situation.possible[t.name] === true));
  const kinds: string[] = [];
  if (tools.length > 0) kinds.push(rules.add("call", tools.map((t) => toolRule(t, rules)).join(" | ")));
  if (cards.length > 0) kinds.push(cardsRule(cards, rules));
  kinds.push(rules.add("answer", `${jsonString("answer")} ws ":" ws ( ${CHOICE_ANSWERS.map(jsonString).join(" | ")} )`));
  const head = `root ::= "{" ws ( ${kinds.join(" | ")} ) ws "}"\n`;
  rules.add("qc", '[^"\\\\\\x00-\\x1f]');
  rules.add("ws", '" "?');
  return head + rules.text();
}

/** One answer the grammar allows, read back. Null for anything else (never thrown). */
export type ParsedChoice =
  | { kind: "call"; tool: string; args: Record<string, string | number> }
  | { kind: "card"; card: string; args: Record<string, string | number> }
  | { kind: "answer"; answer: ChoiceAnswer };

export function parseChoice(text: string): ParsedChoice | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const args = (raw: unknown): Record<string, string | number> | null => {
    if (raw === undefined) return {};
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const out: Record<string, string | number> = {};
    for (const [k, x] of Object.entries(raw)) {
      if (typeof x === "string") out[k] = x;
      else if (typeof x === "number" && Number.isFinite(x)) out[k] = x;
      else return null;
    }
    return out;
  };
  if (typeof v.tool === "string") {
    const a = args(v.args);
    return a ? { kind: "call", tool: v.tool, args: a } : null;
  }
  if (typeof v.card === "string") {
    const a = args(v.args);
    return a ? { kind: "card", card: v.card, args: a } : null;
  }
  if (typeof v.answer === "string" && (CHOICE_ANSWERS as readonly string[]).includes(v.answer)) {
    return { kind: "answer", answer: v.answer as ChoiceAnswer };
  }
  return null;
}
