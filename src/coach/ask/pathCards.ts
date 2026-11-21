/**
 * Fact cards from the Path, the plan and the app's theory (DESIGN 5.3 rows 2
 * to 5, 5.4; leg c2b2a). Pure, like `cards.ts`: a `CoachContext` (and the
 * card's closed arguments) to a `FactCard` or the one line that says why
 * there is none.
 *
 * What each family may say:
 *
 * - **The Exercise** (`exercise_*`): the pack's own words, quoted whole
 *   (`ExerciseWords` of the variant played, the cues `cueFor` picks), never
 *   paraphrased. Source "From the Path · Step N".
 * - **The plan** (`plan_*`): the plan step's own `Reason` as `reasonLine`
 *   words it, the tempo it was planned at and the tempo now, the plan's next
 *   part, the review schedule (`reviewStateOf`). Where the answer is an action
 *   (Test out, fewer minutes) the card ends in that tool's call (`then`), which
 *   `askCards.ts` issues through the runner as a proposal: building a card
 *   changes nothing. Source "The app".
 * - **Theory** (`scale_fits`, `chord_notes`): computed by the app's own theory
 *   code (`scalesForChord`, `spellScale`, `spellChord`, `chordNotes`), drawn by
 *   `show_scale` / `show_chord`. A chord the app cannot read is "I don't know
 *   that chord" with the chords it can spell on the same root. Source "Worked
 *   out by the app".
 * - **The app's computed terms** (`pass_mark_ms`, `clean_tempo`): the
 *   evenness pass mark in milliseconds at this tempo for this Exercise (the
 *   scorer's own formula, `score.rs` `evenness`), and what a clean tempo is
 *   with the player's own number (`shownCleanTempoOf`: Takes marked not fair
 *   count in no number). Source "The app".
 */
import type { BlockSource } from "../blocks/resolve";
import type { CoachContext } from "../context";
import { cueFor } from "../cues";
import type { Line, ToolCall } from "../tools/types";
import { inSession } from "../tools/types";
import { chordIntervals, chordNotes, noteName, parseChordName, spellingForKey, type Chord, type Key } from "../../jam/harmony";
import { SCALE_NAMES_EN, scaleNotes, scalesForChord } from "../../jam/scales";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import { canSpellScale, spellChord, spellScale } from "../../paths/theory";
import { reasonLine } from "../../session/coachWords";
import { exerciseWords } from "../../session/exerciseWords";
import { CLEAN_TEMPO_MIN_BARS } from "../../session/grade";
import { PLAN_MINUTES } from "../../session/planner";
import { isMarkedNotFair, shownCleanTempoOf, takesOf } from "../../session/progress";
import { reviewStateOf } from "../../session/rotation";
import { buildTake, withVariant } from "../../session/take";
import type { FactCard, NoCard, PathCardShape } from "./cards";
import { lastTakeHere, noteOf, ungradedPlayer } from "./cards";

function line(key: string, values: Record<string, string | number> = {}): Line {
  return { key, values };
}

const APP: BlockSource = { kind: "app" };

/** The player's own exercises (leg t2b): not a Path, so not a Path's progress. */
export const MY_EXERCISES_PATH = "my-exercises";

function noCard(key: string, values: Record<string, string | number> = {}): NoCard {
  return { line: line(key, values) };
}

// ---------------------------------------------------------------------------
// The Exercise and the Step
// ---------------------------------------------------------------------------

/** The Exercise as played: the variant of the Take on screen, else the step's. */
function played(ctx: CoachContext): Exercise | null {
  const here = lastTakeHere(ctx);
  if (here) return here.exercise;
  return ctx.exercise ? withVariant(ctx.exercise, ctx.variantSeed ?? null) : null;
}

/** "From the Path · Step N": the Step's number when it is known. */
function fromPath(ctx: CoachContext): BlockSource {
  return ctx.step ? { kind: "path", step: ctx.step.order } : { kind: "path" };
}

/** A string of the pack's, quoted whole (the test holds it byte-equal to the pack's). */
function quote(text: string): Line {
  return line("ask.card.path.quote", { text });
}

/** "What is this for?": the purpose of the variant played, as the pack writes it. */
export function exercisePurpose(ctx: CoachContext): FactCard | NoCard {
  const exercise = played(ctx);
  if (!exercise || !ctx.exercise) return noCard("ask.card.path.noExercise");
  const shape: PathCardShape = "exercise_purpose";
  const purpose = exerciseWords(ctx.exercise, exercise).purpose;
  if (!purpose) return { shape, lines: [line("ask.card.path.purposeNone")], source: fromPath(ctx) };
  return { shape, lines: [line("ask.card.path.purposeIntro"), quote(purpose)], source: fromPath(ctx) };
}

/** "How do I play it?": every how-to line of the variant played, in order. */
export function exerciseHow(ctx: CoachContext): FactCard | NoCard {
  if (!ctx.exercise) return noCard("ask.card.path.noExercise");
  const shape: PathCardShape = "exercise_how";
  const how = exerciseWords(ctx.exercise, played(ctx)).howTo;
  if (how.length === 0) return { shape, lines: [line("ask.card.path.howNone")], source: fromPath(ctx) };
  return { shape, lines: [line("ask.card.path.howIntro"), ...how.map(quote)], source: fromPath(ctx) };
}

/**
 * "What should I try?": the cue the result screen says (`cueFor` over the same
 * note), the pack's words. Chosen by what Take N measured, the line says so;
 * the Exercise's general cue says only that it is the Path's cue.
 */
export function exerciseTry(ctx: CoachContext): FactCard | NoCard {
  const exercise = played(ctx);
  if (!exercise) return noCard("ask.card.path.noExercise");
  const shape: PathCardShape = "exercise_try";
  // No reading of a Take for an ungraded player: the general cue only.
  const note = ungradedPlayer(ctx) ? null : noteOf(ctx);
  const pick = cueFor(exercise, note);
  const said = pick?.cue.say.trim();
  if (!pick || !said) return { shape, lines: [line("ask.card.path.tryNone")], source: fromPath(ctx) };
  const take = ctx.lastTake?.takeNumber;
  const intro =
    pick.basis === "measured" && take !== undefined ? line("ask.card.path.tryMeasured", { take }) : line("ask.card.path.tryGeneral");
  return { shape, lines: [intro, quote(pick.cue.say)], source: fromPath(ctx) };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/** The plan step a running Session is on. */
function planStepHere(ctx: CoachContext) {
  if (!ctx.plan || !ctx.run) return null;
  return ctx.plan.steps[ctx.run.stepIndex] ?? null;
}

/** "Why this?": the plan step's own reasons, as the Session's ready screen words them. */
export function planWhy(ctx: CoachContext): FactCard | NoCard {
  const step = planStepHere(ctx);
  if (!step) return noCard("ask.card.plan.notInPlan");
  const lines: Line[] = [line("ask.card.plan.why"), reasonLine(step.why)];
  if (step.kind === "exercise" && step.context) lines.push(reasonLine(step.context));
  return { shape: "plan_why", lines, source: APP };
}

/** "Why this tempo?": the tempo it was planned at, the reason, and the tempo now when it moved. */
export function planTempo(ctx: CoachContext): FactCard | NoCard {
  const step = planStepHere(ctx);
  if (!step || !ctx.run) return noCard("ask.card.plan.notInPlan");
  const shape: PathCardShape = "plan_tempo";
  const planned = step.kind === "drill" ? null : step.kind === "jam" ? (step.bpm ?? null) : step.bpm;
  if (planned === null || planned === undefined) return { shape, lines: [line("ask.card.plan.tempoNone")], source: APP };
  const lines: Line[] = [line("ask.card.plan.tempoPlanned", { bpm: planned }), reasonLine(step.why)];
  if (ctx.run.bpm > 0 && ctx.run.bpm !== planned) lines.push(line("ask.card.plan.tempoNow", { bpm: ctx.run.bpm }));
  return { shape, lines, source: APP };
}

/** "What's next?": the next part of today's plan, as the plan holds it. */
export function planNext(ctx: CoachContext): FactCard | NoCard {
  const step = planStepHere(ctx);
  if (!step || !ctx.plan || !ctx.run) return noCard("ask.card.plan.notInPlan");
  const next = ctx.plan.steps[ctx.run.stepIndex + 1];
  if (!next) return { shape: "plan_next", lines: [line("ask.card.plan.nextLast")], source: APP };
  const bpm = next.kind === "drill" ? undefined : next.bpm;
  const lines = [
    typeof bpm === "number"
      ? line("ask.card.plan.nextBpm", { title: next.title, bpm, minutes: next.minutes })
      : line("ask.card.plan.next", { title: next.title, minutes: next.minutes }),
  ];
  return { shape: "plan_next", lines, source: APP };
}

/**
 * "Can I skip ahead?": what Test out is (`testOutSteps`'s rule), ending in
 * `test_out`'s proposal for the Step the player is on. Not while a Session runs.
 */
export function planSkip(ctx: CoachContext): FactCard | NoCard {
  if (inSession(ctx)) return noCard("ask.card.plan.skipInSession");
  const then: ToolCall = { tool: "test_out", args: {} };
  return { shape: "plan_skip", lines: [line("ask.card.plan.skip")], source: APP, then };
}

/** The minutes a plan comes in, the nearest to `asked` (ties: the shorter). */
function snapped(asked: number): number {
  let best: number = PLAN_MINUTES[0];
  for (const m of PLAN_MINUTES) if (Math.abs(m - asked) < Math.abs(best - asked)) best = m;
  return best;
}

/** "I have 5 minutes": the lengths a plan comes in, ending in `set_minutes`'s proposal. */
export function planMinutes(ctx: CoachContext, asked: number | null): FactCard | NoCard {
  if (inSession(ctx)) return noCard("ask.card.plan.minutesInSession");
  if (asked === null || !Number.isFinite(asked) || asked < 1) return noCard("ask.card.plan.minutesNone");
  const to = snapped(asked);
  const lines: Line[] = [line("ask.card.plan.minutes", { list: PLAN_MINUTES.join(", ") })];
  if (to !== asked) lines.push(line("ask.card.plan.minutesSnapped", { asked, to }));
  return { shape: "plan_minutes", lines, source: APP, then: { tool: "set_minutes", args: { minutes: to } } };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * "When does this come back?": the review schedule (`reviewStateOf`) for the
 * Exercise on screen. Not quoted when a Take of it is marked not fair: the
 * schedule counts every Take, and a number here counts none of those.
 */
export function planReturn(ctx: CoachContext): FactCard | NoCard {
  const exercise = ctx.exercise;
  const pathId = ctx.path?.id;
  if (!exercise || !pathId) return noCard("ask.card.path.noExercise");
  const shape: PathCardShape = "plan_return";
  if (pathId === MY_EXERCISES_PATH) return { shape, lines: [line("ask.card.plan.returnMine")], source: APP };
  if (exercise.grading !== "graded") return { shape, lines: [line("ask.card.plan.returnUngraded")], source: APP };
  if (takesOf(ctx.progress, pathId, exercise.id).some(isMarkedNotFair)) {
    return { shape, lines: [line("ask.card.plan.returnNotFair")], source: APP, uncertain: true };
  }
  // `reviewStateOf` reads the Path's id and the Exercise; the Step is not read.
  const pick = { path: { id: pathId } as PathDoc, step: {} as Step, exercise };
  const state = reviewStateOf(ctx.progress, pick);
  if (!state) return { shape, lines: [line("ask.card.plan.returnNotPassed")], source: APP };
  const days = Math.ceil((state.dueAt - ctx.now) / DAY_MS);
  const lines = days <= 0 ? [line("ask.card.plan.returnDue", { bpm: state.bpm })] : [line("ask.card.plan.returnDays", { count: days, bpm: state.bpm })];
  return { shape, lines, source: APP };
}

// ---------------------------------------------------------------------------
// Theory
// ---------------------------------------------------------------------------

/** The chord argument's "the player's chord is not one the app reads". */
export const UNKNOWN_SUFFIX = "unknown";

/** A chord's two closed arguments as the app writes the chord ("F#" + "m7"), or null. */
function symbolOf(root: string, suffix: string): string | null {
  if (!root || suffix === UNKNOWN_SUFFIX) return null;
  const symbol = `${root}${suffix}`;
  return parseChordName(symbol) ? symbol : null;
}

/** "I don't know that chord", with the chords the app spells on the same root. */
function unknownChord(root: string, shape: PathCardShape): FactCard {
  const known = [root, `${root}m`, `${root}7`, `${root}maj7`, `${root}m7`].filter((c) => parseChordName(c) !== null);
  return { shape, lines: [line("ask.card.theory.chordUnknown", { root, known: known.join(", ") })], source: APP, uncertain: true };
}

function spellingOf(symbol: string): "flat" | "sharp" {
  return symbol.length > 1 && symbol[1] === "b" ? "flat" : "sharp";
}

/** A chord's notes: `spellChord` where it has a spelling table, else `chordNotes` named the key's way. */
export function notesOfChord(symbol: string, chord: Chord): string[] {
  try {
    return spellChord(symbol);
  } catch {
    const spelling = spellingOf(symbol);
    return chordNotes(chord).map((pc) => noteName(pc, spelling));
  }
}

/** "What notes are in F7?": spelled by the app, drawn by `show_chord`. */
export function chordNotesCard(root: string, suffix: string): FactCard {
  const shape: PathCardShape = "chord_notes";
  const symbol = symbolOf(root, suffix);
  const chord = symbol ? parseChordName(symbol) : null;
  if (!symbol || !chord) return unknownChord(root, shape);
  return {
    shape,
    lines: [line("ask.card.theory.chordNotes", { chord: symbol, notes: notesOfChord(symbol, chord).join(" ") })],
    source: APP,
    then: { tool: "show_chord", args: { chord: symbol } },
  };
}

/** The chord as the home chord of a key: minor when it has a minor third and no major one. */
export function homeKeyOf(chord: Chord): Key {
  const intervals = chordIntervals(chord.quality);
  const minor = intervals.includes(3) && !intervals.includes(4);
  return { root: chord.root, mode: minor ? "minor" : "major" };
}

/**
 * "What fits over F?": `scalesForChord` with the chord taken as the home chord
 * of its own key (the sentence names that key), each scale's notes spelled
 * (`spellScale`, else `scaleNotes` named the key's way). The first is drawn.
 */
export function scaleFits(root: string, suffix: string): FactCard {
  const shape: PathCardShape = "scale_fits";
  const symbol = symbolOf(root, suffix);
  const chord = symbol ? parseChordName(symbol) : null;
  if (!symbol || !chord) return unknownChord(root, shape);
  const key = homeKeyOf(chord);
  const spelling = spellingForKey(key);
  const suggestions = scalesForChord(chord, key);
  const keyRoot = noteName(key.root, spelling);
  const lines: Line[] = [
    line(key.mode === "minor" ? "ask.card.theory.scalesIntroMinor" : "ask.card.theory.scalesIntroMajor", { chord: symbol, root: keyRoot }),
  ];
  for (const s of suggestions) {
    const root = noteName(s.root, spelling);
    let notes: string[];
    try {
      notes = canSpellScale(s.scale) ? spellScale(root, s.scale) : scaleNotes(s.root, s.scale).map((pc) => noteName(pc, spelling));
    } catch {
      notes = scaleNotes(s.root, s.scale).map((pc) => noteName(pc, spelling));
    }
    lines.push(line("ask.card.theory.scale", { root, name: SCALE_NAMES_EN[s.scale], notes: notes.join(" ") }));
  }
  const first = suggestions[0];
  const then: ToolCall | undefined = first ? { tool: "show_scale", args: { root: noteName(first.root, spelling), scale: first.scale } } : undefined;
  return { shape, lines, source: APP, ...(then ? { then } : {}) };
}

// ---------------------------------------------------------------------------
// The app's computed terms
// ---------------------------------------------------------------------------

/** `timing.rs` `tempo_aware_window_ms`: 0.4 of the gap, between 10 and 80 ms. */
function windowMs(gapMs: number): number {
  return Math.max(10, Math.min(gapMs * 0.4, 80));
}

/**
 * The spread of timing (ms, a robust standard deviation around the player's
 * own average) at which evenness equals `mark`: `score.rs` `evenness` is
 * exp(-σ²/2k²) with k half the matching window for the closest written notes,
 * so σ = k·√(-2 ln mark).
 */
export function evennessSpreadMs(mark: number, gapMs: number): number {
  const k = Math.max(1, windowMs(gapMs) * 0.5);
  return k * Math.sqrt(-2 * Math.log(mark));
}

/** The closest two written onsets of the Take's schedule, in beats (`score.rs` `smallest_gap_beats`). */
function smallestGapBeats(onsets: ReadonlyArray<{ beat: number }>): number | null {
  let smallest: number | null = null;
  for (let i = 1; i < onsets.length; i += 1) {
    const gap = onsets[i].beat - onsets[i - 1].beat;
    if (gap > 1e-6 && (smallest === null || gap < smallest)) smallest = gap;
  }
  return smallest;
}

/** The tempo the question is about: the Session's now, else the Take's, else the pass tempo. */
function tempoHere(ctx: CoachContext, exercise: Exercise): number | null {
  if (ctx.run && ctx.run.bpm > 0) return ctx.run.bpm;
  if (ctx.lastTake) return ctx.lastTake.bpm;
  return exercise.tempo.passAtBpm;
}

/**
 * "What does 85% even mean?": each evenness pass mark of this Exercise in
 * milliseconds at this tempo. A number asked that no pass mark of the Exercise
 * has is said first; an Exercise without an evenness check says so.
 */
export function passMarkMs(ctx: CoachContext, asked: number | null): FactCard | NoCard {
  const exercise = played(ctx);
  if (!exercise || !ctx.exercise) return noCard("ask.card.path.noExercise");
  const shape: PathCardShape = "pass_mark_ms";
  if (exercise.grading !== "graded") return { shape, lines: [line("ask.card.term.ungradedExercise")], source: APP };
  const marks = exercise.passBars.filter((b) => b.metric === "timingEvenness" && typeof b.min === "number" && b.min > 0 && b.min < 1);
  const percents = exercise.passBars
    .map((b) => (typeof b.min === "number" && b.min <= 1 ? Math.round(b.min * 100) : null))
    .filter((p): p is number => p !== null);
  const lines: Line[] = [];
  if (asked !== null && !percents.includes(asked)) lines.push(line("ask.card.term.noSuchMark", { value: asked }));
  if (marks.length === 0) {
    lines.push(line("ask.card.term.evenNone"));
    return { shape, lines, source: APP };
  }
  const bpm = tempoHere(ctx, exercise);
  // `buildTake` reads the Path's id only; `exercise` is the variant played already.
  const plan = bpm ? buildTake({ id: ctx.path?.id ?? "" } as PathDoc, exercise, bpm, null) : null;
  const gapBeats = plan ? smallestGapBeats(plan.schedule.onsets) : null;
  // The click counts quarter notes on these meters only; elsewhere a beat is not
  // known to be the schedule's beat, so no milliseconds are said.
  if (!bpm || gapBeats === null || exercise.meter.denominator !== 4) {
    lines.push(line("ask.card.term.evenNoMs"));
    return { shape, lines, source: APP };
  }
  const gapMs = gapBeats * (60000 / bpm);
  for (const m of marks) {
    const mark = m.min as number;
    lines.push(line("ask.card.term.evenMs", { bar: Math.round(mark * 100), bpm, gap: Math.round(gapMs), ms: Math.round(evennessSpreadMs(mark, gapMs)) }));
  }
  lines.push(line("ask.card.term.evenHow"));
  return { shape, lines, source: APP };
}

/** "What is a clean tempo?": the rule, then the player's own number on this Exercise. */
export function cleanTempo(ctx: CoachContext): FactCard {
  const shape: PathCardShape = "clean_tempo";
  const lines: Line[] = [line("ask.card.term.clean", { need: CLEAN_TEMPO_MIN_BARS })];
  const exercise = ctx.exercise;
  const pathId = ctx.path?.id;
  if (exercise && pathId && !ungradedPlayer(ctx) && exercise.grading === "graded") {
    if (pathId === MY_EXERCISES_PATH) lines.push(line("ask.card.term.cleanMine"));
    else {
      const bpm = shownCleanTempoOf(ctx.progress, pathId, exercise.id);
      lines.push(bpm === null ? line("ask.card.term.cleanNone") : line("ask.card.term.cleanYours", { bpm }));
      if (takesOf(ctx.progress, pathId, exercise.id).some(isMarkedNotFair)) lines.push(line("ask.card.term.cleanNotFair"));
    }
  }
  return { shape, lines, source: APP };
}
