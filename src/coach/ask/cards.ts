/**
 * Fact cards: the answers the app writes itself, from what it measured
 * (DESIGN 5.3 engine 2, 5.4; leg c2b1a).
 *
 * Pure code from a `CoachContext` to a `FactCard`: the sentences as `Line`s
 * (a locale key and the measured values that fill it) and where they come
 * from. Nothing here words a sentence or reaches into React; `cardAnswer`
 * turns a card into the existing blocks (`src/coach/blocks`) once a caller
 * hands it a way to word a line.
 *
 * The rules every card keeps (guardrails 1 to 3):
 *
 * - **Only measured facts.** A number in a card is a number the app measured
 *   (`TakeOutcome`, the Take's review, the stored Take). The note's own reading
 *   of the Take (`takeNote`) is reused, so a card never says something the
 *   note under it contradicts.
 * - **The app attaches the source**, never the text: "Measured · Take 2" for a
 *   card read off a Take, "Worked out by the app" for a rule ("I didn't measure
 *   that"). `cardAnswer` hands the source to `resolveCoachAnswer`, and Ask
 *   draws no text block that came out without one (`askCardBlocks`).
 * - **A premise that contradicts a measurement is answered first** (mock 15):
 *   asked about rushing, a Take that landed late says so before anything else.
 * - **Uncertainty by rule**: "I didn't measure that" for a Take not caught, a
 *   Take not graded, a metric the Exercise does not grade. Never a guess, and
 *   never a dead end: the line says why, and the chips stay.
 * - No cause claimed, no praise, and the threshold is "the pass mark".
 */
import { resolveCoachAnswer, type BlockSource, type ResolvedBlock } from "../blocks/resolve";
import { MAX_SENTENCE } from "../blocks/spec";
import type { CoachBlock } from "../blocks/types";
import type { CoachContext } from "../context";
import { takeLean } from "../rounds";
import { biasThresholdMs, takeNote, type TakeNote, type TakeReview } from "../takeNote";
import type { Line } from "../tools/types";
import type { Exercise } from "../../paths/format";
import { factsOf, leanOf, takesOf } from "../../session/progress";
import type { TakeOutcome, UngradedWhy } from "../../session/runner";
import { withVariant } from "../../session/take";
import type { PathTakeRow } from "../../ipc";

/** The question shapes this leg answers. c2b1b adds more by adding names here and entries in `intents.ts`. */
export type CardShape = "where_slipped" | "early_or_late" | "why_not_counted";

/** The way a player's question assumed the Take leaned ("am I rushing": early). */
export type Lean = "early" | "late";

/**
 * Things a player may ask "why didn't that count" about that are not a Take:
 * what an Exercise could grade, and what no Exercise grades (`NOT_GRADED`).
 * `pitch` is graded where the Exercise's pass marks check the notes.
 */
export const ASKABLE_METRICS = [
  "pitch",
  "pickDirection",
  "muting",
  "posture",
  "tension",
  "handAttribution",
  "fingering",
  "tone",
  "feel",
] as const;
export type AskableMetric = (typeof ASKABLE_METRICS)[number];

/** The answer to one question: its sentences, in order, and where they come from. */
export type FactCard = {
  shape: CardShape;
  /** The sentences, in order; the first answers the premise when there is one. */
  lines: readonly Line[];
  /** Attached by the app. A card the app read off a Take is `measured`; a rule's answer is `app`. */
  source: BlockSource;
  /** It says "I didn't measure that" (guardrail 3). */
  uncertain?: true;
  /** Its first line answers a premise the measurement contradicts (mock 15). */
  premise?: true;
};

/** Why there is no card here: said as one line, never as silence. */
export type NoCard = { line: Line };

function line(key: string, values: Record<string, string | number> = {}): Line {
  return { key, values };
}

// ---------------------------------------------------------------------------
// What the cards read
// ---------------------------------------------------------------------------

/** The player chose to play without grading (or the Session is ungraded): no card about quality. */
export function ungradedPlayer(ctx: CoachContext): boolean {
  return ctx.grading === "off" || (ctx.run?.ungraded ?? null) !== null;
}

/** The last Take, when it is a Take of the Exercise on screen (its note can be read again). */
export function lastTakeHere(ctx: CoachContext): { outcome: TakeOutcome; exercise: Exercise } | null {
  const outcome = ctx.lastTake;
  const exercise = ctx.exercise;
  if (!outcome || !exercise || outcome.exerciseId !== exercise.id) return null;
  return { outcome, exercise: withVariant(exercise, ctx.variantSeed ?? null) };
}

function storedRow(ctx: CoachContext, outcome: TakeOutcome): PathTakeRow | null {
  if (!outcome.takeId) return null;
  return ctx.progress.takes.find((row) => row.id === outcome.takeId) ?? null;
}

/**
 * The note the result screen drew for this Take, computed again from the same
 * inputs (`takeNote`): this Exercise's earlier Takes, newest first, without it.
 */
export function noteOf(ctx: CoachContext): TakeNote | null {
  const here = lastTakeHere(ctx);
  if (!here) return null;
  const { outcome, exercise } = here;
  const row = storedRow(ctx, outcome);
  const pathId = ctx.path?.id ?? row?.pathId ?? null;
  const earlier = pathId
    ? takesOf(ctx.progress, pathId, outcome.exerciseId).filter((t) => t.id !== outcome.takeId)
    : [];
  const review = (ctx.review ?? null) as TakeReview | null;
  return takeNote(outcome, review, earlier, exercise, { variantSeed: ctx.variantSeed ?? null });
}

/** The lean of each pattern bar, ms (positive late), from the stored Take or else its review. */
function leanOfTake(ctx: CoachContext, outcome: TakeOutcome, exercise: Exercise): Array<number | null> | null {
  const row = storedRow(ctx, outcome);
  const stored = row ? leanOf(row) : null;
  if (stored) return stored;
  return takeLean((ctx.review ?? null) as TakeReview | null, Math.max(1, exercise.bars));
}

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** A note line's values, with the pitch name the direction lines say ("The open Bs"). */
function withNoteName(l: Line): Line {
  const midi = l.values.midi;
  if (typeof midi !== "number") return l;
  const pc = ((Math.round(midi) % 12) + 12) % 12;
  return { key: l.key, values: { ...l.values, note: PITCH_NAMES[pc] } };
}

/** Where, as the note says it: every bar of the tune on the same rounds is "the whole tune". */
function placeOf(note: TakeNote): Line | null {
  const { place, placeLine } = note;
  if (!place || !placeLine) return null;
  const tuneBars = note.strip?.patternBars ?? 0;
  if (place.shape === "bars" && tuneBars > 1 && place.patternBars.length >= tuneBars) {
    return note.verdict === "passed"
      ? line("session.note.place.caught.all", { count: place.slipped, of: place.of })
      : line("session.note.place.slipped.all", { count: place.slipped, of: place.of });
  }
  return placeLine;
}

function measured(outcome: TakeOutcome): BlockSource {
  return { kind: "measured", take: outcome.takeNumber };
}

const APP: BlockSource = { kind: "app" };

/** The Take was not heard, not long enough or not graded: there is nothing measured to read. */
function unmeasuredTake(shape: CardShape, outcome: TakeOutcome, note: TakeNote): FactCard | null {
  const take = outcome.takeNumber;
  if (note.kind === "ungraded") {
    return { shape, lines: [ungradedLine(outcome.ungraded, take)], source: APP, uncertain: true };
  }
  if (note.kind === "notCaught") {
    const { heard, expected } = outcome.measures;
    const lines = [line("ask.card.count.notCaught", { take, heard, expected })];
    if (note.hint) lines.push(note.hint);
    return { shape, lines, source: APP, uncertain: true };
  }
  if (note.kind === "tooShort") {
    const bars = outcome.measures.barsPlayed;
    return {
      shape,
      lines: [shape === "why_not_counted" ? line("ask.card.count.tooShort", { take, bars }) : line("ask.card.tooShort", { take, bars })],
      source: measured(outcome),
    };
  }
  return null;
}

function ungradedLine(why: UngradedWhy | undefined, take: number): Line {
  switch (why) {
    case "eyes":
      return line("ask.card.count.ungraded.eyes", { take });
    case "chosen":
      return line("ask.card.count.ungraded.chosen", { take });
    case "inputOff":
      return line("ask.card.count.ungraded.inputOff", { take });
    default:
      return line("ask.card.count.ungraded.gradingOff", { take });
  }
}

// ---------------------------------------------------------------------------
// The three cards
// ---------------------------------------------------------------------------

/** "Where did it slip?": the place the note named, last Take's count there, and which way it leaned. */
export function whereSlipped(ctx: CoachContext): FactCard | NoCard {
  const here = lastTakeHere(ctx);
  const note = noteOf(ctx);
  if (!here || !note) return noTake();
  const { outcome } = here;
  const shape: CardShape = "where_slipped";
  const unmeasured = unmeasuredTake(shape, outcome, note);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const where = placeOf(note);
  if (where) {
    const lines: Line[] = [where];
    if (note.lastTakeLine) lines.push(note.lastTakeLine);
    if (note.directionLine) lines.push(withNoteName(note.directionLine));
    return { shape, lines, source: measured(outcome) };
  }
  // No bar-by-bar reading of this Take at all: say so, never guess.
  if (!note.strip) return { shape, lines: [line("ask.card.slip.noBars", { take })], source: APP, uncertain: true };
  return { shape, lines: [line("ask.card.slip.none", { take })], source: measured(outcome) };
}

/** At most this many bars are named one by one. */
export const MAX_LEAN_BARS = 4;

/**
 * "Was I early or late?" (the lean, by bars). `premise` is the way the
 * question assumed; when the Take says otherwise, that is the first line.
 */
export function earlyOrLate(ctx: CoachContext, premise: Lean | null = null): FactCard | NoCard {
  const here = lastTakeHere(ctx);
  const note = noteOf(ctx);
  if (!here || !note) return noTake();
  const { outcome, exercise } = here;
  const shape: CardShape = "early_or_late";
  const unmeasured = unmeasuredTake(shape, outcome, note);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const threshold = Math.round(biasThresholdMs(outcome.bpm));
  const lean = leanOfTake(ctx, outcome, exercise);
  const leaning = (lean ?? [])
    .map((ms, i) => ({ bar: i + 1, ms }))
    .filter((b): b is { bar: number; ms: number } => b.ms !== null && Math.abs(b.ms) >= threshold);

  if (!note.direction && !lean) {
    return { shape, lines: [line("ask.card.lean.notMeasured", { take })], source: APP, uncertain: true };
  }

  // The way the Take leaned, as one word: the note's reading where it named a
  // place, else every leaning bar the same way, else none.
  const ways = new Set(leaning.map((b) => (b.ms > 0 ? "late" : "early")));
  const way: Lean | null = note.direction?.way ?? (ways.size === 1 ? ([...ways][0] as Lean) : null);

  const lines: Line[] = [];
  let contradicted = false;
  if (premise && way && way !== premise) {
    lines.push(way === "late" ? line("ask.card.lean.premise.late", { take }) : line("ask.card.lean.premise.early", { take }));
    contradicted = true;
  } else if (premise && !way && leaning.length === 0) {
    lines.push(
      premise === "early"
        ? line("ask.card.lean.premiseNone.early", { take, ms: threshold })
        : line("ask.card.lean.premiseNone.late", { take, ms: threshold }),
    );
    contradicted = true;
  }

  const where = note.direction ? placeOf(note) : null;
  if (where && note.directionLine) lines.push(where, withNoteName(note.directionLine));
  for (const b of leaning.slice(0, MAX_LEAN_BARS)) {
    const ms = Math.abs(b.ms);
    lines.push(b.ms > 0 ? line("ask.card.lean.bar.late", { bar: b.bar, ms }) : line("ask.card.lean.bar.early", { bar: b.bar, ms }));
  }
  // Nothing leaned past the threshold, and no premise to answer: say that.
  if (lines.length === 0) lines.push(line("ask.card.lean.none", { take, ms: threshold }));
  return { shape, lines, source: measured(outcome), ...(contradicted ? { premise: true as const } : {}) };
}

/** Which "not graded" sentence answers a metric, as a literal key each (the locale coverage reads them). */
const NOT_MEASURED: Readonly<Record<AskableMetric, string>> = {
  pitch: "ask.card.notMeasured.pitch",
  pickDirection: "ask.card.notMeasured.pickDirection",
  muting: "ask.card.notMeasured.muting",
  posture: "ask.card.notMeasured.posture",
  tension: "ask.card.notMeasured.tension",
  handAttribution: "ask.card.notMeasured.handAttribution",
  fingering: "ask.card.notMeasured.fingering",
  tone: "ask.card.notMeasured.tone",
  feel: "ask.card.notMeasured.feel",
};

/** The Exercise checks the notes' pitch: one of its pass marks is on the right notes. */
function gradesPitch(exercise: Exercise): boolean {
  return exercise.passBars.some((bar) => bar.metric === "noteIdentity") && !exercise.notGraded.includes("notesWritten");
}

/**
 * "Why didn't that count?": about the last Take (`what` = "take"), or about
 * something the player thought was graded (a metric).
 */
export function whyNotCounted(ctx: CoachContext, what: "take" | AskableMetric = "take"): FactCard | NoCard {
  const shape: CardShape = "why_not_counted";
  if (what !== "take") {
    const exercise = ctx.exercise;
    if (!exercise) return noTake();
    if (what === "pitch" && gradesPitch(exercise)) {
      const here = lastTakeHere(ctx);
      const note = here ? noteOf(ctx) : null;
      const right = note?.facts.find((f) => f.kind === "rightNotes" || f.kind === "notesUnchecked");
      const lines: Line[] = [line("ask.card.count.pitchGraded")];
      if (here && right) lines.push(right.line);
      return { shape, lines, source: here && right ? measured(here.outcome) : APP };
    }
    return { shape, lines: [line(NOT_MEASURED[what])], source: APP, uncertain: true };
  }

  const here = lastTakeHere(ctx);
  const note = noteOf(ctx);
  if (!here || !note) return noTake();
  const { outcome } = here;
  const unmeasured = unmeasuredTake(shape, outcome, note);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const row = storedRow(ctx, outcome);
  const unfair = row ? factsOf(row).fair === "no" : false;
  const lines: Line[] = [];
  // It did count: that answers the question's premise first.
  if (note.verdict === "passed") lines.push(line("ask.card.count.passed", { take, bpm: outcome.bpm }));
  else {
    lines.push(line("ask.card.count.below", { take, bpm: outcome.bpm }));
    lines.push(note.lead);
  }
  if (unfair) lines.push(line("ask.card.count.unfair"));
  return { shape, lines, source: measured(outcome), premise: true };
}

function noTake(): NoCard {
  return { line: line("ask.card.notNow.noTake") };
}

/** The card's answer when the player is ungraded: no card about quality, said as one line. */
export const UNGRADED_LINE: Line = line("ask.card.notNow.ungraded");

export function isCard(x: FactCard | NoCard): x is FactCard {
  return "shape" in x;
}

// ---------------------------------------------------------------------------
// As blocks
// ---------------------------------------------------------------------------

/**
 * The card as the existing blocks: its sentences as a text block (one source
 * line under them, as in mocks 08 and 15), resolved with the source the app
 * attached. `word` puts a line in the player's language. A text block holds
 * at most `MAX_SENTENCE` characters (the catalogue's rule, which the resolver
 * enforces by dropping it), so a long card is cut between sentences into as
 * many blocks as it needs, never inside one.
 */
export function cardAnswer(card: FactCard, word: (l: Line) => string): ResolvedBlock[] {
  const sentences = card.lines.map((l) => word(l).trim()).filter((s) => s.length > 0);
  const texts: string[] = [];
  for (const s of sentences) {
    const last = texts.length - 1;
    if (last >= 0 && texts[last].length + 1 + s.length <= MAX_SENTENCE) texts[last] = `${texts[last]} ${s}`;
    else texts.push(s.length <= MAX_SENTENCE ? s : `${s.slice(0, MAX_SENTENCE - 1)}…`);
  }
  if (texts.length === 0) return [];
  const blocks: CoachBlock[] = texts.map((text) => ({ type: "text", text }));
  return resolveCoachAnswer({ blocks }, {}, { source: card.source }).blocks;
}

/**
 * What Ask draws of an answer: a text block with no source is not rendered
 * (guardrail 2). Other blocks (a drawing, a button) carry no source line of
 * their own and pass.
 */
export function askCardBlocks(blocks: readonly ResolvedBlock[]): ResolvedBlock[] {
  return blocks.filter((b) => b.type !== "text" || b.source !== undefined);
}
