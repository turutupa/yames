import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChordDiagram } from "./ChordDiagram";
import { shapesFor } from "../../jam/chordShapes";

function shape(root: number, quality: Parameters<typeof shapesFor>[1], shapeId: string) {
  const found = shapesFor(root, quality).find((s) => s.shapeId === shapeId);
  if (!found) throw new Error("no shape " + shapeId);
  return found;
}

/**
 * A chord box is a promise about where your fingers go. These assert the
 * promise is drawn: one dot per fretted string, an × over every string you
 * damp, an o over every one you let ring, and — the one a player notices
 * instantly when it is missing — the fret number beside a shape that does
 * not start at the nut.
 */
describe("ChordDiagram", () => {
  it("draws open C with three dots, one muted string and two open ones", () => {
    render(<ChordDiagram shape={shape(0, "maj", "open-c")} />);
    expect(screen.getAllByTestId("chord-dot")).toHaveLength(3);
    expect(screen.getAllByTestId("chord-mute")).toHaveLength(1);
    expect(screen.getAllByTestId("chord-open")).toHaveLength(2);
    expect(screen.getByTestId("chord-mute").textContent).toBe("×");
  });

  it("draws the nut, and no fret number, when the shape sits at the top", () => {
    render(<ChordDiagram shape={shape(5, "maj", "maj-e-form")} />);
    expect(screen.getByTestId("chord-nut")).toBeInTheDocument();
    expect(screen.queryByTestId("chord-base-fret")).toBeNull();
  });

  it("says which fret it is when the shape is up the neck", () => {
    render(<ChordDiagram shape={shape(9, "maj", "maj-e-form")} />);
    expect(screen.queryByTestId("chord-nut")).toBeNull();
    expect(screen.getByTestId("chord-base-fret").textContent).toBe("5");
  });

  it("draws a dot for every fretted string and nothing for the rest", () => {
    for (const placed of shapesFor(2, "m7")) {
      const { unmount } = render(<ChordDiagram shape={placed} />);
      const fretted = placed.frets.filter((f) => f !== null && f > 0).length;
      const muted = placed.frets.filter((f) => f === null).length;
      const open = placed.frets.filter((f) => f === 0).length;
      expect(screen.getAllByTestId("chord-dot")).toHaveLength(fretted);
      expect(screen.queryAllByTestId("chord-mute")).toHaveLength(muted);
      expect(screen.queryAllByTestId("chord-open")).toHaveLength(open);
      unmount();
    }
  });

  it("draws the barre once, across the strings the grip actually covers", () => {
    const barre = shape(5, "maj", "maj-e-form");
    render(<ChordDiagram shape={barre} />);
    const bar = screen.getByTestId("chord-barre");
    // Six strings, so the bar runs the whole width of the box plus its caps.
    expect(Number(bar.getAttribute("width"))).toBeGreaterThan(50);
  });

  it("names the chord above the box, and can be told not to", () => {
    const { unmount } = render(<ChordDiagram shape={shape(0, "maj", "open-c")} />);
    expect(screen.getByTestId("chord-name").textContent).toBe("C");
    unmount();
    render(<ChordDiagram shape={shape(0, "maj", "open-c")} showName={false} />);
    expect(screen.queryByTestId("chord-name")).toBeNull();
  });

  it("drops the finger numbers at 64px, where they would only smudge", () => {
    const { unmount } = render(<ChordDiagram shape={shape(0, "maj", "open-c")} size="xs" />);
    expect(screen.queryAllByTestId("chord-finger")).toHaveLength(0);
    const svg = screen.getByRole("img");
    expect(svg.getAttribute("width")).toBe("64");
    unmount();
    render(<ChordDiagram shape={shape(0, "maj", "open-c")} size="sm" />);
    expect(screen.getAllByTestId("chord-finger")).toHaveLength(3);
  });

  it("draws a bass shape on four strings", () => {
    const [placed] = shapesFor(9, "maj", { instrument: "bass" });
    render(<ChordDiagram shape={placed} />);
    const strings = screen.getByRole("img").querySelectorAll(".chord-diagram-string");
    expect(strings).toHaveLength(4);
  });

  it("tells a screen reader what it is", () => {
    render(<ChordDiagram shape={shape(0, "maj", "open-c")} />);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("C, open C");
  });
});
