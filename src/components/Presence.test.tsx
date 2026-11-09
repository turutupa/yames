/**
 * The presence primitive (JAM_UX_DECISIONS A11).
 *
 * What is worth pinning here is the leaving, not the arriving: React unmounts
 * the instant a condition goes false, and every one of these tests exists
 * because a surface that vanishes rather than leaves is what the owner
 * complained about. The clock matters as much as the animation — a sheet that
 * waits for an `animationend` the browser never sends is stuck on the screen
 * for good.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Presence, MotionProvider, MOTION_ENTER_MS, MOTION_EXIT_MS } from "./Presence";

/** The surface under test: one div wearing whatever `Presence` hands it. */
function Surface({
  open,
  onExited,
  themeId,
  disabled,
}: {
  open: boolean;
  onExited?: () => void;
  themeId?: string;
  disabled?: boolean;
}) {
  return (
    <Presence open={open} onExited={onExited} themeId={themeId} disabled={disabled}>
      {(_state, motion) => (
        <div data-testid="surface" className="motion-sheet" {...motion}>
          the sheet
        </div>
      )}
    </Presence>
  );
}

const surface = () => screen.queryByTestId("surface");

/** The animation the element would have played, ending. */
function endAnimation(el: Element) {
  act(() => {
    el.dispatchEvent(new Event("animationend", { bubbles: true }));
  });
}

describe("Presence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("mounts entering and settles open", () => {
    const { rerender } = render(<Surface open={false} />);
    expect(surface()).toBeNull();

    rerender(<Surface open />);
    expect(surface()).toHaveAttribute("data-state", "entering");

    endAnimation(surface()!);
    expect(surface()).toHaveAttribute("data-state", "open");
  });

  it("keeps the child on the screen through its exit", () => {
    const { rerender } = render(<Surface open />);
    endAnimation(surface()!);

    rerender(<Surface open={false} />);
    // Still there — this is the whole point of the primitive.
    expect(surface()).toHaveAttribute("data-state", "exiting");
    expect(surface()).toBeInTheDocument();
  });

  it("unmounts when the exit animation ends, and says so", () => {
    const onExited = vi.fn();
    const { rerender } = render(<Surface open onExited={onExited} />);
    endAnimation(surface()!);
    rerender(<Surface open={false} onExited={onExited} />);

    endAnimation(surface()!);
    expect(surface()).toBeNull();
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it("unmounts on the clock when the animation never ends", () => {
    const onExited = vi.fn();
    const { rerender } = render(<Surface open onExited={onExited} />);
    act(() => void vi.advanceTimersByTime(MOTION_ENTER_MS + 50));
    rerender(<Surface open={false} onExited={onExited} />);

    expect(surface()).toBeInTheDocument();
    act(() => void vi.advanceTimersByTime(MOTION_EXIT_MS + 50));
    expect(surface()).toBeNull();
    expect(onExited).toHaveBeenCalledTimes(1);
  });

  it("ignores an animation that finished inside the surface", () => {
    render(<Surface open />);
    const inner = document.createElement("span");
    surface()!.appendChild(inner);

    // A diagram inside the sheet finishing its own keyframes is not the sheet
    // having arrived, even though the event bubbles up through it.
    act(() => {
      inner.dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    expect(surface()).toHaveAttribute("data-state", "entering");
  });

  it("re-opening mid-exit turns the same element around", () => {
    const onExited = vi.fn();
    const { rerender } = render(<Surface open onExited={onExited} />);
    endAnimation(surface()!);
    const element = surface();

    rerender(<Surface open={false} onExited={onExited} />);
    expect(surface()).toHaveAttribute("data-state", "exiting");

    rerender(<Surface open onExited={onExited} />);
    expect(surface()).toHaveAttribute("data-state", "entering");
    // The same node, so there is never a second copy left behind.
    expect(surface()).toBe(element);

    // And the exit's clock is off: it must not fire under the reopened sheet.
    act(() => void vi.advanceTimersByTime(1000));
    expect(surface()).toBeInTheDocument();
    expect(onExited).not.toHaveBeenCalled();
  });

  it("stays closed when the enter finishes just after a close was asked for", async () => {
    /*
     * W40. The takes promise stuck on the jam stage with both buttons dead:
     * "Record takes" was pressed while the card was still arriving, and the
     * card's own enter `animationend` landed before React had rendered the
     * close. The ref it reads said "entering", so it set the phase to "open"
     * on a surface whose `open` was already false — and nothing ever asked
     * again. Under `act` every effect is flushed before an event can land,
     * so this runs the way a browser does: the close is committed at once,
     * as a click's is, and the render that starts the exit is left to the
     * scheduler, with the animation ending in between.
     */
    vi.useRealTimers();
    const g = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const wasAct = g.IS_REACT_ACT_ENVIRONMENT;
    g.IS_REACT_ACT_ENVIRONMENT = false;
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const onExited = vi.fn();
    try {
      flushSync(() => root.render(<Surface open onExited={onExited} />));
      const el = host.querySelector('[data-testid="surface"]')!;
      expect(el).toHaveAttribute("data-state", "entering");

      flushSync(() => root.render(<Surface open={false} onExited={onExited} />));
      // The enter's own animation, ending before the exit has been drawn.
      el.dispatchEvent(new Event("animationend", { bubbles: true }));

      await new Promise((r) => setTimeout(r, MOTION_ENTER_MS + MOTION_EXIT_MS + 200));
      expect(host.querySelector('[data-testid="surface"]')).toBeNull();
      expect(onExited).toHaveBeenCalledTimes(1);
    } finally {
      flushSync(() => root.unmount());
      host.remove();
      g.IS_REACT_ACT_ENVIRONMENT = wasAct;
    }
  });

  describe("when motion is off", () => {
    it("is open from the first frame and gone from the last", () => {
      const onExited = vi.fn();
      const { rerender } = render(<Surface open={false} disabled onExited={onExited} />);
      rerender(<Surface open disabled onExited={onExited} />);
      expect(surface()).toHaveAttribute("data-state", "open");

      rerender(<Surface open={false} disabled onExited={onExited} />);
      expect(surface()).toBeNull();
      expect(onExited).toHaveBeenCalledTimes(1);
    });

    it("takes the Mono theme as the same answer", () => {
      const { rerender } = render(<Surface open={false} themeId="mono" />);
      rerender(<Surface open themeId="mono" />);
      expect(surface()).toHaveAttribute("data-state", "open");

      rerender(<Surface open={false} themeId="mono" />);
      expect(surface()).toBeNull();
    });

    it("reads the settings from the provider when it is given none", () => {
      render(
        <MotionProvider value={{ themeId: "mono" }}>
          <Surface open />
        </MotionProvider>,
      );
      expect(surface()).toHaveAttribute("data-state", "open");
    });
  });

  it("carries the theme onto the element so the stylesheet can refuse", () => {
    render(
      <MotionProvider value={{ themeId: "ember", level: "subtle" }}>
        <Surface open />
      </MotionProvider>,
    );
    expect(surface()).toHaveAttribute("data-theme-transition", "ember");
    expect(surface()).toHaveAttribute("data-animation-level", "subtle");
  });
});
