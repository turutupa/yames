/**
 * `HintCard` rendering and how it picks up its anchor.
 *
 * The placement maths itself lives in `../anchor` and is covered exhaustively
 * by `anchor.test.ts` — the tour card and the hint card share it, so it is
 * tested once. What is tested here is the DOM half: the copy comes from i18n,
 * the action button only exists when there is an action, both buttons and
 * any other key or click end the hint (without swallowing it), and the card finds (or fails to find) `data-hint`.
 */
import { describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
import { HintCard } from "./HintCard";

afterEach(cleanup);

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

  it("dismisses on Escape without swallowing it (P2-19)", () => {
    const onDismiss = vi.fn();
    const after = vi.fn();
    render(<HintCard id="coach-ask" inline onDismiss={onDismiss} />);
    window.addEventListener("keydown", after);
    fireEvent.keyDown(document, { key: "Escape" });
    window.removeEventListener("keydown", after);
    expect(onDismiss).toHaveBeenCalledTimes(1);
    // The key reaches the rest of the app: Escape still leaves the tool.
    expect(after).toHaveBeenCalledTimes(1);
    expect(after.mock.calls[0][0].defaultPrevented).toBe(false);
  });

  it("dismisses on any other action, but not on Tab or a click inside it", () => {
    const onDismiss = vi.fn();
    render(<HintCard id="coach-ask" inline onDismiss={onDismiss} />);
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.pointerDown(screen.getByText(/./, { selector: ".hint-card-body" }));
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("anchors to the matching data-hint element when not inline", () => {
    const anchor = document.createElement("div");
    anchor.setAttribute("data-hint", "drill-first-open");
    // jsdom has no layout engine, so the anchor has to say how big it is.
    anchor.getBoundingClientRect = () =>
      ({ top: 100, left: 350, width: 100, height: 40 }) as DOMRect;
    document.body.appendChild(anchor);
    const { container } = render(
      <HintCard id="drill-first-open" onDismiss={vi.fn()} />,
    );
    const card = container.querySelector(".hint-card") as HTMLElement;
    expect(card.dataset.placement).toBe("bottom");
    // A real position was applied, rather than the hidden pre-measure state.
    expect(card.style.visibility).toBe("");
    expect(card.style.top).not.toBe("");
    anchor.remove();
  });

  it("falls back to a floating toast when the anchor has no layout", () => {
    // Present in the DOM but 0x0 — a collapsed panel or a hidden tab. There is
    // nothing to point at, so the card must not aim at the window's corner.
    const anchor = document.createElement("div");
    anchor.setAttribute("data-hint", "drill-first-open");
    document.body.appendChild(anchor);
    const { container } = render(
      <HintCard id="drill-first-open" onDismiss={vi.fn()} />,
    );
    const card = container.querySelector(".hint-card") as HTMLElement;
    expect(card.dataset.placement).toBe("float");
    anchor.remove();
  });

  it("floats when no data-hint element exists at all", () => {
    const { container } = render(
      <HintCard id="drill-first-open" onDismiss={vi.fn()} />,
    );
    const card = container.querySelector(".hint-card") as HTMLElement;
    expect(card.dataset.placement).toBe("float");
  });
});
