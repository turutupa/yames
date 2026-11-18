/**
 * The Session's keys reach the Session's CURRENT actions.
 *
 * Acceptance P0-2 (2026-11-18): the dispatcher's callback did not list
 * `sessionActions` among its dependencies, so it kept the `go()` from the
 * moment the Session view opened, before the Take was prepared. Space, Enter
 * and the pedal then did nothing on a ready Take or a result, while a click on
 * the same button worked.
 */
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { DEFAULT_TEST_STATE } from "../test/mocks";
import type { AppState } from "../types";
import { useActionDispatcher } from "./useActionDispatcher";

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    isFullscreen: () => Promise.resolve(false),
    setFullscreen: () => Promise.resolve(),
    setAlwaysOnTop: () => Promise.resolve(),
    setFocus: () => Promise.resolve(),
  }),
}));

function actions() {
  return {
    startToday: vi.fn(),
    go: vi.fn(),
    slower: vi.fn(),
    faster: vi.fn(),
    next: vi.fn(),
    pedalPress: vi.fn(),
    exit: vi.fn(),
    cycleView: vi.fn(),
    togglePause: vi.fn(),
    restart: vi.fn(),
  };
}

// Everything but the Session's actions stays the same object across renders,
// as it does in the app, so only `sessionActions` can rebuild the callback.
const STABLE = {
  setView: () => {},
  prevTab: { current: "beat" } as never,
  onToggleJam: () => {},
  setIsFullscreen: () => {},
  setIsOsFullscreen: () => {},
  setSidebarOpen: (() => {}) as never,
  toggleCard: () => {},
  forceWebviewFocus: () => Promise.resolve(),
  state: DEFAULT_TEST_STATE as AppState,
};

describe("the Session's keys", () => {
  it("call the actions the Session has now, not the ones it opened with", () => {
    const first = actions();
    const later = actions();
    const { result, rerender } = renderHook(
      ({ sessionActions }) =>
        useActionDispatcher({
          ...STABLE,
          view: "session",
          setlistLoaded: false,
          jamLoaded: false,
          jamEditorOpen: false,
          jamActions: undefined as never,
          songsLoaded: false,
          songsActions: undefined as never,
          sessionActions: sessionActions as never,
          isFullscreen: false,
        }),
      { initialProps: { sessionActions: first } },
    );

    // The Take is prepared: the Session hands the dispatcher new actions.
    rerender({ sessionActions: later });

    result.current("session-go");
    result.current("play");
    result.current("session-pedal");

    expect(later.go).toHaveBeenCalledTimes(2);
    expect(later.pedalPress).toHaveBeenCalledTimes(1);
    expect(first.go).not.toHaveBeenCalled();
    expect(first.pedalPress).not.toHaveBeenCalled();
  });
});
