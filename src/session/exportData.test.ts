import { describe, expect, it } from "vitest";
import { buildPracticeExport, exportFileName } from "./exportData";
import { planSession } from "./planner";
import { ALT, NOW, progress, take } from "./testKit";

describe("the practice-data export", () => {
  const p = progress({
    takes: [
      take("even-eighths.open-string", {
        facts: { session: NOW, role: "focus", reason: "climb", fair: "no", verdict: "passed" },
      }),
      take("even-eighths.open-string", {
        facts: { role: "benchmark", reason: "benchmark", benchmark: { day: 1, exerciseId: "even-eighths.open-string", bpm: 60 } },
      }),
    ],
    unsubscribed: [],
  });
  const data = buildPracticeExport({
    progress: p,
    paths: [ALT],
    plan: planSession({ minutes: 10, now: NOW, paths: [ALT], progress: p }),
    appVersion: "0.9.0",
    now: NOW,
  });

  it("holds the Takes, ceilings and where each Path stands", () => {
    expect(data.kind).toBe("yames-practice-data");
    expect(data.takes).toHaveLength(2);
    expect(data.paths[0]).toMatchObject({ pathId: ALT.id, title: ALT.title, subscribed: true });
  });

  it("pulls out the benchmark tags, the fairness answers and the planner's reasons", () => {
    expect(data.benchmarks).toEqual([
      expect.objectContaining({ day: 1, exerciseId: "even-eighths.open-string", bpm: 60 }),
    ]);
    expect(data.fairness).toEqual([expect.objectContaining({ fair: "no", verdict: "passed" })]);
    expect(data.plannerReasons.map((r) => r.reason).sort()).toEqual(["benchmark", "climb"]);
    expect(data.todayPlan?.steps.length).toBeGreaterThan(0);
  });

  it("is JSON, and names itself by the day", () => {
    expect(() => JSON.parse(JSON.stringify(data))).not.toThrow();
    expect(exportFileName(Date.UTC(2026, 10, 16))).toBe("yames-practice-2026-11-16.json");
  });
});
