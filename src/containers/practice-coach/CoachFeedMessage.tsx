import { useTranslation } from "react-i18next";
import { ScoreRing, ScoreBadge, BreakdownBar, Histogram } from "../drill/evaluation";
import { FEEDBACK_COLORS } from "../../hooks/useEvaluation";
import { SessionNarrativeView } from "../../coach/SessionNarrativeView";
import type { FeedAffordance, FeedChip, FeedMessage, SessionReport, SessionSegment } from "../../types";
import { formatTime, formatDuration } from "./coachCardHelpers";
import { accuracyPct, scoredBeats } from "../../coach/reportStats";
import { HintCard } from "../onboarding/hints/HintCard";
import { useFirstTimeHint } from "../onboarding/hints/useFirstTimeHint";
import { shouldHintCoachAsk } from "../onboarding/hints/triggers";

function MiniReportComponents({ report }: { report: SessionReport }) {
  const { t } = useTranslation();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  const cov = report.hitCompleteness;
  const eff = report.onsetEfficiency;
  const grid = report.gridCorrelation;

  const covColor = cov === undefined ? undefined
    : cov >= 0.70 ? "var(--feedback-perfect)"
    : cov >= 0.40 ? "var(--feedback-ok)"
    : "var(--feedback-miss)";

  const effColor = eff === undefined ? undefined
    : eff >= 0.65 ? "var(--feedback-perfect)"
    : "var(--feedback-ok)";

  const gridColor = grid >= 0.60 ? "var(--feedback-perfect)"
    : grid >= 0.30 ? "var(--feedback-ok)"
    : "var(--feedback-miss)";

  return (
    <div className="coach-mini-report-components">
      <span style={{ color: covColor }}>{t("coachReport.cov")} {cov !== undefined ? pct(cov) : "—"}</span>
      <span className="coach-mini-report-comp-sep">·</span>
      <span style={{ color: effColor }}>{t("coachReport.eff")} {eff !== undefined ? pct(eff) : "—"}</span>
      <span className="coach-mini-report-comp-sep">·</span>
      <span style={{ color: gridColor }}>{t("coachReport.grid")} {pct(grid)}</span>
    </div>
  );
}

function DeviationSparkline({ deviations }: { deviations: number[] }) {
  if (deviations.length < 4) return null;

  const MAX_BARS = 80;
  const HEIGHT = 24;
  const MID = HEIGHT / 2;
  const MAX_BAR_H = 10;
  const MAX_DEV = 60;

  // Downsample if needed
  const bars: number[] = (() => {
    if (deviations.length <= MAX_BARS) return deviations;
    const bucketSize = Math.ceil(deviations.length / MAX_BARS);
    const result: number[] = [];
    for (let i = 0; i < deviations.length; i += bucketSize) {
      const slice = deviations.slice(i, i + bucketSize);
      result.push(slice.reduce((a, b) => a + b, 0) / slice.length);
    }
    return result;
  })();

  const barW = Math.max(1, 100 / bars.length);

  const color = (dev: number): string => {
    const abs = Math.abs(dev);
    if (abs <= 15) return "var(--accent, #f0a030)";
    if (abs <= 37) return "rgba(240, 160, 48, 0.6)";
    return "#c08020";
  };

  const barH = (dev: number): number =>
    Math.min(Math.abs(dev) / MAX_DEV, 1) * MAX_BAR_H;

  return (
    <svg
      width="100%"
      height={HEIGHT}
      className="coach-mini-report-sparkline"
      aria-hidden="true"
    >
      {bars.map((dev, i) => {
        const h = Math.max(1, barH(dev));
        const x = `${(i / bars.length) * 100}%`;
        const w = `${barW}%`;
        // Early (negative) bars above midline, late bars below
        const y = dev < 0 ? MID - h : MID;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            fill={color(dev)}
            rx={0.5}
          />
        );
      })}
      {/* Zero line */}
      <line x1="0" y1={MID} x2="100%" y2={MID} stroke="rgba(255,255,255,0.08)" strokeWidth={0.5} />
    </svg>
  );
}

/**
 * Discriminated union of every action the feed can dispatch. Combines
 * chip taps and intervention-affordance taps so the session hook can
 * own a single `handleChipAction` switch instead of two parallel
 * handlers. `messageId` is required for any action that needs to
 * resolve an affordance back onto its originating message (so the
 * UI can hide the buttons after a single tap).
 */
export type ChipAction =
  | { kind: "answer"; messageId: string; chip: FeedChip }
  | { kind: "set-bpm"; messageId?: string; bpmDelta: number }
  | { kind: "take-break"; messageId: string; durationMs: number }
  | { kind: "clear-calibration"; messageId: string }
  | { kind: "dismiss-affordance"; messageId: string }
  | { kind: "open-chat" };

/**
 * Renders a single feed message in the coach card. The feed contains a
 * heterogeneous mix of message types (system, coach-tip, user-chat,
 * mini-report, session-end) so this delegates each type to a small inline
 * renderer or to the dedicated EndReportSummary / SegmentTimeline helpers
 * below. Returning null for unknown types is intentional — keeps the feed
 * resilient to new message types added without UI yet.
 *
 * `onChipAction` is invoked when the user taps a chip OR a chip's
 * follow-up affordance. The parent (CoachCard) routes the action — chip
 * answers are appended as new feed messages; affordances trigger BPM
 * changes or open the free-text input.
 */
export function FeedMessageItem({
  message,
  onChipAction,
}: {
  message: FeedMessage;
  onChipAction?: (action: ChipAction) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  // `coach-ask` (O7): the first mini-report the feed ever renders explains
  // that "?" opens the chat. Called unconditionally (hooks rule) — the
  // trigger predicate does the filtering.
  const coachAskHint = useFirstTimeHint("coach-ask", shouldHintCoachAsk(message.type));
  switch (message.type) {
    case "session-start":
    case "system":
    case "coach-tip":
    case "coach-chat":
      return (
        <div className={`coach-feed-msg ${
          message.type === "coach-tip" ? "coach-feed-msg-tip" :
          message.type === "coach-chat" ? "coach-feed-msg-coach" :
          "coach-feed-msg-system"
        }`}>
          {message.pending ? <TtsThinkingSpinner /> : <span>{message.content}</span>}
          {message.affordance && !message.affordanceResolved && !message.pending && (
            <AffordanceRow
              messageId={message.id}
              affordance={message.affordance}
              onAction={onChipAction}
            />
          )}
          <div className="coach-feed-msg-time">{formatTime(message.timestamp, lang)}</div>
        </div>
      );

    case "user-chat":
      return (
        <div className="coach-feed-msg coach-feed-msg-user">
          <span>{message.content}</span>
          <div className="coach-feed-msg-time">{formatTime(message.timestamp, lang)}</div>
        </div>
      );

    case "mini-report":
      // The mini-report card carries ONLY the coach's commentary on
      // the segment (score circle + text). Follow-up suggestion chips
      // are rendered as a separate `chip-prompt` message that the
      // session hook emits immediately after — keeps "content from
      // the coach" visually distinct from "input affordance for the
      // user". See `FeedMessageType` in `src/types.ts`.
      return (
        <div className="coach-feed-msg coach-feed-msg-mini-report">
          {message.report && (
            <div className="coach-mini-report-header">
              <ScoreRing score={message.report.score} size={40} strokeWidth={4} />
              <div className="coach-mini-report-stats">
                <span className="coach-mini-report-score-label">
                  {message.meta?.bpm ? `${message.meta.bpm} BPM` : t("coachReport.segment")}
                </span>
                <span className="coach-mini-report-text">{message.content}</span>
              </div>
            </div>
          )}
          {message.report?.deviations && message.report.deviations.length >= 4 && (
            <div className="coach-mini-report-sparkline-wrap">
              <DeviationSparkline deviations={message.report.deviations} />
            </div>
          )}
          {message.report && (
            <MiniReportComponents report={message.report} />
          )}
          {coachAskHint.shouldShow && (
            <HintCard id="coach-ask" inline onDismiss={coachAskHint.markShown} />
          )}
          <div className="coach-feed-msg-time">{formatTime(message.timestamp, lang)}</div>
        </div>
      );

    case "chip-prompt":
      // User-affordance bubble that follows a mini-report. Renders the
      // selector's chips with no surrounding "coach commentary" — the
      // message is explicitly FOR the user, not FROM the coach. The
      // mini-report case used to bundle these into its own card; they
      // looked like part of the coach's text and confused the
      // user/coach boundary.
      if (!message.chips || message.chips.length === 0) return null;
      return (
        <div className="coach-feed-msg coach-feed-msg-chip-prompt">
          <ChipRow
            chips={message.chips}
            onTap={(chip) =>
              onChipAction?.({ kind: "answer", messageId: message.id, chip })
            }
            onAffordance={(chip) => {
              if (!chip.affordance) return;
              if (chip.affordance.action === "set-bpm" && chip.affordance.bpmDelta) {
                onChipAction?.({ kind: "set-bpm", bpmDelta: chip.affordance.bpmDelta });
              } else if (chip.affordance.action === "open-chat") {
                onChipAction?.({ kind: "open-chat" });
              }
            }}
          />
        </div>
      );

    case "session-end":
      return (
        <div className="coach-feed-msg coach-feed-msg-session-end">
          {message.pending ? (
            <div className="coach-end-report-comment"><TtsThinkingSpinner /></div>
          ) : (
            message.content && <div className="coach-end-report-comment">{message.content}</div>
          )}
          {message.report ? (
            <EndReportSummary report={message.report} />
          ) : (
            !message.pending && <span className="coach-mini-report-text">{message.content}</span>
          )}
          {message.segments && message.segments.length > 0 && (
            <SegmentTimeline segments={message.segments} sessionStart={message.segments[0].startTime ?? message.timestamp} />
          )}
          {message.report && (
            <div className="coach-detail-section">
              <div className="coach-detail-section-title">{t("eval.breakdown")}</div>
              <div className="coach-detail-bars">
                <BreakdownBar label={t("eval.perfect")}  count={message.report.perfectCount} total={scoredBeats(message.report)} color={FEEDBACK_COLORS.perfect} />
                <BreakdownBar label={t("eval.good")}     count={message.report.goodCount}    total={scoredBeats(message.report)} color={FEEDBACK_COLORS.good} />
                <BreakdownBar label={t("eval.ok")}       count={message.report.okCount}      total={scoredBeats(message.report)} color={FEEDBACK_COLORS.ok} />
                <BreakdownBar label={t("eval.miss")} count={message.report.missCount}    total={scoredBeats(message.report)} color={FEEDBACK_COLORS.miss} />
              </div>
            </div>
          )}
          {message.report && message.report.deviations.length > 4 && (
            <div className="coach-detail-section">
              <div className="coach-detail-section-title">{t("eval.timingDistribution")}</div>
              <Histogram deviations={message.report.deviations} />
            </div>
          )}
          <div className="coach-feed-msg-time">{formatTime(message.timestamp, lang)}</div>
        </div>
      );

    default:
      return null;
  }
}

/**
 * Three-dot "thinking" indicator shown in place of feed-message text
 * while the coach is preparing speech. Cleared the moment the matching
 * `tts-speech-started` event fires (see `useSession.ts::speakAndReveal`
 * / `pendingSpeechQueueRef`). The pulse is staggered so the eye reads
 * "the coach is about to say something" rather than "the app is
 * loading something heavy."
 */
function TtsThinkingSpinner() {
  const { t } = useTranslation();
  return (
    <span className="coach-tts-thinking" aria-label={t("coachReport.thinkingAria")}>
      <span className="coach-tts-thinking-dot" />
      <span className="coach-tts-thinking-dot" />
      <span className="coach-tts-thinking-dot" />
    </span>
  );
}

function EndReportSummary({ report }: { report: SessionReport }) {
  const { t } = useTranslation();
  const scoreQualifier = (score: number): string =>
    score >= 90 ? t("coachReport.qualifier.excellent") :
    score >= 75 ? t("coachReport.qualifier.good") :
    score >= 55 ? t("coachReport.qualifier.fair") :
    t("coachReport.qualifier.keepPracticing");

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
          {/*
            The letter grade (F/D/C/B/A/S) was previously rendered here.
            Removed in v0.10 — a grade letter framed practice as an
            evaluation rather than a workout. Players hitting clean
            -3ms mean deviation were still seeing "F" because the audio
            pipeline under-detected onsets, and that felt punitive for
            a fun-practice tool. The composite 0-100 score in the ring
            (which is gradient-coloured) and the four-stat grid below
            convey progress without the academic letter. `report.grade`
            stays in the data model for older saved sessions and
            programmatic consumers.
          */}
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
          <span className="coach-end-report-stat-value">{"\u00B1"}{report.meanAbsDeviationMs.toFixed(1)}ms</span>
        </div>
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("eval.consistency")}</span>
          <span className="coach-end-report-stat-sublabel">{t("coachReport.tighter")}</span>
          <span className="coach-end-report-stat-value">{"\u00B1"}{report.stdDeviationMs.toFixed(1)}ms</span>
        </div>
        <div className="coach-end-report-stat">
          <span className="coach-end-report-stat-label">{t("eval.tempoStability")}</span>
          <span className="coach-end-report-stat-value">{"\u00B1"}{report.tempoStabilityMs.toFixed(1)}ms</span>
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
        {report.intervalConsistency !== undefined && (
          <div className="coach-end-report-stat">
            <span className="coach-end-report-stat-label">{t("coachDetail.noteSpacing")}</span>
            <span className="coach-end-report-stat-value">{report.intervalConsistency.toFixed(2)}</span>
          </div>
        )}
        {report.gridAlignment !== undefined && (
          <div className="coach-end-report-stat">
            <span className="coach-end-report-stat-label">{t("coachDetail.beatPlacement")}</span>
            <span className="coach-end-report-stat-value">{report.gridAlignment.toFixed(2)}</span>
          </div>
        )}
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

/**
 * Renders the 3-or-4 suggestion chips below a mini-report. Tapping the
 * chip label fires the answer; tapping the optional follow-up (e.g.
 * "Drop to 130 BPM") fires the affordance. The escape chip ("Ask
 * something else…") has no chip-answer text — it opens the chat input
 * via the affordance route.
 */
function ChipRow({
  chips,
  onTap,
  onAffordance,
}: {
  chips: FeedChip[];
  onTap: (chip: FeedChip) => void;
  onAffordance: (chip: FeedChip) => void;
}) {
  return (
    <div className="coach-chip-row">
      {chips.map((chip) => {
        const isEscape = chip.affordance?.action === "open-chat";
        return (
          <button
            key={chip.id}
            className={`coach-chip ${isEscape ? "coach-chip-escape" : ""}`}
            onClick={() => {
              if (isEscape) {
                // The escape chip routes straight to the chat input.
                onAffordance(chip);
              } else {
                onTap(chip);
              }
            }}
          >
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Renders the two-button affordance row attached to an intervention
 * tip (e.g. "Drop to 140 BPM" / "Stay at 150"). The primary button
 * dispatches the intervention's action; the secondary button just
 * dismisses the affordance (no side-effect on session state). In
 * both cases the parent hook marks `affordanceResolved` and the
 * buttons disappear — the tip text remains.
 *
 * The secondary "dismiss" button does NOT undo the intervention; it's
 * a "no, I'm fine" signal. The intervention's rate-cap entry was
 * already committed when the tip emitted.
 */
function AffordanceRow({
  messageId,
  affordance,
  onAction,
}: {
  messageId: string;
  affordance: FeedAffordance;
  onAction?: (action: ChipAction) => void;
}) {
  return (
    <div className="coach-affordance-row">
      <button
        className="coach-affordance-primary"
        onClick={() => {
          if (affordance.action.kind === "set-bpm") {
            onAction?.({ kind: "set-bpm", messageId, bpmDelta: affordance.action.bpmDelta });
          } else if (affordance.action.kind === "take-break") {
            onAction?.({ kind: "take-break", messageId, durationMs: affordance.action.durationMs });
          } else if (affordance.action.kind === "clear-calibration") {
            onAction?.({ kind: "clear-calibration", messageId });
          }
        }}
      >
        {affordance.actionLabel}
      </button>
      <button
        className="coach-affordance-secondary"
        onClick={() => onAction?.({ kind: "dismiss-affordance", messageId })}
      >
        {affordance.dismissLabel}
      </button>
    </div>
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
        // the Rust score and EndReportSummary, so the per-segment accuracy
        // in the timeline doesn't disagree with the overall accuracy
        // above. See `src/coach/reportStats.ts`.
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
