/** What each row of Today's plan says: its role, its tempo, its short reason. */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanStep, ReasonCode } from "../../session/planner";
import { ROLE_WORDS, bpmLine, roleOf, shortContext, shortReason, ticksOf } from "./todayPlan";

const ex = (role: string, code: ReasonCode, values: Record<string, string | number> = {}, extra = {}) =>
  ({ kind: "exercise", id: `${role}-${code}`, role, pathId: "shred", stepId: "s", exerciseId: "e", title: "T", bpm: 80, minutes: 4, variantSeed: null, why: { code, values }, ...extra }) as unknown as PlanStep;

describe("roleOf", () => {
  it("names each role in plain words", () => {
    expect(roleOf(ex("placement", "placement"))).toBe("placement");
    expect(roleOf(ex("focus", "newExercise"))).toBe("new");
    expect(roleOf(ex("next", "newStep"))).toBe("new");
    expect(roleOf(ex("next", "nextInStep"))).toBe("nextUp");
    expect(roleOf(ex("focus", "belowBar"))).toBe("nextUp");
    expect(roleOf(ex("review", "reviewDue"))).toBe("review");
    expect(roleOf(ex("benchmark", "benchmark"))).toBe("benchmark");
    expect(roleOf(ex("test", "testOut"))).toBe("test");
    const warm = { kind: "metronome", id: "w", title: "", bpm: 70, subdivision: 1, minutes: 2, why: { code: "warmUp", values: {} } } as PlanStep;
    expect(roleOf(warm)).toBe("warmUp");
    expect(roleOf({ ...warm, why: { code: "yourTurn", values: {} } } as PlanStep)).toBe("yourTurn");
    const jam = { kind: "jam", id: "j", title: "", minutes: 4, why: { code: "jam", values: {} } } as PlanStep;
    expect(roleOf(jam)).toBe("jam");
    expect(roleOf({ ...jam, exerciseId: "x" } as PlanStep)).toBe("finisher");
  });
});

describe("bpmLine", () => {
  it("is from → to for placement, and one number otherwise", () => {
    expect(bpmLine(ex("placement", "placement", {}, { bpm: 60, placement: { passAtBpm: 110, then: null } }))).toEqual({
      key: "session.today.bpmRange",
      values: { from: 60, to: 110 },
    });
    expect(bpmLine(ex("next", "nextInStep"))).toEqual({ key: "session.today.bpm", values: { bpm: 80 } });
    expect(bpmLine({ kind: "jam", id: "j", title: "", minutes: 4, why: { code: "jam", values: {} } } as PlanStep)).toBeNull();
  });
});

describe("shortReason", () => {
  it("keeps a reason that quotes what was measured", () => {
    const step = ex("focus", "belowBar", { metric: "timingEvenness", value: 78, bpm: 80, bar: 85 });
    expect(shortReason(step).key).toBe("session.why.belowBar.even");
  });

  it("drops the BPM the right-hand column already shows", () => {
    expect(shortReason(ex("next", "nextInStep", { step: "S", bpm: 60 })).key).toBe("session.today.reason.nextInStep");
    expect(shortReason(ex("review", "reviewDue", { left: 1, step: "S", bpm: 60 })).key).toBe("session.today.reason.reviewDueLeft");
  });

  it("a second Exercise from the same Step says it follows the first, not the same words", () => {
    const a = ex("next", "nextInStep", { step: "S", bpm: 60 });
    const b = ex("next", "nextInStep", { step: "S", bpm: 60 });
    expect(shortReason(b, [a]).key).toBe("session.today.reason.nextInStepAgain");
    expect(shortReason(b, [ex("next", "nextInStep", { step: "Other", bpm: 60 })]).key).toBe("session.today.reason.nextInStep");
  });

  it("whose turn it is, without the Path's name", () => {
    expect(shortContext({ code: "keepWarm", values: { path: "Shred", days: 3 } }).key).toBe("session.today.context.keepWarm");
    expect(shortContext({ code: "focusTurn", values: { path: "Shred", days: 5 } }).key).toBe("session.today.context.focusTurnAway");
    expect(shortContext({ code: "parked", values: { path: "Shred", exercise: "E", days: 2 } }).key).toBe("session.why.parked");
  });
});

describe("ticksOf", () => {
  it("every five minutes and the end", () => {
    expect(ticksOf(15)).toEqual([0, 5, 10, 15]);
    expect(ticksOf(5)).toEqual([0, 5]);
    expect(ticksOf(12)).toEqual([0, 5, 10, 12]);
  });
});

describe("every row's words exist in all fifteen languages", () => {
  const dir = path.resolve(process.cwd(), "src/locales");
  const langs = fs.readdirSync(dir).filter((d) => fs.statSync(path.join(dir, d)).isDirectory());
  const reasons = [
    "firstEver", "newExercise", "newStep", "nextInStep", "nextInStepAgain", "climb", "passedKeepGoing", "backEased",
    "backEasedNoClean", "warmUp", "warmUpClean", "edge", "edgeFirst", "reviewDue", "reviewDueSlipped", "reviewDueLeft",
    "finisher", "placement", "testOut", "benchmark", "yourTurn", "jam",
  ];
  const contexts = ["focusTurn", "focusTurnAway", "keepWarm", "keepWarmYesterday", "keepWarmToday", "keepWarmNew"];
  it.each(langs)("%s", (lang) => {
    const today = JSON.parse(fs.readFileSync(path.join(dir, lang, "session.json"), "utf8")).session.today;
    for (const r of ROLE_WORDS) expect(typeof today.role[r], `${lang} role.${r}`).toBe("string");
    for (const r of reasons) expect(typeof today.reason[r], `${lang} reason.${r}`).toBe("string");
    for (const c of contexts) expect(typeof today.context[c], `${lang} context.${c}`).toBe("string");
    for (const k of ["leadFirstOutcome", "parts", "toolsAsk", "openTools", "moreBelow", "bpm", "bpmRange"]) {
      expect(typeof today[k], `${lang} ${k}`).toBe("string");
    }
  });
});
