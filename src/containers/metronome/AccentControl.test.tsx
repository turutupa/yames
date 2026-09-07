import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AccentControl } from "./AccentControl";
import { mockInvoke } from "../../test/mocks";

/**
 * U2.3, finally built. The artboard drew this from the start and it stayed
 * unbuilt because two of its three states had nothing behind them: the engine
 * accented where beat groups opened and nowhere else, and the only way to hear
 * a bar without accents was to give up the grouping by switching to FREE.
 *
 * What these lock is the contract with Rust — the strings `set_accent_mode`
 * accepts — and that the control always shows a selection.
 */

afterEach(cleanup);

describe("AccentControl", () => {
  it("offers exactly the three the engine knows", () => {
    render(<AccentControl mode="groups" />);
    expect(screen.getByText("Group starts")).toBeInTheDocument();
    expect(screen.getByText("Every beat")).toBeInTheDocument();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("sends the mode the engine parses", () => {
    // These strings are the contract: `AccentMode::from_str` in engine.rs
    // matches on them and falls back to groups for anything else, so a typo
    // here would silently do nothing rather than fail.
    render(<AccentControl mode="groups" />);
    fireEvent.click(screen.getByText("Every beat"));
    expect(mockInvoke).toHaveBeenCalledWith("set_accent_mode", { mode: "all" });
    fireEvent.click(screen.getByText("None"));
    expect(mockInvoke).toHaveBeenCalledWith("set_accent_mode", { mode: "none" });
    fireEvent.click(screen.getByText("Group starts"));
    expect(mockInvoke).toHaveBeenCalledWith("set_accent_mode", { mode: "groups" });
  });

  it("marks the current mode, for the eye and for assistive tech", () => {
    const { container } = render(<AccentControl mode="all" />);
    const active = [...container.querySelectorAll(".accent-option.active")];
    expect(active.map((b) => b.textContent)).toEqual(["Every beat"]);
    expect(screen.getByText("Every beat").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("None").getAttribute("aria-pressed")).toBe("false");
  });

  it("always shows a selection, even from a state written before it existed", () => {
    // Rust's serde default fills the field on the way out, but a store written
    // by an older build reaches the first render without it. Nothing selected
    // would read as broken.
    const { container } = render(
      <AccentControl mode={undefined as unknown as "groups"} />,
    );
    const active = [...container.querySelectorAll(".accent-option.active")];
    expect(active.map((b) => b.textContent)).toEqual(["Group starts"]);
  });
});
