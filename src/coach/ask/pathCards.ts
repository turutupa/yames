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
import { ROOT_NAMES } from "../blocks/spec";
import type { CoachContext } from "../context";
import { cueFor } from "../cues";
import type { Line, ToolCall } from "../tools/types";
import { inSession } from "../tools/types";
import { chordIntervals, chordNotes, noteName, parseChordName, pitchClass, spellingForKey, type Chord, type ChordQuality, type Key } from "../../jam/harmony";
import { SCALE_NAMES_EN, scaleNotes, scalesForChord } from "../../jam/scales";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import { chordRootName, spellAbove, spellChord, spellScaleByLetter } from "../../paths/theory";
import { reasonLine } from "../../session/coachWords";
import { exerciseWords } from "../../session/exerciseWords";
import { CLEAN_TEMPO_MIN_BARS } from "../../session/grade";
import { PLAN_MINUTES, type Reason } from "../../session/planner";
import { MY_EXERCISES_PATH_ID } from "../../session/myExercises";
import { isGradable, isMarkedNotFair, shownCleanTempoOf, takesOf } from "../../session/progress";
import { reviewStateOf } from "../../session/rotation";
import { buildTake, withVariant } from "../../session/take";
import type { FactCard, NoCard, PathCardShape } from "./cards";
import { lastTakeHere, noteOf, pathIdHere, planStepHere, runningPlan, takeSeedHere, ungradedPlayer } from "./cards";

function line(key: string, values: Record<string, string | number> = {}): Line {
  return { key, values };
}

const APP: BlockSource = { kind: "app" };

/** The player's own exercises (leg t2b): not a Path, so not a Path's progress. */
export const MY_EXERCISES_PATH = MY_EXERCISES_PATH_ID;

function noCard(key: string, values: Record<string, string | number> = {}): NoCard {
  return { line: line(key, values) };
}

// ---------------------------------------------------------------------------
// The Exercise and the Step
// ---------------------------------------------------------------------------

/**
 * The Exercise on screen: on a Take's result, the variant that Take played;
 * anywhere else the step's variant, the one the next Take will play (review
 * c2b2a M2: after a change of key on the ready screen, the last Take's
 * variant is no longer the one on screen).
 */
function played(ctx: CoachContext): Exercise | null {
  if (ctx.run?.phase === "result") {
    const here = lastTakeHere(ctx);
    if (here) return here.exercise;
  }
  return ctx.exercise ? withVariant(ctx.exercise, ctx.variantSeed ?? null) : null;
}

// `planStepHere` and `pathIdHere` live in `cards.ts` (review c2b2ab L5: the
// Take cards' `noteOf` falls back to the running step's Path as these do).
export { planStepHere };

/**
 * "From the Path · Step N": the Step's number when it is known. The player's
 * own exercises are on no Path: their words are the app's, from the recipe.
 */
function fromPath(ctx: CoachContext): BlockSource {
  if (pathIdHere(ctx) === MY_EXERCISES_PATH) return APP;
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
  // No reading of a Take for an ungraded player: the general cue only. Off the
  // result screen, a Take of another variant than the one on screen is not
  // read either (review c2b2a M2): its cue was for notes no longer there.
  const sameNotes = ctx.run?.phase === "result" || (takeSeedHere(ctx) ?? null) === (ctx.variantSeed ?? null);
  const note = ungradedPlayer(ctx) || !sameNotes ? null : noteOf(ctx);
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

/**
 * The reasons whose sentence says why the part is at its tempo (review c2b2a
 * L3). The others say why the part is in the plan (a review is due, a Path's
 * turn), which is not an answer to "why this tempo?".
 */
const TEMPO_REASONS: ReadonlySet<Reason["code"]> = new Set<Reason["code"]>([
  "firstEver",
  "newExercise",
  "newStep",
  "nextInStep",
  "newFromSibling",
  "easing",
  "climb",
  "climbFast",
  "notCaught",
  "backEased",
  "warmUp",
  "warmUpClean",
  "edge",
  "edgeFirst",
  "placement",
  "testOut",
  "benchmark",
  "finisher",
  "playedUngraded",
]);

function saysTheTempo(reason: Reason): boolean {
  if (reason.code === "reviewDue" || reason.code === "passedKeepGoing") return typeof reason.values.bpm === "number";
  return TEMPO_REASONS.has(reason.code);
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
  const lines: Line[] = [line("ask.card.plan.tempoPlanned", { bpm: planned })];
  if (saysTheTempo(step.why)) lines.push(reasonLine(step.why));
  if (ctx.run.bpm > 0 && ctx.run.bpm !== planned) lines.push(line("ask.card.plan.tempoNow", { bpm: ctx.run.bpm }));
  return { shape, lines, source: APP };
}

/** "What's next?": the next part of the plan the Session runs, as that plan holds it. */
export function planNext(ctx: CoachContext): FactCard | NoCard {
  const step = planStepHere(ctx);
  const plan = runningPlan(ctx);
  if (!step || !plan || !ctx.run) return noCard("ask.card.plan.notInPlan");
  const next = plan.steps[ctx.run.stepIndex + 1];
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
  const pathId = pathIdHere(ctx);
  if (!exercise || !pathId) return noCard("ask.card.path.noExercise");
  const shape: PathCardShape = "plan_return";
  if (pathId === MY_EXERCISES_PATH) return { shape, lines: [line("ask.card.plan.returnMine")], source: APP };
  if (exercise.grading !== "graded") return { shape, lines: [line("ask.card.plan.returnUngraded")], source: APP };
  // Graded with no pass tempo: never passed, so never in the schedule (`isGradable`, review c2b2a L6).
  if (!isGradable(exercise)) return { shape, lines: [line("ask.card.plan.returnNoPassTempo")], source: APP };
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

/**
 * A chord's notes, spelled by letter (`spellChord`: every quality has a row
 * since c2b2ab, review H3). Null for a symbol the speller cannot read (which
 * `symbolOf` already refuses): never a pitch named with a guessed letter.
 */
export function notesOfChord(symbol: string): string[] | null {
  try {
    return spellChord(symbol);
  } catch {
    return null;
  }
}

/** "What notes are in F7?": spelled by the app, drawn by `show_chord`. */
export function chordNotesCard(root: string, suffix: string): FactCard {
  const shape: PathCardShape = "chord_notes";
  const symbol = symbolOf(root, suffix);
  const chord = symbol ? parseChordName(symbol) : null;
  const notes = symbol && chord ? notesOfChord(symbol) : null;
  if (!symbol || !chord || !notes) return unknownChord(root, shape);
  return {
    shape,
    lines: [line("ask.card.theory.chordNotes", { chord: symbol, notes: notes.join(" ") })],
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
 * Where a chord sits in a key, for the qualities whose own key is not one
 * they are the home chord of (review c2b2a H2): `scalesForChord` reads the
 * chord where it occurs in the key, and the home key gave Bm7b5 B natural
 * minor (F# against the chord's F). Each row is the place the theory code
 * itself names for the quality (its comments in `jam/scales.ts`): semitones
 * and letters from the chord's root down to the key's, the key's mode, and
 * the degree the sentence says.
 */
type Placement = { semitones: number; letters: number; mode: "major" | "minor"; degree: string };

const V_OF_MAJOR: Placement = { semitones: 5, letters: 3, mode: "major", degree: "V" };
const V_OF_MINOR: Placement = { semitones: 5, letters: 3, mode: "minor", degree: "V" };

const PLACED: Partial<Record<ChordQuality, Placement>> = {
  // The iiø of a minor key: Bm7b5 in A minor.
  m7b5: { semitones: -2, letters: -1, mode: "minor", degree: "ii" },
  // The vii° of a major key: Bdim in C major.
  dim: { semitones: 1, letters: 1, mode: "major", degree: "vii" },
  // The vii°7 of a minor key (its harmonic minor): Bdim7 in C minor.
  dim7: { semitones: 1, letters: 1, mode: "minor", degree: "vii" },
  // The III+ of a minor key (its harmonic minor): Eb aug in C minor.
  aug: { semitones: -3, letters: -2, mode: "minor", degree: "III" },
  // The altered dominants: the V of a minor key.
  "7sharp5": V_OF_MINOR,
  "7b9": V_OF_MINOR,
  "7sharp9": V_OF_MINOR,
  // A dominant is the V of a major key, not its home chord.
  "7": V_OF_MAJOR,
  "9": V_OF_MAJOR,
  "11": V_OF_MAJOR,
  "13": V_OF_MAJOR,
  "7sus4": V_OF_MAJOR,
  "7sus2": V_OF_MAJOR,
  "9sus4": V_OF_MAJOR,
};

/** Letters above a root for a number of semitones above it, as a scale's root is written. */
const LETTERS_FOR_SEMITONES = [0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6] as const;

/**
 * A note `semitones` above the typed root, on the letter given: `letter` is
 * what a sentence says, always (review c2b2ab L1: Gb7 is the V chord of Cb
 * major, never "of B major", which by letter is false); `app` is the name the
 * app's controls take (`ROOT_NAMES`), the enharmonic one for Cb, Fb, E#, B#
 * and a double accidental, used only as `show_scale`'s argument.
 */
function nameAbove(typed: string, semitones: number, letters: number, fallback: "sharp" | "flat", pc: number): { letter: string; app: string } {
  const letter = spellAbove(typed, semitones, letters);
  return { letter, app: ROOT_NAMES.includes(letter) ? letter : noteName(pc, fallback) };
}

/**
 * "What fits over F?": `scalesForChord` in a key the sentence names: the
 * chord's home key, or for the qualities in `PLACED` the key the chord occurs
 * in, with its degree. Only the scales that hold every note of the chord are
 * offered (a pentatonic missing the seventh, a blues scale with the minor
 * third over a major one, are not); none left is said, with nothing drawn.
 * Each is spelled by letter from the root as the player typed it (review L4:
 * "Gb" is Gb major, not F#). The first is drawn.
 */
export function scaleFits(root: string, suffix: string): FactCard {
  const shape: PathCardShape = "scale_fits";
  const symbol = symbolOf(root, suffix);
  const chord = symbol ? parseChordName(symbol) : null;
  if (!symbol || !chord) return unknownChord(root, shape);
  const typed = chordRootName(symbol);
  const placed = PLACED[chord.quality];
  const key: Key = placed ? { root: pitchClass(chord.root + placed.semitones), mode: placed.mode } : homeKeyOf(chord);
  const spelling = spellingForKey(key);
  const keyRoot = placed ? nameAbove(typed, placed.semitones, placed.letters, spelling, key.root) : { letter: typed, app: typed };
  const tones = chordNotes(chord);
  const suggestions = scalesForChord(chord, key).filter((s) => tones.every((pc) => s.pitchClasses.includes(pc)));
  if (suggestions.length === 0) {
    // What was checked, not a claim about every scale the app has (review
    // c2b2ab M1: G7#9's notes are all in the app's half-whole diminished, which
    // `scalesForChord` does not pick for it in C minor).
    return {
      shape,
      lines: [line(key.mode === "minor" ? "ask.card.theory.scalesNoneMinor" : "ask.card.theory.scalesNoneMajor", { chord: symbol, root: keyRoot.letter })],
      source: APP,
    };
  }
  const intro = placed
    ? line(placed.mode === "minor" ? "ask.card.theory.scalesPlacedMinor" : "ask.card.theory.scalesPlacedMajor", {
        chord: symbol,
        degree: placed.degree,
        root: keyRoot.letter,
      })
    : line(key.mode === "minor" ? "ask.card.theory.scalesIntroMinor" : "ask.card.theory.scalesIntroMajor", { chord: symbol, root: keyRoot.letter });
  const lines: Line[] = [intro];
  const named = suggestions.map((s) => {
    // The scale's root by letter: the key's root as said above, else from the chord's as typed.
    const offset = pitchClass(s.root - chord.root);
    const name =
      s.root === key.root ? keyRoot : nameAbove(typed, offset, LETTERS_FOR_SEMITONES[offset], spelling, s.root);
    const notes = spellScaleByLetter(name.letter, s.scale) ?? scaleNotes(s.root, s.scale).map((pc) => noteName(pc, spelling));
    return { s, name, notes };
  });
  for (const { s, name, notes } of named) {
    lines.push(line("ask.card.theory.scale", { root: name.letter, name: SCALE_NAMES_EN[s.scale], notes: notes.join(" ") }));
  }
  const first = named[0];
  return { shape, lines, source: APP, then: { tool: "show_scale", args: { root: first.name.app, scale: first.s.scale } } };
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

type PassBarOf = Exercise["passBars"][number];

/** A pass bar's minimum as a whole percentage, for a ratio metric; else null. */
function percentOf(bar: PassBarOf): number | null {
  return typeof bar.min === "number" && bar.min > 0 && bar.min <= 1 ? Math.round(bar.min * 100) : null;
}

/** The two checks `pass.rs` measures with `evenness` (the same formula, so the same milliseconds). */
function isEvenness(bar: PassBarOf): boolean {
  return (bar.metric === "timingEvenness" || bar.metric === "evennessHold") && typeof bar.min === "number" && bar.min > 0 && bar.min < 1;
}

/**
 * "What does 85% even mean?": a pass mark of this Exercise in words.
 *
 * - No number asked: each evenness pass mark, in milliseconds at this tempo.
 * - A number one of its marks has: THAT mark's own sentence (review c2b2a M1):
 *   evenness and evenness held to the end in milliseconds (`pass.rs` measures
 *   both with `evenness`), notes heard as a share of the written notes. A mark
 *   of another check, which the app has no sentence for: no card.
 * - A number none of its marks has: said first, then the evenness marks.
 */
export function passMarkMs(ctx: CoachContext, asked: number | null): FactCard | NoCard {
  const shape: PathCardShape = "pass_mark_ms";
  // The owner's relay decision (2026-11-21): a player who chose no grading has
  // no pass mark set; asked, the card says so and where grading is turned on.
  if (choseNoGrading(ctx)) return { shape, lines: [line("ask.card.term.noPassMarkSet")], source: APP };
  const exercise = played(ctx);
  if (!exercise || !ctx.exercise) return noCard("ask.card.path.noExercise");
  if (exercise.grading !== "graded") return { shape, lines: [line("ask.card.term.ungradedExercise")], source: APP };
  const timingMarks = exercise.passBars.filter((b) => b.metric === "timingEvenness" && isEvenness(b));
  const matching = asked === null ? [] : exercise.passBars.filter((b) => percentOf(b) === asked);
  const lines: Line[] = [];
  let chosen: PassBarOf[];
  if (asked === null) chosen = timingMarks;
  else if (matching.length === 0) {
    lines.push(line("ask.card.term.noSuchMark", { value: asked }));
    chosen = timingMarks;
  } else chosen = matching;
  // Every check at the asked percentage is named (review c2b2ab L4: notes
  // heard and accents both at 90% gave the notes-heard sentence alone).
  for (const b of chosen) {
    const key = MARK_SENTENCE[b.metric];
    if (key) lines.push(line(key, { bar: percentOf(b) ?? 0 }));
  }
  const even = chosen.filter(isEvenness);
  const unnamed = matching.some((b) => !MARK_SENTENCE[b.metric] && !isEvenness(b));
  if (even.length === 0) {
    if (matching.length === 0) lines.push(line("ask.card.term.evenNone"));
    // The asked mark belongs to a check the app has no sentence for: no card, never another check's numbers.
    if (lines.length === 0) return noCard("ask.card.term.markOther", { value: asked ?? 0 });
    if (unnamed) lines.push(line("ask.card.term.markAlso", { value: asked ?? 0 }));
    return { shape, lines, source: APP };
  }
  const also = unnamed ? [line("ask.card.term.markAlso", { value: asked ?? 0 })] : [];
  const bpm = tempoHere(ctx, exercise);
  // `buildTake` reads the Path's id only; `exercise` is the variant played already.
  const plan = bpm ? buildTake({ id: pathIdHere(ctx) ?? "" } as PathDoc, exercise, bpm, null) : null;
  const gapBeats = plan ? smallestGapBeats(plan.schedule.onsets) : null;
  // The click counts quarter notes on these meters only; elsewhere a beat is not
  // known to be the schedule's beat, so no milliseconds are said.
  if (!bpm || gapBeats === null || exercise.meter.denominator !== 4) {
    lines.push(line("ask.card.term.evenNoMs"), ...also);
    return { shape, lines, source: APP };
  }
  const gapMs = gapBeats * (60000 / bpm);
  for (const m of even) {
    const mark = m.min as number;
    const values = { bar: Math.round(mark * 100), bpm, gap: Math.round(gapMs), ms: Math.round(evennessSpreadMs(mark, gapMs)) };
    lines.push(
      m.metric === "evennessHold"
        ? line("ask.card.term.holdMs", values)
        : line("ask.card.term.evenMs", values),
    );
  }
  lines.push(line("ask.card.term.evenHow"), ...also);
  return { shape, lines, source: APP };
}

/** The pass marks of a ratio check with a sentence of their own, besides the two evenness ones (in ms). */
const MARK_SENTENCE: Readonly<Partial<Record<string, string>>> = {
  notesHeard: "ask.card.term.heardMark",
  accentPlacement: "ask.card.term.accentsMark",
  noteIdentity: "ask.card.term.notesMark",
};

/**
 * A player who chose to play without grading (Settings' "Just play", or "Just
 * play" chosen in this Session), not one whose input is off or whose Take is
 * the one "for your eyes": for them no pass mark is set at all.
 */
function choseNoGrading(ctx: CoachContext): boolean {
  return ctx.grading === "off" || ctx.run?.ungraded === "gradingOff" || ctx.run?.ungraded === "chosen";
}

/** "What is a clean tempo?": the rule, then the player's own number on this Exercise. */
export function cleanTempo(ctx: CoachContext): FactCard {
  const shape: PathCardShape = "clean_tempo";
  const lines: Line[] = [line("ask.card.term.clean", { need: CLEAN_TEMPO_MIN_BARS })];
  // The same player as `pass_mark_ms`'s: no pass mark set, said the same way.
  if (choseNoGrading(ctx)) return { shape, lines: [...lines, line("ask.card.term.noPassMarkSet")], source: APP };
  const exercise = ctx.exercise;
  const pathId = pathIdHere(ctx);
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
