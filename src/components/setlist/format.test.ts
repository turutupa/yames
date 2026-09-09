import { describe, expect, it } from "vitest";
import { durationLabel, spanLabel } from "./format";

/**
 * The stepper the owner found: "click + and nothing happens, click again and
 * it goes to 2 mins, and it gets worse as you increase".
 *
 * It was never the value — 75 seconds was being stored. It was the label:
 * `durationLabel` rounds to whole minutes, so 60, 75 and 90 all rendered
 * inside "1 min"/"2 min" and the button looked dead. Further up it is worse,
 * because more of the 15-second steps fall inside each rounded minute.
 */

/** The `t` these take, rendered the way the English strings render. */
const t = ((key: string, o: Record<string, unknown> = {}) => {
  switch (key) {
    case "setlist.trigger.secondsShort":
      return `${o.count}s`;
    case "setlist.trigger.minutesShort":
      return `${o.count} min`;
    case "setlist.trigger.minutesSeconds":
      return `${o.minutes}:${o.seconds}`;
    default:
      return key;
  }
}) as (key: string, opts?: Record<string, unknown>) => string;

const STEP = 15;

describe("a duration you are setting", () => {
  it("changes every single time the stepper moves", () => {
    // The whole bug, as an assertion: walk the range the control can reach
    // and require that no two neighbouring values read the same.
    const seen = new Set<string>();
    for (let s = STEP; s <= 3600; s += STEP) {
      const label = spanLabel(t, s);
      expect(seen.has(label), `${s}s renders as "${label}", which is taken`).toBe(false);
      seen.add(label);
    }
  });

  it("says seconds, whole minutes, or a clock — never a rounded lie", () => {
    expect(spanLabel(t, 15)).toBe("15s");
    expect(spanLabel(t, 45)).toBe("45s");
    expect(spanLabel(t, 60)).toBe("1 min");
    expect(spanLabel(t, 75)).toBe("1:15");
    expect(spanLabel(t, 90)).toBe("1:30");
    expect(spanLabel(t, 120)).toBe("2 min");
    expect(spanLabel(t, 135)).toBe("2:15");
    // Seconds are zero-padded, or 2:05 would read as 2:5.
    expect(spanLabel(t, 125)).toBe("2:05");
  });

  it("is what the old label got wrong", () => {
    // Kept as the record of the defect: these three were indistinguishable.
    expect(durationLabel(t, 60)).toBe("1 min");
    expect(durationLabel(t, 75)).toBe("1 min");
    expect(new Set([60, 75, 90, 105, 120].map((s) => durationLabel(t, s))).size).toBe(2);
    expect(new Set([60, 75, 90, 105, 120].map((s) => spanLabel(t, s))).size).toBe(5);
  });

  it("still rounds where rounding is honest — a whole setlist's estimate", () => {
    // `durationLabel` keeps its job: "about 12 min" is a guess about a run
    // nobody has done yet, and a guess to the second would be false precision.
    expect(durationLabel(t, 740)).toBe("12 min");
  });
});
