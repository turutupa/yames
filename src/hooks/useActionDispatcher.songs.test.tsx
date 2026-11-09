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

/** The Songs actions, each with its own spy, so a dead one is visible. */
function songsSpies() {
  return {
    loopStartsHere: vi.fn(),
    loopEndsHere: vi.fn(),
    toggleLoop: vi.fn(),
    clearSelection: vi.fn(),
    nudge: vi.fn(),
    toggleTakes: vi.fn(),
    toggleCamera: vi.fn(),
  };
}

/** The hook itself, for a test that needs to re-render it. */
function useDispatcher(
  view: ViewName,
  songsLoaded: boolean,
  songsActions: ReturnType<typeof songsSpies>,
) {
  return useActionDispatcher({
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
    songsActions,
    state: STATE,
    isFullscreen: false,
    setIsFullscreen: vi.fn(),
    setIsOsFullscreen: vi.fn(),
    setSidebarOpen: vi.fn(),
    toggleCard: vi.fn(),
    forceWebviewFocus: () => Promise.resolve(),
  });
}

/** One dispatch, with the Songs actions spied on. */
function mountWith(
  view: ViewName,
  songsLoaded: boolean,
  songsActions: ReturnType<typeof songsSpies>,
) {
  const { result } = renderHook(() => useDispatcher(view, songsLoaded, songsActions));
  return result.current;
}

function mount(view: ViewName, songsLoaded: boolean) {
  return mountWith(view, songsLoaded, songsSpies());
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

  /**
   * And it notices the song arriving, which is the half that was still
   * broken (W34 item 3).
   *
   * The branch for the Songs tab landed on 2026-09-21 and the key still did
   * nothing, because this callback was memoised on `view` and a song is
   * loaded WITHOUT the view changing: you are already on the Songs tab and
   * you click a row in the library. The dispatcher went on holding the
   * `songsLoaded: false` it was born with, for ever — unless you happened to
   * switch tabs and come back, which is the reason it read as "sometimes it
   * works" rather than as a dead key.
   *
   * So the tab stays exactly where it is here, and only the song arrives.
   */
  it("plays once the song arrives, without the tab having changed", () => {
    const spies = songsSpies();
    const { result, rerender } = renderHook(
      ({ loaded }: { loaded: boolean }) => useDispatcher("songs", loaded, spies),
      { initialProps: { loaded: false } },
    );
    result.current("play");
    expect(togglePlayback).not.toHaveBeenCalled();

    rerender({ loaded: true });
    result.current("play");
    expect(
      togglePlayback,
      "the play key did not notice the song being opened on the tab it was already on",
    ).toHaveBeenCalledTimes(1);
  });

  it("wakes the portion keys up with it", () => {
    const spies = songsSpies();
    const { result, rerender } = renderHook(
      ({ loaded }: { loaded: boolean }) => useDispatcher("songs", loaded, spies),
      { initialProps: { loaded: false } },
    );
    result.current("songs-loop");
    expect(spies.toggleLoop).not.toHaveBeenCalled();
    rerender({ loaded: true });
    result.current("songs-loop");
    expect(spies.toggleLoop, "the portion keys stayed asleep").toHaveBeenCalledTimes(1);
  });

  /**
   * The caret stays on the tab (W34 item 3).
   *
   * The Songs tab is `role="application"` — a page of music you arrive on,
   * move a bar at a time with the arrows and press Esc on. The dispatcher
   * drops the caret before an app-wide action so that a focused control does
   * not ALSO take the key, and that took the arrow keys away the moment
   * anybody pressed Space: play the song, reach for the arrows, nothing.
   */
  it("leaves the tab holding the keyboard after the play key", () => {
    const tab = document.createElement("div");
    tab.setAttribute("role", "application");
    tab.tabIndex = 0;
    document.body.appendChild(tab);
    tab.focus();
    expect(document.activeElement).toBe(tab);

    mount("songs", true)("play");
    expect(
      document.activeElement,
      "pressing play took the caret off the tab, so the arrow keys stopped working",
    ).toBe(tab);
    tab.remove();
  });

  it("still drops the caret off an ordinary control", () => {
    const button = document.createElement("button");
    document.body.appendChild(button);
    button.focus();
    mount("songs", true)("play");
    expect(document.activeElement).not.toBe(button);
    button.remove();
  });
});

/**
 * And the rest of the keys on the Songs screen (W34 item 3).
 *
 * The brief's list, each asked the same two questions: does it reach its
 * action with a song on the stage, and does it stay quiet without one and on
 * every other tab. `[` and `]` are the metronome's subdivision everywhere
 * else and a key that quietly re-looped a song you are not looking at would
 * be worse than one that did nothing.
 */
describe("the portion keys on the Songs tab", () => {
  const CASES: [string, keyof ReturnType<typeof songsSpies>, unknown[]][] = [
    ["songs-loop-start", "loopStartsHere", []],
    ["songs-loop-end", "loopEndsHere", []],
    ["songs-loop", "toggleLoop", []],
    ["songs-loop-clear", "clearSelection", []],
    ["songs-loop-earlier", "nudge", [-1]],
    ["songs-loop-later", "nudge", [1]],
    ["songs-take", "toggleTakes", []],
    ["songs-camera", "toggleCamera", []],
  ];

  for (const [action, handler, args] of CASES) {
    it(`${action} reaches ${handler} once, with a song on the stage`, () => {
      const spies = songsSpies();
      mountWith("songs", true, spies)(action as Parameters<ReturnType<typeof mount>>[0]);
      expect(spies[handler], `${action} is dead`).toHaveBeenCalledTimes(1);
      if (args.length > 0) expect(spies[handler]).toHaveBeenCalledWith(...args);
      // And nothing else moved: a key that does two things is the other half
      // of the same complaint.
      for (const [name, spy] of Object.entries(spies)) {
        if (name === handler) continue;
        expect(spy, `${action} also fired ${name}`).not.toHaveBeenCalled();
      }
      // The transport is not one of them either.
      expect(togglePlayback).not.toHaveBeenCalled();
    });

    it(`${action} does nothing with an empty stage or on another tab`, () => {
      const empty = songsSpies();
      mountWith("songs", false, empty)(action as Parameters<ReturnType<typeof mount>>[0]);
      const elsewhere = songsSpies();
      mountWith("beat", true, elsewhere)(action as Parameters<ReturnType<typeof mount>>[0]);
      for (const spy of [...Object.values(empty), ...Object.values(elsewhere)]) {
        expect(spy).not.toHaveBeenCalled();
      }
    });
  }
});
