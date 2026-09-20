// The whole point of this module is what happens on the build where W1's
// command does not exist yet — which is every build until it merges. It must
// not throw, it must say so once, and it must be honest about whether the
// engine is scoring anything.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetScheduleBridge, scheduleAccepted, sendScoreSchedule } from "./engineBridge";
import type { ScoreSchedule } from "./types";

/**
 * A spy of our own, over the suite-wide Tauri mock.
 *
 * `src/test/mocks.ts` replaces `invoke` with a plain arrow into its own
 * dispatcher so the real `ipc.ts` runs end to end — which is right for every
 * other test and useless here, where the whole subject is what `invoke` does
 * when it rejects. A file-local `vi.mock` wins over the setup one.
 */
const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const SCHEDULE: ScoreSchedule = {
  onsets: [{ id: 0, beat: 0, noteIds: [0], soft: false, accent: false }],
  lengthBeats: 4,
  loops: false,
};

beforeEach(() => {
  resetScheduleBridge();
  invoke.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("handing the engine a schedule", () => {
  it("says nothing has been tried yet", () => {
    expect(scheduleAccepted()).toBeNull();
  });

  it("sends the schedule under the name Rust will register it as", async () => {
    invoke.mockResolvedValue(undefined);
    await expect(sendScoreSchedule(SCHEDULE)).resolves.toBe(true);
    expect(invoke).toHaveBeenCalledWith("load_score_schedule", { schedule: SCHEDULE });
    expect(scheduleAccepted()).toBe(true);
  });

  /**
   * The case that matters today: the command is not in the build.
   *
   * It resolves false rather than throwing, because a Songs mode whose Play
   * button rejects is worse than one that plays and does not score — and the
   * caller needs to be able to say which of those is happening.
   */
  it("does not throw when the command is not in the build", async () => {
    invoke.mockRejectedValue(new Error("command load_score_schedule not found"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(sendScoreSchedule(SCHEDULE)).resolves.toBe(false);
    expect(scheduleAccepted()).toBe(false);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain("load_score_schedule");
  });

  it("says it once, not once per pass", async () => {
    invoke.mockRejectedValue(new Error("nope"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (let i = 0; i < 5; i++) await sendScoreSchedule(SCHEDULE);
    expect(warn).toHaveBeenCalledOnce();
  });
});
