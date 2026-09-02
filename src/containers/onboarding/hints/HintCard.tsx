/**
 * The hint card — one line of copy, an optional action, and a dismiss button.
 *
 * Two placements:
 *   - anchored (default): fixed, positioned next to the `data-hint="<id>"`
 *     element via `anchor.ts`. Falls back to a bottom-centre toast when the
 *     anchor is not on screen.
 *   - inline: rendered in the document flow, for hosts that already own their
 *     layout (the coach feed, the Zen overlay).
 *
 * Copy lives at `onboarding.hints.<key>.body` / `.action`; nothing here is a
 * literal string.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  VIEWPORT_MARGIN,
  computeAnchorPlacement,
  findAnchorElement,
  rectOf,
} from "./anchor";
import { HINT_I18N_KEY, type HintId } from "./types";
import "../../../styles/hints.css";

export type HintCardProps = {
  id: HintId;
  /** Render in the document flow instead of anchoring to `data-hint`. */
  inline?: boolean;
  /** Optional primary action. The label comes from `…<key>.action`. */
  onAction?: () => void;
  /** Called for the dismiss button, Escape, and after the action runs. */
  onDismiss: () => void;
};

export function HintCard({ id, inline, onAction, onDismiss }: HintCardProps) {
  const { t } = useTranslation();
  const cardRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>(
    inline ? {} : { top: 0, left: 0, visibility: "hidden" },
  );
  const [placement, setPlacement] = useState<"below" | "above" | "float">("below");
  const key = HINT_I18N_KEY[id];

  // --- Anchoring ----------------------------------------------------------
  useLayoutEffect(() => {
    if (inline) return;
    const update = () => {
      const el = cardRef.current;
      if (!el) return;
      const size = { width: el.offsetWidth, height: el.offsetHeight };
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const anchor = findAnchorElement(id);
      if (!anchor) {
        // No anchor on screen — behave like a toast above the bottom edge.
        setPlacement("float");
        setStyle({
          top: Math.max(VIEWPORT_MARGIN, viewport.height - size.height - 24),
          left: Math.max(VIEWPORT_MARGIN, (viewport.width - size.width) / 2),
        });
        return;
      }
      const next = computeAnchorPlacement(rectOf(anchor), size, viewport);
      setPlacement(next.placement);
      setStyle({ top: next.top, left: next.left });
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

  // --- Escape dismisses ---------------------------------------------------
  const dismiss = useCallback(() => onDismiss(), [onDismiss]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      dismiss();
    };
    // Capture, so the hint eats the key before Zen/Settings act on it.
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [dismiss]);

  const actionLabel = onAction ? t(`onboarding.hints.${key}.action`) : null;

  return (
    <div
      ref={cardRef}
      className={`hint-card${inline ? " hint-card-inline" : ""}`}
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
