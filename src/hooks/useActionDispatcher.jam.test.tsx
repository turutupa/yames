// The hands-free jam actions (JAM_MODE §4.7).
//
// These exist for a footswitch, which means they arrive with no context: the
// same MIDI message reaches the dispatcher whatever tab is open. So the two
// things worth pinning are that they do what they say ON the jam tab, and that
// they do NOTHING anywhere else — a stomp on the metronome tab must not
// silently change a jam you are not looking at.
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useActionDispatcher, type ViewName } from "./useActionDispatcher";
import type { AppState } from "../types";

vi.mock("../ipc", () => ({
  setBeatGroups: vi.fn(),
  setBpm: vi.fn(),
  setSubdivision: vi.fn(),
  showFloating: vi.fn(),
  startSpeedRamp: vi.fn(),
  stopSpeedRamp: vi.fn(),
  togglePlayback: vi.fn(),
}));

vi.mock("../containers/onboarding/hints/hintRuntime", () => ({
  markWidgetOpened: vi.fn(),
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => Promise.resolve(false),
    setFullscreen: () => Promise.resolve(),
    setAlwaysOnTop: () => Promise.resolve(),
    setFocus: () => Promise.resolve(),
  }),
}));

const STATE = {
  bpm: 100,
  subdivision: 1,
  beatGroups: [4],
  freeMode: false,
  isPlaying: false,
  alwaysOnTop: false,
} as unknown as AppState;

function mount(view: ViewName, jamLoaded = true) {
  const jamActions = {
    nextGroove: vi.fn(),
    prevGroove: vi.fn(),
    toggleTrade: vi.fn(),
    toggleDropOut: vi.fn(),
    nextShape: vi.fn(),
  };
  const { result } = renderHook(() =>
    useActionDispatcher({
      view,
      setView: vi.fn(),
      prevTab: { current: "beat" },
      setlistLoaded: false,
      jamLoaded,
      onToggleJam: vi.fn(),
      jamActions,
      state: STATE,
      isFullscreen: false,
      setIsFullscreen: vi.fn(),
      setIsOsFullscreen: vi.fn(),
      setSidebarOpen: vi.fn(),
      toggleCard: vi.fn(),
      forceWebviewFocus: () => Promise.resolve(),
    }),
  );
  return { dispatch: result.current, jamActions };
}

describe("the hands-free jam actions", () => {
  it("sends each one where it belongs", () => {
    const { dispatch, jamActions } = mount("jam");
    dispatch("jam-next-groove");
    dispatch("jam-prev-groove");
    dispatch("jam-trade");
    dispatch("jam-dropout");
    dispatch("jam-next-shape");
    expect(jamActions.nextGroove).toHaveBeenCalledTimes(1);
    expect(jamActions.prevGroove).toHaveBeenCalledTimes(1);
    expect(jamActions.toggleTrade).toHaveBeenCalledTimes(1);
    expect(jamActions.toggleDropOut).toHaveBeenCalledTimes(1);
    expect(jamActions.nextShape).toHaveBeenCalledTimes(1);
  });

  it("does nothing on another tab", () => {
    for (const view of ["beat", "drill", "setlist"] as ViewName[]) {
      const { dispatch, jamActions } = mount(view);
      dispatch("jam-next-groove");
      dispatch("jam-trade");
      expect(jamActions.nextGroove, view).not.toHaveBeenCalled();
      expect(jamActions.toggleTrade, view).not.toHaveBeenCalled();
    }
  });

  it("does nothing on the jam tab with no jam loaded", () => {
    // The tab can be opened cold. A footswitch pressed in front of the empty
    // state has nothing to change.
    const { dispatch, jamActions } = mount("jam", false);
    dispatch("jam-next-groove");
    dispatch("jam-next-shape");
    expect(jamActions.nextGroove).not.toHaveBeenCalled();
    expect(jamActions.nextShape).not.toHaveBeenCalled();
  });

  it("does nothing while Settings is open", () => {
    // Settings has a key-capture field in it: everything but the universal
    // actions stands aside there, and these are not universal.
    const { dispatch, jamActions } = mount("settings");
    dispatch("jam-trade");
    expect(jamActions.toggleTrade).not.toHaveBeenCalled();
  });
});
