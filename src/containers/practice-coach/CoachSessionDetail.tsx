import { useTranslation } from "react-i18next";
import { ScoreRing, BreakdownBar, Histogram } from "../drill/evaluation";
import { FEEDBACK_COLORS } from "../../hooks/useEvaluation";
import type { SavedSession } from "../../types";
import { formatDate } from "./coachCardHelpers";
import { accuracyPct, scoredBeats } from "../../coach/reportStats";
import { SessionNarrativeView } from "../../coach/SessionNarrativeView";
import { SegmentTimeline } from "./CoachFeedMessage";

/**
 * Detail view for a single saved session — shown when the user picks a
 * card from CoachHistoryList. Renders the score ring, AI insights, the
 * perfect/good/ok/miss breakdown bars, a histogram of timing deviations
 * (only when we have enough samples), and the full stats grid.
 */
export function CoachSessionDetail({
  session,
  onDelete,
}: {
  session: SavedSession;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const report = session.report;
  // In Default mode with subdivision > 1, show accent (downbeat) accuracy
  // so the number reflects what the scoring formula actually measures.
  // Fall back to hit/(hit+miss) for Pro mode, old sessions, or short warmups
  // where accent counts are unavailable. See `src/coach/reportStats.ts`.
  const hitRate =
    report.coachMode === "default" &&
    report.accentBeatsCount != null &&
    report.accentBeatsCount > 0
      ? Math.round((report.accentHitsCount! / report.accentBeatsCount) * 100)
      : accuracyPct(report);

  // Convert longestStreak (subdivision units) to quarter-note beats for display.
  const streakBeats =
    report.subdivision && report.subdivision > 1
      ? Math.floor(report.longestStreak / report.subdivision)
      : report.longestStreak;

  const scored = scoredBeats(report);

  return (
    <div className="coach-detail">
      <div className="coach-detail-ring">
        <ScoreRing score={report.score} size={80} strokeWidth={5} />
        <div className="coach-detail-meta">
          {session.presetName && <>{session.presetName} &middot; </>}
          {session.bpm} BPM &middot; {formatDate(session.timestamp, t, i18n.language)}
        </div>
        {report.comment && (
          <div className="coach-detail-comment">{report.comment}</div>
        )}
      </div>

      {/*
        Narrative goes BEFORE the rule-based insights. The narrative
        explains what the score means relative to the underlying
        components (e.g. "65 with tight consistency is closer to an A
        than the number suggests"); the insights below are concrete
        rule-fired observations ("you dragged ~20 ms behind the click").
        Reading the narrative first gives the user the framing they
        need to interpret the insights instead of treating each one as
        an isolated complaint.
      */}
      <SessionNarrativeView report={report} />

      {report.insights.length > 0 && (
        <div className="coach-detail-insights">
          {report.insights.map((insight, i) => (
            <div key={i} className="coach-detail-insight">{insight}</div>
          ))}
        </div>
      )}

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
          <BreakdownBar label={t("eval.perfect")}  count={report.perfectCount} total={scored} color={FEEDBACK_COLORS.perfect} />
          <BreakdownBar label={t("eval.good")}     count={report.goodCount}    total={scored} color={FEEDBACK_COLORS.good} />
          <BreakdownBar label={t("eval.ok")}       count={report.okCount}      total={scored} color={FEEDBACK_COLORS.ok} />
          <BreakdownBar label={t("eval.miss")} count={report.missCount}    total={scored} color={FEEDBACK_COLORS.miss} />
        </div>
      </div>

      {report.deviations.length > 4 && (
        <div className="coach-detail-section">
          <div className="coach-detail-section-title">{t("eval.timingDistribution")}</div>
          <Histogram deviations={report.deviations} />
        </div>
      )}

      <div className="coach-detail-section">
        <div className="coach-detail-section-title">{t("eval.details")}</div>
        <div className="coach-detail-stats">
          <div className="coach-detail-stat">
            <span className="coach-detail-stat-label">{t("eval.hitRate")}</span>
            <span className="coach-detail-stat-value">{hitRate}%</span>
          </div>
          <div className="coach-detail-stat">
            {/*
              "Avg timing error" uses the MAGNITUDE (meanAbsDeviationMs) — not
              the signed mean (meanDeviationMs), which cancels to ~0 whenever
              early/late errors are symmetric and produced the misleading
              "+0.0 ms" display on sloppy sessions. The signed mean still
              carries information ("rushing" vs "dragging") and is surfaced
              in the narrative block / Bias row below.
            */}
            <span className="coach-detail-stat-label">{t("eval.avgTimingError")}</span>
            <span className="coach-detail-stat-value">{"\u00B1"}{report.meanAbsDeviationMs.toFixed(1)}ms</span>
          </div>
          <div className="coach-detail-stat">
            <span className="coach-detail-stat-label">{t("eval.consistency")}</span>
            <span className="coach-detail-stat-value">{"\u00B1"}{report.stdDeviationMs.toFixed(1)}ms</span>
          </div>
          <div className="coach-detail-stat">
            <span className="coach-detail-stat-label">{t("eval.tempoStability")}</span>
            <span className="coach-detail-stat-value">{"\u00B1"}{report.tempoStabilityMs.toFixed(1)}ms</span>
          </div>
          <div className="coach-detail-stat">
            <span className="coach-detail-stat-label">{t("eval.longestStreak")}</span>
            <span className="coach-detail-stat-value">{streakBeats}</span>
          </div>
          <div className="coach-detail-stat">
            <span className="coach-detail-stat-label">{t("eval.scoredBeats")}</span>
            <span className="coach-detail-stat-value">{scored}</span>
          </div>
          {report.skippedBeats > 0 && (
            <div className="coach-detail-stat">
              <span className="coach-detail-stat-label">{t("coachDetail.notPlayed")}</span>
              <span className="coach-detail-stat-value">{report.skippedBeats}</span>
            </div>
          )}
          {report.intervalConsistency !== undefined && (
            <div className="coach-detail-stat">
              <span className="coach-detail-stat-label">{t("coachDetail.noteSpacing")}</span>
              <span className="coach-detail-stat-value">{report.intervalConsistency.toFixed(2)}</span>
            </div>
          )}
          {report.gridAlignment !== undefined && (
            <div className="coach-detail-stat">
              <span className="coach-detail-stat-label">{t("coachDetail.beatPlacement")}</span>
              <span className="coach-detail-stat-value">{report.gridAlignment.toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>

      <button className="coach-detail-delete-btn" onClick={onDelete}>{t("eval.deleteSession")}</button>
    </div>
  );
}
