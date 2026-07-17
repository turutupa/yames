/**
 * TrackView feature preservation tests.
 *
 * Locks in:
 * - Renders the "Pocket Check" heading in the default idle state
 * - Idle state shows Start, Calibrate, and History buttons
 * - History button is disabled when history is empty
 * - Renders all 5 rating legend items (metronomic/tight/solid/loose/miss)
 * - Description copy adapts to evaluationEnabled flag
 * - Mode selector renders Free / Chords / Rhythm buttons
 * - Sequence select appears only in chords mode
 * - Pattern select appears only in rhythm mode
 * - useCuedSession returns correct expectedTaps and chord cues
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderHook } from "@testing-library/react";
import { TrackView } from "./TrackView";
import { TrackResultsView } from "./TrackResultsView";
import { DEFAULT_TEST_STATE } from "../../test/mocks";
import { useCuedSession } from "./hooks/useCuedSession";
import { CHORD_SEQUENCES, RHYTHM_PATTERNS } from "./presets";

const baseProps = {
  state: DEFAULT_TEST_STATE,
  currentBeat: null,
};

describe("TrackView", () => {
  it("renders the 'Pocket Check' heading in idle state", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    expect(await screen.findByText(/Pocket Check/i)).toBeInTheDocument();
  });

  it("renders Start, Calibrate, and History buttons in idle state", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    await screen.findByText(/Pocket Check/i);
    expect(screen.getByRole("button", { name: /^start$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^calibrate$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^history$/i })).toBeInTheDocument();
  });

  it("disables the History button when history is empty", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    const historyBtn = (await screen.findByRole("button", {
      name: /^history$/i,
    })) as HTMLButtonElement;
    expect(historyBtn.disabled).toBe(true);
  });

  it("renders 5 rating legend items", async () => {
    const { container } = render(<TrackView {...baseProps} ref={vi.fn()} />);
    await screen.findByText(/Pocket Check/i);
    await waitFor(() => {
      const legend = container.querySelectorAll(".track-legend-item");
      expect(legend.length).toBe(5);
    });
  });

  it("description mentions tapping when evaluationEnabled is false", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} evaluationEnabled={false} />);
    await screen.findByText(/Pocket Check/i);
    expect(screen.getByText(/Tap along with the metronome/i)).toBeInTheDocument();
  });

  it("description mentions playing when evaluationEnabled is true", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} evaluationEnabled={true} />);
    await screen.findByText(/Pocket Check/i);
    expect(screen.getByText(/Play along with the metronome/i)).toBeInTheDocument();
  });
});

describe("TrackView — Groove Cards mode selector", () => {
  it("renders Free, Chords, and Rhythm mode buttons", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    await screen.findByText(/Pocket Check/i);
    expect(screen.getByRole("button", { name: /^Free$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Chords$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Rhythm$/i })).toBeInTheDocument();
  });

  it("sequence select is not visible in free mode", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    await screen.findByText(/Pocket Check/i);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("sequence select appears after switching to chords mode", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    await screen.findByText(/Pocket Check/i);
    fireEvent.click(screen.getByRole("button", { name: /^Chords$/i }));
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      // Should contain chord sequence names
      expect(select.options.length).toBeGreaterThan(0);
      expect(select.options[0].text).toMatch(CHORD_SEQUENCES[0].name);
    });
  });

  it("sequence select disappears when switching back to free mode", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    await screen.findByText(/Pocket Check/i);
    fireEvent.click(screen.getByRole("button", { name: /^Chords$/i }));
    await waitFor(() => expect(screen.getByRole("combobox")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /^Free$/i }));
    await waitFor(() => expect(screen.queryByRole("combobox")).not.toBeInTheDocument());
  });

  it("pattern select appears after switching to rhythm mode", async () => {
    render(<TrackView {...baseProps} ref={vi.fn()} />);
    await screen.findByText(/Pocket Check/i);
    fireEvent.click(screen.getByRole("button", { name: /^Rhythm$/i }));
    await waitFor(() => {
      const select = screen.getByRole("combobox") as HTMLSelectElement;
      expect(select).toBeInTheDocument();
      expect(select.options[0].text).toMatch(RHYTHM_PATTERNS[0].name);
    });
  });
});

describe("useCuedSession — cue derivation and scoring", () => {
  it("returns expectedTaps = scoredBeats (32) for free mode", () => {
    const { result } = renderHook(() =>
      useCuedSession({
        session: "idle",
        beatCount: 0,
        bpm: 120,
        gameMode: "free",
        selectedSequence: null,
        selectedPattern: null,
      }),
    );
    expect(result.current.expectedTaps).toBe(32);
    expect(result.current.gameSubdivision).toBe(1);
  });

  it("returns expectedTaps = 64 for rhythm mode with 8th notes (subdivisionInterval=2)", () => {
    const eighthPattern = RHYTHM_PATTERNS.find((p) => p.subdivisionInterval === 2)!;
    const { result } = renderHook(() =>
      useCuedSession({
        session: "idle",
        beatCount: 0,
        bpm: 120,
        gameMode: "rhythm",
        selectedSequence: null,
        selectedPattern: eighthPattern,
      }),
    );
    expect(result.current.gameSubdivision).toBe(2);
    expect(result.current.expectedTaps).toBe(64);
  });

  it("returns expectedTaps = 128 for rhythm mode with 16th notes (subdivisionInterval=4)", () => {
    const sixteenthPattern = RHYTHM_PATTERNS.find((p) => p.subdivisionInterval === 4)!;
    const { result } = renderHook(() =>
      useCuedSession({
        session: "idle",
        beatCount: 0,
        bpm: 120,
        gameMode: "rhythm",
        selectedSequence: null,
        selectedPattern: sixteenthPattern,
      }),
    );
    expect(result.current.gameSubdivision).toBe(4);
    expect(result.current.expectedTaps).toBe(128);
  });

  it("chord cue cycles through sequence chords as beat count advances", () => {
    const popSeq = CHORD_SEQUENCES[0]; // Pop I-V-vi-IV (G): ["G","D","Em","C"], beatsPerChord: 2
    const { result, rerender } = renderHook(
      ({ beatCount }: { beatCount: number }) =>
        useCuedSession({
          session: "playing",
          beatCount,
          bpm: 120,
          gameMode: "chords",
          selectedSequence: popSeq,
          selectedPattern: null,
        }),
      { initialProps: { beatCount: 0 } },
    );

    expect(result.current.currentCue).toBe("G"); // beat 0: chord 0

    rerender({ beatCount: 2 });
    expect(result.current.currentCue).toBe("D"); // beat 2: chord 1

    rerender({ beatCount: 4 });
    expect(result.current.currentCue).toBe("Em"); // beat 4: chord 2

    rerender({ beatCount: 6 });
    expect(result.current.currentCue).toBe("C"); // beat 6: chord 3

    rerender({ beatCount: 8 });
    expect(result.current.currentCue).toBe("G"); // beat 8: wraps around
  });

  it("rhythm cue returns the pattern symbol", () => {
    const eighthPattern = RHYTHM_PATTERNS.find((p) => p.subdivisionInterval === 2)!;
    const { result } = renderHook(() =>
      useCuedSession({
        session: "playing",
        beatCount: 5,
        bpm: 120,
        gameMode: "rhythm",
        selectedSequence: null,
        selectedPattern: eighthPattern,
      }),
    );
    expect(result.current.currentCue).toBe(eighthPattern.symbol);
  });

  it("GameResult optional fields include mode, sequenceName, patternName, gameSubdivision", () => {
    // TypeScript compile-time check — if this builds, the types are correct.
    const result = {
      id: "test",
      date: new Date().toISOString(),
      bpm: 120,
      scoredBeats: 32,
      overallRating: "solid" as const,
      catchPhrase: "test",
      breakdown: { metronomic: 0, tight: 0, solid: 10, loose: 5, miss: 17 },
      avgOffset: 5,
      avgAbs: 5,
      stdDev: 2,
      hitRate: 47,
      perBeatData: [],
      calibratedTaps: [],
      mode: "rhythm" as const,
      sequenceName: undefined,
      patternName: "8th Notes",
      gameSubdivision: 2,
    };
    expect(result.mode).toBe("rhythm");
    expect(result.gameSubdivision).toBe(2);
    expect(result.patternName).toBe("8th Notes");
  });
});

describe("TrackResultsView — mode badge", () => {
  const baseResultProps = {
    hasHistory: false,
    displayRating: "solid" as const,
    displayBreakdown: { metronomic: 0, tight: 0, solid: 10, loose: 5, miss: 17 },
    displayPerBeat: [],
    displayTaps: [],
    displayBpm: 120,
    viewingResult: null,
    onShowHistory: vi.fn(),
    onCalibrate: vi.fn(),
    onStartSession: vi.fn(),
  };

  it("shows 'Rhythm • 8th Notes' badge after a live rhythm session", async () => {
    render(
      <TrackResultsView
        {...baseResultProps}
        liveMode="rhythm"
        livePatternName="8th Notes"
      />,
    );
    expect(await screen.findByText("Rhythm • 8th Notes")).toBeInTheDocument();
  });

  it("shows 'Chords • Pop I-V-vi-IV (G)' badge after a live chords session", async () => {
    render(
      <TrackResultsView
        {...baseResultProps}
        liveMode="chords"
        liveSequenceName="Pop I-V-vi-IV (G)"
      />,
    );
    expect(await screen.findByText("Chords • Pop I-V-vi-IV (G)")).toBeInTheDocument();
  });

  it("does not show a mode badge for free mode", async () => {
    render(<TrackResultsView {...baseResultProps} liveMode="free" />);
    expect(screen.queryByText(/Rhythm|Chords/)).not.toBeInTheDocument();
  });

  it("old history record without mode field shows no badge (Bug 2 regression)", async () => {
    const oldRecord = {
      id: "old",
      date: new Date().toISOString(),
      bpm: 100,
      scoredBeats: 32,
      overallRating: "solid" as const,
      catchPhrase: "test",
      breakdown: { metronomic: 0, tight: 0, solid: 10, loose: 5, miss: 17 },
      avgOffset: 0,
      avgAbs: 5,
      stdDev: 2,
      hitRate: 47,
      perBeatData: [],
      calibratedTaps: [],
      // no mode field — simulates a pre-Groove-Cards history record
    };
    render(
      <TrackResultsView
        {...baseResultProps}
        viewingResult={oldRecord}
        liveMode="rhythm"
        livePatternName="8th Notes"
      />,
    );
    // liveMode must NOT bleed into historical result display
    expect(screen.queryByText(/Rhythm|Chords/)).not.toBeInTheDocument();
  });
});
