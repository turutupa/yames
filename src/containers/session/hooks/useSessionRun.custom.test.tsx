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
import { CUSTOM_PATH_ID, buildCustomExercise, customExerciseId } from "../../../paths/custom";
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

function mount() {
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
    listening: false,
    startInput: async () => ({ device: null, fellBack: false }),
    stopInput: async () => {},
    jams: [],
  };
  return renderHook((p: SessionRunInput) => useSessionRun(p), { initialProps: props });
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
});
