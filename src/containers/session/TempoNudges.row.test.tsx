/**
 * The result's tonal row under P1, "once more here" (DESIGN 4.2): the rule
 * holds the tempo once and keeps "Up to N" one tap away, so the row carries
 * no second way up (Faster) beside it. Slower stays. Anywhere else the row is
 * as it was: Slower and Faster.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { TempoNudges, fasterOnRow } from "./parts";
import type { BigAction, RunState } from "../../session/runner";
import type { SessionRun } from "./hooks/useSessionRun";

afterEach(cleanup);

const RUN = { phase: "result", bpm: 90, plan: null, stepIndex: 0 } as unknown as RunState;
const SESSION = { actions: { slower: vi.fn(), faster: vi.fn() } } as unknown as SessionRun;

const onceMore = { kind: "again", bpm: 90, onceMore: { up: 95 } } as unknown as BigAction;
const plainAgain = { kind: "again", bpm: 90 } as unknown as BigAction;
const climb = { kind: "again", bpm: 95, up: true } as unknown as BigAction;
const finish = { kind: "finish" } as unknown as BigAction;

function row(big: BigAction) {
  render(<TempoNudges run={RUN} exercise={null} session={SESSION} faster={fasterOnRow(big)} />);
  return {
    slower: screen.queryByTestId("session-slower"),
    faster: screen.queryByTestId("session-faster"),
  };
}

describe("the result's tonal row", () => {
  it("under P1 holds the tempo: Slower, and no Faster beside Up to N", () => {
    expect(fasterOnRow(onceMore)).toBe(false);
    const r = row(onceMore);
    expect(r.slower).not.toBeNull();
    expect(r.faster).toBeNull();
  });

  it.each([
    ["go again", plainAgain],
    ["a climb", climb],
    ["the last block", finish],
  ])("after %s carries Slower and Faster", (_name, big) => {
    expect(fasterOnRow(big)).toBe(true);
    const r = row(big);
    expect(r.slower).not.toBeNull();
    expect(r.faster).not.toBeNull();
  });
});
