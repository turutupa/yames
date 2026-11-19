/**
 * Listen first (card #28): Watch with Sound plays one pass on the engine from a
 * Take's ready screen. It starts no Take and no input, nothing is scheduled for
 * the scorer while it plays, Start take stops it and then starts the Take on a
 * freshly loaded song, leaving stops it, and the Sound switch is kept.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { DEFAULT_TEST_STATE, mockInvoke, setInvokeResponse } from "../../../test/mocks";
import { useSessionRun } from "./useSessionRun";
import type { SessionRunInput } from "./useSessionRun";
import { LISTEN_SOUND_KEY } from "../../../session/listenDemo";
import type { SongBacking } from "../../../songs/types";
import type { MainView } from "../../main-window/MainHeader";
import { load } from "@tauri-apps/plugin-store";

/** The settings store the test mocks hand every caller (`src/test/mocks.ts`). */
async function theStore() {
  return (await (load as unknown as () => Promise<{ get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> }>)());
}

function mount() {
  setInvokeResponse("list_path_states", []);
  setInvokeResponse("list_path_takes", []);
  setInvokeResponse("list_exercise_ceilings", []);
  setInvokeResponse("plugin:store|get", () => [null, false]);
  const startInput = vi.fn(async () => ({ device: "Scarlett 2i2 USB", fellBack: false }));
  let props = { view: "session" as MainView, isPlaying: false };
  const base = (): SessionRunInput => ({
    view: props.view,
    setView: vi.fn(),
    isPlaying: props.isPlaying,
    beat: null,
    state: DEFAULT_TEST_STATE,
    coach: {
      active: false,
      cardOpen: false,
      startSession: async () => {},
      endSession: async () => {},
      toggleCard: vi.fn(),
    },
    listening: true,
    startInput,
    stopInput: async () => {},
    jams: [],
  });
  const hook = renderHook((p: SessionRunInput) => useSessionRun(p), { initialProps: base() });
  return {
    ...hook,
    startInput,
    set(next: Partial<typeof props>) {
      props = { ...props, ...next };
      hook.rerender(base());
    },
  };
}

async function playOne(h: ReturnType<typeof mount>) {
  await waitFor(() => expect(h.result.current.paths.length).toBeGreaterThan(0));
  const path = h.result.current.paths.find((p) => p.id === "alternate-picking")!;
  const step = path.steps[0];
  act(() => h.result.current.actions.playExercise(path, step, step.exercises[0]));
  h.set({});
  await waitFor(() => expect(h.result.current.run.phase).toBe("ready"));
  await waitFor(() => expect(h.result.current.prepared).toBe(true));
}

type Gate = { on: boolean; lengthMs: number | null; tail: boolean | null };
/** Every `set_listen_demo`, with where it fell among all the engine's calls. */
const gates = () =>
  mockInvoke.mock.calls
    .map(([c, a], at) => ({ c, a: a as Gate, at }))
    .filter((x) => x.c === "set_listen_demo")
    .map(({ a, at }) => ({ ...a, at }));
const lastAt = (cmd: string, args?: unknown) =>
  mockInvoke.mock.calls.reduce(
    (found, [c, a], at) => (c === cmd && (args === undefined || JSON.stringify(a) === JSON.stringify(args)) ? at : found),
    -1,
  );
const calls = (cmd: string) => mockInvoke.mock.calls.filter(([c]) => c === cmd);
const playing = (on: boolean) =>
  mockInvoke.mock.calls.filter(([c, a]) => c === "set_playing" && (a as { playing: boolean }).playing === on);
const isDemo = (backing: SongBacking | null | undefined) =>
  !!backing?.tracks.some((t) => t.role === "synth" && t.guide);
const demoLoads = () => calls("load_song").filter(([, a]) => isDemo((a as { backing: SongBacking | null }).backing));
const takeLoads = () => calls("load_song").filter(([, a]) => !isDemo((a as { backing: SongBacking | null }).backing));

describe("useSessionRun — listen first", () => {
  beforeEach(() => mockInvoke.mockClear());

  it("plays the demo song without a Take, an input or a schedule", async () => {
    const h = mount();
    await playOne(h);
    const inputAsks = h.startInput.mock.calls.length;
    const schedules = calls("load_score_schedule").length;
    act(() => h.result.current.listen.start());
    expect(h.result.current.listen.active).toBe(true);
    expect(h.result.current.prepared).toBe(false);
    await waitFor(() => expect(playing(true)).toHaveLength(1));
    expect(demoLoads()).toHaveLength(1);
    // The scorer has nothing: cleared before the demo, and nothing loaded since.
    expect(calls("clear_score_schedule").length).toBeGreaterThan(0);
    expect(calls("load_score_schedule")).toHaveLength(schedules);
    // The engine says it plays: still the ready screen, no Take, no input asked.
    h.set({ isPlaying: true });
    expect(h.result.current.run.phase).toBe("ready");
    expect(h.startInput.mock.calls.length).toBe(inputAsks);
    expect(calls("save_attempt")).toHaveLength(0);
    // The engine is told the input is not the player before the demo sounds,
    // and for how long, so the gate ends by itself if nobody says "off".
    const on = gates().find((g) => g.on)!;
    expect(on).toBeDefined();
    expect(on.at).toBeLessThan(lastAt("set_playing", { playing: true }));
    expect(on.lengthMs).toBeGreaterThan(1000);
    expect(on.lengthMs).toBeLessThan(180_000);
  });

  it("arms the gate again once the demo sounds, so a slow load cannot let its end through", async () => {
    const h = mount();
    await playOne(h);
    act(() => h.result.current.listen.start());
    await waitFor(() => expect(gates().filter((g) => g.on)).toHaveLength(2));
    const [first, again] = gates().filter((g) => g.on);
    const play = lastAt("set_playing", { playing: true });
    expect(first.at).toBeLessThan(lastAt("load_song"));
    expect(again.at).toBeGreaterThan(play);
    expect(again.lengthMs).toBe(first.lengthMs);
  });

  it("a fresh page tells the engine the input is the player's, at once", async () => {
    mount();
    await waitFor(() => expect(gates()[0]).toMatchObject({ on: false, tail: false }));
  });

  it("the input counts again only once the demo is silent", async () => {
    const h = mount();
    await playOne(h);
    act(() => h.result.current.listen.start());
    await waitFor(() => expect(playing(true)).toHaveLength(1));
    h.set({ isPlaying: true });
    const before = gates().length;
    act(() => h.result.current.listen.stop());
    await waitFor(() => expect(gates().length).toBe(before + 1));
    const off = gates().at(-1)!;
    // Watch stopped it: the last note's tail is still the demo.
    expect(off).toMatchObject({ on: false, tail: true });
    expect(lastAt("clear_song")).toBeLessThan(off.at);
    expect(lastAt("set_playing", { playing: false })).toBeLessThan(off.at);
  });

  it("a lost end is said and tried again", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const h = mount();
    await playOne(h);
    act(() => h.result.current.listen.start());
    await waitFor(() => expect(playing(true)).toHaveLength(1));
    h.set({ isPlaying: true });
    let refused = 0;
    setInvokeResponse("set_listen_demo", (a) => {
      if (!(a as Gate).on && refused === 0) {
        refused += 1;
        throw new Error("engine busy");
      }
      return null;
    });
    const before = gates().length;
    act(() => h.result.current.listen.stop());
    await waitFor(() => expect(gates().length).toBe(before + 2));
    expect(gates().slice(-2).every((g) => !g.on)).toBe(true);
    expect(warn).toHaveBeenCalled();
    setInvokeResponse("set_listen_demo", null);
    warn.mockRestore();
  });

  it("Start take stops it, loads the Take again, then starts the Take", async () => {
    const h = mount();
    await playOne(h);
    const takesBefore = takeLoads().length;
    act(() => h.result.current.listen.start());
    await waitFor(() => expect(playing(true)).toHaveLength(1));
    h.set({ isPlaying: true });

    act(() => h.result.current.actions.go());
    // The Take is the player's: the input counts at once, no tail.
    await waitFor(() => expect(gates().at(-1)).toMatchObject({ on: false, tail: false }));
    await waitFor(() => expect(playing(false).length).toBeGreaterThan(1));
    await waitFor(() => expect(calls("clear_song").length).toBeGreaterThan(0));
    // Still the demo's until the engine says it stopped: the Take does not start on it.
    expect(h.result.current.listen.active).toBe(true);
    expect(h.result.current.run.phase).toBe("ready");
    expect(playing(true)).toHaveLength(1);

    h.set({ isPlaying: false });
    await waitFor(() => expect(h.result.current.listen.active).toBe(false));
    // The Take's song and schedule go back on, and the Take starts on them.
    await waitFor(() => expect(takeLoads().length).toBe(takesBefore + 1));
    await waitFor(() => expect(playing(true)).toHaveLength(2));
    const order = mockInvoke.mock.calls.map(([c]) => c);
    expect(order.lastIndexOf("load_score_schedule")).toBeLessThan(order.lastIndexOf("set_playing"));
    h.set({ isPlaying: true });
    expect(h.result.current.run.phase).toBe("playing");
  });

  it("leaving the Session stops it", async () => {
    const h = mount();
    await playOne(h);
    act(() => h.result.current.listen.start());
    await waitFor(() => expect(playing(true)).toHaveLength(1));
    h.set({ isPlaying: true });
    const cleared = calls("clear_song").length;
    h.set({ view: "today" });
    await waitFor(() => expect(calls("clear_song").length).toBeGreaterThan(cleared));
    h.set({ isPlaying: false });
    await waitFor(() => expect(h.result.current.listen.active).toBe(false));
  });

  it("a stop before the engine started it plays nothing", async () => {
    const h = mount();
    await playOne(h);
    act(() => {
      h.result.current.listen.start();
      h.result.current.listen.stop();
    });
    await waitFor(() => expect(h.result.current.listen.active).toBe(false));
    expect(playing(true)).toHaveLength(0);
  });

  it("the Sound switch is kept in settings, on unless turned off", async () => {
    const h = mount();
    await playOne(h);
    expect(h.result.current.listen.sound).toBe(true);
    const store = await theStore();
    act(() => h.result.current.listen.setSound(false));
    expect(h.result.current.listen.sound).toBe(false);
    await waitFor(() => expect(store.set).toHaveBeenCalledWith(LISTEN_SOUND_KEY, false));
  });

  it("a kept Sound off comes back off", async () => {
    const store = await theStore();
    const before = store.get.getMockImplementation();
    store.get.mockImplementation(async (key: string) => (key === LISTEN_SOUND_KEY ? false : undefined));
    const h = renderHook(() =>
      useSessionRun({
        view: "session",
        setView: vi.fn(),
        isPlaying: false,
        beat: null,
        state: DEFAULT_TEST_STATE,
        coach: { active: false, cardOpen: false, startSession: async () => {}, endSession: async () => {}, toggleCard: vi.fn() },
        listening: true,
        jams: [],
      }),
    );
    await waitFor(() => expect(h.result.current.listen.sound).toBe(false));
    store.get.mockImplementation(before ?? (async () => undefined));
  });
});
