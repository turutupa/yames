/** Today: the plan as a numbered list, and the note that asks for an input only when none is listening. */
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
    progress: { states: [], takes: [], ceilings: [] },
    actions: { startToday: vi.fn(), startTodayAt: vi.fn() },
  } as unknown as SessionRun;
}

afterEach(cleanup);

describe("Today without an input", () => {
  // The input's state is the header's chip now, one accurate status with the
  // way to set it up (UX audit TODAY-10); Today no longer says "No mic yet?".
  it("leaves the input to the header", () => {
    render(<TodayView session={firstRun()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    expect(screen.queryByText("No mic yet?")).toBeNull();
    expect(screen.queryByTestId("today-no-mic")).toBeNull();
  });
});

describe("the tag says the role in plain words; the kind is colour only (panel 2026-11-17)", () => {
  const paths = [
    { id: "blues-pentatonics", kind: "theory" },
    { id: "shred", kind: "mechanics" },
  ] as unknown as PathDoc[];
  const step = (pathId: string, role = "focus", code = "chosen") =>
    ({ kind: "exercise", id: "focus", role, pathId, exerciseId: "x", title: "Box 1", minutes: 4, bpm: 70, why: { code, values: {} } }) as unknown as PlanStep;

  it("a Blues Exercise is coloured Theory, and its words are its role", () => {
    render(<StepTag step={step("blues-pentatonics")} paths={paths} />);
    const tag = document.querySelector(".session-tag")!;
    expect(tag.getAttribute("data-kind")).toBe("theory");
    expect(tag.textContent).toBe(i18n.t("session.today.role.nextUp"));
    expect(tag.textContent).not.toBe(i18n.t("session.kind.theory"));
  });

  it("never reads Mechanics or Placement; placement is \"Find your level\"", () => {
    render(<StepTag step={step("shred", "placement", "placement")} paths={paths} />);
    expect(document.querySelector(".session-tag")!.textContent).toBe("Find your level");
    cleanup();
    render(<StepTag step={step("shred", "focus", "newExercise")} paths={paths} />);
    expect(document.querySelector(".session-tag")!.textContent).toBe("New");
    cleanup();
    render(<StepTag step={step("blues-pentatonics", "review")} paths={paths} />);
    expect(document.querySelector(".session-tag")!.textContent).toBe("Review");
  });
});

describe("the plan as a list", () => {
  const paths = [
    { id: "shred", kind: "mechanics", title: "Shred", steps: [] },
  ] as unknown as PathDoc[];
  const warm = {
    kind: "metronome", id: "warm", title: "A melody up one string", bpm: 70, subdivision: 1, minutes: 2,
    pathId: "shred", exerciseId: "m", why: { code: "warmUp", values: { bpm: 70 } },
  };
  const place = {
    kind: "exercise", id: "p", role: "placement", pathId: "shred", stepId: "s1", exerciseId: "a", title: "Open A, sixteenths",
    bpm: 60, minutes: 5, variantSeed: null, placement: { passAtBpm: 110, then: null },
    why: { code: "placement", values: { path: "Shred", step: "One-string sixteenths", bpm: 60, pass: 110 } },
  };
  const next = (id: string, title: string) => ({
    kind: "exercise", id, role: "next", pathId: "shred", stepId: "s1", exerciseId: id, title, bpm: 60, minutes: 4, variantSeed: null,
    why: { code: "nextInStep", values: { step: "One-string sixteenths", bpm: 60 } },
  });
  function planned(): SessionRun {
    return {
      ...firstRun(),
      minutes: 15,
      paths,
      myPaths: [{ id: "shred", title: "Shred" }],
      plan: { mood: "first", daysAway: null, minutes: 15, steps: [warm, place, next("b", "The fret-12 loop"), next("c", "1-2-3-4 on one string")] },
    } as unknown as SessionRun;
  }

  it("is a numbered list with list semantics, a row per step", () => {
    render(<TodayView session={planned()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    const list = document.querySelector("ol.session-plan-list")!;
    expect(list.getAttribute("role")).toBe("list");
    const rows = [...list.querySelectorAll("li")];
    expect(rows).toHaveLength(4);
    // Each row is a button inside its list item (owner, 2026-11-18).
    expect(rows[0].querySelector("button.session-plan-item")!.hasAttribute("data-first")).toBe(true);
    expect(rows.map((r) => r.querySelector(".session-plan-dot")!.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(screen.queryByText("4 parts · 15 min")).not.toBeNull();
  });

  it("starts the Session at the row pressed, by click or by key; Start still starts at the first", () => {
    const session = planned();
    render(<TodayView session={session} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    const third = screen.getByTestId("today-row-2");
    expect(third.tagName).toBe("BUTTON");
    expect(third.getAttribute("aria-label")).toMatch(/^Start the Session at 3: /);
    fireEvent.click(third);
    expect(session.actions.startTodayAt).toHaveBeenCalledWith(2);
    expect(session.actions.startToday).not.toHaveBeenCalled();
  });

  it("puts the tempo on the right, \"60 → 110 BPM\" for placement, and the Path on the meta line", () => {
    render(<TodayView session={planned()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    const rows = [...document.querySelectorAll(".session-plan-item")];
    expect(rows[0].querySelector(".session-plan-bpm")!.textContent).toBe("70 BPM");
    expect(rows[1].querySelector(".session-plan-bpm")!.textContent).toBe("60 → 110 BPM");
    // One Path: its name on every row says nothing (UX audit TODAY-6).
    expect(rows[1].querySelector(".session-plan-meta")!.textContent).toBe("Find your level");
    expect(rows[0].querySelector(".session-plan-meta")!.textContent).toContain("Warm-up · not graded");
  });

  it("names the Path on the meta line once two or more are active", () => {
    const run = planned();
    const two = { ...run, myPaths: [...run.myPaths, { id: "blues", title: "Blues" }] } as unknown as SessionRun;
    render(<TodayView session={two} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    const rows = [...document.querySelectorAll(".session-plan-item")];
    expect(rows[1].querySelector(".session-plan-meta")!.textContent).toBe("Find your level · Shred");
  });

  it("gives every row its own short reason, without the BPM (the owner's screenshot)", () => {
    render(<TodayView session={planned()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    const reasons = [...document.querySelectorAll(".session-plan-why")].map((r) => r.textContent);
    expect(new Set(reasons).size).toBe(reasons.length);
    expect(reasons[2]).toBe("The next one in One-string sixteenths.");
    for (const r of reasons) expect(r).not.toMatch(/BPM/);
  });

  it("names row 1 under Start, and offers Tools with one link", () => {
    const onOpenTools = vi.fn();
    render(<TodayView session={planned()} onOpenTools={onOpenTools} onOpenPaths={vi.fn()} />);
    expect(screen.getByTestId("today-start").textContent).toBe("StartA melody up one string");
    expect(screen.queryByText("Always open there")).toBeNull();
    fireEvent.click(screen.getByText("Open Tools"));
    expect(onOpenTools).toHaveBeenCalledTimes(1);
  });

  it("says what a first Session is for", () => {
    render(<TodayView session={planned()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    // Broken only between its parts, never "START" alone (acceptance P1-11).
    expect(screen.getByTestId("today-lead").textContent).toBe("First session · finds where you start");
    expect(screen.getByTestId("today-lead").querySelectorAll(".session-kick-part")).toHaveLength(2);
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
    render(<TodayView session={noPaths()} onOpenTools={vi.fn()} onOpenPaths={onOpenPaths} />);
    expect(screen.queryByTestId("today-start")).toBeNull();
    fireEvent.click(screen.getByTestId("today-choose-path"));
    expect(onOpenPaths).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/not on any Path/)).not.toBeNull();
  });

  it("keeps Start while the Paths are still loading", () => {
    render(<TodayView session={firstRun()} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    expect(screen.queryByTestId("today-start")).not.toBeNull();
    expect(screen.queryByTestId("today-choose-path")).toBeNull();
  });
});
