/**
 * useSession — the debounced coach boundary for meter changes.
 *
 * Two things are locked in here:
 *
 *  1. A burst of meter changes produces ONE boundary. MeterPresets,
 *     FloatingWidget, FullscreenView and useActionDispatcher used to call
 *     `notifySettingsChange()` directly on every click, which closed the
 *     practice segment once per click, ahead of (and in addition to) this
 *     debounce. They no longer do; this hook owns the boundary.
 *
 *  2. A VARIANT switch is a boundary. 7/8 `[3,2,2]` → `[2,3,2]` keeps
 *     `timeSignature` at 7, so watching the total alone saw nothing.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useSession } from "./useSession";
import { mockInvoke } from "../test/mocks";

type Evaluation = Parameters<typeof useSession>[0]["evaluation"];

const evaluation = {
  enabled: true,
  toggle: vi.fn(),
  selectedDevice: null,
} as unknown as Evaluation;

function boundaryCalls() {
  return mockInvoke.mock.calls.filter(([cmd]) => cmd === "notify_settings_change").length;
}

function renderSession(beatGroups: number[], timeSignature: number) {
  return renderHook(
    (props: { beatGroups: number[]; timeSignature: number }) =>
      useSession({
        evaluation,
        isPlaying: true,
        bpm: 120,
        timeSignature: props.timeSignature,
        beatGroups: props.beatGroups,
        setBpm: vi.fn(),
      }),
    { initialProps: { beatGroups, timeSignature } },
  );
}

/** Start the session and settle the initial effects. */
async function start(result: { current: ReturnType<typeof useSession> }) {
  await act(async () => {
    await result.current.startSession();
  });
  await waitFor(() => expect(result.current.active).toBe(true));
  // Flush the debounce armed by the session-start effects, then clear
  // the call log so the assertions only see meter-driven boundaries.
  await act(async () => {
    vi.advanceTimersByTime(2000);
  });
  mockInvoke.mockClear();
}

describe("useSession meter boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("collapses two rapid meter changes into ONE boundary", async () => {
    const { result, rerender } = renderSession([4], 4);
    await start(result);

    // Two clicks inside the 600ms debounce window.
    rerender({ beatGroups: [3], timeSignature: 3 });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    rerender({ beatGroups: [3, 2], timeSignature: 5 });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(boundaryCalls()).toBe(1);
  });

  it("fires a boundary for a variant switch that keeps the same total", async () => {
    const { result, rerender } = renderSession([3, 2, 2], 7);
    await start(result);

    // Same seven beats, different accent grouping — invisible to
    // `timeSignature`, audible to the player.
    rerender({ beatGroups: [2, 3, 2], timeSignature: 7 });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(boundaryCalls()).toBe(1);
  });

  it("does not fire a boundary when nothing changed", async () => {
    const { result, rerender } = renderSession([3, 2, 2], 7);
    await start(result);

    // A fresh array with identical contents — every `state-changed`
    // event delivers one of these. The key, not the reference, decides.
    rerender({ beatGroups: [3, 2, 2], timeSignature: 7 });
    await act(async () => {
      vi.advanceTimersByTime(1500);
    });

    expect(boundaryCalls()).toBe(0);
  });
});
