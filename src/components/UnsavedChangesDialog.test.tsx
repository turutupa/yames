/**
 * The unsaved-changes question names WHAT is unsaved.
 *
 * It can be asked about something that is not on screen — opening a setlist
 * closes a jam edited earlier on the Jam tab — and "Slow blues in A has
 * changes you have not saved" on the setlist screen read as a question about
 * a setlist nobody had made (2026-09-16).
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

function draw(kind: "setlist" | "jam" | "preset") {
  const props = { kind, name: "Slow blues in A", onSave: vi.fn(), onDiscard: vi.fn(), onCancel: vi.fn() };
  return { ...render(<UnsavedChangesDialog {...props} />), props };
}

describe("UnsavedChangesDialog", () => {
  it.each([
    ["jam", "Jam"],
    ["setlist", "Setlist"],
    ["preset", "Metronome"],
  ] as const)("says a %s's changes are a %s's", (kind, label) => {
    const { container } = draw(kind);
    expect(container.querySelector(".unsaved-kind")?.textContent).toBe(label);
    expect(screen.getByRole("alertdialog").textContent).toContain("Slow blues in A");
  });

  it("still answers each button", () => {
    const { props } = draw("jam");
    fireEvent.click(screen.getByText("Discard"));
    expect(props.onDiscard).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Keep editing"));
    expect(props.onCancel).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Save"));
    expect(props.onSave).toHaveBeenCalled();
  });
});
