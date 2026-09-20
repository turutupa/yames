/**
 * Recording a pass at a song.
 *
 * The behaviour is Jam's and `useJamTakes.test.ts` already pins it, so what is
 * here is only what Songs adds: the shelf is keyed by the SONG's id, the take
 * of the pass that just ended reaches the review with an offset that was
 * measured rather than assumed, and the take of the last pass stops being the
 * take of "this" one the moment the next pass starts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSongTakes } from "./useSongTakes";
import type { JamTake } from "../../jam/types";

vi.mock("../../ipc", () => ({
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

const ipc = (await import("../../ipc")) as unknown as Record<string, ReturnType<typeof vi.fn>>;

const SONG = "1c0f3a9b7e2d4506";

function take(over: Partial<JamTake> = {}): JamTake {
  return { id: "t1", jamId: SONG, createdAt: 10, durationSec: 42, path: "p", ...over };
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });
}

type Props = { songId: string | null; isPlaying: boolean; countingIn: boolean; enabled: boolean };

function mount(initial: Partial<Props> = {}, onSetTakes = vi.fn()) {
  const props: Props = {
    songId: SONG,
    isPlaying: false,
    countingIn: false,
    enabled: true,
    ...initial,
  };
  const view = renderHook((p: Props) => useSongTakes({ ...p, view: "songs", onSetTakes }), {
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

afterEach(() => {
  vi.clearAllMocks();
});

describe("the shelf a song's takes sit on", () => {
  it("is asked for by the song's own id", async () => {
    mount();
    await settle();
    expect(ipc.listTakes).toHaveBeenCalledWith(SONG);
  });

  it("records under the song's id, not a jam's", async () => {
    const view = mount({ isPlaying: false });
    await settle();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: true });
    await settle();
    expect(ipc.startTake).toHaveBeenCalledWith(SONG);
  });

  it("waits for the count-in, the way a jam does", async () => {
    const view = mount();
    await settle();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: true, enabled: true });
    await settle();
    expect(ipc.startTake).not.toHaveBeenCalled();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: true });
    await settle();
    expect(ipc.startTake).toHaveBeenCalledWith(SONG);
  });

  it("records nothing for a song whose switch is off", async () => {
    const view = mount({ enabled: false });
    await settle();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: false });
    await settle();
    expect(ipc.startTake).not.toHaveBeenCalled();
  });
});

describe("the take the review is handed", () => {
  it("carries the song's id and an offset measured against the file", async () => {
    ipc.stopTake.mockImplementation(() => Promise.resolve(take()));
    const view = mount();
    await settle();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: true });
    await settle();
    view.rerender({ songId: SONG, isPlaying: false, countingIn: false, enabled: true });
    await settle();

    const last = view.result.current.lastTake;
    expect(last?.takeId).toBe("t1");
    expect(last?.jamId).toBe(SONG);
    // The file begins AFTER the beat that started it, so the range's first
    // beat sits at a negative offset inside it — never a positive one, which
    // would move every note the wrong way.
    expect(last?.startOffsetMs).toBeLessThanOrEqual(0);
    expect(Number.isFinite(last?.startOffsetMs ?? NaN)).toBe(true);
  });

  it("stops being this pass's take the moment the next pass starts", async () => {
    ipc.stopTake.mockImplementation(() => Promise.resolve(take()));
    const view = mount();
    await settle();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: true });
    await settle();
    view.rerender({ songId: SONG, isPlaying: false, countingIn: false, enabled: true });
    await settle();
    expect(view.result.current.lastTake).toBeDefined();

    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: true });
    await settle();
    expect(view.result.current.lastTake).toBeUndefined();
  });

  it("is dropped when the file it names is deleted", async () => {
    ipc.stopTake.mockImplementation(() => Promise.resolve(take()));
    const view = mount();
    await settle();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: true });
    await settle();
    view.rerender({ songId: SONG, isPlaying: false, countingIn: false, enabled: true });
    await settle();

    await act(async () => {
      view.result.current.remove("t1");
    });
    await settle();
    expect(view.result.current.lastTake).toBeUndefined();
  });

  it("never names a take recorded under another song", async () => {
    ipc.stopTake.mockImplementation(() => Promise.resolve(take({ jamId: "another" })));
    const view = mount();
    await settle();
    view.rerender({ songId: SONG, isPlaying: true, countingIn: false, enabled: true });
    await settle();
    view.rerender({ songId: SONG, isPlaying: false, countingIn: false, enabled: true });
    await settle();
    expect(view.result.current.lastTake).toBeUndefined();
    expect(view.result.current.takes).toEqual([]);
  });
});

describe("asking before the first recording", () => {
  it("opens the dialog rather than the microphone", async () => {
    const view = mount({ enabled: false });
    await settle();
    act(() => view.result.current.requestTakes(true));
    expect(view.result.current.introOpen).toBe(true);
    expect(view.onSetTakes).not.toHaveBeenCalled();
  });

  it("never asks again once it has been read, wherever it was read", async () => {
    // The key is the app's, and Jam writes the same one.
    ipc.storeLoad.mockImplementation(() => Promise.resolve(true));
    const view = mount({ enabled: false });
    await settle();
    act(() => view.result.current.requestTakes(true));
    expect(view.result.current.introOpen).toBe(false);
    expect(view.onSetTakes).toHaveBeenCalledWith(true);
  });

  it("turns off without asking anything", async () => {
    const view = mount();
    await settle();
    act(() => view.result.current.requestTakes(false));
    expect(view.result.current.introOpen).toBe(false);
    expect(view.onSetTakes).toHaveBeenCalledWith(false);
  });
});
