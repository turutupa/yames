import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FEEDBACK_COLORS } from "../hooks/useEvaluation";
import type { BeatFeedback } from "../types";

interface DriftMeterProps {
  lastFeedback: BeatFeedback | null;
  avgDeviation: number;
  visible: boolean;
}

/**
 * A small horizontal meter showing how early/late the player is.
 * The needle moves left (early) or right (late) from center.
 * Recent average deviation drives the position.
 */
export default function DriftMeter({ lastFeedback, avgDeviation, visible }: DriftMeterProps) {
  const { t } = useTranslation();
  const needleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!needleRef.current) return;
    // Map deviation to -1..1 range (±50ms = full deflection)
    const clamped = Math.max(-50, Math.min(50, avgDeviation));
    const pct = (clamped / 50) * 50; // ±50% from center
    needleRef.current.style.transform = `translateX(${pct}%)`;
  }, [avgDeviation]);

  if (!visible) return null;

  const color = lastFeedback
    ? FEEDBACK_COLORS[lastFeedback.classification as keyof typeof FEEDBACK_COLORS] ?? FEEDBACK_COLORS.miss
    : "var(--text-tertiary)";

  return (
    <div className="drift-meter">
      <span className="drift-label">{t("driftMeter.early")}</span>
      <div className="drift-track">
        <div className="drift-center" />
        <div
          ref={needleRef}
          className="drift-needle"
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="drift-label">{t("driftMeter.late")}</span>
    </div>
  );
}
