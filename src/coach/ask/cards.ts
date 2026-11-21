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
import { biasThresholdMs, heldStretchUncrossed, takeNote, type TakeNote, type TakeReview } from "../takeNote";
import type { Line } from "../tools/types";
import type { Exercise } from "../../paths/format";
import { NOT_GRADED } from "../../paths/metrics";
import { displayBar, displayValue, metricKey } from "../../session/coachWords";
import { CLEAN_TEMPO_MIN_BARS } from "../../session/grade";
import { factsOf, leanOf, takesOf } from "../../session/progress";
import type { TakeOutcome, UngradedWhy } from "../../session/runner";
import { withVariant } from "../../session/take";
import type { PathTakeRow } from "../../ipc";

/** The question shapes the cards answer: a name here, a function below, an entry in `intents.ts`. */
export type CardShape =
  | "where_slipped"
  | "early_or_late"
  | "why_not_counted"
  | "what_changed"
  | "improving"
  | "score_made_of"
  | "pass_mark_distance";

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
  if (!variantKnown(ctx, outcome, exercise)) return null;
  return { outcome, exercise: withVariant(exercise, seedOfTake(ctx, outcome)) };
}

/**
 * The notes the Take was played on can be known (review c2b1a F8, c2b1c): its
 * stored row keeps its variant; an Exercise with no variants has one set of
 * notes; and on the Take's own result screen the step's variant is still the
 * Take's (it is changed only from the ready screen, `runner.ts` `setVariant`).
 * Otherwise (a Take not yet saved, read from the ready screen after it) the
 * variant may have changed since: no card, rather than a card about other notes.
 */
function variantKnown(ctx: CoachContext, outcome: TakeOutcome, exercise: Exercise): boolean {
  if (storedRow(ctx, outcome)) return true;
  if (!exercise.variation?.variants?.length) return true;
  return ctx.run?.phase === "result";
}

function storedRow(ctx: CoachContext, outcome: TakeOutcome): PathTakeRow | null {
  if (!outcome.takeId) return null;
  return ctx.progress.takes.find((row) => row.id === outcome.takeId) ?? null;
}

/**
 * The variant the Take was played on: its stored row's, when it is stored
 * (the step's variant may have changed on the ready screen since, review
 * c2b1a F8), else the step's now (the outcome carries no seed).
 */
function seedOfTake(ctx: CoachContext, outcome: TakeOutcome): number | null {
  const row = storedRow(ctx, outcome);
  if (row) return row.variantSeed ?? null;
  return ctx.variantSeed ?? null;
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
  return takeNote(outcome, review, earlier, exercise, { variantSeed: seedOfTake(ctx, outcome) });
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
function unmeasuredTake(ctx: CoachContext, shape: CardShape, outcome: TakeOutcome, note: TakeNote, exercise: Exercise): FactCard | null {
  const take = outcome.takeNumber;
  if (note.kind === "ungraded") {
    return { shape, lines: [ungradedLine(ctx, outcome, exercise)], source: APP, uncertain: true };
  }
  if (note.kind === "notCaught") {
    // The scorer's own reason, each said as only that (review c2b1c H1). The
    // note's hint is not reused: it hedges a cause or advises (L2), and the
    // reason sentence already says what was measured.
    return { shape, lines: [notCaughtLine(outcome)], source: APP, uncertain: true };
  }
  if (note.kind === "tooShort") {
    const bars = outcome.measures.barsPlayed;
    return {
      shape,
      // `count` picks the plural ("after 1 bar", review c2b1a F9).
      lines: [
        shape === "why_not_counted"
          ? line("ask.card.count.tooShort", { take, bars, count: bars })
          : line("ask.card.tooShort", { take, bars, count: bars }),
      ],
      source: measured(outcome),
    };
  }
  return null;
}

/**
 * Why the scorer did not grade a Take (`score.rs` `didnt_catch_enough`), as
 * one literal key per reason. A reason this table does not know, or none:
 * "I couldn't grade Take N." and nothing more.
 */
function notCaughtLine(outcome: TakeOutcome): Line {
  const take = outcome.takeNumber;
  const { heard, expected } = outcome.measures;
  switch (outcome.measures.noCatchReason) {
    case "nothingHeard":
      return line("ask.card.count.notCaught.nothingHeard", { take });
    case "tooFewHeard":
      return line("ask.card.count.notCaught.tooFewHeard", { take, heard, expected });
    case "tooManyExtras":
      return line("ask.card.count.notCaught.tooManyExtras", { take });
    case "lowConfidence":
      return line("ask.card.count.notCaught.lowConfidence", { take });
    default:
      return line("ask.card.count.notCaught.unknown", { take });
  }
}

/**
 * What decided a Take below the pass mark, said as the measurement and the
 * pass mark only. The note's own sentence (`takeLine`) is not reused: some of
 * its forms advise ("watch the frets", "keep the idle strings quiet") or read
 * a cause into the number (review c2b1c L2). No deciding check that was
 * missed: the plain "below the pass mark", never a made-up figure.
 */
function belowLine(outcome: TakeOutcome, note: TakeNote): Line {
  const take = outcome.takeNumber;
  const { heard, expected } = outcome.measures;
  const check = note.deciding;
  const value = check ? displayValue(check) : null;
  const mark = check ? displayBar(check) : null;
  if (!check || check.met !== false || value === null || mark === null) {
    return line("ask.card.below.plain", { take, bpm: outcome.bpm });
  }
  switch (metricKey(check.metric)) {
    case "heard":
      return line("ask.card.below.heard", { take, heard, expected, bar: mark });
    case "extras":
      return line("ask.card.below.extras", { take, bar: mark });
    case "accents":
      return line("ask.card.below.accents", { take, value, bar: mark });
    case "notes":
      return line("ask.card.below.notes", { take, value, bar: mark });
    default:
      return heard < expected
        ? line("ask.card.below.evenSome", { take, value, bar: mark, heard, expected })
        : line("ask.card.below.even", { take, value, bar: mark });
  }
}

/** Which way the notes at the place leaned, relative to the rest of the Take (the note's own line says "landed"). */
function directionCardLine(note: TakeNote): Line | null {
  const d = note.directionLine;
  if (!d) return null;
  const suffix = d.key.slice("session.note.direction.".length);
  const named = withNoteName(d);
  return { key: `ask.card.direction.${suffix}`, values: named.values };
}

/**
 * Why a Take was not graded. The player's own reason when they gave one
 * (`outcome.ungraded`); grading switched off only when it is; otherwise the
 * grade itself said "ungraded", which is the Exercise (or this tempo of it)
 * being one the player checks themselves (`gradeTake`): never "grading is
 * off" while it is on (review c2b1a F1).
 */
function ungradedLine(ctx: CoachContext, outcome: TakeOutcome, exercise: Exercise): Line {
  const take = outcome.takeNumber;
  const why: UngradedWhy | undefined = outcome.ungraded;
  switch (why) {
    case "eyes":
      return line("ask.card.count.ungraded.eyes", { take });
    case "chosen":
      return line("ask.card.count.ungraded.chosen", { take });
    case "inputOff":
      return line("ask.card.count.ungraded.inputOff", { take });
    default:
      if (ctx.grading === "off") return line("ask.card.count.ungraded.gradingOff", { take });
      // One sentence per grading mode, in the words the Exercise's card uses
      // for it (`badges.ts` `exerciseGradingKey`; review c2b1c M2).
      switch (exercise.grading) {
        case "graded":
          return line("ask.card.count.ungraded.selfCheckedTempo", { take, bpm: outcome.bpm });
        case "practiceOnly":
          return line("ask.card.count.ungraded.practiceOnly", { take });
        case "landings":
          return line("ask.card.count.ungraded.landings", { take });
        default:
          return line("ask.card.count.ungraded.selfChecked", { take });
      }
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
  const { outcome, exercise } = here;
  const shape: CardShape = "where_slipped";
  const unmeasured = unmeasuredTake(ctx, shape, outcome, note, exercise);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const where = placeOf(note);
  if (where) {
    const lines: Line[] = [where];
    if (note.lastTakeLine) lines.push(note.lastTakeLine);
    const direction = directionCardLine(note);
    if (direction) lines.push(direction);
    return { shape, lines, source: measured(outcome) };
  }
  // No bar-by-bar reading of this Take at all: say so, never guess; below the
  // pass mark, say that too, with what decided it (review c2b1c L3).
  if (!note.strip) {
    const noBars = line("ask.card.slip.noBars", { take });
    const lines: Line[] = note.verdict === "belowBar" ? [belowLine(outcome, note), noBars] : [noBars];
    return { shape, lines, source: note.verdict === "belowBar" ? measured(outcome) : APP, uncertain: true };
  }
  const lines: Line[] = [line("ask.card.slip.none", { take })];
  // Below the pass mark with every bar held (extra notes, the right notes: not
  // judged bar by bar): what decided it, or the card reads as a clean Take (F4).
  if (note.verdict === "belowBar") lines.push(belowLine(outcome, note));
  return { shape, lines, source: measured(outcome) };
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
  const unmeasured = unmeasuredTake(ctx, shape, outcome, note, exercise);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const threshold = Math.round(biasThresholdMs(outcome.bpm));
  const lean = leanOfTake(ctx, outcome, exercise);
  // Only the bars that were measured: a `null` bar had too few notes to tell,
  // and "no bar leaned" must not cover it (review c2b1c M1).
  const measuredBars = (lean ?? [])
    .map((ms, i) => ({ bar: i + 1, ms }))
    .filter((b): b is { bar: number; ms: number } => b.ms !== null);
  const leaning = measuredBars.filter((b) => Math.abs(b.ms) >= threshold);

  if (!note.direction && measuredBars.length === 0) {
    return { shape, lines: [line("ask.card.lean.notMeasured", { take })], source: APP, uncertain: true };
  }

  // The way the bars that leaned went, as one word, only when every one of
  // them agrees: each leaning bar (the place's own bars included) and the
  // note's direction at the place. One bar the other way and there is no one
  // way to correct a premise with: the bars are listed, each with its own
  // direction (review c2b1c H2). Every one is relative to the rest of the
  // Take: the scorer's lag correction hides a lean the whole Take shares, so
  // the premise lines say only what was measured (review c2b1a F2).
  const ways = new Set<Lean>(leaning.map((b) => (b.ms > 0 ? "late" : "early")));
  if (note.direction) ways.add(note.direction.way);
  const way: Lean | null = ways.size === 1 ? [...ways][0] : null;

  const lines: Line[] = [];
  let contradicted = false;
  if (premise && way && way !== premise) {
    lines.push(way === "late" ? line("ask.card.lean.premise.late", { take }) : line("ask.card.lean.premise.early", { take }));
    contradicted = true;
  } else if (premise && ways.size === 0 && measuredBars.length > 0) {
    // Says what was checked, as `lean.none` does: the measured bars, of how many (c2b1b).
    const checked = { take, ms: threshold, measured: measuredBars.length, bars: (lean ?? []).length };
    lines.push(
      premise === "early" ? line("ask.card.lean.premiseNone.early", checked) : line("ask.card.lean.premiseNone.late", checked),
    );
    contradicted = true;
  }

  const where = note.direction ? placeOf(note) : null;
  // The place's own bars are said once, by the place and its direction (from
  // the rounds that slipped); their mean over every round could point the
  // other way, so it is not said beside them (review c2b1a F7).
  const placeBars = new Set<number>();
  const direction = directionCardLine(note);
  if (where && direction) {
    lines.push(where, direction);
    for (const pb of note.place?.patternBars ?? []) placeBars.add(pb);
  }
  for (const b of leaning.filter((x) => !placeBars.has(x.bar)).slice(0, MAX_LEAN_BARS)) {
    const ms = Math.abs(b.ms);
    lines.push(b.ms > 0 ? line("ask.card.lean.bar.late", { bar: b.bar, ms }) : line("ask.card.lean.bar.early", { bar: b.bar, ms }));
  }
  // Nothing leaned past the threshold, and no premise to answer: say what was
  // checked, and on how many bars (review c2b1c M1).
  if (lines.length === 0) {
    lines.push(line("ask.card.lean.none", { take, ms: threshold, measured: measuredBars.length, bars: (lean ?? []).length }));
  }
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

/** What the Take's note measured of the pitches, as a sentence: the share that were the written notes, or that they couldn't be checked. */
function pitchLine(outcome: TakeOutcome, note: TakeNote): Line | null {
  const take = outcome.takeNumber;
  const fact = note.facts.find((f) => f.kind === "rightNotes" || f.kind === "notesUnchecked");
  if (!fact) return null;
  if (fact.kind === "notesUnchecked") return line("ask.card.count.notesUnchecked", { take });
  return line("ask.card.count.rightNotes", { take, value: fact.line.values.value, base: fact.line.values.base });
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
    if (what === "pitch") {
      // The pitch can be measured and reported on a Take whose grade does not
      // include it (the note's facts row): "I didn't measure that" would then
      // argue with the screen.
      const here = lastTakeHere(ctx);
      const note = here ? noteOf(ctx) : null;
      const pitched = here && note ? pitchLine(here.outcome, note) : null;
      const graded = gradesPitch(exercise);
      if (graded || pitched) {
        const lines: Line[] = [line(graded ? "ask.card.count.pitchGraded" : "ask.card.count.pitchNotGraded")];
        if (here && pitched) lines.push(pitched);
        return { shape, lines, source: here && pitched ? measured(here.outcome) : APP };
      }
    }
    return { shape, lines: [line(NOT_MEASURED[what])], source: APP, uncertain: true };
  }

  const here = lastTakeHere(ctx);
  const note = noteOf(ctx);
  if (!here || !note) return noTake();
  const { outcome, exercise } = here;
  const unmeasured = unmeasuredTake(ctx, shape, outcome, note, exercise);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const row = storedRow(ctx, outcome);
  const unfair = row ? markedNotFair(row) : false;
  const lines: Line[] = [];
  // It did count: that answers the question's premise first.
  if (note.verdict === "passed") {
    lines.push(line("ask.card.count.passed", { take, bpm: outcome.bpm }));
    // A pass that did not move the clean tempo: the question most likely meant
    // that, so say what a clean tempo takes and how far this Take got (F3).
    if (outcome.grade.cleanBpm === null) {
      // The scorer's longest held stretch when it judged the Take; without it,
      // `gradeTake` withholds the clean tempo only for want of that stretch.
      const held = outcome.measures.pass?.heldBars;
      // "The longest run was N" only when no bar inside that run is crossed on
      // the strip under the note, as the note's own label (review c2b1c L1).
      const strip = note.strip;
      const runArgues = !!strip && !!strip.held && !heldStretchUncrossed(strip.cells, strip.held);
      if (held === undefined || (held < CLEAN_TEMPO_MIN_BARS && runArgues)) {
        lines.push(line("ask.card.count.notCleanPlain", { take, need: CLEAN_TEMPO_MIN_BARS }));
      } else if (held < CLEAN_TEMPO_MIN_BARS) lines.push(line("ask.card.count.notClean", { take, held, need: CLEAN_TEMPO_MIN_BARS }));
    }
  } else {
    lines.push(line("ask.card.count.below", { take, bpm: outcome.bpm }));
    const decided = belowLine(outcome, note);
    // The plain "below the pass mark" would only say the line above again.
    if (decided.key !== "ask.card.below.plain") lines.push(decided);
  }
  if (unfair) lines.push(line("ask.card.count.unfair"));
  return { shape, lines, source: measured(outcome), premise: true };
}

// ---------------------------------------------------------------------------
// The stored Takes the history cards read (leg c2b1b)
// ---------------------------------------------------------------------------

/**
 * The player marked this Take's grade as not fair. The one place the history
 * cards ask: such a Take is left out of every number they quote or count, and
 * the card says how many it left out. Leg nf1 adds the same rule to
 * `session/progress.ts` (`isMarkedNotFair`); once both are merged this
 * should call that one.
 */
export function markedNotFair(row: PathTakeRow): boolean {
  return factsOf(row).fair === "no";
}

/** A stored Take that was graded and measured: heard, long enough, and not played ungraded. */
function measuredRow(row: PathTakeRow): boolean {
  const f = factsOf(row);
  return row.caught && f.ungraded === undefined && (f.verdict === "passed" || f.verdict === "belowBar");
}

/** The Path the Take belongs to: the context's, else the stored row's. Null: no history can be read. */
function pathIdOf(ctx: CoachContext, outcome: TakeOutcome): string | null {
  return ctx.path?.id ?? storedRow(ctx, outcome)?.pathId ?? null;
}

/** What a check is called in a card, as a literal key suffix; null: a metric the cards have no words for. */
type CheckKind = "even" | "heard" | "extras" | "accents" | "notes" | "hold";

function checkKind(metric: string): CheckKind | null {
  switch (metric) {
    case "timingEvenness":
      return "even";
    case "notesHeard":
      return "heard";
    case "extraNotes":
      return "extras";
    case "accentPlacement":
      return "accents";
    case "noteIdentity":
      return "notes";
    case "evennessHold":
      return "hold";
    default:
      return null;
  }
}

/** One literal key per kind (the locale coverage reads them). */
const CHANGED_KEY: Readonly<Record<CheckKind, string>> = {
  even: "ask.card.changed.metric.even",
  heard: "ask.card.changed.metric.heard",
  extras: "ask.card.changed.metric.extras",
  accents: "ask.card.changed.metric.accents",
  notes: "ask.card.changed.metric.notes",
  hold: "ask.card.changed.metric.hold",
};
const SHORT_KEY: Readonly<Record<CheckKind, string>> = {
  even: "ask.card.distance.short.even",
  heard: "ask.card.distance.short.heard",
  extras: "ask.card.distance.short.extras",
  accents: "ask.card.distance.short.accents",
  notes: "ask.card.distance.short.notes",
  hold: "ask.card.distance.short.hold",
};
const MET_KEY: Readonly<Record<CheckKind, string>> = {
  even: "ask.card.distance.met.even",
  heard: "ask.card.distance.met.heard",
  extras: "ask.card.distance.met.extras",
  accents: "ask.card.distance.met.accents",
  notes: "ask.card.distance.met.notes",
  hold: "ask.card.distance.met.hold",
};
const MADE_KEY: Readonly<Record<CheckKind, string>> = {
  even: "ask.card.made.check.even",
  heard: "ask.card.made.check.heard",
  extras: "ask.card.made.check.extras",
  accents: "ask.card.made.check.accents",
  notes: "ask.card.made.check.notes",
  hold: "ask.card.made.check.hold",
};
/** What the Exercise does not grade (`NOT_GRADED` ids), one sentence each. */
const NOT_PART_KEY: Readonly<Record<string, string>> = {
  pickDirection: "ask.card.made.not.pickDirection",
  muting: "ask.card.made.not.muting",
  posture: "ask.card.made.not.posture",
  tension: "ask.card.made.not.tension",
  handAttribution: "ask.card.made.not.handAttribution",
  fingering: "ask.card.made.not.fingering",
  tone: "ask.card.made.not.tone",
  feel: "ask.card.made.not.feel",
  bendPitch: "ask.card.made.not.bendPitch",
  vibrato: "ask.card.made.not.vibrato",
  noteChoice: "ask.card.made.not.noteChoice",
  notesWritten: "ask.card.made.not.notesWritten",
};

/** A pass-mark check the cards can name: a kind with words, and pitch only where the Exercise grades it. */
function namedCheck(metric: string, exercise: Exercise): CheckKind | null {
  const kind = checkKind(metric);
  if (kind === "notes" && !gradesPitch(exercise)) return null;
  return kind;
}

/** The number of bars a check holds over, from the Exercise's own pass marks. */
function overBarsOf(exercise: Exercise, metric: string, index: number): number | null {
  const at = exercise.passBars[index];
  if (at && at.metric === metric) return at.overBars;
  return exercise.passBars.find((b) => b.metric === metric)?.overBars ?? null;
}

/** The "I left out N Takes you marked not fair" line, when there were any. */
function leftOutLine(count: number): Line[] {
  return count > 0 ? [line("ask.card.history.leftOut", { count })] : [];
}

// ---------------------------------------------------------------------------
// What changed since the last Take
// ---------------------------------------------------------------------------

/**
 * "What changed since the last Take?": this Take beside the last measured Take
 * before it on the same Exercise, each number from its own record (the stored
 * row's headline number, and this Take's check on the same metric and pass
 * mark). The tempo of each is said, so two numbers at two tempos are never
 * read as one change. No earlier measured Take: nothing to compare, said so.
 * Takes marked not fair are skipped, and counted.
 */
export function whatChanged(ctx: CoachContext): FactCard | NoCard {
  const here = lastTakeHere(ctx);
  const note = noteOf(ctx);
  if (!here || !note) return noTake();
  const { outcome, exercise } = here;
  const shape: CardShape = "what_changed";
  const unmeasured = unmeasuredTake(ctx, shape, outcome, note, exercise);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const own = storedRow(ctx, outcome);
  if (own && markedNotFair(own)) {
    return { shape, lines: [line("ask.card.changed.thisUnfair", { take })], source: APP };
  }
  const pathId = pathIdOf(ctx, outcome);
  if (!pathId) return noTake();
  let leftOut = 0;
  let before: PathTakeRow | null = null;
  for (const row of takesOf(ctx.progress, pathId, outcome.exerciseId)) {
    if (row.id === outcome.takeId || !measuredRow(row)) continue;
    if (markedNotFair(row)) {
      leftOut += 1;
      continue;
    }
    before = row;
    break;
  }
  if (!before) {
    // "No measured Take before it" would be false beside Takes left out as not fair: say those were all there is.
    const first = leftOut > 0 ? line("ask.card.changed.onlyUnfair", { take }) : line("ask.card.changed.first", { take });
    return { shape, lines: [first, ...leftOutLine(leftOut)], source: APP };
  }
  const lines: Line[] = [
    before.bpm === outcome.bpm
      ? line("ask.card.changed.sameTempo", { take, bpm: outcome.bpm })
      : line("ask.card.changed.tempo", { take, before: before.bpm, bpm: outcome.bpm }),
  ];
  // The number the stored Take kept (its headline), and this Take's check on
  // the same metric and the same pass mark: the only pair measured alike.
  const f = factsOf(before);
  const metric = f.headlineMetric;
  const kind = metric ? checkKind(metric) : null;
  const now = metric
    ? outcome.grade.checks.find((c) => c.metric === metric && c.min === f.headlineMin && c.max === f.headlineMax)
    : undefined;
  const beforeValue = metric && typeof f.headlineValue === "number" ? displayValue({ metric, value: f.headlineValue }) : null;
  const nowValue = now ? displayValue(now) : null;
  if (kind && beforeValue !== null && nowValue !== null) {
    lines.push(line(CHANGED_KEY[kind], { take, before: beforeValue, now: nowValue }));
  } else {
    lines.push(line("ask.card.changed.noPair", { take }));
  }
  const was = f.verdict === "passed";
  const is = outcome.grade.verdict === "passed";
  lines.push(
    line(
      was && is ? "ask.card.changed.verdict.bothPassed" : !was && !is ? "ask.card.changed.verdict.bothBelow" : is ? "ask.card.changed.verdict.nowPassed" : "ask.card.changed.verdict.nowBelow",
      { take },
    ),
  );
  lines.push(...leftOutLine(leftOut));
  return { shape, lines, source: measured(outcome) };
}

// ---------------------------------------------------------------------------
// Am I improving
// ---------------------------------------------------------------------------

/** At least this many measured Takes before "am I improving" compares anything. */
export const IMPROVING_MIN_TAKES = 3;

/** A stored Take's evenness, as the result screen showed it: the scorer's check on the Exercise's first evenness pass mark. */
function evennessOfRow(row: PathTakeRow, exercise: Exercise): number | null {
  const f = factsOf(row);
  const bar = exercise.passBars.find((b) => b.metric === "timingEvenness");
  if (!bar) return null;
  const check = f.measures?.pass?.checks?.find((c) => c.metric === "timingEvenness" && c.overBars === bar.overBars);
  if (check && typeof check.measured === "number") return displayValue({ metric: "timingEvenness", value: check.measured });
  if (f.headlineMetric === "timingEvenness" && f.headlineMin === bar.min && typeof f.headlineValue === "number") {
    return displayValue({ metric: "timingEvenness", value: f.headlineValue });
  }
  return null;
}

/** Whether a stored Take earned a clean tempo: true, false, or null when the row cannot say. */
function earnedClean(row: PathTakeRow): boolean | null {
  const f = factsOf(row);
  if (f.verdict !== "passed") return false;
  if (f.newClean === true) return true;
  const counts = f.measures?.pass?.countsForCleanTempo;
  return typeof counts === "boolean" ? counts : null;
}

/**
 * "Am I improving?": the measured Takes of this Exercise the app keeps (its
 * 500-Take window), named as a window ("in your last N measured Takes"):
 * the tempo of the oldest and the newest, how many earned a clean tempo and
 * the fastest of those, and the evenness of the oldest, the newest and the
 * best. Fewer than three: says so. No verdict on the trend: the numbers.
 * Takes marked not fair are left out, and counted.
 */
export function improving(ctx: CoachContext): FactCard | NoCard {
  const here = lastTakeHere(ctx);
  if (!here) return noTake();
  const { outcome, exercise } = here;
  const shape: CardShape = "improving";
  const pathId = pathIdOf(ctx, outcome);
  if (!pathId) return noTake();
  const measuredRows = takesOf(ctx.progress, pathId, outcome.exerciseId).filter(measuredRow);
  const window = measuredRows.filter((r) => !markedNotFair(r));
  const leftOut = measuredRows.length - window.length;
  if (window.length < IMPROVING_MIN_TAKES) {
    return {
      shape,
      lines: [line("ask.card.improving.tooFew", { count: window.length, need: IMPROVING_MIN_TAKES }), ...leftOutLine(leftOut)],
      source: APP,
    };
  }
  // Newest first, as the store keeps them.
  const newest = window[0];
  const oldest = window[window.length - 1];
  const lines: Line[] = [
    oldest.bpm === newest.bpm
      ? line("ask.card.improving.windowSame", { count: window.length, to: newest.bpm })
      : line("ask.card.improving.window", { count: window.length, from: oldest.bpm, to: newest.bpm }),
  ];
  const clean = window.map(earnedClean);
  // A row that cannot say whether it earned one: no count is said rather than a wrong one.
  if (!clean.includes(null)) {
    const earned = window.filter((_r, i) => clean[i] === true);
    lines.push(
      earned.length === 0
        ? line("ask.card.improving.cleanNone")
        : line("ask.card.improving.clean", { count: earned.length, bpm: Math.max(...earned.map((r) => r.bpm)) }),
    );
  }
  const even = window.map((r) => evennessOfRow(r, exercise)).filter((v): v is number => v !== null);
  if (even.length >= 2) {
    // `even` keeps the window's order: [0] the newest, the last the oldest.
    lines.push(line("ask.card.improving.even", { count: even.length, first: even[even.length - 1], last: even[0], best: Math.max(...even) }));
  } else {
    lines.push(line("ask.card.improving.evenNone"));
  }
  lines.push(...leftOutLine(leftOut));
  return { shape, lines, source: { kind: "measured" } };
}

// ---------------------------------------------------------------------------
// What the score is made of
// ---------------------------------------------------------------------------

/**
 * "What is the score made of?": the Exercise's pass mark, check by check, in
 * its own numbers; the tempo it is passed at and what a clean tempo takes;
 * then what it does not grade (`Exercise.notGraded`, `NOT_GRADED`). From the
 * Path, needs no Take. An Exercise the app does not grade says that alone.
 */
export function scoreMadeOf(ctx: CoachContext): FactCard | NoCard {
  const exercise = ctx.exercise;
  if (!exercise) return noTake();
  const shape: CardShape = "score_made_of";
  const source: BlockSource = { kind: "path" };
  if (exercise.grading !== "graded") {
    const key =
      exercise.grading === "practiceOnly"
        ? "ask.card.made.ungraded.practiceOnly"
        : exercise.grading === "landings"
          ? "ask.card.made.ungraded.landings"
          : "ask.card.made.ungraded.selfChecked";
    return { shape, lines: [line(key)], source };
  }
  const checks: Line[] = [];
  exercise.passBars.forEach((bar, i) => {
    const kind = namedCheck(bar.metric, exercise);
    const mark = displayBar(bar);
    if (!kind || mark === null) return;
    checks.push(line(MADE_KEY[kind], { bar: mark, over: overBarsOf(exercise, bar.metric, i) ?? bar.overBars }));
  });
  const lines: Line[] = checks.length > 0 ? [line("ask.card.made.intro", { count: checks.length }), ...checks] : [];
  lines.push(line("ask.card.made.clean", { need: CLEAN_TEMPO_MIN_BARS }));
  if (exercise.tempo.passAtBpm !== null) lines.push(line("ask.card.made.tempo", { passAt: exercise.tempo.passAtBpm }));
  for (const id of exercise.notGraded) {
    const key = NOT_PART_KEY[id];
    if (key && NOT_GRADED[id] !== undefined) lines.push(line(key));
  }
  return { shape, lines, source };
}

// ---------------------------------------------------------------------------
// How far the pass mark is
// ---------------------------------------------------------------------------

/**
 * "How far is the pass mark?": each check of the last Take against its pass
 * mark, in the Exercise's own numbers (the ones short of it first, with the
 * gap), the checks it could not measure as a count, and the tempo the
 * Exercise is passed at when the Take was slower. "Even" in milliseconds at
 * this tempo is not here (c2b2a's computed terms).
 */
export function passMarkDistance(ctx: CoachContext): FactCard | NoCard {
  const here = lastTakeHere(ctx);
  const note = noteOf(ctx);
  if (!here || !note) return noTake();
  const { outcome, exercise } = here;
  const shape: CardShape = "pass_mark_distance";
  const unmeasured = unmeasuredTake(ctx, shape, outcome, note, exercise);
  if (unmeasured) return unmeasured;
  const take = outcome.takeNumber;
  const short: Line[] = [];
  const met: Line[] = [];
  let notMeasured = 0;
  outcome.grade.checks.forEach((c, i) => {
    const kind = namedCheck(c.metric, exercise);
    if (!kind) return;
    const value = displayValue(c);
    const mark = displayBar(c);
    if (c.met === null || value === null || mark === null) {
      notMeasured += 1;
      return;
    }
    const over = overBarsOf(exercise, c.metric, i) ?? 0;
    if (c.met) met.push(line(MET_KEY[kind], { take, value, bar: mark, over }));
    else {
      // Short of it by less than the rounding shows (84.6% against 85%): "< 1", never "0 short".
      const gap = kind === "extras" ? value - mark : mark - value;
      short.push(line(SHORT_KEY[kind], { take, value, bar: mark, over, gap: gap >= 1 ? gap : "< 1" }));
    }
  });
  const lines: Line[] = [...short, ...met];
  if (notMeasured > 0) lines.push(line("ask.card.distance.unmeasured", { take, count: notMeasured }));
  const passAt = exercise.tempo.passAtBpm;
  if (passAt !== null && outcome.bpm < passAt) lines.push(line("ask.card.distance.tempo", { take, bpm: outcome.bpm, passAt }));
  if (lines.length === 0) lines.push(line("ask.card.distance.none", { take }));
  return { shape, lines, source: measured(outcome) };
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
