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
/**
 * About the player's own playing: a card is about a Take, never about music in
 * general. "It", "that" and "this" count only as the subject of the question
 * ("where did it slip", "was that late"), not in "what does it mean to rush"
 * (review c2b1a F6).
 */
const ABOUT_ME = /\b(i|me|my|mine|take|takes)\b|\b(was|were|is|did|does|do|has|had) (it|that|this)\b|^(which|what) bars? (was|were|went|got|did)\b/;
/**
 * Something named that is not the last Take as a whole: a part of a song, a
 * warm-up, a Step or a Path. A card reads only the last Take, so a question
 * about one of these is not its question (review c2b1c M3).
 */
const NAMED_OTHER =
  /\b(warm ?ups?|steps?|paths?|exercises?|sessions?|songs?|riffs?|solos?|intros?|outros?|chorus|verses?|scales?|licks?|drills?|jams?|levels?|lessons?|course)\b/;
/** A question about what a word means, not about a Take. */
const MEANING = /\b(mean|means|meaning|define|definition|difference between)\b/;
/** Another Take than the last one, which is the only one a card reads. */
const OTHER_TAKE =
  /\b(takes? (\d+|one|two|three|four|five|six|seven|eight|nine|ten)|first take|(previous|earlier|other|second|third) takes?|take before|the one before|yesterday|last (session|week|time)|this morning|earlier today|before that)\b/;
/** "Late" or "behind" about something else than the notes: the metronome, a schedule, a Path. */
const NOT_MY_TIMING =
  /\b(metronome|click|count ?in|backing|drums?|band|app) (start|starts|started|come|comes|came|was|is|play|plays|played|run|runs|ran)\b|\b(ahead|behind) (of )?(schedule|time|plan)\b|\b(ahead|behind) (on|with|in) (my|the)\b|^(is|was|are|were|does|did) (my|the) (click|metronome|input|audio|recording|sound)\b|\b(ahead of|behind) (everyone|everybody|others|the others|other people|the rest)\b|\bsound(s|ed)? (late|early|behind|ahead|delayed)\b|\b(latency|delay|delayed)\b/;

const SLIP =
  /\b(slip|slips|slipped|slipping|go wrong|went wrong|goes wrong|mess up|messed up|mess it up|trip up|tripped up|fall apart|fell apart|lose it|lost it|break down|broke down|miss|missed)\b|^(which|what) bars? (was|were) off\b/;
const WHERE = /\b(where|which bars?|what bars?|which part|what part)\b/;

const EARLY = /\b(rush|rushes|rushing|rushed|ahead|early|too soon)\b/;
const LATE = /\b(drag|drags|dragging|dragged|behind|late)\b/;
/** "Late" and "early" that are not about timing. */
const NOT_TIMING = /\b(too late to|late for|early for|early days|late today|early today|stay up late)\b/;

const WHY_NOT = /\b(why|how come)\b.*\b(not|no)\b/;
/**
 * The subject of "why didn't … count": the Take ("it", "that", "my take", "I"
 * in "why didn't I pass"). Any other subject is a card only when it is a metric
 * this table knows ("my downstrokes"); "my bends", "there" ("why is there no
 * count-in"), "this Step" are not. "How come that didn't count?" puts the
 * subject before the verb (review c2b1c M3).
 */
const TAKE_SUBJECT = "(i|it|that|this|((my|the|that|this) (last )?takes?))";
const WHY_ABOUT_TAKE = new RegExp(
  `\\bwhy (did|does|do|was|were|is|has|have|had|would|will|could)( not)? ${TAKE_SUBJECT}\\b|\\bhow come ${TAKE_SUBJECT} (did|does|do|was|were|is|has|have|had|would|will|could)\\b`,
);
/** The count-in is not a count. */
const COUNT_IN = /\bcount ?in\b/;
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

// Leg c2b1b: the four cards about the Take's history and the pass mark.

/** "What changed since the last Take?": this Take beside the one before. */
const CHANGED =
  /\bwhat (has |have )?changed\b|\bwhat (is|was) different\b|\b(better|worse|different) than (my |the |that )?(last|previous|earlier) (take|one|time|go)\b|\bcompared? (to|with) (my |the )?(last|previous|earlier) (take|one|time|go)\b|\bdid (i|it) (get|do) (better|worse)\b/;
/** The words that name the Take a "what changed" question compares with: allowed past `OTHER_TAKE`. */
const BEFORE_THIS =
  /\b(since|than|to|with|from) (my |the |that )?(last|previous|earlier) (take|one|time|go)\b|\b(the )?(take|one) before( (it|this|that))?\b/g;
/** "What changed" about the app, not about playing. */
const CHANGED_OTHER = /\b(app|version|update|release|settings|setting|screen|menu)\b/;

/** "Am I improving?": the measured Takes of this Exercise. */
const IMPROVING =
  /\b(am|are) (i|we) (improving|getting better|progressing|making progress)\b|\b(have|has) (i|it|my \w+) (improved|got better|gotten better|progressed)\b|\b(is|are) (it|my \w+) (improving|getting better)\b|\bhow (am i|is it) (doing|going|progressing)\b|\bhow is my progress\b/;
/** Beyond this Exercise: not this card's question. */
const IMPROVING_OTHER = /\b(overall|in general|generally|at guitar|on guitar|as a (guitarist|player|musician)|at all)\b/;

/** "What is the score made of?": the Exercise's pass mark, check by check. */
const MADE_OF =
  /\b(score|grade|grading|pass mark|result)\b.*\b(made of|made up of|based on|consists? of|worked out|calculated|computed)\b|\bhow (is|are|do you|does the app|does it) (it |this |my takes? |takes? |the take )?(graded|scored|marked|grade|score)\b|\bwhat (is|gets|do you|does the app|does it|does the pass mark) (graded|measured|checked|grade|measure|check)\b|\bwhat (does|do) (the |this )?(grade|score|pass mark) (check|measure|look at)\b/;

/** "How far is the pass mark?": the last Take's checks against it. */
const DISTANCE =
  /\bhow (far|close|much) (am i|was i|is it|was it|was that|is that)? ?(from|to|off|away from|short of|below|under) (the )?pass(ing| mark)?\b|\bhow (far|close) (is|was) (the )?pass mark\b|\bhow (far|close) (off|away) (am i|was i|was it|is it)\b|\bhow (much|far) (more|better|faster) (do i need|did i need)\b|\bwhat (do|did) i (need|miss) to pass\b|\b(did i|was i|was it) (nearly|almost|close to) pass(ing)?\b|\bby how much did i (miss|fail)\b/;

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
  // "What changed since my last Take?" names the Take it compares with; any
  // other Take named past that ("since take 3", "since yesterday") is not
  // this card's question (c2b1b).
  const changed = CHANGED.test(q) && !CHANGED_OTHER.test(q) && !NAMED_OTHER.test(q);
  const rest = changed ? q.replace(BEFORE_THIS, " ") : q;
  // A card reads the last Take, as it is: not another Take, not a definition,
  // not the count-in (review c2b1a F6).
  if (OTHER_TAKE.test(rest) || MEANING.test(q) || COUNT_IN.test(q)) return null;

  const found: CardCall[] = [];
  if (changed) found.push({ tool: "what_changed", args: {} });
  // "Am I improving on this Exercise?": the Exercise is the card's own subject.
  const onThis = q.replace(/\b(on|at|with|in) (this|the) exercise\b/g, " ");
  if (IMPROVING.test(q) && !IMPROVING_OTHER.test(q) && !NAMED_OTHER.test(onThis)) found.push({ tool: "improving", args: {} });
  if (DISTANCE.test(q) && !NAMED_OTHER.test(q)) found.push({ tool: "pass_mark_distance", args: {} });
  // The cards that read the last Take whole; a metric question reads the Exercise.
  const wholeTake = !NAMED_OTHER.test(q);

  const timing = !NOT_TIMING.test(q) && !NOT_MY_TIMING.test(q);
  const early = timing && EARLY.test(q);
  const late = timing && LATE.test(q);

  if (wholeTake && WHERE.test(q) && (SLIP.test(q) || early || late) && ABOUT_ME.test(q)) found.push({ tool: "where_slipped", args: {} });

  if (wholeTake && ABOUT_ME.test(q)) {
    // "Where was I late?" is a place first: the where card says which way too.
    if ((early || late) && !WHERE.test(q)) {
      found.push({ tool: "early_or_late", args: early && late ? {} : { premise: early ? "early" : "late" } });
    }
  }

  const metric = metricIn(q);
  if (WHY_NOT.test(q) && COUNTED.test(q)) {
    if (metric) found.push({ tool: "why_not_counted", args: { what: metric } });
    else if (wholeTake && WHY_ABOUT_TAKE.test(q)) found.push({ tool: "why_not_counted", args: {} });
  } else if (metric && CHECKS.test(q)) {
    found.push({ tool: "why_not_counted", args: { what: metric } });
  }
  // What the pass mark checks, in general: a metric named is the why card's question.
  if (!metric && !WHY_NOT.test(q) && MADE_OF.test(q) && !NAMED_OTHER.test(onThis)) found.push({ tool: "score_made_of", args: {} });

  return found.length === 1 ? found[0] : null;
}
