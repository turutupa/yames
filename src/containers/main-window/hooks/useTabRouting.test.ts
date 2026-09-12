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
import { renderHook, waitFor } from "@testing-library/react";
import { PLAY_TABS, useTabRouting } from "./useTabRouting";

const getActiveTab = vi.fn();
const setActiveTab = vi.fn();

vi.mock("../../../ipc", () => ({
  getActiveTab: (...args: unknown[]) => getActiveTab(...args),
  setActiveTab: (...args: unknown[]) => setActiveTab(...args),
  setPlaying: vi.fn(),
  stopSpeedRamp: vi.fn(),
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
