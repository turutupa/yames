/** Contextual status chip rendered above the coach chat input.
 *
 * Shows the most relevant system state so the user always knows what
 * the coach is doing without cluttering the feed.  Priority order
 * (highest wins):
 *   1. coachLoading  → "Thinking…"
 *   2. ttsActive     → "Speaking…"
 *   3. isPlaying + noodling  → "Noodling"
 *   4. isPlaying + locked divisor  → "Tracking 16ths" (grid confirmed, following it)
 *   5. isPlaying + not yet locked  → "Playing" (still inferring)
 *   6. listening + locked divisor  → "Tracking 16ths" (paused between bars)
 *   7. listening (not locked) → "Listening…"
 *   8. nothing  → renders null
 */
import { useTranslation } from "react-i18next";

export interface SystemStatusChipProps {
  /** Whether a coach session is currently active. */
  active: boolean;
  /** True while the metronome is running. */
  isPlaying?: boolean;
  /** True while the onset detector is sampling audio. */
  listening?: boolean;
  /** Derived play style from onset_efficiency (Step 5). */
  playMode?: "structured" | "noodling";
  /** True while the LLM response is streaming. */
  coachLoading?: boolean;
  /** True while TTS audio is being played back. */
  ttsActive?: boolean;
  /** Locked rhythm-inference divisor (1/2/3/4/6) from Path B. When set,
   *  both the playing and listening states show "Tracking X" — detection is
   *  done, the grid is confirmed. Only pass when locked === true. */
  inferredDivisor?: number;
}

type ChipVariant = "listening" | "playing" | "noodling" | "thinking" | "speaking";

function resolveVariant(props: SystemStatusChipProps): ChipVariant | null {
  const { active, isPlaying, listening, playMode, coachLoading, ttsActive } =
    props;
  if (!active) return null;
  if (coachLoading) return "thinking";
  if (ttsActive) return "speaking";
  if (isPlaying) return playMode === "noodling" ? "noodling" : "playing";
  if (listening) return "listening";
  return null;
}

/** Map a confirmed (locked) divisor to a "Tracking X" label.
 *  Used for both the playing+locked and listening+locked states —
 *  once locked, inference is done regardless of whether the click is running. */
const TRACKING_KEY: Record<number, string> = {
  1: "coachStatus.tracking.quarters",
  2: "coachStatus.tracking.eighths",
  3: "coachStatus.tracking.triplets",
  4: "coachStatus.tracking.sixteenths",
  6: "coachStatus.tracking.sextuplets",
};

function trackingLabel(
  divisor: number | undefined,
  fallback: string,
  t: (key: string) => string,
): string {
  const key = divisor ? TRACKING_KEY[divisor] : undefined;
  return key ? t(key) : fallback;
}

/** Minimal dot indicator that pulses for active states. */
function StatusDot({ variant }: { variant: ChipVariant }) {
  const pulse = variant === "listening" || variant === "thinking" || variant === "speaking";
  return (
    <span
      className={`system-status-chip-dot ${pulse ? "pulse" : ""} ${variant}`}
    />
  );
}

export function SystemStatusChip(props: SystemStatusChipProps) {
  const { t } = useTranslation();
  const variant = resolveVariant(props);
  if (!variant) return null;

  const base = t(`coachStatus.${variant}`);
  const label =
    (variant === "playing" || variant === "listening") && props.inferredDivisor
      ? trackingLabel(props.inferredDivisor, base, t)
      : base;

  return (
    <div className={`system-status-chip ${variant}`}>
      <StatusDot variant={variant} />
      <span className="system-status-chip-label">{label}</span>
    </div>
  );
}
