// The hands-free jam actions (JAM_MODE §4.7).
//
// These exist for a footswitch, which means they arrive with no context: the
// same MIDI message reaches the dispatcher whatever tab is open. So the two
// things worth pinning are that they do what they say ON the jam tab, and that
// they do NOTHING anywhere else — a stomp on the metronome tab must not
// silently change a jam you are not looking at.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useActionDispatcher, type ViewName } from "./useActionDispatcher";
import { setBeatGroups, setSubdivision } from "../ipc";
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

beforeEach(() => {
  vi.mocked(setBeatGroups).mockClear();
  vi.mocked(setSubdivision).mockClear();
});

function mount(view: ViewName, jamLoaded = true, jamEditorOpen = false) {
  const jamActions = {
    nextGroove: vi.fn(),
    prevGroove: vi.fn(),
    toggleTrade: vi.fn(),
    toggleDropOut: vi.fn(),
    nextShape: vi.fn(),
    nextSection: vi.fn(),
    prevSection: vi.fn(),
    loopSection: vi.fn(),
  };
  const { result } = renderHook(() =>
    useActionDispatcher({
      view,
      setView: vi.fn(),
      prevTab: { current: "beat" },
      setlistLoaded: false,
      jamLoaded,
      jamEditorOpen,
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
    dispatch("jam-next-section");
    dispatch("jam-prev-section");
    dispatch("jam-loop-section");
    expect(jamActions.nextGroove).toHaveBeenCalledTimes(1);
    expect(jamActions.prevGroove).toHaveBeenCalledTimes(1);
    expect(jamActions.toggleTrade).toHaveBeenCalledTimes(1);
    expect(jamActions.toggleDropOut).toHaveBeenCalledTimes(1);
    expect(jamActions.nextShape).toHaveBeenCalledTimes(1);
    expect(jamActions.nextSection).toHaveBeenCalledTimes(1);
    expect(jamActions.prevSection).toHaveBeenCalledTimes(1);
    expect(jamActions.loopSection).toHaveBeenCalledTimes(1);
  });

  it("does nothing on another tab", () => {
    for (const view of ["beat", "drill", "setlist"] as ViewName[]) {
      const { dispatch, jamActions } = mount(view);
      dispatch("jam-next-groove");
      dispatch("jam-trade");
      dispatch("jam-loop-section");
      expect(jamActions.nextGroove, view).not.toHaveBeenCalled();
      expect(jamActions.toggleTrade, view).not.toHaveBeenCalled();
      expect(jamActions.loopSection, view).not.toHaveBeenCalled();
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

  it("stands aside while the groove editor is open", () => {
    // The drawer is a grid you draw on, and `G` — the same stomp that steps
    // the groove on stage — throws the drawn pattern away to go back to a
    // preset. Nothing reachable by accident may delete work in progress.
    const { dispatch, jamActions } = mount("jam", true, true);
    dispatch("jam-next-groove");
    dispatch("jam-prev-groove");
    dispatch("jam-trade");
    dispatch("jam-dropout");
    dispatch("jam-next-shape");
    dispatch("jam-next-section");
    dispatch("jam-loop-section");
    expect(jamActions.nextGroove).not.toHaveBeenCalled();
    expect(jamActions.prevGroove).not.toHaveBeenCalled();
    expect(jamActions.toggleTrade).not.toHaveBeenCalled();
    expect(jamActions.toggleDropOut).not.toHaveBeenCalled();
    expect(jamActions.nextShape).not.toHaveBeenCalled();
    expect(jamActions.nextSection).not.toHaveBeenCalled();
    expect(jamActions.loopSection).not.toHaveBeenCalled();
  });
});

/**
 * The meter keys, on a jam.
 *
 * A jam is a meter plus a table, and the engine refuses the table when the two
 * disagree — silently, because the plain click is a perfectly good sound. So
 * these keys, which are right on the metronome tab, take the band away here
 * and leave the screen animating a groove nobody can hear. The groove owns the
 * meter on this tab.
 */
describe("the meter keys on the jam tab", () => {
  const METER_KEYS = [
    "sub-next",
    "sub-prev",
    "sub-1",
    "sub-2",
    "sub-3",
    "sub-4",
    "sig-next",
    "sig-prev",
  ] as const;

  it("does not move the grid under a loaded jam", () => {
    const { dispatch } = mount("jam");
    for (const key of METER_KEYS) dispatch(key);
    expect(setSubdivision).not.toHaveBeenCalled();
    expect(setBeatGroups).not.toHaveBeenCalled();
  });

  it("still works on the metronome tab", () => {
    // The guard is about the jam, not about the keys: nothing changes for
    // anybody who never opens the tab.
    const { dispatch } = mount("beat");
    dispatch("sub-3");
    dispatch("sig-next");
    expect(setSubdivision).toHaveBeenCalledWith(3);
    expect(setBeatGroups).toHaveBeenCalledTimes(1);
  });

  it("still works on the jam tab with nothing loaded", () => {
    // An empty stage is the metronome with a different screen in front of it.
    const { dispatch } = mount("jam", false);
    dispatch("sub-2");
    expect(setSubdivision).toHaveBeenCalledWith(2);
  });
});
