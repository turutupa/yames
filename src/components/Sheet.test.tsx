/**
 * The bottom sheet, and the one thing about it that is not cosmetic: it must
 * not take focus away from what is inside it.
 *
 * M05 found a preset could not be saved on a phone. The name field appears,
 * takes focus, and commits on blur — and the sheet was moving focus back to
 * its own panel on every render of the screen behind it, which with the
 * metronome running is twice a second. The field was blurred within a beat of
 * appearing and the empty name cancelled the save, every time.
 */
import "../test/mobileFlag"; // MUST be first — the sheet only exists on mobile.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Sheet } from "./Sheet";

function open(onClose: () => void) {
  return (
    <Sheet open onClose={onClose} title="Library">
      <input data-testid="field" />
    </Sheet>
  );
}

describe("Sheet", () => {
  it("focuses its panel when it opens", () => {
    render(open(() => {}));
    expect(document.activeElement).toBe(document.querySelector(".sheet"));
  });

  it("leaves focus alone when the screen behind it re-renders", () => {
    // A fresh arrow every render, which is what every call site passes.
    const view = render(open(() => {}));

    const field = screen.getByTestId("field");
    field.focus();
    expect(document.activeElement).toBe(field);

    // Three renders of the parent, a new `onClose` identity each time — a
    // second and a half of a running metronome.
    for (let i = 0; i < 3; i++) view.rerender(open(() => {}));

    expect(document.activeElement).toBe(field);
  });

  it("still closes on Escape after the parent has re-rendered", () => {
    // The handler reads the callback through a ref now, so the one registered
    // when the sheet opened must still reach the newest closure.
    const stale = vi.fn();
    const view = render(open(stale));
    const fresh = vi.fn();
    view.rerender(open(fresh));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });
});
