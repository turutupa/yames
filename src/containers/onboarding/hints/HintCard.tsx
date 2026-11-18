/**
 * The hint card — one line of copy, an optional action, and a dismiss button.
 *
 * Two placements:
 *   - anchored (default): fixed, positioned next to the `data-hint="<id>"`
 *     element by the shared `../anchor` helper — the same four-sided,
 *     never-leaves-the-window maths the O6 tour card uses. Falls back to a
 *     bottom-centre toast when the anchor is not on screen.
 *   - inline: rendered in the document flow, for hosts that already own their
 *     layout (the coach feed, the Zen overlay).
 *
 * Copy lives at `onboarding.hints.<key>.body` / `.action`; nothing here is a
 * literal string.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { ANCHOR_MARGIN, computeAnchor, type Placement, type Rect } from "../anchor";
import { HINT_I18N_KEY, type HintId } from "./types";
import "../../../styles/hints.css";

export type HintCardProps = {
  id: HintId;
  /** Render in the document flow instead of anchoring to `data-hint`. */
  inline?: boolean;
  /** Optional primary action. The label comes from `…<key>.action`. */
  onAction?: () => void;
  /** Called for the dismiss button, after the action runs, and on any other key or click. */
  onDismiss: () => void;
  /**
   * False suppresses the entrance animation. `hints.css` already covers the OS
   * `prefers-reduced-motion` setting, but the app's own `viewTransitions`
   * preference is invisible to CSS — the host passes the shared
   * `useReducedMotion` result here (O8 motion audit).
   */
  animate?: boolean;
};

/**
 * The element a hint anchors to, measured — or null when it is not on screen.
 * A 0x0 rect means "present in the DOM but not laid out" (a collapsed panel,
 * a tab that is not the visible one), which is not something to point at.
 */
function anchorRect(hintId: string): Rect | null {
  if (typeof document === "undefined") return null;
  // The first one that is laid out: a hint can name an anchor in two places
  // (a door in the desktop header and the phone's own doors), one hidden.
  for (const el of document.querySelectorAll<HTMLElement>(`[data-hint="${hintId}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return { x: r.left, y: r.top, width: r.width, height: r.height };
  }
  return null;
}

export function HintCard({
  id,
  inline,
  onAction,
  onDismiss,
  animate = true,
}: HintCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(
    inline ? {} : { top: 0, left: 0, visibility: "hidden" },
  );
  const [placement, setPlacement] = useState<Placement | "float">("bottom");
  const key = HINT_I18N_KEY[id];

  // --- Anchoring ----------------------------------------------------------
  useLayoutEffect(() => {
    if (inline) return;
    const update = () => {
      const el = cardRef.current;
      if (!el) return;
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const anchor = anchorRect(id);
      if (!anchor) {
        // No anchor on screen — behave like a toast above the bottom edge.
        setPlacement("float");
        setStyle({
          top: Math.max(ANCHOR_MARGIN, viewport.height - size.height - 24),
          left: Math.max(ANCHOR_MARGIN, (viewport.width - size.width) / 2),
        });
        return;
      }
      const next = computeAnchor(anchor, size, viewport);
      setPlacement(next.placement);
      setStyle({ top: next.y, left: next.x });
    };
    update();
    window.addEventListener("resize", update);
    // Capture phase: the scrollable container is a descendant, not the window.
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [id, inline]);

  // --- Any action dismisses; nothing is swallowed ---------------------------
  // A hint used to take the first Escape for itself (capture phase, stopped
  // there), so in the Jam the first Escape only put "Got it" away and the
  // second left the tool (acceptance P2-19, 2026-11-18). A hint is a note
  // beside the work, not a dialog: the player doing anything — a key, a
  // click elsewhere — has read it or does not need it. So it goes, and the
  // key or the click goes on to do what it does: Escape still closes the
  // menu that is open, or leaves the tool.
  const dismiss = useCallback(() => onDismiss(), [onDismiss]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Moving focus, or a modifier on its own, is not doing anything yet.
      if (e.key === "Tab" || e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
        return;
      }
      if (cardRef.current?.contains(e.target as Node)) return; // its own buttons
      dismiss();
    };
    const onPointer = (e: PointerEvent) => {
      if (cardRef.current?.contains(e.target as Node)) return;
      dismiss();
    };
    // Bubble, and passive in effect: nothing here prevents or stops anything.
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [dismiss]);

  const actionLabel = onAction ? t(`onboarding.hints.${key}.action`) : null;

  return (
    <div
      ref={cardRef}
      className={`hint-card${inline ? " hint-card-inline" : ""}${animate ? "" : " no-motion"}`}
      data-hint-id={id}
      data-placement={inline ? undefined : placement}
      style={inline ? undefined : style}
      role="status"
      aria-live="polite"
    >
      <p className="hint-card-body">{t(`onboarding.hints.${key}.body`)}</p>
      <div className="hint-card-actions">
        {actionLabel && (
          <button
            type="button"
            className="hint-card-btn hint-card-btn-action"
            onClick={() => {
              onAction?.();
              dismiss();
            }}
          >
            {actionLabel}
          </button>
        )}
        <button
          type="button"
          className="hint-card-btn hint-card-btn-dismiss"
          onClick={dismiss}
        >
          {t("onboarding.hints.dismiss")}
        </button>
      </div>
    </div>
  );
}
