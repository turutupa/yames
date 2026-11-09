import { isLightColor } from "./helpers";
import { feedbackToneForScore } from "../../../coach/reportStats";

export function ScoreBadge({ score }: { score: number }) {
  // Which of the four a score falls into comes from the one score-band
  // table (ROADMAP 1.7, P3-COACH-3) — the badge used to keep its own
  // boundaries and could contradict the ring next to it.
  const variable = `--feedback-${feedbackToneForScore(score)}`;
  const color = `var(${variable})`;
  const resolved = getComputedStyle(document.documentElement)
    .getPropertyValue(variable)
    .trim();
  const textColor = isLightColor(resolved) ? "#1a1a2e" : "#fff";
  return (
    <span className="eval-score-badge" style={{ backgroundColor: color, color: textColor }}>
      {score}
    </span>
  );
}
