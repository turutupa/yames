/**
 * The tool eval's engines and its scoring (DESIGN C3b, TOOLS 3.5; leg c3b1a).
 *
 * Pure. `scripts/coach-eval.mjs` bundles this file with esbuild, hands it the
 * set and the Paths, and does the file system and the Rust process.
 *
 * - `rulesAnswer`: the rule chain every device already runs on a typed
 *   message, with no model: the command router as `answerTyped` uses it (a
 *   named `open_path` / `open_step` opens at once only by the title's whole
 *   words, a name that names nothing goes on), then Path search
 *   (`answerSearchFor`, leg c2ca). No fact cards yet (not on `coach`).
 * - `askRequestFor` / `modelAnswer`: one `coach::ask` choice request per item
 *   (the prefix, the context, the grammar) and its outcome read back. Only
 *   `answered` is an answer (c3a): every other status is "no answer".
 * - `scoreItem` / `summarize`: right tool, right arguments, wrong actions,
 *   asked when unsure, per language and overall.
 */
import { NEVER_ITEMS } from "../../containers/coach/neverList";
import type { PathDoc } from "../../paths/format";
import { commandFacts } from "./router";
import { routeCommand } from "./router";
import { commandTableFor } from "./commandTable";
import { answerSearchFor } from "./search";
import { resolvePath, wholeTitleWords, normalizeWords } from "../tools/resolve";
import { resolveStepCall } from "../tools/go";
import { COACH_TOOLS, toolCatalogue } from "../tools/registry";
import type { ToolArgs, ToolCall } from "../tools/types";
import { choiceContext, choicePrefix, namedTitles, type ChoiceFacts } from "./choicePrompt";
import { choiceGrammar, parseChoice } from "./grammar";
import { EVAL_CARDS } from "./evalCards";
import {
  WORLD_FOLLOWED,
  WORLD_JAMS,
  WORLD_MINUTES,
  WORLD_PRESETS,
  WORLD_TEMPO,
  contextFor,
  effectOf,
  evalHost,
  type EvalItem,
  type Situation,
} from "./evalWorld";

// ---------------------------------------------------------------------------
// What an engine answered
// ---------------------------------------------------------------------------

/** Not answered: the model's outcome was not `answered`, or its text did not read. */
export const NO_ANSWER_STATUSES = ["truncated", "deadEnd", "timedOut", "cancelled", "noModel", "error", "unread"] as const;
export type NoAnswerStatus = (typeof NO_ANSWER_STATUSES)[number];

export type EngineAnswer =
  | { kind: "call"; call: ToolCall }
  | { kind: "card"; card: string; args?: ToolArgs }
  | { kind: "which" }
  | { kind: "yours"; item?: string }
  | { kind: "none" }
  /** The rules quoted a Path passage: an answer, never an action. */
  | { kind: "search"; step: string }
  | { kind: "noAnswer"; status: NoAnswerStatus; detail?: string };

// ---------------------------------------------------------------------------
// The rules, as the app runs them today
// ---------------------------------------------------------------------------

/** The view `host.view()` reports for a situation (a Session sits on Today). */
function viewFor(s: Situation): string {
  return s.view === "session" ? "today" : s.view;
}

const NAMED = ["path", "query", "exercise", "jam", "preset"] as const;

/**
 * `answerTyped`'s chain with no model and no next answerer: the router, the
 * whole-words rule for a typed name, a name that names nothing going on, then
 * search. Mirrors `askTyped.ts` / `askTools.typedGo` / `runTypedCall`, which
 * read the app's live host; this reads the item's world.
 */
export function rulesAnswer(item: EvalItem, paths: readonly PathDoc[]): EngineAnswer {
  const said = item.text.trim();
  const ctx = contextFor(item.situation, item.lang, paths);
  const host = evalHost(item.situation, paths, item.lang);
  const table = commandTableFor(item.lang);
  if (table) {
    const routed = routeCommand(said, table, commandFacts(ctx, viewFor(item.situation), COACH_TOOLS));
    const go = (call: ToolCall): "none" | "which" | "run" => {
      const pathName = typeof call.args.path === "string" ? call.args.path : undefined;
      const query = typeof call.args.query === "string" ? call.args.query : undefined;
      if (call.tool === "open_path" && pathName !== undefined) {
        const found = resolvePath(pathName, paths);
        if ("none" in found) return "none";
        if ("several" in found) return "run";
        return wholeTitleWords(pathName, found.found.title) ? "run" : "which";
      }
      if (call.tool === "open_step" && (pathName !== undefined || query !== undefined)) {
        const found = resolveStepCall("open_step", call.args, host, ctx);
        if (!("step" in found)) {
          const nameNotFound = found.why === "notFound" && (found.choices ?? []).length === 0 && typeof found.line.values.query === "string";
          return nameNotFound ? "none" : "run";
        }
        const whole =
          (pathName === undefined || wholeTitleWords(pathName, found.path.title)) && (query === undefined || wholeTitleWords(query, found.step.title));
        return whole ? "run" : "which";
      }
      return "run";
    };
    switch (routed.kind) {
      case "call": {
        const g = go(routed.call);
        if (g === "which") return { kind: "which" };
        if (g === "none") break;
        const effect = effectOf(routed.call, item.situation, item.lang, paths);
        const named = NAMED.some((k) => typeof routed.call.args[k] === "string");
        const nameNotFound = effect.refused?.startsWith("notFound:") && !effect.which && named;
        if (nameNotFound) break;
        return effect.which ? { kind: "which" } : { kind: "call", call: routed.call };
      }
      case "which": {
        if (routed.choices.length === 1) {
          const g = go(routed.choices[0].call);
          if (g === "none") break;
        }
        return { kind: "which" };
      }
      case "yours":
        return { kind: "yours", item: routed.item };
      case "none":
        // A command for another screen: the runner says why and nothing changes.
        if (routed.notHere) return { kind: "none" };
        break;
    }
  }
  const found = answerSearchFor(said, { language: item.lang, paths, progress: ctx.progress });
  if (found) return { kind: "search", step: `${found.hit.pathId}/${found.hit.stepId}` };
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// The model's request and answer
// ---------------------------------------------------------------------------

/** The facts the choice context states, from the item's world, in the item's language. */
export function choiceFactsFor(situation: Situation, lang: string, paths: readonly PathDoc[]): ChoiceFacts {
  const ctx = contextFor(situation, lang, paths);
  const facts = commandFacts(ctx, viewFor(situation), COACH_TOOLS);
  const title = (id: string) => paths.find((p) => p.id === id)?.title ?? id;
  return {
    screen: situation.view === "paths" ? (situation.step !== undefined ? "Step page" : situation.path ? "Path page" : "Paths") : situation.view,
    session: situation.view === "session" ? (situation.phase ?? "ready") : "none",
    ...(ctx.path ? { path: ctx.path.title } : {}),
    ...(ctx.step ? { step: { order: ctx.step.order, title: ctx.step.title } } : {}),
    ...(ctx.exercise ? { exercise: ctx.exercise.title } : {}),
    grading: ctx.grading,
    ...(facts.tempo ? { tempo: situation.view === "session" ? ctx.run?.bpm : (situation.tempo ?? WORLD_TEMPO) } : {}),
    ...(situation.view === "today" ? { minutes: WORLD_MINUTES, parts: (ctx.plan?.steps ?? []).map((s) => s.title) } : {}),
    followed: WORLD_FOLLOWED.map(title),
    jams: [...WORLD_JAMS],
    presets: [...WORLD_PRESETS],
    possible: Object.keys(facts.possible).filter((name) => facts.possible[name]),
  };
}

export type AskRequestJson = {
  id: string;
  generationId: number;
  mode: "choice";
  prefix: string;
  context: string;
  question: string;
  /** Absent in the "no grammar" arm: the model's raw answer, parsed strictly. */
  grammar?: string;
  deadlineMs: number;
};

/**
 * The eval's arms (TOOLS 3.5; leg c3b2m added `none` and `names`):
 * - `grammar`: `situation` (the tools possible here: as the app ships),
 *   `full` (every player tool), `none` (no grammar at all);
 * - `prompt`: `notes` (each tool's line: as the app ships), `names` (names
 *   and arguments only).
 */
export type EvalGrammarArm = "situation" | "full" | "none";
export type EvalPromptArm = "notes" | "names";

/** One request per item, as `coach::AskRequest` reads it (plus the item's id). */
export function askRequestFor(
  item: EvalItem,
  paths: readonly PathDoc[],
  opts: { generationId: number; deadlineMs: number; grammar: EvalGrammarArm; prompt?: EvalPromptArm },
): AskRequestJson {
  const catalogue = toolCatalogue(COACH_TOOLS);
  const facts = choiceFactsFor(item.situation, item.lang, paths);
  const possible: Record<string, boolean> = {};
  for (const name of facts.possible) possible[name] = true;
  return {
    id: item.id,
    generationId: opts.generationId,
    mode: "choice",
    prefix: choicePrefix(catalogue, EVAL_CARDS, { notes: opts.prompt !== "names" }),
    // The Paths the words could name (leg c3bp), as the app would compute them from the typed text.
    context: choiceContext({ ...facts, named: namedTitles(item.text, paths.map((p) => p.title), commandTableFor(item.lang)) }),
    question: item.text.trim(),
    ...(opts.grammar === "none" ? {} : { grammar: choiceGrammar(catalogue, EVAL_CARDS, opts.grammar === "situation" ? { possible } : undefined) }),
    deadlineMs: opts.deadlineMs,
  };
}

/**
 * The chain as the app would run it (`rules-first`: the typed-command router
 * and search answer, the model only where they said `none`), or the reverse
 * (`model-first`: the model's answer stands unless it said `none` or gave no
 * answer, then the rules). `usedModel` says whose answer it is, for the time.
 */
export type ChainOrder = "rules-first" | "model-first";
export function chainAnswer(order: ChainOrder, rules: EngineAnswer, model: EngineAnswer): { answer: EngineAnswer; usedModel: boolean } {
  if (order === "rules-first") return rules.kind === "none" ? { answer: model, usedModel: true } : { answer: rules, usedModel: false };
  return model.kind === "none" || model.kind === "noAnswer" ? { answer: rules, usedModel: false } : { answer: model, usedModel: true };
}

/** One outcome line the Rust bin writes. */
export type AskOutcomeJson = {
  id: string;
  status: string;
  text?: string;
  promptMs?: number;
  totalMs?: number;
  prefixCached?: boolean;
  error?: string;
};

export function modelAnswer(outcome: AskOutcomeJson): EngineAnswer {
  if (outcome.status !== "answered") {
    const status = (NO_ANSWER_STATUSES as readonly string[]).includes(outcome.status) ? (outcome.status as NoAnswerStatus) : "error";
    return { kind: "noAnswer", status, ...(outcome.error ? { detail: outcome.error } : {}) };
  }
  const parsed = parseChoice(outcome.text ?? "");
  if (!parsed) return { kind: "noAnswer", status: "unread", detail: outcome.text };
  if (parsed.kind === "call") return { kind: "call", call: { tool: parsed.tool, args: parsed.args } };
  if (parsed.kind === "card") return { kind: "card", card: parsed.card, args: parsed.args };
  if (parsed.answer === "which") return { kind: "which" };
  if (parsed.answer === "yours") return { kind: "yours" };
  return { kind: "none" };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type ItemScore = {
  id: string;
  lang: string;
  expect: string;
  got: string;
  /** Null when the item expects no call. */
  rightTool: boolean | null;
  rightArgs: boolean | null;
  /** It did, or proposed, something other than what was asked (TOOLS 3.5). "none" and "which" never are. */
  wrongAction: boolean;
  /** Null unless the item expects "which". */
  asked: boolean | null;
  /** The answer is the one expected (a call with the same effect, the same card, which, yours, none). */
  right: boolean;
  noAnswer: NoAnswerStatus | null;
  ms?: number;
  /** The model's outcome said its prefix was already decoded. */
  prefixCached?: boolean;
};

function argsEqual(a: ToolArgs, b: ToolArgs): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const x = a[k];
    const y = b[k];
    if (typeof x === "string" && typeof y === "string") {
      if (normalizeWords(x) !== normalizeWords(y)) return false;
    } else if (x !== y) return false;
  }
  return true;
}

const describeAnswer = (a: EngineAnswer): string => {
  switch (a.kind) {
    case "call":
      return `call ${a.call.tool} ${JSON.stringify(a.call.args)}`;
    case "card":
      return `card ${a.card}`;
    case "yours":
      return `yours${a.item ? ` ${a.item}` : ""}`;
    case "search":
      return `search ${a.step}`;
    case "noAnswer":
      return `noAnswer ${a.status}`;
    default:
      return a.kind;
  }
};

export function scoreItem(item: EvalItem, answer: EngineAnswer, paths: readonly PathDoc[], ms?: number, prefixCached?: boolean): ItemScore {
  const { expect } = item;
  const got = answer.kind === "call" ? effectOf(answer.call, item.situation, item.lang, paths) : null;
  // A call the runner turns into "Which one?" asked; one it refuses did nothing.
  const acted = got !== null && got.did !== null;
  const gotWhich = answer.kind === "which" || (got !== null && got.which);
  let rightTool: boolean | null = null;
  let rightArgs: boolean | null = null;
  let wrongAction = false;
  let right = false;
  switch (expect.kind) {
    case "call": {
      const want = effectOf({ tool: expect.tool, args: expect.args }, item.situation, item.lang, paths);
      rightTool = answer.kind === "call" && answer.call.tool === expect.tool;
      rightArgs = rightTool && answer.kind === "call" && (argsEqual(answer.call.args, expect.args) || (acted && got?.did === want.did));
      // The asked-for call written another way (a goal's capitals) is not another action.
      wrongAction = acted && !rightArgs && got?.did !== want.did;
      right = rightArgs;
      break;
    }
    case "card":
      wrongAction = acted;
      right = answer.kind === "card" && answer.card === expect.card;
      break;
    case "which":
      wrongAction = acted;
      right = gotWhich;
      break;
    case "yours":
      wrongAction = acted;
      right = answer.kind === "yours";
      break;
    case "none":
      wrongAction = acted;
      right = answer.kind === "none";
      break;
  }
  return {
    id: item.id,
    lang: item.lang,
    expect: expect.kind === "call" ? `call ${expect.tool} ${JSON.stringify(expect.args)}` : expect.kind === "card" ? `card ${expect.card}` : expect.kind,
    got: describeAnswer(answer),
    rightTool,
    rightArgs,
    wrongAction,
    asked: expect.kind === "which" ? gotWhich : null,
    right,
    noAnswer: answer.kind === "noAnswer" ? answer.status : null,
    ...(ms !== undefined ? { ms } : {}),
    ...(prefixCached !== undefined ? { prefixCached } : {}),
  };
}

export type Summary = {
  lang: string;
  n: number;
  calls: number;
  rightTool: number;
  rightArgs: number;
  wrongActions: number;
  which: number;
  asked: number;
  yours: number;
  yoursRight: number;
  none: number;
  noneRight: number;
  cards: number;
  cardsRight: number;
  right: number;
  noAnswer: number;
  /** No answers by status (only the statuses seen). */
  noAnswerBy: Partial<Record<NoAnswerStatus, number>>;
  /** Items whose outcome said the prefix was cached, of those that said either way. */
  prefixCached: number;
  prefixKnown: number;
  medianMs: number | null;
  p90Ms: number | null;
};

function quantile(sorted: number[], q: number): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
}

export function summarize(lang: string, items: readonly EvalItem[], scores: readonly ItemScore[]): Summary {
  const byId = new Map(items.map((i) => [i.id, i]));
  const count = (f: (s: ItemScore, i: EvalItem) => boolean) => scores.filter((s) => f(s, byId.get(s.id)!)).length;
  const times = scores.map((s) => s.ms).filter((x): x is number => typeof x === "number").sort((a, b) => a - b);
  const noAnswerBy: Partial<Record<NoAnswerStatus, number>> = {};
  for (const s of scores) if (s.noAnswer) noAnswerBy[s.noAnswer] = (noAnswerBy[s.noAnswer] ?? 0) + 1;
  return {
    lang,
    n: scores.length,
    calls: count((_, i) => i.expect.kind === "call"),
    rightTool: count((s) => s.rightTool === true),
    rightArgs: count((s) => s.rightArgs === true),
    wrongActions: count((s) => s.wrongAction),
    which: count((_, i) => i.expect.kind === "which"),
    asked: count((s) => s.asked === true),
    yours: count((_, i) => i.expect.kind === "yours"),
    yoursRight: count((s, i) => i.expect.kind === "yours" && s.right),
    none: count((_, i) => i.expect.kind === "none"),
    noneRight: count((s, i) => i.expect.kind === "none" && s.right),
    cards: count((_, i) => i.expect.kind === "card"),
    cardsRight: count((s, i) => i.expect.kind === "card" && s.right),
    right: count((s) => s.right),
    noAnswer: count((s) => s.noAnswer !== null),
    noAnswerBy,
    prefixCached: count((s) => s.prefixCached === true),
    prefixKnown: count((s) => s.prefixCached !== undefined),
    medianMs: quantile(times, 0.5),
    p90Ms: quantile(times, 0.9),
  };
}

const pct = (a: number, b: number) => (b === 0 ? "-" : `${Math.round((100 * a) / b)}%`);

/** The summary table, in Markdown. */
export function summaryMarkdown(title: string, rows: readonly Summary[], note: string): string {
  const head =
    "| lang | n | right | right tool | right args | wrong actions | asked (which) | yours | none | cards | no answer | median ms | p90 ms | prefix cached |\n" +
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|";
  const by = (r: Summary) => {
    const parts = Object.entries(r.noAnswerBy ?? {}).map(([k, v]) => `${k} ${v}`);
    return parts.length > 0 ? `${r.noAnswer} (${parts.join(", ")})` : `${r.noAnswer}`;
  };
  const body = rows.map(
    (r) =>
      `| ${r.lang} | ${r.n} | ${pct(r.right, r.n)} | ${r.rightTool}/${r.calls} (${pct(r.rightTool, r.calls)}) | ${r.rightArgs}/${r.calls} (${pct(r.rightArgs, r.calls)}) | ${r.wrongActions} (${pct(r.wrongActions, r.n)}) | ${r.asked}/${r.which} | ${r.yoursRight}/${r.yours} | ${r.noneRight}/${r.none} | ${r.cardsRight}/${r.cards} | ${by(r)} | ${r.medianMs ?? "-"} | ${r.p90Ms ?? "-"} | ${r.prefixKnown ? `${r.prefixCached}/${r.prefixKnown}` : "-"} |`,
  );
  return `# ${title}\n\n${note}\n\n${head}\n${body.join("\n")}\n`;
}

/** What an answer was, coarsely: the tool's name, or the kind. The key errors are grouped by. */
function answerKind(described: string): string {
  const [kind, name] = described.split(" ");
  return kind === "call" || kind === "card" || kind === "noAnswer" ? `${kind} ${name}` : kind;
}

export type CommonError = { expected: string; got: string; count: number; examples: Array<{ id: string; text: string; expect: string; got: string }> };

/**
 * The most common errors (leg c3b2m): wrong answers grouped by (what was
 * expected, what came back) at the tool or kind level, most frequent first,
 * each with up to `perGroup` plain examples (the sentence, the expected and
 * the chosen answer in full). Wrong actions come before harmless misses of
 * the same count.
 */
export function commonErrors(items: readonly EvalItem[], scores: readonly ItemScore[], top = 10, perGroup = 3): CommonError[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const groups = new Map<string, CommonError & { wrong: number }>();
  for (const s of scores) {
    if (s.right) continue;
    const expected = answerKind(s.expect);
    const got = answerKind(s.got);
    const key = `${expected} -> ${got}`;
    const g = groups.get(key) ?? { expected, got, count: 0, wrong: 0, examples: [] };
    g.count++;
    if (s.wrongAction) g.wrong++;
    if (g.examples.length < perGroup) g.examples.push({ id: s.id, text: byId.get(s.id)?.text ?? "", expect: s.expect, got: s.got });
    groups.set(key, g);
  }
  return [...groups.values()]
    .sort((a, b) => b.count - a.count || b.wrong - a.wrong || `${a.expected}${a.got}`.localeCompare(`${b.expected}${b.got}`))
    .slice(0, top)
    .map((g) => ({ expected: g.expected, got: g.got, count: g.count, examples: g.examples }));
}

/** `commonErrors` as Markdown. */
export function errorsMarkdown(title: string, errors: readonly CommonError[]): string {
  const lines = [`# ${title}: the most common errors`, ""];
  errors.forEach((e, i) => {
    lines.push(`${i + 1}. **expected ${e.expected}, chose ${e.got}** (${e.count})`);
    for (const x of e.examples) lines.push(`   - ${x.id} "${x.text}": expected \`${x.expect}\`, chose \`${x.got}\``);
  });
  return `${lines.join("\n")}\n`;
}

/** The never-list's items (for the harness's own checks). */
export const NEVER = NEVER_ITEMS;
