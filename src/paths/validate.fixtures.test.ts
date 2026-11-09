// Every validator rule, broken on purpose. Each row takes the correct minimal
// Path, breaks one thing, and asserts the rule that should catch it does. The
// last test fails if anyone adds a rule without a row here.
import { describe, expect, it } from "vitest";
import { MINIMAL_SPEC, exercise } from "./fixtures/minimal";
import type { Exercise, PathDoc, Step } from "./format";
import { buildPath } from "./generate";
import type { ExerciseSpec, PathSpec } from "./spec";
import { RULES, errorsIn, validatePath } from "./validate";
import type { RuleId } from "./validate";

const fresh = (): PathDoc => JSON.parse(JSON.stringify(buildPath(MINIMAL_SPEC))) as PathDoc;
const steps = (doc: PathDoc): Step[] => doc.steps;
const ex = (doc: PathDoc, id: string): Exercise => {
  const found = doc.steps.flatMap((s) => s.exercises).find((e) => e.id.endsWith(`.${id}`));
  if (!found) throw new Error(`no exercise ${id}`);
  return found;
};

/** The minimal Path with one Exercise replaced by a differently built one. */
function withExercise(id: string, overrides: Partial<ExerciseSpec> & { tab: string }): PathDoc {
  const spec: PathSpec = JSON.parse(JSON.stringify(MINIMAL_SPEC));
  for (const step of spec.steps) {
    step.exercises = step.exercises.map((e) => (e.id === id ? exercise({ ...e, ...overrides, id }) : e));
  }
  return JSON.parse(JSON.stringify(buildPath(spec))) as PathDoc;
}

const setFret = (n: Exercise["notes"][number], fret: number) => {
  n.midi += fret - n.fret;
  n.fret = fret;
};

const FIXTURES: Record<RuleId, () => unknown> = {
  "schema.version": () => ({ ...fresh(), schemaVersion: 99 }),
  "schema.shape": () => {
    const d = fresh() as Partial<PathDoc>;
    delete d.goal;
    return d;
  },
  "schema.enum": () => {
    const d = fresh();
    (d as { level: string }).level = "godlike";
    return d;
  },
  "schema.duplicateId": () => {
    const d = fresh();
    steps(d)[1].id = steps(d)[0].id;
    return d;
  },
  "schema.computedStale": () => {
    const d = fresh();
    ex(d, "scale").computed.noteCount = 999;
    return d;
  },
  "tab.string": () => {
    const d = fresh();
    ex(d, "scale").notes[0].string = 7;
    return d;
  },
  "tab.fret": () => {
    const d = fresh();
    ex(d, "scale").notes[0].fret = 30;
    return d;
  },
  "tab.midi": () => {
    const d = fresh();
    ex(d, "scale").notes[0].midi += 1;
    return d;
  },
  "tab.value": () => {
    const d = fresh();
    ex(d, "scale").notes[0].dur = 100;
    return d;
  },
  "tab.barFill": () => {
    const d = fresh();
    ex(d, "scale").notes.splice(1, 1);
    return d;
  },
  "tab.barline": () => {
    const d = fresh();
    const notes = ex(d, "line").notes;
    notes[3].dur = 1920;
    return d;
  },
  "tab.bend": () => {
    const d = fresh();
    ex(d, "scale").notes[0].tech.push("bend");
    return d;
  },
  "loop.firstNote": () => {
    const d = fresh();
    const e = ex(d, "outside");
    const first = e.notes.shift()!;
    e.rests.unshift({ tick: first.tick, dur: first.dur });
    return d;
  },
  "loop.seamLeap": () => {
    const d = fresh();
    const e = ex(d, "outside");
    e.notes[0].string = 6;
    e.notes[0].fret = 1;
    e.notes[0].midi = 41;
    const last = e.notes[e.notes.length - 1];
    last.string = 1;
    last.fret = 20;
    last.midi = 84;
    return d;
  },
  "loop.seamRepeat": () => withExercise("outside", { tab: "/8 3:5 2:5 3:7 2:5 3:7 2:5 3:7 3:5", crossing: undefined }),
  "loop.seamPick": () =>
    withExercise("outside", { tab: "/16 3:5 3:7 3:8 3:7 3:5 3:7 3:8 3:7 3:5 3:7 3:8 3:7 3:5 3:7 /8 3:8", crossing: undefined }),
  "reach.position": () => {
    const d = fresh();
    ex(d, "scale").position.fret = 12;
    return d;
  },
  "reach.stretch": () => {
    const d = fresh();
    const e = ex(d, "outside");
    setFret(e.notes[3], 15);
    return d;
  },
  "reach.legato": () => withExercise("outside", { tab: `/8 5:2 5:12h 5:2 5:12h 5:2 5:12h 5:2 5:12h`, position: 2, shifts: true, crossing: undefined }),
  "reach.shiftTime": () =>
    withExercise("outside", { tab: `/16 6:2 6:15 6:2 6:15 6:2 6:15 6:2 6:15 /2 6:2`, position: 2, shifts: true, crossing: undefined, rungs: [240, 260, 280] }),
  "reach.seam": () =>
    withExercise("outside", {
      tab: `/16 6:2 6:3 6:4 6:5 6:6 6:7 6:8 6:9 6:10 6:11 6:12 6:13 6:14 6:15 6:16 6:17`,
      position: 2,
      shifts: true,
      crossing: undefined,
      rungs: [100, 110, 120],
    }),
  "pick.alternate": () => {
    const d = fresh();
    const e = ex(d, "outside");
    e.notes[1].pick = e.notes[0].pick;
    return d;
  },
  "pick.sweep": () => {
    const d = fresh();
    ex(d, "arp").notes[1].pick = "u";
    return d;
  },
  "pick.legatoMarked": () => {
    const d = fresh();
    ex(d, "arp").notes[3].pick = "d";
    return d;
  },
  "pick.freeMarked": () => {
    const d = fresh();
    ex(d, "line").notes[0].pick = "d";
    return d;
  },
  "pick.crossing": () => {
    const d = fresh();
    ex(d, "outside").crossing = "inside";
    return d;
  },
  "music.unknownScale": () => {
    const d = fresh();
    (ex(d, "scale").harmony as { scale: string }).scale = "martian";
    return d;
  },
  "music.scaleTone": () => {
    const d = fresh();
    setFret(ex(d, "scale").notes[1], 6);
    return d;
  },
  "music.scaleCover": () =>
    withExercise("scale", { tab: `/8 ${"5:5 5:8 ".repeat(4)}`, harmony: { scale: ["D", "minorPentatonic"], cover: true } }),
  "music.chordSymbol": () => {
    const d = fresh();
    ex(d, "line").chords![0] = "H#9z";
    return d;
  },
  "music.chordTone": () => {
    const d = fresh();
    setFret(ex(d, "arp").notes[0], 15);
    return d;
  },
  "music.chordCover": () =>
    withExercise("arp", { tab: `/8t ${"3:14 2:13 3:14 2:13 3:14 2:13 ".repeat(2)}` }),
  "music.downbeat": () => {
    const d = fresh();
    // D is in the scale and not in A7.
    const first = ex(d, "line").notes[0];
    first.string = 3;
    setFret(first, 7);
    first.midi = 62;
    return d;
  },
  "music.spelling": () => {
    const d = fresh();
    ex(d, "arp").harmony = { kind: "arpeggio", chord: "Am", spelled: ["A", "B#", "E"], cover: true };
    return d;
  },
  "music.landing": () => {
    const d = fresh();
    ex(d, "landings").landings![0].notes = ["A", "C", "E", "G"];
    return d;
  },
  "music.landingExample": () => {
    const d = fresh();
    setFret(ex(d, "landings").notes[0], 1);
    return d;
  },
  "backing.groove": () => {
    const d = fresh();
    (ex(d, "line").backing as { grooveId: string }).grooveId = "polka9";
    return d;
  },
  "backing.key": () => {
    const d = fresh();
    (ex(d, "line").backing as { key: string }).key = "H major";
    return d;
  },
  "backing.chart": () => {
    const d = fresh();
    (ex(d, "line").backing as { chart: string }).chart = "A7 | E7";
    return d;
  },
  "backing.meter": () => {
    const d = fresh();
    (ex(d, "line").backing as { grooveId: string }).grooveId = "waltz";
    return d;
  },
  "backing.feel": () => {
    const d = fresh();
    ex(d, "line").notes[1].tick = 480;
    return d;
  },
  "ladder.rising": () => {
    const d = fresh();
    ex(d, "scale").tempo.rungs[1].bpm = 60;
    return d;
  },
  "ladder.jump": () => {
    const d = fresh();
    ex(d, "scale").tempo.rungs[2].bpm = 120;
    return d;
  },
  "ladder.range": () => {
    const d = fresh();
    ex(d, "scale").tempo.rungs[0].bpm = 10;
    return d;
  },
  "ladder.passAt": () => {
    const d = fresh();
    ex(d, "scale").tempo.passAtBpm = 123;
    return d;
  },
  "ladder.gradedAbove": () => {
    const d = fresh();
    ex(d, "scale").tempo.rungs[0].grading = "selfChecked";
    return d;
  },
  "ladder.trust": () => {
    const d = fresh();
    const rungs = ex(d, "arp").tempo.rungs;
    rungs.push({ bpm: 100, grading: "graded" }, { bpm: 125, grading: "graded" }, { bpm: 150, grading: "graded" });
    return d;
  },
  "progress.stepOrder": () => {
    const d = fresh();
    steps(d)[1].order = 5;
    return d;
  },
  "progress.difficulty": () => {
    const d = fresh();
    // The band Step is rated above the plain one; put them the other way round.
    const [plain, swept] = steps(d);
    plain.exercises = swept.exercises;
    plain.difficulty = swept.difficulty;
    swept.exercises = steps(fresh())[0].exercises;
    swept.difficulty = steps(fresh())[0].difficulty;
    return d;
  },
  "progress.difficultyValue": () => {
    const d = fresh();
    steps(d)[0].difficulty = 0.01;
    return d;
  },
  "progress.prereqMissing": () => {
    const d = fresh();
    steps(d)[1].prerequisites = ["nope"];
    return d;
  },
  "progress.prereqForward": () => {
    const d = fresh();
    steps(d)[0].prerequisites = [steps(d)[1].id];
    return d;
  },
  "progress.cycle": () => {
    const d = fresh();
    steps(d)[0].prerequisites = [steps(d)[1].id];
    steps(d)[1].prerequisites = [steps(d)[0].id];
    return d;
  },
  "progress.exerciseCount": () => {
    const d = fresh();
    steps(d)[0].exercises.pop();
    return d;
  },
  "progress.why": () => {
    const d = fresh();
    steps(d)[0].why = "Short.";
    return d;
  },
  "progress.howTo": () => {
    const d = fresh();
    steps(d)[0].howTo = [];
    return d;
  },
  "progress.payoff": () => {
    const d = fresh();
    steps(d)[0].payoff = "";
    return d;
  },
  "progress.noPassBar": () => {
    const d = fresh();
    for (const e of steps(d)[0].exercises) {
      e.passBars = [];
      e.tempo.passAtBpm = null;
      e.grading = "practiceOnly";
    }
    return d;
  },
  "progress.minutes": () => {
    const d = fresh();
    d.estimatedMinutes = 1;
    return d;
  },
  "honesty.banned": () => {
    const d = fresh();
    ex(d, "scale").coachLine = "I can see your hands tensing up.";
    ex(d, "outside").purpose = "The app reliably detects your pick direction on every note.";
    return d;
  },
  "honesty.metric": () => {
    const d = fresh();
    ex(d, "scale").passBars.push({ metric: "score", min: 90, overBars: 4 });
    return d;
  },
  "honesty.passNotGraded": () => {
    const d = fresh();
    const e = ex(d, "scale");
    e.graded = e.graded.filter((g) => g !== "notesHeard");
    return d;
  },
  "honesty.notGradedId": () => {
    const d = fresh();
    ex(d, "scale").notGraded.push("astrology");
    return d;
  },
  "honesty.notGradedRequired": () => {
    const d = fresh();
    const e = ex(d, "scale");
    e.notGraded = e.notGraded.filter((g) => g !== "muting");
    return d;
  },
  "honesty.overlap": () => {
    const d = fresh();
    ex(d, "scale").notGraded.push("timingEvenness");
    return d;
  },
  "honesty.slideBar": () =>
    withExercise("outside", { tab: "/2 3:5s 3:7 3:5s 3:7", crossing: undefined, shifts: true, grade: "timingNotes" }),
  "honesty.flag": () => {
    const d = fresh();
    ex(d, "arp").detection = { flags: [], notes: [] };
    return d;
  },
  "honesty.modeShape": () => {
    const d = fresh();
    ex(d, "self").passBars = [{ metric: "notesHeard", min: 0.9, overBars: 4 }];
    return d;
  },
  "honesty.selfCheck": () => {
    const d = fresh();
    delete ex(d, "self").selfCheck;
    return d;
  },
  "honesty.feedback": () => {
    const d = fresh();
    ex(d, "self").feedback = "afterTake";
    return d;
  },
  "honesty.reviewStatus": () => {
    const d = fresh();
    d.review = { status: "played", history: [] };
    return d;
  },
  "runtime.schedule": () => {
    const d = fresh();
    for (const note of ex(d, "outside").notes) {
      note.tech = ["hammer"];
      delete note.pick;
    }
    return d;
  },
};

describe("the minimal Path", () => {
  it("is correct, so each fixture below has only one thing wrong with it", () => {
    expect(validatePath(fresh()).map((i) => `${i.rule} ${i.where} ${i.message}`)).toEqual([]);
  });
});

describe("every rule fires on its broken fixture", () => {
  for (const rule of Object.keys(RULES) as RuleId[]) {
    it(rule, () => {
      const fixture = FIXTURES[rule];
      expect(fixture, `no fixture for ${rule}`).toBeDefined();
      const issues = validatePath(fixture());
      expect(issues.map((i) => i.rule)).toContain(rule);
    });
  }

  it("has no fixture for a rule that does not exist", () => {
    for (const rule of Object.keys(FIXTURES)) expect(RULES).toHaveProperty(rule);
  });

  it("errors are what fail a build; warnings are not", () => {
    const issues = validatePath(FIXTURES["loop.seamRepeat"]());
    expect(issues.some((i) => i.severity === "warning")).toBe(true);
    expect(errorsIn(issues).filter((i) => i.rule === "loop.seamRepeat")).toEqual([]);
  });

  it("a message says where and what", () => {
    const [issue] = validatePath(FIXTURES["tab.midi"]()).filter((i) => i.rule === "tab.midi");
    expect(issue.where).toContain("plain.scale note 1");
    expect(issue.message).toMatch(/string 5 fret 5 \(MIDI 50\)/);
  });
});

describe("the honesty lint", () => {
  const lint = (coachLine: string) => {
    const d = fresh();
    ex(d, "scale").coachLine = coachLine;
    return validatePath(d).filter((i) => i.rule === "honesty.banned").length;
  };

  it("bans these", () => {
    for (const text of [
      "I can hear your downstrokes are weak.",
      "The app detects your muting.",
      "I noticed your wrist is tight.",
      "Yames grades your pick direction.",
      "I can see your hands.",
      "This was reviewed by a teacher.",
      "It accurately detects every note.",
      "We measure your feel.",
      "Your hand is tensing up.",
    ]) {
      expect(lint(text), text).toBeGreaterThan(0);
    }
  });

  it("allows these", () => {
    for (const text of [
      "I can't see your hands, so this one is on you.",
      "I can time these notes.",
      "Pick direction is not something I can check.",
      "Detection of this has not been proven.",
      "Use a downstroke here.",
    ]) {
      expect(lint(text), text).toBe(0);
    }
  });

  it("teaching in words is allowed in how-to text", () => {
    const d = fresh();
    ex(d, "scale").howTo = ["Mute with your palm, use a downstroke, and keep your hand relaxed."];
    expect(validatePath(d).filter((i) => i.rule === "honesty.banned")).toEqual([]);
  });
});
