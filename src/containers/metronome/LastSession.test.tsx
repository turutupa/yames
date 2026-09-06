/**
 * LastSession — the metronome stage's "Yesterday · 24 min · score 78"
 * (UI_DECISIONS U2.6, gaps M8).
 *
 * The point of these is the honesty rule: a stored session gives up a date
 * and a score every time, but its LENGTH only when segments were recorded.
 * When it was not, the term is left out — never estimated, never zero.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LastSession } from "./LastSession";
import { mockInvoke, setInvokeResponse } from "../../test/mocks";
import type { SavedSession, SessionReport } from "../../types";

/**
 * Midday, N calendar days back. `getDayGroup` counts whole days, not hours, so
 * "26 hours ago" lands on the day before yesterday whenever the suite runs
 * early in the morning — which is exactly the kind of test that passes for
 * months and then fails at 01:00.
 */
function daysAgo(n: number): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n, 12).getTime();
}

function report(score: number): SessionReport {
  return {
    totalBeats: 100,
    hitsCount: 90,
    missCount: 10,
    skippedBeats: 0,
    perfectCount: 40,
    goodCount: 30,
    okCount: 20,
    meanDeviationMs: 2,
    stdDeviationMs: 12,
    meanAbsDeviationMs: 9,
    meanIntervalErrorMs: 8,
    grade: "B",
    score,
    deviations: [],
    dynamicsStd: 0.1,
    meanAmplitude: 0.4,
    tempoStabilityMs: 10,
    longestStreak: 20,
    comment: "",
    insights: [],
    gridCorrelation: 0.9,
    // Present ⇒ `rescoreReport` trusts the stored score instead of
    // re-deriving it, which is what keeps these expectations readable.
    onsetEfficiency: 0.8,
  } as SessionReport;
}

function session(over: Partial<SavedSession> = {}): SavedSession {
  return {
    id: "s1",
    timestamp: daysAgo(1),
    bpm: 120,
    timeSignature: 4,
    report: report(78),
    ...over,
  };
}

/**
 * A session in two segments spanning `ms` of wall clock end to end — the
 * shape the duration has to be recovered from, since nothing stores it
 * directly.
 */
function withSegments(start: number, ms: number): SavedSession {
  const mid = start + Math.round(ms / 2);
  const seg = (from: number, to: number) => ({
    report: report(78),
    bpm: 120,
    timeSignature: 4,
    startTime: from,
    endTime: to,
  });
  return session({
    timestamp: start,
    segments: [seg(start, mid), seg(mid, start + ms)],
  });
}

beforeEach(() => {
  mockInvoke.mockClear();
});

describe("LastSession", () => {
  it("renders nothing when there is no history to describe", async () => {
    setInvokeResponse("get_session_history", []);
    const { container } = render(<LastSession isPlaying={false} />);
    await waitFor(() => expect(mockInvoke).toHaveBeenCalled());
    expect(container.querySelector(".last-session")).toBeNull();
  });

  it("reads date, length and score off a session that recorded all three", async () => {
    const start = daysAgo(1);
    setInvokeResponse("get_session_history", [withSegments(start, 24 * 60_000)]);
    render(<LastSession isPlaying={false} />);
    const line = await screen.findByText(/score 78/);
    expect(line.textContent).toBe("Yesterday · 24 min · score 78");
  });

  it("leaves the length out when the session did not record one", async () => {
    // No segments — short warmups and anything saved before the segment
    // pipeline. `SavedSession` stores when a session began and nothing about
    // when it ended, so there is no honest number to print.
    setInvokeResponse("get_session_history", [session()]);
    render(<LastSession isPlaying={false} />);
    const line = await screen.findByText(/score 78/);
    expect(line.textContent).toBe("Yesterday · score 78");
  });

  it("rounds a sub-minute session up rather than calling it 0 min", async () => {
    const start = daysAgo(1);
    setInvokeResponse("get_session_history", [withSegments(start, 40_000)]);
    render(<LastSession isPlaying={false} />);
    const line = await screen.findByText(/score 78/);
    expect(line.textContent).toContain("1 min");
  });

  it("describes the most recent session, whatever order the store returns", async () => {
    setInvokeResponse("get_session_history", [
      session({ id: "old", timestamp: daysAgo(3), report: report(41) }),
      session({ id: "new", timestamp: daysAgo(1), report: report(93) }),
    ]);
    render(<LastSession isPlaying={false} />);
    const line = await screen.findByText(/score/);
    expect(line.textContent).toContain("score 93");
  });

  it("does not read history while the click is running", () => {
    setInvokeResponse("get_session_history", [session()]);
    render(<LastSession isPlaying />);
    expect(
      mockInvoke.mock.calls.map((c) => c[0]),
    ).not.toContain("get_session_history");
  });
});
