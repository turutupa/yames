import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type AnimationEventHandler,
  type ReactNode,
} from "react";
import { useReducedMotion } from "../hooks/useReducedMotion";
import "../styles/motion.css";

/**
 * Where a surface is in its life: arriving, here, or leaving.
 *
 * There is no fourth value on purpose. "Gone" is not a state a surface can be
 * in — it is the absence of one, and `Presence` renders nothing at all then.
 */
export type PresenceState = "entering" | "open" | "exiting";

/** Must match `--motion-enter` and `--motion-exit` in motion.css. */
export const MOTION_ENTER_MS = 240;
export const MOTION_EXIT_MS = 160;

/**
 * How long after the animation should have finished we stop waiting for it.
 *
 * `animationend` is not a promise. A backgrounded tab, a browser that decided
 * to skip the animation, an element the compositor never got to — any of them
 * leaves the event unfired, and a sheet that never hears it is a sheet stuck
 * on the screen for good. So every wait has a clock behind it.
 */
const FALLBACK_SLACK_MS = 50;

/**
 * The three switches that decide whether the app may animate at all — the
 * same three `ViewTransition` takes, and read the same way.
 *
 * `themeId` because Mono is a theme with no motion in it; `disabled` because
 * Settings → Appearance has a View transitions "off"; `level` because the
 * stylesheets key off it. The OS `prefers-reduced-motion` is the fourth and it
 * is not passed by anybody: `useReducedMotion` asks the browser directly.
 */
export interface MotionInputs {
  themeId?: string;
  disabled?: boolean;
  level?: string;
  /** The chosen animation style, which some themes' keyframes key off. */
  animStyle?: string;
}

const MotionContext = createContext<MotionInputs>({});

/**
 * The motion settings, handed down once rather than threaded through every
 * component between the window and the thing that moves.
 *
 * A jam has seven surfaces that arrive — two sheets, a scrim, a drawer, the
 * shapes section, the pinned grip, the variation row — and several of them are
 * four components deep. Three props on each of those is twelve props that do
 * nothing but travel.
 */
export function MotionProvider({
  value,
  children,
}: {
  value: MotionInputs;
  children: ReactNode;
}) {
  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

/** The motion settings in scope. Empty outside a `MotionProvider`. */
export function useMotionInputs(): MotionInputs {
  return useContext(MotionContext);
}

/**
 * What a surface spreads onto the one element that carries the keyframes.
 *
 * `data-state` picks the animation, the two theme attributes let the
 * stylesheet say no, and `onAnimationEnd` is how the element tells `Presence`
 * it has finished. All four together, because a surface that took the state
 * and forgot the listener would never unmount.
 */
export interface MotionProps {
  "data-state": PresenceState;
  "data-theme-transition"?: string;
  "data-animation-level"?: string;
  "data-animation-style"?: string;
  onAnimationEnd: AnimationEventHandler<HTMLElement>;
}

/**
 * The last value that was really there.
 *
 * A surface that is leaving still has to draw something, and what it draws is
 * whatever it was showing when it was told to go. Without this, closing the
 * groove editor with Reset — which clears the groove and shuts the drawer in
 * one move — would leave the drawer sinking with nothing inside it.
 */
export function useLastPresent<T>(value: T | null | undefined): T | null {
  const last = useRef<T | null>(value ?? null);
  useEffect(() => {
    if (value !== null && value !== undefined) last.current = value;
  }, [value]);
  return value ?? last.current;
}

interface PresenceProps extends MotionInputs {
  /** Whether the surface should be on the screen. */
  open: boolean;
  /** Called once the exit has finished and the child is gone. */
  onExited?: () => void;
  /** Override the durations for a surface whose keyframes are not the tokens. */
  enterMs?: number;
  exitMs?: number;
  /**
   * The surface, given its state and the props to spread on it.
   *
   * A render function rather than a cloned child, for two reasons that both
   * bite in this app: the chord sheet is a PORTAL, so there is no element here
   * to clone, and the element that should animate is often three components
   * down from the one that knows whether it is open.
   */
  children: (state: PresenceState, motion: MotionProps) => ReactNode;
}

type Phase = PresenceState | "gone";

/**
 * Keeps a closing surface on the screen until it has finished leaving
 * (JAM_UX_DECISIONS A11).
 *
 * React unmounts the instant a condition goes false, which is why every
 * surface in the app used to vanish rather than leave. This is the one piece
 * that fixes that everywhere: the child stays mounted with
 * `data-state="exiting"` on it, the stylesheet plays the exit, and only when
 * the animation ends — or the clock runs out — does the child go.
 *
 * When motion is off (the OS setting, the app's own preference, or the Mono
 * theme) there is no `entering` and no `exiting` at all: the surface is
 * `open` from its first frame and gone from the frame it closes, exactly as
 * the app behaved before this existed.
 *
 * Closing and reopening quickly cannot leave a ghost, because there is only
 * ever one child: reopening mid-exit turns the same element around rather than
 * mounting a second copy beside the first.
 */
export function Presence({
  open,
  themeId,
  disabled,
  level,
  animStyle,
  onExited,
  enterMs = MOTION_ENTER_MS,
  exitMs = MOTION_EXIT_MS,
  children,
}: PresenceProps) {
  const inherited = useMotionInputs();
  const theme = themeId ?? inherited.themeId;
  const off = disabled ?? inherited.disabled;
  const animationLevel = level ?? inherited.level;
  const style = animStyle ?? inherited.animStyle;

  // One definition of "may I animate?", live, so flipping the OS setting takes
  // effect without a reload. `off` is folded in as the "off" level the hook
  // already knows how to refuse.
  const reduced = useReducedMotion(off ? "off" : animationLevel);
  const still = reduced || theme === "mono";

  const [phase, setPhase] = useState<Phase>(() => (open ? (still ? "open" : "entering") : "gone"));

  // The phase as the effects and the event handler see it. They fire outside
  // the render that produced the value, and a stale close over `phase` would
  // let a late `animationend` from a finished enter unmount a live surface.
  const phaseRef = useRef<Phase>(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // The caller's callback, read at the moment it is needed rather than
  // captured — an inline arrow prop must not restart the exit's clock.
  const onExitedRef = useRef(onExited);
  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  const finish = useCallback(() => {
    setPhase("gone");
    onExitedRef.current?.();
  }, []);

  // Declared after the mirror above so that within one commit `phaseRef` is
  // already up to date when this reads it.
  useEffect(() => {
    const current = phaseRef.current;
    if (open) {
      if (still) {
        if (current !== "open") setPhase("open");
        return;
      }
      // From nothing, or catching an exit half-way. Either way the element
      // stays where it is, which is what stops a ghost: there is no second
      // copy to mount because the first one never left.
      if (current === "gone" || current === "exiting") setPhase("entering");
      return;
    }
    if (current === "gone") return;
    if (still) {
      finish();
      return;
    }
    if (current !== "exiting") setPhase("exiting");
  }, [open, still, finish]);

  useEffect(() => {
    if (phase !== "entering" && phase !== "exiting") return;
    const wait = (phase === "entering" ? enterMs : exitMs) + FALLBACK_SLACK_MS;
    const timer = window.setTimeout(() => {
      if (phaseRef.current === "entering") setPhase("open");
      else if (phaseRef.current === "exiting") finish();
    }, wait);
    return () => window.clearTimeout(timer);
  }, [phase, enterMs, exitMs, finish]);

  const handleAnimationEnd = useCallback<AnimationEventHandler<HTMLElement>>(
    (event) => {
      // Only the surface's own animation counts. `animationend` bubbles, and a
      // diagram or a hint inside the sheet finishing its own keyframes is not
      // the sheet having arrived.
      if (event.target !== event.currentTarget) return;
      if (phaseRef.current === "entering") setPhase("open");
      else if (phaseRef.current === "exiting") finish();
    },
    [finish],
  );

  if (phase === "gone") return null;

  const motion: MotionProps = {
    "data-state": phase,
    ...(theme ? { "data-theme-transition": theme } : {}),
    ...(!off && animationLevel && animationLevel !== "off"
      ? { "data-animation-level": animationLevel }
      : {}),
    ...(!off && style ? { "data-animation-style": style } : {}),
    onAnimationEnd: handleAnimationEnd,
  };

  return <>{children(phase, motion)}</>;
}
