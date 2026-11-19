import { describe, expect, it } from "vitest";
import { NO_DEMO, demoEdge, playedMs } from "./playedClock";

describe("the played clock (acceptance 5, P2-11)", () => {
  const START = 1_000_000;
  it("counts real time with no demo", () => {
    expect(playedMs(START, START + 90_000, NO_DEMO)).toBe(90_000);
  });

  it("stands still while the Watch demo plays, and after it keeps the time without it", () => {
    let c = demoEdge(NO_DEMO, true, START + 10_000, START);
    expect(playedMs(START, START + 10_000, c)).toBe(10_000);
    expect(playedMs(START, START + 18_000, c)).toBe(10_000);
    c = demoEdge(c, false, START + 18_000, START);
    expect(playedMs(START, START + 30_000, c)).toBe(22_000);
    // A second demo adds to the first.
    c = demoEdge(demoEdge(c, true, START + 40_000, START), false, START + 45_000, START);
    expect(playedMs(START, START + 60_000, c)).toBe(47_000);
  });

  it("a new Session starts the demo time at zero", () => {
    const c = demoEdge(demoEdge(NO_DEMO, true, START, START), false, START + 5_000, START);
    const NEXT = START + 100_000;
    expect(playedMs(NEXT, NEXT + 1_000, c)).toBe(1_000);
    expect(demoEdge(c, true, NEXT, NEXT)).toEqual({ startedAt: NEXT, total: 0, since: NEXT });
  });
});
