import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KeyChordsStrip } from "./KeyChordsStrip";

/**
 * The strip is the answer to "what can I play in this key", so the test that
 * matters is that it shows the right chords — all seven of a major key, the
 * five of a blues — and that turning on sevenths swaps them rather than
 * adding a second row of fourteen.
 */
describe("KeyChordsStrip", () => {
  it("shows the seven chords of a major key", async () => {
    render(<KeyChordsStrip root={9} mode="major" />);
    const chords = screen.getAllByTestId("key-chord");
    expect(chords).toHaveLength(7);
    expect(chords.map((c) => c.getAttribute("aria-label"))).toEqual([
      "A",
      "Bm",
      "C#m",
      "D",
      "E",
      "F#m",
      "G#dim",
    ]);
  });

  it("shows a blues as three dominants and two passing chords", () => {
    render(<KeyChordsStrip root={9} mode="blues" />);
    const chords = screen.getAllByTestId("key-chord");
    expect(chords.map((c) => c.getAttribute("aria-label"))).toEqual(["A7", "D7", "E7", "C", "G"]);
  });

  it("gives every chord a diagram", () => {
    render(<KeyChordsStrip root={0} mode="minor" />);
    expect(screen.getAllByTestId("chord-diagram").length).toBe(
      screen.getAllByTestId("key-chord").length,
    );
  });

  it("swaps the triads for sevenths rather than showing both", async () => {
    const user = userEvent.setup();
    render(<KeyChordsStrip root={0} mode="major" />);
    await user.click(screen.getByTestId("key-chords-sevenths"));
    const chords = screen.getAllByTestId("key-chord");
    expect(chords).toHaveLength(7);
    expect(chords.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Cmaj7",
      "Dm7",
      "Em7",
      "Fmaj7",
      "G7",
      "Am7",
      "Bm7b5",
    ]);
  });

  it("lights the chord the jam is on", () => {
    render(<KeyChordsStrip root={9} mode="major" current={{ root: 2, quality: "maj" }} />);
    const lit = screen.getAllByTestId("key-chord").filter((c) => c.className.includes("is-current"));
    expect(lit).toHaveLength(1);
    expect(lit[0].getAttribute("aria-label")).toBe("D");
  });

  it("hands the chord back when one is picked", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<KeyChordsStrip root={9} mode="major" onPick={onPick} />);
    await user.click(screen.getAllByTestId("key-chord")[4]);
    expect(onPick).toHaveBeenCalledWith({ root: 4, quality: "maj" });
  });

  it("colours the roles so the shape of the key reads before the names do", () => {
    render(<KeyChordsStrip root={0} mode="major" />);
    const roles = screen.getAllByTestId("key-chord").map((c) => {
      const match = /key-chord-(home|subdominant|dominant|passing)/.exec(c.className);
      return match ? match[1] : null;
    });
    expect(roles).toEqual([
      "home",
      "subdominant",
      "home",
      "subdominant",
      "dominant",
      "home",
      "dominant",
    ]);
  });

  it("lets the sevenths toggle be driven from outside", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<KeyChordsStrip root={0} mode="major" sevenths={false} onSeventhsChange={onChange} />);
    await user.click(screen.getByTestId("key-chords-sevenths"));
    expect(onChange).toHaveBeenCalledWith(true);
    // Controlled: the strip did not move on its own.
    expect(screen.getAllByTestId("key-chord")[0].getAttribute("aria-label")).toBe("C");
  });
});
