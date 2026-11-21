/**
 * A training record, and its prompt and completion exactly as the app's worker
 * would send them and the grammar would accept (leg c3d1).
 *
 * Records, not prompts, are what is stored: leg c3bp changes the prompt beside
 * this leg, so the text is rendered at training time from the app's own
 * `choicePrompt.ts` / `grammar.ts` / `choiceFactsFor`, as the eval's
 * `askRequestFor` builds a request, with two differences that are the point
 * of training (TOOLS 3.3): the tools are listed in the record's order and the
 * withheld ones are left out of the list, the "Tools here" line and the
 * grammar, so the model learns to read the list rather than remember it.
 *
 * The ChatML around it is `coach::ask_prompt_head` / `ask_prompt_tail`
 * (`src-tauri/src/coach.rs`), copied here; `train.test.ts` fails when the Rust
 * text changes and this copy does not.
 */
import type { PathDoc } from "../../paths/format";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import type { ToolArgs, ToolCatalogue } from "../tools/types";
import { choiceContext, choicePrefix } from "../ask/choicePrompt";
import { EVAL_CARDS } from "../ask/evalCards";
import { choiceFactsFor } from "../ask/evalRun";
import type { EvalLanguage, Expect, Situation } from "../ask/evalWorld";
import { choiceGrammar } from "../ask/grammar";

/** One training record (`evals/coach/train/*.jsonl`). */
export type TrainRecord = {
  id: string;
  language: EvalLanguage;
  kind: Expect["kind"];
  /** The seed intent (`intents.ts`) and the wording it was filled from (`<intent>#<index>` in the wordings file). */
  intent: string;
  wording: string;
  /** Who wrote the wording (a helper's name, never a person's). */
  writer: string;
  situation: Situation;
  /** The player tools shown, in the order shown; the rest are withheld. */
  tools: string[];
  /** What the player types. */
  text: string;
  /** Decided by the runner (`generate.ts` `judge`), never written by a model. */
  expect: Expect;
  /** The call the words ask for, as the runner was given it (absent for yours / none / card intents): what `expect` was judged from. */
  call?: { tool: string; args: ToolArgs };
  tags: string[];
};

/** `coach::ASK_SYSTEM_PROMPT`, word for word. */
export const ASK_SYSTEM_PROMPT = `You answer one question inside Yames, a guitar practice app. One reply, no follow-up questions.

Rules:
- Use only what the app gives you below; never invent a number, a tempo, a bar, a note or a result
- Never state a fact about the player: the app shows those itself
- Keep to guitar, practice and Yames
- When a format is required, reply in exactly that format and nothing else`;

/** The end of the assistant's turn (Qwen3's ChatML): the completion ends with it. */
export const END_OF_TURN = "<|im_end|>";

/** `coach::ask_prompt_head`. */
export function askPromptHead(prefix: string): string {
  const p = prefix.trim();
  return `<|im_start|>system\n${ASK_SYSTEM_PROMPT}${p ? `\n\n${p}` : ""}\n\n/no_think<|im_end|>\n<|im_start|>user\n`;
}

/** `coach::ask_prompt_tail`: the context, the question, and the empty thinking block prefilled. */
export function askPromptTail(context: string, question: string): string {
  const c = context.trim();
  return `${c ? `${c}\n\n` : ""}Question: ${question.trim()}<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

/** The catalogue as this record shows it: its tools, in its order. */
export function shownCatalogue(tools: readonly string[]): ToolCatalogue {
  const full = toolCatalogue(COACH_TOOLS);
  const shown = tools.map((name) => {
    const tool = full.tools.find((t) => t.name === name);
    if (!tool) throw new Error(`render: no player tool "${name}"`);
    return tool;
  });
  return { version: full.version, tools: shown };
}

/** The call's arguments in the order the tool declares them (the grammar's order), undefined ones left out. */
function orderedArgs(catalogue: ToolCatalogue, tool: string, args: ToolArgs): ToolArgs {
  const spec = catalogue.tools.find((t) => t.name === tool);
  if (!spec) throw new Error(`render: ${tool} is not shown`);
  const out: Record<string, ToolArgs[string]> = {};
  for (const f of spec.args) if (args[f.name] !== undefined) out[f.name] = args[f.name];
  for (const k of Object.keys(args)) if (!(k in out)) throw new Error(`render: ${tool} has no argument ${k}`);
  return out;
}

/** The answer as the model must write it (compact JSON, as the grammar allows). */
export function answerText(expect: Expect, catalogue: ToolCatalogue): string {
  switch (expect.kind) {
    case "call":
      return JSON.stringify({ tool: expect.tool, args: orderedArgs(catalogue, expect.tool, expect.args) });
    case "card":
      return JSON.stringify(expect.args && Object.keys(expect.args).length > 0 ? { card: expect.card, args: expect.args } : { card: expect.card });
    default:
      return JSON.stringify({ answer: expect.kind });
  }
}

export type Rendered = { id: string; prompt: string; completion: string; grammar: string; answer: string };

/** One record as a training pair. `paths` are the Paths in the record's language. */
export function renderRecord(record: TrainRecord, paths: readonly PathDoc[]): Rendered {
  const catalogue = shownCatalogue(record.tools);
  const shown = new Set(record.tools);
  const facts = choiceFactsFor(record.situation, record.language, paths);
  const possibleList = facts.possible.filter((name) => shown.has(name));
  const possible: Record<string, boolean> = {};
  for (const name of possibleList) possible[name] = true;
  const prefix = choicePrefix(catalogue, EVAL_CARDS);
  const context = choiceContext({ ...facts, possible: possibleList });
  const answer = answerText(record.expect, catalogue);
  return {
    id: record.id,
    prompt: askPromptHead(prefix) + askPromptTail(context, record.text),
    completion: `${answer}${END_OF_TURN}`,
    grammar: choiceGrammar(catalogue, EVAL_CARDS, { possible }),
    answer,
  };
}
