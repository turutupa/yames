/**
 * The tools' coach under the stage (DESIGN 7, 3.1 "Tools"): one line and one
 * note, while Listen is on.
 *
 * What it says is decided where it always was: the gatekeeper, the cooldowns,
 * the interventions and the segment's report all live in `useSession` (and
 * `useRealtimeTips` / `useSegmentCoach` under it) and post to its `messages`.
 * This only chooses what of that to show, by the design's rules:
 *
 * - **The line**: the newest tip of the run that is playing, or of the one that
 *   just stopped. One at a time; the next replaces it. A tip that carries an
 *   action (drop or raise 10 BPM, rest, posture, retry calibration; COA-25/26)
 *   shows it at the end of the line, as a tonal button. The cap of two such
 *   tips in five minutes is the intervention layer's, unchanged.
 * - **The note**: when a run of 10 s or more stops (`useSegmentCoach` reports
 *   nothing under that), the report on it, with its question chips, led by
 *   one measured sentence when `analyze_free_play` found something in the run
 *   (`coach/toolFinding.ts`; the findings ride on the segment-end event); when
 *   Listen goes off, the summary, saved to Progress → Tool runs. Hidden as soon
 *   as the next run starts.
 *
 * Nothing older than this mount is shown: the component is keyed by the tool
 * it sits under, so a note from the Metronome does not follow the player into
 * the Drill. It renders from its props only, none of which change at a beat,
 * and it is `memo`: the window re-rendering at every beat never reaches it.
 */
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FeedChip, FeedMessage, SessionReport } from "../../types";
import type { Finding } from "../../songs/types";
import { onPracticeSegmentEnded, onSettingsChangeNotified } from "../../ipc";
import { toolFinding, toolFindingText } from "../../coach/toolFinding";
import { SystemStatusChip } from "../../components/SystemStatusChip";
import { bandForScore } from "../../coach/reportStats";
import { isSegmentReportable } from "../../coach/miniReport";
import { HintCard } from "../onboarding/hints/HintCard";
import { useFirstTimeHint } from "../onboarding/hints/useFirstTimeHint";
import { shouldHintCoachAsk } from "../onboarding/hints/triggers";
import { CoachLine } from "./CoachLine";
import { CoachNote, NoteChips, NoteLine } from "./CoachNote";
import { suggestChips } from "../../coach/ask/suggest";
import type { AskHandler } from "./askStore";
import "../../styles/coach.css";

/**
 * Everything the tools' coach can be asked to do from its line or its note.
 * `messageId` resolves an action back onto the tip that carried it, so its
 * button goes after one press.
 */
export type ChipAction =
  | { kind: "answer"; messageId: string; chip: FeedChip }
  | { kind: "set-bpm"; messageId?: string; bpmDelta: number }
  | { kind: "take-break"; messageId: string; durationMs: number }
  | { kind: "clear-calibration"; messageId: string }
  | { kind: "dismiss-affordance"; messageId: string }
  | { kind: "open-chat" };

/** What the line and the note show, from the feed. Pure, for the tests. */
export function toolCoachView(
  messages: readonly FeedMessage[],
  runStartedAt: number,
  isPlaying: boolean,
): { tip: FeedMessage | null; note: FeedMessage | null; chips: FeedChip[] } {
  let tip: FeedMessage | null = null;
  let note: FeedMessage | null = null;
  let chips: FeedChip[] = [];
  for (const m of messages) {
    if (m.timestamp < runStartedAt) continue;
    if ((m.type === "coach-tip" || m.type === "system") && !m.pending) tip = m;
    // The end note only for a session that was saved: `useSession` keeps one
    // in Tool runs only when its report passes `isSegmentReportable`, and a
    // note with a score and a way to a run that is not there would be untrue.
    // A session that recorded too little ends with the switch going off and
    // nothing more, as the old card gave such a session no end card.
    const unsaved = m.type === "session-end" && !(m.report && isSegmentReportable(m.report));
    if ((m.type === "mini-report" || m.type === "session-end") && !unsaved) {
      note = m;
      chips = [];
    }
    if (m.type === "chip-prompt" && note && m.chips) chips = m.chips;
  }
  if (isPlaying || note?.pending) note = null;
  return { tip, note, chips: note ? chips : [] };
}

type ToolCoachProps = {
  /** The tools' coach session's feed (`messages` of `useSession`). */
  messages: readonly FeedMessage[];
  /** Listen is on: the session is the player's. */
  listenOn: boolean;
  isPlaying: boolean;
  /** The input is on (the status chip says "Listening…" only then). */
  inputOn: boolean;
  playMode?: "structured" | "noodling";
  /** The locked grid's divisor ("Tracking 16ths"), when the matcher has locked. */
  inferredDivisor?: number;
  onChipAction: (action: ChipAction) => void;
  onAsk?: AskHandler;
  /** Progress → Tool runs, where a finished run is kept. */
  onOpenRuns?: () => void;
};

// `@__PURE__`: the phone build drops the only use (an `IS_MOBILE` branch), and
// an unannotated top-level `memo()` call would keep the component in its bundle.
export const ToolCoach = /* @__PURE__ */ memo(function ToolCoach({
  messages,
  listenOn,
  isPlaying,
  inputOn,
  playMode,
  inferredDivisor,
  onChipAction,
  onAsk,
  onOpenRuns,
}: ToolCoachProps) {
  const { t } = useTranslation();
  // The run that is playing, or the one that just stopped, began here. Moved
  // on when the click starts, so the last run's line and note step aside.
  const [runStartedAt, setRunStartedAt] = useState(() => Date.now());
  useEffect(() => {
    if (isPlaying) setRunStartedAt(Date.now());
  }, [isPlaying]);
  const findings = useRunFindings(listenOn, isPlaying);

  const { tip, note, chips } = useMemo(
    () => toolCoachView(messages, runStartedAt, isPlaying),
    [messages, runStartedAt, isPlaying],
  );
  // The note a run gets when it stops leads with what was measured in it, when
  // something was (C5); the report's own sentence follows. Never the summary.
  const finding =
    note?.type === "mini-report" && findings && findings.at >= runStartedAt
      ? toolFinding(findings.findings, findings.playedMs)
      : null;
  const askHint = useFirstTimeHint("coach-ask", !!note && shouldHintCoachAsk(note.type));

  if (!listenOn && !note) return null;

  const action = tip?.affordance && !tip.affordanceResolved ? tip.affordance : null;
  const act = () => {
    if (!tip || !action) return;
    const a = action.action;
    if (a.kind === "set-bpm") onChipAction({ kind: "set-bpm", messageId: tip.id, bpmDelta: a.bpmDelta });
    else if (a.kind === "take-break") onChipAction({ kind: "take-break", messageId: tip.id, durationMs: a.durationMs });
    else onChipAction({ kind: "clear-calibration", messageId: tip.id });
  };

  return (
    <div className="tool-coach" data-testid="tool-coach">
      {(listenOn || tip) && (
        <div className="tool-coach-row">
          {tip ? (
            <div className="tool-coach-line" data-testid="tool-coach-line" aria-live="polite">
              <CoachLine onAsk={onAsk}>{tip.content}</CoachLine>
              {action && (
                <button type="button" className="btn-tonal tool-coach-act" onClick={act} data-testid="tool-coach-act">
                  {action.actionLabel}
                </button>
              )}
            </div>
          ) : (
            <span className="tool-coach-spacer" />
          )}
          {listenOn && (
            <SystemStatusChip
              active
              isPlaying={isPlaying}
              listening={inputOn}
              playMode={playMode}
              inferredDivisor={inferredDivisor}
            />
          )}
        </div>
      )}
      {note && (
        <CoachNote
          headline={
            finding ? (
              <span data-testid="tool-coach-finding" data-kind={finding.kind}>
                {toolFindingText(finding, t)}
              </span>
            ) : (
              note.content
            )
          }
          source={{ kind: "measured" }}
          live
          kind={note.type === "session-end" ? "tool-end" : "tool-run"}
          testId="tool-coach-note"
          onAsk={onAsk}
        >
          {finding && <NoteLine testId="tool-coach-said">{note.content}</NoteLine>}
          {note.report && note.type === "mini-report" && <RunFacts report={note.report} bpm={note.meta?.bpm} />}
          {note.report && note.type === "session-end" && (
            <NoteLine testId="tool-coach-score">
              {t("toolCoach.sessionScore", {
                score: Math.round(note.report.score),
                word: t(qualifierKey(note.report.score)),
              })}
            </NoteLine>
          )}
          {/* The run's own chips, through the one chooser (`coach/ask/suggest.ts`, leg c2b1a): unchanged. */}
          <NoteChips
            chips={suggestChips("toolNote", { feed: chips.length }).flatMap((choice) => {
              const chip = choice.kind === "feed" ? chips[choice.index] : undefined;
              return chip
                ? [
                    {
                      kind: "ask" as const,
                      label: chip.label,
                      onClick: () => onChipAction({ kind: "answer", messageId: note.id, chip }),
                      testId: `tool-coach-chip-${chip.id}`,
                    },
                  ]
                : [];
            })}
          />
          {note.type === "session-end" && onOpenRuns && (
            <div className="tool-coach-actions">
              <button type="button" className="btn-tonal tool-coach-act" onClick={onOpenRuns} data-testid="tool-coach-runs">
                {t("toolCoach.openRuns")}
              </button>
            </div>
          )}
          {askHint.shouldShow && <HintCard id="coach-ask" inline onDismiss={askHint.markShown} />}
        </CoachNote>
      )}
    </div>
  );
});

/**
 * What `analyze_free_play` found in the run, from `practice-segment-ended`.
 * `at` is the segment's own end (`endMs`, wall-clock ms), never the arrival.
 */
type RunFindings = { findings: Finding[]; playedMs: number; at: number };

/**
 * The findings of the run that is playing or just stopped (C5): those of the
 * run's LAST free-play segment to close, from the segment-end event. A later
 * segment of the same run that closes with none clears them (c5c2b M2), so a
 * stretch before a pause never leads the note of a run that went on cleanly;
 * the sentences count their own notes, so they say what stretch they are
 * about. They are not stored anywhere; a new run forgets them.
 *
 * A segment that ended before this run began (the last run's stop-close
 * landing after a fast restart) is ignored, by its own `endMs` (L3).
 *
 * Nothing renders while the click runs: a segment that closes mid-run (a pause
 * of four seconds after thirty of play) is kept in a ref, and published when
 * the run stops. The stop's own close (`closeOpenSegment`) lands a few ms
 * after the click stops, before the note's report is fetched, and is
 * published as it lands.
 */
function useRunFindings(listenOn: boolean, isPlaying: boolean): RunFindings | null {
  const latest = useRef<RunFindings | null>(null);
  const playing = useRef(isPlaying);
  const runStart = useRef(Date.now());
  const [published, setPublished] = useState<RunFindings | null>(null);
  useEffect(() => {
    playing.current = isPlaying;
    if (isPlaying) {
      runStart.current = Date.now();
      latest.current = null;
      setPublished(null);
    } else {
      setPublished(latest.current);
    }
  }, [isPlaying]);
  // A settings change mid-run closes the open segment with no event (Signal
  // A): its findings never arrive, so an earlier segment's are no longer the
  // run's last and are dropped (c5c2b review L-2). Stopped, it closes
  // nothing, and the stopped run's note stays.
  useEffect(
    () =>
      onSettingsChangeNotified(() => {
        if (playing.current) latest.current = null;
      }),
    [],
  );
  useEffect(() => {
    if (!listenOn) return;
    let live = true;
    let unlisten: (() => void) | null = null;
    onPracticeSegmentEnded((payload) => {
      if (!live || payload.endMs < runStart.current) return;
      latest.current =
        payload.findings && payload.findings.length > 0
          ? {
              findings: payload.findings,
              playedMs: Math.max(0, payload.endMs - payload.startMs),
              at: payload.endMs,
            }
          : null;
      if (!playing.current) setPublished(latest.current);
    })
      .then((fn) => {
        if (live) unlisten = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      live = false;
      unlisten?.();
    };
  }, [listenOn]);
  return published;
}

function qualifierKey(score: number): string {
  switch (bandForScore(score)) {
    case "flawless":
    case "strong":
      return "coachReport.qualifier.excellent";
    case "solid":
      return "coachReport.qualifier.good";
    case "fair":
      return "coachReport.qualifier.fair";
    default:
      return "coachReport.qualifier.keepPracticing";
  }
}

/**
 * The run in numbers, as the old mini-report card had them (COA-34): the score
 * at its tempo, the three measured parts in a musician's words, and the timing
 * of each note as a strip (early above the line, late below).
 */
function RunFacts({ report, bpm }: { report: SessionReport; bpm?: number }) {
  const { t } = useTranslation();
  const pct = (v: number | undefined) => (v === undefined ? "–" : `${Math.round(v * 100)}%`);
  return (
    <>
      <NoteLine testId="tool-coach-score">
        {bpm
          ? t("toolCoach.runScore", { score: Math.round(report.score), bpm })
          : t("toolCoach.runScoreNoBpm", { score: Math.round(report.score) })}
      </NoteLine>
      <p className="coach-facts tool-coach-parts" data-testid="tool-coach-parts">
        <span className="coach-fact" title={t("coachReport.covTitle")}>
          {t("coachReport.covLabel")} {pct(report.hitCompleteness)}
        </span>
        <span className="coach-fact-sep" aria-hidden="true">
          ·
        </span>
        <span className="coach-fact" title={t("coachReport.effTitle")}>
          {t("coachReport.effLabel")} {pct(report.onsetEfficiency)}
        </span>
        <span className="coach-fact-sep" aria-hidden="true">
          ·
        </span>
        <span className="coach-fact" title={t("coachReport.gridTitle")}>
          {t("coachReport.gridLabel")} {pct(report.gridCorrelation)}
        </span>
      </p>
      <TimingStrip deviations={report.deviations} />
    </>
  );
}

/** Each note's timing, early above the line and late below; drawn in the note's ink. */
export function TimingStrip({ deviations }: { deviations: readonly number[] }) {
  if (deviations.length < 4) return null;
  const MAX_BARS = 80;
  const bars: number[] = [];
  const bucket = Math.max(1, Math.ceil(deviations.length / MAX_BARS));
  for (let i = 0; i < deviations.length; i += bucket) {
    const slice = deviations.slice(i, i + bucket);
    bars.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  const w = 100 / bars.length;
  return (
    <svg className="tool-coach-strip" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" y1="12" x2="100" y2="12" className="tool-coach-strip-mid" />
      {bars.map((dev, i) => {
        const h = Math.max(1, (Math.min(Math.abs(dev), 60) / 60) * 10);
        return (
          <rect
            key={i}
            x={i * w + w * 0.15}
            y={dev < 0 ? 12 - h : 12}
            width={w * 0.7}
            height={h}
            data-wide={Math.abs(dev) > 37 ? "" : undefined}
          />
        );
      })}
    </svg>
  );
}
