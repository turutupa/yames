/**
 * The jam's context bar. The save half is the same shape the preset and the
 * setlist use; what is new is the two buttons that open the sheets
 * (plans/JAM_UX_DECISIONS.md A1, A8).
 *
 * They live here rather than on the stage because the stage IS the playing
 * screen now — five blocks, and a button that opens a panel over them is not
 * one of the five.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { JamSaveBar } from "./JamSaveBar";
import { STARTER_JAMS } from "../../jam/jams";

function draw(overrides: Partial<React.ComponentProps<typeof JamSaveBar>> = {}) {
  const props = {
    jam: STARTER_JAMS[0],
    dirty: false,
    saveFeedback: false,
    onRename: vi.fn(),
    onSave: vi.fn(),
    onRevert: vi.fn(),
    onSetup: vi.fn(),
    onChords: vi.fn(),
    ...overrides,
  };
  return { ...render(<JamSaveBar {...props} />), props };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the jam's context bar", () => {
  it("names the jam and offers the two sheets", () => {
    draw();
    expect(screen.getByText("Slow blues in A")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chords" })).toBeInTheDocument();
  });

  it("asks for each sheet when its button is pressed", () => {
    const { props } = draw();
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(props.onSetup).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Chords" }));
    expect(props.onChords).toHaveBeenCalled();
  });

  it("reads as pressed while its sheet is down", () => {
    draw({ setupOpen: true });
    expect(screen.getByRole("button", { name: "Set up" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Chords" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("offers neither where there is nothing behind them", () => {
    // The setlist player draws this bar too, and a Set up button there would
    // open a sheet over a screen that is not the jam stage.
    draw({ onSetup: undefined, onChords: undefined });
    expect(screen.queryByRole("button", { name: "Set up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Chords" })).toBeNull();
  });

  it("still says whether the jam has unsaved changes", () => {
    draw({ dirty: true });
    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(screen.getByText("Revert")).toBeInTheDocument();
  });

  it("names the vibe the jam started from, and that name opens Set up", () => {
    // The owner could not tell how to make the band sound like a style: the
    // word "Rock" lived only behind a button they had not found. Now the bar
    // says it, and pressing it is the way in.
    const { props } = draw({ jam: { ...STARTER_JAMS[0], vibe: "rock", variation: "hard" } });
    const chip = screen.getByRole("button", { name: "Rock · Hard" });
    fireEvent.click(chip);
    expect(props.onSetup).toHaveBeenCalled();
  });

  it("says only the vibe when the jam has no variation, and nothing without a vibe", () => {
    draw({ jam: { ...STARTER_JAMS[0], vibe: "jazz", variation: undefined } });
    expect(screen.getByRole("button", { name: "Jazz" })).toBeInTheDocument();
    cleanup();
    draw({ jam: { ...STARTER_JAMS[0], vibe: undefined, variation: undefined } });
    expect(document.querySelector(".jam-vibe-chip")).toBeNull();
  });

  it("keeps the vibe as a word, not a door, where there is no sheet to open", () => {
    // The setlist player draws this bar without the sheets; the vibe is still
    // worth reading there, it just cannot open anything.
    draw({ jam: { ...STARTER_JAMS[0], vibe: "rock" }, onSetup: undefined, onChords: undefined });
    expect(screen.queryByRole("button", { name: "Rock" })).toBeNull();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });
});
