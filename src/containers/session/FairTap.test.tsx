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

describe("when the fairness question is asked (acceptance P1-9)", () => {
  const graded = (takeId: string, value: number) =>
    ({
      takeId,
      grade: {
        verdict: value >= 85 ? "passed" : "notYet",
        checks: [{ metric: "timingEvenness", value: value / 100, min: 0.85, met: value >= 85 }],
        unmeasured: [],
      },
    }) as unknown as TakeOutcome;

  it("on a result only within 5 points of the bar", () => {
    expect(borderline(graded("a", 87))).toBe(true);
    expect(borderline(graded("a", 80))).toBe(true);
    expect(borderline(graded("a", 97))).toBe(false);
    expect(borderline(graded("a", 60))).toBe(false);
  });

  it("on the recap about the last graded Take, unless already answered this Session", () => {
    const outcomes = [graded("a", 87), graded("b", 97)];
    const row = (id: string, fair?: "yes" | "no") => ({ ...take("even-eighths.open-string"), id, facts: fair ? { fair } : {} });
    expect(recapFairOutcome(outcomes, [row("a"), row("b")])?.takeId).toBe("b");
    expect(recapFairOutcome(outcomes, [row("a", "yes"), row("b")])).toBeNull();
    // Answered on the recap itself: it stays, with its thanks.
    expect(recapFairOutcome(outcomes, [row("a"), row("b", "no")])?.takeId).toBe("b");
    expect(recapFairOutcome([], [])).toBeNull();
  });
});
