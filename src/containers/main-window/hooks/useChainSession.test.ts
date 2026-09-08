/**
 * The hook's own job is the part the artboard is most emphatic about: the
 * metronome under the track edits the *selected step*, using the same
 * controls and the same engine calls it always did.
 *
 * So what is tested here is the mirror — engine state read back into the
 * step — and the two rules that keep it from lying: it does not run while
 * the chain is running, and it does not fire on the stale state that arrives
 * between selecting a step and its configuration reaching the engine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useChainSession } from "./useChainSession";
import { DEFAULT_TEST_STATE, mockInvoke } from "../../../test/mocks";
import type { AppState, Chain } from "../../../types";

const CHAIN: Chain = {
  id: "c1",
  name: "Warm-up",
  createdAt: 0,
  repeat: 1,
  steps: [
    {
      id: "s1",
      name: "Loosen up",
      bpm: 70,
      subdivision: 1,
      beatGroups: [4],
      freeMode: false,
      soundType: "click",
      volume: 0.7,
      trigger: { kind: "bars", bars: 8 },
      transition: { kind: "cut" },
    },
    {
      id: "s2",
      name: "Alt picking",
      bpm: 96,
      subdivision: 4,
      beatGroups: [4],
      freeMode: false,
      soundType: "wood",
      volume: 0.7,
      trigger: { kind: "manual" },
      transition: { kind: "cut" },
    },
  ],
};

function mount(initial: Partial<AppState> = {}) {
  const setView = vi.fn();
  const onChainLoaded = vi.fn();
  const view = renderHook(
    ({ state, isPlaying }: { state: AppState; isPlaying: boolean }) =>
      useChainSession({ state, isPlaying, currentBeat: null, setView, onChainLoaded }),
    {
      initialProps: {
        state: { ...DEFAULT_TEST_STATE, ...initial },
        isPlaying: false,
      },
    },
  );
  return { ...view, setView, onChainLoaded };
}

/** The last value each engine setter was called with. */
function lastCall(command: string) {
  const calls = mockInvoke.mock.calls.filter((c) => c[0] === command);
  return calls.length ? calls[calls.length - 1][1] : undefined;
}

beforeEach(() => mockInvoke.mockClear());
afterEach(() => vi.clearAllMocks());

describe("useChainSession", () => {
  it("loading a chain points the metronome at its first step", async () => {
    const { result, setView, onChainLoaded } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    expect(setView).toHaveBeenCalledWith("beat");
    // Only one thing can be marked as loaded in the library.
    expect(onChainLoaded).toHaveBeenCalled();
    expect(result.current.selectedStepId).toBe("s1");
    expect(lastCall("set_bpm")).toEqual({ bpm: 70 });
  });

  it("selecting a step applies it, and does not read the old state back", async () => {
    // The window between applying a step and `state-changed` arriving is
    // where a naive mirror writes the previous step's settings into the step
    // you just selected.
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    await act(async () => {
      result.current.selectStep("s2");
    });
    expect(lastCall("set_bpm")).toEqual({ bpm: 96 });

    // The engine is still reporting step one's tempo. Step two must not
    // absorb it.
    rerender({ state: { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click" }, isPlaying: false });
    expect(result.current.chain?.steps[1].bpm).toBe(96);
  });

  it("the metronome's own controls edit the selected step", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    // The engine confirms step one, then the user turns the tempo up.
    const settled = { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click", volume: 0.7 };
    rerender({ state: settled, isPlaying: false });
    rerender({ state: { ...settled, bpm: 84 }, isPlaying: false });

    expect(result.current.chain?.steps[0].bpm).toBe(84);
    expect(result.current.dirty).toBe(true);
    // And only the selected step moved.
    expect(result.current.chain?.steps[1].bpm).toBe(96);
  });

  it("stops mirroring while the chain runs — the runner owns the engine then", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    const settled = { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click", volume: 0.7 };
    rerender({ state: settled, isPlaying: false });
    // Playing: every step the runner applies would otherwise be read back as
    // the user editing the step they are listening to.
    rerender({ state: { ...settled, bpm: 96 }, isPlaying: true });
    expect(result.current.chain?.steps[0].bpm).toBe(70);
    expect(result.current.dirty).toBe(false);
  });

  it("revert throws the edits away and puts the engine back", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    const settled = { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click", volume: 0.7 };
    rerender({ state: settled, isPlaying: false });
    rerender({ state: { ...settled, bpm: 200 }, isPlaying: false });
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      result.current.revertChain();
    });
    expect(result.current.chain?.steps[0].bpm).toBe(70);
    expect(result.current.dirty).toBe(false);
    expect(lastCall("set_bpm")).toEqual({ bpm: 70 });
  });

  it("a new step copies the one above it, not the metronome", async () => {
    /*
     * "Add what you have now" made sense while the metronome sat under the
     * track and WAS what you had. The paragraph has no metronome on it, so
     * there is nothing live to copy — and the honest default is the step
     * above, because you add a step to a routine when it is like the last one
     * but faster, not when it is like whatever happened to be loaded.
     */
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    // The engine is set to something quite unlike the chain's last step.
    rerender({ state: { ...DEFAULT_TEST_STATE, bpm: 200, subdivision: 3 }, isPlaying: false });

    const last = result.current.chain!.steps[result.current.chain!.steps.length - 1];
    await act(async () => {
      result.current.addStepFromNow();
    });

    const steps = result.current.chain!.steps;
    const added = steps[steps.length - 1];
    expect(added.bpm).toBe(last.bpm);
    expect(added.subdivision).toBe(last.subdivision);
    expect(added.trigger).toEqual(last.trigger);
    // Its own step, not an alias of the one it copied.
    expect(added.id).not.toBe(last.id);
    expect(added.name).not.toBe(last.name);
    expect(result.current.selectedStepId).toBe(added.id);
  });

  it("the FIRST step of an empty chain still takes the engine's settings", async () => {
    // There is nothing above it, and the metronome is the only thing that can
    // say what the player wants — which is the old behaviour, kept exactly
    // where it still makes sense.
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadChain({ ...CHAIN, steps: [] });
    });
    rerender({ state: { ...DEFAULT_TEST_STATE, bpm: 143, subdivision: 3 }, isPlaying: false });
    await act(async () => {
      result.current.addStepFromNow();
    });
    expect(result.current.chain!.steps).toHaveLength(1);
    expect(result.current.chain!.steps[0].bpm).toBe(143);
  });

  it("leaving the player does not stop the run, and stopping puts it back", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    rerender({ state: DEFAULT_TEST_STATE, isPlaying: true });

    await act(async () => {
      result.current.editWhileRunning();
    });
    expect(result.current.editingWhileRunning).toBe(true);
    expect(result.current.chainPlaying).toBe(false);

    // Stop, and the paragraph is where a stopped chain lives anyway — so the
    // flag must not survive into the next run and hide the player.
    rerender({ state: DEFAULT_TEST_STATE, isPlaying: false });
    expect(result.current.editingWhileRunning).toBe(false);
  });

  it("closing the chain leaves nothing behind for the preset to fight with", async () => {
    const { result } = mount();
    await act(async () => {
      result.current.loadChain(CHAIN);
    });
    await act(async () => {
      result.current.closeChain();
    });
    expect(result.current.chain).toBeNull();
    expect(result.current.selectedStepId).toBeNull();
  });
});
