/**
 * The Path, plan, theory and term cards (leg c2b2a): every sentence each can
 * say, the situation it is true for, and the near situation where it must not
 * be said. The table in `plans/coach/progress/c2b2a.md` names these tests.
 */
import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { CHORD_SUFFIXES } from "../blocks/spec";
import { buildCoachContext, type CoachContext, type CoachPath, type CoachSources, type CoachStep } from "../context";
import type { Line } from "../tools/types";
import { runIn } from "../tools/testPaths";
import { nameToPitchClass, parseChordName } from "../../jam/harmony";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import { spellChord } from "../../paths/theory";
import { reasonLine } from "../../session/coachWords";
import { exerciseWords } from "../../session/exerciseWords";
import type { SessionPlan } from "../../session/planner";
import { shownCleanTempoOf, type TakeFacts } from "../../session/progress";
import { reviewStateOf } from "../../session/rotation";
import { IDLE, runReducer, type RunState } from "../../session/runner";
import { ALT, DAY, NOW, take as row } from "../../session/testKit";
import { finding, fixture, TUNE } from "./cardFixtures";
import { isCard, noteOf, type FactCard, type NoCard } from "./cards";
import { runFactCard } from "./intents";
import {
  chordNotesCard,
  cleanTempo,
  evennessSpreadMs,
  exerciseHow,
  exercisePurpose,
  exerciseTry,
  homeKeyOf,
  MY_EXERCISES_PATH,
  passMarkMs,
  planMinutes,
  planNext,
  planReturn,
  planSkip,
  planTempo,
  planWhy,
  scaleFits,
  UNKNOWN_SUFFIX,
} from "./pathCards";

const PATH: CoachPath = { id: ALT.id, title: ALT.title, kind: ALT.kind, goal: ALT.goal, gradingLimits: ALT.gradingLimits };
const STEP_OF_TUNE = ALT.steps.find((s) => s.exercises.some((e) => e.id === TUNE.id))!;
const STEP: CoachStep = {
  id: STEP_OF_TUNE.id,
  order: STEP_OF_TUNE.order,
  title: STEP_OF_TUNE.title,
  goal: STEP_OF_TUNE.goal,
  why: STEP_OF_TUNE.why,
  howTo: STEP_OF_TUNE.howTo,
  payoff: STEP_OF_TUNE.payoff,
};

/** The tune with cues of its own: two for uneven timing (the first time, the second), and a general one. */
const CUED = {
  ...TUNE,
  cues: [
    { when: "even", say: "Even the first evenness cue." },
    { when: "even", say: "Even the second evenness cue." },
    { when: "even", say: "The general cue.", general: true },
  ],
} as Exercise;

function card(x: FactCard | NoCard): FactCard {
  if (!isCard(x)) throw new Error(`no card: ${x.line.key}`);
  return x;
}

function noCard(x: FactCard | NoCard): Line {
  if (isCard(x)) throw new Error(`a card: ${x.shape}`);
  return x.line;
}

const keys = (c: FactCard) => c.lines.map((l) => l.key);
const english = (l: Line) => i18n.getFixedT("en")(l.key, l.values);

/** On the Session's result screen of a Take of the tune, with the Path and the Step known. */
function here(over: Partial<CoachContext> = {}, shape: Parameters<typeof fixture>[0] = {}): CoachContext {
  return fixture(shape, { path: PATH, step: STEP, ...over }).ctx;
}

function planOf(steps: SessionPlan["steps"]): SessionPlan {
  return { minutes: 10, mood: "first", daysAway: null, steps };
}

const PART = (bpm: number, title = TUNE.title) =>
  ({
    kind: "exercise",
    id: `p-${title}-${bpm}`,
    role: "focus",
    pathId: ALT.id,
    stepId: STEP.id,
    exerciseId: TUNE.id,
    title,
    bpm,
    minutes: 4,
    variantSeed: null,
    why: { code: "climb", values: { bpm: bpm - 5, next: bpm } },
  }) as SessionPlan["steps"][number];

describe("the Exercise, quoted from the Path", () => {
  it("what is this for: the pack's purpose, byte-equal, from the Path · Step N", () => {
    const c = card(exercisePurpose(here()));
    expect(keys(c)).toEqual(["ask.card.path.purposeIntro", "ask.card.path.quote"]);
    expect(c.lines[1].values.text).toBe(exerciseWords(TUNE, TUNE).purpose);
    expect(c.lines[1].values.text).toBe(TUNE.purpose);
    expect(c.source).toEqual({ kind: "path", step: STEP.order });
  });

  it("how do I play it: every how-to line, byte-equal and in order", () => {
    const c = card(exerciseHow(here()));
    expect(c.lines[0].key).toBe("ask.card.path.howIntro");
    expect(c.lines.slice(1).map((l) => l.values.text)).toEqual(TUNE.howTo.filter((s) => s.trim() !== ""));
  });

  it("an Exercise with no words of its own says so, and never fills in", () => {
    const bare = { ...TUNE, purpose: "", howTo: [] } as Exercise;
    expect(keys(card(exercisePurpose(here({ exercise: bare }, { exercise: bare }))))).toEqual(["ask.card.path.purposeNone"]);
    expect(keys(card(exerciseHow(here({ exercise: bare }, { exercise: bare }))))).toEqual(["ask.card.path.howNone"]);
  });

  describe("an Exercise with two variants (review c2b2a M2)", () => {
    const v0 = { id: "v0", label: "A", params: {}, pool: "p", tab: TUNE.tab, position: TUNE.position, crossing: TUNE.crossing, notes: TUNE.notes, rests: TUNE.rests, backing: TUNE.backing, computed: TUNE.computed };
    const v1 = { ...v0, id: "v1", label: "B", purpose: "Variant B's own purpose.", howTo: ["Variant B, first line."], cues: [{ when: "lastBars", say: "Variant B's own cue.", general: true }] };
    const TWO = { ...TUNE, variation: { dimensions: [], pooled: [], notPooled: [], variants: [v0, v1] } } as unknown as Exercise;
    /** The last Take played variant 0 and is stored with it; the step's variant is `seed`. */
    const at = (phase: "result" | "ready", seed: number) => {
      const stored = { ...row(TWO.id, { bpm: 90, startedAt: NOW, variantSeed: 0, facts: {} }), id: "now" };
      return here({ exercise: TWO, variantSeed: seed, run: runIn(phase), progress: { states: [], ceilings: [], takes: [stored] } }, { exercise: TWO });
    };

    it("on the Take's result: the words of the variant it played", () => {
      expect(card(exercisePurpose(at("result", 0))).lines[1].values.text).toBe(TUNE.purpose);
    });

    it("on a ready screen after the player chose variant B: B's purpose, how-to and cue, the ones the next Take plays", () => {
      const ctx = at("ready", 1);
      expect(card(exercisePurpose(ctx)).lines[1].values.text).toBe("Variant B's own purpose.");
      expect(card(exerciseHow(ctx)).lines.slice(1).map((l) => l.values.text)).toEqual(["Variant B, first line."]);
      const c = card(exerciseTry(ctx));
      expect(c.lines).toEqual([{ key: "ask.card.path.tryGeneral", values: {} }, { key: "ask.card.path.quote", values: { text: "Variant B's own cue." } }]);
    });
  });

  it("no Exercise on screen: no card, one line", () => {
    expect(noCard(exercisePurpose({ ...here(), exercise: undefined, lastTake: undefined })).key).toBe("ask.card.path.noExercise");
  });

  it("what should I try: the cue the result screen picks, byte-equal; 'what Take N measured' only when it was measured", () => {
    const ctx = here({ exercise: CUED }, { exercise: CUED, slipped: [0, 4], failOn: "timingEvenness" });
    const c = card(exerciseTry(ctx));
    expect(c.lines).toEqual([
      { key: "ask.card.path.tryMeasured", values: { take: 2 } },
      { key: "ask.card.path.quote", values: { text: "Even the first evenness cue." } },
    ]);
  });

  it("playing without grading: the general cue only, never one picked by a measurement", () => {
    const c = card(exerciseTry(here({ grading: "off", exercise: CUED }, { exercise: CUED, slipped: [0, 4], failOn: "timingEvenness" })));
    expect(c.lines).toEqual([
      { key: "ask.card.path.tryGeneral", values: {} },
      { key: "ask.card.path.quote", values: { text: "The general cue." } },
    ]);
  });

  it("the cue for what Take N measured is the result screen's: the repeat count is this Session's (review c2b2a M3)", () => {
    const START = NOW - 600_000;
    const shape = { exercise: CUED, slipped: [0, 4], failOn: "timingEvenness" as const, findings: [finding("consistentMiss", [0, 0])] };
    const perBar = Array.from({ length: 10 }, (_u, bar) => ({ due: 6, heard: 6, evenness: bar === 0 || bar === 4 ? 0.6 : 0.95 }));
    const before = (session: number) =>
      row(CUED.id, {
        bpm: 90,
        startedAt: START - 60_000,
        facts: { verdict: "belowBar", headlineMetric: "timingEvenness", headlineValue: 0.79, headlineMin: 0.85, session, measures: { perBar, barsPlayed: 10 } } as unknown as TakeFacts,
      });
    const at = (session: number) =>
      here({ exercise: CUED, run: { ...runIn("result"), startedAt: START }, progress: { states: [], ceilings: [], takes: [before(session)] } }, shape);
    // The same slip at the same tempo, but in an earlier Session: the screen counts it once, and says the first cue.
    expect(noteOf(at(START - 86_400_000))?.repeat).toBe(1);
    expect(card(exerciseTry(at(START - 86_400_000))).lines[1].values.text).toBe("Even the first evenness cue.");
    // In this Session: the second time, the second cue.
    expect(noteOf(at(START))?.repeat).toBe(2);
    expect(card(exerciseTry(at(START))).lines[1].values.text).toBe("Even the second evenness cue.");
    // No Path in the context and no stored row for the Take: the running step's Path is read (review c2b2ab L5).
    const fromStep = here(
      {
        exercise: CUED,
        path: undefined,
        run: { ...runIn("result"), startedAt: START, stepIndex: 0, plan: planOf([PART(80)]) },
        progress: { states: [], ceilings: [], takes: [before(START)] },
      },
      shape,
    );
    expect(fromStep.lastTake?.takeId === undefined || !fromStep.progress.takes.some((t) => t.id === fromStep.lastTake?.takeId)).toBe(true);
    expect(noteOf(fromStep)?.repeat).toBe(2);
  });

  it("an Exercise with no cues: 'no cue', never a made-up one", () => {
    const bare = { ...TUNE, cues: [] } as Exercise;
    expect(keys(card(exerciseTry(here({ exercise: bare }, { exercise: bare }))))).toEqual(["ask.card.path.tryNone"]);
  });
});

describe("the plan", () => {
  const plan = planOf([PART(80), PART(90, "Next one")]);

  it("why this: the plan step's own reason, as reasonLine words it", () => {
    const c = card(planWhy(here({ plan })));
    expect(c.lines.slice(1)).toEqual([reasonLine(plan.steps[0].why)]);
    expect(c.source).toEqual({ kind: "app" });
  });

  it("why this tempo: the planned tempo; the tempo now only when it moved", () => {
    const same = card(planTempo(here({ plan, run: { ...here().run!, bpm: 80 } })));
    expect(same.lines[0]).toEqual({ key: "ask.card.plan.tempoPlanned", values: { bpm: 80 } });
    expect(keys(same)).not.toContain("ask.card.plan.tempoNow");
    const moved = card(planTempo(here({ plan, run: { ...here().run!, bpm: 85 } })));
    expect(moved.lines[moved.lines.length - 1]).toEqual({ key: "ask.card.plan.tempoNow", values: { bpm: 85 } });
  });

  it("what's next: the plan's next part with its tempo; the last part says so", () => {
    expect(card(planNext(here({ plan }))).lines).toEqual([{ key: "ask.card.plan.nextBpm", values: { title: "Next one", bpm: 90, minutes: 4 } }]);
    const last = here({ plan, run: { ...here().run!, stepIndex: 1 } });
    expect(keys(card(planNext(last)))).toEqual(["ask.card.plan.nextLast"]);
  });

  it("no running plan: no card (typed, the question goes on to the next answerer)", () => {
    expect(noCard(planWhy(here({ plan: undefined }))).key).toBe("ask.card.plan.notInPlan");
    expect(noCard(planNext(here({ plan: undefined }))).key).toBe("ask.card.plan.notInPlan");
  });

  it("can I skip ahead: the rule, ending in test_out's call; in a Session, no card", () => {
    expect(noCard(planSkip(here())).key).toBe("ask.card.plan.skipInSession");
    const c = card(planSkip({ ...here(), screen: "paths", run: undefined }));
    expect(c.then).toEqual({ tool: "test_out", args: {} });
  });

  it("I have 7 minutes: the lengths, the nearest, and set_minutes' call with it", () => {
    const today = { ...here(), screen: "today" as const, run: undefined };
    const c = card(planMinutes(today, 7));
    expect(c.lines).toEqual([
      { key: "ask.card.plan.minutes", values: { list: "5, 10, 15, 20" } },
      { key: "ask.card.plan.minutesSnapped", values: { asked: 7, to: 5 } },
    ]);
    expect(c.then).toEqual({ tool: "set_minutes", args: { minutes: 5 } });
    expect(keys(card(planMinutes(today, 15)))).toEqual(["ask.card.plan.minutes"]);
    expect(noCard(planMinutes(here(), 5)).key).toBe("ask.card.plan.minutesInSession");
  });

  describe("when does this come back", () => {
    const passAt = TUNE.tempo.passAtBpm ?? 80;
    const ceiling = { exerciseKey: `${ALT.id}/${TUNE.id}`, cleanBpm: passAt, lastPracticed: NOW - 2 * DAY };
    const passedRow = row(TUNE.id, { pathId: ALT.id, bpm: passAt, passed: true, startedAt: NOW - 2 * DAY, facts: { verdict: "passed" } });

    it("not passed: reviews start once it is", () => {
      expect(keys(card(planReturn(here())))).toEqual(["ask.card.plan.returnNotPassed"]);
    });

    it("passed: the schedule's own day and tempo (reviewStateOf)", () => {
      const progress = { states: [], takes: [passedRow], ceilings: [ceiling] } as unknown as CoachContext["progress"];
      const ctx = here({ progress, now: NOW });
      const state = reviewStateOf(progress, { path: ALT, step: STEP_OF_TUNE as Step, exercise: TUNE });
      expect(state).not.toBeNull();
      const days = Math.ceil((state!.dueAt - NOW) / DAY);
      const c = card(planReturn(ctx));
      expect(c.lines).toEqual([
        days <= 0
          ? { key: "ask.card.plan.returnDue", values: { bpm: state!.bpm } }
          : { key: "ask.card.plan.returnDays", values: { count: days, bpm: state!.bpm } },
      ]);
    });

    it("a Take marked not fair: the schedule is not quoted", () => {
      const unfair = row(TUNE.id, { pathId: ALT.id, bpm: passAt, passed: true, startedAt: NOW - DAY, facts: { verdict: "passed", fair: "no" } });
      const progress = { states: [], takes: [passedRow, unfair], ceilings: [ceiling] } as unknown as CoachContext["progress"];
      const c = card(planReturn(here({ progress, now: NOW })));
      expect(keys(c)).toEqual(["ask.card.plan.returnNotFair"]);
      expect(c.lines.some((l) => "bpm" in l.values || "count" in l.values)).toBe(false);
    });

    it("my own exercises: no review schedule", () => {
      expect(keys(card(planReturn(here({ path: { ...PATH, id: MY_EXERCISES_PATH } }))))).toEqual(["ask.card.plan.returnMine"]);
    });
  });
});

describe("theory, worked out by the app", () => {
  it("the notes of F7 are spellChord's", () => {
    const c = chordNotesCard("F", "7");
    expect(c.lines).toEqual([{ key: "ask.card.theory.chordNotes", values: { chord: "F7", notes: spellChord("F7").join(" ") } }]);
    expect(c.lines[0].values.notes).toBe("F A C Eb");
    expect(c.then).toEqual({ tool: "show_chord", args: { chord: "F7" } });
    expect(c.source).toEqual({ kind: "app" });
  });

  it("a sharp root and a minor seventh", () => {
    expect(chordNotesCard("F#", "m7").lines[0].values).toEqual({ chord: "F#m7", notes: spellChord("F#m7").join(" ") });
  });

  // Written out by hand from the intervals (review c2b2a H3): every chord tone on its own letter.
  const SPELLED: Array<[string, string, string]> = [
    ["C", "9", "C E G Bb D"],
    ["F", "9", "F A C Eb G"],
    ["F", "sus4", "F Bb C"],
    ["D", "sus2", "D E A"],
    ["C", "m6", "C Eb G A"],
    ["C", "m(maj7)", "C Eb G B"],
    ["C", "m9", "C Eb G Bb D"],
    ["C", "7sus4", "C F G Bb"],
    ["C", "7#9", "C E G Bb D#"],
    ["C", "7b9", "C E G Bb Db"],
    ["C", "7#5", "C E G# Bb"],
    ["C", "6", "C E G A"],
    ["C", "6/9", "C E G A D"],
    ["C", "add9", "C D E G"],
    ["C", "m(add9)", "C Eb G D"],
    ["C", "11", "C E G Bb D F"],
    ["C", "m11", "C Eb G Bb D F"],
    ["C", "13", "C E G Bb D A"],
    ["Ab", "13", "Ab C Eb Gb Bb F"],
    ["Bb", "maj7", "Bb D F A"],
    ["Eb", "maj9", "Eb G Bb D F"],
    ["G", "9sus4", "G C D F A"],
    ["B", "m7b5", "B D F A"],
    ["F#", "7#5", "F# A# C## E"],
    ["Gb", "dim7", "Gb Bbb Dbb Fbb"],
  ];

  it.each(SPELLED)("%s%s is spelled %s", (root, suffix, notes) => {
    expect(chordNotesCard(root, suffix).lines[0].values.notes).toBe(notes);
  });

  /** Each quality's chord tones as degrees, as a chord chart writes them: degree N is N-1 letters above the root. */
  const DEGREES: Record<string, string[]> = {
    "": ["1", "3", "5"], m: ["1", "b3", "5"], "5": ["1", "5"], dim: ["1", "b3", "b5"], aug: ["1", "3", "#5"],
    "7": ["1", "3", "5", "b7"], maj7: ["1", "3", "5", "7"], m7: ["1", "b3", "5", "b7"], m7b5: ["1", "b3", "b5", "b7"],
    dim7: ["1", "b3", "b5", "bb7"], sus2: ["1", "2", "5"], sus4: ["1", "4", "5"], "6": ["1", "3", "5", "6"],
    m6: ["1", "b3", "5", "6"], add9: ["1", "2", "3", "5"], "9": ["1", "3", "5", "b7", "9"], maj9: ["1", "3", "5", "7", "9"],
    m9: ["1", "b3", "5", "b7", "9"], "11": ["1", "3", "5", "b7", "9", "11"], "13": ["1", "3", "5", "b7", "9", "13"],
    m11: ["1", "b3", "5", "b7", "9", "11"], m13: ["1", "b3", "5", "b7", "9", "13"], "7sus4": ["1", "4", "5", "b7"],
    "7sus2": ["1", "2", "5", "b7"], "7#5": ["1", "3", "#5", "b7"], "6/9": ["1", "3", "5", "6", "9"],
    "m(add9)": ["1", "b3", "5", "9"], "7b9": ["1", "3", "5", "b7", "b9"], "7#9": ["1", "3", "5", "b7", "#9"],
    maj13: ["1", "3", "5", "7", "9", "13"], "9sus4": ["1", "4", "5", "b7", "9"], "m(maj7)": ["1", "b3", "5", "7"],
  };
  const MAJOR_SEMITONES: Record<number, number> = { 1: 0, 2: 2, 3: 4, 4: 5, 5: 7, 6: 9, 7: 11, 9: 2, 11: 5, 13: 9 };
  const LETTERS = "CDEFGAB";
  const TWELVE = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];

  it("every quality the app spells, on all twelve roots: each tone on its degree's letter, at its degree's pitch", () => {
    expect(Object.keys(DEGREES).sort()).toEqual([...CHORD_SUFFIXES].sort());
    for (const root of TWELVE) {
      for (const [suffix, degrees] of Object.entries(DEGREES)) {
        const notes = String(chordNotesCard(root, suffix).lines[0].values.notes).split(" ");
        expect(notes, `${root}${suffix}`).toHaveLength(degrees.length);
        degrees.forEach((degree, i) => {
          const n = Number(degree.replace(/[b#]/g, ""));
          const shift = [...degree].reduce((s, ch) => s + (ch === "#" ? 1 : ch === "b" ? -1 : 0), 0);
          const letter = LETTERS[(LETTERS.indexOf(root[0]) + n - 1) % 7];
          expect(notes[i][0], `${root}${suffix} degree ${degree}`).toBe(letter);
          expect(nameToPitchClass(notes[i]), `${root}${suffix} degree ${degree}`).toBe((nameToPitchClass(root)! + MAJOR_SEMITONES[n] + shift + 12) % 12);
        });
      }
    }
  });

  it("a chord the app cannot read: 'I don't know', with what it can spell on that root, and nothing drawn", () => {
    const c = chordNotesCard("F", UNKNOWN_SUFFIX);
    expect(c.uncertain).toBe(true);
    expect(c.lines).toEqual([{ key: "ask.card.theory.chordUnknown", values: { root: "F", known: "F, Fm, F7, Fmaj7, Fm7" } }]);
    expect(c.then).toBeUndefined();
    expect(scaleFits("F", UNKNOWN_SUFFIX).then).toBeUndefined();
  });

  /** The card's scale lines as "root name: notes", for rows written by hand. */
  const scaleRows = (c: FactCard) => c.lines.filter((l) => l.key === "ask.card.theory.scale").map((l) => `${l.values.root} ${l.values.name}: ${l.values.notes}`);

  // Written out by hand (review c2b2a H2, L4): the key the sentence names, and every scale offered.
  const FITS: Array<[string, string, Line, string[]]> = [
    ["F", "", { key: "ask.card.theory.scalesIntroMajor", values: { chord: "F", root: "F" } }, ["F Major: F G A Bb C D E", "F Major pentatonic: F G A C D"]],
    ["Gb", "", { key: "ask.card.theory.scalesIntroMajor", values: { chord: "Gb", root: "Gb" } }, ["Gb Major: Gb Ab Bb Cb Db Eb F", "Gb Major pentatonic: Gb Ab Bb Db Eb"]],
    ["C#", "", { key: "ask.card.theory.scalesIntroMajor", values: { chord: "C#", root: "C#" } }, ["C# Major: C# D# E# F# G# A# B#", "C# Major pentatonic: C# D# E# G# A#"]],
    ["A", "m7", { key: "ask.card.theory.scalesIntroMinor", values: { chord: "Am7", root: "A" } }, ["A Natural minor: A B C D E F G", "A Dorian: A B C D E F# G", "A Minor pentatonic: A C D E G"]],
    // A major seventh: the major pentatonic has no B, so it is not offered.
    ["C", "maj7", { key: "ask.card.theory.scalesIntroMajor", values: { chord: "Cmaj7", root: "C" } }, ["C Major: C D E F G A B"]],
    // Half-diminished: the ii of a minor key, never B minor (F# against the chord's F).
    ["B", "m7b5", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "Bm7b5", degree: "ii", root: "A" } }, ["A Natural minor: A B C D E F G", "A Harmonic minor: A B C D E F G#"]],
    ["F#", "m7b5", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "F#m7b5", degree: "ii", root: "E" } }, ["E Natural minor: E F# G A B C D", "E Harmonic minor: E F# G A B C D#"]],
    // Diminished: the vii of a major key, never E minor (B against the chord's Bb).
    ["B", "dim", { key: "ask.card.theory.scalesPlacedMajor", values: { chord: "Bdim", degree: "vii", root: "C" } }, ["C Major: C D E F G A B", "C Harmonic minor: C D Eb F G Ab B"]],
    ["E", "dim", { key: "ask.card.theory.scalesPlacedMajor", values: { chord: "Edim", degree: "vii", root: "F" } }, ["F Major: F G A Bb C D E", "F Harmonic minor: F G Ab Bb C Db E"]],
    ["B", "dim7", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "Bdim7", degree: "vii", root: "C" } }, ["C Harmonic minor: C D Eb F G Ab B"]],
    // Augmented: the III of a minor key, never C harmonic minor over Caug (Eb and G against E and G#).
    ["C", "aug", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "Caug", degree: "III", root: "A" } }, ["C Altered: C Db D# E F# G# Bb", "A Harmonic minor: A B C D E F G#"]],
    ["Eb", "aug", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "Ebaug", degree: "III", root: "C" } }, ["Eb Altered: Eb Fb F# G A B Db", "C Harmonic minor: C D Eb F G Ab B"]],
    // The altered dominants: the V of a minor key. G altered has no D, so it is not offered over G7b9.
    ["G", "7b9", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "G7b9", degree: "V", root: "C" } }, ["C Harmonic minor: C D Eb F G Ab B"]],
    ["G", "7#5", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "G7#5", degree: "V", root: "C" } }, ["G Altered: G Ab A# B C# D# F", "C Harmonic minor: C D Eb F G Ab B"]],
    // A dominant is the V of a major key; the pentatonics and the blues scale lack its third or seventh.
    ["C", "7", { key: "ask.card.theory.scalesPlacedMajor", values: { chord: "C7", degree: "V", root: "F" } }, ["C Mixolydian: C D E F G A Bb"]],
    ["C", "7sus4", { key: "ask.card.theory.scalesPlacedMajor", values: { chord: "C7sus4", degree: "V", root: "F" } }, ["F Major: F G A Bb C D E", "C Minor pentatonic: C Eb F G Bb"]],
  ];

  it.each(FITS)("what fits over %s%s: the key said, and only scales with every chord tone", (root, suffix, intro, rows) => {
    const c = scaleFits(root, suffix);
    expect(c.lines[0]).toEqual(intro);
    expect(scaleRows(c)).toEqual(rows);
    const first = rows[0].split(" ");
    expect(c.then).toEqual({ tool: "show_scale", args: { root: first[0], scale: expect.any(String) } });
  });

  it("G7#9: none of the scales the app picks for it in C minor holds every note; said as that, and nothing drawn (review c2b2ab M1)", () => {
    const c = scaleFits("G", "7#9");
    expect(c.lines).toEqual([{ key: "ask.card.theory.scalesNoneMinor", values: { chord: "G7#9", root: "C" } }]);
    expect(english(c.lines[0])).toBe("In C minor, none of the scales the app picks for G7#9 has every note of the chord in it.");
    expect(c.then).toBeUndefined();
    // The major sentence says the same of a major key.
    expect(english({ key: "ask.card.theory.scalesNoneMajor", values: { chord: "G7", root: "C" } })).toBe(
      "In C major, none of the scales the app picks for G7 has every note of the chord in it.",
    );
  });

  // Review c2b2ab L1: a key whose letter name is Cb, Fb or a double flat is said by its letter;
  // only show_scale's argument takes the app's own name for that pitch. Written out by hand.
  const BY_LETTER: Array<[string, string, Line, string[], string]> = [
    ["Gb", "7", { key: "ask.card.theory.scalesPlacedMajor", values: { chord: "Gb7", degree: "V", root: "Cb" } }, ["Gb Mixolydian: Gb Ab Bb Cb Db Eb Fb"], "Gb"],
    [
      "Bb",
      "dim",
      { key: "ask.card.theory.scalesPlacedMajor", values: { chord: "Bbdim", degree: "vii", root: "Cb" } },
      ["Cb Major: Cb Db Eb Fb Gb Ab Bb", "Cb Harmonic minor: Cb Db Ebb Fb Gb Abb Bb"],
      "B",
    ],
    [
      "Gb",
      "m7b5",
      { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "Gbm7b5", degree: "ii", root: "Fb" } },
      ["Fb Natural minor: Fb Gb Abb Bbb Cb Dbb Ebb", "Fb Harmonic minor: Fb Gb Abb Bbb Cb Dbb Eb"],
      "E",
    ],
    ["Ab", "dim7", { key: "ask.card.theory.scalesPlacedMinor", values: { chord: "Abdim7", degree: "vii", root: "Bbb" } }, ["Bbb Harmonic minor: Bbb Cb Dbb Ebb Fb Gbb Ab"], "A"],
  ];

  it.each(BY_LETTER)("what fits over %s%s: the key by its letter, show_scale by the app's name", (root, suffix, intro, rows, drawn) => {
    const c = scaleFits(root, suffix);
    expect(c.lines[0]).toEqual(intro);
    expect(scaleRows(c)).toEqual(rows);
    expect(c.then?.args.root).toBe(drawn);
  });

  it("Gb7, in words: the V chord of Cb major, never of B major", () => {
    expect(english(scaleFits("Gb", "7").lines[0])).toMatch(/^Gb7 is the V chord of Cb major, /);
  });

  it("every quality, all twelve roots: every scale offered holds every note of the chord", () => {
    for (const root of TWELVE) {
      for (const suffix of CHORD_SUFFIXES) {
        const c = scaleFits(root, suffix);
        const tones = String(chordNotesCard(root, suffix).lines[0].values.notes).split(" ").map((n) => nameToPitchClass(n));
        const scales = c.lines.filter((l) => l.key === "ask.card.theory.scale");
        if (scales.length === 0) expect(["ask.card.theory.scalesNoneMinor", "ask.card.theory.scalesNoneMajor"], `${root}${suffix}`).toContain(keys(c).join());
        for (const l of scales) {
          const pcs = String(l.values.notes).split(" ").map((n) => nameToPitchClass(n));
          for (const t of tones) expect(pcs, `${root}${suffix} over ${l.values.root} ${l.values.name}`).toContain(t);
          // One letter per note in every seven-note scale offered.
          if (pcs.length === 7) expect(new Set(String(l.values.notes).split(" ").map((n) => n[0])).size, `${l.values.root} ${l.values.name}`).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });

  it("a minor chord is the home chord of a minor key", () => {
    expect(scaleFits("A", "m7").lines[0].key).toBe("ask.card.theory.scalesIntroMinor");
    expect(homeKeyOf(parseChordName("Am")!).mode).toBe("minor");
    expect(homeKeyOf(parseChordName("A7")!).mode).toBe("major");
  });
});

describe("the app's computed terms", () => {
  it("the evenness formula agrees with the metric's own note: 0.85 is about 14 ms at sixteenths, 120 BPM", () => {
    expect(Math.round(evennessSpreadMs(0.85, 125))).toBe(14);
    // By hand (review c2b2ab L6): the window is 0.4 × 125 = 50 ms, k = 25, σ = 25 × √(−2 ln 0.75) = 25 × 0.7585 ≈ 19.
    expect(Math.round(evennessSpreadMs(0.75, 125))).toBe(19);
  });

  it("what does 85% mean: each evenness pass mark in ms at this tempo, with the tempo said", () => {
    const two = { ...TUNE, passBars: [{ metric: "timingEvenness", min: 0.85, overBars: 4 }, { metric: "timingEvenness", min: 0.8, overBars: 8 }] } as Exercise;
    const ctx = here({ exercise: two }, { exercise: two });
    const c = card(passMarkMs(ctx, null));
    const msLines = c.lines.filter((l) => l.key === "ask.card.term.evenMs");
    expect(msLines.map((l) => l.values.bar)).toEqual([85, 80]);
    for (const l of msLines) {
      expect(l.values.bpm).toBe(ctx.run!.bpm);
      expect(l.values.ms).toBe(Math.round(evennessSpreadMs(Number(l.values.bar) / 100, Number(l.values.gap))));
    }
  });

  it("a number no pass mark has is said first, never matched to a neighbour", () => {
    const c = card(passMarkMs(here(), 3));
    expect(c.lines[0]).toEqual({ key: "ask.card.term.noSuchMark", values: { value: 3 } });
  });

  it("an Exercise with no evenness check: no milliseconds", () => {
    const noEven = { ...TUNE, passBars: TUNE.passBars.filter((b) => b.metric !== "timingEvenness") } as Exercise;
    expect(keys(card(passMarkMs(here({ exercise: noEven }, { exercise: noEven }), null)))).toEqual(["ask.card.term.evenNone"]);
  });

  it("a clean tempo: the rule, then the player's number as shownCleanTempoOf has it", () => {
    expect(keys(cleanTempo(here()))).toEqual(["ask.card.term.clean", "ask.card.term.cleanNone"]);
    const progress = {
      states: [],
      takes: [row(TUNE.id, { pathId: ALT.id, bpm: 85, passed: true, facts: { verdict: "passed", newClean: true } })],
      ceilings: [{ exerciseKey: `${ALT.id}/${TUNE.id}`, cleanBpm: 85, lastPracticed: NOW - DAY }],
    } as unknown as CoachContext["progress"];
    const c = cleanTempo(here({ progress }));
    expect(c.lines[1]).toEqual({ key: "ask.card.term.cleanYours", values: { bpm: shownCleanTempoOf(progress, ALT.id, TUNE.id)! } });
    expect(c.lines[1].values.bpm).toBe(85);
  });

  it("a clean tempo held by a Take marked not fair is not quoted; the line says such Takes don't count", () => {
    const progress = {
      states: [],
      takes: [row(TUNE.id, { pathId: ALT.id, bpm: 95, passed: true, facts: { verdict: "passed", newClean: true, fair: "no" } })],
      ceilings: [{ exerciseKey: `${ALT.id}/${TUNE.id}`, cleanBpm: 95, lastPracticed: NOW - DAY }],
    } as unknown as CoachContext["progress"];
    const c = cleanTempo(here({ progress }));
    expect(c.lines.map((l) => l.values.bpm)).not.toContain(95);
    expect(keys(c)).toContain("ask.card.term.cleanNotFair");
  });

  it("my own exercises and a player without grading: no number", () => {
    expect(keys(cleanTempo(here({ path: { ...PATH, id: MY_EXERCISES_PATH } })))).toEqual(["ask.card.term.clean", "ask.card.term.cleanMine"]);
    // The same player as pass_mark_ms's below: no pass mark set, said the same way.
    expect(keys(cleanTempo(here({ grading: "off" })))).toEqual(["ask.card.term.clean", "ask.card.term.noPassMarkSet"]);
  });
});

describe("a player who chose no grading asks about a pass mark (the owner's relay decision, 2026-11-21)", () => {
  const NO_MARK =
    'No pass mark is set: you\'re playing without grading, so nothing you play is measured against one. To set one, choose "Grade me" for "Grade my playing" in Settings, under Practice; you can also switch in any Session.';

  it("asked what 85% means with grading off: one line, no pass mark set and where to turn grading on", () => {
    const c = card(passMarkMs(here({ grading: "off" }), 85));
    expect(c.lines).toEqual([{ key: "ask.card.term.noPassMarkSet", values: {} }]);
    expect(english(c.lines[0])).toBe(NO_MARK);
    // Through the runner, as a typed question or a model's pick reaches it.
    const run = runFactCard({ tool: "pass_mark_ms", args: { value: 85 } }, here({ grading: "off" }));
    expect(isCard(run) && run.lines).toEqual([{ key: "ask.card.term.noPassMarkSet", values: {} }]);
  });

  it("'Just play' chosen in this Session: the same line", () => {
    const base = here();
    expect(keys(card(passMarkMs({ ...base, run: { ...base.run!, ungraded: "chosen" } }, 85)))).toEqual(["ask.card.term.noPassMarkSet"]);
  });

  it("not for a player whose input is off: the pass mark is set, and said", () => {
    const base = here();
    const c = card(passMarkMs({ ...base, run: { ...base.run!, ungraded: "inputOff" } }, 85));
    expect(keys(c)).not.toContain("ask.card.term.noPassMarkSet");
  });

  it("the place named is real: Settings, Practice, 'Grade my playing', 'Grade me'", () => {
    const t = i18n.getFixedT("en");
    expect(t("settings.practice.title")).toBe("Practice");
    expect(t("settings.practice.grade")).toBe("Grade my playing");
    expect(t("settings.practice.grading.on")).toBe("Grade me");
  });
});

describe("the plan the Session runs, not Today's (review c2b2a H1)", () => {
  const T0 = NOW - 600_000;
  const warmUp = { ...PART(70, "Warm-up"), why: { code: "warmUp", values: { bpm: 70 } } } as SessionPlan["steps"][number];
  const TODAY = planOf([warmUp, PART(80, "Today's second")]);
  const testOut = { ...PART(120, "Test out"), why: { code: "testOut", values: { step: "Step 3", bpm: 120 } } } as SessionPlan["steps"][number];

  /** The context the host builds: its plan getter still hands Today's plan (the bug), the run is the runner's. */
  function hosted(run: RunState, today: SessionPlan = TODAY): CoachContext {
    return buildCoachContext({
      screen: () => "session",
      locale: () => "en",
      now: () => NOW,
      grading: () => "on",
      input: () => ({ listening: true, direct: true }),
      brain: () => ({ llmCompiled: false, choice: "off", resident: false, fastEnough: false }),
      progress: () => ({ states: [], takes: [], ceilings: [] }),
      plan: () => today,
      run: () => run,
    } as unknown as CoachSources);
  }

  it("Test out started from a Step's page: the tempo, the reason and what is next are the Test out's", () => {
    const run = runReducer(IDLE, { type: "start", plan: planOf([testOut]), now: T0, untimed: true });
    const ctx = hosted(run);
    expect(card(planTempo(ctx)).lines).toEqual([
      { key: "ask.card.plan.tempoPlanned", values: { bpm: 120 } },
      reasonLine(testOut.why),
    ]);
    expect(card(planWhy(ctx)).lines[1]).toEqual(reasonLine(testOut.why));
    expect(keys(card(planNext(ctx)))).toEqual(["ask.card.plan.nextLast"]);
  });

  it("a step inserted after a result: 'what's next' and 'why this tempo' follow the run's indices", () => {
    let run = runReducer(IDLE, { type: "start", plan: TODAY, now: T0 });
    run = runReducer(run, { type: "next", now: T0 + 1000 });
    // On Today's second part (80), a 95 BPM edge step is inserted after it from its result.
    run = { ...run, phase: "result" };
    const edge = { ...PART(95, "Find my edge"), why: { code: "edgeFirst", values: { bpm: 95 } } } as SessionPlan["steps"][number];
    run = runReducer(run, { type: "insertStep", step: edge, now: T0 + 2000 });
    const ctx = hosted(run);
    expect(card(planTempo(ctx)).lines[0]).toEqual({ key: "ask.card.plan.tempoPlanned", values: { bpm: 95 } });
    expect(keys(card(planNext(ctx)))).toEqual(["ask.card.plan.nextLast"]);
  });

  it("Today's plan rebuilt after a saved Take: the running Session still reads its own", () => {
    const run = runReducer(IDLE, { type: "start", plan: TODAY, now: T0 });
    const rebuilt = planOf([PART(100, "Rebuilt first"), PART(110, "Rebuilt second")]);
    const ctx = hosted(run, rebuilt);
    expect(card(planTempo(ctx)).lines[0]).toEqual({ key: "ask.card.plan.tempoPlanned", values: { bpm: 70 } });
    expect(card(planNext(ctx)).lines).toEqual([{ key: "ask.card.plan.nextBpm", values: { title: "Today's second", bpm: 80, minutes: 4 } }]);
    expect(english(card(planNext(ctx)).lines[0])).toBe("Next in this Session's plan: Today's second, at 80 BPM, 4 min.");
  });

  it("why this tempo: a reason that is not about the tempo is not given as if it were (review c2b2a L3)", () => {
    const due = { ...PART(80), why: { code: "keepWarm", values: { path: "Alternate picking", days: 3 } } } as SessionPlan["steps"][number];
    const run = runReducer(IDLE, { type: "start", plan: planOf([due]), now: T0 });
    expect(card(planTempo(hosted(run))).lines).toEqual([{ key: "ask.card.plan.tempoPlanned", values: { bpm: 80 } }]);
    const review = { ...PART(80), why: { code: "reviewDue", values: { days: 3 } } } as SessionPlan["steps"][number];
    const run2 = runReducer(IDLE, { type: "start", plan: planOf([review]), now: T0 });
    expect(keys(card(planTempo(hosted(run2))))).toEqual(["ask.card.plan.tempoPlanned"]);
  });
});

describe("pass marks, each in its own words (review c2b2a M1)", () => {
  const MARKED = {
    ...TUNE,
    passBars: [
      { metric: "timingEvenness", min: 0.85, overBars: 4 },
      { metric: "notesHeard", min: 0.9, overBars: 16 },
      { metric: "evennessHold", min: 0.75, overBars: 4 },
      { metric: "accentPlacement", min: 0.6, overBars: 4 },
    ],
  } as Exercise;
  const ctx = () => here({ exercise: MARKED }, { exercise: MARKED });

  it("90%: the notes-heard mark, never the evenness numbers", () => {
    const c = card(passMarkMs(ctx(), 90));
    expect(c.lines).toEqual([{ key: "ask.card.term.heardMark", values: { bar: 90 } }]);
    expect(english(c.lines[0])).toBe("90% is the notes-heard pass mark: in the bars judged, at least 90 of every 100 written notes must be heard.");
  });

  it("75%: evenness held to the end, in milliseconds by the same formula", () => {
    const c = card(passMarkMs(ctx(), 75));
    expect(keys(c)).toEqual(["ask.card.term.holdMs", "ask.card.term.evenHow"]);
    expect(c.lines[0].values.bar).toBe(75);
    expect(c.lines[0].values.ms).toBe(Math.round(evennessSpreadMs(0.75, Number(c.lines[0].values.gap))));
  });

  it("85%: the evenness mark alone", () => {
    expect(keys(card(passMarkMs(ctx(), 85)))).toEqual(["ask.card.term.evenMs", "ask.card.term.evenHow"]);
  });

  it("60%: the accents mark in its own words (c2b2ac); a check the app has no sentence for: no card", () => {
    expect(card(passMarkMs(ctx(), 60)).lines).toEqual([{ key: "ask.card.term.accentsMark", values: { bar: 60 } }]);
    const other = { ...TUNE, passBars: [{ metric: "someOtherCheck", min: 0.6, overBars: 4 }] } as unknown as Exercise;
    expect(noCard(passMarkMs(here({ exercise: other }, { exercise: other }), 60))).toEqual({ key: "ask.card.term.markOther", values: { value: 60 } });
  });

  it("two checks at the same 90%: both named, notes heard and accents (review c2b2ab L4)", () => {
    const twin = {
      ...TUNE,
      passBars: [
        { metric: "notesHeard", min: 0.9, overBars: 16 },
        { metric: "accentPlacement", min: 0.9, overBars: 4 },
      ],
    } as Exercise;
    const c = card(passMarkMs(here({ exercise: twin }, { exercise: twin }), 90));
    expect(c.lines).toEqual([
      { key: "ask.card.term.heardMark", values: { bar: 90 } },
      { key: "ask.card.term.accentsMark", values: { bar: 90 } },
    ]);
    expect(english(c.lines[1])).toBe("90% is the accents pass mark: at least 90 of every 100 marked accents must come out louder than the notes around them.");
  });

  it("right notes and a check with no sentence at the same 80%: the one named, the other said to be there", () => {
    const twin = {
      ...TUNE,
      passBars: [
        { metric: "noteIdentity", min: 0.8, overBars: 4 },
        { metric: "someOtherCheck", min: 0.8, overBars: 4 },
      ],
    } as unknown as Exercise;
    const c = card(passMarkMs(here({ exercise: twin }, { exercise: twin }), 80));
    expect(c.lines).toEqual([
      { key: "ask.card.term.notesMark", values: { bar: 80 } },
      { key: "ask.card.term.markAlso", values: { value: 80 } },
    ]);
    expect(english(c.lines[0])).toBe("80% is the right-notes pass mark: at least 80 of every 100 notes I could pitch must be the written ones.");
    expect(english(c.lines[1])).toBe("80% is also the pass mark of another of this Exercise's checks.");
  });
});

describe("the review schedule's edges (review c2b2a L6)", () => {
  it("a graded Exercise with no pass tempo is never brought back, and the card says so", () => {
    const noPass = { ...TUNE, tempo: { ...TUNE.tempo, passAtBpm: null } } as Exercise;
    expect(keys(card(planReturn(here({ exercise: noPass }, { exercise: noPass }))))).toEqual(["ask.card.plan.returnNoPassTempo"]);
  });

  it("the schedule counts a Take marked not fair (the card's 'doesn't leave it out' is true while this holds)", () => {
    const passAt = TUNE.tempo.passAtBpm ?? 80;
    const ceiling = { exerciseKey: `${ALT.id}/${TUNE.id}`, cleanBpm: passAt, lastPracticed: NOW - 10 * DAY };
    const passed = row(TUNE.id, { pathId: ALT.id, bpm: passAt, passed: true, startedAt: NOW - 10 * DAY, facts: { verdict: "passed" } });
    const review = row(TUNE.id, { pathId: ALT.id, bpm: passAt, passed: true, startedAt: NOW - 8 * DAY, facts: { verdict: "passed", role: "review", fair: "no" } as TakeFacts });
    const pick = { path: ALT, step: STEP_OF_TUNE as Step, exercise: TUNE };
    const without = reviewStateOf({ states: [], takes: [passed], ceilings: [ceiling] } as unknown as CoachContext["progress"], pick);
    const withUnfair = reviewStateOf({ states: [], takes: [passed, review], ceilings: [ceiling] } as unknown as CoachContext["progress"], pick);
    expect(without).not.toBeNull();
    expect(withUnfair?.dueAt).not.toBe(without?.dueAt);
  });

  it("due in a few hours: 'within 1 day', never 'now'", () => {
    const l: Line = { key: "ask.card.plan.returnDays", values: { count: 1, bpm: 80 } };
    expect(english(l)).toBe("The review schedule brings this Exercise back within 1 day, at 80 BPM.");
  });

  it("planReturn with the review due three hours from now: 1 day (review c2b2ab L6)", () => {
    const passAt = TUNE.tempo.passAtBpm ?? 80;
    const ceiling = { exerciseKey: `${ALT.id}/${TUNE.id}`, cleanBpm: passAt, lastPracticed: NOW - 2 * DAY };
    const passed = row(TUNE.id, { pathId: ALT.id, bpm: passAt, passed: true, startedAt: NOW - 2 * DAY, facts: { verdict: "passed" } });
    const progress = { states: [], takes: [passed], ceilings: [ceiling] } as unknown as CoachContext["progress"];
    const state = reviewStateOf(progress, { path: ALT, step: STEP_OF_TUNE as Step, exercise: TUNE });
    expect(state).not.toBeNull();
    const c = card(planReturn(here({ progress, now: state!.dueAt - 3 * 60 * 60 * 1000 })));
    expect(keys(c)).toEqual(["ask.card.plan.returnDays"]);
    expect(c.lines[0].values.count).toBe(1);
  });
});

describe("the player's own exercises (review c2b2a L7)", () => {
  const MINE_STEP = { ...PART(80), pathId: MY_EXERCISES_PATH } as SessionPlan["steps"][number];
  const mine = () => here({ path: undefined, step: undefined, run: { ...runIn("result"), plan: planOf([MINE_STEP]) } });

  it("with no Path in the host's list, the running step says whose they are", () => {
    expect(keys(card(planReturn(mine())))).toEqual(["ask.card.plan.returnMine"]);
    expect(keys(cleanTempo(mine()))).toEqual(["ask.card.term.clean", "ask.card.term.cleanMine"]);
    expect(card(exercisePurpose(mine())).source).toEqual({ kind: "app" });
  });
});

describe("through the runner", () => {
  it("a player without grading still reads the Path's words; a Take card still says 'ungraded'", () => {
    const ctx = here({ grading: "off" });
    expect(isCard(runFactCard({ tool: "exercise_purpose", args: {} }, ctx))).toBe(true);
    expect(isCard(runFactCard({ tool: "where_slipped", args: {} }, ctx))).toBe(false);
  });

  it("a chord outside the closed sets is refused by the shape check", () => {
    expect(isCard(runFactCard({ tool: "chord_notes", args: { root: "H", suffix: "7" } }, here()))).toBe(false);
    expect(isCard(runFactCard({ tool: "chord_notes", args: { root: "F", suffix: "xyz" } }, here()))).toBe(false);
    expect(isCard(runFactCard({ tool: "chord_notes", args: { root: "F", suffix: "7" } }, here()))).toBe(true);
  });

  it("every line of every card has English (no key shows through)", () => {
    const plan = planOf([PART(80), PART(90, "Next one")]);
    const ctx = here({ plan });
    const cards = [
      exercisePurpose(ctx),
      exerciseHow(ctx),
      exerciseTry(ctx),
      planWhy(ctx),
      planTempo(ctx),
      planNext(ctx),
      planSkip({ ...ctx, screen: "paths", run: undefined }),
      planMinutes({ ...ctx, screen: "today", run: undefined }, 7),
      planReturn(ctx),
      chordNotesCard("Bb", "7"),
      chordNotesCard("F", UNKNOWN_SUFFIX),
      scaleFits("A", "m"),
      passMarkMs(ctx, 50),
      cleanTempo(ctx),
    ];
    for (const c of cards.filter(isCard)) {
      for (const l of c.lines) {
        const s = english(l);
        expect(s).not.toBe(l.key);
        expect(s).not.toMatch(/\{\{/);
      }
    }
  });
});

it("fixture: the path is the tune's", () => {
  expect((ALT as PathDoc).steps.some((s) => s.exercises.some((e) => e.id === TUNE.id))).toBe(true);
});
