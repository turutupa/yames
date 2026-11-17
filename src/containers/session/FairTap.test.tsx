/** "Was this grade fair?" on the result: one tap, kept on the Take's row. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FairTap } from "./SessionView";
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
    expect(screen.getByRole("status")).toHaveTextContent("Thanks");
  });

  it("is not offered for a Take with no stored row", () => {
    const { session } = fake();
    const { container } = render(<FairTap session={session} outcome={{} as TakeOutcome} />);
    expect(container).toBeEmptyDOMElement();
  });
});
