/**
 * The input's level, live, in four small bars (owner, 2026-11-18): with
 * grading on, the chip that says "Listening" shows the player that the guitar
 * is reaching Yames, and pulses once for each note it picks up.
 *
 * No new audio work. The level is the `audio-spectrum` event the Settings
 * input test already draws (`InputLevelMeter`), released the same way (the
 * attack is instant, so each pick shows); the
 * pulse is the onset events that are already sent (`score-onset` while a Take
 * is scored, `beat-feedback` while the coach listens). Both are read straight
 * into the DOM, not into React state, so a bar moving re-renders nothing, at
 * most ~30 times a second and not at all while the window is hidden. With
 * reduced motion the level is drawn a few times a second, without a pulse.
 */
import { useEffect, useRef } from "react";
import { onAudioSpectrum, onBeatFeedback, onScoreOnset } from "../ipc";
import { RMS_SMOOTHING_ALPHA, SIGNAL_FLOOR_RMS, dbToPercent, rmsToDb } from "./InputLevelMeter";
import { REDUCED_MOTION_QUERY } from "../hooks/useReducedMotion";

/** Four bars. */
export const LEVEL_BARS = 4;
/** Lowest share of the meter's range (`dbToPercent`) that lights each bar. */
const THRESHOLDS = [0, 45, 58, 72];
/** ~30 frames a second at most. */
const FRAME_MS = 33;
/** With reduced motion: a still reading, a few times a second. */
const CALM_FRAME_MS = 300;

/** How many bars a level lights, 0..4: none under the noise floor. */
export function barsFor(rms: number): number {
  if (!(rms > SIGNAL_FLOOR_RMS)) return 0;
  const pct = dbToPercent(rmsToDb(rms));
  return Math.max(1, THRESHOLDS.filter((t) => pct >= t).length);
}

/** The state in words, for a screen reader: by bars lit. */
export function levelWord(bars: number): "silent" | "low" | "good" | "high" {
  return bars === 0 ? "silent" : bars === 1 ? "low" : bars === LEVEL_BARS ? "high" : "good";
}

export function LiveLevelBars({
  active,
  label,
  className,
}: {
  /** The input is on: listen for the level. Off, the bars are still and dark. */
  active: boolean;
  /** Words for each state, for `aria-label` ("Input level: good"). */
  label: (word: ReturnType<typeof levelWord>) => string;
  className?: string;
}) {
  const root = useRef<HTMLSpanElement>(null);
  const labelRef = useRef(label);
  labelRef.current = label;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const calm = typeof window.matchMedia === "function" && window.matchMedia(REDUCED_MOTION_QUERY).matches;
    let smoothed = 0;
    let shown = -1;
    let lastDraw = 0;
    let frame: number | null = null;
    const draw = () => {
      frame = null;
      lastDraw = performance.now();
      const bars = active ? barsFor(smoothed) : 0;
      if (bars === shown) return;
      shown = bars;
      el.dataset.bars = String(bars);
      el.setAttribute("aria-label", labelRef.current(levelWord(bars)));
    };
    draw();
    if (!active) return;
    const schedule = () => {
      if (frame !== null || document.hidden) return;
      const wait = Math.max(0, (calm ? CALM_FRAME_MS : FRAME_MS) - (performance.now() - lastDraw));
      frame = window.setTimeout(() => {
        frame = null;
        window.requestAnimationFrame(draw);
      }, wait);
    };
    let pulseTimer: number | null = null;
    const pulse = () => {
      if (calm || document.hidden) return;
      // Restart the animation: off, a reflow, on.
      el.removeAttribute("data-pulse");
      void el.offsetWidth;
      el.setAttribute("data-pulse", "");
      if (pulseTimer !== null) window.clearTimeout(pulseTimer);
      pulseTimer = window.setTimeout(() => el.removeAttribute("data-pulse"), 260);
    };
    let live = true;
    const offs: Array<() => void> = [];
    const keep = (p: Promise<() => void>) =>
      void p.then((off) => (live ? offs.push(off) : off())).catch(() => {});
    keep(
      onAudioSpectrum((s) => {
        // A meter's ballistics: up at once with a pick, down smoothly.
        const rms = s?.rms ?? 0;
        smoothed = rms > smoothed ? rms : smoothed * (1 - RMS_SMOOTHING_ALPHA) + rms * RMS_SMOOTHING_ALPHA;
        schedule();
      }),
    );
    keep(onScoreOnset(pulse));
    keep(onBeatFeedback(pulse));
    const onVisible = () => {
      if (!document.hidden) schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      offs.forEach((off) => off());
      if (frame !== null) window.clearTimeout(frame);
      if (pulseTimer !== null) window.clearTimeout(pulseTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active]);

  return (
    <span
      ref={root}
      className={`live-level${className ? ` ${className}` : ""}`}
      role="img"
      data-bars="0"
      data-testid="live-level"
    >
      {Array.from({ length: LEVEL_BARS }, (_, i) => (
        <i key={i} data-i={i + 1} />
      ))}
    </span>
  );
}
