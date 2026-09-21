// The tab you were on is where you come back to.
//
// The restore guard has to name every play tab, and it was written when there
// were two. When setlists became a mode the app went on persisting "setlist"
// and then silently refusing to restore it — quit on the setlist, come back to
// the metronome. Nothing failed; a branch simply did not match.
//
// Both halves are pinned here: the guard accepts every play tab, and it still
// rejects anything that is not one, because the value arrives from a store as
// an unchecked string.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { PLAY_TABS, useTabRouting } from "./useTabRouting";

const getActiveTab = vi.fn();
const setActiveTab = vi.fn();
const setPlaying = vi.fn();
const stopSpeedRamp = vi.fn();

vi.mock("../../../ipc", () => ({
  getActiveTab: (...args: unknown[]) => getActiveTab(...args),
  setActiveTab: (...args: unknown[]) => setActiveTab(...args),
  setPlaying: (...args: unknown[]) => setPlaying(...args),
  stopSpeedRamp: (...args: unknown[]) => stopSpeedRamp(...args),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function mount() {
  return renderHook(() => useTabRouting({ isPlaying: false, speedRampActive: false }));
}

describe("useTabRouting — where the app reopens", () => {
  it("comes back to whichever play tab you left it on", async () => {
    for (const tab of PLAY_TABS) {
      getActiveTab.mockResolvedValue(tab);
      const { result, unmount } = mount();
      await waitFor(() => expect(result.current.view).toBe(tab));
      expect(result.current.prevTab.current).toBe(tab);
      unmount();
    }
  });

  it("covers every mode the rail offers", () => {
    // The rail's modes and the tabs that can be restored are the same list.
    // A mode missing here is one the app forgets you were on.
    expect([...PLAY_TABS].sort()).toEqual(["beat", "drill", "jam", "setlist"]);
  });

  it("ignores a stored value that is not a tab", async () => {
    // `settings` is never persisted, and a store written by another build may
    // hold anything at all. Falling back to the metronome beats rendering a
    // view that does not exist.
    for (const junk of ["settings", "chain", "", "Beat"]) {
      getActiveTab.mockResolvedValue(junk);
      const { result, unmount } = mount();
      await waitFor(() => expect(getActiveTab).toHaveBeenCalled());
      expect(result.current.view, `"${junk}" should not be restored`).toBe("beat");
      unmount();
    }
  });
});

/**
 * SETTINGS IS A LAYER (2026-09-16).
 *
 * The owner: opening Settings from a playing jam switched it to the metronome,
 * and closing Settings brought the jam back. The rules pinned below are the
 * ones that make Settings change nothing underneath it.
 */
describe("useTabRouting — Settings over a mode", () => {
  function playing(opts: { ramp?: boolean } = {}) {
    getActiveTab.mockResolvedValue("beat");
    return renderHook(() =>
      useTabRouting({ isPlaying: true, speedRampActive: !!opts.ramp }),
    );
  }

  it("opens and closes over a playing mode without stopping anything", async () => {
    const { result } = playing({ ramp: true });
    await waitFor(() => expect(getActiveTab).toHaveBeenCalled());
    act(() => result.current.setView("jam"));
    setPlaying.mockClear();
    stopSpeedRamp.mockClear();

    act(() => result.current.setView("settings"));
    expect(result.current.view).toBe("settings");
    // The mode under Settings is still the jam: the band stays on.
    expect(result.current.mode).toBe("jam");
    expect(result.current.prevTab.current).toBe("jam");

    act(() => result.current.setView(result.current.prevTab.current));
    expect(result.current.view).toBe("jam");
    expect(setPlaying).not.toHaveBeenCalled();
    expect(stopSpeedRamp).not.toHaveBeenCalled();
  });

  it("keeps a drill's climb going under Settings", async () => {
    const { result } = playing({ ramp: true });
    await waitFor(() => expect(getActiveTab).toHaveBeenCalled());
    act(() => result.current.setView("drill"));
    stopSpeedRamp.mockClear();
    act(() => result.current.setView("settings"));
    expect(stopSpeedRamp).not.toHaveBeenCalled();
    expect(result.current.mode).toBe("drill");
  });

  it("stops playback when Settings is left for a DIFFERENT mode, as a direct switch does", async () => {
    const { result } = playing();
    await waitFor(() => expect(getActiveTab).toHaveBeenCalled());
    act(() => result.current.setView("jam"));
    act(() => result.current.setView("settings"));
    setPlaying.mockClear();
    act(() => result.current.setView("beat"));
    expect(setPlaying).toHaveBeenCalledWith(false);
    expect(result.current.mode).toBe("beat");
  });

  it("remembers the covered mode whichever door opened Settings", async () => {
    // Three doors (the audio-error link, the wizard's theme link, the voice
    // prompt) called `setView("settings")` without recording anything, so
    // closing Settings went back to a stale mode. The routing records it now.
    const { result } = playing();
    await waitFor(() => expect(getActiveTab).toHaveBeenCalled());
    act(() => result.current.setView("setlist"));
    act(() => result.current.setView("settings"));
    act(() => result.current.setView("settings"));
    expect(result.current.prevTab.current).toBe("setlist");
    act(() => result.current.setView(result.current.prevTab.current));
    expect(result.current.view).toBe("setlist");
  });

  it("never persists Settings as the tab to reopen on", async () => {
    const { result } = playing();
    await waitFor(() => expect(getActiveTab).toHaveBeenCalled());
    act(() => result.current.setView("jam"));
    setActiveTab.mockClear();
    act(() => result.current.setView("settings"));
    expect(setActiveTab).not.toHaveBeenCalled();
  });
});
