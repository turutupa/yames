/**
 * Minimal anchoring for hint cards.
 *
 * TEMPORARY: O6 (the guided tour) owns the real helper at
 * `src/containers/onboarding/anchor.ts` — same `data-hint="<id>"` contract,
 * but with the tour's spotlight/scroll behaviour. That branch is not merged
 * yet, so O7 carries this stripped-down version. At merge time, delete this
 * file and point `HintCard` at O6's helper; `computeAnchorPlacement` is the
 * only logic that needs a home (or an equivalent in the shared helper).
 *
 * Behaviour: put the card under the anchor, horizontally centred on it, and
 * clamp it inside the viewport. If it does not fit below, flip above.
 */

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Viewport = { width: number; height: number };

export type AnchorPlacement = {
  top: number;
  left: number;
  placement: "below" | "above";
};

/** Gap between the anchor and the card, and the card and the window edge. */
export const ANCHOR_GAP = 8;
export const VIEWPORT_MARGIN = 8;

/** Where a card of `card` size should sit relative to `anchor`. Pure. */
export function computeAnchorPlacement(
  anchor: Rect,
  card: Size,
  viewport: Viewport,
  gap: number = ANCHOR_GAP,
): AnchorPlacement {
  const below = anchor.top + anchor.height + gap;
  const above = anchor.top - gap - card.height;
  const fitsBelow = below + card.height <= viewport.height - VIEWPORT_MARGIN;
  const placement: "below" | "above" = fitsBelow || above < VIEWPORT_MARGIN ? "below" : "above";

  const rawTop = placement === "below" ? below : above;
  const maxTop = Math.max(VIEWPORT_MARGIN, viewport.height - card.height - VIEWPORT_MARGIN);
  const top = Math.min(Math.max(rawTop, VIEWPORT_MARGIN), maxTop);

  const rawLeft = anchor.left + anchor.width / 2 - card.width / 2;
  const maxLeft = Math.max(VIEWPORT_MARGIN, viewport.width - card.width - VIEWPORT_MARGIN);
  const left = Math.min(Math.max(rawLeft, VIEWPORT_MARGIN), maxLeft);

  return { top, left, placement };
}

/** The element a hint anchors to, or null when it is not on screen. */
export function findAnchorElement(hintId: string): HTMLElement | null {
  if (typeof document === "undefined") return null;
  return document.querySelector<HTMLElement>(`[data-hint="${hintId}"]`);
}

/** `getBoundingClientRect` as the plain `Rect` the placement function wants. */
export function rectOf(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}
