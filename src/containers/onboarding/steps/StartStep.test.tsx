/**
 * "Where do you start?" — the first Path and its Level.
 *
 * Rendered inside the real wizard shell, with the real packs, so the tests
 * exercise the contract: what is preselected, the commit the shell runs on
 * Next (and never on Skip), and that a re-run that changes nothing writes
 * nothing. `startPath` is a spy standing in for `useSessionRun`'s.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { PathDoc } from "../../../paths/format";
import { loadAllPacks } from "../../../session/packs";
import { NO_PROGRESS, type PlayerProgress } from "../../../session/progress";
import { OnboardingWizard } from "../OnboardingWizard";
import type { OnboardingState } from "../onboardingMachine";
import type { WizardLearningEnv } from "../WizardContext";
import { defaultStart, startablePaths } from "./StartStep";

let PATHS: PathDoc[] = [];
beforeAll(async () => {
  PATHS = await loadAllPacks("en");
});

const AT_START: OnboardingState = {
  status: "step",
  stepId: "start",
  context: { skipped: [], visited: ["welcome", "instrument", "start"] },
};

function mount(progress: PlayerProgress = NO_PROGRESS, paths: PathDoc[] = PATHS) {
  const dispatch = vi.fn();
  const startPath = vi.fn<WizardLearningEnv["startPath"]>(() => null);
  render(
    <OnboardingWizard
      state={AT_START}
      dispatch={dispatch}
      appVersion="1.0.0"
      instrument="electric-guitar"
      instrumentChosen
      onInstrumentChange={vi.fn()}
      soundType="click"
      themeId="obsidian"
      coachTier="off"
      alwaysOnTop={false}
      onAlwaysOnTopChange={vi.fn()}
      startSoftClick={vi.fn()}
      stopSoftClick={vi.fn()}
      softClickPlaying={false}
      onFinish={vi.fn()}
      learning={{ paths, progress, plan: null, startPath }}
    />,
  );
  return { dispatch, startPath };
}

const next = () => screen.getByRole("button", { name: "Next" });
const pathCard = (id: string) => document.querySelector<HTMLButtonElement>(`[data-path="${id}"]`)!;
const levelButton = (id: string) => document.querySelector<HTMLButtonElement>(`[data-level="${id}"]`)!;

describe("Where do you start? — what it offers", () => {
  it("offers the five Paths in the owner's order", () => {
    expect(startablePaths(PATHS).map((p) => p.id)).toEqual([
      "shred",
      "blues-pentatonics",
      "classic-rock",
      "alternate-picking",
      "sweep-picking",
    ]);
  });

  it("preselects Shred at its first Level on a first run, Next open", () => {
    mount();
    expect(pathCard("shred")).toHaveAttribute("aria-pressed", "true");
    expect(levelButton("beginner")).toHaveAttribute("aria-pressed", "true");
    expect(next()).toBeEnabled();
    // The Level's own words and where it starts, as the Path page says them.
    const about = screen.getByTestId("onboarding-start-about");
    expect(about.textContent).toContain("One string, then two");
    expect(about.textContent).toMatch(/Starts at Step 1/);
  });

  it("starts a re-run on the Path the player follows, at their Level", () => {
    const progress: PlayerProgress = {
      ...NO_PROGRESS,
      states: [{ pathId: "blues-pentatonics", level: "intermediate", startedAt: 1, updatedAt: 1 }],
    };
    expect(defaultStart(PATHS, progress)).toEqual({ pathId: "blues-pentatonics", levelId: "intermediate" });
    // A Path this run started comes first, once it is followed.
    const both: PlayerProgress = {
      ...progress,
      states: [...progress.states, { pathId: "sweep-picking", startedAt: 2, updatedAt: 2 }],
    };
    expect(defaultStart(PATHS, both, "sweep-picking")).toEqual({ pathId: "sweep-picking", levelId: "beginner" });
    expect(defaultStart(PATHS, progress, "sweep-picking")?.pathId).toBe("blues-pentatonics");
    mount(progress);
    expect(pathCard("blues-pentatonics")).toHaveAttribute("aria-pressed", "true");
    expect(levelButton("intermediate")).toHaveAttribute("aria-pressed", "true");
  });

  it("says it is loading until the Paths arrive, and lets the player on", () => {
    mount(NO_PROGRESS, []);
    expect(screen.getByRole("status")).toHaveTextContent("Loading the Paths");
    expect(next()).toBeEnabled();
  });
});

describe("Where do you start? — selection is not navigation", () => {
  it("picking a Path and a Level only selects them; Next starts the Path there", () => {
    const { dispatch, startPath } = mount();
    fireEvent.click(pathCard("classic-rock"));
    fireEvent.click(levelButton("advanced"));
    expect(dispatch).not.toHaveBeenCalled();
    expect(startPath).not.toHaveBeenCalled();
    expect(pathCard("classic-rock")).toHaveAttribute("aria-pressed", "true");
    act(() => next().click());
    expect(startPath).toHaveBeenCalledTimes(1);
    const [path, level] = startPath.mock.calls[0];
    expect(path.id).toBe("classic-rock");
    expect(level).toBe("advanced");
    // W7 and a Back here show this Path, whatever else the player follows.
    expect(dispatch).toHaveBeenCalledWith({ type: "SET_CONTEXT", patch: { startPathId: "classic-rock" } });
    expect(dispatch).toHaveBeenCalledWith({ type: "NEXT" });
  });

  it("a new Path starts at its own first Level", () => {
    mount();
    fireEvent.click(levelButton("advanced"));
    fireEvent.click(pathCard("sweep-picking"));
    expect(levelButton("beginner")).toHaveAttribute("aria-pressed", "true");
  });

  it("Skip writes nothing, which leaves today's default", () => {
    const { dispatch, startPath } = mount();
    fireEvent.click(pathCard("blues-pentatonics"));
    act(() => screen.getByRole("button", { name: "Skip" }).click());
    expect(startPath).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({ type: "SKIP_STEP" });
  });

  it("Next on a re-run that changed nothing writes nothing", () => {
    const progress: PlayerProgress = {
      ...NO_PROGRESS,
      states: [{ pathId: "shred", level: "intermediate", currentStepId: "x", startedAt: 1, updatedAt: 1 }],
    };
    const { startPath } = mount(progress);
    act(() => next().click());
    expect(startPath).not.toHaveBeenCalled();
  });

  it("at the cap, a new Path is refused with the Path page's words and Next waits", () => {
    const ids = ["shred", "alternate-picking", "sweep-picking", "classic-rock"];
    const progress: PlayerProgress = {
      ...NO_PROGRESS,
      states: ids.map((pathId) => ({ pathId, startedAt: 1, updatedAt: 1 })),
    };
    mount(progress);
    fireEvent.click(pathCard("blues-pentatonics"));
    expect(screen.getByTestId("onboarding-start-cap")).toBeInTheDocument();
    expect(next()).toBeDisabled();
    fireEvent.click(pathCard("shred"));
    expect(screen.queryByTestId("onboarding-start-cap")).toBeNull();
    expect(next()).toBeEnabled();
  });
});

describe("Where do you start? — the step's place", () => {
  it("is a dot of its own in the progress bar", () => {
    mount();
    const dots = document.querySelectorAll(".onboarding-dot");
    // instrument, start, audio-input, coach, sound-look, hands-free, ready.
    expect(dots).toHaveLength(7);
    expect(dots[1]).toHaveClass("active");
    expect(within(screen.getByRole("dialog")).getByText("Where do you start?")).toBeInTheDocument();
  });
});
