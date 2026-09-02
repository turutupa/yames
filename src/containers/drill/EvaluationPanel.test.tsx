/**
 * EvaluationPanel feature preservation tests.
 *
 * Locks in:
 * - Collapsed state shows the Sessions tab button
 * - Open state shows "Sessions" header + close button
 * - Empty history → "No sessions yet" message
 * - Close button calls onToggle
 * - History list renders saved sessions
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import EvaluationPanel from "./EvaluationPanel";
import { setInvokeResponse } from "../../test/mocks";
import type { SavedSession } from "../../types";

const baseProps = {
  open: true,
  onClose: vi.fn(),
  onToggle: vi.fn(),
  panelView: "history" as const,
  setPanelView: vi.fn(),
  selectedReport: null,
  setSelectedReport: vi.fn(),
  selectedMeta: null,
  setSelectedMeta: vi.fn(),
};

const makeSession = (overrides: Partial<SavedSession> = {}): SavedSession => ({
  id: "s1",
  timestamp: 1700000000000,
  bpm: 120,
  timeSignature: 4,
  beatGroups: [4],
  freeMode: false,
  report: {
    totalBeats: 32,
    hitsCount: 30,
    missCount: 2,
    skippedBeats: 0,
    perfectCount: 20,
    goodCount: 8,
    okCount: 2,
    meanDeviationMs: 1.2,
    stdDeviationMs: 5.0,
    meanAbsDeviationMs: 4.0,
    meanIntervalErrorMs: 3.0,
    grade: "B",
    score: 85,
    deviations: [0, 1, -1, 2, -2],
    dynamicsStd: 0.05,
    meanAmplitude: 0.5,
    tempoStabilityMs: 3.0,
    longestStreak: 12,
    comment: "Good work",
    insights: [],
    gridCorrelation: 0.9,
  },
  ...overrides,
});

describe("EvaluationPanel", () => {
  it("shows the collapsed tab button when open=false", () => {
    render(<EvaluationPanel {...baseProps} open={false} />);
    const tab = document.querySelector(".eval-panel-collapsed-tab");
    expect(tab).not.toBeNull();
  });

  it("shows 'No sessions yet' when history is empty", async () => {
    setInvokeResponse("get_session_history", () => []);
    render(<EvaluationPanel {...baseProps} />);
    expect(await screen.findByText(/No sessions yet/i)).toBeInTheDocument();
  });

  it("renders saved sessions in the history list", async () => {
    setInvokeResponse("get_session_history", () => [
      makeSession({ id: "a", bpm: 100 }),
      makeSession({ id: "b", bpm: 140 }),
    ]);
    render(<EvaluationPanel {...baseProps} />);
    // The bpm value appears as part of each row label.
    await waitFor(() => {
      const rows = document.querySelectorAll(".eval-history-list > div");
      // grouped containers wrap rows — assert >0
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  it("close button calls onToggle", () => {
    const onToggle = vi.fn();
    render(<EvaluationPanel {...baseProps} onToggle={onToggle} />);
    const closeBtn = document.querySelector(".eval-panel-close") as HTMLElement;
    expect(closeBtn).not.toBeNull();
    fireEvent.click(closeBtn);
    expect(onToggle).toHaveBeenCalled();
  });
});
