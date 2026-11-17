/** Today's first-run footnote: it asks for an input only when none is listening. */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { TodayView } from "./TodayView";
import type { SessionRun } from "./hooks/useSessionRun";

function firstRun(): SessionRun {
  return {
    plan: { mood: "first", steps: [], daysAway: null },
    minutes: 10,
    setMinutes: vi.fn(),
    myPaths: [],
    progress: { takes: [] },
    actions: { startToday: vi.fn() },
  } as unknown as SessionRun;
}

afterEach(cleanup);

describe("Today on a first run", () => {
  it("says grading needs an input when nothing is listening", () => {
    render(<TodayView session={firstRun()} onOpenLastTool={vi.fn()} onOpenTools={vi.fn()} listening={false} />);
    expect(screen.queryByText("Grading needs a microphone or direct input.")).not.toBeNull();
  });

  it("does not, while the input is listening", () => {
    render(<TodayView session={firstRun()} onOpenLastTool={vi.fn()} onOpenTools={vi.fn()} listening />);
    expect(screen.queryByText("Grading needs a microphone or direct input.")).toBeNull();
  });
});
