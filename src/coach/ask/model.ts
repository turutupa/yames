/**
 * The model chooses, for Ask's text box (DESIGN 5.3 engine 4a, 5.5; leg c3b2a).
 *
 * Pure where it can be: the request (`choiceRequest`), what an outcome means
 * (`readChoice`), the speed gate (`asksUseModel`), the per-language switch
 * (`MODEL_LANGS`) and the token budgets. One function talks to the worker,
 * `askModelChoice`; the turn in the thread (the working line, Stop, the
 * cancels) is `containers/coach/askModelTurn.ts`.
 *
 * What the model returns is never run here: a call goes to the runner as the
 * model's (`runCoachTool(…, { via: "model" })`), where every `go` and
 * `confirm` tool is a one-press proposal. Only `answered` is an answer;
 * `truncated`, `deadEnd`, `timedOut`, `cancelled`, `noModel`, a rejection and
 * a parse that fails are `none`, and the rule-made answer stands.
 *
 * **Dark in this build.** `MODEL_LANGS` is empty for both tiers: nothing a
 * player can do turns the model on for Ask. Stock Qwen3 4B and 8B fell short
 * on the held-out set (leg c3b2m: right tool 77% / 80% in the chain against
 * 90%, wrong actions 10.7% / 7.1% against under 2%). A language goes on for a
 * tier only from a measured run: right tool at least 90% (TOOLS 3.5).
 */
import { cancelGeneration, coachAsk, newGenerationId, type CoachAskOutcome, type CoachAskRequest, type CoachCapabilities } from "../../ipc";
import type { BrainTier, ModelTier } from "../../types";
import { estimateTokens, type CoachContext } from "../context";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import type { ToolArgs, ToolCall } from "../tools/types";
import { CHOICE_CONTEXT_TOKENS, CHOICE_PREFIX_TOKENS, choiceContext, choicePrefix, type ChoiceFacts } from "./choicePrompt";
import { EVAL_CARDS } from "./evalCards";
import { choiceGrammar, parseChoice } from "./grammar";

// ---------------------------------------------------------------------------
// The switch
// ---------------------------------------------------------------------------

/**
 * The languages Ask's model is on for, per tier. **Empty**: the model path
 * ships dark. Filled only from measured numbers (leg c3b2b, then c3d's
 * router): a language for a tier when its right tool is at least 90% in the
 * chain, 20 items or more. One line per tier; nothing else changes.
 */
export const MODEL_LANGS: Readonly<Record<ModelTier, readonly string[]>> = {
  standard: [],
  full: [],
};

/** Tests and the shot harness only: a switch other than `MODEL_LANGS`. Never set by the app. */
let langsOverride: Readonly<Record<ModelTier, readonly string[]>> | null = null;

export function __setModelLangsForTests(langs: Readonly<Record<ModelTier, readonly string[]>> | null): void {
  langsOverride = langs;
}

export function modelLangs(): Readonly<Record<ModelTier, readonly string[]>> {
  return langsOverride ?? MODEL_LANGS;
}

/** Whether `lang` (i18next's: "de", "pt-BR", "en-GB") is on for `tier`: the code itself, or its base language. */
export function modelLangOn(tier: BrainTier, lang: string, langs = modelLangs()): boolean {
  if (tier === "off") return false;
  const list = langs[tier];
  if (!list || list.length === 0) return false;
  return list.includes(lang) || list.includes(lang.split("-")[0]);
}

// ---------------------------------------------------------------------------
// Budgets (DESIGN 5.5)
// ---------------------------------------------------------------------------

/** The system text and the tool list. */
export const ASK_PREFIX_TOKENS = CHOICE_PREFIX_TOKENS;
/** Where the player is, and the last exchange with it. Rust refuses more. */
export const ASK_CONTEXT_TOKENS = CHOICE_CONTEXT_TOKENS;
/** The last exchange (the question before this one), at most. */
export const ASK_EXCHANGE_TOKENS = 150;
/** A choice's output, as Rust holds it (`coach::ask`, mode `choice`). */
export const ASK_CHOICE_OUTPUT_TOKENS = 48;
/** One turn, queue and generation together (ROADMAP 3.1). */
export const ASK_DEADLINE_MS = 8_000;

/** The last exchange as one context line, cut at a word to `ASK_EXCHANGE_TOKENS`; null for none. */
export function exchangeLine(previous: string | null | undefined): string | null {
  const said = previous?.replace(/\s+/g, " ").trim();
  if (!said) return null;
  const head = "Before: ";
  if (estimateTokens(head + said) <= ASK_EXCHANGE_TOKENS) return head + said;
  const words = said.split(" ");
  while (words.length > 1 && estimateTokens(`${head}${words.join(" ")}…`) > ASK_EXCHANGE_TOKENS) words.pop();
  const cut = `${head}${words.join(" ")}…`;
  return estimateTokens(cut) <= ASK_EXCHANGE_TOKENS ? cut : null;
}

/**
 * The context the model reads: the facts' lines (`choiceContext`, already
 * within 450) and, when it fits, the last exchange. Over 450 is cut by rule,
 * oldest first: the last exchange goes before any fact about now, then the
 * facts from the end (`choiceContext` leaves out a line that does not fit).
 * Never sent over.
 */
export function fitContext(facts: ChoiceFacts, previous?: string | null): string {
  const now = choiceContext(facts);
  const before = exchangeLine(previous);
  if (!before) return now;
  const both = `${now}\n${before}`;
  return estimateTokens(both) <= ASK_CONTEXT_TOKENS ? both : now;
}

// ---------------------------------------------------------------------------
// The request
// ---------------------------------------------------------------------------

let prefixMemo: { cards: readonly unknown[]; text: string } | null = null;

/** The static head: one string for the app run (the worker's prefix cache keys on it). */
export function askChoicePrefix(): string {
  if (!prefixMemo || prefixMemo.cards !== EVAL_CARDS) prefixMemo = { cards: EVAL_CARDS, text: choicePrefix(toolCatalogue(COACH_TOOLS), EVAL_CARDS) };
  return prefixMemo.text;
}

/**
 * Where the player is, as the choice context states it, from the coach's
 * context and the tools that can run here (`commandFacts(ctx, view).possible`).
 */
export function choiceFactsFrom(
  ctx: CoachContext,
  here: { view: string; possible: Readonly<Record<string, boolean>>; tempo?: number | null },
  lists: { jams?: readonly string[]; presets?: readonly string[]; followed?: readonly string[] } = {},
): ChoiceFacts {
  const possible = Object.keys(here.possible).filter((name) => here.possible[name]);
  return {
    screen: here.view,
    session: ctx.run && ctx.run.phase !== "idle" ? ctx.run.phase : "none",
    ...(ctx.path ? { path: ctx.path.title } : {}),
    ...(ctx.step ? { step: { order: ctx.step.order, title: ctx.step.title } } : {}),
    ...(ctx.exercise ? { exercise: ctx.exercise.title } : {}),
    grading: String(ctx.grading),
    ...(typeof here.tempo === "number" ? { tempo: here.tempo } : {}),
    ...(ctx.plan && ctx.screen === "today" ? { parts: ctx.plan.steps.map((s) => s.title) } : {}),
    ...(lists.followed && lists.followed.length > 0 ? { followed: lists.followed } : {}),
    ...(lists.jams && lists.jams.length > 0 ? { jams: lists.jams } : {}),
    ...(lists.presets && lists.presets.length > 0 ? { presets: lists.presets } : {}),
    possible,
  };
}

/** One choice request: the static prefix, the context within budget, the grammar narrowed to what can run here. */
export function choiceRequest(question: string, facts: ChoiceFacts, generationId: number, previous?: string | null): CoachAskRequest {
  const possible: Record<string, boolean> = {};
  for (const name of facts.possible) possible[name] = true;
  return {
    generationId,
    mode: "choice",
    prefix: askChoicePrefix(),
    context: fitContext(facts, previous),
    question: question.trim(),
    grammar: choiceGrammar(toolCatalogue(COACH_TOOLS), EVAL_CARDS, { possible }),
    deadlineMs: ASK_DEADLINE_MS,
  };
}

// ---------------------------------------------------------------------------
// The outcome
// ---------------------------------------------------------------------------

export type ModelChoice = { kind: "call"; call: ToolCall } | { kind: "card"; card: string; args: ToolArgs } | { kind: "none" };

const NONE: ModelChoice = { kind: "none" };

/**
 * What an outcome means. Only `answered` with one object the grammar allows
 * is a call or a card; "which" and "yours" from the model are `none` here (the
 * router owns both, and the rule-made answer stands).
 */
export function readChoice(outcome: CoachAskOutcome | null | undefined): ModelChoice {
  if (!outcome || outcome.status !== "answered") return NONE;
  const parsed = parseChoice(outcome.text.trim());
  if (!parsed) return NONE;
  if (parsed.kind === "call") return { kind: "call", call: { tool: parsed.tool, args: parsed.args } };
  if (parsed.kind === "card") return { kind: "card", card: parsed.card, args: parsed.args };
  return NONE;
}

// ---------------------------------------------------------------------------
// The speed gate
// ---------------------------------------------------------------------------

/** How many of this run's measured turns the median reads. */
const TIMES_KEPT = 20;
let times: number[] = [];

/**
 * A measured choice turn: `answered.totalMs`, or, for a turn that ran out of
 * its 8 s, the deadline and a millisecond (a machine whose every turn times
 * out must not keep a "not measured yet" yes).
 */
export function noteChoiceTime(ms: number): void {
  if (!Number.isFinite(ms) || ms < 0) return;
  times = [...times.slice(-(TIMES_KEPT - 1)), ms];
}

/** The median of this run's measured choice turns, or null before any. */
export function choiceMedianMs(): number | null {
  if (times.length === 0) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export type GateCaps = Pick<CoachCapabilities, "modelResident" | "backend">;

/**
 * Whether Ask asks the model this turn. One function, every clause:
 *
 * 1. a model is resident (`caps.modelResident`);
 * 2. the brain tier is not Off;
 * 3. the language is on for that tier (`MODEL_LANGS`: empty in this build);
 * 4. this run's median choice turn is within 8 s; before any is measured,
 *    yes on a GPU backend (Metal, Vulkan) and no on `cpu`, as
 *    `should_use_model` decides for tips (judgement call 4);
 * 5. on a `cpu` backend, nothing sounds (`host.sounding()` is null): the
 *    threads of a CPU generation cannot be capped per call in llama-cpp-2
 *    0.1.146, so the model stays off while the click plays (judgement call 5).
 */
export function asksUseModel(
  caps: GateCaps | null | undefined,
  tier: BrainTier,
  lang: string,
  sounding: boolean,
  opts: { medianMs?: number | null; langs?: Readonly<Record<ModelTier, readonly string[]>> } = {},
): boolean {
  if (!caps || !caps.modelResident || caps.backend === "none") return false;
  if (tier === "off") return false;
  if (!modelLangOn(tier, lang, opts.langs ?? modelLangs())) return false;
  const cpu = caps.backend === "cpu";
  const median = opts.medianMs === undefined ? choiceMedianMs() : opts.medianMs;
  if (median === null ? cpu : median > ASK_DEADLINE_MS) return false;
  if (cpu && sounding) return false;
  return true;
}

// ---------------------------------------------------------------------------
// The one call
// ---------------------------------------------------------------------------

const warned = new Set<string>();

/** A `grammar:` rejection is a bug in the grammar: said once per message, never to the player. */
function logGrammar(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn("Ask's choice grammar was refused:", message);
}

export type AskedChoice = { choice: ModelChoice; status: CoachAskOutcome["status"] | "rejected" };

/**
 * Ask the worker for one choice (`coach_ask`, mode `choice`, 8 s), and read
 * the one object back. Times the turn for the gate. Never throws.
 */
export async function askModelChoice(request: CoachAskRequest): Promise<AskedChoice> {
  let outcome: CoachAskOutcome;
  try {
    outcome = await coachAsk(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("grammar:")) logGrammar(message);
    if (message === "coach_ask_timeout") noteChoiceTime(ASK_DEADLINE_MS + 1);
    return { choice: NONE, status: "rejected" };
  }
  if (outcome.status === "answered") noteChoiceTime(outcome.totalMs);
  else if (outcome.status === "timedOut") noteChoiceTime(ASK_DEADLINE_MS + 1);
  return { choice: readChoice(outcome), status: outcome.status };
}

/** A turn's id, from the worker's counter. */
export function newChoiceId(): number {
  return newGenerationId();
}

/** Stop a turn, queued or running (a failure to reach Rust is not the player's). */
export function cancelChoice(generationId: number): void {
  void cancelGeneration(generationId).catch(() => false);
}

/** Tests only. */
export function __resetModelForTests(): void {
  times = [];
  warned.clear();
  langsOverride = null;
  prefixMemo = null;
}
