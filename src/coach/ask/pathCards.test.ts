/**
 * The Path, plan, theory and term cards (leg c2b2a): every sentence each can
 * say, the situation it is true for, and the near situation where it must not
 * be said. The table in `plans/coach/progress/c2b2a.md` names these tests.
 */
import { describe, expect, it } from "vitest";
import i18n from "../../i18n";
import { cueFor } from "../cues";
import type { CoachContext, CoachPath, CoachStep } from "../context";
import type { Line } from "../tools/types";
import { chordNotes, noteName, parseChordName } from "../../jam/harmony";
import { scalesForChord } from "../../jam/scales";
import type { Exercise, PathDoc, Step } from "../../paths/format";
import { spellChord } from "../../paths/theory";
import { reasonLine } from "../../session/coachWords";
import { exerciseWords } from "../../session/exerciseWords";
import type { SessionPlan } from "../../session/planner";
import { shownCleanTempoOf } from "../../session/progress";
import { reviewStateOf } from "../../session/rotation";
import { ALT, DAY, NOW, take as row } from "../../session/testKit";
import { fixture, TUNE } from "./cardFixtures";
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

  it("the variant played: its own purpose, not the Exercise's", () => {
    const variant = { ...TUNE, purpose: "The variant's own purpose." } as Exercise;
    const words = exerciseWords(TUNE, variant);
    expect(words.purpose).toBe("The variant's own purpose.");
  });

  it("no Exercise on screen: no card, one line", () => {
    expect(noCard(exercisePurpose({ ...here(), exercise: undefined, lastTake: undefined })).key).toBe("ask.card.path.noExercise");
  });

  it("what should I try: the cue the result screen picks, byte-equal; 'what Take N measured' only when it was measured", () => {
    const ctx = here({}, { slipped: [0, 4], failOn: "timingEvenness" });
    const pick = cueFor(TUNE, noteOf(ctx));
    const c = card(exerciseTry(ctx));
    if (!pick) {
      expect(keys(c)).toEqual(["ask.card.path.tryNone"]);
      return;
    }
    expect(c.lines[1].values.text).toBe(pick.cue.say);
    expect(c.lines[0].key).toBe(pick.basis === "measured" ? "ask.card.path.tryMeasured" : "ask.card.path.tryGeneral");
  });

  it("playing without grading: the general cue only, never one picked by a measurement", () => {
    const c = exerciseTry(here({ grading: "off" }, { slipped: [0, 4], failOn: "timingEvenness" }));
    if (isCard(c)) expect(c.lines[0].key).not.toBe("ask.card.path.tryMeasured");
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

  it("a quality with no spelling table: chordNotes, named", () => {
    const chord = parseChordName("C9")!;
    const c = chordNotesCard("C", "9");
    expect(c.lines[0].values.notes).toBe(chordNotes(chord).map((pc) => noteName(pc, "sharp")).join(" "));
  });

  it("a chord the app cannot read: 'I don't know', with what it can spell on that root, and nothing drawn", () => {
    const c = chordNotesCard("F", UNKNOWN_SUFFIX);
    expect(c.uncertain).toBe(true);
    expect(c.lines).toEqual([{ key: "ask.card.theory.chordUnknown", values: { root: "F", known: "F, Fm, F7, Fmaj7, Fm7" } }]);
    expect(c.then).toBeUndefined();
    expect(scaleFits("F", UNKNOWN_SUFFIX).then).toBeUndefined();
  });

  it("what fits over F: scalesForChord with F as the home chord of F major, the first drawn", () => {
    const c = scaleFits("F", "");
    const chord = parseChordName("F")!;
    const expected = scalesForChord(chord, homeKeyOf(chord));
    expect(c.lines[0]).toEqual({ key: "ask.card.theory.scalesIntroMajor", values: { chord: "F", root: "F" } });
    expect(c.lines).toHaveLength(1 + expected.length);
    expect(c.lines[1].values.root).toBe(noteName(expected[0].root, "flat"));
    expect(c.then).toEqual({ tool: "show_scale", args: { root: noteName(expected[0].root, "flat"), scale: expected[0].scale } });
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
  });

  it("what does 85% mean: each evenness pass mark in ms at this tempo, with the tempo said", () => {
    const ctx = here();
    const c = card(passMarkMs(ctx, null));
    const even = TUNE.passBars.filter((b) => b.metric === "timingEvenness");
    if (even.length === 0) {
      expect(keys(c)).toEqual(["ask.card.term.evenNone"]);
      return;
    }
    const msLines = c.lines.filter((l) => l.key === "ask.card.term.evenMs");
    expect(msLines).toHaveLength(even.length);
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
    expect(keys(cleanTempo(here({ grading: "off" })))).toEqual(["ask.card.term.clean"]);
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
