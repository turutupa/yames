/**
 * "Add to today" through the runner (leg t2e): the parts are built outside and
 * handed in; Today's plan, the coach's preview and the Session played all get
 * the same ones, only on the day they were chosen for; the Session plays them
 * from the one custom document and starts no Path.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import i18n from "../../../i18n";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";
import { installSettings } from "../../../test/parity/store";
import { CUSTOM_PATH_ID, buildCustomExercise, customExerciseId } from "../../../paths/custom";
import type { Recipe } from "../../../paths/custom";
import { playableDoc } from "../MyExercises";
import { CHOSEN_TODAY_KEY, resetChosenTodayForTest } from "../../../session/chosenToday";
import type { ChosenParts } from "../../../session/chosenToday";
import { dayKey } from "../../../session/swap";

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

function parts(): ChosenParts {
  const built = buildCustomExercise(MOCK_17);
  if (!built.ok) throw new Error("mock 17 builds");
  const path = playableDoc(i18n.t.bind(i18n), built.exercise, built.summary);
  return { parts: [{ key: "k1", path, exercise: path.steps[0].exercises[0] }], unbuiltKeys: ["k2"] };
}

async function mount(stored: unknown) {
  setInvokeResponse("list_path_states", []);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  await installSettings({ "session.grading": "on", ...(stored === undefined ? {} : { [CHOSEN_TODAY_KEY]: stored }) });
  const props: SessionRunInput = {
    view: "today",
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
  const hook = renderHook((p: SessionRunInput) => useSessionRun(p), { initialProps: props });
  await waitFor(() => expect(hook.result.current.plan.steps.length).toBeGreaterThan(0));
  /** The shell's answer to `setView("session")`: render with the Session's view. */
  const toSession = () => hook.rerender({ ...props, view: "session" });
  return { ...hook, toSession };
}

const mineIn = (steps: ReadonlyArray<{ id: string }>) => steps.filter((s) => s.id.startsWith("mine-"));

afterEach(() => resetChosenTodayForTest());

describe("useSessionRun — exercises added to today", () => {
  it("Today, the preview and the Session get the same part; it plays from its own document and starts no Path", async () => {
    mockInvoke.mockClear();
    const h = await mount({ day: dayKey(Date.now()), keys: ["k1", "k2"] });
    act(() => h.result.current.actions.setChosenParts(parts()));
    await waitFor(() => expect(mineIn(h.result.current.plan.steps)).toHaveLength(1));
    const id = customExerciseId(MOCK_17);
    const plan = h.result.current.plan;
    const at = plan.steps.findIndex((s) => s.id === "mine-1");
    expect(plan.steps[at]).toMatchObject({ pathId: CUSTOM_PATH_ID, exerciseId: id, context: { code: "chosenToday" } });
    // The one that could not be built is counted for Today's line, not planned.
    expect(h.result.current.chosenUnbuilt).toBe(1);
    // The coach's preview of other minutes plans it too.
    for (const minutes of [5, 10, 15, 20] as const) {
      expect(mineIn(h.result.current.previewPlan({ minutes }).steps)).toHaveLength(1);
    }
    // The Session, from that row.
    act(() => h.result.current.actions.startTodayAt(at));
    h.toSession();
    await waitFor(() => expect(h.result.current.run.phase).toBe("ready"));
    expect(h.result.current.exercise?.id).toBe(id);
    expect(h.result.current.take?.pathId).toBe(CUSTOM_PATH_ID);
    expect(h.result.current.progress.states.some((s) => s.pathId === CUSTOM_PATH_ID)).toBe(false);
    const saved = mockInvoke.mock.calls.filter(([cmd]) => cmd === "save_path_state");
    expect(saved.some(([, a]) => (a as { row?: { pathId?: string } }).row?.pathId === CUSTOM_PATH_ID)).toBe(false);
  });

  it("handed in but not chosen for today (nothing stored, or yesterday's): never planned", async () => {
    for (const stored of [undefined, { day: "2020-01-01", keys: ["k1"] }]) {
      resetChosenTodayForTest();
      const h = await mount(stored);
      const before = JSON.stringify(h.result.current.plan);
      act(() => h.result.current.actions.setChosenParts(parts()));
      expect(mineIn(h.result.current.plan.steps)).toHaveLength(0);
      expect(JSON.stringify(h.result.current.plan)).toBe(before);
      expect(h.result.current.chosenUnbuilt).toBe(0);
      h.unmount();
    }
  });

  it("nothing chosen, handed in again: the same state, no new plan", async () => {
    const h = await mount(undefined);
    const plan = h.result.current.plan;
    act(() => h.result.current.actions.setChosenParts({ parts: [], unbuiltKeys: [] }));
    expect(h.result.current.plan).toBe(plan);
  });
});
