/**
 * A tool run's report, as Progress → Tool runs shows it (DESIGN 7: "the
 * summary and the History tab" moved here with leg c2a2).
 *
 * Kept from the old coach card's end-of-session card and its timeline
 * (`CoachFeedMessage.tsx`, whose feed renderer went with the card): the
 * score in words beside the ring, the timing figures with their units, note
 * spacing and beat placement as labelled bars, the narrative and the insights,
 * and the exercise timeline. Every rule that file's tests held still holds
 * (`RunReport.test.tsx`).
 */
import { useTranslation } from "react-i18next";
import { ScoreRing, ScoreBadge } from "../../drill/evaluation";
import { SessionNarrativeView } from "../../../coach/SessionNarrativeView";
import type { SessionReport, SessionSegment } from "../../../types";
import { formatDuration } from "../../../utils/dates";
import { accuracyPct, bandForScore, scoredBeats } from "../../../coach/reportStats";

/** The run's score, its parts and what they mean (the old session-end card's body). */
export function RunSummary({ report }: { report: SessionReport }) {
  const { t } = useTranslation();
  // One word for the whole session, on the same boundaries as the ring
  // beside it and the narrative below it. It used to break at 90/75/55
  // of its own accord, so a 72 was called "Fair" under a ring coloured
  // good and over a paragraph that began "72 is a real foundation".
  // ROADMAP 1.7, P3-COACH-3.
  const scoreQualifier = (score: number): string => {
    switch (bandForScore(score)) {
      case "flawless":
      case "strong": return t("coachReport.qualifier.excellent");
      case "solid": return t("coachReport.qualifier.good");
      case "fair": return t("coachReport.qualifier.fair");
      default: return t("coachReport.qualifier.keepPracticing");
    }
  };

  // In Default mode with subdivision > 1, show accent (downbeat) accuracy:
  // only the quarter-beat positions count toward the score. For Pro mode
  // or when accent data is unavailable, fall back to hit/(hit+miss).
  const accuracy =
    report.coachMode === "default" &&
    report.accentBeatsCount != null &&
    report.accentBeatsCount > 0
      ? Math.round((report.accentHitsCount! / report.accentBeatsCount) * 100)
      : accuracyPct(report);

  // In subdivision mode, convert longestStreak (in subdivision units) to
  // quarter-note beats so "Best Streak: 3" reads "3 downbeats" not "3 sixteenths".
  const streakBeats =
    report.subdivision && report.subdivision > 1
      ? Math.floor(report.longestStreak / report.subdivision)
      : report.longestStreak;

  return (
    <>
      <div className="coach-mini-report-header">
        <ScoreRing score={report.score} size={52} strokeWidth={5} />
        <div className="coach-mini-report-stats">
          <span className="coach-mini-report-score-label">{t("coachReport.sessionScore")}</span>
          <span className="coach-mini-report-score-sublabel">
            {scoreQualifier(report.score)}
          </span>
        </div>
      </div>
      <div className="coach-end-report-grid">
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("coachReport.beatsHit")}</span>
          <span className="coach-end-report-stat-sublabel">{t("coachReport.beatsHitHint")}</span>
          <span className="coach-end-report-stat-value">{accuracy}%</span>
        </div>
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("eval.avgTimingError")}</span>
          <span className="coach-end-report-stat-sublabel">{t("coachReport.tighter")}</span>
          <span className="coach-end-report-stat-value">{"±"}{report.meanAbsDeviationMs.toFixed(1)}ms</span>
        </div>
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("eval.consistency")}</span>
          <span className="coach-end-report-stat-sublabel">{t("coachReport.tighter")}</span>
          <span className="coach-end-report-stat-value">{"±"}{report.stdDeviationMs.toFixed(1)}ms</span>
        </div>
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("eval.tempoStability")}</span>
          <span className="coach-end-report-stat-value">{"±"}{report.tempoStabilityMs.toFixed(1)}ms</span>
        </div>
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("coachReport.bestStreak")}</span>
          <span className="coach-end-report-stat-value">{streakBeats}</span>
        </div>
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("eval.scoredBeats")}</span>
          <span className="coach-end-report-stat-value">{scoredBeats(report)}</span>
        </div>
        {report.skippedBeats > 0 && (
          <div className="coach-end-report-stat">
            <span className="coach-end-report-stat-label">{t("coachDetail.notPlayed")}</span>
            <span className="coach-end-report-stat-value">{report.skippedBeats}</span>
          </div>
        )}
        {/*
          Note spacing and beat placement used to appear twice: here as
          bare `0.42` / `0.71`, and again below as a labelled bar reading
          "42 %" with a sublabel and a tooltip. Two renderings of one
          number, one of them unreadable — a player could only conclude
          they were different measurements. The bar rows win; these two
          cells are gone. ROADMAP 1.6, problem 1.
        */}
      </div>
      {report.intervalConsistency !== undefined && (
        <div className="end-report-components">
          <div className="end-report-component-row">
            <div className="end-report-component-label-group">
              <span className="end-report-component-label" title={t("coachReport.noteSpacingTitle")}>{t("coachDetail.noteSpacing")}</span>
              <span className="end-report-component-sublabel">{t("coachReport.noteSpacingSub")}</span>
            </div>
            <div className="end-report-component-bar-track">
              <div
                className="end-report-component-bar-fill"
                style={{ width: `${Math.round(report.intervalConsistency * 100)}%` }}
              />
            </div>
            <span className="end-report-component-value">
              {Math.round(report.intervalConsistency * 100)}%
            </span>
          </div>
          <div className="end-report-component-row">
            <div className="end-report-component-label-group">
              <span className="end-report-component-label" title={t("coachReport.beatPlacementTitle")}>{t("coachDetail.beatPlacement")}</span>
              <span className="end-report-component-sublabel">{t("coachReport.beatPlacementSub")}</span>
            </div>
            <div className="end-report-component-bar-track">
              <div
                className="end-report-component-bar-fill"
                style={{ width: `${Math.round((report.gridAlignment ?? 0) * 100)}%` }}
              />
            </div>
            <span className="end-report-component-value">
              {report.gridAlignment !== undefined ? `${Math.round(report.gridAlignment * 100)}%` : "—"}
            </span>
          </div>
        </div>
      )}
      {/* AI narrative — rule-based systematic analysis */}
      <SessionNarrativeView report={report} />
      {/* Rule-based insights */}
      {report.insights.length > 0 && (
        <div className="coach-detail-insights">
          {report.insights.map((insight, i) => (
            <div key={i} className="coach-detail-insight">{insight}</div>
          ))}
        </div>
      )}
    </>
  );
}

function SegmentBreakdownBar({ report }: { report: SessionReport }) {
  const scored = scoredBeats(report);
  if (scored === 0) return null;
  const segments = [
    { count: report.perfectCount, color: "var(--feedback-perfect)" },
    { count: report.goodCount,    color: "var(--feedback-good)" },
    { count: report.okCount,      color: "var(--feedback-ok)" },
    { count: report.missCount,    color: "var(--feedback-miss)" },
  ].filter((s) => s.count > 0);
  return (
    <div className="coach-segment-breakdown">
      {segments.map((s, i) => (
        <div
          key={i}
          className="coach-segment-breakdown-bar"
          style={{ flex: s.count / scored, backgroundColor: s.color }}
        />
      ))}
    </div>
  );
}

export function SegmentTimeline({ segments, sessionStart }: { segments: SessionSegment[]; sessionStart: number }) {
  const { t } = useTranslation();
  return (
    <div className="coach-segment-timeline">
      <div className="coach-segment-timeline-title">{t("coachReport.timeline")}</div>
      {segments.map((seg, i) => {
        const start = seg.startTime ?? sessionStart;
        const end = seg.endTime ?? start;
        const offsetSec = Math.round((start - sessionStart) / 1000);
        const durationSec = Math.round((end - start) / 1000);
        // Accuracy uses SCORED beats (hits + miss) — same denominator as
        // the Rust score and RunSummary, so the per-segment accuracy in the
        // timeline doesn't disagree with the overall accuracy above. See
        // `src/coach/reportStats.ts`.
        const accuracy = accuracyPct(seg.report);
        const style = seg.report.gridCorrelation > 0.8 ? t("coachReport.styleGrid")
          : seg.report.gridCorrelation > 0.3 ? t("coachReport.styleSemi")
          : t("coachReport.styleFree");
        const pocket = seg.report.meanDeviationMs < -5 ? t("coachReport.pocketRushing")
          : seg.report.meanDeviationMs > 5 ? t("coachReport.pocketDragging") : t("coachReport.pocketOnBeat");
        const styleTitle = seg.report.gridCorrelation > 0.8
          ? t("coachReport.styleGridTitle")
          : seg.report.gridCorrelation > 0.3
          ? t("coachReport.styleSemiTitle")
          : t("coachReport.styleFreeTitle");
        const pocketTitle = seg.report.meanDeviationMs < -5
          ? t("coachReport.pocketEarly", { ms: Math.abs(Math.round(seg.report.meanDeviationMs)) })
          : seg.report.meanDeviationMs > 5
          ? t("coachReport.pocketLate", { ms: Math.round(seg.report.meanDeviationMs) })
          : t("coachReport.pocketCentred");

        return (
          <div key={i} className="coach-segment-row">
            <div className="coach-segment-time">
              {formatDuration(offsetSec)}–{formatDuration(offsetSec + durationSec)}
            </div>
            <div className="coach-segment-info">
              <span className="coach-segment-style" title={styleTitle}>{style}</span>
              <span className="coach-segment-sep">&middot;</span>
              <span>{seg.bpm} BPM</span>
              <span className="coach-segment-sep">&middot;</span>
              <span title={t("coachReport.beatsHitTitle")}>{t("coachReport.beatsHit")}: {accuracy}%</span>
              <span className="coach-segment-sep">&middot;</span>
              <span title={pocketTitle}>{pocket}</span>
            </div>
            <ScoreBadge score={seg.report.score} />
            <SegmentBreakdownBar report={seg.report} />
          </div>
        );
      })}
    </div>
  );
}
