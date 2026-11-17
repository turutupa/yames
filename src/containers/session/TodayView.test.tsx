/** Today's first-run footnote: it asks for an input only when none is listening. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import type { PathDoc } from "../../paths/format";
import type { PlanStep } from "../../session/planner";
import { StepTag, TodayView } from "./TodayView";
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

describe("the plan's tag is the Path's kind (QA 2026-11-17 #9)", () => {
  const paths = [
    { id: "blues-pentatonics", kind: "theory" },
    { id: "shred", kind: "mechanics" },
  ] as unknown as PathDoc[];
  const step = (pathId: string, role = "focus") =>
    ({ kind: "exercise", id: "focus", role, pathId, exerciseId: "x", title: "Box 1", minutes: 4, bpm: 70, why: { code: "chosen", values: {} } }) as unknown as PlanStep;

  it("a Blues Exercise reads Theory, as its Take screen does", () => {
    render(<StepTag step={step("blues-pentatonics")} paths={paths} />);
    const tag = document.querySelector(".session-tag")!;
    expect(tag.getAttribute("data-kind")).toBe("theory");
    expect(tag.textContent).toBe(i18n.t("session.kind.theory"));
  });

  it("a Shred Exercise reads Mechanics; a role with its own tag keeps it", () => {
    render(<StepTag step={step("shred")} paths={paths} />);
    expect(document.querySelector(".session-tag")!.textContent).toBe(i18n.t("session.kind.mechanics"));
    cleanup();
    render(<StepTag step={step("blues-pentatonics", "review")} paths={paths} />);
    expect(document.querySelector(".session-tag")!.textContent).toBe(i18n.t("session.kind.review"));
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
