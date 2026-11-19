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
import { IS_MOBILE } from "../../../platform";
import { targetOf, type TourStop } from "./stops";
import type { GradingChoice } from "../../../session/grading";
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
/**
 * A stop whose target is not there yet keeps looking for this long: a
 * Session's ready screen mounts its neck a beat after the screen itself, and a
 * card left centred because the first frame had nothing to point at would
 * stay centred.
 */
const FIND_MS = 2500;

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
  /** The player's grading choice, for the stops whose words depend on it. */
  grading?: GradingChoice;
};

function rectOf(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
}

/** Every element a stop spotlights. */
function targetsOf(stop: TourStop | string): Element[] {
  if (typeof document === "undefined") return [];
  if (typeof stop !== "string") return Array.from(document.querySelectorAll(targetOf(stop)));
  // Tour ids are our own literals, but escape anyway — and don't assume
  // `CSS.escape` exists (happy-dom in the test env does not ship it).
  const safe = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(stop) : stop;
  return Array.from(document.querySelectorAll(`[data-tour="${safe}"]`));
}

/**
 * Union of every visible element a stop spotlights: its selector, or the
 * elements carrying a `data-tour` id when given a bare id.
 */
export function measureTarget(stop: TourStop | string): Rect | null {
  return unionRects(targetsOf(stop).map(rectOf));
}

/**
 * Cut-outs that close (twice the padding, so their rings would touch) are
 * drawn as one.
 */
const CLUSTER_GAP = 2 * 8;

/**
 * Merge rects that lie within `gap` of each other. Order is kept: the group
 * holding the first rect comes first.
 */
export function clusterRects(rects: Rect[], gap = CLUSTER_GAP): Rect[] {
  const groups = rects.filter((r) => r.width > 0 && r.height > 0).map((r) => ({ ...r }));
  const near = (a: Rect, b: Rect) =>
    a.x - gap < b.x + b.width && b.x - gap < a.x + a.width && a.y - gap < b.y + b.height && b.y - gap < a.y + a.height;
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if (near(groups[i], groups[j])) {
          groups[i] = unionRects([groups[i], groups[j]])!;
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return groups;
}

/** What a stop lights: the cut-outs, and the one the card points at. */
export function measureHoles(stop: TourStop): { anchor: Rect | null; holes: Rect[] } {
  if (!stop.groups) {
    const all = unionRects(targetsOf(stop).map(rectOf));
    return { anchor: all, holes: all ? [all] : [] };
  }
  // A phone's minutes and Start, with the plan between them; the bar's blocks
  // and its Previous/Skip, with Exit and the input between.
  const each = stop.groups
    .map((sel) => unionRects(Array.from(document.querySelectorAll(sel)).map(rectOf)))
    .filter((r): r is Rect => r !== null);
  const holes = clusterRects(each);
  return { anchor: holes[0] ?? null, holes };
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
  grading,
}: TourProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<{ anchor: Rect | null; holes: Rect[] }>({ anchor: null, holes: [] });
  const [viewport, setViewport] = useState(() => ({
    width: typeof window === "undefined" ? 0 : window.innerWidth,
    height: typeof window === "undefined" ? 0 : window.innerHeight,
  }));
  const [cardSize, setCardSize] = useState({ width: 300, height: 160 });

  // --- Measurement ---------------------------------------------------------
  const measure = useCallback(() => {
    if (!stop) return;
    const next = measureHoles(stop);
    setTarget((prev) =>
      sameRect(prev.anchor, next.anchor) &&
      prev.holes.length === next.holes.length &&
      prev.holes.every((h, i) => sameRect(h, next.holes[i]))
        ? prev
        : next,
    );
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
  // A target that is not there yet is looked for a little longer (FIND_MS),
  // and one below the fold of its page is scrolled into view once found.
  useEffect(() => {
    if (!open || !stop) return;
    let raf = 0;
    const started = Date.now();
    let scrolled = false;
    const loop = () => {
      measure();
      const found = targetsOf(stop).find((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });
      if (found && !scrolled) {
        scrolled = true;
        const r = found.getBoundingClientRect();
        if (r.top < 0 || r.bottom > window.innerHeight) {
          found.scrollIntoView?.({ block: "nearest", behavior: "auto" });
        }
      }
      const elapsed = Date.now() - started;
      if (elapsed < SETTLE_MS || (!found && elapsed < FIND_MS)) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [open, index, stop, measure]);

  useEffect(() => {
    if (!open) return;
    const onChange = () => measure();
    // And a slow beat while it is up: a page that moves without a resize or a
    // scroll (a phone's screen fading in, a line of text arriving) would
    // otherwise leave the cut-out where the target used to be.
    const beat = window.setInterval(onChange, 300);
    window.addEventListener("resize", onChange);
    // Capture phase: the app scrolls an inner container, not the window.
    window.addEventListener("scroll", onChange, true);
    return () => {
      window.clearInterval(beat);
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
      // Focus stays on the card: Tab walks its own buttons and wraps, so it
      // never lands on the dimmed page behind it.
      if (e.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const items = Array.from(
          card.querySelectorAll<HTMLElement>("button:not(:disabled)"),
        );
        if (items.length === 0) return;
        const at = items.indexOf(document.activeElement as HTMLElement);
        e.preventDefault();
        e.stopPropagation();
        const step = e.shiftKey ? -1 : 1;
        const nextAt = at < 0 ? (e.shiftKey ? items.length - 1 : 0) : (at + step + items.length) % items.length;
        items[nextAt].focus();
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        // A focused button's own press. On the card itself, nothing behind it.
        if (document.activeElement instanceof HTMLButtonElement && cardRef.current?.contains(document.activeElement)) return;
        e.preventDefault();
        e.stopPropagation();
        if (e.key === "Enter") onNext();
        return;
      }
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

  const lit = (r: Rect) => clipToViewport(padRect(r, SPOTLIGHT_PAD), viewport);
  const hole = target.anchor ? lit(target.anchor) : null;
  const holes = target.holes.map(lit).filter((h) => h.width > 0 && h.height > 0);
  const anchor: Anchor = computeAnchor(hole, cardSize, viewport);
  const isLast = index === total - 1;
  const maskId = "tour-spotlight-mask";

  return (
    <div
      className={`tour-overlay${animate ? "" : " no-motion"}`}
      data-testid="tour-overlay"
      data-stop={stop.id}
      data-index={index}
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
            {holes.map((h, n) => (
              <rect
                key={n}
                className="tour-hole"
                x={h.x}
                y={h.y}
                width={h.width}
                height={h.height}
                rx={SPOTLIGHT_RADIUS}
                fill="#000"
              />
            ))}
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

      {holes.map((h, n) => (
        <div
          key={n}
          className="tour-ring"
          aria-hidden="true"
          style={{
            left: h.x,
            top: h.y,
            width: h.width,
            height: h.height,
            borderRadius: SPOTLIGHT_RADIUS,
          }}
        />
      ))}

      <div
        ref={cardRef}
        className="tour-card"
        data-placement={anchor.placement}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
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
            {t(`onboarding.tour.${stop.i18nKey}.title`)}
          </h3>
          <span className="tour-progress">
            {t("onboarding.tour.progress", {
              current: index + 1,
              total,
            })}
          </span>
        </div>

        <p className="tour-card-body" id="tour-body">
          {t(
            `onboarding.tour.${stop.i18nKey}.${
              stop.byGrading && grading === "off" ? "bodyOff" : stop.byGrading && grading === "ask" ? "bodyAsk" : "body"
            }`,
          )}
        </p>

        {/* A phone has no keyboard to print keys for. */}
        {!IS_MOBILE && stop.keys.length > 0 && (
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
