// What the phone does when the system interrupts it.
//
// The emulator cannot deliver audio focus to another app — there is nothing
// else on it that plays anything — so the behaviour the M04 brief cares about
// (pause on a call, resume when it ends, stop for good when another app takes
// over playback) is pinned here instead of on a device. The Kotlin side's only
// job is to name which of the three happened; everything below that name is
// this hook, and this is where it is tested.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockChannels, mockInvoke } from "../../../test/mocks";
import type { NativeEvent } from "../../../mobile/native";
import { resetBackStack, useBackDismiss } from "../../../mobile/backStack";
import { useAndroidNative } from "./useAndroidNative";

/** Deliver one Android-side event through the channel the hook opened. */
function fromAndroid(event: NativeEvent) {
  const channel = mockChannels.at(-1);
  if (!channel) throw new Error("the hook never opened an event channel");
  act(() => {
    channel.onmessage?.(event);
  });
}

/** Every `set_playing` the hook asked for, in order. */
function playingCalls() {
  return mockInvoke.mock.calls
    .filter(([cmd]) => cmd === "set_playing")
    .map(([, args]) => (args as { playing: boolean }).playing);
}

function mount(isPlaying: boolean) {
  return renderHook(
    ({ playing }: { playing: boolean }) =>
      useAndroidNative({ isPlaying: playing, bpm: 120, keepScreenOn: playing }),
    { initialProps: { playing: isPlaying } },
  );
}

describe("the phone's native half", () => {
  beforeEach(() => {
    mockInvoke.mockClear();
    mockChannels.length = 0;
    resetBackStack();
  });

  it("starts the foreground service when playback starts, and stops it when it stops", async () => {
    const view = mount(false);
    await act(async () => {});
    const started = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === "plugin:yames-mobile|set_background_audio",
    );
    expect(started).toHaveLength(1);
    expect((started[0][1] as { payload: { active: boolean } }).payload.active).toBe(false);

    mockInvoke.mockClear();
    view.rerender({ playing: true });
    await act(async () => {});
    const payload = mockInvoke.mock.calls.find(
      ([cmd]) => cmd === "plugin:yames-mobile|set_background_audio",
    )?.[1] as { payload: Record<string, unknown> };
    expect(payload.payload.active).toBe(true);
    // The words a musician reads come from the locale files, already
    // translated — nothing on the Android side composes them.
    expect(payload.payload.body).toContain("120");
    expect(payload.payload.stopLabel).toBeTruthy();
  });

  it("keeps the screen awake only while there is something to watch", async () => {
    const view = mount(false);
    await act(async () => {});
    expect(
      mockInvoke.mock.calls.find(([cmd]) => cmd === "plugin:yames-mobile|keep_awake")?.[1],
    ).toEqual({ payload: { active: false } });

    mockInvoke.mockClear();
    view.rerender({ playing: true });
    await act(async () => {});
    expect(
      mockInvoke.mock.calls.find(([cmd]) => cmd === "plugin:yames-mobile|keep_awake")?.[1],
    ).toEqual({ payload: { active: true } });
  });

  it("pauses for a call and comes back when it ends", async () => {
    mount(true);
    await act(async () => {});
    mockInvoke.mockClear();

    fromAndroid({ event: "audio_interrupted", kind: "focus_lost" });
    expect(playingCalls()).toEqual([false]);

    fromAndroid({ event: "audio_interrupted", kind: "focus_gained" });
    expect(playingCalls()).toEqual([false, true]);
  });

  it("keeps the service alive across a call, or it would never get focus back", async () => {
    // The emulator caught this: tearing the service down on the way into the
    // pause abandons audio focus, and an app that has abandoned focus is never
    // told it has it again — the click paused for the call and stayed paused.
    const view = mount(true);
    await act(async () => {});
    mockInvoke.mockClear();

    fromAndroid({ event: "audio_interrupted", kind: "focus_lost" });
    // The hook stopped playback, so re-render with what the backend now says.
    view.rerender({ playing: false });
    await act(async () => {});

    const service = mockInvoke.mock.calls.filter(
      ([cmd]) => cmd === "plugin:yames-mobile|set_background_audio",
    );
    expect(service.length).toBeGreaterThan(0);
    for (const [, args] of service) {
      expect((args as { payload: { active: boolean } }).payload.active).toBe(true);
    }
    // …and it says so, rather than claiming to be playing.
    const last = service.at(-1)![1] as { payload: { body: string } };
    expect(last.payload.body).not.toContain("120");
  });

  it("does not start itself when focus comes back to a metronome that was already stopped", async () => {
    mount(false);
    await act(async () => {});
    mockInvoke.mockClear();

    // Nothing to pause, so nothing to resume: a user who pressed stop while
    // the phone was ringing must not be played at when the call ends.
    fromAndroid({ event: "audio_interrupted", kind: "focus_lost" });
    fromAndroid({ event: "audio_interrupted", kind: "focus_gained" });
    expect(playingCalls()).toEqual([]);
  });

  it("stops for good when another app takes over playback, and lets the service go", async () => {
    const view = mount(true);
    await act(async () => {});
    mockInvoke.mockClear();

    fromAndroid({ event: "audio_interrupted", kind: "focus_lost_permanently" });
    fromAndroid({ event: "audio_interrupted", kind: "focus_gained" });
    expect(playingCalls()).toEqual([false]);

    view.rerender({ playing: false });
    await act(async () => {});
    const last = mockInvoke.mock.calls
      .filter(([cmd]) => cmd === "plugin:yames-mobile|set_background_audio")
      .at(-1)?.[1] as { payload: { active: boolean } } | undefined;
    expect(last?.payload.active).toBe(false);
  });

  it("stops when the notification's own button is pressed, and stays stopped", async () => {
    mount(true);
    await act(async () => {});
    mockInvoke.mockClear();

    fromAndroid({ event: "stop_requested" });
    fromAndroid({ event: "audio_interrupted", kind: "focus_gained" });
    expect(playingCalls()).toEqual([false]);
  });

  it("hands a Back press to whatever the app has open", async () => {
    mount(false);
    await act(async () => {});
    const closed = vi.fn();

    // Stand in for a sheet: the same registration `useBackDismiss` makes.
    const { unmount } = renderHook(() => useBackDismiss(true, closed));
    await act(async () => {});

    fromAndroid({ event: "back_pressed" });
    expect(closed).toHaveBeenCalledTimes(1);
    unmount();
  });
});
