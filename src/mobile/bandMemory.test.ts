/**
 * When the band is allowed to cost a phone anything (M10).
 *
 * The rules being pinned here are the ones a musician would notice if they
 * broke: a band that is playing is never taken apart, a glance at a message
 * does not cost a re-decode, and coming back to the app brings the band back.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const ipc = vi.hoisted(() => ({ release: vi.fn(() => Promise.resolve(true)) }));

vi.mock("../ipc", () => ({
  releaseJamSounds: () => ipc.release(),
}));

import {
  SLEEP_AFTER_MS,
  appVisibilityChanged,
  memoryTrimmed,
  resetBandMemory,
  useBandSleep,
} from "./bandMemory";

/** `ComponentCallbacks2`'s own numbers, as Android sends them. */
const TRIM_RUNNING_CRITICAL = 15;
const TRIM_UI_HIDDEN = 20;

beforeEach(() => {
  vi.useFakeTimers();
  resetBandMemory();
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("letting the band go", () => {
  it("waits half a minute out of sight, then lets it go", async () => {
    const { result } = renderHook(() => useBandSleep(false));
    expect(result.current).toBe(false);

    act(() => appVisibilityChanged(false));
    // Not at once: glancing at a message and coming straight back must not
    // cost a re-decode.
    expect(ipc.release).not.toHaveBeenCalled();
    expect(result.current).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(SLEEP_AFTER_MS);
    });
    expect(ipc.release).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it("brings it back the moment the app is on screen again", async () => {
    const { result } = renderHook(() => useBandSleep(false));
    act(() => appVisibilityChanged(false));
    await act(async () => {
      vi.advanceTimersByTime(SLEEP_AFTER_MS);
    });
    expect(result.current).toBe(true);

    act(() => appVisibilityChanged(true));
    expect(result.current).toBe(false);
  });

  it("never touches a band that is playing, however long the app is hidden", async () => {
    const { result } = renderHook(() => useBandSleep(true));
    act(() => appVisibilityChanged(false));
    await act(async () => {
      vi.advanceTimersByTime(SLEEP_AFTER_MS * 10);
    });
    // The screen-off practice session M04 exists for.
    expect(ipc.release).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it("cancels a release the moment the transport starts", async () => {
    const { rerender } = renderHook(({ playing }) => useBandSleep(playing), {
      initialProps: { playing: false },
    });
    act(() => appVisibilityChanged(false));
    await act(async () => {
      vi.advanceTimersByTime(SLEEP_AFTER_MS / 2);
    });
    // Play from the notification's own button, with the app in the background.
    rerender({ playing: true });
    await act(async () => {
      vi.advanceTimersByTime(SLEEP_AFTER_MS * 2);
    });
    expect(ipc.release).not.toHaveBeenCalled();
  });

  it("does not wait when the phone says it is short of memory now", async () => {
    const { result } = renderHook(() => useBandSleep(false));
    act(() => appVisibilityChanged(false));
    await act(async () => {
      memoryTrimmed(TRIM_RUNNING_CRITICAL);
    });
    expect(ipc.release).toHaveBeenCalledTimes(1);
    expect(result.current).toBe(true);
  });

  it("treats a UI-hidden trim as the app going out of sight", async () => {
    renderHook(() => useBandSleep(false));
    act(() => memoryTrimmed(TRIM_UI_HIDDEN));
    expect(ipc.release).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(SLEEP_AFTER_MS);
    });
    expect(ipc.release).toHaveBeenCalledTimes(1);
  });

  it("stays awake when the engine refuses to let the band go", async () => {
    ipc.release.mockRejectedValueOnce(new Error("no"));
    const { result } = renderHook(() => useBandSleep(false));
    act(() => appVisibilityChanged(false));
    await act(async () => {
      vi.advanceTimersByTime(SLEEP_AFTER_MS);
    });
    // Nothing was let go, so nothing has to come back: the safe end of this
    // is a phone holding memory, not a jam tab with no band and no way to
    // notice.
    expect(result.current).toBe(false);
  });
});
