/**
 * Listen first (card #28): while the demo plays, the ready screen's input line
 * says the app is playing it, not "Listening. Play a note to check.", and goes
 * back to the input's own words when it stops.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReadyInput } from "./parts";
import type { SessionRun } from "./hooks/useSessionRun";

afterEach(cleanup);

function fake(demo: boolean) {
  return {
    run: { phase: "ready", ungraded: null },
    inputStart: { status: "idle", failure: null, device: null, fellBack: false },
    actions: { playUngraded: vi.fn() },
    listen: { active: demo },
  } as unknown as SessionRun;
}

describe("the ready screen's input line and a listen demo", () => {
  it("says the demo is playing while it plays", () => {
    render(<ReadyInput session={fake(true)} listening hasSignal onTestInput={vi.fn()} onChooseInput={vi.fn()} />);
    expect(screen.getByTestId("session-listen-note")).toHaveTextContent("Playing it for you. Start take when you're ready.");
    expect(screen.queryByTestId("session-input-on")).toBeNull();
    expect(screen.queryByText("Listening. Play a note to check.")).toBeNull();
  });

  it("goes back to the input's own line once it stops", () => {
    render(<ReadyInput session={fake(false)} listening hasSignal={false} onTestInput={vi.fn()} onChooseInput={vi.fn()} />);
    expect(screen.queryByTestId("session-listen-note")).toBeNull();
    expect(screen.getByTestId("session-input-on")).toHaveTextContent("Listening. Play a note to check.");
  });
});
