/**
 * Recording a take, from the top (JAM_MODE §4.4).
 *
 * The things worth pinning are the ones the feature can get wrong in ways
 * nobody would notice for a week: it must start AFTER the count-in and not on
 * the press, it must stop with the transport and keep what it got, it must
 * ask before the first recording and never again, and on a build whose engine
 * has no take commands it must draw its own "not available" state rather than
 * a red dot over nothing.
 *
 * The IPC module is mocked whole here rather than through the invoke
 * transport, because every question these tests ask is about which of the
 * seven take calls was made and what happened when one of them said no.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useJamTakes } from "./useJamTakes";
import { STARTER_JAMS } from "../../../jam/jams";
import type { Jam, JamTake } from "../../../jam/types";

vi.mock("../../../ipc", () => ({
  listTakes: vi.fn(() => Promise.resolve([] as JamTake[])),
  startTake: vi.fn(() => Promise.resolve()),
  stopTake: vi.fn(() => Promise.resolve(null)),
  deleteTake: vi.fn(() => Promise.resolve()),
  playTake: vi.fn(() => Promise.resolve()),
  stopTakePlayback: vi.fn(() => Promise.resolve()),
  onTakePlaybackEnded: vi.fn(() => Promise.resolve(() => {})),
  onTakeCapped: vi.fn(() => Promise.resolve(() => {})),
  takesDirSize: vi.fn(() => Promise.resolve(0)),
  storeLoad: vi.fn(() => Promise.resolve(undefined)),
  storeSave: vi.fn(() => Promise.resolve()),
}));

const ipc = (await import("../../../ipc")) as unknown as Record<
  string,
  ReturnType<typeof vi.fn>
>;

const JAM: Jam = { ...STARTER_JAMS[0], id: "j1", takes: true };

function take(over: Partial<JamTake> = {}): JamTake {
  return { id: "t1", jamId: "j1", createdAt: 10, durationSec: 42, path: "p", ...over };
}

/** Let the hook's promises land. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

type Props = { jam: Jam | null; isPlaying: boolean; countingIn: boolean };

function mount(initial: Partial<Props> = {}, onSetTakes = vi.fn()) {
  const props: Props = { jam: JAM, isPlaying: false, countingIn: false, ...initial };
  const view = renderHook((p: Props) => useJamTakes({ ...p, view: "jam", onSetTakes }), {
    initialProps: props,
  });
  return { ...view, onSetTakes };
}

beforeEach(() => {
  ipc.listTakes.mockImplementation(() => Promise.resolve([]));
  ipc.startTake.mockImplementation(() => Promise.resolve());
  ipc.stopTake.mockImplementation(() => Promise.resolve(null));
  ipc.deleteTake.mockImplementation(() => Promise.resolve());
  ipc.playTake.mockImplementation(() => Promise.resolve());
  ipc.stopTakePlayback.mockImplementation(() => Promise.resolve());
  ipc.onTakePlaybackEnded.mockImplementation(() => Promise.resolve(() => {}));
  ipc.onTakeCapped.mockImplementation(() => Promise.resolve(() => {}));
  ipc.takesDirSize.mockImplementation(() => Promise.resolve(0));
  ipc.storeLoad.mockImplementation(() => Promise.resolve(undefined));
  ipc.storeSave.mockImplementation(() => Promise.resolve());
});

afterEach(() => vi.clearAllMocks());

describe("the shelf", () => {
  it("reads the jam's takes when one is loaded, newest first", async () => {
    ipc.listTakes.mockResolvedValue([
      take({ id: "old", createdAt: 1 }),
      take({ id: "new", createdAt: 9 }),
    ]);
    const { result } = mount();
    await settle();
    expect(result.current.available).toBe(true);
    expect(result.current.takes.map((t) => t.id)).toEqual(["new", "old"]);
    expect(ipc.listTakes).toHaveBeenCalledWith("j1");
  });

  it("asks nothing at all with no jam loaded", async () => {
    mount({ jam: null });
    await settle();
    expect(ipc.listTakes).not.toHaveBeenCalled();
  });

  it("reads the folder size from the engine rather than guessing it", async () => {
    // A guess from the durations would be wrong in both directions, and the
    // question is about the DISK — the whole folder, every jam.
    ipc.takesDirSize.mockResolvedValue(123_456_789);
    const { result } = mount();
    await settle();
    expect(result.current.dirBytes).toBe(123_456_789);
  });

  it("leaves the size out rather than the shelf when only the size fails", async () => {
    ipc.listTakes.mockResolvedValue([take()]);
    ipc.takesDirSize.mockRejectedValue(new Error("no such command"));
    const { result } = mount();
    await settle();
    expect(result.current.available).toBe(true);
    expect(result.current.takes).toHaveLength(1);
    expect(result.current.dirBytes).toBe(0);
  });
});

describe("a build whose engine has no take commands", () => {
  it("says so once, and never pretends to record", async () => {
    // Not an error to recover from — a state the screen has to be able to
    // draw. The first `listTakes` is the question and its answer.
    ipc.listTakes.mockRejectedValue(new Error("no such command"));
    const { result, rerender } = mount();
    await settle();
    expect(result.current.available).toBe(false);

    act(() => rerender({ jam: JAM, isPlaying: true, countingIn: false }));
    await settle();
    expect(ipc.startTake).not.toHaveBeenCalled();
    expect(result.current.recording).toBe(false);
  });

  it("gives up quietly when the start itself is refused", async () => {
    // The list came back, so the screen believed the build could record; the
    // start is where it finds out otherwise. No mark, no phantom take.
    ipc.startTake.mockRejectedValue(new Error("nope"));
    const { result, rerender } = mount();
    await settle();
    act(() => rerender({ jam: JAM, isPlaying: true, countingIn: false }));
    await settle();
    expect(result.current.recording).toBe(false);
    expect(result.current.available).toBe(false);
    expect(result.current.takes).toEqual([]);
  });
});

describe("the recording lifecycle", () => {
  it("starts after the count-in, not on the press", async () => {
    // A count-in is four beeps and a stick click. A recording that opens with
    // them is one you have to skip the start of every time you listen back.
    const { result, rerender } = mount();
    await settle();
    act(() => rerender({ jam: JAM, isPlaying: true, countingIn: true }));
    await settle();
    expect(ipc.startTake).not.toHaveBeenCalled();
    expect(result.current.recording).toBe(false);

    act(() => rerender({ jam: JAM, isPlaying: true, countingIn: false }));
    await settle();
    expect(ipc.startTake).toHaveBeenCalledWith("j1");
    expect(result.current.recording).toBe(true);
  });

  it("stops with the transport and puts the take on the shelf", async () => {
    ipc.stopTake.mockResolvedValue(take({ id: "fresh", createdAt: 99 }));
    const { result, rerender } = mount({ isPlaying: true });
    await settle();
    expect(result.current.recording).toBe(true);

    act(() => rerender({ jam: JAM, isPlaying: false, countingIn: false }));
    await settle();
    expect(ipc.stopTake).toHaveBeenCalledTimes(1);
    expect(result.current.recording).toBe(false);
    expect(result.current.takes.map((t) => t.id)).toEqual(["fresh"]);
    // The folder just grew by however long you played, so it is asked again.
    expect(ipc.takesDirSize.mock.calls.length).toBeGreaterThan(1);
  });

  it("keeps no take when the engine says nothing was recording", async () => {
    ipc.stopTake.mockResolvedValue(null);
    const { result, rerender } = mount({ isPlaying: true });
    await settle();
    act(() => rerender({ jam: JAM, isPlaying: false, countingIn: false }));
    await settle();
    expect(result.current.takes).toEqual([]);
  });

  it("records nothing on a jam that has not opted in", async () => {
    // `Jam.takes` is the switch and it lives on the record, so a jam you
    // record is a jam you decided to record.
    const off: Jam = { ...JAM, takes: undefined };
    const { result, rerender } = renderHook(
      (p: Props) => useJamTakes({ ...p, view: "jam", onSetTakes: vi.fn() }),
      { initialProps: { jam: off, isPlaying: false, countingIn: false } as Props },
    );
    await settle();
    act(() => rerender({ jam: off, isPlaying: true, countingIn: false }));
    await settle();
    expect(ipc.startTake).not.toHaveBeenCalled();
    expect(result.current.recording).toBe(false);
  });

  it("stops when the switch is turned off mid-take", async () => {
    const { rerender } = mount({ isPlaying: true });
    await settle();
    expect(ipc.startTake).toHaveBeenCalledTimes(1);
    act(() => rerender({ jam: { ...JAM, takes: false }, isPlaying: true, countingIn: false }));
    await settle();
    expect(ipc.stopTake).toHaveBeenCalledTimes(1);
  });

  it("ends the take when another jam takes the stage", async () => {
    // The engine files a take under the id it was STARTED with. Left running,
    // the recorder went on writing under the blues while the screen was on
    // the bossa — and the finished take landed on the bossa's shelf.
    const other: Jam = { ...STARTER_JAMS[1], id: "j2", takes: true };
    ipc.stopTake.mockResolvedValue(take({ id: "fresh", jamId: "j1" }));
    const { result, rerender } = mount({ isPlaying: true });
    await settle();
    expect(ipc.startTake).toHaveBeenCalledWith("j1");
    expect(result.current.recording).toBe(true);

    act(() => rerender({ jam: other, isPlaying: true, countingIn: false }));
    await settle();

    expect(ipc.stopTake).toHaveBeenCalledTimes(1);
    expect(result.current.recording).toBe(false);
    // And the blues' take is not on the bossa's shelf.
    expect(result.current.takes.map((t) => t.id)).not.toContain("fresh");
  });

  it("keeps a take that ended on the jam it was recorded under", async () => {
    // The other half of the same rule: stopping the transport on the jam you
    // recorded still puts the take at the top of that jam's list.
    ipc.stopTake.mockResolvedValue(take({ id: "fresh", jamId: "j1" }));
    const { result, rerender } = mount({ isPlaying: true });
    await settle();
    act(() => rerender({ jam: JAM, isPlaying: false, countingIn: false }));
    await settle();
    expect(result.current.takes.map((t) => t.id)).toEqual(["fresh"]);
  });
});

describe("playing one back", () => {
  it("marks it playing straight away rather than a round trip later", async () => {
    ipc.listTakes.mockResolvedValue([take()]);
    const { result } = mount();
    await settle();
    act(() => result.current.play("t1"));
    expect(result.current.playingId).toBe("t1");
    await settle();
    expect(ipc.playTake).toHaveBeenCalledWith("t1");
  });

  it("puts the controls back if the engine refuses", async () => {
    ipc.listTakes.mockResolvedValue([take()]);
    ipc.playTake.mockRejectedValue(new Error("nope"));
    const { result } = mount();
    await settle();
    act(() => result.current.play("t1"));
    await settle();
    expect(result.current.playingId).toBeNull();
  });

  it("stops on request", async () => {
    ipc.listTakes.mockResolvedValue([take()]);
    const { result } = mount();
    await settle();
    act(() => result.current.play("t1"));
    await settle();
    act(() => result.current.stopPlayback());
    await settle();
    expect(result.current.playingId).toBeNull();
    expect(ipc.stopTakePlayback).toHaveBeenCalledTimes(1);
  });

  it("brings the controls back when the take reaches its end by itself", async () => {
    // The engine says so on `take-playback-ended`. Without it the row would
    // stay lit and the other takes disabled for ever.
    let ended: (() => void) | null = null;
    ipc.onTakePlaybackEnded.mockImplementation((cb: () => void) => {
      ended = cb;
      return Promise.resolve(() => {});
    });
    ipc.listTakes.mockResolvedValue([take()]);
    const { result } = mount();
    await settle();
    act(() => result.current.play("t1"));
    expect(result.current.playingId).toBe("t1");
    act(() => ended!());
    expect(result.current.playingId).toBeNull();
  });
});

describe("deleting one", () => {
  it("takes the row off the shelf and asks the engine to remove the file", async () => {
    ipc.listTakes.mockResolvedValue([take({ id: "a" }), take({ id: "b" })]);
    const { result } = mount();
    await settle();
    act(() => result.current.remove("a"));
    expect(result.current.takes.map((t) => t.id)).toEqual(["b"]);
    await settle();
    expect(ipc.deleteTake).toHaveBeenCalledWith("a");
    // And the folder is a different size than the screen thought.
    expect(ipc.takesDirSize.mock.calls.length).toBeGreaterThan(1);
  });

  it("stops the sound when the take being deleted is the one playing", async () => {
    // Clearing the row's lit state is not the same as stopping the file. The
    // engine went on playing a take that was being deleted, with the band
    // still muted behind it and no row left to press stop on.
    ipc.listTakes.mockResolvedValue([take({ id: "a" }), take({ id: "b" })]);
    const { result } = mount();
    await settle();
    act(() => result.current.play("a"));
    await settle();
    expect(result.current.playingId).toBe("a");

    act(() => result.current.remove("a"));
    expect(result.current.playingId).toBeNull();
    await settle();
    expect(ipc.stopTakePlayback).toHaveBeenCalledTimes(1);
  });

  it("says nothing about playback when the take being deleted is not playing", async () => {
    ipc.listTakes.mockResolvedValue([take({ id: "a" }), take({ id: "b" })]);
    const { result } = mount();
    await settle();
    act(() => result.current.play("a"));
    await settle();
    act(() => result.current.remove("b"));
    await settle();
    expect(ipc.stopTakePlayback).not.toHaveBeenCalled();
    expect(result.current.playingId).toBe("a");
  });

  it("puts the row back when the file did not go", async () => {
    // A row that vanishes while the disk stays full is a comfortable lie.
    ipc.listTakes.mockResolvedValue([take({ id: "a" })]);
    ipc.deleteTake.mockRejectedValue(new Error("locked"));
    const { result } = mount();
    await settle();
    act(() => result.current.remove("a"));
    await settle();
    expect(result.current.takes.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("the first-time dialog", () => {
  it("asks before the first take is ever recorded, and not after", async () => {
    const { result, onSetTakes } = mount();
    await settle();

    act(() => result.current.requestTakes(true));
    expect(result.current.introOpen).toBe(true);
    // Nothing has been turned on yet: the dialog IS the switch.
    expect(onSetTakes).not.toHaveBeenCalled();

    act(() => result.current.confirmIntro());
    expect(result.current.introOpen).toBe(false);
    expect(onSetTakes).toHaveBeenCalledWith(true);

    // Second time, straight through.
    onSetTakes.mockClear();
    act(() => result.current.requestTakes(true));
    expect(result.current.introOpen).toBe(false);
    expect(onSetTakes).toHaveBeenCalledWith(true);
  });

  it("changes nothing when the answer is no", async () => {
    const { result, onSetTakes } = mount();
    await settle();
    act(() => result.current.requestTakes(true));
    act(() => result.current.cancelIntro());
    expect(result.current.introOpen).toBe(false);
    expect(onSetTakes).not.toHaveBeenCalled();
  });

  it("never asks on the way out — nobody needs a dialog to stop recording", async () => {
    const { result, onSetTakes } = mount();
    await settle();
    act(() => result.current.requestTakes(false));
    expect(result.current.introOpen).toBe(false);
    expect(onSetTakes).toHaveBeenCalledWith(false);
  });

  it("remembers the answer for the app, not for the jam", async () => {
    // What a take is only has to be explained once; a per-jam flag would ask
    // again for every jam in the library, which reads as the app not
    // trusting the answer you already gave.
    const { result } = mount();
    await settle();
    act(() => result.current.requestTakes(true));
    act(() => result.current.confirmIntro());
    expect(ipc.storeSave).toHaveBeenCalledWith("jam.takesIntroSeen", true);
  });

  it("does not ask again in a later session", async () => {
    ipc.storeLoad.mockResolvedValue(true);
    const { result, onSetTakes } = mount();
    await settle();
    act(() => result.current.requestTakes(true));
    expect(result.current.introOpen).toBe(false);
    expect(onSetTakes).toHaveBeenCalledWith(true);
  });
});
