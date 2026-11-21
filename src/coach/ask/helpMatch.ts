/**
 * Typed English to the help set, and the tuning question (leg c2cb; DESIGN
 * 5.3). Kept out of `help.ts` so the `explain_screen` tool does not load the
 * matchers.
 *
 * English only, as the fact cards match (`match.ts`): every language reaches
 * the help set by `explain_screen` (its chip, or typed through the command
 * router). Only a clear question that names exactly one screen or one word is
 * an answer; anything else is null and Ask goes on to search.
 *
 * Pure: no React, no store, no i18n.
 */
import { HELP, type HelpId } from "./help";
import { normalizeQuestion } from "./match";

/** Words before or after the question that change nothing about it. */
const LEAD = /^(so|ok|okay|hey|hi|um|uh|and|but|sorry|please|quick question|coach|yames)\s+/;
const TAIL = /\s+(in yames|in this app|in the app|on yames|here|exactly|again|please|then|for me|anyway)$/;
const ARTICLE = "(a |an |the |my |this |that |these |those |your )?";
const SUFFIX = "( screen| page| tab| view| section| panel| menu)";

function strip(text: string): string {
  let s = normalizeQuestion(text).replace(/\?/g, " ").replace(/\s+/g, " ").trim();
  for (let i = 0; i < 3; i += 1) {
    const before = s;
    s = s.replace(LEAD, "").replace(TAIL, "").trim();
    if (s === before) break;
  }
  return s;
}

/** The question shapes that ask what a word means. `w` is the entry's names. The last is the bare word. */
function wordShapes(w: string): RegExp[] {
  const W = `(${w})`;
  return [
    new RegExp(`^(what|who) (is|are) ${ARTICLE}${W}( for| mean| about)?$`),
    new RegExp(`^what (does|do) ${ARTICLE}${W} (mean|do)$`),
    new RegExp(`^(what is )?(the )?(meaning|definition) of ${ARTICLE}${W}$`),
    new RegExp(`^(define|explain) ${ARTICLE}${W}$`),
    new RegExp(`^what do you mean by ${ARTICLE}${W}$`),
    new RegExp(`^what does it mean (that |when |if )?([a-z]+ ){0,4}(is |are |was |gets |got |goes |went )${W}$`),
    new RegExp(`^how (does|do) ${ARTICLE}${W} work$`),
    new RegExp(`^${W}$`),
  ];
}

/** The question shapes that ask what a screen is for. `s` is the entry's names. */
function screenShapes(s: string, suffixNeeded: boolean): RegExp[] {
  const S = `(${s})${SUFFIX}${suffixNeeded ? "" : "?"}`;
  const A = "(a |an |the |this )?";
  return [
    new RegExp(`^what (is|are) ${A}${S}( for| about)?$`),
    new RegExp(`^what (does|do|can) ${A}${S} do$`),
    new RegExp(`^how (does|do) ${A}${S} work$`),
    new RegExp(`^what can i do (on|in|with) ${A}${S}$`),
    new RegExp(`^(how do i use|how to use|how do you use|explain|help with|help on) ${A}${S}$`),
  ];
}

type Shaped = { id: HelpId; shapes: RegExp[]; word: boolean };

/** Built once. */
const SHAPED: readonly Shaped[] = HELP.map((e) =>
  e.id.startsWith("word.")
    ? { id: e.id, shapes: wordShapes(e.names), word: true }
    : { id: e.id, shapes: screenShapes(e.names, e.suffixNeeded === true), word: false },
);

/**
 * Typed English to one help entry, or null. Only a clear question that names
 * exactly one entry: two entries matching is null (a wrong entry is worse than
 * none; search or the plain statement takes it). A word alone is a question
 * only with its "?" ("rung?").
 */
export function matchHelp(text: string): HelpId | null {
  const asked = /[?？]/.test(text);
  const s = strip(text);
  if (!s || s.split(" ").length > 12) return null;
  const found = new Set<HelpId>();
  for (const entry of SHAPED) {
    const last = entry.shapes.length - 1;
    if (entry.shapes.some((re, i) => (entry.word && i === last && !asked ? false : re.test(s)))) found.add(entry.id);
  }
  return found.size === 1 ? [...found][0] : null;
}

/**
 * A typed English question about tuning: the guitar's or a string's, a tuner,
 * a named tuning. "Tunes on one string" (a Step's title) and "what tune is
 * this" are not.
 */
const TUNING = new RegExp(
  [
    "\\b(in tune|out of tune|tuning|tunings|tuner|tuners|retune|retuning|detune|detuned|re tune)\\b",
    "\\btune (my|the|your|a|this|that|each|every|all|it|up|down|to)\\b",
    "\\b(how|should|can|do|does|did) (do |can |should )?(i|you|we) tune\\b",
    "\\btuned (to|down|up|in|correctly|right|properly)\\b",
    "\\b(drop d|drop c|open g tuning|dadgad|half step down|whole step down|eb standard|e flat standard)\\b",
    "\\b(string|strings|guitar|bass) (is|are|sounds?|sound) (sharp|flat)\\b",
  ].join("|"),
);

export function asksAboutTuning(text: string): boolean {
  return TUNING.test(normalizeQuestion(text));
}
