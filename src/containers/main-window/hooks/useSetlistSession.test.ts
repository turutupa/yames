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
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSetlistSession } from "./useSetlistSession";
import { DEFAULT_TEST_STATE, mockInvoke } from "../../../test/mocks";
import { engineTick } from "../../../test/engineTicks";
import * as ipc from "../../../ipc";
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

/**
 * The hook, on a tab that is NOT the setlist unless a test says so.
 *
 * Standing on the Setlist tab is itself a request for a setlist now
 * (2026-09-17), so the tab has to be somewhere else for the tests below to be
 * about the thing they load by hand rather than about the one the tab opened.
 */
function mount(initial: Partial<AppState> = {}, tab = "beat") {
  const setView = vi.fn();
  const onSetlistLoaded = vi.fn();
  const view = renderHook(
    // `tab` is optional so the rerenders below can go on passing the two
    // props they care about; left out, the hook is not on the setlist tab.
    ({ state, isPlaying, tab }: { state: AppState; isPlaying: boolean; tab?: string }) =>
      useSetlistSession({
        state,
        isPlaying,
        currentBeat: null,
        view: tab ?? "beat",
        setView,
        onSetlistLoaded,
      }),
    {
      initialProps: {
        state: { ...DEFAULT_TEST_STATE, ...initial },
        isPlaying: false,
        tab,
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

  /**
   * A tick that opens a bar of 4/4 — beat 0, 4, 8 and so on.
   *
   * `measureBeat` comes off the beat index rather than being pinned to 0,
   * because the engine's `isDownbeat` is only "a whole beat, not a
   * subdivision" and a fixture that sets `measureBeat: 0` on every tick
   * cannot tell a runner counting BARS from one counting beats.
   */
  function barLine(n: number): BeatEvent {
    return engineTick({ beat: n });
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
          // On the setlist tab: this test is about a RUN, and a run is
          // something that starts from the setlist tab. Play pressed anywhere
          // else belongs to the screen the user is looking at.
          view: "setlist",
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
    act(() => rerender({ state: asState(jamStep), isPlaying: true, beat: barLine(0) }));
    act(() => rerender({ state: asState(jamStep), isPlaying: true, beat: barLine(4) }));
    await settle();
    expect(result.current.runningIndex).toBe(1);

    // The engine is on the plain step now, and says so.
    act(() => rerender({ state: asState(plain), isPlaying: true, beat: barLine(4) }));
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

describe("duplicating a setlist", () => {
  /** Two setlists in the library, the second one loaded. */
  async function library() {
    const view = mount();
    const { result } = view;
    await act(async () => {
      result.current.loadSetlist({ ...CHAIN, countIn: 4 });
    });
    await act(async () => {
      await result.current.saveActiveSetlist();
    });
    await act(async () => {
      result.current.loadSetlist({ ...CHAIN, id: "c2", name: "Evening" });
    });
    await act(async () => {
      await result.current.saveActiveSetlist();
    });
    expect(result.current.setlists.map((c) => c.id)).toEqual(["c1", "c2"]);
    return view;
  }

  it("writes the copy's place down, so it is still there after a restart", async () => {
    /*
     * `save_setlist` appends. The copy therefore sat beside its source on
     * screen and at the bottom of the library the next time the app opened —
     * the one place where being beside it was the whole point. The order is
     * the user's, so it goes to the store as an order.
     */
    const reorder = vi.spyOn(ipc, "reorderSetlists");
    const { result } = await library();
    let copyId = "";
    await act(async () => {
      copyId = (await result.current.duplicateSetlist("c1"))?.id ?? "";
    });
    const ids = reorder.mock.calls[reorder.mock.calls.length - 1][0];
    expect(ids.indexOf(copyId)).toBe(ids.indexOf("c1") + 1);
    expect(ids).toEqual(["c1", copyId, "c2"]);
    reorder.mockRestore();
  });

  it("puts the copy directly after the one it came from", async () => {
    // Beside it, not at the bottom of the library: a copy is a variation on
    // that setlist. The jam library's Duplicate already reads this way.
    const { result } = await library();
    await act(async () => {
      await result.current.duplicateSetlist("c1");
    });
    expect(result.current.setlists.map((c) => c.name)).toEqual([
      "Warm-up",
      "Warm-up copy",
      "Evening",
    ]);
  });

  it("carries the count-in and gives every step a new id", async () => {
    const { result } = await library();
    await act(async () => {
      await result.current.duplicateSetlist("c1");
    });
    const [source, copy] = result.current.setlists;
    expect(copy.countIn).toBe(4);
    expect(copy.id).not.toBe(source.id);
    expect(copy.steps.map((s) => s.name)).toEqual(["Loosen up", "Alt picking"]);
    for (const step of copy.steps) {
      expect(source.steps.some((s) => s.id === step.id)).toBe(false);
    }
  });

  it("leaves the setlist you were editing open", async () => {
    // Duplicating one routine is not a request to stop working on another.
    const { result } = await library();
    await act(async () => {
      await result.current.duplicateSetlist("c1");
    });
    expect(result.current.setlist?.id).toBe("c2");
    expect(result.current.dirty).toBe(false);
  });

  it("does nothing for a setlist that is not in the library", async () => {
    const { result } = await library();
    await act(async () => {
      await result.current.duplicateSetlist("nope");
    });
    expect(result.current.setlists).toHaveLength(2);
  });
});

describe("dragging a setlist to a new place in the library", () => {
  /** Three setlists in the library, the first one loaded and saved. */
  async function library() {
    const view = mount();
    const { result } = view;
    for (const [id, name] of [["c1", "Warm-up"], ["c2", "Evening"], ["c3", "Gig"]]) {
      await act(async () => {
        result.current.loadSetlist({ ...CHAIN, id, name });
      });
      await act(async () => {
        await result.current.saveActiveSetlist();
      });
    }
    await act(async () => {
      result.current.loadSetlist({ ...CHAIN, id: "c1", name: "Warm-up" });
    });
    expect(result.current.setlists.map((c) => c.id)).toEqual(["c1", "c2", "c3"]);
    return view;
  }

  it("moves the row and writes the new order down together", async () => {
    // What the library shows and what the store keeps have to agree, or the
    // drag comes undone at the next restart — the one place the order means
    // anything.
    const reorder = vi.spyOn(ipc, "reorderSetlists");
    const { result } = await library();
    await act(async () => {
      await result.current.reorderSetlists(0, 2);
    });
    expect(result.current.setlists.map((c) => c.id)).toEqual(["c2", "c3", "c1"]);
    expect(reorder.mock.calls[reorder.mock.calls.length - 1][0]).toEqual(["c2", "c3", "c1"]);
    reorder.mockRestore();
  });

  it("leaves the open setlist open and the save bar clean", async () => {
    // Moving a row in the library says nothing about what is in the routine.
    const { result } = await library();
    await act(async () => {
      await result.current.reorderSetlists(2, 0);
    });
    expect(result.current.setlist?.id).toBe("c1");
    expect(result.current.selectedStepId).toBe("s1");
    expect(result.current.dirty).toBe(false);
  });

  it("moves the list as it is now, not as the drag found it", async () => {
    /*
     * `duplicateSetlist` awaits the store before it adds the copy, and a drop
     * landing inside that window used to write back a list from before the
     * copy existed — the copy gone from the library, and the drag blamed for
     * it. Held here by keeping the callback from before the copy and calling
     * it after, which is exactly what a closure over the old list is.
     */
    const reorder = vi.spyOn(ipc, "reorderSetlists");
    const { result } = await library();
    const mid = result.current.reorderSetlists;
    await act(async () => {
      await result.current.duplicateSetlist("c1");
    });
    expect(result.current.setlists).toHaveLength(4);

    await act(async () => {
      await mid(0, 2);
    });
    expect(result.current.setlists).toHaveLength(4);
    expect(result.current.setlists.map((c) => c.name)).toContain("Warm-up copy");
    // And what was written down is what is on screen, not one of the two.
    expect(reorder.mock.calls[reorder.mock.calls.length - 1][0]).toEqual(
      result.current.setlists.map((c) => c.id),
    );
    reorder.mockRestore();
  });

  it("writes nothing for a drag that moved nothing", async () => {
    const reorder = vi.spyOn(ipc, "reorderSetlists");
    const { result } = await library();
    const before = result.current.setlists;
    await act(async () => {
      await result.current.reorderSetlists(1, 1);
      await result.current.reorderSetlists(0, 9);
    });
    expect(result.current.setlists).toBe(before);
    expect(reorder).not.toHaveBeenCalled();
    reorder.mockRestore();
  });
});

describe("a block of steps, beside the selection", () => {
  /** A setlist with four steps, loaded, step one selected. */
  function loaded() {
    const view = mount();
    const steps = [...CHAIN.steps, { ...CHAIN.steps[0], id: "s3", name: "Push" },
      { ...CHAIN.steps[1], id: "s4", name: "Cool down" }];
    act(() => view.result.current.loadSetlist({ ...CHAIN, steps }));
    return view;
  }

  it("starts as the one step the controls are on", () => {
    const { result } = loaded();
    expect(result.current.selectedStepId).toBe("s1");
    expect([...result.current.selectedStepIds]).toEqual(["s1"]);
  });

  it("extends from the anchor without moving the primary selection", () => {
    // Marking four steps to drag them is not a request to start listening to
    // the fourth: the metronome below the track stays on the step it was on.
    const { result } = loaded();
    act(() => result.current.extendSelection("s3"));
    expect([...result.current.selectedStepIds]).toEqual(["s1", "s2", "s3"]);
    expect(result.current.selectedStepId).toBe("s1");
  });

  it("reads a shift-click above the anchor the same way", () => {
    const { result } = loaded();
    act(() => result.current.selectStep("s3"));
    act(() => result.current.extendSelection("s1"));
    expect([...result.current.selectedStepIds]).toEqual(["s1", "s2", "s3"]);
    expect(result.current.selectedStepId).toBe("s3");
  });

  it("toggles one step in and out, leaving the rest of the block alone", () => {
    const { result } = loaded();
    act(() => result.current.extendSelection("s2"));
    act(() => result.current.toggleStepSelection("s4"));
    expect([...result.current.selectedStepIds].sort()).toEqual(["s1", "s2", "s4"]);
    act(() => result.current.toggleStepSelection("s2"));
    expect([...result.current.selectedStepIds].sort()).toEqual(["s1", "s4"]);
    expect(result.current.selectedStepId).toBe("s1");
  });

  it("never lets a ctrl-click empty the set", () => {
    // The set is "the steps an operation would take", and the step the
    // controls are on is always one of them — a set clicked down to nothing
    // left the row still drawn as selected with its buttons pointing at
    // no step at all.
    const { result } = loaded();
    act(() => result.current.extendSelection("s2"));
    // The primary cannot be clicked out of its own set.
    act(() => result.current.toggleStepSelection("s1"));
    expect([...result.current.selectedStepIds].sort()).toEqual(["s1", "s2"]);

    // And a toggle that would empty a set the primary is not in falls back
    // to the primary rather than to nothing.
    act(() => result.current.selectStep("s1"));
    act(() => result.current.toggleStepSelection("s3"));
    act(() => result.current.toggleStepSelection("s1"));
    act(() => result.current.toggleStepSelection("s3"));
    expect([...result.current.selectedStepIds]).toEqual(["s1"]);
  });

  it("drops ids the setlist no longer has, and the anchor with them", () => {
    // Revert can take a step away while it is marked. A ghost id leaves one
    // row wearing the block's wash while its buttons say "1 step".
    const { result } = loaded();
    act(() => result.current.extendSelection("s4"));
    expect(result.current.selectedStepIds.size).toBe(4);
    act(() =>
      result.current.setSetlist((c) =>
        c ? { ...c, steps: c.steps.filter((s) => s.id !== "s3" && s.id !== "s4") } : c,
      ),
    );
    expect([...result.current.selectedStepIds].sort()).toEqual(["s1", "s2"]);
  });

  it("forgets where a shift-click measures from once a run has moved the selection", () => {
    // The runner drags the primary down the list; the anchor stayed where the
    // block was marked from before the run, so stopping on a later step and
    // shift-clicking one after it swept the whole routine.
    const setView = vi.fn();
    const { result, rerender } = renderHook(
      ({ state, isPlaying }: { state: AppState; isPlaying: boolean }) =>
        useSetlistSession({
          state,
          isPlaying,
          currentBeat: null,
          setView,
          onSetlistLoaded: vi.fn(),
        }),
      { initialProps: { state: DEFAULT_TEST_STATE as AppState, isPlaying: false } },
    );
    const steps = [
      ...CHAIN.steps,
      { ...CHAIN.steps[0], id: "s3", name: "Push" },
      { ...CHAIN.steps[1], id: "s4", name: "Cool down" },
    ];
    act(() => result.current.loadSetlist({ ...CHAIN, steps }));
    // A block marked from the top, then a run, then a stop on step three.
    act(() => result.current.extendSelection("s2"));
    act(() => rerender({ state: DEFAULT_TEST_STATE as AppState, isPlaying: true }));
    act(() => result.current.selectStep("s3"));
    act(() => rerender({ state: DEFAULT_TEST_STATE as AppState, isPlaying: false }));

    act(() => result.current.extendSelection("s4"));
    expect([...result.current.selectedStepIds]).toEqual(["s3", "s4"]);
  });

  it("a plain click ends the block", () => {
    const { result } = loaded();
    act(() => result.current.extendSelection("s4"));
    expect(result.current.selectedStepIds.size).toBe(4);
    act(() => result.current.selectStep("s2"));
    expect([...result.current.selectedStepIds]).toEqual(["s2"]);
  });

  it("collapses back to the step the controls are on", () => {
    const { result } = loaded();
    act(() => result.current.extendSelection("s4"));
    act(() => result.current.collapseSelection());
    expect([...result.current.selectedStepIds]).toEqual(["s1"]);
  });

  it("gives the block back when the setlist starts", () => {
    // The runner walks the primary selection down the list from here, so a
    // block marked against where it used to be stops describing anything.
    const { result, rerender } = (() => {
      const setView = vi.fn();
      const view = renderHook(
        ({ state, isPlaying }: { state: AppState; isPlaying: boolean }) =>
          useSetlistSession({
            state,
            isPlaying,
            currentBeat: null,
            setView,
            onSetlistLoaded: vi.fn(),
          }),
        { initialProps: { state: DEFAULT_TEST_STATE as AppState, isPlaying: false } },
      );
      return view;
    })();
    act(() => result.current.loadSetlist(CHAIN));
    act(() => result.current.extendSelection("s2"));
    expect(result.current.selectedStepIds.size).toBe(2);

    act(() => rerender({ state: DEFAULT_TEST_STATE as AppState, isPlaying: true }));
    expect([...result.current.selectedStepIds]).toEqual(["s1"]);
  });

  it("clears with the setlist it belonged to", () => {
    const { result } = loaded();
    act(() => result.current.extendSelection("s4"));
    act(() => result.current.closeSetlist());
    expect(result.current.selectedStepIds.size).toBe(0);
  });
});

/**
 * The Setlist tab is never a screen with a button on it (2026-09-17).
 *
 * The owner's report was that the three modes disagreed with each other about
 * what opening one means: Drill showed a whole drill, Setlist and Jam showed
 * an invitation, and none of them remembered anything from yesterday. The
 * rule is that every mode opens with something live in front of you, and the
 * library holds what you chose to save.
 */
describe("the tab always has a setlist on it", () => {
  /** Two saved routines, and whatever the store remembers about them. */
  function shelf(setlists: Setlist[], lastId?: string) {
    const list = vi.spyOn(ipc, "listSetlists").mockResolvedValue(setlists);
    const load = vi.spyOn(ipc, "storeLoad").mockImplementation(async (key: string) =>
      key === "lastSetlistId" ? (lastId as never) : (undefined as never),
    );
    return () => {
      list.mockRestore();
      load.mockRestore();
    };
  }

  const SECOND: Setlist = { ...CHAIN, id: "c2", name: "Cool down" };

  it("opens on the setlist you last had open", async () => {
    // The whole of "it remembers where I was". Without it, coming back to the
    // app meant coming back to an invitation, whatever you were working on
    // the night before.
    const restore = shelf([CHAIN, SECOND], "c2");
    const { result } = mount({}, "setlist");
    await waitFor(() => expect(result.current.setlist?.id).toBe("c2"));
    restore();
  });

  it("opens on the first in the library when none was ever open", async () => {
    const restore = shelf([CHAIN, SECOND]);
    const { result } = mount({}, "setlist");
    await waitFor(() => expect(result.current.setlist?.id).toBe("c1"));
    restore();
  });

  it("opens on the first in the library when the remembered one is gone", async () => {
    // A lookup, not a load by id: a setlist you deleted last week is not an
    // answer to "what was I working on", and asking the store for it by name
    // would have put nothing on the stage at all.
    const restore = shelf([CHAIN, SECOND], "c-deleted");
    const { result } = mount({}, "setlist");
    await waitFor(() => expect(result.current.setlist?.id).toBe("c1"));
    restore();
  });

  it("opens a new setlist that the library has never heard of", async () => {
    /*
     * The one rule that matters more than the others here: a setlist made
     * because somebody clicked a tab must NOT be filed. A mode that saved one
     * every time it was opened would leave a shelf of empty routines nobody
     * made, and the library is the one thing in this app a player owns.
     */
    const save = vi.spyOn(ipc, "saveSetlist");
    const restore = shelf([]);
    const { result } = mount({}, "setlist");
    await waitFor(() => expect(result.current.setlist).not.toBeNull());
    expect(result.current.setlists).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    // And Save has something to do, which "no changes" would have denied: a
    // setlist that has never been written down always has something to write.
    expect(result.current.unsaved).toBe(true);
    expect(result.current.dirty).toBe(false);
    restore();
    save.mockRestore();
  });

  it("files that setlist the moment you ask it to, and not before", async () => {
    const save = vi.spyOn(ipc, "saveSetlist").mockResolvedValue(undefined);
    const restore = shelf([]);
    const { result } = mount({}, "setlist");
    await waitFor(() => expect(result.current.setlist).not.toBeNull());

    await act(async () => {
      await result.current.saveActiveSetlist();
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(result.current.setlists).toHaveLength(1);
    expect(result.current.unsaved).toBe(false);
    restore();
    save.mockRestore();
  });

  it("writes down the setlist it opened, so tomorrow opens on the same one", async () => {
    const write = vi.spyOn(ipc, "storeSave").mockResolvedValue(undefined);
    const { result } = mount();
    await act(async () => {
      result.current.loadSetlist(CHAIN);
    });
    expect(write).toHaveBeenCalledWith("lastSetlistId", "c1");
    write.mockRestore();
  });

  it("leaves every other tab alone", async () => {
    // Standing on the Metronome tab is not a request for a setlist. This used
    // to be the only behaviour there was, and it is still the right one
    // everywhere except the tab whose job is setlists.
    const restore = shelf([CHAIN]);
    const { result } = mount();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(result.current.setlist).toBeNull();
    restore();
  });
});

describe("a setlist the tab made, once you start working on it", () => {
  it("goes dirty like any other, so nothing can throw it away in silence", async () => {
    /*
     * The gate that asks "you have unsaved work, save it?" reads `dirty`, and
     * the first version of this could never be dirty: there was nothing
     * stored to compare against. So an afternoon spent building a routine on
     * a fresh install disappeared without a word the moment anything else was
     * loaded. The baseline is the setlist AS CREATED now, which makes adding
     * a step to it exactly as visible as adding one to a stored setlist.
     */
    const list = vi.spyOn(ipc, "listSetlists").mockResolvedValue([]);
    const { result } = mount({}, "setlist");
    await waitFor(() => expect(result.current.setlist).not.toBeNull());
    expect(result.current.dirty).toBe(false);

    await act(async () => {
      result.current.addStepFromNow();
    });
    expect(result.current.dirty).toBe(true);
    // And it is still in no library — the two facts are separate, and both
    // are true at once.
    expect(result.current.unsaved).toBe(true);
    list.mockRestore();
  });
});
