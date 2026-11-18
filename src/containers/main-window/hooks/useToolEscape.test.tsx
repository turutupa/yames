/** TOOL-3: Escape in a tool goes back to Tools, but only once nothing in the tool is left to put away. */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToolEscape } from "./useToolEscape";

function Host(props: { view: string; onLeave: () => void; blocked?: boolean; jamBusy?: boolean; children?: React.ReactNode }) {
  useToolEscape({ view: props.view, onLeave: props.onLeave, blocked: !!props.blocked, jamBusy: !!props.jamBusy });
  return <div>{props.children}</div>;
}

function escape(target: EventTarget = document.body) {
  const e = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

afterEach(cleanup);

describe("useToolEscape", () => {
  it.each(["beat", "setlist", "drill", "jam", "songs"])("leaves %s for Tools", (view) => {
    const onLeave = vi.fn();
    render(<Host view={view} onLeave={onLeave} />);
    expect(escape().defaultPrevented).toBe(true);
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it.each(["today", "paths", "progress", "tools", "settings", "session"])("does nothing on %s", (view) => {
    const onLeave = vi.fn();
    render(<Host view={view} onLeave={onLeave} />);
    escape();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("lets an open dialog, menu or popover have the key first", () => {
    const onLeave = vi.fn();
    const { rerender } = render(
      <Host view="songs" onLeave={onLeave}>
        <div role="dialog" />
      </Host>,
    );
    escape();
    rerender(
      <Host view="beat" onLeave={onLeave}>
        <button aria-expanded="true">Meter</button>
      </Host>,
    );
    escape();
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("ignores the rail's library, which stays expanded as a layout choice", () => {
    const onLeave = vi.fn();
    render(
      <Host view="beat" onLeave={onLeave}>
        <nav className="rail">
          <button aria-expanded="true">Library</button>
        </nav>
      </Host>,
    );
    escape();
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("leaves a text field's Escape to the field", () => {
    const onLeave = vi.fn();
    const { container } = render(
      <Host view="setlist" onLeave={onLeave}>
        <input type="text" />
      </Host>,
    );
    const input = container.querySelector("input")!;
    input.focus();
    escape(input);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("does not act on a key someone else claimed", () => {
    const onLeave = vi.fn();
    render(<Host view="songs" onLeave={onLeave} />);
    const claim = (e: KeyboardEvent) => e.preventDefault();
    document.addEventListener("keydown", claim);
    escape();
    document.removeEventListener("keydown", claim);
    expect(onLeave).not.toHaveBeenCalled();
  });

  it("waits while a jam sheet is open, and while something above the tool owns the keyboard", () => {
    const onLeave = vi.fn();
    const { rerender } = render(<Host view="jam" onLeave={onLeave} jamBusy />);
    escape();
    rerender(<Host view="drill" onLeave={onLeave} blocked />);
    escape();
    expect(onLeave).not.toHaveBeenCalled();
  });
});
