/**
 * The hook's own job is the part the artboard is most emphatic about: the
 * metronome under the track edits the *selected step*, using the same
 * controls and the same engine calls it always did.
 *
 * So what is tested here is the mirror — engine state read back into the
 * step — and the two rules that keep it from lying: it does not run while
 * the setlist is running, and it does not fire on the stale state that arrives
 * between selecting a step and its configuration reaching the engine.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSetlistSession } from "./useSetlistSession";
import { DEFAULT_TEST_STATE, mockInvoke } from "../../../test/mocks";
import { STARTER_JAMS } from "../../../jam/jams";
import { jamToSetlistStep } from "../../../setlist";
import type { Jam } from "../../../jam/types";
import type { AppState, BeatEvent, Setlist, SetlistStep } from "../../../types";

const CHAIN: Setlist = {
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
  const onSetlistLoaded = vi.fn();
  const view = renderHook(
    ({ state, isPlaying }: { state: AppState; isPlaying: boolean }) =>
      useSetlistSession({ state, isPlaying, currentBeat: null, setView, onSetlistLoaded }),
    {
      initialProps: {
        state: { ...DEFAULT_TEST_STATE, ...initial },
        isPlaying: false,
      },
    },
  );
  return { ...view, setView, onSetlistLoaded };
}

/** The last value each engine setter was called with. */
function lastCall(command: string) {
  const calls = mockInvoke.mock.calls.filter((c) => c[0] === command);
  return calls.length ? calls[calls.length - 1][1] : undefined;
}

beforeEach(() => mockInvoke.mockClear());
afterEach(() => vi.clearAllMocks());

describe("useSetlistSession", () => {
  it("loading a setlist points the metronome at its first step", async () => {
    const { result, setView, onSetlistLoaded } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    expect(setView).toHaveBeenCalledWith("setlist");
    // Only one thing can be marked as loaded in the library.
    expect(onSetlistLoaded).toHaveBeenCalled();
    expect(result.current.selectedStepId).toBe("s1");
    expect(lastCall("set_bpm")).toEqual({ bpm: 70 });
  });

  it("selecting a step applies it, and does not read the old state back", async () => {
    // The window between applying a step and `state-changed` arriving is
    // where a naive mirror writes the previous step's settings into the step
    // you just selected.
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    await act(async () => {
      result.current.selectStep("s2");
    });
    expect(lastCall("set_bpm")).toEqual({ bpm: 96 });

    // The engine is still reporting step one's tempo. Step two must not
    // absorb it.
    rerender({ state: { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click" }, isPlaying: false });
    expect(result.current.setlist?.steps[1].bpm).toBe(96);
  });

  it("the metronome's own controls edit the selected step", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    // The engine confirms step one, then the user turns the tempo up.
    const settled = { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click", volume: 0.7 };
    rerender({ state: settled, isPlaying: false });
    rerender({ state: { ...settled, bpm: 84 }, isPlaying: false });

    expect(result.current.setlist?.steps[0].bpm).toBe(84);
    expect(result.current.dirty).toBe(true);
    // And only the selected step moved.
    expect(result.current.setlist?.steps[1].bpm).toBe(96);
  });

  it("stops mirroring while the setlist runs — the runner owns the engine then", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    const settled = { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click", volume: 0.7 };
    rerender({ state: settled, isPlaying: false });
    // Playing: every step the runner applies would otherwise be read back as
    // the user editing the step they are listening to.
    rerender({ state: { ...settled, bpm: 96 }, isPlaying: true });
    expect(result.current.setlist?.steps[0].bpm).toBe(70);
    expect(result.current.dirty).toBe(false);
  });

  it("revert throws the edits away and puts the engine back", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    const settled = { ...DEFAULT_TEST_STATE, bpm: 70, subdivision: 1, soundType: "click", volume: 0.7 };
    rerender({ state: settled, isPlaying: false });
    rerender({ state: { ...settled, bpm: 200 }, isPlaying: false });
    expect(result.current.dirty).toBe(true);

    await act(async () => {
      result.current.revertSetlist();
    });
    expect(result.current.setlist?.steps[0].bpm).toBe(70);
    expect(result.current.dirty).toBe(false);
    expect(lastCall("set_bpm")).toEqual({ bpm: 70 });
  });

  it("an edit made in the step's sentence is not undone by the mirror", async () => {
    /*
     * The bug this exists for, reported as "the controls in the setlist are
     * non-responsive": every phrase in the sentence looked dead, while the
     * trigger and the transition — the only two fields the mirror does not
     * touch — worked fine.
     *
     * The mirror reads the engine back into the selected step so the header's
     * sound and volume chips still edit it. It cannot tell an edit made in
     * the sentence from the engine disagreeing with the step, so a change
     * that is not ALSO pushed to the engine is read straight back out again.
     */
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });

    // The engine catches up with step one, which clears the apply-wait and
    // arms the mirror. Without this the mirror never runs and the bug hides.
    const settled = {
      ...DEFAULT_TEST_STATE,
      bpm: 70,
      subdivision: 1,
      beatGroups: [4],
      freeMode: false,
      soundType: "click",
      volume: 0.7,
    };
    rerender({ state: settled, isPlaying: false });

    await act(async () => {
      result.current.patchStep("s1", { soundType: "beep" });
    });
    // The engine has not echoed yet — exactly the moment the mirror used to
    // overwrite the edit with the sound the step used to have.
    rerender({ state: settled, isPlaying: false });

    expect(result.current.setlist?.steps[0].soundType).toBe("beep");
    // ...and the edit reached the engine, which is what makes it audible.
    expect(lastCall("set_sound_type")).toEqual({ soundType: "beep" });
  });

  it("a step edited while the setlist runs is not pushed under the runner", async () => {
    // The runner owns the engine while it plays. Editing step 7 mid-run must
    // change the step and nothing else — applying it would retune the step
    // you are currently hearing.
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    rerender({ state: DEFAULT_TEST_STATE, isPlaying: true });
    mockInvoke.mockClear();

    await act(async () => {
      result.current.patchStep("s2", { bpm: 123 });
    });
    expect(result.current.setlist?.steps[1].bpm).toBe(123);
    expect(lastCall("set_bpm")).toBeUndefined();
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
      result.current.loadSetlist(CHAIN);
    });
    // The engine is set to something quite unlike the setlist's last step.
    rerender({ state: { ...DEFAULT_TEST_STATE, bpm: 200, subdivision: 3 }, isPlaying: false });

    const last = result.current.setlist!.steps[result.current.setlist!.steps.length - 1];
    await act(async () => {
      result.current.addStepFromNow();
    });

    const steps = result.current.setlist!.steps;
    const added = steps[steps.length - 1];
    expect(added.bpm).toBe(last.bpm);
    expect(added.subdivision).toBe(last.subdivision);
    expect(added.trigger).toEqual(last.trigger);
    // Its own step, not an alias of the one it copied.
    expect(added.id).not.toBe(last.id);
    expect(added.name).not.toBe(last.name);
    expect(result.current.selectedStepId).toBe(added.id);
  });

  it("the FIRST step of an empty setlist still takes the engine's settings", async () => {
    // There is nothing above it, and the metronome is the only thing that can
    // say what the player wants — which is the old behaviour, kept exactly
    // where it still makes sense.
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist({ ...CHAIN, steps: [] });
    });
    rerender({ state: { ...DEFAULT_TEST_STATE, bpm: 143, subdivision: 3 }, isPlaying: false });
    await act(async () => {
      result.current.addStepFromNow();
    });
    expect(result.current.setlist!.steps).toHaveLength(1);
    expect(result.current.setlist!.steps[0].bpm).toBe(143);
  });

  it("leaving the player does not stop the run, and stopping puts it back", async () => {
    const { result, rerender } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    rerender({ state: DEFAULT_TEST_STATE, isPlaying: true });

    await act(async () => {
      result.current.editWhileRunning();
    });
    expect(result.current.editingWhileRunning).toBe(true);
    expect(result.current.setlistPlaying).toBe(false);

    // Stop, and the paragraph is where a stopped setlist lives anyway — so the
    // flag must not survive into the next run and hide the player.
    rerender({ state: DEFAULT_TEST_STATE, isPlaying: false });
    expect(result.current.editingWhileRunning).toBe(false);
  });

  it("closing the setlist leaves nothing behind for the preset to fight with", async () => {
    const { result } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    await act(async () => {
      result.current.closeSetlist();
    });
    expect(result.current.setlist).toBeNull();
    expect(result.current.selectedStepId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// A jam as a step (JAM_MODE §8.5)
// ---------------------------------------------------------------------------

const JAM: Jam = { ...STARTER_JAMS[0], id: "j1", name: "Slow blues in A", bpm: 92 };

function mountWithJams(jams: Jam[] = [JAM]) {
  const setView = vi.fn();
  const onSetlistLoaded = vi.fn();
  const view = renderHook(
    ({ state, isPlaying }: { state: AppState; isPlaying: boolean }) =>
      useSetlistSession({
        state,
        isPlaying,
        currentBeat: null,
        setView,
        onSetlistLoaded,
        jamContext: { getJam: (id) => jams.find((j) => j.id === id) ?? null },
      }),
    { initialProps: { state: DEFAULT_TEST_STATE as AppState, isPlaying: false } },
  );
  return view;
}

describe("adding a jam to a setlist", () => {
  it("appends it to the open setlist and selects it", async () => {
    // Appended, the way `addStepFromNow` appends: "add ten minutes of playing
    // at the end" is what the feature is for.
    const { result } = mountWithJams();
    act(() => result.current.loadSetlist(CHAIN));
    act(() => void result.current.addJamStep(JAM));

    const steps = result.current.setlist!.steps;
    expect(steps).toHaveLength(3);
    expect(steps[2].jamId).toBe("j1");
    expect(steps[2].name).toBe("Slow blues in A");
    expect(steps[2].bpm).toBe(92);
    expect(result.current.selectedStepId).toBe(steps[2].id);
  });

  it("marks the setlist edited, so it has to be saved like any other change", () => {
    const { result } = mountWithJams();
    act(() => result.current.loadSetlist(CHAIN));
    expect(result.current.dirty).toBe(false);
    act(() => void result.current.addJamStep(JAM));
    expect(result.current.dirty).toBe(true);
  });

  it("does nothing with no setlist open", () => {
    const { result } = mountWithJams();
    expect(result.current.addJamStep(JAM)).toBeNull();
  });

  it("writes straight to the store when the setlist is not the open one", async () => {
    // Not the working copy, so there is nothing to go dirty: the step lands in
    // the store and in the library at once, which is what makes "add to
    // setlist" from the jam tab a thing you do and forget.
    const { result } = mountWithJams();
    // `newSetlist` is the one path that puts a setlist in this hook's library
    // without a store round trip to stub.
    let made: Setlist | undefined;
    await act(async () => {
      made = await result.current.newSetlist();
    });
    // It is the open one now, so open a different one over the top of it.
    act(() => result.current.loadSetlist(CHAIN));

    await act(async () => {
      await result.current.addJamToSetlist(made!.id, JAM);
    });

    const saved = result.current.setlists.find((c) => c.id === made!.id)!;
    expect(saved.steps).toHaveLength(1);
    expect(saved.steps[0].jamId).toBe("j1");
    // And the setlist you are actually looking at is untouched.
    expect(result.current.setlist!.id).toBe("c1");
    expect(result.current.setlist!.steps).toHaveLength(2);
  });

  it("adds to the OPEN setlist when the two are the same one", async () => {
    const { result } = mountWithJams();
    act(() => result.current.loadSetlist(CHAIN));
    await act(async () => {
      await result.current.addJamToSetlist("c1", JAM);
    });
    expect(result.current.setlist!.steps).toHaveLength(3);
    expect(result.current.setlist!.steps[2].jamId).toBe("j1");
  });
});

/**
 * The end of a run, from the session's side.
 *
 * The runner hands the metronome its meter back when a run stops, and this
 * hook reads the engine back into the selected step while stopped. Put the two
 * together and a meter handed back over the wrong step is not a glitch you
 * hear — it is a meter written into a saved file.
 */
describe("a run that ends on a plain step", () => {
  /** The metronome's own meter before the run: nothing a step would choose. */
  const BEFORE_RUN = { subdivision: 1, beatGroups: [7], freeMode: true };

  const ROUTINE: Setlist = {
    id: "c-run",
    name: "Routine",
    createdAt: 0,
    repeat: 1,
    steps: [
      {
        ...jamToSetlistStep(JAM),
        id: "s-jam",
        trigger: { kind: "bars", bars: 1 },
        transition: { kind: "cut" },
      },
      CHAIN.steps[1],
    ],
  };

  function downbeat(n: number): BeatEvent {
    return {
      beat: n,
      measureBeat: 0,
      subdivision: 0,
      isDownbeat: true,
      isAccent: true,
      formBar: 0,
      chorus: 1,
    };
  }

  /** A step's own configuration, as the engine would report it back. */
  function asState(step: SetlistStep, over: Partial<AppState> = {}): AppState {
    return {
      ...DEFAULT_TEST_STATE,
      bpm: step.bpm,
      subdivision: step.subdivision,
      beatGroups: [...step.beatGroups],
      freeMode: step.freeMode ?? false,
      soundType: step.soundType,
      volume: step.volume,
      ...over,
    } as AppState;
  }

  /** What the engine was last TOLD its meter is, or the fallback if nothing. */
  function engineMeter(fallback: typeof BEFORE_RUN) {
    const last = (cmd: string) => {
      const calls = mockInvoke.mock.calls.filter((c) => c[0] === cmd);
      return calls.length
        ? (calls[calls.length - 1][1] as Record<string, unknown> | undefined)
        : undefined;
    };
    return {
      subdivision: (last("set_subdivision")?.subdivision as number) ?? fallback.subdivision,
      beatGroups: (last("set_beat_groups")?.groups as number[]) ?? fallback.beatGroups,
      freeMode: (last("set_free_mode")?.enabled as boolean) ?? fallback.freeMode,
    };
  }

  async function settle() {
    await act(async () => {
      for (let i = 0; i < 12; i += 1) await Promise.resolve();
    });
  }

  it("does not write the pre-run meter into the step it stopped on", async () => {
    // A routine of "blues, then alternate picking", stopped during the
    // picking. The meter in the pocket belongs to before the whole run, and
    // handing it back there put it on the engine over the picking step's own
    // — where this hook's mirror read it straight back out and filed it in
    // the step. A saved routine acquiring a meter nobody chose.
    const setView = vi.fn();
    const { result, rerender } = renderHook(
      ({ state, isPlaying, beat }: { state: AppState; isPlaying: boolean; beat: BeatEvent | null }) =>
        useSetlistSession({
          state,
          isPlaying,
          currentBeat: beat,
          setView,
          onSetlistLoaded: vi.fn(),
          jamContext: {
            getJam: (id) => (id === JAM.id ? JAM : null),
            lineup: { drums: true, bass: true },
            meter: BEFORE_RUN,
          },
        }),
      {
        initialProps: {
          state: DEFAULT_TEST_STATE as AppState,
          isPlaying: false,
          beat: null as BeatEvent | null,
        },
      },
    );

    act(() => result.current.loadSetlist(ROUTINE));
    // The engine catches up with the jam step, which is what clears the wait.
    // The mirror never writes onto a jam step, so this costs nothing.
    const jamStep = result.current.setlist!.steps[0];
    const plain = result.current.setlist!.steps[1];
    act(() => rerender({ state: asState(jamStep), isPlaying: false, beat: null }));
    expect(result.current.dirty).toBe(false);

    act(() => rerender({ state: asState(jamStep), isPlaying: true, beat: null }));
    act(() => rerender({ state: asState(jamStep), isPlaying: true, beat: downbeat(0) }));
    act(() => rerender({ state: asState(jamStep), isPlaying: true, beat: downbeat(4) }));
    await settle();
    expect(result.current.runningIndex).toBe(1);

    // The engine is on the plain step now, and says so.
    act(() => rerender({ state: asState(plain), isPlaying: true, beat: downbeat(4) }));
    mockInvoke.mockClear();

    act(() => rerender({ state: asState(plain), isPlaying: false, beat: null }));
    await settle();

    // Whatever the run said on its way out, echoed back the way the engine
    // would echo it.
    const after = engineMeter({
      subdivision: plain.subdivision,
      beatGroups: plain.beatGroups,
      freeMode: plain.freeMode ?? false,
    });
    act(() => rerender({ state: asState(plain, after), isPlaying: false, beat: null }));

    const stopped = result.current.setlist!.steps[1];
    expect(stopped.subdivision).toBe(plain.subdivision);
    expect(stopped.beatGroups).toEqual(plain.beatGroups);
    expect(stopped.freeMode).toBe(plain.freeMode ?? false);
    expect(result.current.dirty).toBe(false);
  });
});

describe("the mirror and a jam step", () => {
  it("never reads the engine back onto one", () => {
    // A jam step's meter is the jam's, and the jam is what put it on the
    // engine — so the mirror would read the groove's own subdivision back out
    // and write it onto the step as though the user had chosen it.
    const { result, rerender } = mountWithJams();
    act(() => result.current.loadSetlist(CHAIN));
    act(() => void result.current.addJamStep(JAM));
    const before = result.current.setlist!.steps[2];

    // The engine reports something quite different from what the step says.
    act(() =>
      rerender({
        state: { ...DEFAULT_TEST_STATE, bpm: 200, subdivision: 3, beatGroups: [3] },
        isPlaying: false,
      }),
    );
    const after = result.current.setlist!.steps[2];
    expect(after.bpm).toBe(before.bpm);
    expect(after.subdivision).toBe(before.subdivision);
    expect(after.beatGroups).toEqual(before.beatGroups);
  });
});
