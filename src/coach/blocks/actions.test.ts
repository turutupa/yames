/**
 * The button's other end.
 *
 * Three of the six actions are settings the app already has, and they go
 * through the app's own doors. Three want machinery that does not exist yet
 * and say so out loud rather than doing nothing quietly.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockInvoke } from "../../test/mocks";
import { runCoachAction } from "./actions";

/**
 * The real `src/ipc.ts` runs; only Tauri's transport is mocked (see
 * `src/test/mocks.ts`). So this watches the command that actually leaves the
 * app, which is the thing worth asserting: the block's button and the
 * hotkey have to end up at the same place.
 */
const invoked = mockInvoke;

beforeEach(() => {
  invoked.mockClear();
});

describe("the three that work today", () => {
  it("sets the click through the same command every other door uses", () => {
    expect(runCoachAction({ kind: "clickSubdivision", subdivision: 4 })).toBe("done");
    expect(invoked).toHaveBeenCalledWith("set_subdivision", { subdivision: 4 });
  });

  it("lets a host take the click instead, when it has its own way in", () => {
    const setClickSubdivision = vi.fn();
    expect(runCoachAction({ kind: "clickSubdivision", subdivision: 2 }, { setClickSubdivision })).toBe(
      "done",
    );
    expect(setClickSubdivision).toHaveBeenCalledWith(2);
    expect(invoked).not.toHaveBeenCalled();
  });

  it("hands a preset and a jam to the window, by id", () => {
    const loadPreset = vi.fn();
    const loadJam = vi.fn();
    expect(runCoachAction({ kind: "loadPreset", preset: "warmup" }, { loadPreset })).toBe("done");
    expect(runCoachAction({ kind: "loadJam", jam: "blues" }, { loadJam })).toBe("done");
    expect(loadPreset).toHaveBeenCalledWith("warmup");
    expect(loadJam).toHaveBeenCalledWith("blues");
  });
});

describe("the three waiting on the Songs wave", () => {
  it("says so rather than doing nothing quietly", () => {
    expect(runCoachAction({ kind: "loopBars", score: "s", fromBar: 1, toBar: 4 })).toBe(
      "notWiredYet",
    );
    expect(runCoachAction({ kind: "ramp", fromBpm: 90, toBpm: 120 })).toBe("notWiredYet");
    expect(runCoachAction({ kind: "comeBack", when: "tomorrow" })).toBe("notWiredYet");
  });

  it("goes straight through the moment a host can do them", () => {
    const loopBars = vi.fn();
    const ramp = vi.fn();
    const comeBack = vi.fn();
    const loop = { kind: "loopBars", score: "s", fromBar: 1, toBar: 4 } as const;
    expect(runCoachAction(loop, { loopBars })).toBe("done");
    expect(loopBars).toHaveBeenCalledWith(loop);
    expect(runCoachAction({ kind: "ramp", fromBpm: 90, toBpm: 120 }, { ramp })).toBe("done");
    expect(runCoachAction({ kind: "comeBack", when: "tomorrow" }, { comeBack })).toBe("done");
  });

  it("never reaches the engine for an action it cannot do", () => {
    runCoachAction({ kind: "loopBars", score: "s", fromBar: 1, toBar: 4 });
    runCoachAction({ kind: "ramp", fromBpm: 90, toBpm: 120 });
    expect(invoked).not.toHaveBeenCalled();
  });
});
