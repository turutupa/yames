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
