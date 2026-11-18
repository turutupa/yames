/** "Was this grade fair?" on the result: one tap, kept on the Take's row. */
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FairTap, borderline, recapFairOutcome } from "./SessionView";
import type { SessionRun } from "./hooks/useSessionRun";
import type { TakeOutcome } from "../../session/runner";
import { take } from "../../session/testKit";

afterEach(cleanup);

const outcome = { takeId: "t-fair" } as TakeOutcome;

function fake(fair?: "yes" | "no") {
  const answerFair = vi.fn();
  const row = { ...take("even-eighths.open-string"), id: "t-fair", facts: fair ? { fair } : {} };
  const session = { progress: { states: [], takes: [row], ceilings: [] }, actions: { answerFair } };
  return { session: session as unknown as SessionRun, answerFair };
}

describe("the fairness tap", () => {
  it("asks, and keeps the answer against this Take", () => {
    const { session, answerFair } = fake();
    render(<FairTap session={session} outcome={outcome} />);
    expect(screen.getByTestId("session-fair")).toHaveTextContent("Was this grade fair?");
    fireEvent.click(screen.getByTestId("session-fair-no"));
    expect(answerFair).toHaveBeenCalledWith("t-fair", "no");
  });

  it("shows the answer once given", () => {
    const { session } = fake("yes");
    render(<FairTap session={session} outcome={outcome} />);
    expect(screen.getByTestId("session-fair-yes")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Thanks: kept as fair.");
  });

  it("can be changed: the other tap saves again, and the thanks follows it (QA 2026-11-17 #16)", () => {
    function Live() {
      const [fair, setFair] = useState<"yes" | "no" | undefined>(undefined);
      const row = { ...take("even-eighths.open-string"), id: "t-fair", facts: fair ? { fair } : {} };
      const session = {
        progress: { states: [], takes: [row], ceilings: [] },
        actions: { answerFair: (_: string, v: "yes" | "no") => setFair(v) },
      } as unknown as SessionRun;
      return <FairTap session={session} outcome={outcome} />;
    }
    render(<Live />);
    fireEvent.click(screen.getByTestId("session-fair-yes"));
    expect(screen.getByRole("status")).toHaveTextContent("kept as fair");
    fireEvent.click(screen.getByTestId("session-fair-no"));
    expect(screen.getByTestId("session-fair-no")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("session-fair-yes")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("status")).toHaveTextContent("kept as not fair");
  });

  it("is not offered for a Take with no stored row", () => {
    const { session } = fake();
    const { container } = render(<FairTap session={session} outcome={{} as TakeOutcome} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("when the fairness question is asked (acceptance P1-9, pass 3 P2-7)", () => {
  const graded = (takeId: string, value: number, opts: { held?: number; played?: number; stepId?: string } = {}) =>
    ({
      takeId,
      stepId: opts.stepId ?? "s1",
      measures: {
        barsPlayed: opts.played ?? 10,
        pass: opts.held === undefined ? undefined : { heldBars: opts.held },
      },
      grade: {
        verdict: value >= 85 ? "passed" : "belowBar",
        checks: [{ metric: "timingEvenness", value: value / 100, min: 0.85, met: value >= 85 }],
        unmeasured: [],
      },
    }) as unknown as TakeOutcome;

  it("never on a clear pass: 87% against 85% with every bar held", () => {
    expect(borderline(graded("a", 87, { held: 10, played: 10 }))).toBe(false);
    expect(borderline(graded("a", 97))).toBe(false);
  });

  it("on a pass just over the bar that did not hold throughout", () => {
    expect(borderline(graded("a", 87, { held: 8, played: 10 }))).toBe(true);
    expect(borderline(graded("a", 88, { held: 8, played: 10 }))).toBe(true);
    expect(borderline(graded("a", 85))).toBe(true);
  });

  it("on a miss just under the bar, within 3 points", () => {
    expect(borderline(graded("a", 84))).toBe(true);
    expect(borderline(graded("a", 82))).toBe(true);
    expect(borderline(graded("a", 81))).toBe(false);
    expect(borderline(graded("a", 60))).toBe(false);
  });

  it("not 4 points over, even when bars slipped", () => {
    expect(borderline(graded("a", 89, { held: 6, played: 10 }))).toBe(false);
  });

  it("on the recap about the last graded Take, unless already answered this Session", () => {
    const outcomes = [graded("a", 87), graded("b", 97)];
    const row = (id: string, fair?: "yes" | "no") => ({ ...take("even-eighths.open-string"), id, facts: fair ? { fair } : {} });
    expect(recapFairOutcome(outcomes, [row("a"), row("b")])?.takeId).toBe("b");
    expect(recapFairOutcome(outcomes, [row("a", "yes"), row("b")])).toBeNull();
    // Answered on the last Take's own result (acceptance pass 2: "Yes" on
    // Take 1, and the recap still asked "Did today's grades feel fair?").
    expect(recapFairOutcome(outcomes, [row("a"), row("b", "no")])).toBeNull();
    expect(recapFairOutcome([graded("a", 87)], [row("a", "yes")])).toBeNull();
    expect(recapFairOutcome([], [])).toBeNull();
  });

  it("the recap leaves a Find my edge climb alone: it asked once, as it ended", () => {
    const row = (id: string) => ({ ...take("even-eighths.open-string"), id, facts: {} });
    const climb = [graded("e1", 90, { stepId: "edge" }), graded("e2", 84, { stepId: "edge" })];
    expect(recapFairOutcome(climb, [row("e1"), row("e2")], new Set(["edge"]))).toBeNull();
    const mixed = [graded("a", 84), ...climb];
    expect(recapFairOutcome(mixed, [row("a"), row("e1"), row("e2")], new Set(["edge"]))?.takeId).toBe("a");
  });
});
