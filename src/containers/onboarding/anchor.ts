/**
 * Anchoring math for anything that has to sit next to a real element without
 * ever leaving the window: the spotlight tour card (O6) and, later, the
 * one-time hint cards (O7).
 *
 * Everything here is pure — no DOM, no React — so the placement rules can be
 * unit-tested exhaustively instead of eyeballed in a screenshot. The single
 * hard guarantee callers rely on: for any target, any card size and any
 * viewport at least as large as the card, `computeAnchor` returns a position
 * whose rectangle lies inside the viewport. Yames' minimum window is 480x780,
 * which is small enough that "prefer below, flip above" alone is not enough —
 * hence the four-sided candidate list plus the clamp.
 */

export type Rect = { x: number; y: number; width: number; height: number };
export type Size = { width: number; height: number };
export type Viewport = { width: number; height: number };

/** Which side of the target the card ended up on. */
export type Placement = "bottom" | "top" | "right" | "left" | "center";

export type Anchor = {
  /** Card position in viewport coordinates (CSS `left` / `top`). */
  x: number;
  y: number;
  placement: Placement;
  /**
   * Where the pointer/arrow belongs, measured along the card edge that faces
   * the target: px from the card's left for `top`/`bottom`, px from the card's
   * top for `left`/`right`. Always inside the card. `null` when the card is
   * centred (no target to point at).
   */
  arrow: number | null;
};

export type AnchorOptions = {
  /** Space between the target's edge and the card. */
  gap?: number;
  /** Minimum distance the card keeps from the window edges. */
  margin?: number;
  /** How close the arrow may get to a card corner. */
  arrowInset?: number;
  /** Placements to try, in order. Defaults to bottom → top → right → left. */
  order?: Exclude<Placement, "center">[];
};

export const ANCHOR_GAP = 14;
export const ANCHOR_MARGIN = 12;
export const ANCHOR_ARROW_INSET = 18;

const DEFAULT_ORDER: Exclude<Placement, "center">[] = [
  "bottom",
  "top",
  "right",
  "left",
];

function clamp(value: number, min: number, max: number): number {
  // `max < min` happens when the card is wider/taller than the space it has
  // to live in. Pinning to `min` then keeps the top-left corner visible, which
  // is the half a reader needs.
  if (max < min) return min;
  return Math.min(max, Math.max(min, value));
}

/** Grow a rect by `pad` on every side. Used for the spotlight cut-out. */
export function padRect(rect: Rect, pad: number): Rect {
  return {
    x: rect.x - pad,
    y: rect.y - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/**
 * Smallest rect containing all of them — a tour stop may cover more than one
 * element (stop 6 spotlights the zen button *and* the widget button).
 * Zero-sized rects are ignored: a hidden element measures 0x0 and must not
 * drag the cut-out to the window's top-left corner.
 */
export function unionRects(rects: Rect[]): Rect | null {
  const live = rects.filter((r) => r.width > 0 && r.height > 0);
  if (live.length === 0) return null;
  const left = Math.min(...live.map((r) => r.x));
  const top = Math.min(...live.map((r) => r.y));
  const right = Math.max(...live.map((r) => r.x + r.width));
  const bottom = Math.max(...live.map((r) => r.y + r.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** Clip a rect to the viewport, so the cut-out never bleeds off screen. */
export function clipToViewport(rect: Rect, viewport: Viewport): Rect {
  const left = clamp(rect.x, 0, viewport.width);
  const top = clamp(rect.y, 0, viewport.height);
  const right = clamp(rect.x + rect.width, 0, viewport.width);
  const bottom = clamp(rect.y + rect.height, 0, viewport.height);
  return {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Free space on each side of the target, inside the margins. */
function space(target: Rect, viewport: Viewport, margin: number) {
  return {
    bottom: viewport.height - margin - (target.y + target.height),
    top: target.y - margin,
    right: viewport.width - margin - (target.x + target.width),
    left: target.x - margin,
  };
}

function positionFor(
  placement: Exclude<Placement, "center">,
  target: Rect,
  card: Size,
  viewport: Viewport,
  gap: number,
  margin: number,
): { x: number; y: number } {
  const maxX = viewport.width - margin - card.width;
  const maxY = viewport.height - margin - card.height;
  switch (placement) {
    case "bottom":
      return {
        x: clamp(target.x + target.width / 2 - card.width / 2, margin, maxX),
        y: clamp(target.y + target.height + gap, margin, maxY),
      };
    case "top":
      return {
        x: clamp(target.x + target.width / 2 - card.width / 2, margin, maxX),
        y: clamp(target.y - gap - card.height, margin, maxY),
      };
    case "right":
      return {
        x: clamp(target.x + target.width + gap, margin, maxX),
        y: clamp(target.y + target.height / 2 - card.height / 2, margin, maxY),
      };
    case "left":
      return {
        x: clamp(target.x - gap - card.width, margin, maxX),
        y: clamp(target.y + target.height / 2 - card.height / 2, margin, maxY),
      };
  }
}

function fits(
  placement: Exclude<Placement, "center">,
  target: Rect,
  card: Size,
  viewport: Viewport,
  gap: number,
  margin: number,
): boolean {
  const s = space(target, viewport, margin);
  const need = placement === "bottom" || placement === "top"
    ? card.height + gap
    : card.width + gap;
  const available = s[placement];
  if (available < need) return false;
  // The cross axis must also be satisfiable, or "fits" is a lie: a card wider
  // than the window can never sit below anything without overflowing.
  const cross =
    placement === "bottom" || placement === "top" ? card.width : card.height;
  const crossRoom =
    placement === "bottom" || placement === "top"
      ? viewport.width - margin * 2
      : viewport.height - margin * 2;
  return cross <= crossRoom;
}

function arrowFor(
  placement: Exclude<Placement, "center">,
  target: Rect,
  card: Size,
  pos: { x: number; y: number },
  inset: number,
): number {
  const horizontal = placement === "bottom" || placement === "top";
  const targetCentre = horizontal
    ? target.x + target.width / 2
    : target.y + target.height / 2;
  const cardStart = horizontal ? pos.x : pos.y;
  const cardLength = horizontal ? card.width : card.height;
  // Never let the arrow escape the card, even for a target far off to one side.
  const limit = Math.max(0, cardLength / 2 - 0.5);
  return clamp(
    targetCentre - cardStart,
    Math.min(inset, limit),
    Math.max(cardLength - inset, limit),
  );
}

/**
 * Place `card` next to `target` inside `viewport`.
 *
 * Tries each placement in `order` and takes the first that genuinely fits.
 * When none do (a tall card in a short window, a target hugging every edge) it
 * falls back to the side with the most room and clamps — the card may then
 * overlap the target, which is far better than being half off screen.
 * A `null` target centres the card.
 */
export function computeAnchor(
  target: Rect | null,
  card: Size,
  viewport: Viewport,
  options: AnchorOptions = {},
): Anchor {
  const gap = options.gap ?? ANCHOR_GAP;
  const margin = options.margin ?? ANCHOR_MARGIN;
  const inset = options.arrowInset ?? ANCHOR_ARROW_INSET;
  const order = options.order ?? DEFAULT_ORDER;

  if (!target || target.width <= 0 || target.height <= 0) {
    return {
      x: clamp(
        (viewport.width - card.width) / 2,
        margin,
        viewport.width - margin - card.width,
      ),
      y: clamp(
        (viewport.height - card.height) / 2,
        margin,
        viewport.height - margin - card.height,
      ),
      placement: "center",
      arrow: null,
    };
  }

  const chosen =
    order.find((p) => fits(p, target, card, viewport, gap, margin)) ??
    // Nothing fits — take the roomiest side rather than the first one.
    (() => {
      const s = space(target, viewport, margin);
      return order.reduce((best, p) => (s[p] > s[best] ? p : best), order[0]);
    })();

  const pos = positionFor(chosen, target, card, viewport, gap, margin);
  return {
    x: pos.x,
    y: pos.y,
    placement: chosen,
    arrow: arrowFor(chosen, target, card, pos, inset),
  };
}
