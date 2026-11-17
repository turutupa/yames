/** Today's first-run footnote: it asks for an input only when none is listening. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import "../../i18n";
import { TodayView } from "./TodayView";
import type { SessionRun } from "./hooks/useSessionRun";

function firstRun(): SessionRun {
  return {
    plan: { mood: "first", steps: [], daysAway: null },
    minutes: 10,
    setMinutes: vi.fn(),
    paths: [],
    myPaths: [],
    progress: { takes: [] },
    actions: { startToday: vi.fn() },
  } as unknown as SessionRun;
}

afterEach(cleanup);

describe("Today on a first run", () => {
  it("says grading needs an input when nothing is listening", () => {
    render(<TodayView session={firstRun()} onOpenLastTool={vi.fn()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} listening={false} />);
    expect(screen.queryByText("Grading needs a microphone or direct input.")).not.toBeNull();
  });

  it("does not, while the input is listening", () => {
    render(<TodayView session={firstRun()} onOpenLastTool={vi.fn()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} listening />);
    expect(screen.queryByText("Grading needs a microphone or direct input.")).toBeNull();
  });
});

describe("Today with no Path subscribed (QA 2026-11-17 #7)", () => {
  function noPaths(): SessionRun {
    return {
      ...firstRun(),
      plan: { mood: "returning", steps: [], daysAway: null },
      paths: [{ id: "alternate-picking" }],
      myPaths: [],
    } as unknown as SessionRun;
  }

  it("offers the Paths as its one big action, and opens them", () => {
    const onOpenPaths = vi.fn();
    render(<TodayView session={noPaths()} onOpenLastTool={vi.fn()} onOpenTools={vi.fn()} onOpenPaths={onOpenPaths} listening />);
    expect(screen.queryByTestId("today-start")).toBeNull();
    fireEvent.click(screen.getByTestId("today-choose-path"));
    expect(onOpenPaths).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/not on any Path/)).not.toBeNull();
  });

  it("keeps Start while the Paths are still loading", () => {
    render(<TodayView session={firstRun()} onOpenLastTool={vi.fn()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} listening />);
    expect(screen.queryByTestId("today-start")).not.toBeNull();
    expect(screen.queryByTestId("today-choose-path")).toBeNull();
  });
});
