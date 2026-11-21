/**
 * Today's line (DESIGN 6.1): which sentence a stored history produces, as a
 * table over fixture histories, and the honesty rules each sentence is held to.
 */
import { describe, expect, it } from "vitest";
import alt from "../paths/packs/alternate-picking.json";
import en from "../locales/en/session.json";
import i18n from "../i18n";
import type { PathDoc } from "../paths/format";
import type { PathTakeRow } from "../ipc";
import type { PlanStep, SessionPlan } from "../session/planner";
import type { PlayerProgress, TakeFacts } from "../session/progress";
import { findExercise } from "../session/packs";
import { bannedClaimsIn } from "../paths/honesty";
import { stepLine, storedPlace, todayLine, todayLineText } from "./todayLine";
import type { TodayLineInput } from "./todayLine";

const PATHS = [alt] as unknown as PathDoc[];
const PATH = "alternate-picking";
const TUNE = "other-strings.b-string-tune";
const FOUR = "even-eighths.four-fingers";
const tune = findExercise(PATHS[0], TUNE)!.exercise;
const four = findExercise(PATHS[0], FOUR)!.exercise;
const BARS = Math.max(1, tune.bars);

const DAY = 86_400_000;
// Noon, so "yesterday" is a calendar day whatever the timezone of the run.
const NOW = new Date(2026, 10, 19, 12, 0, 0).getTime();

/** Per-bar figures for `rounds` rounds of the tune, the given pattern bars slipping in the given rounds. */
function perBar(rounds: number, slips: Record<number, number[]>) {
  const out: Array<{ due: number; heard: number; evenness: number | null }> = [];
  for (let r = 1; r <= rounds; r += 1) {
    for (let b = 1; b <= BARS; b += 1) {
      out.push({ due: 8, heard: 8, evenness: (slips[b] ?? []).includes(r) ? 0.4 : 0.99 });
    }
  }
  return out;
}

let seq = 0;
function take(over: Partial<PathTakeRow> & { daysAgo?: number; facts?: TakeFacts } = {}): PathTakeRow {
  const { daysAgo = 1, facts, ...row } = over;
  const startedAt = NOW - daysAgo * DAY;
  seq += 1;
  return {
    id: `t${seq}`,
    pathId: PATH,
    stepId: "other-strings",
    exerciseId: TUNE,
    startedAt,
    bpm: 90,
    bars: BARS * 3,
    caught: true,
    passed: false,
    facts: {
      verdict: "belowBar",
      headlineMetric: "timingEvenness",
      headlineValue: 0.79,
      session: startedAt - 60_000,
      measures: { perBar: perBar(3, { 1: [1, 2] }), barsPlayed: BARS * 3 },
      ...facts,
    },
    ...row,
  };
}

function exerciseStep(over: Partial<Extract<PlanStep, { kind: "exercise" }>> = {}): PlanStep {
  return {
    kind: "exercise",
    id: "s1",
    role: "focus",
    pathId: PATH,
    stepId: "other-strings",
    exerciseId: TUNE,
    title: tune.title,
    bpm: 90,
    minutes: 8,
    variantSeed: null,
    why: { code: "belowBar", values: { bpm: 90 } },
    ...over,
  } as PlanStep;
}

const WARM: PlanStep = {
  kind: "metronome", id: "w", title: "Warm-up", bpm: 70, subdivision: 1, minutes: 2,
  pathId: PATH, exerciseId: FOUR, why: { code: "warmUp", values: { bpm: 70 } },
};

function input(over: {
  mood?: SessionPlan["mood"];
  daysAway?: number | null;
  steps?: PlanStep[];
  takes?: PathTakeRow[];
  ceilings?: PlayerProgress["ceilings"];
  grading?: TodayLineInput["grading"];
  takesRead?: number;
}): TodayLineInput {
  return {
    plan: {
      minutes: 15,
      mood: over.mood ?? "returning",
      daysAway: over.daysAway === undefined ? 1 : over.daysAway,
      steps: over.steps ?? [WARM, exerciseStep()],
    },
    progress: { states: [], takes: over.takes ?? [take()], ceilings: over.ceilings ?? [] },
    paths: PATHS,
    now: NOW,
    grading: over.grading ?? "on",
    takesRead: over.takesRead ?? 500,
  };
}

const t = i18n.getFixedT("en");
const say = (i: TodayLineInput) => {
  const line = todayLine(i);
  return line ? todayLineText(t, line) : null;
};

/** 500 Takes of one ungraded Session yesterday: the read stops inside it. */
const fiveHundred = Array.from({ length: 500 }, (_u, i) =>
  take({ daysAgo: 1, startedAt: NOW - DAY + i, caught: false, facts: { verdict: "ungraded", ungraded: "gradingOff", session: NOW - DAY - 1000 } }),
);
const ungradedSession = [0, 1, 2, 3].map((i) =>
  take({ startedAt: NOW - DAY - i * 60_000, bars: 40, caught: false, facts: { verdict: "ungraded", ungraded: "gradingOff", session: NOW - DAY - 10 * 60_000 } }),
);

/** The table: a fixture history, the case it is, and the sentence it says. */
const TABLE: Array<[string, TodayLineInput, string | null, string | null]> = [
  [
    "first, with a placement climb",
    input({ mood: "first", daysAway: null, takes: [], steps: [exerciseStep({ role: "placement", why: { code: "placement", values: {} } })] }),
    "first",
    "Your first Session finds where you start. Nothing to prepare.",
  ],
  [
    "first, ungraded (no placement in the plan)",
    input({ mood: "first", daysAway: null, takes: [], steps: [exerciseStep({ why: { code: "firstEver", values: {} } })] }),
    null,
    null,
  ],
  [
    "returning, it slipped yesterday and today starts there",
    input({}),
    "slipped",
    `${tune.title}: bar 1 of the tune slipped on 2 of 3 rounds yesterday. Today starts there.`,
  ],
  [
    "returning, it slipped, but today starts on another Exercise",
    input({ steps: [exerciseStep({ exerciseId: FOUR, title: "Four fingers" })] }),
    null,
    null,
  ],
  [
    "returning, a variant change: other notes today",
    input({ takes: [take({ variantSeed: 1 })], steps: [WARM, exerciseStep({ variantSeed: 2 })] }),
    null,
    null,
  ],
  [
    "returning, the Take that slipped was marked not fair",
    input({ takes: [take({ facts: { fair: "no" } })] }),
    null,
    null,
  ],
  [
    "returning, nothing slipped and nothing was earned",
    input({ takes: [take({ facts: { measures: { perBar: perBar(3, {}), barsPlayed: BARS * 3 } } })] }),
    null,
    null,
  ],
  [
    "returning, something earned: the clean tempo went up yesterday, today climbs",
    input({
      takes: [take({ passed: true, facts: { verdict: "passed", newClean: true, measures: { perBar: perBar(3, {}), barsPlayed: BARS * 3 } } })],
      ceilings: [{ exerciseKey: `${PATH}/${TUNE}`, cleanBpm: 90, lastPracticed: NOW - DAY }],
      steps: [WARM, exerciseStep({ bpm: 95, why: { code: "climb", values: { bpm: 90, next: 95 } } })],
    }),
    "earned",
    `${tune.title}: your clean tempo went up to 90 BPM yesterday. Today it goes faster.`,
  ],
  [
    "returning, earned but the raising Take was marked not fair",
    input({
      takes: [take({ passed: true, facts: { verdict: "passed", newClean: true, fair: "no", measures: { perBar: perBar(3, {}), barsPlayed: BARS * 3 } } })],
      ceilings: [{ exerciseKey: `${PATH}/${TUNE}`, cleanBpm: 90, lastPracticed: NOW - DAY }],
      steps: [WARM, exerciseStep({ bpm: 95, why: { code: "climb", values: { bpm: 90, next: 95 } } })],
    }),
    null,
    null,
  ],
  [
    // nf1 (owner, 1k questions, item 3): the clean tempo shown is the fastest
    // clean Take not marked not fair, here a later one that raised no ceiling.
    "returning, the raising Take was marked not fair, a slower clean Take after it",
    input({
      takes: [
        take({
          startedAt: NOW - DAY + 120_000,
          bpm: 85,
          passed: true,
          facts: {
            verdict: "passed",
            newClean: false,
            session: NOW - DAY - 60_000,
            measures: { perBar: perBar(3, {}), barsPlayed: BARS * 3, pass: { countsForCleanTempo: true } as NonNullable<TakeFacts["measures"]>["pass"] },
          },
        }),
        take({ passed: true, facts: { verdict: "passed", newClean: true, fair: "no", measures: { perBar: perBar(3, {}), barsPlayed: BARS * 3 } } }),
      ],
      ceilings: [{ exerciseKey: `${PATH}/${TUNE}`, cleanBpm: 90, lastPracticed: NOW - DAY }],
      steps: [WARM, exerciseStep({ bpm: 90, why: { code: "climb", values: { bpm: 85, next: 90 } } })],
    }),
    "earned",
    `${tune.title}: your clean tempo went up to 85 BPM yesterday. Today it goes faster.`,
  ],
  [
    "back after twelve days, eased a rung",
    input({
      mood: "back",
      daysAway: 12,
      takes: [take({ daysAgo: 12 })],
      steps: [WARM, exerciseStep({ bpm: 85, why: { code: "backEased", values: { days: 12, bpm: 85, clean: 90 } } })],
    }),
    "back",
    // The days away are the header's ("Last Session: 12 days ago"): not said again here (nf1b).
    `Last Session, ${tune.title}: 79% even at 90 BPM. Today starts at 85 BPM.`,
  ],
  [
    "back after twelve days, eased, today on another Exercise: it is named",
    input({
      mood: "back",
      daysAway: 12,
      takes: [take({ daysAgo: 12 })],
      steps: [WARM, exerciseStep({ exerciseId: FOUR, title: "Four fingers", bpm: 70, why: { code: "backEased", values: { days: 12, bpm: 70, clean: 75 } } })],
    }),
    "back",
    `Last Session, ${tune.title}: 79% even at 90 BPM. Today ${four.title} starts at 70 BPM.`,
  ],
  [
    "back after twelve days, the last Take marked not fair: the days and the tempo alone",
    input({
      mood: "back",
      daysAway: 12,
      takes: [take({ daysAgo: 12, facts: { fair: "no" } })],
      steps: [WARM, exerciseStep({ bpm: 85, why: { code: "backEased", values: { days: 12, bpm: 85, clean: 90 } } })],
    }),
    "back",
    `Your last Session was 12 days ago. Today ${tune.title} starts at 85 BPM.`,
  ],
  [
    "back after thirty days, three rungs",
    input({
      mood: "back",
      daysAway: 30,
      takes: [take({ daysAgo: 30 })],
      steps: [WARM, exerciseStep({ bpm: 75, why: { code: "backEased", values: { days: 30, bpm: 75, clean: 90 } } })],
    }),
    "back",
    `Last Session, ${tune.title}: 79% even at 90 BPM. Today starts at 75 BPM.`,
  ],
  [
    "ungraded player: minutes and tempo, same place today",
    input({ grading: "off", takes: ungradedSession, steps: [WARM, exerciseStep({ why: { code: "playedUngraded", values: { bpm: 90 } } })] }),
    "ungraded",
    // Four Takes of 40 bars at 90 BPM in the tune's metre.
    null,
  ],
  [
    "ungraded, the 500-Take edge: the read stops inside the last Session",
    input({ grading: "off", takes: fiveHundred, takesRead: 500 }),
    null,
    null,
  ],
  [
    "grading off, with a graded last Session: still no claim about the playing",
    input({ grading: "off", takes: [take({ bars: 120 })] }),
    "ungraded",
    null,
  ],
];

/** A row of the table by its name: an index moves when a row is added. */
function row(name: string): TodayLineInput {
  const found = TABLE.find(([n]) => n === name);
  if (!found) throw new Error(`no table row "${name}"`);
  return found[1];
}

describe("Today's line, by history", () => {
  it.each(TABLE)("%s", (_name, given, kind, sentence) => {
    const line = todayLine(given);
    expect(line?.kind ?? null).toBe(kind);
    if (sentence !== null) expect(say(given)).toBe(sentence);
  });

  it("an ungraded line says minutes and tempo, nothing about the playing", () => {
    const text = say(row("ungraded player: minutes and tempo, same place today"))!;
    const quarters = tune.meter.numerator * (4 / tune.meter.denominator);
    const minutes = Math.floor((4 * 40 * quarters * 60) / 90 / 60);
    expect(text).toBe(`${minutes} minutes of Takes yesterday, ending with ${tune.title} at 90 BPM. Same place today.`);
    expect(text).not.toMatch(/%|slipped|clean|even/);
  });

  it("a graded Session read with grading off now says no percentage and no place", () => {
    const text = say(row("grading off, with a graded last Session: still no claim about the playing"))!;
    expect(text).not.toMatch(/%|slipped|clean/);
  });

  it("no line on an empty plan", () => {
    expect(todayLine(input({ steps: [] }))).toBeNull();
  });

  it("earlier today and last Session are named as such", () => {
    expect(say(input({ takes: [take({ daysAgo: 0, startedAt: NOW - 3_600_000 })] }))).toMatch(/earlier today\./);
    expect(say(input({ takes: [take({ daysAgo: 3 })] }))).toMatch(/in your last Session\./);
  });

  it("only the last Session speaks: an older slip under a newer Session is not said", () => {
    const newer = take({ daysAgo: 1, exerciseId: FOUR, stepId: "even-eighths", facts: { measures: { perBar: [], barsPlayed: 8 } } });
    const older = take({ daysAgo: 2 });
    expect(todayLine(input({ takes: [newer, older] }))).toBeNull();
  });
});

describe("where a stored Take slipped", () => {
  it("one bar, neighbours on the same rounds, the whole tune", () => {
    const at = (slips: Record<number, number[]>) =>
      storedPlace(take({ facts: { measures: { perBar: perBar(3, slips), barsPlayed: BARS * 3 } } }), tune);
    expect(at({ 1: [1, 2] })).toEqual({ shape: "bar", bar: 1, count: 2, of: 3 });
    if (BARS >= 3) expect(at({ 2: [3], 3: [3] })).toEqual({ shape: "bars", from: 2, to: 3, count: 1, of: 3 });
    const all = Object.fromEntries(Array.from({ length: BARS }, (_u, i) => [i + 1, [2]]));
    expect(at(all)).toEqual({ shape: "all", count: 1, of: 3 });
    expect(at({})).toBeNull();
    expect(storedPlace(take({ facts: { measures: {} } }), tune)).toBeNull();
  });
});

describe("the Step page's line", () => {
  it("says where the last Session's Take on this Step slipped, and nothing about today", () => {
    const line = stepLine({ progress: { states: [], takes: [take()], ceilings: [] }, paths: PATHS, pathId: PATH, exerciseIds: [TUNE], now: NOW, grading: "on" });
    expect(line && t(line.key, line.values)).toBe(`${tune.title}: bar 1 of the tune slipped on 2 of 3 rounds yesterday.`);
  });

  it("nothing for another Step, a Take marked not fair, or grading off", () => {
    const base = { paths: PATHS, pathId: PATH, now: NOW };
    expect(stepLine({ ...base, progress: { states: [], takes: [take()], ceilings: [] }, exerciseIds: [FOUR], grading: "on" })).toBeNull();
    expect(stepLine({ ...base, progress: { states: [], takes: [take({ facts: { fair: "no" } })], ceilings: [] }, exerciseIds: [TUNE], grading: "on" })).toBeNull();
    expect(stepLine({ ...base, progress: { states: [], takes: [take()], ceilings: [] }, exerciseIds: [TUNE], grading: "off" })).toBeNull();
  });
});

/** Every English sentence the line can say. */
function strings(node: unknown, prefix: string): Array<[string, string]> {
  if (typeof node === "string") return [[prefix, node]];
  if (!node || typeof node !== "object") return [];
  return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => strings(v, `${prefix}.${k}`));
}
const LINE = strings((en as { session: { today: { line: unknown } } }).session.today.line, "session.today.line");

describe("the line's English is honest", () => {
  it("has strings", () => expect(LINE.length).toBeGreaterThan(20));

  it.each(LINE)("%s: no streak, no missed day, no praise for showing up, no microphone", (_k, text) => {
    expect(text).not.toMatch(/streak|in a row|missed|skipped a day|great job|well done|nice work|welcome back|proud|microphone|\bmic\b|input/i);
    expect(text).not.toMatch(/!/);
  });

  it.each(LINE)("%s: claims nothing the app cannot measure, and never calls the pass mark \"the bar\"", (_k, text) => {
    expect(bannedClaimsIn(text, true).map((c) => c.name)).toEqual([]);
    expect(text).not.toMatch(/\bthe bar\b|\bpass bar\b/i);
  });

  it.each(LINE.filter(([k]) => /\.(slipped|earned|ungraded)\.|\.back\./.test(k)))("%s names its window", (_k, text) => {
    expect(text).toMatch(/earlier today|yesterday|last Session/i);
  });
});
