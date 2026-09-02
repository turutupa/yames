/**
 * The overlay: what it renders for a stop, how it measures the target, and
 * the ←/→/Esc contract.
 *
 * happy-dom has no layout engine, so `getBoundingClientRect` is stubbed where
 * a real rect matters. Everything the *placement* does with that rect is
 * covered by `anchor.test.ts` against the pure function.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { HOTKEYS } from "../../../hotkeys";
import { Tour, comboFor, measureTarget, type TourProps } from "./Tour";
import { TOUR_STOPS } from "./stops";

function setup(overrides: Partial<TourProps> = {}) {
  const props: TourProps = {
    open: true,
    index: 0,
    stop: TOUR_STOPS[0],
    total: TOUR_STOPS.length,
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
  const utils = render(<Tour {...props} />);
  return { ...utils, props };
}

/** Give one `data-tour` element a rect happy-dom would otherwise report as 0. */
function withRect(id: string, rect: { x: number; y: number; w: number; h: number }) {
  const el = document.createElement("div");
  el.setAttribute("data-tour", id);
  el.getBoundingClientRect = () =>
    ({
      left: rect.x,
      top: rect.y,
      right: rect.x + rect.w,
      bottom: rect.y + rect.h,
      width: rect.w,
      height: rect.h,
      x: rect.x,
      y: rect.y,
      toJSON: () => ({}),
    }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

describe("Tour — rendering", () => {
  it("renders nothing when closed or without a stop", () => {
    const { container } = setup({ open: false });
    expect(container.querySelector(".tour-overlay")).toBeNull();
    const b = setup({ stop: null });
    expect(b.container.querySelector(".tour-overlay")).toBeNull();
  });

  it("is a modal dialog labelled by the stop title", () => {
    setup();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("heading", { name: "Tempo" })).toBeInTheDocument();
    expect(
      screen.getByText("Drag, scroll, type, or tap the tempo."),
    ).toBeInTheDocument();
  });

  it("shows 'n of 6' progress", () => {
    setup({ index: 1, stop: TOUR_STOPS[1] });
    expect(screen.getByText("2 of 6")).toBeInTheDocument();
  });

  it("tags the overlay with the stop id", () => {
    const { container } = setup({ index: 3, stop: TOUR_STOPS[3] });
    expect(container.querySelector(".tour-overlay")).toHaveAttribute(
      "data-stop",
      "drill-tab",
    );
  });

  it("offers Done instead of Next on the last stop", () => {
    setup({ index: 5, stop: TOUR_STOPS[5] });
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });

  it("disables Back on the first stop", () => {
    setup();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });

  it("drops the easing when view transitions are off", () => {
    const { container } = setup({ animate: false });
    expect(container.querySelector(".tour-overlay")).toHaveClass("no-motion");
  });
});

describe("Tour — hotkeys on the card", () => {
  it("prints the default binding for each of the stop's actions", () => {
    setup();
    // Stop 1 is BPM up / down.
    const up = HOTKEYS.find((h) => h.id === "bpm-up")!.key;
    const down = HOTKEYS.find((h) => h.id === "bpm-down")!.key;
    expect(screen.getByText(up)).toBeInTheDocument();
    expect(screen.getByText(down)).toBeInTheDocument();
  });

  it("prefers the user's own binding over the default", () => {
    setup({ keyBindings: { "bpm-up": "K" } });
    expect(screen.getByText("K")).toBeInTheDocument();
  });

  it("comboFor falls back to the hotkeys.ts default", () => {
    expect(comboFor("toggle-sidebar")).toBe(
      HOTKEYS.find((h) => h.id === "toggle-sidebar")!.key,
    );
    expect(comboFor("toggle-sidebar", { "toggle-sidebar": "Q" })).toBe("Q");
  });

  it("every stop names actions that exist in hotkeys.ts", () => {
    for (const stop of TOUR_STOPS) {
      for (const action of stop.keys) {
        expect(
          HOTKEYS.find((h) => h.id === action),
          `${stop.id} references unknown action ${action}`,
        ).toBeTruthy();
      }
    }
  });
});

describe("Tour — keyboard navigation", () => {
  it("→ advances, ← goes back, Esc closes", () => {
    const { props } = setup({ index: 2, stop: TOUR_STOPS[2] });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(props.onNext).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(props.onPrev).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores the keyboard once closed", () => {
    const { props } = setup({ open: false });
    fireEvent.keyDown(document, { key: "ArrowRight" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(props.onNext).not.toHaveBeenCalled();
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("swallows other app hotkeys so nothing fires behind the overlay", () => {
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    setup();
    fireEvent.keyDown(document, { key: "z" });
    document.removeEventListener("keydown", behind);
    expect(behind).not.toHaveBeenCalled();
  });

  it("focuses the card so the arrow keys work without a click", () => {
    const { container } = setup();
    expect(document.activeElement).toBe(container.querySelector(".tour-card"));
  });

  it("the footer buttons drive the same callbacks", () => {
    const { props } = setup({ index: 1, stop: TOUR_STOPS[1] });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip tour" }));
    expect(props.onNext).toHaveBeenCalled();
    expect(props.onPrev).toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalled();
  });
});

describe("Tour — measurement", () => {
  it("measureTarget unions every element carrying the id", () => {
    const a = withRect("zen-widget", { x: 100, y: 10, w: 20, h: 20 });
    const b = withRect("zen-widget", { x: 200, y: 10, w: 20, h: 20 });
    expect(measureTarget("zen-widget")).toEqual({
      x: 100,
      y: 10,
      width: 120,
      height: 20,
    });
    a.remove();
    b.remove();
  });

  it("measureTarget is null when the target is not on screen", () => {
    expect(measureTarget("nothing-here")).toBeNull();
  });

  it("cuts a hole around the measured target", () => {
    const el = withRect("bpm", { x: 100, y: 200, w: 160, h: 60 });
    const { container } = setup();
    const hole = container.querySelector(".tour-hole") as SVGRectElement | null;
    expect(hole).not.toBeNull();
    // 8px of padding on every side (SPOTLIGHT_PAD).
    expect(hole!.getAttribute("x")).toBe("92");
    expect(hole!.getAttribute("y")).toBe("192");
    expect(hole!.getAttribute("width")).toBe("176");
    expect(hole!.getAttribute("height")).toBe("76");
    el.remove();
  });

  it("still shows the card (centred, no hole) when the target is missing", () => {
    const { container } = setup();
    expect(container.querySelector(".tour-hole")).toBeNull();
    expect(container.querySelector(".tour-card")).toHaveAttribute(
      "data-placement",
      "center",
    );
  });
});
