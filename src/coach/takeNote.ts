/**
 * The coach's note after a Take: what it is made of, not how it reads.
 *
 * A thin layer over what already exists (DESIGN 4.2; REVIEW rows 1 to 3). The
 * verdict is `grade.ts`'s and the scorer's; the place comes from the findings
 * `findings.rs` ranked and from the scorer's own per-bar figures; the words
 * live in the locale files. This file decides nothing about the grade. It
 * does four things the Rust side cannot, because they need the Path's pass
 * marks and the history:
 *
 * 1. It leads with what decided the verdict: `takeLine()` already words every
 *    verdict around `decidingCheck()`, and is wrapped, never re-decided.
 * 2. It counts in rounds of the tune (`rounds.ts`): "the tune's first bar, on
 *    two rounds of three", never "bars 1 and 5".
 * 3. It says the direction only when it was measured, and only relative to the
 *    rest of the Take, because the scorer's lag correction absorbs a lean the
 *    whole Take shares.
 * 4. It adds what only history knows (`closer`, `sameSpot`, `stuck`,
 *    `goingDown`, `newClean`, `tooEasy`) and the repeat count the Session's
 *    buttons will read (P1 and P2 are a later leg's; this only reports).
 *
 * It never says why. It never says "check your tuning" (owner decision 9):
 * when most wrong notes are off the same way, `tuningSuspected` is set and
 * nothing is said. A Take nobody graded, or one not caught, makes no claim
 * about the playing.
 *
 * Output is data: `Line`s (an i18n key and its arguments) and typed parts. No
 * English is assembled here.
 */
import type { PathTakeRow, PracticeSegmentEndedPayload } from "../ipc";
import type { Exercise } from "../paths/format";
import type { BarCell, Line } from "../session/coachWords";
import { barStrip, decidingCheck, notCaughtHint, takeLine } from "../session/coachWords";
import type { BarCheck, TakeVerdict } from "../session/grade";
import { rungAbove } from "../session/ladder";
import { factsOf, heardItOf, isUngradedTake } from "../session/progress";
import type { TakeOutcome, TakeSpot } from "../session/runner";
import type { TakeMeasures } from "../session/takeMeasures";
import type { Finding, FindingKind, NoteVerdict, ScoreSchedule, SongScore } from "../songs/types";
import {
  countRounds,
  deviationsByBar,
  foldBar,
  median,
  patternBarsOf,
  roundsIn,
  spotKey,
} from "./rounds";
import type { RoundCount } from "./rounds";

// ---------------------------------------------------------------------------
// Thresholds (DESIGN 4.2), in the units the stored facts use: 0..1, so three
// points is 0.03.
// ---------------------------------------------------------------------------

/** `closer`: up this much or more on the same number, at the same tempo. */
export const CLOSER_POINTS = 0.03;
/** `stuck`: three Takes at one tempo within this much of each other. */
export const STUCK_POINTS = 0.02;
/** `tooEasy`: passed on the first Take with this much to spare, twice running. */
export const TOO_EASY_POINTS = 0.08;
/** The same Take count `stuck` and `goingDown` read. */
export const RUN_OF_TAKES = 3;
/** A direction needs at least this many heard notes in the bars that slipped (`findings.rs` `MIN_ONSETS`). */
export const MIN_DIRECTION_NOTES = 4;
/** And this share of them on its side (`findings.rs` `BIAS_SIGN_FRACTION`). */
export const DIRECTION_SIGN_SHARE = 0.65;
/** A note is named with the direction when this share of the leaning notes are it. */
export const NOTE_SHARE = 2 / 3;
/** `tuningSuspected`: at least this many wrong notes, and this share of them off the same way. */
export const TUNING_MIN_WRONG = 3;
export const TUNING_SAME_WAY_SHARE = 0.75;

/**
 * How far from the rest of the Take a bar must sit before "late" is true: the
 * finding engine's own bias threshold (`findings.rs` `bias_threshold_ms`, the
 * scorer's "perfect" band at this tempo). Mirrored, not imported: it is three
 * lines of arithmetic, and `takeNote.test.ts` pins the numbers.
 */
export function biasThresholdMs(bpm: number): number {
  const beat = bpm > 0 ? 60_000 / bpm : 500;
  const window = Math.max(10, Math.min(80, beat * 0.4));
  return Math.max(8, window * 0.2);
}

// ---------------------------------------------------------------------------
// The note's parts
// ---------------------------------------------------------------------------

/** What the Take's review carries that the note reads. `SongAttemptReview` is one. */
export type TakeReview = {
  score: Pick<SongScore, "bars" | "ticksPerQuarter" | "notes">;
  schedule: Pick<ScoreSchedule, "onsets">;
  /** Ranked in Rust, headline first. */
  findings: readonly Finding[];
  segment?: Pick<PracticeSegmentEndedPayload, "onsetResults"> | null;
};

/** What the Session knows about the Take that the outcome does not carry. */
export type TakeNoteContext = {
  /** Which variant was played; null or absent for the Exercise as written. */
  variantSeed?: number | null;
  /** The Session's start, as `TakeFacts.session` stores it. */
  session?: number;
  /** The pitch pass's verdicts, when the caller has them: only for `tuningSuspected`. */
  noteVerdicts?: readonly NoteVerdict[];
};

/** A mark beside a fact: never meaning by colour alone (REVIEW row 9). */
export type Mark = "check" | "cross" | "dash" | "none";

export type FactItem = {
  kind: "heard" | "extras" | "rightNotes" | "notesUnchecked" | "legato" | "bends" | "vibrato";
  mark: Mark;
  line: Line;
};

/** One cell of the bar strip, with where it sits in the tune. */
export type StripCell = BarCell & {
  /** From 1. */
  round: number;
  /** From 1. */
  patternBar: number;
  /** One of the bars the note's place names, and it slipped here. */
  spot: boolean;
};

export type NoteStrip = {
  cells: StripCell[];
  /** The tune comes round every this many bars. */
  patternBars: number;
  rounds: number;
  /** The stretch the scorer judged as held, from 1. */
  held: { from: number; count: number } | null;
  label: Line;
};

/**
 * Where it happened, in the tune's own bars.
 *
 * `bar`: one pattern bar. `bars`: two or more next to each other that slipped
 * together. `loop`: a one-bar pattern, where the rounds are the bars.
 * `fromRound`: the Take came apart from one round on (`fallsApart`).
 */
export type Place = {
  shape: "bar" | "bars" | "loop" | "fromRound";
  /** Pattern bars, from 1, in tune order. The first is the one compared. */
  patternBars: number[];
  /** Rounds it slipped on, and of how many it could be judged on. */
  slipped: number;
  of: number;
  /** For `fromRound`: the round it started in, from 1. */
  round?: number;
  /** Rounds it slipped on in the last Take of the same notes; null with none to compare. */
  before: number | null;
  /** (variant, pattern bar): what a later Take compares against. */
  key: string;
};

export type Direction = {
  way: "early" | "late";
  /** `notes`: the heard notes of the bars that slipped; `finding`: the engine's rushing or dragging there. */
  source: "notes" | "finding";
  /** Mean, relative to the Take's median, when the notes said it. */
  ms: number | null;
  /** The note most of the leaning ones were, when they were mostly one. */
  note: { midi: number; string: number; fret: number } | null;
};

export type HistoryFacts = {
  /** Up three points or more on the same number at the same tempo: from, to (percent). */
  closer: { from: number; to: number } | null;
  /** The same pattern bar of the same notes slipped in the previous Take. */
  sameSpot: boolean;
  /** Three Takes at one tempo within two points, still below. */
  stuck: boolean;
  /** Three falling in a row at one tempo, still below. */
  goingDown: boolean;
  /** This Take raised the clean tempo. */
  newClean: boolean;
  /** Passed on the first Take with eight points to spare, twice running. */
  tooEasy: boolean;
};

export type UngradedPart = {
  /** One thing to listen for: the author's own question, else the Exercise's coach line. Pack text. */
  listenFor: { source: "selfCheck"; index: number } | { source: "coachLine" } | null;
  /** "I'm not listening", once a Session. */
  notListening: Line | null;
  /** "Did they?" Yes / Not yet, nothing pre-selected. */
  question: Line;
  /** The run of the same answer on the last ungraded Takes before this one. */
  streak: { answer: "yes" | "notYet"; count: number } | null;
  /** "Not yet" twice: the loop to the front (a later leg draws it). */
  loopFirst: boolean;
  /** "Yes" twice: the next line offers this tempo. */
  tryBpm: number | null;
  tryLine: Line | null;
};

export type TakeNote = {
  kind: "result" | "notCaught" | "tooShort" | "ungraded";
  verdict: TakeVerdict;
  /** The check the verdict turned on. Null with no grade. */
  deciding: BarCheck | null;
  /** What decided it, worded by `takeLine()` (the `session.coach.*` keys). */
  lead: Line;
  /** For `notCaught`: the scorer's reason (`session.noCatch.*`). */
  hint: Line | null;
  /** The finding the note is about, as `findings.rs` ranked it. */
  finding: FindingKind | null;
  findingLine: Line | null;
  place: Place | null;
  placeLine: Line | null;
  /** "Last Take it was two." */
  lastTakeLine: Line | null;
  direction: Direction | null;
  directionLine: Line | null;
  history: HistoryFacts;
  historyLines: Line[];
  /** First, second or third time at the same spot and tempo (DESIGN 4.2's table). */
  repeat: 1 | 2 | 3;
  repeatLine: Line | null;
  /** P1's condition: a pass that still holds the pattern bar that slipped last Take. */
  onceMoreHere: boolean;
  facts: FactItem[];
  strip: NoteStrip | null;
  /** Most wrong notes off the same way. Kept, never said (owner decision 9). */
  tuningSuspected: boolean;
  ungraded: UngradedPart | null;
};

const NO_HISTORY: HistoryFacts = {
  closer: null,
  sameSpot: false,
  stuck: false,
  goingDown: false,
  newClean: false,
  tooEasy: false,
};

/** Findings that point at a place in the Take. */
const PLACED: ReadonlySet<FindingKind> = new Set<FindingKind>([
  "consistentMiss",
  "rushing",
  "dragging",
  "afterShift",
  "fallsApart",
  "extras",
  "uneven",
]);

// ---------------------------------------------------------------------------
// History helpers
// ---------------------------------------------------------------------------

function variantOf(seed: number | null | undefined): number | null {
  return seed === undefined || seed === null ? null : seed;
}

/** A Take that was heard and graded: the only kind history compares. */
function isGraded(take: PathTakeRow): boolean {
  if (!take.caught || isUngradedTake(take)) return false;
  const verdict = factsOf(take).verdict;
  return verdict === "passed" || verdict === "belowBar";
}

/** A stored Take's rounds per pattern bar, from its own per-bar figures. Null without them. */
function storedRounds(take: PathTakeRow, exercise: Exercise, patternBars: number): RoundCount[] | null {
  const measures = factsOf(take).measures;
  if (!measures?.perBar || measures.perBar.length === 0) return null;
  const strip = barStrip(exercise, { perBar: measures.perBar, pass: measures.pass });
  return strip ? countRounds(strip.cells, patternBars) : null;
}

/** The headline number a stored Take has for this metric, if any. */
function storedValue(take: PathTakeRow, metric: string): number | null {
  const facts = factsOf(take);
  return facts.headlineMetric === metric && typeof facts.headlineValue === "number" ? facts.headlineValue : null;
}

/**
 * The narrowest margin over a floor among the met checks, on 0..1. Null with
 * none. A check at full marks is not a limit: a notes-heard floor of 95% can
 * never leave eight points to spare, and every note heard is all there is.
 */
function spareOf(checks: ReadonlyArray<{ value: number | null; min?: number; met: boolean | null }>): number | null {
  let spare: number | null = null;
  for (const c of checks) {
    if (c.met !== true || c.value === null || c.min === undefined || c.value >= 1 - 1e-9) continue;
    const margin = c.value - c.min;
    spare = spare === null ? margin : Math.min(spare, margin);
  }
  return spare;
}

/** The same for a stored Take: its scorer checks, else its headline. */
function storedSpare(take: PathTakeRow): number | null {
  const facts = factsOf(take);
  const checks = facts.measures?.pass?.checks;
  if (checks && checks.length > 0) {
    return spareOf(checks.map((c) => ({ value: c.measured, min: c.min, met: c.held })));
  }
  if (typeof facts.headlineValue === "number" && typeof facts.headlineMin === "number") {
    return facts.headlineValue - facts.headlineMin;
  }
  return null;
}

function sessionOf(take: PathTakeRow): number | undefined {
  const session = factsOf(take).session;
  return typeof session === "number" ? session : undefined;
}

/** A percentage the player reads, from a 0..1 value. */
function points(value: number): number {
  return Math.round(value * 100);
}

// ---------------------------------------------------------------------------
// The parts
// ---------------------------------------------------------------------------

/** The fact line: what was counted, with its base, and what could not be told. */
export function factLine(outcome: Pick<TakeOutcome, "grade" | "measures">, exercise: Exercise): FactItem[] {
  const { grade, measures } = outcome;
  const items: FactItem[] = [];
  const markOf = (metric: string, fallback: Mark): Mark => {
    const check = grade.checks.find((c) => c.metric === metric);
    if (check?.met === true) return "check";
    if (check?.met === false) return "cross";
    return fallback;
  };
  items.push({
    kind: "heard",
    mark: markOf("notesHeard", measures.heard >= measures.expected ? "check" : "none"),
    line: { key: "session.note.fact.heard", values: { heard: measures.heard, expected: measures.expected } },
  });
  items.push({
    kind: "extras",
    mark: markOf("extraNotes", measures.extras === 0 ? "check" : "none"),
    line:
      measures.extras === 0
        ? { key: "session.note.fact.noExtras", values: {} }
        : { key: "session.note.fact.extras", values: { count: measures.extras } },
  });
  const notes = measures.pass?.notes;
  const asksNotes = exercise.passBars.some((b) => b.metric === "noteIdentity");
  if (notes?.status === "measured" && measures.noteIdentity !== null) {
    items.push({
      kind: "rightNotes",
      mark: markOf("noteIdentity", "none"),
      line: {
        key: "session.note.fact.rightNotes",
        values: { value: points(measures.noteIdentity), base: notes.right + notes.wrong + notes.octave },
      },
    });
  } else if (notes && notes.status !== "measured" && (notes.status !== "notRun" || asksNotes)) {
    // "Couldn't tell" is a dash and its reason in words, never a cross.
    items.push({
      kind: "notesUnchecked",
      mark: "dash",
      line: { key: `session.note.fact.notesUnchecked.${notes.status}`, values: {} },
    });
  }
  // Reported, never graded: worded as reported, with no mark of a verdict.
  if (measures.legato) {
    items.push({
      kind: "legato",
      mark: "none",
      line: { key: "session.note.fact.legato", values: { sounded: measures.legato.sounded, due: measures.legato.due } },
    });
  }
  if (measures.bends) {
    const b = measures.bends;
    items.push({
      kind: "bends",
      mark: "none",
      line: { key: "session.note.fact.bends", values: { onPitch: b.onPitch, flat: b.flat, sharp: b.sharp, due: b.due } },
    });
  }
  if (measures.vibrato) {
    items.push({
      kind: "vibrato",
      mark: "none",
      line: { key: "session.note.fact.vibrato", values: { present: measures.vibrato.present, due: measures.vibrato.due } },
    });
  }
  return items;
}

/** Most wrong notes off the same way. Never said; kept for the day the app has a tuner. */
export function tuningSuspected(verdicts: readonly NoteVerdict[] | undefined): boolean {
  if (!verdicts) return false;
  const off = verdicts.filter((v) => v.state === "wrong" && typeof v.centsOff === "number" && v.centsOff !== 0);
  if (off.length < TUNING_MIN_WRONG) return false;
  const sharp = off.filter((v) => (v.centsOff as number) > 0).length;
  return Math.max(sharp, off.length - sharp) / off.length >= TUNING_SAME_WAY_SHARE;
}

/** Choose the pattern bars the note names, from the strip and the leading finding. */
function choosePlace(
  counts: RoundCount[] | null,
  lead: Finding | null,
  patternBars: number,
  previous: RoundCount[] | null,
  measures: TakeMeasures,
  verdict: TakeVerdict,
): Omit<Place, "before" | "key"> | null {
  const placed = lead && lead.bars && PLACED.has(lead.kind) ? lead : null;
  // Came apart from one round on: a place in the Take's time, not the tune's.
  if (placed?.kind === "fallsApart" && placed.bars && verdict === "belowBar") {
    const from = foldBar(placed.bars[0], patternBars);
    if (from) {
      const pbs = patternBarsOf(placed.bars, patternBars);
      return {
        shape: "fromRound",
        patternBars: pbs,
        round: from.round,
        slipped: roundsIn(placed.bars[1] - placed.bars[0] + 1, patternBars),
        of: roundsIn(measures.barsPlayed, patternBars),
      };
    }
  }
  const shapeOne = patternBars === 1 ? "loop" : "bar";
  if (!counts) {
    // No per-bar figures: the finding's own bars, folded, are all there is.
    if (!placed?.bars) return null;
    const pbs = patternBarsOf(placed.bars, patternBars);
    const rounds = new Set<number>();
    for (let bar = placed.bars[0]; bar <= placed.bars[1]; bar += 1) {
      const f = foldBar(bar, patternBars);
      if (f && f.patternBar === pbs[0]) rounds.add(f.round);
    }
    const of = Math.max(rounds.size, roundsIn(measures.barsPlayed, patternBars));
    return { shape: pbs.length > 1 ? "bars" : shapeOne, patternBars: pbs, slipped: rounds.size, of };
  }
  const slipped = counts.slice(1).filter((c) => c.slippedIn.length > 0);
  if (slipped.length === 0) return null;
  const pointed = new Set(placed?.bars ? patternBarsOf(placed.bars, patternBars) : []);
  const before = (pb: number) => (previous?.[pb]?.slippedIn.length ?? 0) > 0;
  const ranked = [...slipped].sort(
    (a, b) =>
      Number(pointed.has(b.patternBar)) - Number(pointed.has(a.patternBar)) ||
      Number(before(b.patternBar)) - Number(before(a.patternBar)) ||
      b.slippedIn.length - a.slippedIn.length ||
      a.patternBar - b.patternBar,
  );
  const first = ranked[0];
  // Neighbours that slipped on exactly the same rounds are one place: "the
  // first two bars", not two findings.
  const same = (c: RoundCount) => c.slippedIn.join(",") === first.slippedIn.join(",") && c.of === first.of;
  let from = first.patternBar;
  let to = first.patternBar;
  while (from > 1 && counts[from - 1] && same(counts[from - 1])) from -= 1;
  while (to < patternBars && counts[to + 1] && same(counts[to + 1])) to += 1;
  if (patternBars > 1 && to - from + 1 >= patternBars) {
    // Every bar of the tune, on the same rounds: no one bar is the place.
    return { shape: "bars", patternBars: range(from, to), slipped: first.slippedIn.length, of: first.of };
  }
  const pbs = range(from, to);
  // The compared bar stays first.
  const ordered = [first.patternBar, ...pbs.filter((pb) => pb !== first.patternBar)];
  return {
    shape: pbs.length > 1 ? "bars" : shapeOne,
    patternBars: ordered,
    slipped: first.slippedIn.length,
    of: first.of,
  };
}

function range(from: number, to: number): number[] {
  return Array.from({ length: to - from + 1 }, (_unused, i) => from + i);
}

function placeLine(place: Place, passed: boolean): Line {
  const verb = passed ? "caught" : "slipped";
  const sorted = [...place.patternBars].sort((a, b) => a - b);
  return {
    key: `session.note.place.${verb}.${place.shape}`,
    values: {
      bar: place.patternBars[0],
      from: sorted[0],
      to: sorted[sorted.length - 1],
      slipped: place.slipped,
      count: place.slipped,
      of: place.of,
      ...(place.round === undefined ? {} : { round: place.round }),
    },
  };
}

/** Which way the bars that slipped leaned, when that was measured. */
function directionOf(
  place: Place,
  cells: StripCell[] | null,
  review: TakeReview | null,
  bpm: number,
  takeBars: number,
  patternBars: number,
): Direction | null {
  if (!review || place.shape === "fromRound") return null;
  const deviations = deviationsByBar(review.score, review.schedule, review.segment?.onsetResults);
  const spotBars = new Set(
    (cells ?? []).filter((c) => c.spot).map((c) => c.n - 1),
  );
  if (deviations.length > 0 && spotBars.size > 0) {
    const centre = median(deviations.map((d) => d.deviationMs));
    const here = deviations.filter((d) => spotBars.has(d.bar)).map((d) => ({ ...d, rel: d.deviationMs - centre }));
    if (here.length >= MIN_DIRECTION_NOTES) {
      const mean = here.reduce((sum, d) => sum + d.rel, 0) / here.length;
      const leaning = here.filter((d) => (mean < 0 ? d.rel < 0 : d.rel > 0));
      if (Math.abs(mean) >= biasThresholdMs(bpm) && leaning.length / here.length >= DIRECTION_SIGN_SHARE) {
        return {
          way: mean < 0 ? "early" : "late",
          source: "notes",
          ms: Math.round(mean),
          note: commonNote(leaning.map((d) => d.onsetId), review),
        };
      }
      // The notes were there and did not lean: the engine is not asked to overrule them.
      return null;
    }
  }
  // Too few notes to say from them: the engine's rushing or dragging, when it
  // pointed at these bars and not at the whole Take (a whole-Take lean is the
  // one thing the scorer's lag correction hides, so it is not said).
  const pbs = new Set(place.patternBars);
  const biased = review.findings.find(
    (f) =>
      (f.kind === "rushing" || f.kind === "dragging") &&
      f.bars !== undefined &&
      f.bars[1] - f.bars[0] + 1 < takeBars &&
      patternBarsOf(f.bars, patternBars).some((pb) => pbs.has(pb)),
  );
  if (!biased) return null;
  return { way: biased.kind === "rushing" ? "early" : "late", source: "finding", ms: null, note: null };
}

/** The note most of these onsets were, when one is at least two thirds of them. */
function commonNote(onsetIds: number[], review: TakeReview): Direction["note"] {
  const byOnset = new Map(review.schedule.onsets.map((o) => [o.id, o.noteIds] as const));
  const tally = new Map<string, { midi: number; string: number; fret: number; n: number }>();
  for (const id of onsetIds) {
    const noteIds = byOnset.get(id);
    // A chord is not one note to name.
    if (!noteIds || noteIds.length !== 1) continue;
    const note = review.score.notes[noteIds[0]];
    if (!note) continue;
    const key = `${note.string}:${note.fret}`;
    const entry = tally.get(key) ?? { midi: note.midi, string: note.string, fret: note.fret, n: 0 };
    entry.n += 1;
    tally.set(key, entry);
  }
  let best: { midi: number; string: number; fret: number; n: number } | null = null;
  for (const entry of tally.values()) if (!best || entry.n > best.n) best = entry;
  if (!best || best.n / Math.max(1, onsetIds.length) < NOTE_SHARE) return null;
  return { midi: best.midi, string: best.string, fret: best.fret };
}

function directionLine(direction: Direction): Line {
  const { way, note } = direction;
  if (!note) return { key: `session.note.direction.${way}`, values: {} };
  return {
    key: `session.note.direction.${way}${note.fret === 0 ? "Open" : "Note"}`,
    values: { midi: note.midi, string: note.string, fret: note.fret },
  };
}

// ---------------------------------------------------------------------------
// takeNote
// ---------------------------------------------------------------------------

/**
 * The note after a Take.
 *
 * `earlier`: this Exercise's Takes before this one, newest first (`takesOf`),
 * without it. `exercise`: the notes that were played (the variant, when one
 * was), with the Exercise's pass marks.
 */
export function takeNote(
  outcome: TakeOutcome,
  review: TakeReview | null,
  earlier: readonly PathTakeRow[],
  exercise: Exercise,
  context: TakeNoteContext = {},
): TakeNote {
  const { grade, measures, bpm } = outcome;
  const base: TakeNote = {
    kind: "result",
    verdict: grade.verdict,
    deciding: null,
    lead: takeLine(grade, measures, bpm),
    hint: null,
    finding: null,
    findingLine: null,
    place: null,
    placeLine: null,
    lastTakeLine: null,
    direction: null,
    directionLine: null,
    history: NO_HISTORY,
    historyLines: [],
    repeat: 1,
    repeatLine: null,
    onceMoreHere: false,
    facts: [],
    strip: null,
    tuningSuspected: false,
    ungraded: null,
  };
  if (outcome.ungraded !== undefined || grade.verdict === "ungraded") {
    return { ...base, kind: "ungraded", ungraded: ungradedPart(outcome, earlier, exercise, context) };
  }
  // No claim about the playing: what it heard, and why it could not grade.
  if (grade.verdict === "notCaught") return { ...base, kind: "notCaught", hint: notCaughtHint(measures) };
  if (grade.verdict === "tooShort") return { ...base, kind: "tooShort", deciding: decidingCheck(grade) };

  const passed = grade.verdict === "passed";
  const patternBars = Math.max(1, exercise.bars);
  const variant = variantOf(context.variantSeed);
  const sameNotes = earlier.filter((t) => isGraded(t) && variantOf(t.variantSeed) === variant);
  const previousTake = sameNotes[0] ?? null;
  const previous = previousTake ? storedRounds(previousTake, exercise, patternBars) : null;

  const stripped = barStrip(exercise, measures);
  const counts = stripped ? countRounds(stripped.cells, patternBars) : null;
  const lead = review?.findings[0] ?? null;
  const chosen = choosePlace(counts, lead, patternBars, previous, measures, grade.verdict);
  const place: Place | null = chosen
    ? {
        ...chosen,
        before:
          previous && chosen.shape !== "fromRound" ? (previous[chosen.patternBars[0]]?.slippedIn.length ?? 0) : null,
        key: spotKey(variant, chosen.patternBars[0]),
      }
    : null;

  const strip: NoteStrip | null = stripped
    ? (() => {
        const spotBars = new Set(place && place.shape !== "fromRound" ? place.patternBars : []);
        const cells: StripCell[] = stripped.cells.map((cell) => {
          const folded = foldBar(cell.n - 1, patternBars) ?? { round: 1, patternBar: 1 };
          return { ...cell, ...folded, spot: cell.state === "missed" && spotBars.has(folded.patternBar) };
        });
        const rounds = roundsIn(cells.length, patternBars);
        const label: Line =
          passed && stripped.held
            ? { key: "session.note.strip.held", values: { count: stripped.held.count } }
            : patternBars > 1 && rounds > 1
              ? { key: "session.note.strip.roundEvery", values: { count: patternBars } }
              : { key: "session.note.strip.plain", values: {} };
        return { cells, patternBars, rounds, held: stripped.held, label };
      })()
    : null;

  const direction = place ? directionOf(place, strip?.cells ?? null, review, bpm, measures.barsPlayed, patternBars) : null;

  // --- history -------------------------------------------------------------
  const headline = grade.headline;
  const metric = headline?.metric;
  const value = headline?.value ?? null;
  // Points only make sense on a share; extra notes are a count, lower better.
  const comparable = metric !== undefined && metric !== "extraNotes" && value !== null;
  const atTempo = comparable
    ? sameNotes.filter((t) => t.bpm === bpm && storedValue(t, metric) !== null)
    : [];
  const below = grade.verdict === "belowBar";
  const lastAtTempo = atTempo[0] ? (storedValue(atTempo[0], metric as string) as number) : null;
  const closer =
    below && comparable && lastAtTempo !== null && (value as number) - lastAtTempo >= CLOSER_POINTS - 1e-9
      ? { from: points(lastAtTempo), to: points(value as number) }
      : null;
  const run = comparable
    ? [value as number, ...atTempo.slice(0, RUN_OF_TAKES - 1).map((t) => storedValue(t, metric as string) as number)]
    : [];
  const fullRun = run.length === RUN_OF_TAKES;
  const stuck = below && fullRun && Math.max(...run) - Math.min(...run) <= STUCK_POINTS + 1e-9;
  // Newest first: falling is each Take under the one before it.
  const goingDown = below && fullRun && run.every((v, i) => i === 0 || run[i - 1] < v);
  const sameSpot = place !== null && place.shape !== "fromRound" && (place.before ?? 0) > 0;
  const newClean = grade.cleanBpm !== null && (outcome.cleanBefore === null || grade.cleanBpm > outcome.cleanBefore);
  const tooEasy = passed && tooEasyNow(outcome, earlier, context);
  const history: HistoryFacts = { closer, sameSpot, stuck, goingDown, newClean, tooEasy };
  const historyLines: Line[] = [];
  if (newClean && grade.cleanBpm !== null) historyLines.push({ key: "session.note.history.newClean", values: { bpm: grade.cleanBpm } });
  if (tooEasy) historyLines.push({ key: "session.note.history.tooEasy", values: { bpm } });
  if (closer) historyLines.push({ key: "session.note.history.closer", values: closer });
  if (goingDown) historyLines.push({ key: "session.note.history.goingDown", values: { bpm } });
  else if (stuck) historyLines.push({ key: "session.note.history.stuck", values: { bpm } });

  // --- the repeat table ----------------------------------------------------
  let repeat: 1 | 2 | 3 = 1;
  if (below && place && place.shape !== "fromRound") {
    let times = 1;
    for (const take of earlier) {
      if (times >= 3) break;
      if (context.session !== undefined && sessionOf(take) !== context.session) break;
      if (!isGraded(take) || take.bpm !== bpm || variantOf(take.variantSeed) !== variant) break;
      const rounds = storedRounds(take, exercise, patternBars);
      if (!rounds || (rounds[place.patternBars[0]]?.slippedIn.length ?? 0) === 0) break;
      times += 1;
    }
    repeat = Math.min(3, times) as 1 | 2 | 3;
  }
  if (goingDown) repeat = 3;

  const findingLine: Line | null =
    lead?.kind === "tempoCeiling" && lead.evidence.bpmBand
      ? { key: "session.note.finding.ceiling", values: { holds: lead.evidence.bpmBand[0], breaks: lead.evidence.bpmBand[1] } }
      : null;

  return {
    ...base,
    deciding: decidingCheck(grade),
    finding: lead?.kind ?? null,
    findingLine,
    place,
    placeLine: place ? placeLine(place, passed) : null,
    lastTakeLine:
      place && place.before !== null
        ? place.before > 0
          ? { key: "session.note.place.lastTake", values: { before: place.before, count: place.before } }
          : { key: "session.note.place.lastTakeHeld", values: {} }
        : null,
    direction,
    directionLine: direction ? directionLine(direction) : null,
    history,
    historyLines,
    repeat,
    repeatLine: repeat === 3 ? { key: "session.note.repeat.leaveIt", values: {} } : null,
    onceMoreHere: passed && sameSpot,
    facts: factLine(outcome, exercise),
    strip,
    tuningSuspected: tuningSuspected(context.noteVerdicts),
  };
}

/**
 * What the Session's rules read from a note (`TakeOutcome.spot`): the bars it
 * named, the repeat row and P1's condition. Null when there is nothing in it
 * for them: no place (or one in the Take's time, not the tune's) and no repeat.
 */
export function spotOf(note: TakeNote): TakeSpot | null {
  if (note.kind !== "result") return null;
  const bars = note.place && note.place.shape !== "fromRound" ? [...note.place.patternBars] : [];
  if (bars.length === 0 && note.repeat === 1 && !note.onceMoreHere) return null;
  return { patternBars: bars, repeat: note.repeat, onceMoreHere: note.onceMoreHere };
}

/**
 * Passed on the first Take with eight points to spare, twice running: this
 * Session's first Take on the Exercise, and the last Session's first.
 */
function tooEasyNow(outcome: TakeOutcome, earlier: readonly PathTakeRow[], context: TakeNoteContext): boolean {
  const spare = spareOf(outcome.grade.checks);
  if (spare === null || spare < TOO_EASY_POINTS - 1e-9) return false;
  const thisSession = context.session;
  const first =
    thisSession !== undefined ? !earlier.some((t) => sessionOf(t) === thisSession) : outcome.takeNumber === 1;
  if (!first) return false;
  const before = earlier.filter((t) => sessionOf(t) !== undefined && sessionOf(t) !== thisSession);
  const last = before[0] ? sessionOf(before[0]) : undefined;
  if (last === undefined) return false;
  const lastSession = before.filter((t) => sessionOf(t) === last);
  const opener = lastSession[lastSession.length - 1];
  if (!opener || !isGraded(opener) || !opener.passed) return false;
  const was = storedSpare(opener);
  return was !== null && was >= TOO_EASY_POINTS - 1e-9;
}

function ungradedPart(
  outcome: TakeOutcome,
  earlier: readonly PathTakeRow[],
  exercise: Exercise,
  context: TakeNoteContext,
): UngradedPart {
  const listenFor: UngradedPart["listenFor"] =
    exercise.selfCheck && exercise.selfCheck.length > 0
      ? { source: "selfCheck", index: 0 }
      : exercise.coachLine
        ? { source: "coachLine" }
        : null;
  // Once a Session: not when an ungraded Take of this Exercise came before it in the same one.
  const saidAlready =
    context.session !== undefined
      ? earlier.some((t) => isUngradedTake(t) && sessionOf(t) === context.session)
      : outcome.takeNumber > 1;
  // The run of the same answer on the last ungraded Takes, newest first.
  let streak: UngradedPart["streak"] = null;
  for (const take of earlier) {
    if (!isUngradedTake(take)) continue;
    const answer = heardItOf(take);
    if (!answer) break;
    if (!streak) streak = { answer, count: 1 };
    else if (streak.answer === answer) streak = { answer, count: streak.count + 1 };
    else break;
  }
  const loopFirst = streak?.answer === "notYet" && streak.count >= 2;
  const above = rungAbove(exercise, outcome.bpm);
  const tryBpm = streak?.answer === "yes" && streak.count >= 2 && above > outcome.bpm ? above : null;
  return {
    listenFor,
    notListening: saidAlready ? null : { key: "session.note.ungraded.notListening", values: {} },
    question: { key: "session.note.ungraded.didThey", values: {} },
    streak,
    loopFirst,
    tryBpm,
    tryLine: tryBpm === null ? null : { key: "session.note.ungraded.tryFaster", values: { bpm: tryBpm } },
  };
}
