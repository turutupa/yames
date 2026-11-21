/**
 * A custom Exercise (My exercises) played through the runner: `playExercise`
 * takes its one-Step document as it takes a pack's, the stage resolves it, and
 * playing it starts no Path (no `path_state` row, nothing subscribed).
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import i18n from "../../../i18n";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";
import { installSettings } from "../../../test/parity/store";
import { CUSTOM_PATH_ID, CUSTOM_STEP_ID, buildCustomExercise, customExerciseId } from "../../../paths/custom";
import type { Recipe } from "../../../paths/custom";
import { playableDoc } from "../MyExercises";

const MOCK_17: Recipe = {
  v: 1,
  shape: "box",
  root: "A",
  scale: "minorPentatonic",
  position: 5,
  subdivision: "eighths",
  bars: 3,
  direction: "upAndBack",
};

/**
 * The scorer's end of a Take, stood in for: `settle()` moves the attempt's
 * `settled` edge as a stop the scorer answered would, and the grade says
 * passed at the tempo played. Untouched (the first test) both are the real ones.
 */
const ctl = vi.hoisted(() => ({ settled: 0, pass: false }));
vi.mock("../../songs/review/useSongAttempt", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../songs/review/useSongAttempt")>();
  return {
    ...real,
    useSongAttempt: (...args: Parameters<typeof real.useSongAttempt>) => {
      const r = real.useSongAttempt(...args);
      return ctl.settled ? { ...r, settled: r.settled + ctl.settled } : r;
    },
  };
});
vi.mock("../../../session/grade", async (importOriginal) => {
  const real = await importOriginal<typeof import("../../../session/grade")>();
  return {
    ...real,
    gradeTake: (...args: Parameters<typeof real.gradeTake>) =>
      ctl.pass
        ? { verdict: "passed", checks: [], headline: null, unmeasured: [], cleanBpm: args[1], passesExercise: true }
        : real.gradeTake(...args),
  };
});

function mount(listening = false) {
  setInvokeResponse("list_path_states", []);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  void installSettings({ "session.grading": "on" });
  const props: SessionRunInput = {
    view: "session",
    setView: vi.fn(),
    isPlaying: false,
    beat: null,
    state: DEFAULT_TEST_STATE,
    coach: { active: false, cardOpen: false, startSession: async () => {}, endSession: async () => {}, toggleCard: vi.fn() },
    listening,
    startInput: async () => ({ device: null, fellBack: false }),
    stopInput: async () => {},
    jams: [],
  };
  const hook = renderHook((p: SessionRunInput) => useSessionRun(p), { initialProps: props });
  /** Render again with the same props (a new object), as a parent's render would. */
  return { ...hook, again: () => hook.rerender({ ...props }) };
}

describe("useSessionRun — a custom Exercise", () => {
  it("plays from its own document, and starts no Path", async () => {
    mockInvoke.mockClear();
    const h = mount();
    await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
    const built = buildCustomExercise(MOCK_17);
    if (!built.ok) throw new Error("mock 17 builds");
    const doc = playableDoc(i18n.t.bind(i18n), built.exercise, built.summary);
    expect(h.result.current.paths.some((p) => p.id === CUSTOM_PATH_ID)).toBe(false);

    act(() => h.result.current.actions.playExercise(doc, doc.steps[0], doc.steps[0].exercises[0]));
    await waitFor(() => expect(h.result.current.run.phase).toBe("ready"));
    expect(h.result.current.exercise?.id).toBe(customExerciseId(MOCK_17));
    expect(h.result.current.take?.pathId).toBe(CUSTOM_PATH_ID);
    // The first Take starts on the first rung, as any Exercise never played.
    expect(h.result.current.run.bpm).toBe(built.summary.startBpm);
    // Never a pack, never a Path started, never in the Paths list.
    expect(h.result.current.paths.some((p) => p.id === CUSTOM_PATH_ID)).toBe(false);
    expect(h.result.current.progress.states.some((s) => s.pathId === CUSTOM_PATH_ID)).toBe(false);
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "save_path_state")).toHaveLength(0);
  });

  it("a graded Take that passes is saved under My exercises with its clean tempo, and moves no Path and passes no Step", async () => {
    mockInvoke.mockClear();
    const h = mount(true);
    await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
    const built = buildCustomExercise(MOCK_17);
    if (!built.ok) throw new Error("mock 17 builds");
    const doc = playableDoc(i18n.t.bind(i18n), built.exercise, built.summary);
    act(() => h.result.current.actions.playExercise(doc, doc.steps[0], doc.steps[0].exercises[0]));
    h.again();
    await waitFor(() => expect(h.result.current.run.phase).toBe("ready"));
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    act(() => h.result.current.actions.go());
    await waitFor(() => expect(h.result.current.run.phase).toBe("listening"));

    ctl.pass = true;
    ctl.settled = 1;
    try {
      h.again();
      await waitFor(() => expect(h.result.current.run.outcomes).toHaveLength(1));
    } finally {
      ctl.pass = false;
      ctl.settled = 0;
    }
    const id = customExerciseId(MOCK_17);
    const bpm = built.summary.startBpm;
    expect(h.result.current.run.outcomes[0].grade.verdict).toBe("passed");
    const saves = mockInvoke.mock.calls.filter(([cmd]) => cmd === "save_path_take");
    expect(saves).toHaveLength(1);
    const { take, cleanBpm } = saves[0][1] as { take: { pathId: string; stepId: string; exerciseId: string; passed: boolean }; cleanBpm: number | null };
    expect(take).toMatchObject({ pathId: CUSTOM_PATH_ID, stepId: CUSTOM_STEP_ID, exerciseId: id, passed: true });
    expect(cleanBpm).toBe(bpm);
    expect(h.result.current.progress.ceilings).toEqual([
      expect.objectContaining({ exerciseKey: `${CUSTOM_PATH_ID}/${id}`, cleanBpm: bpm }),
    ]);
    // No Path state after a pass: nothing saved, nothing in memory, no Step moved to.
    expect(mockInvoke.mock.calls.filter(([cmd]) => cmd === "save_path_state")).toHaveLength(0);
    expect(h.result.current.progress.states).toEqual([]);
  });
});
