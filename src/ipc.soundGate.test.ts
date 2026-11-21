/**
 * The start of playback does not wait on speech (c1b2b review, findings 1 and
 * 2). `tts_stop` is a sync command on the main thread and may wait on a
 * process kill; `set_playing` posted after it would queue behind that kill
 * and the count-in's first click would be late. So the engine's call leaves
 * first and the sound gate (which cuts the coach's voice) runs after it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { setPlaying, togglePlayback, ttsSpeak } from "./ipc";
import { onSoundStarting } from "./soundGate";
import { mockInvoke } from "./test/mocks";

let off: (() => void) | null = null;
afterEach(() => {
  off?.();
  off = null;
});

/** The commands invoked so far, with a stand-in for the voice's `tts_stop` where the gate ran. */
function recordGate(): string[] {
  mockInvoke.mockClear();
  const order: string[] = [];
  off = onSoundStarting(() => {
    for (const call of mockInvoke.mock.calls) order.push(String(call[0]));
    order.push("tts_stop");
  });
  return order;
}

describe("the sound gate's place in a Start", () => {
  it("setPlaying(true) invokes set_playing before the voice's tts_stop", async () => {
    const order = recordGate();
    await setPlaying(true);
    expect(order).toEqual(["set_playing", "tts_stop"]);
  });

  it("togglePlayback invokes toggle_playback before the voice's tts_stop", async () => {
    const order = recordGate();
    await togglePlayback();
    expect(order).toEqual(["toggle_playback", "tts_stop"]);
  });

  it("setPlaying(false) does not run the gate", async () => {
    const order = recordGate();
    await setPlaying(false);
    expect(order).toEqual([]);
    expect(mockInvoke).toHaveBeenCalledWith("set_playing", { playing: false });
  });
});

describe("ttsSpeak's dim", () => {
  it("sends no dim argument by default, so every existing caller dims as before", async () => {
    mockInvoke.mockClear();
    await ttsSpeak("Hello");
    expect(mockInvoke).toHaveBeenCalledWith("tts_speak", { text: "Hello" });
  });

  it("asks Rust not to dim when told dim: false (the Session's boundary voice)", async () => {
    mockInvoke.mockClear();
    await ttsSpeak("Keep the pick close.", { dim: false });
    expect(mockInvoke).toHaveBeenCalledWith("tts_speak", { text: "Keep the pick close.", dim: false });
  });
});
