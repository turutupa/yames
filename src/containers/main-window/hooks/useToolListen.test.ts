/**
 * Listen's state table (DESIGN 7), row by row.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LISTEN_IDLE_MS, useToolListen, type ListenCoach } from "./useToolListen";

/**
 * A coach session that does what `useSession` does with its active flag:
 * `active` once the start or end has run, `isActive()` as of the calls made
 * (an end queued already reads as not active; review of c2a2, finding 5).
 */
function fakeCoach() {
  let active = false;
  let asked = false;
  const coach = {
    get active() {
      return active;
    },
    isActive: () => asked,
    /** What a start or an end does at the moment it is called. */
    ask(on: boolean) {
      asked = on;
    },
    startSession: vi.fn(async () => {
      asked = true;
      active = true;
    }),
    endSession: vi.fn(async () => {
      asked = false;
      active = false;
    }),
  };
  return coach;
}

type Props = { view: string; isPlaying: boolean; coach: ListenCoach; sessionRunning?: boolean };

function setup(view = "beat") {
  const coach = fakeCoach();
  const hook = renderHook((p: Props) => useToolListen(p), {
    initialProps: { view, isPlaying: false, coach: { ...snapshot(coach) } },
  });
  const rerender = (patch: Partial<Props> = {}) =>
    hook.rerender({ view, isPlaying: false, coach: snapshot(coach), ...patch });
  return { coach, hook, rerender };
}

/** What `useSession` hands over on a render: `active` as of that render. */
function snapshot(coach: ReturnType<typeof fakeCoach>): ListenCoach {
  return {
    active: coach.active,
    isActive: coach.isActive,
    startSession: coach.startSession,
    endSession: coach.endSession,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Listen", () => {
  it("is off until the player turns it on, and Play alone starts nothing", () => {
    const { coach, hook, rerender } = setup();
    expect(hook.result.current.on).toBe(false);
    rerender({ isPlaying: true });
    rerender({ isPlaying: false });
    expect(coach.startSession).not.toHaveBeenCalled();
  });

  it("turned on starts the session once; turned off ends it once", async () => {
    const { coach, hook, rerender } = setup();
    await act(async () => hook.result.current.toggle());
    rerender();
    expect(hook.result.current.on).toBe(true);
    expect(coach.startSession).toHaveBeenCalledTimes(1);
    // Play, Stop, Play: one session spans them.
    rerender({ isPlaying: true });
    rerender({ isPlaying: false });
    rerender({ isPlaying: true });
    expect(coach.startSession).toHaveBeenCalledTimes(1);
    expect(coach.endSession).not.toHaveBeenCalled();
    await act(async () => hook.result.current.toggle());
    rerender();
    expect(hook.result.current.on).toBe(false);
    expect(coach.endSession).toHaveBeenCalledTimes(1);
  });

  it("stays on between the tools, over Settings and through a Path Session", async () => {
    const { coach, hook, rerender } = setup();
    await act(async () => hook.result.current.toggle());
    for (const view of ["drill", "setlist", "jam", "tools", "settings", "session", "beat"]) rerender({ view });
    expect(coach.endSession).not.toHaveBeenCalled();
    expect(hook.result.current.on).toBe(true);
  });

  it("ends when the player leaves the tools", async () => {
    for (const away of ["today", "paths", "progress", "songs"]) {
      const { coach, hook, rerender } = setup();
      await act(async () => hook.result.current.toggle());
      rerender({ view: away });
      expect(coach.endSession).toHaveBeenCalledTimes(1);
      expect(hook.result.current.on).toBe(false);
    }
  });

  it("ends after ten idle minutes, and never while the click plays", async () => {
    const { coach, hook, rerender } = setup();
    await act(async () => hook.result.current.toggle());
    rerender({ isPlaying: true });
    act(() => {
      vi.advanceTimersByTime(LISTEN_IDLE_MS * 2);
    });
    expect(coach.endSession).not.toHaveBeenCalled();
    rerender({ isPlaying: false });
    act(() => {
      vi.advanceTimersByTime(LISTEN_IDLE_MS - 1000);
    });
    expect(coach.endSession).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(coach.endSession).toHaveBeenCalledTimes(1);
    rerender();
    expect(hook.result.current.on).toBe(false);
  });

  it("does not end a Path Session's use of it while idle", async () => {
    const { coach, hook, rerender } = setup();
    await act(async () => hook.result.current.toggle());
    rerender({ view: "session" });
    act(() => {
      vi.advanceTimersByTime(LISTEN_IDLE_MS * 2);
    });
    expect(coach.endSession).not.toHaveBeenCalled();
  });

  it("does not end it from Settings while a Path Session is still running under it", async () => {
    const { coach, hook, rerender } = setup();
    await act(async () => hook.result.current.toggle());
    // Listen on, a Path Session starts and rides it, then Settings over it.
    rerender({ view: "session", sessionRunning: true });
    rerender({ view: "settings", sessionRunning: true });
    act(() => {
      vi.advanceTimersByTime(LISTEN_IDLE_MS * 2);
    });
    expect(coach.endSession).not.toHaveBeenCalled();
    expect(hook.result.current.on).toBe(true);
    // The Session over, Settings still open: the ordinary ten minutes again.
    rerender({ view: "settings", sessionRunning: false });
    act(() => {
      vi.advanceTimersByTime(LISTEN_IDLE_MS);
    });
    expect(coach.endSession).toHaveBeenCalledTimes(1);
  });

  it("claims only a session its own press started: Listen off leaves someone else's alone", async () => {
    const { coach, hook, rerender } = setup();
    // A coach session someone else started is running when Listen is pressed.
    await act(async () => coach.startSession());
    coach.startSession.mockClear();
    rerender();
    await act(async () => hook.result.current.toggle());
    rerender();
    expect(hook.result.current.on).toBe(true);
    expect(coach.startSession).not.toHaveBeenCalled();
    await act(async () => hook.result.current.toggle());
    rerender();
    expect(hook.result.current.on).toBe(false);
    expect(coach.endSession).not.toHaveBeenCalled();
    expect(coach.isActive()).toBe(true);
  });

  it("off then on again at once: the new session is its own, though the old one is still ending", async () => {
    const coach = fakeCoach();
    let finishEnd: () => void = () => {};
    coach.endSession.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          coach.ask(false);
          finishEnd = () => {
            coach.endSession.mockClear();
            resolve();
          };
        }),
    );
    const hook = renderHook((p: Props) => useToolListen(p), {
      initialProps: { view: "beat", isPlaying: false, coach: snapshot(coach) },
    });
    await act(async () => hook.result.current.toggle());
    hook.rerender({ view: "beat", isPlaying: false, coach: snapshot(coach) });
    act(() => hook.result.current.toggle()); // off: the end is queued, not yet run
    act(() => hook.result.current.toggle()); // on again before it has run
    expect(coach.startSession).toHaveBeenCalledTimes(2);
    await act(async () => finishEnd());
    act(() => hook.result.current.toggle()); // and off: this one is ended too
    expect(coach.endSession).toHaveBeenCalledTimes(1);
  });

  it("never ends a session it did not start", () => {
    const { coach, rerender } = setup();
    // A Path Session's own coach session, still ending as the player arrives.
    void coach.startSession();
    rerender({ view: "today" });
    act(() => {
      vi.advanceTimersByTime(LISTEN_IDLE_MS * 2);
    });
    expect(coach.endSession).not.toHaveBeenCalled();
  });
});
