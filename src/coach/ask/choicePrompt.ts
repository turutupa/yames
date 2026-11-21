/**
 * The prompt for a choice (DESIGN 5.3 engine 4a, 5.5 budgets; leg c3b1a).
 *
 * Two parts, as `coach::ask` takes them:
 *
 * - `choicePrefix(catalogue, cards)`: the static head, the tools and cards
 *   with a line each and the answer's format. **Byte-identical turn to turn**
 *   (nothing in it changes with the time, the screen or a counter), because
 *   the worker keeps it decoded (c3a's prefix cache). At most
 *   `CHOICE_PREFIX_TOKENS` by `estimateTokens`.
 * - `choiceContext(facts)`: where the player is, as plain lines. At most
 *   `CHOICE_CONTEXT_TOKENS` (Rust refuses a context over 450).
 *
 * Rust puts its own `ASK_SYSTEM_PROMPT` before the prefix; the question goes
 * as the player typed it.
 */
import { estimateTokens } from "../context";
import type { ArgField, ToolCatalogue } from "../tools/types";
import type { EvalCard } from "./evalCards";

/** DESIGN 5.5: the system text and the intent list. */
export const CHOICE_PREFIX_TOKENS = 900;
/** DESIGN 5.5, and `coach::ASK_CONTEXT_MAX_TOKENS`. */
export const CHOICE_CONTEXT_TOKENS = 450;

/** An enum this short is listed in the prompt; a longer one is named by examples (the grammar holds it all). */
const LIST_ENUM_UP_TO = 13;

function argText(f: ArgField): string {
  const opt = f.optional ? "?" : "";
  switch (f.type.kind) {
    case "enum":
      return f.type.values.length <= LIST_ENUM_UP_TO
        ? `${f.name}${opt}: ${f.type.values.join("|")}`
        : `${f.name}${opt}: ${f.type.values.slice(0, 3).join("|")}|…`;
    case "integer":
      return `${f.name}${opt}: ${f.type.min}-${f.type.max}`;
    case "query":
      return `${f.name}${opt}: words`;
    case "chordName":
      return `${f.name}${opt}: chord like Am7`;
    case "appId":
      return `${f.name}${opt}: id`;
  }
}

/** The static head. A pure function of the catalogue and the cards. */
export function choicePrefix(catalogue: ToolCatalogue, cards: readonly EvalCard[]): string {
  const lines: string[] = [
    "Choose what the app does with the player's message. Reply with one JSON object, nothing else.",
    '- {"tool":NAME,"args":{...}} when the player asks the app to do one of the tools below',
    ...(cards.length > 0 ? ['- {"card":ID} when a card below answers the question'] : []),
    '- {"answer":"which"} when the request could mean two or more different things',
    '- {"answer":"yours"} when the player asks to record, delete, grade, change the microphone, devices, grading or the model: only the player does those',
    '- {"answer":"none"} for anything else: chat, a question, or a request no tool does here',
    "Name Paths, Steps, Exercises, jams and presets in the player's own words. Numbers as digits.",
    "",
    "Tools:",
  ];
  for (const tool of catalogue.tools) {
    if (tool.audience !== "player") continue;
    lines.push(`${tool.name}(${tool.args.map(argText).join(", ")}): ${tool.note}`);
  }
  if (cards.length > 0) {
    lines.push("", "Cards:");
    for (const card of cards) lines.push(`${card.id}: ${card.note}`);
  }
  return lines.join("\n");
}

/** What the context says: plain facts, already in the player's language where they are titles. */
export type ChoiceFacts = {
  screen: string;
  /** "none", or the Session's phase. */
  session: string;
  path?: string;
  step?: { order: number; title: string };
  exercise?: string;
  grading: string;
  tempo?: number;
  minutes?: number;
  /** Today's parts, in order. */
  parts?: readonly string[];
  followed?: readonly string[];
  jams?: readonly string[];
  presets?: readonly string[];
  /** The tools that can run here. */
  possible: readonly string[];
};

/** The context lines, longest last so a cut loses the least: a line that does not fit is left out. */
export function choiceContext(facts: ChoiceFacts): string {
  const lines: string[] = [`Screen: ${facts.screen}`, `Session: ${facts.session}`];
  if (facts.path) lines.push(`Path: ${facts.path}`);
  if (facts.step) lines.push(`Step ${facts.step.order}: ${facts.step.title}`);
  if (facts.exercise) lines.push(`Exercise: ${facts.exercise}`);
  lines.push(`Grading: ${facts.grading}`);
  if (facts.tempo !== undefined) lines.push(`Tempo: ${facts.tempo} bpm`);
  if (facts.minutes !== undefined) lines.push(`Today: ${facts.minutes} minutes`);
  lines.push(`Tools here: ${facts.possible.join(", ") || "none"}`);
  const lists: Array<[string, readonly string[] | undefined]> = [
    ["Today's parts", facts.parts],
    ["Followed Paths", facts.followed],
    ["Jams", facts.jams],
    ["Presets", facts.presets],
  ];
  for (const [name, list] of lists) {
    if (list && list.length > 0) lines.push(`${name}: ${list.map((x, i) => (name === "Today's parts" ? `${i + 1}. ${x}` : x)).join("; ")}`);
  }
  const kept: string[] = [];
  for (const l of lines) {
    const next = [...kept, l].join("\n");
    if (estimateTokens(next) > CHOICE_CONTEXT_TOKENS) break;
    kept.push(l);
  }
  return kept.join("\n");
}
