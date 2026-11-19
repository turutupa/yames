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
import { FIRST_PATH_ID, isRunnable, loadAllPacks } from "../../../session/packs";
import { START_HERE_PATH_ID, pathTracks } from "../../../session/tracks";
import { playerPaths } from "../../session/hooks/useSessionRun";
import { NO_PROGRESS, type PlayerProgress } from "../../../session/progress";
import { OnboardingWizard } from "../OnboardingWizard";
import type { OnboardingState } from "../onboardingMachine";
import type { WizardLearningEnv } from "../WizardContext";
import { defaultStart, stagedStart, startablePaths } from "./StartStep";
import { recommendStart } from "./startRecommendation";

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
  it("offers the Paths in the Paths screen's order: Foundations, How harmony works, Technique, Styles", () => {
    expect(startablePaths(PATHS).map((p) => p.id)).toEqual([
      "rhythm-foundations",
      "first-chords",
      "know-the-neck",
      "scales-and-modes",
      "triads",
      "chords-in-a-key",
      "arpeggios-over-changes",
      "alternate-picking",
      "legato",
      "tapping",
      "sweep-picking",
      "shred",
      "metal-rhythm",
      "funk-lines",
      "blues-pentatonics",
      "classic-rock",
    ]);
    expect(startablePaths(PATHS).map((p) => p.id)).toEqual(
      pathTracks(PATHS.filter((p) => isRunnable(p.id))).flatMap((t) => t.paths.map((p) => p.id)),
    );
  });

  it("starts a player who skips the step on the Path it recommends with no answer", () => {
    expect(FIRST_PATH_ID).toBe(START_HERE_PATH_ID);
    expect(playerPaths(PATHS, NO_PROGRESS).map((p) => p.id)).toEqual([START_HERE_PATH_ID]);
    expect(defaultStart(PATHS, NO_PROGRESS)?.pathId).toBe(START_HERE_PATH_ID);
  });

  it("stages Rhythm Foundations at its first Level on a first run with no answer, not Shred", () => {
    mount();
    expect(pathCard("rhythm-foundations")).toHaveAttribute("aria-pressed", "true");
    expect(pathCard("shred")).toHaveAttribute("aria-pressed", "false");
    expect(levelButton("beginner")).toHaveAttribute("aria-pressed", "true");
    expect(next()).toBeEnabled();
    // What is staged and why, in one line.
    expect(screen.getByTestId("onboarding-start-why")).toHaveTextContent(
      "Rhythm Foundations · Where most players start: time, the click and clean notes.",
    );
    // The Level's own words and where it starts, as the Path page says them.
    const about = screen.getByTestId("onboarding-start-about");
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
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_CONTEXT",
      patch: { startPathId: "classic-rock", startPathIds: ["classic-rock"], startGoal: undefined },
    });
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

const goal = (id: string) => document.querySelector<HTMLButtonElement>(`[data-goal="${id}"]`)!;
const pressed = () =>
  [...document.querySelectorAll<HTMLButtonElement>(".onboarding-start-path")]
    .filter((b) => b.getAttribute("aria-pressed") === "true")
    .map((b) => b.dataset.path);

describe("Where do you start? — the recommendation from what the player wants", () => {
  it("asks one optional question with four plain answers, none chosen", () => {
    mount();
    expect(screen.getByText("What do you want most right now?")).toBeInTheDocument();
    const answers = [...document.querySelectorAll("[data-goal]")];
    expect(answers.map((a) => a.textContent)).toEqual([
      "I'm new: the basics, in time",
      "Understand chords and keys",
      "Cleaner, faster picking",
      "Speed: my technique is solid",
    ]);
    expect(answers.every((a) => a.getAttribute("aria-pressed") === "false")).toBe(true);
  });

  it("a beginner gets Rhythm Foundations and Know the Neck, and Next starts both", () => {
    const { dispatch, startPath } = mount();
    fireEvent.click(goal("basics"));
    expect(pressed()).toEqual(["rhythm-foundations", "know-the-neck"]);
    expect(screen.getByTestId("onboarding-start-why")).toHaveTextContent(
      "Rhythm Foundations and Know the Neck · New to the guitar",
    );
    // The Level is the first Path's, and says so.
    expect(screen.getByText("Level in Rhythm Foundations")).toBeInTheDocument();
    fireEvent.click(levelButton("intermediate"));
    expect(pressed()).toEqual(["rhythm-foundations", "know-the-neck"]);
    act(() => next().click());
    expect(startPath.mock.calls.map(([p, l]) => [p.id, l])).toEqual([
      ["rhythm-foundations", "intermediate"],
      ["know-the-neck", "beginner"],
    ]);
    expect(dispatch).toHaveBeenCalledWith({
      type: "SET_CONTEXT",
      patch: { startPathId: "rhythm-foundations", startPathIds: ["rhythm-foundations", "know-the-neck"], startGoal: "basics" },
    });
  });

  it("harmony starts the route at Know the Neck and names the route", () => {
    const { startPath } = mount();
    fireEvent.click(goal("harmony"));
    expect(pressed()).toEqual(["know-the-neck"]);
    expect(screen.getByTestId("onboarding-start-why")).toHaveTextContent(/scales, triads, chords in a key and arpeggios over the changes/);
    act(() => next().click());
    expect(startPath.mock.calls.map(([p]) => p.id)).toEqual(["know-the-neck"]);
  });

  it("technique is Alternate Picking; Shred only for a player who says their technique is solid", () => {
    mount();
    fireEvent.click(goal("technique"));
    expect(pressed()).toEqual(["alternate-picking"]);
    fireEvent.click(goal("speed"));
    expect(pressed()).toEqual(["shred"]);
    expect(goal("technique")).toHaveAttribute("aria-pressed", "false");
    // Again on the chosen answer: no answer, back to the one start.
    fireEvent.click(goal("speed"));
    expect(pressed()).toEqual(["rhythm-foundations"]);
  });

  it("any Path can be picked instead; the line is then that Path's own goal", () => {
    const { startPath } = mount();
    fireEvent.click(goal("basics"));
    fireEvent.click(pathCard("legato"));
    expect(pressed()).toEqual(["legato"]);
    const legato = PATHS.find((p) => p.id === "legato")!;
    expect(screen.getByTestId("onboarding-start-why")).toHaveTextContent(`Legato · ${legato.goal}`);
    // The answer stays lit: it is what the player said, not what was picked.
    expect(goal("basics")).toHaveAttribute("aria-pressed", "true");
    act(() => next().click());
    expect(startPath.mock.calls.map(([p]) => p.id)).toEqual(["legato"]);
  });

  it("a recommendation of two that the cap has no room for is refused, and Next waits", () => {
    const ids = ["shred", "alternate-picking", "sweep-picking"];
    mount({ ...NO_PROGRESS, states: ids.map((pathId) => ({ pathId, startedAt: 1, updatedAt: 1 })) });
    fireEvent.click(goal("basics"));
    expect(screen.getByTestId("onboarding-start-cap")).toBeInTheDocument();
    expect(next()).toBeDisabled();
    fireEvent.click(goal("harmony"));
    expect(screen.queryByTestId("onboarding-start-cap")).toBeNull();
  });

  it("a Path already followed in a recommendation is not started again", () => {
    const progress: PlayerProgress = {
      ...NO_PROGRESS,
      states: [{ pathId: "know-the-neck", level: "beginner", startedAt: 1, updatedAt: 1 }],
    };
    const { startPath } = mount(progress);
    fireEvent.click(goal("basics"));
    act(() => next().click());
    expect(startPath.mock.calls.map(([p]) => p.id)).toEqual(["rhythm-foundations"]);
  });
});

describe("Where do you start? — the pure parts", () => {
  it("recommendStart follows the curriculum map, and never offers what is not there", () => {
    const offered = startablePaths(PATHS);
    expect(recommendStart(null, offered)).toEqual({ pathIds: ["rhythm-foundations"], whyKey: "onboarding.start.why.none" });
    expect(recommendStart("basics", offered)?.pathIds).toEqual(["rhythm-foundations", "know-the-neck"]);
    expect(recommendStart("harmony", offered)?.pathIds).toEqual(["know-the-neck"]);
    expect(recommendStart("technique", offered)?.pathIds).toEqual(["alternate-picking"]);
    expect(recommendStart("speed", offered)?.pathIds).toEqual(["shred"]);
    // Know the Neck missing: the beginner still gets the start.
    const fewer = offered.filter((p) => p.id !== "know-the-neck");
    expect(recommendStart("basics", fewer)?.pathIds).toEqual(["rhythm-foundations"]);
    // Nothing the answer names: the first Path offered.
    expect(recommendStart("speed", [{ id: "blues-pentatonics" }])?.pathIds).toEqual(["blues-pentatonics"]);
    expect(recommendStart("speed", [])).toBeNull();
  });

  it("stagedStart: a pick beats an answer, an answer beats a re-run's Path", () => {
    const follows: PlayerProgress = {
      ...NO_PROGRESS,
      states: [{ pathId: "classic-rock", level: "advanced", startedAt: 1, updatedAt: 1 }],
    };
    const none = { goal: null, pickedPathId: null, levelId: null };
    expect(stagedStart(PATHS, follows, none)).toEqual({ pathIds: ["classic-rock"], levelId: "advanced", whyKey: null });
    expect(stagedStart(PATHS, follows, { ...none, goal: "technique" })?.pathIds).toEqual(["alternate-picking"]);
    expect(stagedStart(PATHS, follows, { ...none, goal: "technique", pickedPathId: "tapping" })).toEqual({
      pathIds: ["tapping"],
      levelId: "beginner",
      whyKey: null,
    });
  });
});

describe("You're ready — the Path row says what and why", () => {
  it("names both Paths of a beginner's start, and why, in one row", () => {
    const progress: PlayerProgress = {
      ...NO_PROGRESS,
      states: [
        { pathId: "rhythm-foundations", level: "beginner", startedAt: 1, updatedAt: 1 },
        { pathId: "know-the-neck", level: "beginner", startedAt: 1, updatedAt: 1 },
      ],
    };
    render(
      <OnboardingWizard
        state={{
          status: "step",
          stepId: "ready",
          context: {
            skipped: [],
            visited: ["welcome", "instrument", "start", "ready"],
            startPathId: "rhythm-foundations",
            startPathIds: ["rhythm-foundations", "know-the-neck"],
            startGoal: "basics",
          },
        }}
        dispatch={vi.fn()}
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
        learning={{ paths: PATHS, progress, plan: null, startPath: vi.fn(() => null) }}
      />,
    );
    const why = screen.getByTestId("onboarding-summary-why-path");
    expect(why.parentElement).toHaveTextContent("Rhythm Foundations and Know the Neck");
    expect(why).toHaveTextContent("New to the guitar: time and clean notes, and the names of the notes on the neck.");
  });
});
