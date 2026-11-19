import { describe, expect, it } from "vitest";
import { createPlaybackGate } from "./playbackGate";

describe("whose ending is this", () => {
  it("the playing take's own ending ends it", () => {
    const gate = createPlaybackGate();
    const token = gate.starting();
    expect(gate.started(token, 7)).toBe(true);
    expect(gate.ended(7)).toBe(true);
  });

  it("an older take's ending, arriving after the new one started, does not", () => {
    const gate = createPlaybackGate();
    expect(gate.started(gate.starting(), 7)).toBe(true);
    // Take A (7) runs out as the player presses play on B.
    const b = gate.starting();
    // A's ending is delivered before `play_take` has answered for B ...
    expect(gate.ended(7)).toBe(false);
    expect(gate.started(b, 8)).toBe(true);
    // ... or after it.
    expect(gate.ended(7)).toBe(false);
    expect(gate.ended(8)).toBe(true);
  });

  it("a take that ended before play_take answered goes out when it answers", () => {
    const gate = createPlaybackGate();
    const token = gate.starting();
    expect(gate.ended(3)).toBe(false);
    expect(gate.started(token, 3)).toBe(false);
  });

  it("an answer for a play that was replaced or stopped changes nothing", () => {
    const gate = createPlaybackGate();
    const a = gate.starting();
    const b = gate.starting();
    expect(gate.started(a, 1)).toBe(true);
    // Still waiting on B: A's generation was not taken for B's.
    expect(gate.ended(1)).toBe(false);
    expect(gate.started(b, 2)).toBe(true);
    expect(gate.ended(2)).toBe(true);

    const c = gate.starting();
    gate.stopped();
    expect(gate.started(c, 5)).toBe(true);
    // Nothing of ours is playing, so an ending is harmless to believe.
    expect(gate.ended(5)).toBe(true);
  });

  it("a refused play is the row's only while it is still the play asked for", () => {
    const gate = createPlaybackGate();
    const a = gate.starting();
    const b = gate.starting();
    expect(gate.failed(a)).toBe(false);
    expect(gate.started(b, 2)).toBe(true);
    expect(gate.ended(2)).toBe(true);
    const c = gate.starting();
    expect(gate.failed(c)).toBe(true);
    expect(gate.failed(c)).toBe(false);
  });

  it("an ending that names no playback is believed, as before", () => {
    const gate = createPlaybackGate();
    expect(gate.started(gate.starting(), 4)).toBe(true);
    expect(gate.ended()).toBe(true);
  });

  it("an engine that answers with no generation is believed too", () => {
    const gate = createPlaybackGate();
    expect(gate.started(gate.starting(), null)).toBe(true);
    expect(gate.ended(9)).toBe(true);
  });
});
