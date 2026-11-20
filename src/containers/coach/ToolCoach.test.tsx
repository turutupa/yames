/** The tools' coach under the stage: the line and the note (DESIGN 7, 3.1 "Tools"). */
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "../../i18n";
import { ToolCoach, toolCoachView } from "./ToolCoach";
import type { FeedMessage, SessionReport } from "../../types";

afterEach(cleanup);

const REPORT = {
  score: 78,
  grade: "B",
  hitsCount: 40,
  missCount: 4,
  perfectCount: 20,
  goodCount: 12,
  okCount: 8,
  totalBeats: 48,
  skippedBeats: 4,
  meanDeviationMs: -6,
  meanAbsDeviationMs: 9,
  stdDeviationMs: 11,
  tempoStabilityMs: 7,
  longestStreak: 16,
  deviations: [-10, -5, 3, 8, -2, 4, -7, 1],
  insights: [],
  comment: "",
  gridCorrelation: 0.9,
  hitCompleteness: 0.85,
  onsetEfficiency: 0.7,
} as unknown as SessionReport;

const T0 = Date.now() + 1000;

const tip = (id: string, at: number, extra: Partial<FeedMessage> = {}): FeedMessage => ({
  id,
  type: "coach-tip",
  timestamp: at,
  content: `tip ${id}`,
  ...extra,
});

const run = (at: number): FeedMessage[] => [
  { id: "r", type: "mini-report", timestamp: at, content: "Steady, a touch ahead on the downbeats.", report: REPORT, meta: { bpm: 120, timeSignature: 4 } },
  {
    id: "c",
    type: "chip-prompt",
    timestamp: at + 1,
    content: "",
    chips: [{ id: "best-run-today", label: "Best run today?", answer: "Your best today was 82." }],
  },
];

describe("what the line and the note show", () => {
  it("one line: the newest tip, never one still waiting for its voice", () => {
    const view = toolCoachView([tip("a", T0), tip("b", T0 + 5), tip("c", T0 + 9, { pending: true })], T0, true);
    expect(view.tip?.id).toBe("b");
    expect(view.note).toBeNull();
  });

  it("nothing from before this run: the last run's line steps aside when the click starts", () => {
    expect(toolCoachView([tip("old", T0)], T0 + 100, true).tip).toBeNull();
  });

  it("the note once the run has stopped, with its question chips; none while playing", () => {
    const messages = [tip("a", T0), ...run(T0 + 50)];
    expect(toolCoachView(messages, T0, true).note).toBeNull();
    const stopped = toolCoachView(messages, T0, false);
    expect(stopped.note?.id).toBe("r");
    expect(stopped.chips.map((c) => c.id)).toEqual(["best-run-today"]);
  });

  it("the summary when Listen goes off is the last note", () => {
    const end: FeedMessage = { id: "e", type: "session-end", timestamp: T0 + 200, content: "Good work.", report: REPORT };
    const view = toolCoachView([...run(T0 + 50), end], T0, false);
    expect(view.note?.id).toBe("e");
    expect(view.chips).toEqual([]);
  });
});

describe("ToolCoach", () => {
  const base = {
    listenOn: true,
    isPlaying: false,
    inputOn: true,
    onChipAction: vi.fn(),
  };

  it("is absent while Listen is off and nothing is left to say", () => {
    const { container } = render(<ToolCoach {...base} listenOn={false} messages={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("says it is listening, in words, until there is a tip", () => {
    render(<ToolCoach {...base} messages={[]} />);
    expect(screen.getByText("Listening…")).toBeTruthy();
    expect(screen.queryByTestId("tool-coach-line")).toBeNull();
  });

  it("puts a tip's one action at the end of the line, and sends it with the tip's id", () => {
    const onChipAction = vi.fn();
    const withButton = tip("t", T0 + 10, {
      affordance: {
        actionLabel: "Drop to 110 BPM",
        dismissLabel: "Stay at 120",
        action: { kind: "set-bpm", bpmDelta: -10 },
        interventionId: "bpm-drop",
      },
    });
    const { rerender } = render(<ToolCoach {...base} isPlaying onChipAction={onChipAction} messages={[withButton]} />);
    expect(screen.getByTestId("tool-coach-line").textContent).toContain("tip t");
    // One button: the action. Declining is letting the next tip replace it.
    expect(screen.queryByText("Stay at 120")).toBeNull();
    fireEvent.click(screen.getByTestId("tool-coach-act"));
    expect(onChipAction).toHaveBeenCalledWith({ kind: "set-bpm", messageId: "t", bpmDelta: -10 });
    rerender(<ToolCoach {...base} isPlaying onChipAction={onChipAction} messages={[{ ...withButton, affordanceResolved: true }]} />);
    expect(screen.queryByTestId("tool-coach-act")).toBeNull();
  });

  it("leaves a note when a run stops: the report, its numbers, and chips that open Ask", () => {
    const onChipAction = vi.fn();
    const { rerender } = render(<ToolCoach {...base} isPlaying onChipAction={onChipAction} messages={[]} />);
    rerender(<ToolCoach {...base} onChipAction={onChipAction} messages={run(Date.now() + 5)} />);
    const note = screen.getByTestId("tool-coach-note");
    expect(note.textContent).toContain("Steady, a touch ahead");
    expect(note.textContent).toContain("Score 78 at 120 BPM");
    expect(note.textContent).toContain("Beats covered 85%");
    expect(note.textContent).toContain("Measured");
    fireEvent.click(screen.getByTestId("tool-coach-chip-best-run-today"));
    expect(onChipAction).toHaveBeenCalledWith(expect.objectContaining({ kind: "answer", messageId: "r" }));
  });

  it("hides the note when the next run starts", () => {
    const messages = run(Date.now() + 5);
    const { rerender } = render(<ToolCoach {...base} messages={messages} />);
    expect(screen.queryByTestId("tool-coach-note")).not.toBeNull();
    act(() => {
      rerender(<ToolCoach {...base} isPlaying messages={messages} />);
    });
    expect(screen.queryByTestId("tool-coach-note")).toBeNull();
  });

  it("after Listen goes off, the summary and the way to Tool runs", () => {
    const onOpenRuns = vi.fn();
    const end: FeedMessage = { id: "e", type: "session-end", timestamp: Date.now() + 5, content: "Good work today.", report: REPORT };
    render(<ToolCoach {...base} listenOn={false} onOpenRuns={onOpenRuns} messages={[end]} />);
    expect(screen.getByTestId("tool-coach-note").textContent).toContain("Session score 78 · Good");
    fireEvent.click(screen.getByTestId("tool-coach-runs"));
    expect(onOpenRuns).toHaveBeenCalled();
  });
});
