// The play key on the Songs tab.
//
// Songs shipped with a Play button, a "Space" hint beside it, and a play key
// that did nothing: the dispatcher's `play` action is a chain of branches, one
// per view, and nobody added one for `songs`. The comment on the `beat` branch
// had already named it — "the shape of bug a new `view` value quietly
// introduces" — a view before it happened again. The owner, 2026-09-21: "space
// not working for play pause is by far the most annoying thing ever".
//
// So this pins both halves: with a song on the stage the key is the button,
// and with an empty stage it starts nothing (the setlist's and the jam's rule:
// the play key must not start a bare click behind an empty screen).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useActionDispatcher, type ViewName } from "./useActionDispatcher";
import { togglePlayback } from "../ipc";
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

const NOTHING = vi.fn();

function mount(view: ViewName, songsLoaded: boolean) {
  const { result } = renderHook(() =>
    useActionDispatcher({
      view,
      setView: vi.fn(),
      prevTab: { current: "beat" },
      setlistLoaded: false,
      jamLoaded: false,
      jamEditorOpen: false,
      onToggleJam: vi.fn(),
      jamActions: {
        nextGroove: NOTHING,
        prevGroove: NOTHING,
        toggleTrade: NOTHING,
        toggleDropOut: NOTHING,
        nextShape: NOTHING,
        nextSection: NOTHING,
        prevSection: NOTHING,
        loopSection: NOTHING,
        toggleTakes: NOTHING,
        toggleCamera: NOTHING,
      },
      songsLoaded,
      songsActions: {
        loopStartsHere: NOTHING,
        loopEndsHere: NOTHING,
        toggleLoop: NOTHING,
        clearSelection: NOTHING,
        nudge: NOTHING,
        toggleTakes: NOTHING,
        toggleCamera: NOTHING,
      },
      state: STATE,
      isFullscreen: false,
      setIsFullscreen: vi.fn(),
      setIsOsFullscreen: vi.fn(),
      setSidebarOpen: vi.fn(),
      toggleCard: vi.fn(),
      forceWebviewFocus: () => Promise.resolve(),
    }),
  );
  return result.current;
}

describe("the play key on the Songs tab", () => {
  beforeEach(() => {
    vi.mocked(togglePlayback).mockClear();
  });

  it("plays and stops the song, as the button beside the hint does", () => {
    const dispatch = mount("songs", true);
    dispatch("play");
    expect(togglePlayback, "the play key did nothing on the Songs tab").toHaveBeenCalledTimes(1);
  });

  it("starts nothing when there is no song on the stage", () => {
    const dispatch = mount("songs", false);
    dispatch("play");
    expect(togglePlayback).not.toHaveBeenCalled();
  });
});
