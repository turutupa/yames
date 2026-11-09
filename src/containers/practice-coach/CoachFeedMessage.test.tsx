/**
 * The end-of-session report has to explain itself.
 *
 * ROADMAP §6 1.6 carries six complaints from the old REPORT_UI_CLARITY
 * plan, and every one of them is a way for a number to appear on screen
 * with nothing to read it against: a bare `0.42`, an abbreviation only
 * this repo knows, a percentage with no denominator, a millisecond
 * figure with no unit, a word ("semi-structured") that names a category
 * nobody defined.
 *
 * Four of the six were fixed while the UI was revamped. This file is the
 * gate that keeps all six fixed. The snapshot is of the report's TEXT,
 * not its DOM — a DOM snapshot churns on every class rename and says
 * nothing about whether a player can read the thing, whereas the text is
 * exactly what is in front of them and a diff in it is worth a second
 * look. The assertions below the snapshot are the rules the snapshot
 * cannot state on its own.
 */
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { FeedMessageItem } from "./CoachFeedMessage";
import type { FeedMessage, SessionReport, SessionSegment } from "../../types";

/**
 * A session with segment data, so the DSP-derived components
 * (note spacing, beat placement, coverage) are all present. Numbers are
 * deliberately un-round so a rounding change shows up in the snapshot.
 */
const report: SessionReport = {
  totalBeats: 240,
  hitsCount: 188,
  missCount: 34,
  skippedBeats: 18,
  perfectCount: 96,
  goodCount: 61,
  okCount: 31,
  meanDeviationMs: -7.4,
  stdDeviationMs: 18.32,
  meanAbsDeviationMs: 14.68,
  meanIntervalErrorMs: 11.2,
  grade: "B",
  score: 78,
  deviations: [-12, 4, -18, 9, 22, -3, -25, 11, 6, -9, 15, -2],
  dynamicsStd: 0.08,
  meanAmplitude: 0.42,
  tempoStabilityMs: 6.51,
  longestStreak: 24,
  comment: "Good work! A few rough edges, but strong overall.",
  insights: ["You settled once the tempo stopped moving."],
  gridCorrelation: 0.712,
  onsetEfficiency: 0.664,
  hitCompleteness: 0.583,
  intervalConsistency: 0.4237,
  gridAlignment: 0.7118,
  coachMode: "pro",
  subdivision: 1,
};

const segments: SessionSegment[] = [
  {
    report: {
      ...report,
      score: 71,
      gridCorrelation: 0.44,
      meanDeviationMs: -11.2,
      hitsCount: 74,
      missCount: 26,
    },
    bpm: 120,
    timeSignature: 4,
    startTime: 1_000_000,
    endTime: 1_090_000,
  },
  {
    report: {
      ...report,
      score: 84,
      gridCorrelation: 0.91,
      meanDeviationMs: 1.1,
      hitsCount: 114,
      missCount: 8,
    },
    bpm: 130,
    timeSignature: 4,
    startTime: 1_090_000,
    endTime: 1_205_000,
  },
];

function sessionEnd(overrides: Partial<FeedMessage> = {}): FeedMessage {
  return {
    id: "end-1",
    type: "session-end",
    timestamp: 1_205_000,
    content: "That was a solid half hour.",
    report,
    segments,
    ...overrides,
  };
}

function miniReport(): FeedMessage {
  return {
    id: "mini-1",
    type: "mini-report",
    timestamp: 1_090_000,
    content: "You held the tempo through the whole passage.",
    report,
    meta: { bpm: 130, timeSignature: 4 },
  };
}

/** Visible text of the rendered report, whitespace collapsed. */
function reportText(container: HTMLElement): string {
  return (container.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Same, minus the wall-clock stamp in the corner of the card — that one
 * is the only thing on screen that depends on when the test ran. Removed
 * by class rather than by pattern: the timeline's own `1:30–3:25` offsets
 * look identical to a clock time and a regex eats a digit of the score
 * badge in front of them.
 */
function stableReportText(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  for (const stamp of clone.querySelectorAll(".coach-feed-msg-time")) stamp.remove();
  return reportText(clone);
}

describe("EndReportSummary", () => {
  it("reads the same way it did when a musician last checked it", () => {
    const { container } = render(<FeedMessageItem message={sessionEnd()} />);
    expect(stableReportText(container)).toMatchSnapshot();
  });

  it("shows no bare 0-to-1 component value", () => {
    // Problem 1. `intervalConsistency` and `gridAlignment` used to render
    // as `0.42` / `0.71` in the stat grid AND as "42 %" / "71 %" in the
    // bars below — the same measurement twice, once unreadable. A number
    // shaped `0.xx` anywhere in this card means the grid cells are back.
    const { container } = render(<FeedMessageItem message={sessionEnd()} />);
    expect(reportText(container)).not.toMatch(/\b0\.\d\d\b/);
  });

  it("gives every timing figure its unit", () => {
    // Problem 6. Average error, consistency and tempo stability are all
    // milliseconds and all meaningless without saying so.
    render(<FeedMessageItem message={sessionEnd()} />);
    for (const label of ["Avg timing error", "Consistency", "Tempo stability"]) {
      const cell = screen.getByText(label).parentElement!;
      expect(cell.textContent, `${label} carries no unit`).toMatch(/ms\b/);
    }
  });

  it("says what the score is, in words, beside the ring", () => {
    // Problem 5. 78 out of what, and is that good? The qualifier is the
    // only thing on the card that answers the second question.
    // "Good" also names a hit-quality bucket in the breakdown below, so
    // look for the qualifier where it belongs: next to the ring's label.
    render(<FeedMessageItem message={sessionEnd()} />);
    const label = screen.getByText("Session Score");
    expect(label.nextElementSibling?.textContent).toBe("Good");
  });

  it("explains note spacing and beat placement where they are shown", () => {
    // Problem 2. IC and GA by their initials meant nothing. They now have
    // a musician's name, a sublabel, and a tooltip — and exactly one
    // rendering each.
    render(<FeedMessageItem message={sessionEnd()} />);
    const spacing = screen.getByText("Note spacing");
    expect(spacing.getAttribute("title")).toBeTruthy();
    expect(screen.getByText("Even gaps between your notes")).toBeInTheDocument();
    const placement = screen.getByText("Beat placement");
    expect(placement.getAttribute("title")).toBeTruthy();
    expect(screen.getByText("How close your hits land to the beat")).toBeInTheDocument();
  });
});

describe("SegmentTimeline", () => {
  it("labels the accuracy percentage instead of printing a bare 70 %", () => {
    // Problem 3. The timeline used to read "12:04–12:06 · Semi-structured
    // · 130 BPM · 70 % · on beat" — and the 70 % was the only number on
    // the row with no name.
    render(<FeedMessageItem message={sessionEnd()} />);
    const labelled = screen.getAllByText(/Beats hit: \d+%/);
    expect(labelled.length).toBe(segments.length);
  });

  it("defines the playing-style and pocket words it uses", () => {
    // Problem 4. "Semi-structured" and "on beat" are categories with
    // thresholds behind them; the thresholds live in the tooltip.
    render(<FeedMessageItem message={sessionEnd()} />);
    for (const word of ["Semi-structured", "Grid exercise", "rushing", "dragging", "on beat"]) {
      for (const node of screen.queryAllByText(word)) {
        expect(node.getAttribute("title"), `"${word}" is undefined`).toBeTruthy();
      }
    }
  });
});

describe("mini-report components", () => {
  it("names the three component scores and explains each one", () => {
    // The same complaint as problem 2, one card earlier: `Cov · Eff ·
    // Grid` was the densest jargon in the coach.
    render(<FeedMessageItem message={miniReport()} />);
    for (const label of ["Beats covered", "Notes on a beat", "Locked to the click"]) {
      const node = screen.getByText(new RegExp(`^${label} \\d+%$`));
      expect(node.getAttribute("title"), `"${label}" is undefined`).toBeTruthy();
    }
  });

  it("rounds the component scores to whole percentages", () => {
    const { container } = render(<FeedMessageItem message={miniReport()} />);
    const row = container.querySelector(".coach-mini-report-components")!;
    expect(row.textContent).not.toMatch(/\d\.\d/);
  });
});
