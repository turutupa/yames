/**
 * The Jam tab standing up cold (JAM_KILLER §2 A4).
 *
 * Small, and about one thing: the order of the two buttons. **Jam now** is
 * first because it is the only one that costs nothing to press, and "New jam"
 * is still there because a player who came to build something should not have
 * to press the wrong button first. A build without the one-tap door falls
 * back to exactly the screen this was before it.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { JamEmpty } from "./JamEmpty";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the empty Jam screen", () => {
  it("offers to just play, above the way into the library", () => {
    const onNew = vi.fn();
    const onJamNow = vi.fn();
    const { container } = render(<JamEmpty onNew={onNew} onJamNow={onJamNow} />);

    const buttons = Array.from(container.querySelectorAll("button"));
    expect(buttons.map((b) => b.textContent)).toEqual(["Jam now", "New jam"]);

    fireEvent.click(screen.getByRole("button", { name: "Jam now" }));
    expect(onJamNow).toHaveBeenCalledTimes(1);
    expect(onNew).not.toHaveBeenCalled();
  });

  it("still says what a jam is before offering to make one", () => {
    render(<JamEmpty onNew={vi.fn()} onJamNow={vi.fn()} />);
    // The lead is the screen's oldest decision and Jam now does not replace
    // it: this is a word a player knows from a garage, not from a metronome.
    expect(screen.getByText(/A jam is a band to play over/)).toBeInTheDocument();
  });

  it("is the screen it always was on a build with no Jam now", () => {
    const onNew = vi.fn();
    const { container } = render(<JamEmpty onNew={onNew} />);
    expect(container.querySelectorAll("button")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "New jam" }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });
});
