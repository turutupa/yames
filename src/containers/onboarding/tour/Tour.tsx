/**
 * The spotlight overlay (ONBOARDING_PLAN §4) — in-house, no third-party
 * library, ~200 lines of SVG mask and one pure placement call.
 *
 * How it draws: a full-window `<svg>` paints one dim rectangle through a mask
 * whose black rounded rect is the target's bounds. Black in a luminance mask
 * means "hide", so the target shows through at full brightness while
 * everything else is dimmed — one composited layer, no four-div "shutter"
 * trick, and it animates as a single rect between stops.
 *
 * How it positions: the card measures itself, `computeAnchor` (anchor.ts,
 * pure and unit-tested) picks a side and clamps it into the window, and the
 * arrow points back at the target. Measurement re-runs on resize, on scroll,
 * and for a short settling window after every stop change so a tab transition
 * that is still animating does not leave the card behind.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { HOTKEYS, platformKey, type HotkeyAction } from "../../../hotkeys";
import {
  clipToViewport,
  computeAnchor,
  padRect,
  unionRects,
  type Anchor,
  type Rect,
} from "../anchor";
import type { TourStop } from "./stops";
import "../../../styles/tour.css";

/** How far the cut-out is grown past the target's own box. */
const SPOTLIGHT_PAD = 8;
const SPOTLIGHT_RADIUS = 12;
/**
 * Keep re-measuring for this long after a stop change. Long enough to cover
 * the tab `ViewTransition` (~220 ms) plus the preset sidebar's width
 * transition, short enough not to be a permanent rAF loop.
 */
const SETTLE_MS = 420;

export type TourProps = {
  open: boolean;
  index: number;
  stop: TourStop | null;
  total: number;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
  /**
   * The user's live keymap (action id → combo). Falls back to the defaults in
   * `hotkeys.ts` for any action it doesn't carry.
   */
  keyBindings?: Record<string, string>;
  /** `viewTransitions !== "off"`; reduced motion is honoured on top of it. */
  animate?: boolean;
};

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** Union of every visible element carrying this `data-tour` id. */
export function measureTarget(id: string): Rect | null {
  if (typeof document === "undefined") return null;
  // Tour ids are our own literals, but escape anyway — and don't assume
  // `CSS.escape` exists (happy-dom in the test env does not ship it).
  const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  const nodes = Array.from(document.querySelectorAll(`[data-tour="${safe}"]`));
  return unionRects(nodes.map(rectOf));
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** The combo for an action: the user's binding if they have one, else default. */
export function comboFor(
  action: HotkeyAction,
  keyBindings?: Record<string, string>,
): string {
  const bound = keyBindings?.[action];
  const fallback = HOTKEYS.find((h) => h.id === action)?.key ?? "";
  return platformKey(bound || fallback);
}

export function Tour({
  open,
  index,
  stop,
  total,
  onNext,
  onPrev,
  onClose,
  keyBindings,
  animate = true,
}: TourProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [cardSize, setCardSize] = useState({ width: 300, height: 160 });

  // --- Measurement ---------------------------------------------------------
  const measure = useCallback(() => {
    if (!stop) return;
    const next = measureTarget(stop.id);
    setTarget((prev) => (sameRect(prev, next) ? prev : next));
    setViewport((prev) =>
      prev.width === window.innerWidth && prev.height === window.innerHeight
        ? prev
        : { width: window.innerWidth, height: window.innerHeight },
    );
    const card = cardRef.current;
    if (card) {
      const w = card.offsetWidth;
      const h = card.offsetHeight;
      setCardSize((prev) =>
        Math.abs(prev.width - w) < 0.5 && Math.abs(prev.height - h) < 0.5
          ? prev
          : { width: w, height: h },
      );
    }
  }, [stop]);

  // Measure before paint so the card never flashes at the wrong place.
  useLayoutEffect(() => {
    if (!open) return;
    measure();
  }, [open, measure]);

  // Settling window: the tab transition and the sidebar are still moving for a
  // few hundred ms after a stop change, so keep measuring until they stop.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const until = Date.now() + SETTLE_MS;
    const loop = () => {
      measure();
      if (Date.now() < until) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, index, measure]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    window.addEventListener("resize", onChange);
    // Capture phase: the app scrolls an inner container, not the window.
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [open, measure]);

  // --- Keyboard ------------------------------------------------------------
  // Capture phase, like the wizard: the tour owns the keyboard while it is up,
  // so Space does not start the metronome behind the overlay.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        onNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        onPrev();
        return;
      }
      if (e.key === "Tab" || e.key === " " || e.key === "Enter") return;
      e.stopPropagation();
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, onNext, onPrev, onClose]);

  // Focus the card so ←/→ work without the user clicking first.
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement as HTMLElement | null;
    cardRef.current?.focus({ preventScroll: true });
    return () => restore?.focus?.();
  }, [open]);

  if (!open || !stop) return null;

  const hole = target
    ? clipToViewport(padRect(target, SPOTLIGHT_PAD), viewport)
    : null;
  const anchor: Anchor = computeAnchor(hole, cardSize, viewport);
  const isLast = index === total - 1;
  const maskId = "tour-spotlight-mask";

  return (
    <div
      className={`tour-overlay${animate ? "" : " no-motion"}`}
      data-testid="tour-overlay"
      data-stop={stop.id}
    >
      <svg
        className="tour-mask"
        width={viewport.width}
        height={viewport.height}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <mask id={maskId}>
            {/* White keeps the dim, black punches the hole through it. */}
            <rect
              x={0}
              y={0}
              width={viewport.width}
              height={viewport.height}
              fill="#fff"
            />
            {hole && (
              <rect
                className="tour-hole"
                x={hole.x}
                y={hole.y}
                width={hole.width}
                height={hole.height}
                rx={SPOTLIGHT_RADIUS}
                fill="#000"
              />
            )}
          </mask>
        </defs>
        <rect
          x={0}
          y={0}
          width={viewport.width}
          height={viewport.height}
          className="tour-scrim"
          mask={`url(#${maskId})`}
        />
      </svg>

      {hole && (
        <div
          className="tour-ring"
          aria-hidden="true"
          style={{
            left: hole.x,
            top: hole.y,
            width: hole.width,
            height: hole.height,
            borderRadius: SPOTLIGHT_RADIUS,
          }}
        />
      )}

      <div
        ref={cardRef}
        className="tour-card"
        data-placement={anchor.placement}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        style={{ left: anchor.x, top: anchor.y }}
      >
        {anchor.arrow !== null && (
          <span
            className="tour-arrow"
            aria-hidden="true"
            style={
              anchor.placement === "top" || anchor.placement === "bottom"
                ? { left: anchor.arrow }
                : { top: anchor.arrow }
            }
          />
        )}

        <div className="tour-card-head">
          <h3 className="tour-card-title" id="tour-title">
            {t(`onboarding.tour.stops.${stop.i18nKey}.title`)}
          </h3>
          <span className="tour-progress">
            {t("onboarding.tour.progress", {
              current: index + 1,
              total,
            })}
          </span>
        </div>

        <p className="tour-card-body">
          {t(`onboarding.tour.stops.${stop.i18nKey}.body`)}
        </p>

        {stop.keys.length > 0 && (
          <p className="tour-card-keys">
            <span className="tour-keys-label">{t("onboarding.tour.keys")}</span>
            {stop.keys.map((action) => (
              <kbd key={action} className="tour-key">
                {comboFor(action, keyBindings)}
              </kbd>
            ))}
          </p>
        )}

        <div className="tour-card-actions">
          <button
            type="button"
            className="tour-btn tour-btn-ghost"
            onClick={onClose}
          >
            {t("onboarding.tour.skip")}
          </button>
          <div className="tour-card-nav">
            <button
              type="button"
              className="tour-btn tour-btn-ghost"
              onClick={onPrev}
              disabled={index === 0}
              aria-label={t("onboarding.tour.back")}
            >
              {t("onboarding.tour.back")}
            </button>
            <button
              type="button"
              className="tour-btn tour-btn-primary"
              onClick={onNext}
            >
              {isLast ? t("onboarding.tour.done") : t("onboarding.tour.next")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
