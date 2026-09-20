/**
 * The key, on the playing screen (2026-09-17).
 *
 * The key used to live only in the setup drawer, and the owner changes key
 * "often for improv purposes" — so the thing worth pinning here is that the
 * chip says the key you are in, that picking a root and picking a mode each
 * report a whole key name back (not half of one), and that the menu stays
 * open while you try a few, since trying a few is the point.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { KeyPicker } from "./KeyPicker";
import { parseKey } from "../../jam/harmony";

afterEach(cleanup);

function setup(key = "A blues") {
  const onPick = vi.fn();
  const utils = render(<KeyPicker value={parseKey(key)!} onPick={onPick} />);
  return { ...utils, onPick };
}

/** The chip, whatever it currently reads. */
function chip(): HTMLElement {
  return screen.getByRole("button", { expanded: false }) as HTMLElement;
}

function open(): HTMLElement {
  fireEvent.click(screen.getAllByRole("button")[0]);
  return screen.getByRole("dialog");
}

describe("the key on the playing screen", () => {
  it("reads the key the band is in", () => {
    setup("A blues");
    expect(chip().textContent).toContain("A blues");
  });

  it("opens a grid of the twelve roots with the current one marked", () => {
    setup("A blues");
    const menu = open();
    const roots = within(menu)
      .getAllByRole("button")
      .filter((b) => b.classList.contains("jam-key"));
    expect(roots).toHaveLength(12);
    expect(roots.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent))
      .toEqual(["A"]);
  });

  it("keeps the mode when you pick a root", () => {
    const { onPick } = setup("A blues");
    const menu = open();
    fireEvent.click(within(menu).getByText("D"));
    expect(onPick).toHaveBeenCalledWith("D blues");
  });

  it("keeps the root when you pick a mode", () => {
    const { onPick } = setup("A blues");
    const menu = open();
    fireEvent.click(within(menu).getByText("Minor"));
    expect(onPick).toHaveBeenCalledWith("Am");
  });

  it("stays open while you try a few", () => {
    const { onPick } = setup("A blues");
    const menu = open();
    fireEvent.click(within(menu).getByText("D"));
    fireEvent.click(within(menu).getByText("E"));
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("dialog")).toBeTruthy();
  });

  it("closes on a press outside it, and on Escape", () => {
    setup("A blues");
    open();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole("dialog")).toBeNull();

    open();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
