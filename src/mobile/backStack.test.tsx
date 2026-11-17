/**
 * The Back stack, and the one thing about it that is not cosmetic: the order.
 *
 * `useBackDismiss` used to list `onClose` in its effect's dependencies, and
 * every call site passes an inline arrow — so the registration was torn down
 * and rebuilt on every render of the screen the layer belongs to, which with
 * the metronome running is twice a second. React runs every passive cleanup
 * before any of the effects that replace them, and both run child before
 * parent, so a stack of `[settings, sheet]` came back as `[sheet, settings]`
 * and the system Back gesture closed the settings pane out from under an open
 * sheet.
 *
 * M05 found the same shape of bug in `Sheet`'s focus effect and fixed it
 * there; `M05-FINDINGS.md` flagged this one. `Sheet.test.tsx` is the model for
 * what is below.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { dismissTop, resetBackStack, useBackDismiss } from "./backStack";

/** A sheet: a layer that opens later, inside the screen that is already open. */
function InnerLayer({ onClose }: { onClose: () => void }) {
  useBackDismiss(true, onClose);
  return null;
}

/**
 * The screen under it — the settings pane, which registers its own Back
 * handler from `MainWindow` and is open before the sheet ever mounts.
 */
function Layers({
  innerOpen,
  outer,
  inner,
}: {
  innerOpen: boolean;
  outer: () => void;
  inner: () => void;
}) {
  useBackDismiss(true, outer);
  return innerOpen ? <InnerLayer onClose={inner} /> : null;
}

describe("the Back stack", () => {
  beforeEach(() => {
    resetBackStack();
  });

  it("keeps the newest layer on top across re-renders of the screen behind it", () => {
    const outer = vi.fn();
    const inner = vi.fn();

    // The screen opens first, then the sheet opens inside it — which is the
    // only order these two ever arrive in.
    const view = render(<Layers innerOpen={false} outer={() => outer()} inner={() => inner()} />);
    view.rerender(<Layers innerOpen outer={() => outer()} inner={() => inner()} />);

    // Three renders of the screen behind the sheet, a fresh arrow for both
    // callbacks each time — a second and a half of a running metronome.
    for (let i = 0; i < 3; i++) {
      view.rerender(<Layers innerOpen outer={() => outer()} inner={() => inner()} />);
    }

    act(() => {
      expect(dismissTop()).toBe(true);
    });

    // With `onClose` back in the dependency array this is `outer`: Back closes
    // the settings pane and leaves the sheet floating over whatever is behind
    // it.
    expect(inner).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });

  it("runs the newest closure, not the one registered when the layer opened", () => {
    // The registration outlives the renders now, so the entry sitting in the
    // stack has to reach the current render's callback rather than the one it
    // was created with.
    const stale = vi.fn();
    const fresh = vi.fn();

    const view = render(<Layers innerOpen={false} outer={() => {}} inner={stale} />);
    view.rerender(<Layers innerOpen outer={() => {}} inner={stale} />);
    view.rerender(<Layers innerOpen outer={() => {}} inner={fresh} />);

    act(() => {
      dismissTop();
    });

    expect(fresh).toHaveBeenCalledTimes(1);
    expect(stale).not.toHaveBeenCalled();
  });

  it("unregisters a layer that closes, and reports an empty stack", () => {
    const outer = vi.fn();
    const inner = vi.fn();

    const view = render(<Layers innerOpen={false} outer={() => outer()} inner={() => inner()} />);
    view.rerender(<Layers innerOpen outer={() => outer()} inner={() => inner()} />);
    view.rerender(<Layers innerOpen={false} outer={() => outer()} inner={() => inner()} />);

    act(() => {
      dismissTop();
    });
    expect(inner).not.toHaveBeenCalled();
    expect(outer).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(dismissTop()).toBe(false);
  });
});
