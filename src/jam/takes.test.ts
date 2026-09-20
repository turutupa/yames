import { describe, expect, it } from "vitest";
import { TAKES_SIZE_NOTICE_BYTES, megabytes, sortTakes, takeLength } from "./takes";
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

describe("the notice threshold", () => {
  it("is a round hundred megabytes, in the units a disk is measured in", () => {
    // Whole binary megabytes, so the sentence on screen and the figure the
    // file manager shows are the same number.
    expect(TAKES_SIZE_NOTICE_BYTES).toBe(100 * 1024 * 1024);
    expect(megabytes(TAKES_SIZE_NOTICE_BYTES)).toBe(100);
  });
});

describe("megabytes", () => {
  it("is whole megabytes — a tenth of one is not a fact anybody acts on", () => {
    expect(megabytes(1024 * 1024 * 3.4)).toBe(3);
    expect(megabytes(1024 * 1024 * 247)).toBe(247);
    expect(megabytes(0)).toBe(0);
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
