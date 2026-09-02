/**
 * FullscreenView feature preservation tests.
 *
 * Locks in:
 * - Renders the BPM display
 * - Escape key calls onExit
 * - Double-click on the root calls onExit
 * - Renders 7 zen-style options (focus/pulse/gravity/radar/cosmos/warp/rain)
 *   when the theme picker is opened
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent, waitFor } from "@testing-library/react";
import { FullscreenView } from "./FullscreenView";
import { DEFAULT_TEST_STATE } from "../../test/mocks";

const baseProps = {
  state: DEFAULT_TEST_STATE,
  currentBeat: null,
  activeTab: "beat" as const,
};

describe("FullscreenView", () => {
  it("renders the BPM number", () => {
    const { container } = render(
      <FullscreenView {...baseProps} onExit={vi.fn()} />,
    );
    const bpm = container.querySelector(".fs-bpm");
    expect(bpm?.textContent).toContain("120");
  });

  it("pressing Escape calls onExit", () => {
    const onExit = vi.fn();
    render(<FullscreenView {...baseProps} onExit={onExit} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onExit).toHaveBeenCalled();
  });

  it("double-click on the root calls onExit", () => {
    const onExit = vi.fn();
    const { container } = render(
      <FullscreenView {...baseProps} onExit={onExit} />,
    );
    const root = container.querySelector(".fullscreen-view") as HTMLElement;
    fireEvent.doubleClick(root);
    expect(onExit).toHaveBeenCalled();
  });

  it("clicking theme trigger reveals 7 zen-style options", async () => {
    const { container } = render(
      <FullscreenView {...baseProps} onExit={vi.fn()} />,
    );
    const trigger = container.querySelector(".zen-theme-trigger") as HTMLElement;
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger);
    await waitFor(() => {
      const opts = container.querySelectorAll(".zen-theme-option");
      expect(opts.length).toBe(7);
    });
  });

  /**
   * The Zen drill tab took its dot count from `ramp.beatsPerBar` while
   * `activeBeat` is the engine's `measureBeat` — which the engine only
   * wraps at `beatsPerBar` WHILE THE RAMP IS RUNNING. With the ramp
   * stopped in a meter longer than beatsPerBar, `measureBeat` ran past
   * the last rendered dot and nothing ever lit.
   */
  describe("drill tab dot count", () => {
    const sevenEight = {
      ...DEFAULT_TEST_STATE,
      timeSignature: 7,
      beatGroups: [3, 2, 2],
      speedRamp: { ...DEFAULT_TEST_STATE.speedRamp, beatsPerBar: 4 },
    };
    const beat = (measureBeat: number) => ({
      beat: measureBeat,
      measureBeat,
      subdivision: 0,
      isDownbeat: true,
      isAccent: measureBeat === 0,
    });

    it("uses the meter total when the ramp is NOT active", () => {
      const { container } = render(
        <FullscreenView
          state={sevenEight}
          currentBeat={beat(6)}
          activeTab="drill"
          onExit={vi.fn()}
        />,
      );
      expect(container.querySelectorAll(".fs-beat").length).toBe(7);
      // Bar position 6 exists and lights — under the old formula only
      // four dots were drawn and this beat lit nothing.
      expect(container.querySelectorAll(".fs-beat.active").length).toBe(1);
    });

    it("uses the ramp's beatsPerBar while the ramp IS active", () => {
      const rampOn = {
        ...sevenEight,
        speedRamp: {
          ...sevenEight.speedRamp,
          active: true,
          warmupCount: 4,
          warmupBeats: 4,
        },
      };
      const { container } = render(
        <FullscreenView
          state={rampOn}
          currentBeat={beat(2)}
          activeTab="drill"
          onExit={vi.fn()}
        />,
      );
      expect(container.querySelectorAll(".fs-beat").length).toBe(4);
      expect(container.querySelectorAll(".fs-beat.active").length).toBe(1);
    });

    it("lights a dot for every bar position in both ramp states", () => {
      for (const [state, bars] of [
        [sevenEight, 7],
        [
          {
            ...sevenEight,
            speedRamp: {
              ...sevenEight.speedRamp,
              active: true,
              warmupCount: 4,
              warmupBeats: 4,
            },
          },
          4,
        ],
      ] as const) {
        for (let pos = 0; pos < bars; pos++) {
          const { container, unmount } = render(
            <FullscreenView
              state={state}
              currentBeat={beat(pos)}
              activeTab="drill"
              onExit={vi.fn()}
            />,
          );
          expect(
            container.querySelectorAll(".fs-beat.active").length,
            `bar position ${pos} of ${bars} lit no dot`,
          ).toBe(1);
          unmount();
        }
      }
    });
  });
});
