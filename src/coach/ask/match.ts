/**
 * Typed English to a fact card (DESIGN 5.3, engine 2; leg c2b1a).
 *
 * After the command router (`router.ts`, which answers commands) and only on
 * a clear match: a question about the player's own Take, in words this table
 * knows, that names exactly one shape. Anything else is `null`, and Ask goes
 * on to its next way of answering. A wrong card is worse than no card, so the
 * near-miss table in `match.test.ts` is the part that matters.
 *
 * English only. Other languages reach the cards by chip (and later through a
 * model that picks a card by name).
 *
 * Pure: no React, no store, no i18n.
 */
import type { ToolArgs } from "../tools/types";
import type { AskableMetric, CardShape } from "./cards";

export type CardCall = { tool: CardShape; args: ToolArgs };

/** Contractions written out, so a pattern needs one spelling. */
const CONTRACTIONS: ReadonlyArray<[RegExp, string]> = [
  [/\b(did|was|were|is|are|does|do|has|have|would|could|should)n'?t\b/g, "$1 not"],
  [/\bcan'?t\b/g, "can not"],
  [/\bwon'?t\b/g, "will not"],
  [/\bi'?m\b/g, "i am"],
  [/\bwhat'?s\b/g, "what is"],
  [/\bwhere'?s\b/g, "where is"],
  [/\bit'?s\b/g, "it is"],
];

/** The text as the patterns read it: lower case, straight apostrophes, contractions out, no punctuation but "?". */
export function normalizeQuestion(text: string): string {
  let s = text.normalize("NFKC").toLowerCase().replace(/[‘’ʼ]/g, "'");
  for (const [re, out] of CONTRACTIONS) s = s.replace(re, out);
  return s
    .replace(/[^a-z0-9?' ]+/g, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** A question: a "?", or a first word that asks. */
const QUESTION_START = /^(where|which|was|were|am|are|is|did|do|does|why|how|what|when|show me where|tell me where|tell me why)\b/;
/** Questions about practice in general, not about a Take: never a card. */
const GENERAL_START = /^(should|could|can|would|is it|is there|how (do|can|should) (i|you) (play|hold|practi[cs]e|learn|get))\b/;
/** About the player's own playing: a card is about a Take, never about music in general. */
const ABOUT_ME = /\b(i|me|my|mine|it|that|this|take|takes)\b/;

const SLIP =
  /\b(slip|slips|slipped|slipping|go wrong|went wrong|goes wrong|mess up|messed up|mess it up|trip up|tripped up|fall apart|fell apart|lose it|lost it|break down|broke down|miss|missed)\b/;
const WHERE = /\b(where|which bars?|what bars?|which part|what part)\b/;

const EARLY = /\b(rush|rushes|rushing|rushed|ahead|early|too soon)\b/;
const LATE = /\b(drag|drags|dragging|dragged|behind|late)\b/;
/** "Late" and "early" that are not about timing. */
const NOT_TIMING = /\b(too late to|late for|early for|early days|late today|early today|stay up late)\b/;

const WHY_NOT = /\bwhy\b.*\b(not|no)\b/;
const COUNTED = /\b(count|counts|counted|grade|graded|grades|score|scored|measure|measured|pass|passed|register|registered)\b/;
/** "Do you check / grade / measure / hear …?", about something the player plays. */
const CHECKS = /^(do|does|did|are|is|can|will)\b.*\b(check|checks|checked|checking|grade|grades|graded|grading|measure|measures|measured|measuring|hear|hears|heard|track|tracks|tracked|score|scores|scored|count|counts|counted)\b/;

/** What a player might think is graded, in the words a player types for it. */
const METRIC_WORDS: ReadonlyArray<[AskableMetric, RegExp]> = [
  ["pitch", /\b(pitch|pitches|wrong notes?|right notes?|in key)\b/],
  ["pickDirection", /\b(pick(ing)? direction|downstrokes?|upstrokes?|down strokes?|up strokes?|alternate picking)\b/],
  ["muting", /\b(mute|muting|muted)\b/],
  ["posture", /\bposture\b/],
  ["tension", /\b(tension|tense)\b/],
  ["handAttribution", /\bwhich hand\b/],
  ["fingering", /\b(fingering|which finger)\b/],
  ["tone", /\b(tone|touch)\b/],
  ["feel", /\b(feel|groove|sound good|sounds good)\b/],
];

function metricIn(s: string): AskableMetric | null {
  const found = METRIC_WORDS.filter(([, re]) => re.test(s)).map(([id]) => id);
  return found.length === 1 ? found[0] : null;
}

/**
 * The card a typed question asks for, or null when the match is not clear (no
 * shape, or two). Questions only: a statement ("I was late") is never a card.
 */
export function matchCard(text: string): CardCall | null {
  const s = normalizeQuestion(text);
  if (!s || s.length > 160) return null;
  const asks = s.endsWith("?") || QUESTION_START.test(s);
  if (!asks || GENERAL_START.test(s)) return null;
  const q = s.replace(/\?/g, "").trim();

  const found: CardCall[] = [];

  const timing = !NOT_TIMING.test(q);
  const early = timing && EARLY.test(q);
  const late = timing && LATE.test(q);

  if (WHERE.test(q) && (SLIP.test(q) || early || late) && ABOUT_ME.test(q)) found.push({ tool: "where_slipped", args: {} });

  if (ABOUT_ME.test(q)) {
    // "Where was I late?" is a place first: the where card says which way too.
    if ((early || late) && !WHERE.test(q)) {
      found.push({ tool: "early_or_late", args: early && late ? {} : { premise: early ? "early" : "late" } });
    }
  }

  const metric = metricIn(q);
  if (WHY_NOT.test(q) && COUNTED.test(q)) {
    found.push({ tool: "why_not_counted", args: metric ? { what: metric } : {} });
  } else if (metric && CHECKS.test(q)) {
    found.push({ tool: "why_not_counted", args: { what: metric } });
  }

  return found.length === 1 ? found[0] : null;
}
