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
    expect(screen.getByRole("button", { name: "Cheat sheet" })).toBeInTheDocument();
  });

  it("asks for each sheet when its button is pressed", () => {
    const { props } = draw();
    fireEvent.click(screen.getByRole("button", { name: "Set up" }));
    expect(props.onSetup).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cheat sheet" }));
    expect(props.onChords).toHaveBeenCalled();
  });

  it("reads as pressed while its sheet is down", () => {
    draw({ setupOpen: true });
    expect(screen.getByRole("button", { name: "Set up" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cheat sheet" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("offers neither where there is nothing behind them", () => {
    // The setlist player draws this bar too, and a Set up button there would
    // open a sheet over a screen that is not the jam stage.
    draw({ onSetup: undefined, onChords: undefined });
    expect(screen.queryByRole("button", { name: "Set up" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cheat sheet" })).toBeNull();
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
    // The variation is cleared along with the vibe: every starter names one
    // now, and "Rock · Shuffle" is a different string from the word this test
    // is about.
    draw({
      jam: { ...STARTER_JAMS[0], vibe: "rock", variation: undefined },
      onSetup: undefined,
      onChords: undefined,
    });
    expect(screen.queryByRole("button", { name: "Rock" })).toBeNull();
    expect(screen.getByText("Rock")).toBeInTheDocument();
  });
});

/**
 * A jam the library has never held (2026-09-17).
 *
 * The Jam tab always has something on it now, and for a player who deleted
 * every jam they had that something is a jam nothing has filed. The bar has
 * to offer to file it — "No changes" on a jam that was never written down is
 * the bar refusing to do the one thing that would help.
 */
describe("a jam that has never been saved", () => {
  it("offers Save, with nothing said about edits", () => {
    draw({ unsaved: true });
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeEnabled();
    // "Edited" is a claim about a stored jam that has moved away from what was
    // stored, and there is nothing stored here to have moved away from.
    expect(screen.queryByText("Edited")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revert" })).not.toBeInTheDocument();
  });

  it("goes quiet once it has been filed", () => {
    draw({ unsaved: false });
    expect(screen.getByRole("button", { name: "No changes" })).toBeDisabled();
  });
});
