import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChordShapesRow } from "./ChordShapesRow";
import { shapesFor } from "../../jam/chordShapes";

/**
 * One chord at a time, its shapes in neck order, and a next button the other
 * hand can reach. The assertions below are the three things that break the
 * promise if they go: the wrong shapes, the wrong order, or a selection the
 * screen around this never hears about.
 */
describe("ChordShapesRow", () => {
  it("shows every shape the library has for the chord", () => {
    render(<ChordShapesRow root={9} quality="maj" />);
    expect(screen.getAllByTestId("chord-shape")).toHaveLength(shapesFor(9, "maj").length);
  });

  it("runs up the neck, lowest first", () => {
    render(<ChordShapesRow root={9} quality="7" />);
    const expected = shapesFor(9, "7").map((s) => s.name);
    expect(screen.getAllByTestId("chord-shape").map((b) => b.getAttribute("title"))).toEqual(expected);
  });

  it("labels each shape with how full it is and where it sits", () => {
    render(<ChordShapesRow root={0} quality="maj" />);
    const first = screen.getAllByTestId("chord-shape")[0];
    expect(first.textContent).toContain("open");
  });

  it("starts on the shape nearest the nut", () => {
    render(<ChordShapesRow root={9} quality="maj" />);
    expect(screen.getAllByTestId("chord-shape")[0].getAttribute("aria-selected")).toBe("true");
  });

  it("reports the shape a player picks", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ChordShapesRow root={9} quality="maj" onSelect={onSelect} />);
    await user.click(screen.getAllByTestId("chord-shape")[2]);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toBe(2);
    expect(onSelect.mock.calls[0][1].id).toBe(shapesFor(9, "maj")[2].id);
    expect(screen.getAllByTestId("chord-shape")[2].getAttribute("aria-selected")).toBe("true");
  });

  it("walks to the next shape, and wraps at the top of the neck", async () => {
    const user = userEvent.setup();
    const count = shapesFor(2, "m7").length;
    render(<ChordShapesRow root={2} quality="m7" />);
    const next = screen.getByTestId("chord-shapes-next");
    for (let i = 0; i < count; i++) await user.click(next);
    expect(screen.getAllByTestId("chord-shape")[0].getAttribute("aria-selected")).toBe("true");
  });

  it("lets the selection be driven from outside", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<ChordShapesRow root={9} quality="maj" selectedIndex={1} onSelect={onSelect} />);
    expect(screen.getAllByTestId("chord-shape")[1].getAttribute("aria-selected")).toBe("true");
    await user.click(screen.getAllByTestId("chord-shape")[3]);
    expect(onSelect).toHaveBeenCalledWith(3, expect.objectContaining({ id: expect.any(String) }));
    // Controlled: it did not move itself.
    expect(screen.getAllByTestId("chord-shape")[1].getAttribute("aria-selected")).toBe("true");
  });

  it("shows the bass its own shapes", () => {
    render(<ChordShapesRow root={9} quality="maj" instrument="bass" />);
    expect(screen.getAllByTestId("chord-shape")).toHaveLength(
      shapesFor(9, "maj", { instrument: "bass" }).length,
    );
    const strings = screen.getAllByRole("img")[0].querySelectorAll(".chord-diagram-string");
    expect(strings).toHaveLength(4);
  });

  it("takes its words from outside, so the app can translate them", () => {
    render(
      <ChordShapesRow
        root={0}
        quality="maj"
        nextLabel="Forma siguiente"
        sizeLabels={{ triad: "tríada", open: "abierto", barre: "cejilla", seventh: "séptima" }}
      />,
    );
    expect(screen.getByTestId("chord-shapes-next").textContent).toBe("Forma siguiente");
    expect(screen.getAllByTestId("chord-shape")[0].textContent).toContain("abierto");
  });
});
