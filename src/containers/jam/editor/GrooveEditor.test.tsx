/**
 * The groove editor.
 *
 * These lock in the two things the design is actually about: that the columns
 * follow the meter (a 12-column triplet bar is four groups of three, not one
 * run of twelve), and that the grid is playable without a mouse. A test that
 * only counted cells would pass against a barcode.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { JamCustomGroove } from "../../../jam/types";
import { emptyPattern } from "./editorModel";
import { GrooveEditor } from "./GrooveEditor";

function groove(over: Partial<JamCustomGroove> = {}): JamCustomGroove {
  return {
    name: "Shuffle",
    beatsPerBar: 4,
    ticksPerBeat: 3,
    bar: emptyPattern(4, 3),
    fill: null,
    ...over,
  };
}

function setup(over: Partial<Parameters<typeof GrooveEditor>[0]> = {}) {
  const props = {
    value: groove(),
    onChange: vi.fn(),
    playingTick: null,
    page: "bar" as const,
    onPageChange: vi.fn(),
    onDone: vi.fn(),
    onReset: vi.fn(),
    ...over,
  };
  return { ...render(<GrooveEditor {...props} />), props };
}

const cells = (container: HTMLElement) =>
  [...container.querySelectorAll(".jam-editor__cell:not(.jam-editor__swatch)")] as HTMLElement[];

const cell = (lane: number, tick: number) =>
  document.querySelector<HTMLButtonElement>(
    `[data-lane="${lane}"][data-tick="${tick}"]`,
  )!;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the columns follow the meter", () => {
  it("draws a 12-column triplet bar as 4 groups of 3, on every lane", () => {
    const { container } = setup();
    const rows = [...container.querySelectorAll(".jam-editor__row")];
    // Four lanes plus the row of beat numbers.
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      const groups = [...row.querySelectorAll(".jam-editor__group")];
      expect(groups).toHaveLength(4);
      for (const group of groups) expect(group.children).toHaveLength(3);
    }
    expect(cells(container)).toHaveLength(4 * 12);
  });

  it("redraws for a different meter", () => {
    const { container } = setup({
      value: groove({ beatsPerBar: 3, ticksPerBeat: 4, bar: emptyPattern(3, 4) }),
    });
    expect(cells(container)).toHaveLength(4 * 12);
    const beatRow = container.querySelector(".jam-editor__row--beats")!;
    expect([...beatRow.querySelectorAll(".jam-editor__group")]).toHaveLength(3);
  });

  it("numbers the beats over the first column of each group and mutes the sub-ticks", () => {
    const { container } = setup();
    const beatRow = container.querySelector(".jam-editor__row--beats")!;
    expect(
      [...beatRow.querySelectorAll(".jam-editor__beat-num")].map(
        (n) => n.textContent,
      ),
    ).toEqual(["1", "2", "3", "4"]);
    expect(
      [...beatRow.querySelectorAll(".jam-editor__tick-label")]
        .slice(0, 2)
        .map((n) => n.textContent),
    ).toEqual(["trip", "let"]);
  });

  it("draws the middle of every triplet quieter, and leaves it clickable", () => {
    const { container, props } = setup();
    const quiet = [...container.querySelectorAll(".jam-editor__cell--quiet")];
    // One per beat, per lane.
    expect(quiet).toHaveLength(4 * 4);
    fireEvent.click(cell(0, 1));
    expect(props.onChange).toHaveBeenCalledTimes(1);
  });

  it("names the meter over the grid", () => {
    setup();
    expect(
      screen.getByText("4 beats in triplets · the columns follow the meter"),
    ).toBeInTheDocument();
  });
});

describe("clicking a cell", () => {
  it("cycles off → hit → accent → ghost → off", () => {
    const levels: number[] = [];
    let value = groove();
    const onChange = vi.fn((next: JamCustomGroove) => {
      value = next;
      levels.push(next.bar.hat[0]);
    });
    const { rerender } = render(
      <GrooveEditor
        value={value}
        onChange={onChange}
        playingTick={null}
        page="bar"
        onPageChange={vi.fn()}
        onDone={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    for (let i = 0; i < 4; i++) {
      fireEvent.click(cell(0, 0));
      rerender(
        <GrooveEditor
          value={value}
          onChange={onChange}
          playingTick={null}
          page="bar"
          onPageChange={vi.fn()}
          onDone={vi.fn()}
          onReset={vi.fn()}
        />,
      );
    }
    expect(levels).toEqual([1, 2, 3, 0]);
  });

  it("goes backwards on shift-click", () => {
    const { props } = setup();
    fireEvent.click(cell(1, 4), { shiftKey: true });
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        bar: expect.objectContaining({
          snare: expect.arrayContaining([]),
        }),
      }),
    );
    const next = props.onChange.mock.calls[0][0] as JamCustomGroove;
    expect(next.bar.snare[4]).toBe(3);
  });

  it("writes only the cell that was clicked", () => {
    const { props } = setup();
    fireEvent.click(cell(2, 6));
    const next = props.onChange.mock.calls[0][0] as JamCustomGroove;
    expect(next.bar.kick[6]).toBe(1);
    expect(next.bar.kick.filter((level) => level !== 0)).toHaveLength(1);
    expect(next.bar.snare.every((level) => level === 0)).toBe(true);
    expect(next.name).toBe("Shuffle");
  });
});

describe("without a mouse", () => {
  it("arrow keys move the focus ring between cells", () => {
    setup();
    const first = cell(0, 0);
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();

    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(0, 1));
    expect(cell(0, 1)).toHaveAttribute("tabindex", "0");
    expect(cell(0, 0)).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(cell(0, 1), { key: "ArrowDown" });
    expect(document.activeElement).toBe(cell(1, 1));

    fireEvent.keyDown(cell(1, 1), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell(1, 0));

    fireEvent.keyDown(cell(1, 0), { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell(0, 0));
  });

  it("stops at the edges rather than wrapping into the wrong lane", () => {
    setup();
    const first = cell(0, 0);
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(cell(0, 0));
    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(document.activeElement).toBe(cell(0, 0));
    fireEvent.keyDown(first, { key: "End" });
    expect(document.activeElement).toBe(cell(0, 11));
    fireEvent.keyDown(cell(0, 11), { key: "ArrowRight" });
    expect(document.activeElement).toBe(cell(0, 11));
  });

  it("space cycles the focused cell, shift-space cycles it back", () => {
    const { props } = setup();
    const target = cell(0, 0);
    target.focus();
    fireEvent.keyDown(target, { key: "ArrowRight" });
    fireEvent.keyDown(cell(0, 1), { key: " " });
    expect((props.onChange.mock.calls[0][0] as JamCustomGroove).bar.hat[1]).toBe(1);

    fireEvent.keyDown(cell(0, 1), { key: " ", shiftKey: true });
    expect((props.onChange.mock.calls[1][0] as JamCustomGroove).bar.hat[1]).toBe(3);
  });

  it("does not cycle twice from one press", () => {
    const { props } = setup();
    const target = cell(0, 0);
    target.focus();
    // A real browser turns an unhandled Space keydown into a click on a
    // button. The handler calls preventDefault, so it does not.
    const event = new KeyboardEvent("keydown", {
      key: " ",
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(props.onChange).toHaveBeenCalledTimes(1);
  });
});

describe("what a screen reader hears", () => {
  it("labels every cell with its lane, beat, tick and state", () => {
    setup();
    expect(cell(0, 0)).toHaveAttribute("aria-label", "Hat, beat 1, tick 1: off");
    expect(cell(1, 5)).toHaveAttribute(
      "aria-label",
      "Snare, beat 2, tick 3: off",
    );
    expect(cell(3, 11)).toHaveAttribute(
      "aria-label",
      "Ride, beat 4, tick 3: off",
    );
  });

  it("says what a cell became after it changed", () => {
    const bar = emptyPattern(4, 3);
    bar.snare[5] = 2;
    setup({ value: groove({ bar }) });
    expect(cell(1, 5)).toHaveAttribute(
      "aria-label",
      "Snare, beat 2, tick 3: accent",
    );
  });

  it("names the grid, and says which page it is", () => {
    const { rerender, props } = setup();
    expect(screen.getByLabelText("The groove, one bar")).toBeInTheDocument();
    rerender(<GrooveEditor {...props} page="fill" />);
    expect(screen.getByLabelText("The fill, one bar")).toBeInTheDocument();
  });
});

describe("the column being played", () => {
  it("outlines every lane of that tick, and nothing else", () => {
    const { container, rerender, props } = setup();
    expect(container.querySelectorAll(".jam-editor__cell--playing")).toHaveLength(0);
    rerender(<GrooveEditor {...props} playingTick={5} />);
    const lit = [...container.querySelectorAll(".jam-editor__cell--playing")];
    expect(lit).toHaveLength(4);
    expect(lit.every((el) => el.getAttribute("data-tick") === "5")).toBe(true);
  });
});

describe("the bar and the fill", () => {
  it("switches page through the callback rather than on its own", () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    expect(props.onPageChange).toHaveBeenCalledWith("fill");
    expect(screen.getByRole("button", { name: "Bar" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("shows an empty fill to draw on, and the first click creates it", () => {
    const { container, props } = setup({ page: "fill" });
    expect(cells(container).every((c) => c.dataset.level === "0")).toBe(true);
    fireEvent.click(cell(2, 0));
    const next = props.onChange.mock.calls[0][0] as JamCustomGroove;
    expect(next.fill?.kick[0]).toBe(1);
    expect(next.bar.kick[0]).toBe(0);
  });

  it("draws the fill, not the bar, on the fill page", () => {
    const bar = emptyPattern(4, 3);
    bar.kick[0] = 2;
    const fill = emptyPattern(4, 3);
    fill.snare[3] = 1;
    setup({ page: "fill", value: groove({ bar, fill }) });
    expect(cell(2, 0).dataset.level).toBe("0");
    expect(cell(1, 3).dataset.level).toBe("1");
  });
});

describe("the header", () => {
  it("hands a renamed groove back on blur", () => {
    const { props } = setup();
    const name = screen.getByLabelText("Groove name");
    expect(name.textContent).toBe("Shuffle");
    name.textContent = "  My shuffle  ";
    fireEvent.blur(name);
    expect(props.onChange).toHaveBeenCalledWith(
      expect.objectContaining({ name: "My shuffle" }),
    );
  });

  it("refuses a blank name and puts the old one back", () => {
    const { props } = setup();
    const name = screen.getByLabelText("Groove name");
    name.textContent = "   ";
    fireEvent.blur(name);
    expect(props.onChange).not.toHaveBeenCalled();
    expect(name.textContent).toBe("Shuffle");
  });

  it("says the groove is yours, and offers Reset and Done", () => {
    const { props } = setup();
    expect(screen.getByText("Yours")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(props.onReset).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(props.onDone).toHaveBeenCalledTimes(1);
  });

  it("lists the four states in the legend", () => {
    const { container } = setup();
    const legend = container.querySelector(".jam-editor__legend")!;
    expect(
      [...legend.querySelectorAll(".jam-editor__legend-text")].map(
        (el) => el.textContent,
      ),
    ).toEqual(["off", "hit", "accent", "ghost"]);
    expect(within(legend as HTMLElement).getByText("Click a cell to cycle")).toBeInTheDocument();
  });
});
