import { describe, expect, it } from "vitest";
import {
  TAKES_SIZE_NOTICE_BYTES,
  TAKE_BYTES_PER_SECOND,
  megabytes,
  sortTakes,
  takeLength,
  takesBytes,
} from "./takes";
import type { JamTake } from "./types";

function take(over: Partial<JamTake> = {}): JamTake {
  return {
    id: "t1",
    jamId: "j1",
    createdAt: 1_000,
    durationSec: 60,
    path: "C:/takes/t1.wav",
    ...over,
  };
}

describe("sortTakes", () => {
  it("puts the newest first — the one you want is the one you just played", () => {
    const sorted = sortTakes([
      take({ id: "old", createdAt: 1 }),
      take({ id: "new", createdAt: 3 }),
      take({ id: "mid", createdAt: 2 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["new", "mid", "old"]);
  });

  it("copies rather than sorting the caller's array in place", () => {
    const list = [take({ id: "a", createdAt: 1 }), take({ id: "b", createdAt: 2 })];
    sortTakes(list);
    expect(list.map((t) => t.id)).toEqual(["a", "b"]);
  });
});

describe("takesBytes", () => {
  it("adds up what the shelf is costing", () => {
    expect(takesBytes([take({ durationSec: 10 }), take({ durationSec: 20 })])).toBe(
      30 * TAKE_BYTES_PER_SECOND,
    );
  });

  it("is nothing for an empty shelf", () => {
    expect(takesBytes([])).toBe(0);
  });

  it("cannot be talked into a negative by a duration that makes no sense", () => {
    expect(takesBytes([take({ durationSec: -5 })])).toBe(0);
  });

  it("crosses the notice threshold somewhere around a quarter of an hour", () => {
    // The number exists to warn that the folder is filling up, and a warning
    // that arrives after an afternoon of playing is no warning. Roughly
    // eighteen minutes is the shape of it; the exact figure is arithmetic.
    const seconds = TAKES_SIZE_NOTICE_BYTES / TAKE_BYTES_PER_SECOND;
    expect(seconds).toBeGreaterThan(10 * 60);
    expect(seconds).toBeLessThan(30 * 60);
    expect(takesBytes([take({ durationSec: seconds - 1 })])).toBeLessThan(
      TAKES_SIZE_NOTICE_BYTES,
    );
    expect(takesBytes([take({ durationSec: seconds + 1 })])).toBeGreaterThan(
      TAKES_SIZE_NOTICE_BYTES,
    );
  });
});

describe("megabytes", () => {
  it("is whole megabytes — a tenth of one is not a fact anybody acts on", () => {
    expect(megabytes(TAKES_SIZE_NOTICE_BYTES)).toBe(100);
    expect(megabytes(1024 * 1024 * 3.4)).toBe(3);
  });
});

describe("takeLength", () => {
  it("writes the same clock the transport writes", () => {
    expect(takeLength(0)).toBe("0:00");
    expect(takeLength(7)).toBe("0:07");
    expect(takeLength(247)).toBe("4:07");
    expect(takeLength(3600)).toBe("60:00");
  });

  it("never writes a negative", () => {
    expect(takeLength(-3)).toBe("0:00");
  });
});
