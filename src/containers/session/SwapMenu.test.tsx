/** Today's Swap: its own button beside the row, the menu, and the preview before anything changes. */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import i18n from "../../i18n";
import type { PlanStep } from "../../session/planner";
import type { SwapChoice, SwapOptions } from "../../session/swap";
import { TodayView } from "./TodayView";
import type { SessionRun } from "./hooks/useSessionRun";

const ex = (id: string, title: string, extra: Partial<PlanStep> = {}): PlanStep =>
  ({
    kind: "exercise",
    id,
    role: "focus",
    pathId: "alternate-picking",
    stepId: "s",
    exerciseId: title.toLowerCase().replace(/ /g, "-"),
    title,
    bpm: 80,
    minutes: 5,
    variantSeed: null,
    why: { code: "newExercise", values: { exercise: title } },
    ...extra,
  }) as PlanStep;

const focus = ex("focus", "Open string");
const harder = [ex("focus", "Four fingers", { swappedFrom: "Open string" } as Partial<PlanStep>), ex("focus", "Pedal riff")];
const jam: PlanStep = { kind: "jam", id: "jam", title: "", minutes: 4, why: { code: "jam", values: {} } };

function run(steps: PlanStep[] = [focus, jam]) {
  const options = vi.fn((_i: number, c: SwapChoice): SwapOptions =>
    c === "harder"
      ? { candidates: harder, none: null }
      : c === "different"
        ? { candidates: [ex("focus", "Gear change")], none: null }
        : { candidates: [], none: "style" },
  );
  const session = {
    plan: { mood: "returning", steps, daysAway: 1, minutes: 10 },
    minutes: 10,
    setMinutes: vi.fn(),
    paths: [{ id: "alternate-picking", title: "Alternate Picking", kind: "mechanics", steps: [] }],
    myPaths: [{ id: "alternate-picking" }],
    progress: { states: [], takes: [], ceilings: [] },
    actions: {
      startToday: vi.fn(),
      startTodayAt: vi.fn(),
      swapOptionsAt: options,
      confirmSwap: vi.fn(),
      undoSwap: vi.fn(),
    },
  } as unknown as SessionRun;
  render(<TodayView session={session} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
  return session;
}

afterEach(cleanup);

describe("the Swap button", () => {
  it("sits beside an Exercise row, not on the band's", () => {
    run();
    expect(screen.getByTestId("today-swap-0")).toBeTruthy();
    expect(screen.queryByTestId("today-swap-1")).toBeNull();
    // Its own button, never inside the row's.
    expect(screen.getByTestId("today-row-0").contains(screen.getByTestId("today-swap-0"))).toBe(false);
    expect(screen.getByTestId("today-swap-0").getAttribute("aria-label")).toBe(
      i18n.t("session.today.swap.buttonLabel", { title: "Open string" }),
    );
  });

  it("opens the menu and does not start the Session", () => {
    const s = run();
    fireEvent.click(screen.getByTestId("today-swap-0"));
    expect(screen.getByTestId("swap-menu")).toBeTruthy();
    expect(s.actions.startTodayAt).not.toHaveBeenCalled();
    expect(screen.getByTestId("today-swap-0").getAttribute("aria-expanded")).toBe("true");
  });

  it("a key on the button stays with the button", () => {
    const s = run();
    fireEvent.keyDown(screen.getByTestId("today-swap-0"), { key: "Enter" });
    expect(s.actions.startTodayAt).not.toHaveBeenCalled();
  });
});

describe("the menu", () => {
  it("offers three ways; one with nothing says why, and is off", () => {
    run();
    fireEvent.click(screen.getByTestId("today-swap-0"));
    expect((screen.getByTestId("swap-harder") as HTMLButtonElement).disabled).toBe(false);
    const style = screen.getByTestId("swap-style") as HTMLButtonElement;
    expect(style.disabled).toBe(true);
    expect(style.textContent).toContain(i18n.t("session.today.swap.none.style"));
  });

  it("is keyboard-driven: focus goes in, arrows move, Escape closes and hands focus back", () => {
    run();
    const button = screen.getByTestId("today-swap-0");
    fireEvent.click(button);
    expect(document.activeElement).toBe(screen.getByTestId("swap-harder"));
    fireEvent.keyDown(screen.getByTestId("swap-menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("swap-different"));
    // Another style is off: the arrows go round past it.
    fireEvent.keyDown(screen.getByTestId("swap-menu"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("swap-harder"));
    fireEvent.keyDown(screen.getByTestId("swap-menu"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(screen.getByTestId("swap-close"));
    fireEvent.keyDown(screen.getByTestId("swap-menu"), { key: "Escape" });
    expect(screen.queryByTestId("swap-menu")).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("a press outside closes it", () => {
    run();
    fireEvent.click(screen.getByTestId("today-swap-0"));
    act(() => {
      document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    });
    expect(screen.queryByTestId("swap-menu")).toBeNull();
  });
});

describe("the preview", () => {
  it("shows the replacement; Show another pages; Swap it in confirms that one", () => {
    const s = run();
    fireEvent.click(screen.getByTestId("today-swap-0"));
    fireEvent.click(screen.getByTestId("swap-harder"));
    expect(screen.getByTestId("swap-preview-title").textContent).toBe("Four fingers");
    expect(screen.getByTestId("swap-preview").textContent).toContain(i18n.t("session.today.minutes", { minutes: 5 }));
    expect(screen.getByTestId("swap-preview").textContent).toContain("80 BPM");
    expect(document.activeElement).toBe(screen.getByTestId("swap-confirm"));
    fireEvent.click(screen.getByTestId("swap-another"));
    expect(screen.getByTestId("swap-preview-title").textContent).toBe("Pedal riff");
    fireEvent.click(screen.getByTestId("swap-confirm"));
    expect(s.actions.confirmSwap).toHaveBeenCalledWith(0, harder[1]);
    expect(s.actions.startTodayAt).not.toHaveBeenCalled();
    expect(screen.queryByTestId("swap-menu")).toBeNull();
  });

  it("every choice counts its candidates, 1 of 1 too (acceptance 4)", () => {
    run();
    fireEvent.click(screen.getByTestId("today-swap-0"));
    fireEvent.click(screen.getByTestId("swap-different"));
    expect(screen.getByTestId("swap-count").textContent).toBe(i18n.t("session.today.swap.count", { n: 1, count: 1 }));
  });

  it("Harder at a lower tempo than the block says why; at the same tempo says nothing", () => {
    run();
    fireEvent.click(screen.getByTestId("today-swap-0"));
    fireEvent.click(screen.getByTestId("swap-harder"));
    expect(screen.queryByTestId("swap-tempo-note")).toBeNull();
    cleanup();
    const slowHarder = [ex("focus", "Four fingers", { bpm: 60 })];
    const session = {
      plan: { mood: "returning", steps: [focus, jam], daysAway: 1, minutes: 10 },
      minutes: 10,
      setMinutes: vi.fn(),
      paths: [],
      myPaths: [],
      progress: { states: [], takes: [], ceilings: [] },
      actions: {
        startToday: vi.fn(),
        startTodayAt: vi.fn(),
        swapOptionsAt: (_i: number, c: SwapChoice): SwapOptions =>
          c === "harder" ? { candidates: slowHarder, none: null } : { candidates: [], none: c },
        confirmSwap: vi.fn(),
        undoSwap: vi.fn(),
      },
    } as unknown as SessionRun;
    render(<TodayView session={session} onOpenTools={vi.fn()} onOpenPaths={vi.fn()} />);
    fireEvent.click(screen.getByTestId("today-swap-0"));
    fireEvent.click(screen.getByTestId("swap-harder"));
    expect(screen.getByTestId("swap-tempo-note").textContent).toBe(
      i18n.t("session.today.swap.tempo.startsSlow", { bpm: 60, was: 80 }),
    );
  });

  it("Cancel changes nothing", () => {
    const s = run();
    fireEvent.click(screen.getByTestId("today-swap-0"));
    fireEvent.click(screen.getByTestId("swap-different"));
    expect(screen.queryByTestId("swap-another")).toBeNull();
    fireEvent.click(screen.getByTestId("swap-cancel"));
    expect(s.actions.confirmSwap).not.toHaveBeenCalled();
    expect(screen.queryByTestId("swap-menu")).toBeNull();
  });

  it("a swapped row says so, and offers to put the planner's choice back", () => {
    const s = run([harder[0], jam]);
    expect(screen.getByTestId("today-swapped-0").textContent).toContain(i18n.t("session.today.swap.swapped"));
    fireEvent.click(screen.getByTestId("today-swap-0"));
    fireEvent.click(screen.getByTestId("swap-undo"));
    expect(s.actions.undoSwap).toHaveBeenCalledWith(0);
  });
});
