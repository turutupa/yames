import { useTranslation } from "react-i18next";
import { BreakdownBar, Histogram } from "../../drill/evaluation";
import { FEEDBACK_COLORS } from "../../../hooks/useEvaluation";
import type { SavedSession } from "../../../types";
import { formatDate } from "../../../utils/dates";
import { scoredBeats } from "../../../coach/reportStats";
import { RunSummary, SegmentTimeline } from "./RunReport";

/**
 * One tool run, opened from the list on Progress → Tool runs (the old coach
 * card's History detail, with the end-of-session card's summary folded in so
 * nothing either showed is lost): what it was, the summary (score in words,
 * the timing figures with their units, note spacing and beat placement, the
 * narrative, the insights), the timeline of its stretches, the breakdown, the
 * timing histogram, and Delete, the player's own button.
 */
export function ToolRunDetail({
  session,
  onDelete,
}: {
  session: SavedSession;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const report = session.report;
  const scored = scoredBeats(report);

  return (
    <div className="coach-detail" data-testid="tool-run-detail">
      <div className="coach-detail-meta">
        {session.presetName && <>{session.presetName} &middot; </>}
        {session.bpm} BPM &middot; {formatDate(session.timestamp, t, i18n.language)}
      </div>
      {report.comment && <div className="coach-detail-comment">{report.comment}</div>}

      <RunSummary report={report} />

      {session.segments && session.segments.length > 0 && (
        <div className="coach-detail-section">
          <div className="coach-detail-section-title">{t("coachDetail.exercises")}</div>
          <SegmentTimeline
            segments={session.segments}
            sessionStart={session.segments[0].startTime ?? session.timestamp}
          />
        </div>
      )}

      <div className="coach-detail-section">
        <div className="coach-detail-section-title">{t("eval.breakdown")}</div>
        <div className="coach-detail-bars">
          <BreakdownBar label={t("eval.perfect")} count={report.perfectCount} total={scored} color={FEEDBACK_COLORS.perfect} />
          <BreakdownBar label={t("eval.good")} count={report.goodCount} total={scored} color={FEEDBACK_COLORS.good} />
          <BreakdownBar label={t("eval.ok")} count={report.okCount} total={scored} color={FEEDBACK_COLORS.ok} />
          <BreakdownBar label={t("eval.miss")} count={report.missCount} total={scored} color={FEEDBACK_COLORS.miss} />
        </div>
      </div>

      {report.deviations.length > 4 && (
        <div className="coach-detail-section">
          <div className="coach-detail-section-title">{t("eval.timingDistribution")}</div>
          <Histogram deviations={report.deviations} />
        </div>
      )}

      <button type="button" className="coach-detail-delete-btn" onClick={onDelete} data-testid="tool-run-delete">
        {t("eval.deleteSession")}
      </button>
    </div>
  );
}
