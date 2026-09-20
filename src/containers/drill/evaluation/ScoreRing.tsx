import { feedbackToneForScore } from "../../../coach/reportStats";

/**
 * The ring's own palette — deliberately not the `--feedback-*` beat
 * colours, because a ring filling a whole card reads heavier than a
 * bar. Which of the four a score falls into, though, is not this
 * component's decision: it comes from the one score-band table in
 * `reportStats`, so the ring can never disagree with the word printed
 * beside it. See ROADMAP 1.7, P3-COACH-3.
 */
const RING_COLORS = {
  perfect: "#10b981",
  good: "#06b6d4",
  ok: "#f59e0b",
  miss: "#6b7280",
} as const;

export function ScoreRing({ score, size, strokeWidth }: { score: number; size: number; strokeWidth: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score / 100, 1);
  const offset = circumference * (1 - progress);

  const color = RING_COLORS[feedbackToneForScore(score)];

  return (
    <div className="eval-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="eval-ring-bg"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          className="eval-ring-fill"
        />
      </svg>
      <span className="eval-ring-score" style={{ color, fontSize: Math.max(10, size * 0.35) }}>{score}</span>
    </div>
  );
}
