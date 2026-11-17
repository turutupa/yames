import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { InstrumentNote } from "./InstrumentNote";

afterEach(cleanup);

function renderNote(instrument: string) {
  const onOpenTools = vi.fn();
  const onChangeInstrument = vi.fn();
  render(
    <InstrumentNote
      instrument={instrument}
      onOpenTools={onOpenTools}
      onChangeInstrument={onChangeInstrument}
    />,
  );
  return { onOpenTools, onChangeInstrument };
}

/** Guitar first (owner, 2026-11-17): a calm note for anyone not on a guitar. */
describe("the guitar-first note", () => {
  it("is not there for either guitar", () => {
    for (const id of ["electric-guitar", "acoustic-guitar"]) {
      renderNote(id);
      expect(screen.queryByTestId("instrument-note"), id).toBeNull();
      cleanup();
    }
  });

  it("tells a drummer the Paths are for guitar and the tools are for them", () => {
    renderNote("drums");
    const note = screen.getByTestId("instrument-note");
    expect(note).toHaveTextContent("Paths are written for guitar for now");
    expect(note).toHaveTextContent("The tools work for your instrument");
    expect(note).not.toHaveTextContent("bass");
  });

  it("tells a bassist bass Paths are planned", () => {
    renderNote("bass");
    expect(screen.getByTestId("instrument-note")).toHaveAttribute("data-fit", "bass");
    expect(screen.getByTestId("instrument-note")).toHaveTextContent("bass Paths are planned");
  });

  it("links to the tools and to the instrument setting, and blocks nothing", () => {
    const { onOpenTools, onChangeInstrument } = renderNote("piano");
    fireEvent.click(screen.getByTestId("instrument-note-tools"));
    fireEvent.click(screen.getByTestId("instrument-note-change"));
    expect(onOpenTools).toHaveBeenCalledTimes(1);
    expect(onChangeInstrument).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("note")).toBeInTheDocument();
  });
});
