import { useRef, useLayoutEffect, useEffect, type ReactNode } from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";

interface ViewTransitionProps {
  viewKey: string;
  themeId: string;
  disabled?: boolean;
  level?: string;
  animStyle?: string;
  children: ReactNode;
}

/**
 * Wraps view content and applies a one-shot enter-animation class
 * (`view-entering` for normal views, `settings-entering` for settings)
 * whenever `viewKey` changes.
 *
 * Why `useLayoutEffect` + direct `classList` mutation instead of state?
 *
 * Earlier versions used `useEffect` to flip a state flag, which set the
 * class on the *second* paint — so the browser would render the new
 * view once *without* the class (instant pop-in) and again *with* it
 * (animation begins), producing a visible flicker on every tab change.
 *
 * Render-time `setState` "solved" that in theory but in practice React
 * still committed an intermediate frame on slower transitions (notably
 * the drill grid, which is heavy to mount). Even one frame without the
 * class lets `animation-fill-mode: backwards` fail to engage on
 * children that were already keyframe-animated at mount.
 *
 * `useLayoutEffect` runs *synchronously after commit but before paint*,
 * so writing the class via the ref guarantees the very first frame the
 * user sees already has `view-entering` on the wrapper. Children with
 * `backwards` fill-mode are held in their `from` state during the
 * `animation-delay` window — clean cascade, no flicker.
 */
export function ViewTransition({
  viewKey,
  themeId,
  disabled,
  level,
  animStyle,
  children,
}: ViewTransitionProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const prevKeyRef = useRef(viewKey);
  // Skip the very first mount — we only animate on *transitions*, not
  // initial paint. (Initial paint already has its own first-load
  // animations elsewhere, and animating the very first view feels
  // jarring on app boot.)
  const isFirstRenderRef = useRef(true);
  // Shared hook (O8 motion audit) — same answer everywhere, and live, so
  // toggling the OS setting takes effect without a reload. `disabled` already
  // carries the `viewTransitions === "off"` preference from the caller.
  const reducedMotion = useReducedMotion();

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      prevKeyRef.current = viewKey;
      return;
    }

    if (viewKey === prevKeyRef.current) return;
    prevKeyRef.current = viewKey;

    if (disabled) return;
    if (reducedMotion) return;

    const isSettings = viewKey === "settings";
    const cls = isSettings ? "settings-entering" : "view-entering";
    // Conservative upper bound. Theme durations top out around 750ms
    // (expressive level), staggered ~8 children × 120ms = ~960ms in
    // the worst case. A 1.2s safety net cleans up class state even if
    // animationend doesn't fire (it can be skipped if the tab is
    // backgrounded mid-animation).
    const duration = isSettings ? 300 : 1200;

    // Defensive: strip any leftover class from a prior aborted
    // transition before re-adding, so the CSS animation restarts
    // cleanly. (Browsers won't replay an animation on a class that's
    // already present.)
    el.classList.remove("view-entering", "settings-entering");
    // Force reflow so the re-add registers as a fresh animation start.
    void el.offsetWidth;
    el.classList.add(cls);

    const timer = window.setTimeout(() => {
      el.classList.remove(cls);
    }, duration);

    return () => {
      window.clearTimeout(timer);
    };
  }, [viewKey, disabled, reducedMotion]);

  // If transitions are disabled mid-animation, clear classes immediately.
  // Flipping the OS reduced-motion setting counts as disabling them.
  useEffect(() => {
    if (!disabled && !reducedMotion) return;
    const el = wrapperRef.current;
    if (!el) return;
    el.classList.remove("view-entering", "settings-entering");
  }, [disabled, reducedMotion]);

  return (
    <div
      ref={wrapperRef}
      className="view-transition-wrapper"
      data-theme-transition={themeId}
      data-animation-level={
        !disabled && level && level !== "off" ? level : undefined
      }
      data-animation-style={!disabled && animStyle ? animStyle : undefined}
    >
      {children}
    </div>
  );
}
