import { describe, expect, it } from "vitest";
import {
  DOUBLE_TAP_MS,
  HOLD_MS,
  PEDAL_UP,
  pedalPoll,
  pedalPollNoRelease,
  pedalPress,
  pedalRelease,
} from "./pedalGesture";
import type { PedalGesture, PedalState } from "./pedalGesture";

/** Run a script of `press`, `release` and `poll` at times, collecting gestures. */
function script(steps: Array<["press" | "release" | "poll", number]>): PedalGesture[] {
  let state: PedalState = PEDAL_UP;
  const out: PedalGesture[] = [];
  for (const [what, at] of steps) {
    const fn = what === "press" ? pedalPress : what === "release" ? pedalRelease : pedalPoll;
    const step = fn(state, at);
    state = step.state;
    if (step.gesture) out.push(step.gesture);
  }
  return out;
}

describe("pedal gestures", () => {
  it("a tap fires once the double-tap window has passed", () => {
    expect(
      script([
        ["press", 0],
        ["release", 50],
        ["poll", 50 + DOUBLE_TAP_MS - 1],
      ]),
    ).toEqual([]);
    expect(
      script([
        ["press", 0],
        ["release", 50],
        ["poll", 50 + DOUBLE_TAP_MS],
      ]),
    ).toEqual(["tap"]);
  });

  it("two quick taps are a double, once", () => {
    expect(
      script([
        ["press", 0],
        ["release", 50],
        ["press", 120],
        ["release", 170],
        ["poll", 1000],
      ]),
    ).toEqual(["double"]);
  });

  it("a long press is a hold, while still down, once", () => {
    expect(
      script([
        ["press", 0],
        ["poll", HOLD_MS - 1],
        ["poll", HOLD_MS],
        ["poll", HOLD_MS + 500],
        ["release", HOLD_MS + 600],
        ["poll", 5000],
      ]),
    ).toEqual(["hold"]);
  });

  it("two slow taps are two taps", () => {
    expect(
      script([
        ["press", 0],
        ["release", 50],
        ["poll", 400],
        ["press", 800],
        ["release", 850],
        ["poll", 1300],
      ]),
    ).toEqual(["tap", "tap"]);
  });

  it("a key's auto-repeat is not a second press", () => {
    expect(
      script([
        ["press", 0],
        ["press", 30],
        ["press", 60],
        ["release", 90],
        ["poll", 90 + DOUBLE_TAP_MS],
      ]),
    ).toEqual(["tap"]);
  });

  it("a release with no press does nothing", () => {
    expect(script([["release", 0], ["poll", 5000]])).toEqual([]);
  });

  it("a pedal that never sends a release gets a tap, not a stuck hold", () => {
    const down = pedalPress(PEDAL_UP, 0).state;
    expect(pedalPollNoRelease(down, HOLD_MS - 1).gesture).toBeNull();
    const fired = pedalPollNoRelease(down, HOLD_MS);
    expect(fired.gesture).toBe("tap");
    expect(fired.state).toEqual(PEDAL_UP);
  });
});
