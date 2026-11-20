/**
 * `isActive()` answers as of the calls made, not as of the queue's progress
 * (review of leg c2a2, finding 5).
 *
 * The race it closes: Listen on (its start awaits the input), the player
 * leaves the tools at once (Listen's end is queued behind the start), and
 * presses Today's Start before the end has run. The Session's `begin` asks
 * `isActive()`; it used to read `activeRef`, still true, and take the ending
 * session as the player's: it started no coach session of its own and played
 * with the input off and no history row. An end queued is an end.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSession } from "./useSession";
import { __resetCoachLoaderForTests } from "./coachLoader";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

function setup() {
  let openInput: () => void = () => {};
  const setListening = vi.fn(
    (on: boolean) =>
      new Promise<void>((resolve) => {
        if (on) openInput = resolve;
        else resolve();
      }),
  );
  const evaluation = {
    enabled: false,
    toggle: vi.fn(),
    setListening,
    selectedDevice: null,
  } as unknown as Evaluation;
  const hook = renderHook(() =>
    useSession({ evaluation, isPlaying: false, bpm: 120, timeSignature: 4, brainTier: "off", setBpm: vi.fn() }),
  );
  return { hook, setListening, openInput: () => openInput() };
}

/** Let the lifecycle queue run as far as it can without the input answering. */
async function settle() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("isActive(), as of the calls made", () => {
  beforeEach(() => __resetCoachLoaderForTests());
  afterEach(() => __resetCoachLoaderForTests());

  it("is false the moment an end is queued, though the start before it has not finished", async () => {
    const { hook, setListening, openInput } = setup();
    let start!: Promise<void>;
    act(() => {
      start = hook.result.current.startSession();
    });
    expect(hook.result.current.isActive()).toBe(true);
    await settle();
    // The start is waiting on the input; the session is already active.
    expect(setListening).toHaveBeenCalledWith(true);
    let end!: Promise<void>;
    act(() => {
      end = hook.result.current.endSession();
    });
    // What a Path Session's `begin` would read here: not someone's to ride.
    expect(hook.result.current.isActive()).toBe(false);
    openInput();
    await act(async () => {
      await start;
      await end;
    });
    expect(hook.result.current.isActive()).toBe(false);
    expect(hook.result.current.active).toBe(false);
  });

  it("is true again when a start is queued behind that end, and false once all has run and ended", async () => {
    const { hook, openInput } = setup();
    let first!: Promise<void>;
    act(() => {
      first = hook.result.current.startSession();
    });
    await settle();
    let end!: Promise<void>;
    let again!: Promise<void>;
    act(() => {
      end = hook.result.current.endSession();
      again = hook.result.current.startSession();
    });
    expect(hook.result.current.isActive()).toBe(true);
    openInput();
    await settle();
    openInput();
    await act(async () => {
      await first;
      await end;
      await again;
    });
    expect(hook.result.current.isActive()).toBe(true);
    await act(async () => {
      await hook.result.current.endSession();
    });
    expect(hook.result.current.isActive()).toBe(false);
  });
});
