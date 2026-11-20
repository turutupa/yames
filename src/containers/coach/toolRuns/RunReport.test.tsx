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
 *
 * Since leg c2a2 the report lives on Progress → Tool runs (`RunSummary`,
 * `SegmentTimeline`), and a stretch's numbers in the tool's coach note under
 * the stage (`ToolCoach`): the old feed card that held both is gone, and these
 * rules moved with what it showed.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "../../../i18n";

import { RunSummary, SegmentTimeline } from "./RunReport";
import { ToolCoach } from "../ToolCoach";
import type { FeedMessage, SessionReport, SessionSegment } from "../../../types";

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

/** A run as Tool runs shows it: its summary, then its timeline. */
function Run() {
  return (
    <>
      <RunSummary report={report} />
      <SegmentTimeline segments={segments} sessionStart={segments[0].startTime!} />
    </>
  );
}

function miniReport(): FeedMessage {
  return {
    id: "mini-1",
    type: "mini-report",
    // After the note mounts, so it is this run's.
    timestamp: Date.now() + 1000,
    content: "You held the tempo through the whole passage.",
    report,
    meta: { bpm: 130, timeSignature: 4 },
  };
}

/** The tool's note after a stretch, as it shows under the stage. */
function Note({ message }: { message: FeedMessage }) {
  return <ToolCoach messages={[message]} listenOn isPlaying={false} inputOn onChipAction={vi.fn()} />;
}

/** Visible text of the rendered report, whitespace collapsed. */
function reportText(container: HTMLElement): string {
  return (container.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

describe("RunSummary", () => {
  it("reads the same way it did when a musician last checked it", () => {
    const { container } = render(<Run />);
    expect(reportText(container)).toMatchSnapshot();
  });

  it("shows no bare 0-to-1 component value", () => {
    // Problem 1. `intervalConsistency` and `gridAlignment` used to render
    // as `0.42` / `0.71` in the stat grid AND as "42 %" / "71 %" in the
    // bars below — the same measurement twice, once unreadable. A number
    // shaped `0.xx` anywhere in this card means the grid cells are back.
    const { container } = render(<Run />);
    expect(reportText(container)).not.toMatch(/\b0\.\d\d\b/);
  });

  it("gives every timing figure its unit", () => {
    // Problem 6. Average error, consistency and tempo stability are all
    // milliseconds and all meaningless without saying so.
    render(<Run />);
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
    render(<Run />);
    const label = screen.getByText("Session Score");
    expect(label.nextElementSibling?.textContent).toBe("Good");
  });

  it("explains note spacing and beat placement where they are shown", () => {
    // Problem 2. IC and GA by their initials meant nothing. They now have
    // a musician's name, a sublabel, and a tooltip — and exactly one
    // rendering each.
    render(<Run />);
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
    render(<Run />);
    const labelled = screen.getAllByText(/Beats hit: \d+%/);
    expect(labelled.length).toBe(segments.length);
  });

  it("defines the playing-style and pocket words it uses", () => {
    // Problem 4. "Semi-structured" and "on beat" are categories with
    // thresholds behind them; the thresholds live in the tooltip.
    render(<Run />);
    for (const word of ["Semi-structured", "Grid exercise", "rushing", "dragging", "on beat"]) {
      for (const node of screen.queryAllByText(word)) {
        expect(node.getAttribute("title"), `"${word}" is undefined`).toBeTruthy();
      }
    }
  });
});

describe("a stretch's numbers, in the tool's note", () => {
  it("names the three component scores and explains each one", () => {
    // The same complaint as problem 2, one card earlier: `Cov · Eff ·
    // Grid` was the densest jargon in the coach.
    render(<Note message={miniReport()} />);
    for (const label of ["Beats covered", "Notes on a beat", "Locked to the click"]) {
      const node = screen.getByText(new RegExp(`^${label} \\d+%$`));
      expect(node.getAttribute("title"), `"${label}" is undefined`).toBeTruthy();
    }
  });

  it("rounds the component scores to whole percentages", () => {
    const { container } = render(<Note message={miniReport()} />);
    const row = container.querySelector("[data-testid=tool-coach-parts]")!;
    expect(row.textContent).not.toMatch(/\d\.\d/);
  });
});

describe("a note or a line says each thing once", () => {
  it("an end note shows its line once, not as a title and a body", () => {
    const message: FeedMessage = {
      id: "end",
      type: "session-end",
      timestamp: Date.now() + 1000,
      content: "Session complete.",
      report,
    };
    const { container } = render(<Note message={message} />);
    const text = container.textContent ?? "";
    expect(text.split("Session complete.").length - 1).toBe(1);
  });

  it("an end note without a report is not shown at all: nothing was saved for it to point at", () => {
    const message: FeedMessage = {
      id: "end",
      type: "session-end",
      timestamp: Date.now() + 1000,
      content: "Session complete.",
    };
    const { container } = render(<Note message={message} />);
    expect(container.textContent ?? "").not.toContain("Session complete.");
  });

  it.each(["system", "coach-tip"] as const)("a %s line shows its words once", (type) => {
    const message: FeedMessage = { id: type, type, timestamp: Date.now() + 1000, content: "One line from the coach." };
    const { container } = render(<Note message={message} />);
    expect((container.textContent ?? "").split("One line from the coach.").length - 1).toBe(1);
  });
});
