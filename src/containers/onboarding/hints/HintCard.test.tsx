/**
 * `HintCard` rendering + the anchoring geometry behind it.
 *
 * The placement maths is a pure function so it can be checked without a real
 * layout engine (jsdom reports every element as 0x0). The component tests
 * cover the parts that do matter in the DOM: the copy comes from i18n, the
 * action button only exists when there is an action, and both buttons plus
 * Escape end the hint.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { HintCard } from "./HintCard";
import { ANCHOR_GAP, VIEWPORT_MARGIN, computeAnchorPlacement } from "./anchor";

afterEach(cleanup);

const VIEWPORT = { width: 800, height: 600 };
const CARD = { width: 300, height: 100 };

describe("computeAnchorPlacement", () => {
  it("centres the card under the anchor", () => {
    const p = computeAnchorPlacement(
      { top: 100, left: 350, width: 100, height: 40 },
      CARD,
      VIEWPORT,
    );
    expect(p.placement).toBe("below");
    expect(p.top).toBe(100 + 40 + ANCHOR_GAP);
    expect(p.left).toBe(350 + 50 - 150);
  });

  it("flips above when the card does not fit below", () => {
    const p = computeAnchorPlacement(
      { top: 520, left: 350, width: 100, height: 40 },
      CARD,
      VIEWPORT,
    );
    expect(p.placement).toBe("above");
    expect(p.top).toBe(520 - ANCHOR_GAP - CARD.height);
  });

  it("stays below when there is no room either way", () => {
    // Tall card, anchor near the top — above would be off-screen.
    const p = computeAnchorPlacement(
      { top: 10, left: 350, width: 100, height: 40 },
      { width: 300, height: 580 },
      VIEWPORT,
    );
    expect(p.placement).toBe("below");
  });

  it("clamps to the viewport for anchors near the edges", () => {
    const left = computeAnchorPlacement(
      { top: 100, left: 0, width: 20, height: 20 },
      CARD,
      VIEWPORT,
    );
    expect(left.left).toBe(VIEWPORT_MARGIN);

    const right = computeAnchorPlacement(
      { top: 100, left: 790, width: 20, height: 20 },
      CARD,
      VIEWPORT,
    );
    expect(right.left).toBe(VIEWPORT.width - CARD.width - VIEWPORT_MARGIN);
  });
});

describe("HintCard", () => {
  it("renders the localised body and a dismiss button only", () => {
    const onDismiss = vi.fn();
    render(<HintCard id="zen-first" inline onDismiss={onDismiss} />);
    expect(
      screen.getByText("Esc leaves Zen. Effects are in Settings → Appearance."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open widget" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders the action button when an action is given, and dismisses after it", () => {
    const onAction = vi.fn();
    const onDismiss = vi.fn();
    render(
      <HintCard id="widget-discover" inline onAction={onAction} onDismiss={onDismiss} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open widget" }));
    expect(onAction).toHaveBeenCalledTimes(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses on Escape", () => {
    const onDismiss = vi.fn();
    render(<HintCard id="coach-ask" inline onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("anchors to the matching data-hint element when not inline", () => {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-hint", "drill-first-open");
    document.body.appendChild(anchor);
    const { container } = render(
      <HintCard id="drill-first-open" onDismiss={vi.fn()} />,
    );
    const card = container.querySelector(".hint-card") as HTMLElement;
    expect(card.dataset.placement).toBe("below");
    // jsdom has no layout, so only the fact that a fixed position was applied
    // (rather than the hidden pre-measure state) is meaningful here.
    expect(card.style.visibility).toBe("");
    anchor.remove();
  });
});
