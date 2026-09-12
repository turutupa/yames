// The Jam stage. What is worth pinning here is the timeline — it is the
// headline of the whole mode (JAM_MODE §4.2), it is the only thing on the
// screen driven by the engine rather than by the record, and "which bar of
// the twelve am I on" is the question the mode exists to answer.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { createRef } from "react";
import { JamView } from "./JamView";
import { STARTER_JAMS } from "../../jam/jams";
import type { Jam } from "../../jam/types";
import type { BeatEvent } from "../../types";

const jamOf = (overrides: Partial<Jam> = {}): Jam => ({
  ...STARTER_JAMS[0],
  ...overrides,
});

function beat(formBar: number, chorus = 1, measureBeat = 0): BeatEvent {
  return {
    beat: formBar * 4 + measureBeat,
    measureBeat,
    subdivision: 0,
    isDownbeat: measureBeat === 0,
    isAccent: measureBeat === 0,
    formBar,
    chorus,
  };
}

function setup(overrides: Partial<React.ComponentProps<typeof JamView>> = {}) {
  const props = {
    jam: jamOf(),
    onEdit: vi.fn(),
    currentBeat: null as BeatEvent | null,
    isPlaying: false,
    tapActive: false,
    tapCount: 0,
    tapPulse: false,
    editingBpm: false,
    bpmEditValue: "",
    setBpmEditValue: vi.fn(),
    setEditingBpm: vi.fn(),
    bpmInputRef: createRef<HTMLInputElement>(),
    onTap: vi.fn(),
    onBpmChange: vi.fn(),
    onStartBpmEdit: vi.fn(),
    onCommitBpmEdit: vi.fn(),
    ...overrides,
  };
  const utils = render(<JamView {...props} />);
  return { ...utils, props };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("JamView — the form timeline", () => {
  it("says which bar of the form the band is on", () => {
    setup({ currentBeat: beat(2), isPlaying: true });
    expect(screen.getByText(/bar 3 of 12/)).toBeInTheDocument();
  });

  it("says which chorus, because a loop with no count is a loop you lose", () => {
    setup({ currentBeat: beat(2, 4), isPlaying: true });
    expect(screen.getByText(/chorus 4/)).toBeInTheDocument();
  });

  it("lights exactly one cell, and lights the one it names", () => {
    const { container } = setup({ currentBeat: beat(2), isPlaying: true });
    const lit = container.querySelectorAll(".jam-timeline-cell[data-current]");
    expect(lit).toHaveLength(1);
    expect(lit[0].textContent).toContain("3");
  });

  it("draws one cell per bar, grouped into the form's sections", () => {
    // Twelve cells in a row are twelve of something; three fours are a blues.
    const { container } = setup();
    expect(container.querySelectorAll(".jam-timeline-cell")).toHaveLength(12);
    const groups = container.querySelectorAll(".jam-timeline-group");
    expect(groups).toHaveLength(3);
    for (const group of groups) {
      expect(within(group as HTMLElement).getAllByText(/^\d+$/)).toHaveLength(4);
    }
  });

  it("marks the last bar of the chorus when fills are on, and not when they are off", () => {
    const { container, rerender, props } = setup();
    const marked = container.querySelectorAll(".jam-timeline-cell[data-fill]");
    expect(marked).toHaveLength(1);
    expect(marked[0].textContent).toContain("12");

    rerender(<JamView {...props} jam={jamOf({ fills: false })} />);
    expect(container.querySelectorAll(".jam-timeline-cell[data-fill]")).toHaveLength(0);
  });

  it("marks bar one at rest rather than nothing at all", () => {
    // You are always about to play bar one. An unlit timeline reads as a
    // picture rather than a readout.
    const { container } = setup({ currentBeat: beat(7, 2), isPlaying: false });
    expect(screen.getByText(/bar 1 of 12/)).toBeInTheDocument();
    expect(container.querySelectorAll(".jam-timeline-progress")).toHaveLength(0);
  });

  it("fills the lit bar as the bar goes by", () => {
    const { container } = setup({ currentBeat: beat(2, 1, 1), isPlaying: true });
    const progress = container.querySelector(".jam-timeline-progress") as HTMLElement;
    // Beat two of four: halfway.
    expect(progress.style.transform).toBe("scaleX(0.5)");
  });

  it("letters an AABA and leaves a blues's sections unnamed", () => {
    const { container, rerender, props } = setup();
    expect(container.querySelectorAll(".jam-timeline-name")).toHaveLength(0);

    rerender(<JamView {...props} jam={jamOf({ form: { kind: "aaba32", bars: 32 } })} />);
    expect(
      [...container.querySelectorAll(".jam-timeline-name")].map((n) => n.textContent),
    ).toEqual(["A", "A", "B", "A"]);
  });
});

describe("JamView — the controls", () => {
  it("shows the jam's tempo, not the engine's", () => {
    setup({ jam: jamOf({ bpm: 92 }) });
    expect(screen.getByText("92")).toBeInTheDocument();
  });

  it("offers the eight grooves and marks the one that is loaded", () => {
    const { container } = setup({ jam: jamOf({ grooveId: "bossa" }) });
    const cards = container.querySelectorAll(".jam-cards-groove .jam-card");
    expect(cards).toHaveLength(8);
    const pressed = [...cards].filter((c) => c.getAttribute("aria-pressed") === "true");
    expect(pressed).toHaveLength(1);
    expect(pressed[0].textContent).toContain("Bossa");
  });

  it("draws each groove's glyph from its own pattern", () => {
    // The picture IS the table, so a groove whose pattern changes cannot end
    // up advertising the old one.
    const { container } = setup();
    const glyphs = container.querySelectorAll(".jam-cards-groove .jam-glyph");
    expect(glyphs).toHaveLength(8);
    // Rock eighths is 4 × 2 ticks over three lanes; the bossa is 4 × 4.
    expect(glyphs[0].querySelectorAll("circle")).toHaveLength(8 * 3);
    expect(glyphs[6].querySelectorAll("circle")).toHaveLength(16 * 3);
  });

  it("carries the count-in over to the new groove's meter", () => {
    // One bar of a waltz is three beats, not four. A count-in in the wrong
    // meter lands you on beat two of the first bar.
    const { props } = setup({ jam: jamOf({ grooveId: "rock8", countIn: 4 }) });
    fireEvent.click(screen.getByText("Waltz"));
    expect(props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 3 });
  });

  it("leaves a count-in of none alone when the groove changes", () => {
    const { props } = setup({ jam: jamOf({ grooveId: "rock8", countIn: 0 }) });
    fireEvent.click(screen.getByText("Waltz"));
    expect(props.onEdit).toHaveBeenCalledWith({ grooveId: "waltz", countIn: 0 });
  });

  it("offers a count-in only in whole bars the engine will actually take", () => {
    // Two bars of 6/8 is twelve beats, past `arm_count_in`'s limit of eight.
    // Offering it and clamping it would put a lie on the button.
    const { container } = setup({ jam: jamOf({ grooveId: "sixEight", countIn: 6 }) });
    const groups = [...container.querySelectorAll(".jam-segmented")];
    const countIn = groups.find((g) => g.getAttribute("aria-label") === "Count-in")!;
    expect(countIn.querySelectorAll(".accent-option")).toHaveLength(2);
  });

  it("switches the form and keeps the length the timeline was showing", () => {
    const { props } = setup();
    fireEvent.click(screen.getByText("Your own"));
    expect(props.onEdit).toHaveBeenCalledWith({ form: { kind: "custom", bars: 12 } });
  });

  it("shows the bar stepper only on a form of your own", () => {
    const { container, rerender, props } = setup();
    expect(container.querySelector(".jam-bars")).toBeNull();

    rerender(<JamView {...props} jam={jamOf({ form: { kind: "custom", bars: 5 } })} />);
    expect(container.querySelector(".jam-bars")).not.toBeNull();
    fireEvent.click(screen.getByLabelText("More bars"));
    expect(props.onEdit).toHaveBeenCalledWith({ form: { kind: "custom", bars: 6 } });
  });

  it("holds the bar stepper inside 1..64", () => {
    const { rerender, props } = setup({ jam: jamOf({ form: { kind: "custom", bars: 1 } }) });
    expect(screen.getByLabelText("Fewer bars")).toBeDisabled();

    rerender(<JamView {...props} jam={jamOf({ form: { kind: "custom", bars: 64 } })} />);
    expect(screen.getByLabelText("More bars")).toBeDisabled();
  });

  it("turns the fills off and on from one switch", () => {
    const { props } = setup();
    const fills = screen.getByRole("switch");
    expect(fills).toHaveAttribute("aria-checked", "true");
    fireEvent.click(fills);
    expect(props.onEdit).toHaveBeenCalledWith({ fills: false });
  });

  it("says what a band through speakers does to the score", () => {
    // JAM_MODE §3, principle 5 — the one line on this screen that is there to
    // stop a flattered score from going unexplained.
    setup();
    expect(screen.getByText("Headphones keep the score honest.")).toBeInTheDocument();
  });
});
