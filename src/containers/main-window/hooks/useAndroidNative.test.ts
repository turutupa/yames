// What the phone does when the system interrupts it.
//
// The emulator cannot deliver audio focus to another app — there is nothing
// else on it that plays anything — so the behaviour the M04 brief cares about
// (pause on a call, resume when it ends, stop for good when another app takes
// over playback) is pinned here instead of on a device. The Kotlin side's only
// job is to name which of the three happened; everything below that name is
// this hook, and this is where it is tested.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockChannels, mockInvoke } from "../../../test/mocks";
import type { NativeEvent } from "../../../mobile/native";
import { resetBackStack, useBackDismiss } from "../../../mobile/backStack";
import { SERVICE_START_DELAY_MS, useAndroidNative } from "./useAndroidNative";

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

/**
 * Let the service-start delay elapse.
 *
 * The hook waits half a second before starting the foreground service, so
 * that a transport which is only momentarily true never raises Android's
 * notification prompt (see `SERVICE_START_DELAY_MS`). Every assertion about
 * the service being *started* has to get past it; assertions about it being
 * stopped do not, because stopping is immediate.
 */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SERVICE_START_DELAY_MS + 1);
  });
}

describe("the phone's native half", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockInvoke.mockClear();
    mockChannels.length = 0;
    resetBackStack();
  });

  afterEach(() => {
    vi.useRealTimers();
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
    await settle();
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
    await settle();
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
    await settle();
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

  // M05, on the first release build: the wizard's demo click is unwound as the
  // wizard closes, and for the render between "the demo stopped" and "the
  // engine stopped" the transport read as a user pressing play. Android raised
  // its notification prompt on the way out of setup, for a click that had
  // already stopped.
  it("does not start the service for a transport that is only briefly live", async () => {
    const view = mount(false);
    await settle();
    mockInvoke.mockClear();

    view.rerender({ playing: true });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SERVICE_START_DELAY_MS / 5);
    });
    view.rerender({ playing: false });
    await settle();

    const active = mockInvoke.mock.calls
      .filter(([cmd]) => cmd === "plugin:yames-mobile|set_background_audio")
      .map(([, args]) => (args as { payload: { active: boolean } }).payload.active);
    expect(active).not.toContain(true);
  });

  it("stops when the notification's own button is pressed, and stays stopped", async () => {
    mount(true);
    await act(async () => {});
    mockInvoke.mockClear();

    fromAndroid({ event: "stop_requested" });
    fromAndroid({ event: "audio_interrupted", kind: "focus_gained" });
    expect(playingCalls()).toEqual([false]);
  });

  // M05b: the store shots showed the gesture pill sitting on the tab labels
  // and the header 150 device pixels below a status bar it was supposed to be
  // tucked under. `env(safe-area-inset-*)` describes the display cutout, not
  // the system bars — it reported the camera hole at the top and nothing at
  // all at the bottom. The measurement comes from Android now, and this is
  // where it lands.
  describe("the system bars", () => {
    const token = (name: string) =>
      document.documentElement.style.getPropertyValue(name);

    afterEach(() => {
      for (const name of ["--safe-top", "--safe-right", "--safe-bottom", "--safe-left"]) {
        document.documentElement.style.removeProperty(name);
      }
    });

    it("writes the measured insets over the env() fallback", async () => {
      mount(false);
      await act(async () => {});

      // The emulator's own numbers: a 128px status bar and a 63px gesture bar
      // at density 2.625.
      fromAndroid({
        event: "window_insets",
        top: 128 / 2.625,
        right: 0,
        bottom: 63 / 2.625,
        left: 0,
      });

      expect(token("--safe-top")).toBe("48.76px");
      expect(token("--safe-bottom")).toBe("24px");
      expect(token("--safe-right")).toBe("0px");
      expect(token("--safe-left")).toBe("0px");
    });

    it("leaves the tokens alone until Android says something", async () => {
      mount(false);
      await act(async () => {});
      // Nothing inline, so `shell.css`'s `env()` declaration still stands —
      // which is what desktop and the screenshot harness run on.
      expect(token("--safe-top")).toBe("");
      expect(token("--safe-bottom")).toBe("");
    });

    it("ignores a payload that would push the header off the screen", async () => {
      mount(false);
      await act(async () => {});
      fromAndroid({ event: "window_insets", top: -40, right: 0, bottom: 24, left: NaN });

      expect(token("--safe-top")).toBe("");
      expect(token("--safe-left")).toBe("");
      expect(token("--safe-bottom")).toBe("24px");
    });
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
