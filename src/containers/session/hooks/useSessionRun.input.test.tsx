/**
 * The Take's Start with the input off (owner, beta 6: "I hit start take but
 * nothing happens"). The Session turns the input on by itself, a press of
 * Start waits for it and then starts the Take, and a refusal is said.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import i18n from "../../../i18n";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";
import { startButton } from "../parts";
import { installSettings, type FakeStore } from "../../../test/parity/store";

let fake: FakeStore | null = null;

type Started = { device: string | null; fellBack: boolean };

function deferred() {
  let resolve!: (v: Started) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Started>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** What the settings store holds; graded ("on") unless a test says otherwise. */
function mount(
  startInput: () => Promise<Started>,
  stored: Record<string, unknown> = { "session.grading": "on" },
  options: { listening?: boolean; startSession?: (o?: { quiet?: boolean; listen?: boolean }) => Promise<void> } = {},
) {
  setInvokeResponse("list_path_states", []);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  void installSettings(stored).then((store) => {
    fake = store;
  });
  let listening = options.listening ?? false;
  const base = (): SessionRunInput => ({
    view: "session",
    setView: vi.fn(),
    isPlaying: false,
    beat: null,
    state: DEFAULT_TEST_STATE,
    coach: {
      active: false,
      cardOpen: false,
      startSession: options.startSession ?? (async () => {}),
      endSession: async () => {},
      toggleCard: vi.fn(),
    },
    listening,
    startInput,
    stopInput: async () => {},
    jams: [],
  });
  const hook = renderHook((props: SessionRunInput) => useSessionRun(props), { initialProps: base() });
  return {
    ...hook,
    setListening(on: boolean) {
      listening = on;
      hook.rerender({ ...base(), view: "session" });
    },
    toSession() {
      hook.rerender({ ...base(), view: "session" });
    },
  };
}

/** One Exercise, straight onto its ready screen, the way Play this does it. */
async function playOne(h: ReturnType<typeof mount>) {
  await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
  const path = h.result.current.paths.find((p) => p.id === "alternate-picking")!;
  const step = path.steps[0];
  act(() => h.result.current.actions.playExercise(path, step, step.exercises[0]));
  h.toSession();
  await waitFor(() => expect(h.result.current.run.phase).toBe("ready"));
}

const t = i18n.t.bind(i18n);
const label = (h: ReturnType<typeof mount>, listening = false) => startButton(h.result.current, listening, t);
const saved = () => fake?.writes ?? [];

const playingCalls = () =>
  mockInvoke.mock.calls.filter(([cmd, a]) => cmd === "set_playing" && (a as { playing: boolean }).playing);

describe("useSessionRun — the input at a Take's ready screen", () => {
  it("turns the input on by itself, and Start then starts the Take once it is on", async () => {
    mockInvoke.mockClear();
    const ask = deferred();
    const startInput = vi.fn(() => ask.promise);
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(startInput).toHaveBeenCalledTimes(1));
    expect(h.result.current.inputStart.status).toBe("starting");
    await waitFor(() => expect(h.result.current.prepared).toBe(true));

    // Start pressed while it comes on: nothing plays yet, and nothing is asked twice.
    act(() => h.result.current.actions.go());
    expect(startInput).toHaveBeenCalledTimes(1);
    expect(playingCalls()).toHaveLength(0);

    await act(async () => ask.resolve({ device: "Scarlett 2i2 USB", fellBack: false }));
    h.setListening(true);
    await waitFor(() => expect(playingCalls()).toHaveLength(1));
    expect(h.result.current.inputStart.device).toBe("Scarlett 2i2 USB");
  });

  it("a refusal is said, and no Take starts", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.reject(new Error("No default input device found")));
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(h.result.current.inputStart.status).toBe("failed"));
    expect(h.result.current.inputStart.failure).toBe("noDevice");
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    // The press asks again (it is not a dead button), and is refused again.
    act(() => h.result.current.actions.go());
    await waitFor(() => expect(startInput).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(h.result.current.inputStart.status).toBe("failed"));
    expect(playingCalls()).toHaveLength(0);
  });

  it("refused once, it does not ask again by itself on the next screen", async () => {
    const startInput = vi.fn(() => Promise.reject(new Error("permission denied")));
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(h.result.current.inputStart.failure).toBe("permission"));
    h.toSession();
    expect(startInput).toHaveBeenCalledTimes(1);
  });

  it("Just play this one starts the Take with the input off, and asks for nothing", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.reject(new Error("permission denied")));
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(h.result.current.inputStart.status).toBe("failed"));
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    expect(t("session.input.playUngraded")).toBe("Just play this one");
    act(() => h.result.current.actions.playUngraded());
    await waitFor(() => expect(playingCalls()).toHaveLength(1));
    expect(h.result.current.run.ungraded).toBe("inputOff");
    // The refusal stays said, for the next Take's ready screen.
    expect(h.result.current.inputStart.status).toBe("failed");
    expect(startInput).toHaveBeenCalledTimes(1);
  });

  it("grading on: the button turns the input on, and says so", async () => {
    const startInput = vi.fn(() => new Promise<Started>(() => {}));
    const h = mount(startInput);
    await playOne(h);
    await waitFor(() => expect(startInput).toHaveBeenCalledTimes(1));
    expect(label(h).label).toBe("Starting your input…");
    expect(h.result.current.asking).toBe(false);
  });
});

describe("useSessionRun — grading off (owner, 2026-11-18)", () => {
  it("never turns the input on, never asks for the microphone, and Start says only the tempo", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.resolve({ device: null, fellBack: false }));
    const startSession = vi.fn(async () => {});
    const h = mount(startInput, { "session.grading": "off" }, { startSession });
    await waitFor(() => expect(h.result.current.grading).toBe("off"));
    await playOne(h);
    expect(h.result.current.run.ungraded).toBe("gradingOff");
    expect(startSession).toHaveBeenCalledWith({ quiet: true, listen: false });
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    const start = label(h);
    expect(start.label).toBe(`Start, ${h.result.current.run.bpm} BPM`);
    expect(start.needsInput).toBe(false);
    expect(start.ask).toBe(false);
    act(() => h.result.current.actions.go());
    await waitFor(() => expect(playingCalls()).toHaveLength(1));
    expect(startInput).not.toHaveBeenCalled();
  });

  it("Grade me for this Session grades from now and leaves the choice off", async () => {
    const startInput = vi.fn(() => Promise.resolve({ device: null, fellBack: false }));
    const h = mount(startInput, { "session.grading": "off" });
    await waitFor(() => expect(h.result.current.grading).toBe("off"));
    await playOne(h);
    act(() => h.result.current.actions.gradeAgain());
    expect(h.result.current.run.ungraded).toBeNull();
    expect(h.result.current.grading).toBe("off");
    await waitFor(() => expect(startInput).toHaveBeenCalledTimes(1));
  });

  it("Grade me always turns grading on for good", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.resolve({ device: null, fellBack: false }));
    const h = mount(startInput, { "session.grading": "off" });
    await waitFor(() => expect(h.result.current.grading).toBe("off"));
    await playOne(h);
    act(() => h.result.current.actions.gradeAgain({ always: true }));
    expect(h.result.current.grading).toBe("on");
    expect(h.result.current.run.ungraded).toBeNull();
    await waitFor(() => expect(saved()).toContainEqual(["session.grading", "on"]));
    expect(saved()).toContainEqual(["session.grade", true]);
  });
});

describe("useSessionRun — grading not decided yet (ask)", () => {
  it("asks before the Take: nothing turned on, two answers, no input wording", async () => {
    const startInput = vi.fn(() => Promise.resolve({ device: null, fellBack: false }));
    const startSession = vi.fn(async () => {});
    const h = mount(startInput, {}, { startSession });
    await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
    expect(h.result.current.grading).toBe("ask");
    await playOne(h);
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    expect(h.result.current.asking).toBe(true);
    expect(startSession).toHaveBeenCalledWith({ quiet: true, listen: false });
    expect(startInput).not.toHaveBeenCalled();
    const start = label(h);
    expect(start.ask).toBe(true);
    expect(start.label).toBe(`Start take, ${h.result.current.run.bpm} BPM · graded`);
    expect(start.label).not.toMatch(/input/i);
  });

  it("Just play starts the Take ungraded at once, for the rest of the Session, and remembers nothing", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.resolve({ device: null, fellBack: false }));
    const h = mount(startInput, {});
    await playOne(h);
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    act(() => h.result.current.actions.decide(false));
    await waitFor(() => expect(playingCalls()).toHaveLength(1));
    expect(h.result.current.run.ungraded).toBe("chosen");
    expect(h.result.current.asking).toBe(false);
    expect(h.result.current.grading).toBe("ask");
    expect(startInput).not.toHaveBeenCalled();
    expect(saved().some(([k]) => k === "session.grading")).toBe(false);
  });

  it("the graded answer turns the input on, then starts the Take", async () => {
    mockInvoke.mockClear();
    const ask = deferred();
    const startInput = vi.fn(() => ask.promise);
    const h = mount(startInput, {});
    await playOne(h);
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    act(() => h.result.current.actions.go());
    await waitFor(() => expect(startInput).toHaveBeenCalledTimes(1));
    expect(h.result.current.asking).toBe(false);
    expect(h.result.current.run.ungraded).toBeNull();
    await act(async () => ask.resolve({ device: "USB mic", fellBack: false }));
    h.setListening(true);
    await waitFor(() => expect(playingCalls()).toHaveLength(1));
  });

  it("Remember my choice keeps the answer: Just play → off", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.resolve({ device: null, fellBack: false }));
    const h = mount(startInput, {});
    await playOne(h);
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    act(() => h.result.current.setAskRemember(true));
    act(() => h.result.current.actions.decide(false));
    expect(h.result.current.grading).toBe("off");
    await waitFor(() => expect(saved()).toContainEqual(["session.grading", "off"]));
    expect(saved()).toContainEqual(["session.grade", false]);
  });

  it("Remember my choice keeps the answer: graded → on", async () => {
    mockInvoke.mockClear();
    const startInput = vi.fn(() => Promise.resolve({ device: null, fellBack: false }));
    const h = mount(startInput, {});
    await playOne(h);
    await waitFor(() => expect(h.result.current.prepared).toBe(true));
    act(() => h.result.current.setAskRemember(true));
    act(() => h.result.current.actions.decide(true));
    expect(h.result.current.grading).toBe("on");
    await waitFor(() => expect(saved()).toContainEqual(["session.grading", "on"]));
  });
});

describe("useSessionRun — the old switch, migrated", () => {
  it.each([
    [{ "session.grade": false }, "off"],
    [{ "session.grade": true }, "on"],
    [{}, "ask"],
    [{ "session.grade": false, "session.grading": "ask" }, "ask"],
  ] as const)("%j reads as %s", async (stored, expected) => {
    const h = mount(vi.fn(() => Promise.resolve({ device: null, fellBack: false })), stored);
    await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
    await waitFor(() => expect(h.result.current.grading).toBe(expected));
  });
});
