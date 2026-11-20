/**
 * Listen's state table (DESIGN 7), row by row.
 */
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LISTEN_IDLE_MS, useToolListen, type ListenCoach } from "./useToolListen";

/** A coach session that does what `useSession` does with its active flag. */
function fakeCoach() {
  let active = false;
  const coach = {
    get active() {
      return active;
    },
    isActive: () => active,
    startSession: vi.fn(async () => {
      active = true;
    }),
    endSession: vi.fn(async () => {
      active = false;
    }),
  };
  return coach;
}

type Props = { view: string; isPlaying: boolean; coach: ListenCoach };

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
