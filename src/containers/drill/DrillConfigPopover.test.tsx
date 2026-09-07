import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { DrillConfigPopover, DrillNumberField, DrillPopoverRow } from "./DrillConfigPopover";

/**
 * The settings window (Drill.dc.html), which replaced the "All settings"
 * disclosure and its eight permanent stepper rows.
 *
 * Position is not asserted here: jsdom reports every rect as zero, so a test
 * of the placement maths would be a test of the zeroes. What is asserted is
 * everything a broken window would still look fine while failing at — the
 * ways it closes, and the number field's commit rule.
 */

afterEach(cleanup);

function open(onClose = vi.fn()) {
  const anchor = document.createElement("button");
  document.body.appendChild(anchor);
  const view = render(
    <DrillConfigPopover anchor={anchor} onClose={onClose} label="Speed up" note="9 steps">
      <DrillPopoverRow label="Speed up" tip="BPM added each up-step.">
        <button>inside</button>
      </DrillPopoverRow>
    </DrillConfigPopover>,
  );
  return { anchor, onClose, ...view };
}

describe("DrillConfigPopover", () => {
  it("is a named dialog holding its rows and its note", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Speed up" });
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveTextContent("9 steps");
    expect(screen.getByText("BPM added each up-step.")).toBeInTheDocument();
  });

  it("closes on Escape, and does not let the press reach the app", () => {
    const onClose = vi.fn();
    const appEscape = vi.fn();
    document.addEventListener("keydown", appEscape);
    open(onClose);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
    // The app's own Escape leaves Zen and closes the sidebar. Firing both on
    // one press would close the window and the screen behind it.
    expect(appEscape).not.toHaveBeenCalled();
    document.removeEventListener("keydown", appEscape);
  });

  it("closes on a click outside itself", () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalled();
  });

  it("stays open when the click is inside it", () => {
    const onClose = vi.fn();
    open(onClose);
    fireEvent.pointerDown(screen.getByText("inside"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("leaves a click on its own token to the token", () => {
    // The anchor toggles through its own onClick. Closing here as well would
    // close and immediately reopen, so the window would never shut.
    const onClose = vi.fn();
    const { anchor } = open(onClose);
    fireEvent.pointerDown(anchor);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("DrillNumberField", () => {
  const field = (onCommit = vi.fn(), value = 300) =>
    render(
      <DrillNumberField
        value={value}
        min={80}
        max={300}
        label="Target BPM"
        onCommit={onCommit}
      />,
    ) && onCommit;

  it("does not clamp a half-typed number", () => {
    // The bug: with a floor of 80, selecting "300" and typing "1" used to
    // clamp to 80 before the "2" and the "0" arrived, so 120 could not be
    // reached from the keyboard at all.
    const onCommit = field();
    const input = screen.getByLabelText("Target BPM");
    fireEvent.change(input, { target: { value: "1" } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(1);
    fireEvent.change(input, { target: { value: "120" } });
    fireEvent.blur(input, { target: { value: "120" } });
    expect(onCommit).toHaveBeenCalledWith(120);
  });

  it("enforces the range on commit, not before", () => {
    const onCommit = field();
    const input = screen.getByLabelText("Target BPM");
    fireEvent.change(input, { target: { value: "9" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith(80);
  });

  it("reverts an emptied box rather than committing a zero", () => {
    const onCommit = field();
    const input = screen.getByLabelText("Target BPM");
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(input).toHaveValue(300);
  });

  it("steps by the step size and stops at the ends", () => {
    const onCommit = vi.fn();
    render(
      <DrillNumberField
        value={85}
        min={80}
        max={300}
        step={5}
        label="Start BPM"
        onCommit={onCommit}
      />,
    );
    fireEvent.click(screen.getByLabelText("Start BPM −5"));
    expect(onCommit).toHaveBeenCalledWith(80);
    fireEvent.click(screen.getByLabelText("Start BPM +5"));
    expect(onCommit).toHaveBeenCalledWith(90);
  });

  it("disables the end a value has already reached", () => {
    render(
      <DrillNumberField value={80} min={80} max={300} label="Start BPM" onCommit={vi.fn()} />,
    );
    expect(screen.getByLabelText("Start BPM −1")).toBeDisabled();
    expect(screen.getByLabelText("Start BPM +1")).not.toBeDisabled();
  });
});
