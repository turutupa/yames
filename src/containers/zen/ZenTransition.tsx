import { useEffect, useState, useRef, type ReactNode } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";

interface ZenTransitionProps {
  isActive: boolean;
  themeId: string;
  disabled?: boolean;
  level?: string;
  animStyle?: string;
  children: ReactNode;
}

type ZenState = "hidden" | "entering" | "visible" | "exiting";

export function ZenTransition({ isActive, themeId, disabled, level, animStyle, children }: ZenTransitionProps) {
  // Shared hook (O8 motion audit): one definition of "reduced motion", and it
  // re-renders when the OS setting changes instead of latching whatever was
  // true at first render.
  const prefersReduced = useReducedMotion();
  const noAnimation = prefersReduced || disabled || themeId === "mono";
  const [state, setState] = useState<ZenState>(isActive ? "visible" : "hidden");
  const prevActive = useRef(isActive);

  useEffect(() => {
    if (isActive === prevActive.current) return;
    prevActive.current = isActive;

    if (isActive) {
      if (noAnimation) {
        setState("visible");
      } else {
        setState("entering");
      }
    } else {
      if (noAnimation) {
        setState("hidden");
      } else {
        setState("exiting");
      }
    }
  }, [isActive, noAnimation]);

  const handleAnimationEnd = () => {
    if (state === "entering") setState("visible");
    if (state === "exiting") setState("hidden");
  };

  if (state === "hidden") return null;

  const className = [
    "zen-transition-wrapper",
    state === "entering" ? "zen-entering" : "",
    state === "exiting" ? "zen-exiting" : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={className}
      data-theme-transition={themeId}
      data-animation-level={level && level !== "off" ? level : undefined}
      data-animation-style={!disabled && animStyle ? animStyle : undefined}
      onAnimationEnd={handleAnimationEnd}
    >
      {children}
    </div>
  );
}
