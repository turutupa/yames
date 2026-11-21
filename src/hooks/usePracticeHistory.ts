/**
 * The practice history's half of `useSession` (leg c5c1): whether a session is
 * on and since when, the lifecycle queue that starts and ends one, the final
 * report and the one `saveSession`. Moved verbatim out of `useSession.ts`,
 * which composes it with `useToolCoach`. Two hooks, because the one hook they
 * came from ran them at two places: `usePracticeHistoryState` is called before
 * the tool coach (its mirrors' effects ran before the tool coach's), and
 * `usePracticeHistory` after it (its callbacks read the tool coach's refs).
 */
import { useState, useEffect, useRef, useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { getFinalSessionReport, getSessionHistory, queryHistory, saveSession, clearSession, coachGenerate } from "../ipc";
import type { BeatFeedback, FeedMessage, SessionReport, SessionSegment } from "../types";
import type { useEvaluation } from "./useEvaluation";
import i18n from "../i18n";
import {
  coachResident,
  subscribeCoachModel,
} from "./coachLoader";
import { loadHistoryWithBudget } from "../coach/historyBudget";
import {
  appendCoachUtterance,
  appendSegmentEnd,
  createNarrative,
  formatForLLM,
  type Narrative,
} from "../coach/narrative";
import {
  detectRecurringIssues,
  summarizePreset,
} from "../coach/presetAwareness";
import {
  createGatekeeper,
  type GatekeeperContext,
  type GatekeeperState,
} from "../coach/gatekeeper";
import {
  isSegmentReportable,
  shortPocketNote,
} from "../coach/miniReport";
import {
  createInterventionState,
  type InterventionRateState,
} from "../coach/interventions";
import { accuracyPct, commentForScore, computeLegacyScore, gradeForScore, rescoreReport, scoredBeats } from "../coach/reportStats";
import { createSessionToken } from "../coach/sessionGuard";
import { coachDebug } from "../utils/debug";
import { meterKey } from "../utils/meter";
import type { useRealtimeTips } from "../containers/practice-coach/hooks/useRealtimeTips";

// ── History kept the old way ────────────────────────────────────────
// When the practice store cannot take a finished session, Rust keeps it in
// settings.json the way v1.2.1 did and says so (`keptInSettings`). The
// player is told once per launch — module state, not hook state, because a
// launch is what the sentence is about, and a remount must not repeat it.
let historyKeptInSettingsNoticed = false;

/** Tests only: forget that the notice was shown this launch. */
export function __resetHistoryNoticeForTests(): void {
  historyKeptInSettingsNoticed = false;
}

type Evaluation = ReturnType<typeof useEvaluation>;

/** How a coach session is opened. */
export interface StartSessionOptions {
  /**
   * Opened for a learning-side Session, not by the coach's Start: listen and
   * save to the history, but greet nobody, open no card and leave the feed as
   * it was (`quietRef`).
   */
  quiet?: boolean;
  /**
   * `false`: open the coach session without turning the input on. A learning
   * Session played without grading (owner, 2026-11-18) never asks for a
   * microphone it will not use.
   */
  listen?: boolean;
}

/** What `usePracticeHistoryState` reads from `useSession`'s options. */
interface PracticeHistoryStateOptions {
  bpm: number;
  isPlaying: boolean;
}

export function usePracticeHistoryState({ bpm, isPlaying }: PracticeHistoryStateOptions) {
  const [active, setActive] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  /** `startedAt`, for the end of a session queued behind its start. */
  const startedAtRef = useRef<number | null>(null);
  const playBpmRef = useRef(bpm);
  const segmentReportsRef = useRef<SessionSegment[]>([]);
  const segmentStartRef = useRef<number>(Date.now());
  // Residency is owned by `hooks/coachLoader.ts`, which is module state
  // rather than hook state: whether a multi-gigabyte model is in RAM is a
  // property of the process, not of this component tree. This ref is a
  // local mirror, kept in sync by a subscription below, so the hot paths
  // stay synchronous. Sessions never load or unload the model.
  const coachLoadedRef = useRef(coachResident());
  const sessionIdRef = useRef(0);
  // ── activeRef: synchronous mirror of `active` ─────────────────
  // React state updates are batched / async; async callbacks (LLM
  // results, late event-listener firings) that close over a stale
  // `active` boolean would speak/append after `endSession`. The ref
  // is updated in the same effect that reads `active`, so callbacks
  // can do a synchronous "is the session still alive?" check before
  // calling `maybeSpeak(...)` or `setMessages(...)`.
  const activeRef = useRef(false);
  /**
   * The session was opened by someone other than the player: a learning-side
   * Session (`useSessionRun`) uses this hook only to listen and to write the
   * history. It posts nothing to the coach's feed, does not open the card and
   * does not greet: the player never pressed the coach's Start, and finding
   * a greeting and an end card there afterwards reads as the coach making
   * things up (owner report, 2026-11-18).
   */
  const quietRef = useRef(false);
  /** The last tempo the click actually played at during this session. */
  const playedBpmRef = useRef<number | null>(null);

  // Keep activeRef in sync — see the ref's declaration site for the
  // rationale (synchronous "is the session still alive?" check from
  // async callbacks that close over stale state).
  useEffect(() => { activeRef.current = active; }, [active]);

  // Keep playBpmRef in sync on EVERY bpm change, not just the
  // play-start rising edge. The previous "set only on rising edge"
  // behaviour caused the gatekeeper to evaluate against stale BPM
  // whenever the user adjusted tempo mid-play without stopping —
  // emitting "rushing at 130" comments that landed AFTER the user
  // had already moved to 145. The rising-edge handler still resets
  // segmentStartRef and beatsInSegmentRef (those are segment-scoped,
  // not playback-scoped).
  useEffect(() => { playBpmRef.current = bpm; }, [bpm]);
  // What a quiet session saves as its tempo. The bpm at its end is not it: a
  // learning Session hands the metronome back to the player's own tempo as it
  // ends, so the end would record that (often the 120 default) instead.
  useEffect(() => {
    if (isPlaying && activeRef.current) playedBpmRef.current = bpm;
  }, [bpm, isPlaying]);

  // Nothing is loaded here, at mount or at a session's start or end. The
  // model selector's loader (`hooks/coachLoader.ts`) owns the model's whole
  // life; this hook only follows whether one is resident.
  useEffect(() => {
    coachLoadedRef.current = coachResident();
    return subscribeCoachModel(() => {
      coachLoadedRef.current = coachResident();
    });
  }, []);
  // The model is never asked anything for a quiet session (a Path Session's
  // history writer): no tip, report or drill line from it, resident or not.
  const modelMaySpeak = () => coachLoadedRef.current && !quietRef.current;

  return {
    active,
    setActive,
    startedAt,
    setStartedAt,
    startedAtRef,
    playBpmRef,
    segmentReportsRef,
    segmentStartRef,
    coachLoadedRef,
    sessionIdRef,
    activeRef,
    quietRef,
    playedBpmRef,
    modelMaySpeak,
  };
}

export type PracticeHistoryState = ReturnType<typeof usePracticeHistoryState>;

type Speak = (text: string, _urgency?: "urgent" | "normal") => void;
type SpeakAndReveal = (messageId: string, text: string, _urgency?: "urgent" | "normal") => void;

/** What `usePracticeHistory` reads: `useSession`'s options, the state above, the tool coach's refs. */
interface PracticeHistoryOptions extends Pick<
  PracticeHistoryState,
  | "setActive"
  | "setStartedAt"
  | "startedAtRef"
  | "playBpmRef"
  | "segmentReportsRef"
  | "segmentStartRef"
  | "sessionIdRef"
  | "activeRef"
  | "quietRef"
  | "playedBpmRef"
> {
  evaluation: Evaluation;
  bpm: number;
  timeSignature: number;
  beatGroups?: number[];
  presetId?: string;
  presetName?: string;
  voiceMode: "silent" | "voice";
  instrument: string;
  instrumentLabel: string;
  setMessages: Dispatch<SetStateAction<FeedMessage[]>>;
  resetSegmentCoach: () => void;
  prevBpmRef: MutableRefObject<number>;
  prevPresetIdRef: MutableRefObject<string | undefined>;
  prevTimeSignatureRef: MutableRefObject<number>;
  prevMeterKeyRef: MutableRefObject<string>;
  prevInstrumentRef: MutableRefObject<string>;
  beatsInSegmentRef: MutableRefObject<number>;
  gatekeeperRef: MutableRefObject<GatekeeperState | null>;
  interventionStateRef: MutableRefObject<InterventionRateState>;
  prevSessionBestRef: MutableRefObject<number | undefined>;
  seedRealtimeTips: ReturnType<typeof useRealtimeTips>["seed"];
  presetCeilingRef: MutableRefObject<GatekeeperContext["presetCeiling"]>;
  narrativeRef: MutableRefObject<Narrative | null>;
  maybeSpeak: Speak;
  speakAndReveal: SpeakAndReveal;
  speakAndRevealRef: MutableRefObject<SpeakAndReveal>;
  realtimeWindowRef: MutableRefObject<BeatFeedback[]>;
  beatsSinceLastCheckRef: MutableRefObject<number>;
  boundaryDebounceRef: MutableRefObject<number | null>;
}

export function usePracticeHistory({
  evaluation,
  bpm,
  timeSignature,
  beatGroups,
  presetId,
  presetName,
  voiceMode,
  instrument,
  instrumentLabel,
  setActive,
  setStartedAt,
  startedAtRef,
  playBpmRef,
  segmentReportsRef,
  segmentStartRef,
  sessionIdRef,
  activeRef,
  quietRef,
  playedBpmRef,
  setMessages,
  resetSegmentCoach,
  prevBpmRef,
  prevPresetIdRef,
  prevTimeSignatureRef,
  prevMeterKeyRef,
  prevInstrumentRef,
  beatsInSegmentRef,
  gatekeeperRef,
  interventionStateRef,
  prevSessionBestRef,
  seedRealtimeTips,
  presetCeilingRef,
  narrativeRef,
  maybeSpeak,
  speakAndReveal,
  speakAndRevealRef,
  realtimeWindowRef,
  beatsSinceLastCheckRef,
  boundaryDebounceRef,
}: PracticeHistoryOptions) {
  const startSessionNow = useCallback(async (options?: StartSessionOptions) => {
    if (activeRef.current) {
      coachDebug("startSession.noop-already-active");
      return;
    }
    // `=== true`: the card's Start button hands its click event in here.
    const quiet = options?.quiet === true;
    quietRef.current = quiet;
    playedBpmRef.current = null;
    coachDebug("startSession", { bpm, presetId, presetName, timeSignature, instrument, quiet });

    // Bump session ID FIRST to invalidate any in-flight stale reports
    sessionIdRef.current++;
    segmentReportsRef.current = [];
    resetSegmentCoach(); // prevent stale mini-report from previous session
    const now = Date.now();
    // D4 Signal A — seed previous-value refs so the first effect tick
    // after session-start doesn't fire a false-positive change event.
    prevBpmRef.current = bpm;
    prevPresetIdRef.current = presetId;
    prevTimeSignatureRef.current = timeSignature;
    prevMeterKeyRef.current = meterKey(beatGroups ?? [timeSignature]);
    prevInstrumentRef.current = instrument;
    // Fresh segment for the first-4-beats hard rule. Counter ticks
    // up in the onBeatFeedback handler; the gatekeeper demotes spoken
    // events to written until it crosses FIRST_BEATS_TTS_FLOOR.
    beatsInSegmentRef.current = 0;
    // ── C4: Fresh gatekeeper per session ──────────────────────────
    // Cooldown math is anchored to `sessionStartMs`; a new session
    // gets a clean state machine. Shuffle-state intentionally PERSISTS
    // across sessions so the user doesn't hear the same opening line
    // twice in a row across two short sessions.
    gatekeeperRef.current = createGatekeeper(now);
    // Reset intervention rate state — a new session starts with no
    // recent interventions and zero cooldowns. The rate cap window is
    // intentionally per-session: a fresh practice attempt deserves a
    // fresh affordance budget.
    interventionStateRef.current = createInterventionState();
    activeRef.current = true;
    setActive(true);
    startedAtRef.current = now;
    setStartedAt(now);
    if (!quiet) {
      // Listen turned on (DESIGN 7) opens no panel: the line and the note
      // under the stage read this feed.
      // Clear the feed synchronously BEFORE awaiting history. Without this,
      // any messages from a prior session stay visible for up to 500ms
      // while `loadHistoryWithBudget` races, producing a "stale state" flash
      // where the user sees the previous session's tips and session-end card
      // even though they just clicked Start on a new session.
      // A quiet session leaves the feed as the player last saw it.
      setMessages([]);
    }

    // Clear backend session data in background — don't block UI
    clearSession().catch(() => {});

    // No model load here: the selector's loader keeps the chosen model
    // resident across the app (`hooks/coachLoader.ts`).

    // Race session-history loading against a 500ms budget. No greeting any
    // more (DESIGN 7: Today's line replaced it, leg c2a2); the history is
    // still read for the chips, the tips and the narrative below.
    // Two reads, one budget. The chips' "last session" is about the last thing
    // the player did, whatever they did it on, so it keeps the thirty-session slice.
    // Everything in `presetAwareness` is about THIS preset, and the slice was
    // starving it: thirty sessions across every preset in the app routinely
    // hold one or two of any given one, and its gates need three at the
    // preset and three inside a BPM band before they say anything at all. So
    // a player who alternates two exercises could practise the same wall for
    // a month and never be told it was a wall. `queryHistory` asks the store
    // the question the coach is actually asking (W2, ROADMAP 1.1); both are
    // started before either is awaited so the 500 ms budget is shared rather
    // than spent twice.
    const historyLoad = loadHistoryWithBudget(() => getSessionHistory());
    const presetHistoryLoad = presetId
      ? loadHistoryWithBudget(() => queryHistory({ presetId }))
      : Promise.resolve(undefined);
    const [history, presetHistory] = await Promise.all([historyLoad, presetHistoryLoad]);

    // Phase 5 — pull the best score from the most-recent saved session
    // (preset-matched when available) so chips like
    // `compare-last-session` have a real number to anchor against.
    // History is newest-first by convention. When no match exists the
    // chip's `qualifies` predicate fails and the chip is dropped, so
    // `undefined` here is the safe default.
    prevSessionBestRef.current = pickPreviousSessionScore(history, presetId);

    // ── Real-time tip seed ────────────────────────────────────────
    // Arm stamina, pace-coaching, and grid-lost tips from history.
    // All state lives in useRealtimeTips; resets fired-gates too.
    // This preset's whole history, not the last thirty of everything —
    // stamina needs five sessions at the preset and the pace line needs four
    // in one BPM band.
    seedRealtimeTips(presetId, presetName, presetHistory);

    // ── Preset-ceiling seed (ROADMAP 1.7) ─────────────────────────
    // Same source as the pace line, different half of the range: this
    // is the observation the coach makes up to the third attempt at a
    // band, where `useRealtimeTips` takes over with a suggestion. The
    // gatekeeper applies the split (`PRESET_CEILING_MAX_SESSIONS`).
    presetCeilingRef.current = (() => {
      if (!presetId || !presetHistory) return undefined;
      const summary = summarizePreset(presetId, presetName, presetHistory);
      const { bpmCeiling } = detectRecurringIssues(summary);
      return bpmCeiling ?? undefined;
    })();

    // ── C1: Seed session narrative ────────────────────────────
    // Compact 2KB running log of the session arc. Prefer a real
    // prior-session summary when history is available; falls back to
    // a generic note. The seed line is always preserved across
    // truncation per the plan.
    const priorSummary = buildPriorSummary(history, presetHistory, presetId, presetName);
    narrativeRef.current = createNarrative({
      bpm: playBpmRef.current,
      presetId,
      presetName,
      priorSummary,
      instrument: instrumentLabel,
      now,
    });

    // Awaited, inside the lifecycle queue: an end asked for now runs after
    // the input is on, so its stop cannot overtake this start (B1).
    if (options?.listen !== false) {
      await evaluation.setListening(true).catch((e: unknown) => {
        console.error("[startSession] the input would not start:", e);
      });
    }
  }, [evaluation, presetId, presetName, maybeSpeak, instrumentLabel, speakAndReveal]);

  const endSessionNow = useCallback(async () => {
    if (!activeRef.current) {
      coachDebug("endSession.noop-not-active");
      return;
    }
    coachDebug("endSession", { segments: segmentReportsRef.current.length });

    // Flip activeRef synchronously so any in-flight async callback
    // (mini-report LLM, realtime tip LLM, adaptive drill LLM, chat
    // reply, late beat-feedback listener) can detect "session ended"
    // before its setMessages / maybeSpeak fires. The React `active`
    // state update batches asynchronously, so without this mirror
    // late callbacks would close over a stale `active === true` and
    // still append to the just-ended session's feed (or worse, speak).
    // The end-of-session summary path is exempt — it INTENDS to fire
    // post-endSession to patch the placeholder, so it uses the sid
    // check (which only triggers on a NEW session, not on idle).
    activeRef.current = false;

    // SCORE_DISPLAY_FIX (Part B) — stop the timing analyzer BEFORE
    // fetching the session report. When the analyzer thread exits it runs
    // the session-end segment close (Part A in timing.rs), which calls
    // acc.push_segment() so the D4 score is ready in the accumulator.
    // Without this early stop, acc.segments is empty at getSessionReport()
    // time and the Rust side falls back to the legacy hit-rate formula.
    //
    // Through `useEvaluation`, awaited, so its state and the input's agree
    // before the next start (B1: a second, unawaited stop here used to
    // land after a Session started right after this one, and it heard
    // nothing). A no-op when the input is already off.
    try {
      await evaluation.setListening(false);
    } catch (e) {
      // stopEvaluation failing should never strand the session in active
      // state. Log the error for diagnosis (e.g. "Lock failed: poisoned"
      // from a timing-thread panic cascade) and continue the end flow.
      console.error("[endSession] stopEvaluation failed:", e);
    }

    // Same rescoring rationale as the mini-report path above — see
    // `rescoreReport`. Without this the appendSegmentEnd call below
    // would slip the segment-aware backend score into the narrative.
    //
    // SCORE_FINAL_1: use getFinalSessionReport() (backed by all_segments,
    // the never-cleared full-session buffer) instead of getSessionReport()
    // (backed by self.segments, the per-exercise window). After a
    // play → idle → end flow, clearSession() wiped self.segments before
    // this call, making getSessionReport() fall back to the legacy formula
    // and show 68 instead of 81. all_segments is never cleared mid-session
    // so it always has every segment regardless of clearSession() calls.
    // Mini-reports continue using getSessionReport() to show per-exercise
    // (not cumulative) scores.
    const rawLast = await getFinalSessionReport();
    const lastReport = rawLast ? rescoreReport(rawLast) : rawLast;
    if (lastReport) {
      coachDebug("endSession.lastReport", {
        scoredBeats: scoredBeats(lastReport),
        hits: lastReport.hitsCount,
        reportable: isSegmentReportable(lastReport),
      });
    } else {
      coachDebug("endSession.no-last-report");
    }
    const now = Date.now();
    if (lastReport && isSegmentReportable(lastReport)) {
      if (narrativeRef.current) {
        narrativeRef.current = appendSegmentEnd(
          narrativeRef.current,
          { score: lastReport.score, bpm, note: shortPocketNote(lastReport) },
          now,
        );
      }
    }

    // Mini-reports accumulated by useSegmentCoach during the session.
    // Used for the per-exercise timeline display ONLY — NOT for scoring.
    // lastReport (getFinalSessionReport) is the authoritative score:
    // it covers all_segments and all recomputed feedbacks for the full
    // session without any double-counting. Aggregating mini-reports WITH
    // lastReport would double-count every beat that clearSession() already
    // covered in an earlier window (e.g. 515 beats instead of 263,
    // and wrong score because allHaveD4 fails on no-segment mini-reports).
    const miniReportSegments = [...segmentReportsRef.current];
    // sessionReport: Rust final answer — always prefer over aggregateReports.
    // Falls back to aggregating mini-reports only if getFinalSessionReport
    // returned null (edge case: very short session, no segments emitted).
    const sessionReport = lastReport
      ?? (miniReportSegments.length > 0 ? aggregateReports(miniReportSegments.map(s => s.report)) : null);

    // SCORE_SYNC_FIX: for single-segment sessions the timeline mini-report
    // score is computed mid-session (when the metronome stops) before any
    // segment data exists → falls back to legacy formula → e.g. 65.
    // The final session score uses the authoritative segment IC/GA formula
    // → e.g. 71. Sync the one timeline entry's score/grade to the final
    // answer so the user never sees two different numbers for the same session.
    if (lastReport && miniReportSegments.length === 1) {
      miniReportSegments[0] = {
        ...miniReportSegments[0],
        report: {
          ...miniReportSegments[0].report,
          score: lastReport.score,
          grade: lastReport.grade,
        },
      };

      // SCORE_SYNC_FIX Part 2: patch the mini-report feed card(s) that were
      // already pushed to the feed during the session. Without this the score
      // bubble that appeared mid-session (legacy formula → e.g. 64) disagrees
      // with the authoritative final score (segment IC/GA → e.g. 80) even
      // though the timeline badge now shows the correct number.
      // Scoped to single-segment sessions to avoid cross-segment confusion.
      setMessages((prev) =>
        prev.map((msg) =>
          msg.type === "mini-report" && msg.report
            ? { ...msg, report: { ...msg.report, score: lastReport.score, grade: lastReport.grade } }
            : msg,
        ),
      );
    }

    // End session immediately — no freeze
    const quiet = quietRef.current;
    quietRef.current = false;
    const endMsgId = crypto.randomUUID();
    const placeholderComment = "Session complete.";
    // Only mark pending when we know an LLM summary will be generated
    // AND voice mode is on — otherwise the placeholder text is the
    // final text and there's no spinner-to-text swap to do. The actual
    // LLM rephrase path below converts the message to its final form
    // and calls speakAndReveal in the same tick.
    // A summary is generated whenever there's a report — `coach_generate`
    // falls back to the Rust session-summary template when no model is
    // resident, so this no longer keys off `coachLoadedRef`.
    const willSpeakSummary = !!sessionReport && !quiet && voiceMode === "voice";
    const endMsg: FeedMessage = {
      id: endMsgId,
      type: "session-end",
      timestamp: now,
      content: placeholderComment,
      report: sessionReport ?? undefined,
      meta: { bpm, timeSignature },
      // Show timeline whenever there are mini-report exercises to display.
      segments: miniReportSegments.length > 0 ? miniReportSegments : undefined,
      pending: willSpeakSummary,
    };
    const sessionStartedAt = startedAtRef.current;
    if (quiet) {
      // Nothing a quiet session said stays in the feed: the player never
      // opened it. What was there before it is left as it was.
      const since = sessionStartedAt ?? now;
      setMessages((prev) => prev.filter((m) => m.timestamp < since));
    } else if (sessionReport) {
      // A session that recorded nothing gets no end card. There is nothing
      // to report, and "no data recorded" under a session the player may not
      // even have meant to start is noise; the Start button coming back says
      // it ended.
      setMessages((prev) => [...prev, endMsg]);
    }

    segmentReportsRef.current = [];
    setActive(false);
    startedAtRef.current = null;
    setStartedAt(null);

    // Save session — same gate as segment reportability. A session
    // that aggregates to 0 real hits is noise (mic dropouts, accidental
    // session start, etc.) and shouldn't pollute history.
    if (sessionReport && isSegmentReportable(sessionReport)) {
      saveSession({
        id: crypto.randomUUID(),
        timestamp: sessionStartedAt ?? now,
        // A quiet session is a learning Session: its tempo is the one it was
        // played at, and the metronome's preset is not what it played.
        bpm: quiet ? (playedBpmRef.current ?? bpm) : bpm,
        timeSignature,
        report: sessionReport,
        presetId: quiet ? undefined : presetId,
        presetName: quiet ? undefined : presetName,
        segments: miniReportSegments.length > 0 ? miniReportSegments : undefined,
      })
        .then((outcome) => {
          // The store could not take it; it is safe in settings.json and
          // comes into the history on a later launch. Say so, once.
          if (outcome !== "keptInSettings" || historyKeptInSettingsNoticed) return;
          historyKeptInSettingsNoticed = true;
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              type: "system",
              timestamp: Date.now(),
              content: i18n.t("coachCard.historyKeptInSettings"),
            },
          ]);
        })
        .catch((e) => {
          // Both the store and settings.json refused it. Nothing more this
          // hook can do, but it is not dropped without a word in the log.
          console.error("[session] this session could not be saved anywhere:", e);
        });
    }

    // Generate coach summary in the background, then patch the message.
    // Deliberately NOT gated on `coachLoadedRef`: without a resident
    // model `coach_generate` returns the Rust `format_session_summary`
    // template, which is the only session wrap-up a template-mode user
    // ever gets. Gating here would leave them staring at the bare
    // "Session complete." placeholder.
    if (sessionReport && !quiet) {
      // Capture a token so we can drop the result if the user starts
      // a NEW session before the LLM call resolves. Without this guard,
      // the old session's spoken summary leaks into the next session
      // via maybeSpeak() and any narrative updates pollute the fresh
      // narrative. NOTE: unlike every other site that uses
      // `isStaleOrInactive()`, this path INTENDS to fire post-end (to
      // patch the placeholder summary), so it deliberately uses the
      // sid-only `isStale()` check — `activeRef` is already false here.
      const token = createSessionToken(sessionIdRef);
      const durationSecs = Math.round((now - (sessionStartedAt ?? now)) / 1000);
      // Accuracy uses the scored-beat denominator (hits + miss), NOT
      // totalBeats. Sessions with stretches of silence at the start or
      // end accumulate "skipped" beats that deflate accuracy into
      // nonsense if `totalBeats` is the denominator. Matches the Rust
      // score and every other display surface — see `reportStats.ts`.
      const accuracy = accuracyPct(sessionReport);
      const narrativeBlock = narrativeRef.current
        ? formatForLLM(narrativeRef.current)
        : undefined;
      const context = formatSessionContext(
        durationSecs,
        miniReportSegments.length,
        sessionReport.score,
        sessionReport.totalBeats,
        accuracy,
        sessionReport.meanDeviationMs,
        sessionReport.longestStreak,
        instrumentLabel,
        narrativeBlock,
      );
      coachGenerate("summary", context).then((raw) => {
        if (token.isStale()) return;
        // Keep the placeholder when the model hands back nothing usable.
        // Rust already falls back to its own template on an empty or
        // truncated generation, so this only catches a shape neither
        // side anticipated — but the four call sites agree on the rule.
        const summaryComment = raw?.trim();
        if (!summaryComment) {
          setMessages((prev) => prev.map((m) =>
            m.id === endMsgId ? { ...m, pending: false } : m
          ));
          return;
        }
        setMessages((prev) => prev.map((m) =>
          m.id === endMsgId ? { ...m, content: summaryComment } : m
        ));
        if (narrativeRef.current) {
          narrativeRef.current = appendCoachUtterance(
            narrativeRef.current,
            summaryComment,
          );
        }
        speakAndRevealRef.current(endMsgId, summaryComment, "normal");
      }).catch(() => {
        // LLM crashed — make sure the pending spinner doesn't get
        // stuck on the placeholder forever. Reveal the placeholder
        // text so the user sees "Session complete." instead of a
        // spinner.
        setMessages((prev) => prev.map((m) =>
          m.id === endMsgId ? { ...m, pending: false } : m
        ));
      });
    }

    // ── Centralised state reset ────────────────────────────────────
    // Every session-scoped ref returns to a clean slate so the next
    // startSession doesn't inherit stale playback / segment / window
    // state. Previously some of these reset inline on startSession
    // and others reset via downstream effects; the split caused at
    // least one fragility (realtimeWindowRef growing across sessions
    // if the user ended without ever stopping playback first).
    // Shuffle-state and chip-recency intentionally persist across
    // sessions — see their declaration sites.
    // No idle unload: the model stays until the player picks Off or another.

    narrativeRef.current = null;
    gatekeeperRef.current = null;
    realtimeWindowRef.current = [];
    beatsSinceLastCheckRef.current = 0;
    beatsInSegmentRef.current = 0;
    resetSegmentCoach();
    segmentStartRef.current = Date.now();
    // Cancel any pending Signal A debounce — a config change committed
    // post-endSession would fire boundary_signal_a against a null
    // gatekeeper and panic the realtime path.
    if (boundaryDebounceRef.current !== null) {
      window.clearTimeout(boundaryDebounceRef.current);
      boundaryDebounceRef.current = null;
    }
  }, [evaluation, bpm, timeSignature, presetId, presetName, maybeSpeak, instrumentLabel]);

  /**
   * Starts and ends, one after another (B1). Ending a session awaits the stop
   * of the input, the final report and the save; a start asked for meanwhile
   * (Exit, then Start at once) used to see the old session still active and
   * do nothing, and then the end switched the input off under it. Each now
   * runs when the one before it has finished, and decides from the refs, not
   * from the render it was called in.
   */
  const lifecycle = useRef<Promise<unknown>>(Promise.resolve());
  const startNowRef = useRef(startSessionNow);
  startNowRef.current = startSessionNow;
  const endNowRef = useRef(endSessionNow);
  endNowRef.current = endSessionNow;
  const inTurn = useCallback((work: () => Promise<void>): Promise<void> => {
    const next = lifecycle.current.then(work, work);
    lifecycle.current = next.catch(() => {});
    return next;
  }, []);
  /**
   * The last start or end asked for and not yet finished. `isActive()` answers
   * as of the calls made: a session whose end is queued is ending, not
   * someone's to ride (Listen's end on leaving the tools, then Today's Start
   * inside the start's window, used to make the Session take the ending
   * session as the player's and run with the input off). Once the queue has
   * drained, `activeRef` is the answer again.
   */
  const queuedRef = useRef<{ op: "start" | "end" } | null>(null);
  const queue = useCallback(
    (op: "start" | "end", work: () => Promise<void>): Promise<void> => {
      const mark = { op };
      queuedRef.current = mark;
      const p = inTurn(work);
      const settle = () => {
        if (queuedRef.current === mark) queuedRef.current = null;
      };
      p.then(settle, settle);
      return p;
    },
    [inTurn],
  );
  const startSession = useCallback(
    (options?: StartSessionOptions) => queue("start", () => startNowRef.current(options)),
    [queue],
  );
  const isActive = useCallback(
    () => (queuedRef.current ? queuedRef.current.op === "start" : activeRef.current),
    [],
  );
  const endSession = useCallback(() => queue("end", () => endNowRef.current()), [queue]);

  return { isActive, startSession, endSession };
}

/** Format context for end-of-session summary. */
function formatSessionContext(
  durationSecs: number,
  segmentCount: number,
  score: number,
  totalBeats: number,
  accuracy: number,
  meanDeviation: number,
  longestStreak: number,
  instrumentLabel: string,
  narrativeBlock?: string,
): string {
  const narrative = narrativeBlock ? `\n\n${narrativeBlock}` : "";
  // `Score:` and `Accuracy:` MUST stay capitalised and on their own
  // lines — the Rust template-fallback parser
  // (`coach.rs::extract_int` / `extract_metric`) keys off these exact
  // prefixes via case-sensitive `str::contains`. v0.9 shipped this
  // block with lowercase `score:`/`accuracy:` and the no-LLM session
  // summary always read "Tough session at 0% accuracy" because both
  // extractors fell back to 0. Keep these labels in lockstep with
  // `formatMiniReportContext` above.
  //
  // The score line emits a bare integer (no `/100` suffix) for the
  // same reason `formatMiniReportContext` does: `extract_int` greedy-
  // parses the first whitespace-separated token after the prefix and
  // chokes on `75/100`.
  //
  // v0.10: dropped `(grade X)` from the score line. The UI no longer
  // surfaces letter grades (the feed's message card said why; it went with the feed, leg c2a2) so
  // pulling the letter into the LLM prompt would just push the model
  // back toward grade-flavoured language ("Tough session", "rough
  // patch") for the very players we're trying to encourage.
  return `The player (${instrumentLabel}) has ended their practice session. Generate a brief, encouraging summary that names something specific to keep working on. Do NOT use letter grades or evaluative framing like "tough session" or "rough patch."
Duration: ${durationSecs} seconds, ${segmentCount} segment(s)
Score: ${score} out of 100
Total beats: ${totalBeats}
Accuracy: ${accuracy}% of attempted beats
Timing tendency: avg ${meanDeviation.toFixed(1)}ms deviation
Longest clean streak: ${longestStreak} beats${narrative}`;
}

/**
 * Phase 5 — pick the previous session's score for chip context.
 *
 * Prefers a preset-matched session when one exists (so the user's
 * "compare to last time" question lands on the SAME exercise), falling
 * back to the most-recent session overall. Returns `undefined` when
 * history is empty so the `compare-last-session` chip's `qualifies`
 * predicate naturally filters it out — no special-casing in the
 * selector required.
 */
function pickPreviousSessionScore(
  history: import("../types").SavedSession[] | undefined,
  presetId?: string,
): number | undefined {
  if (!history || history.length === 0) return undefined;
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  const candidate = presetId
    ? sorted.find((s) => s.presetId === presetId) ?? sorted[0]
    : sorted[0];
  return candidate?.report.score;
}

/**
 * Build a brief one-liner about the most recent session for the
 * narrative session-start line, e.g. `"last session: 88% at 135 BPM"`.
 * Prefers a preset-matched session when available so the seed line
 * stays relevant for re-running the same exercise. When the preset
 * has crossed the C3 minimum-data gate, augments with a recurring
 * issue hint ("ceiling at 140 BPM").
 */
function buildPriorSummary(
  history: import("../types").SavedSession[] | undefined,
  presetHistory: import("../types").SavedSession[] | undefined,
  presetId?: string,
  presetName?: string,
): string | undefined {
  if (!history || history.length === 0) return undefined;
  // Newest-first ordering matches existing storage convention.
  const sorted = [...history].sort((a, b) => b.timestamp - a.timestamp);
  const candidate = presetId
    ? sorted.find((s) => s.presetId === presetId) ?? sorted[0]
    : sorted[0];
  if (!candidate) return undefined;
  // Scored-beat denominator (hits + miss) — same as everywhere else.
  // Returning `null` when no beats were scored suppresses the "%" frag
  // rather than emitting "0% " for an empty session.
  const scored = scoredBeats(candidate.report);
  const acc = scored > 0 ? accuracyPct(candidate.report) : null;
  const accFrag = acc != null ? `${acc}% ` : "";
  let line = `last session: ${accFrag}at ${candidate.bpm} BPM, score ${candidate.report.score}`;
  // The hint half of the line reads the preset's own history, which is
  // deeper than the thirty rows the "last session" half is drawn from.
  if (presetId && presetHistory && presetHistory.length > 0) {
    const summary = summarizePreset(presetId, presetName, presetHistory);
    const issues = detectRecurringIssues(summary);
    if (issues.bpmCeiling) {
      line += `; preset ceiling ~${issues.bpmCeiling.bpmLow}-${issues.bpmCeiling.bpmHigh - 1} BPM`;
    } else if (issues.timingTendency) {
      line += `; tends to ${issues.timingTendency.direction}`;
    }
  }
  return line;
}

/**
 * Aggregate multiple segment reports into a single session report.
 *
 * History: the previous implementation had two bugs.
 *   1. A single-report fast-path returned the backend report verbatim,
 *      so a session that only generated one mini-report kept the
 *      segment-aware (DSP-quirk-sensitive) score even though every
 *      other displayed path uses the legacy formula.
 *   2. The multi-report branch used a hand-rolled formula
 *      (`hitRate*30 + (100 - meanAbsDev*2)*0.5 + (100 - stdDev*1.5)*0.2`)
 *      that bore no resemblance to either the Rust legacy formula or
 *      the Rust segment formula. This produced scores that disagreed
 *      with displayed hit-rate trends.
 *
 * Both are fixed in two stages:
 *   - When all reports carry D4 segment data (`onsetEfficiency` defined),
 *     the aggregate score is a `totalBeats`-weighted average of the
 *     per-segment D4 scores (IC/GA/HC/OE). This path requires that the
 *     Rust timing thread fires a segment boundary (SessionEnd or
 *     ActivityGap) before the report is fetched.
 *   - Otherwise (legacy path / short warmup / old sessions), the score
 *     falls back to `computeLegacyScore` so every score the user sees
 *     uses one consistent formula based on counts they can read off the
 *     report.
 */
function aggregateReports(reports: SessionReport[]): SessionReport {
  if (reports.length === 1) {
    // Still re-score the single report so the displayed end-of-session
    // score matches the formula used for multi-segment aggregates.
    return rescoreReport(reports[0]);
  }

  let totalBeats = 0, hitsCount = 0, missCount = 0, skippedBeats = 0;
  let perfectCount = 0, goodCount = 0, okCount = 0;
  let longestStreak = 0;
  const allDeviations: number[] = [];
  const allAmplitudes: number[] = [];
  const allIntervalErrors: number[] = [];
  const allGridCorrelations: number[] = [];
  const allIntervalConsistencies: number[] = [];
  const allGridAlignments: number[] = [];

  for (const r of reports) {
    totalBeats += r.totalBeats;
    hitsCount += r.hitsCount;
    missCount += r.missCount;
    skippedBeats += r.skippedBeats;
    perfectCount += r.perfectCount;
    goodCount += r.goodCount;
    okCount += r.okCount;
    longestStreak = Math.max(longestStreak, r.longestStreak);
    allDeviations.push(...r.deviations);
    if (r.meanAmplitude > 0) allAmplitudes.push(r.meanAmplitude);
    if (r.meanIntervalErrorMs !== 0) allIntervalErrors.push(r.meanIntervalErrorMs);
    if (r.gridCorrelation > 0) allGridCorrelations.push(r.gridCorrelation);
    if (r.intervalConsistency !== undefined) allIntervalConsistencies.push(r.intervalConsistency);
    if (r.gridAlignment !== undefined) allGridAlignments.push(r.gridAlignment);
  }

  const meanDev = allDeviations.length > 0
    ? allDeviations.reduce((a, b) => a + b, 0) / allDeviations.length
    : 0;
  const meanAbsDev = allDeviations.length > 0
    ? allDeviations.reduce((a, b) => a + Math.abs(b), 0) / allDeviations.length
    : 0;
  const stdDev = allDeviations.length > 1
    ? Math.sqrt(allDeviations.reduce((s, d) => s + (d - meanDev) ** 2, 0) / (allDeviations.length - 1))
    : 0;
  const meanIntervalError = allIntervalErrors.length > 0
    ? allIntervalErrors.reduce((a, b) => a + b, 0) / allIntervalErrors.length
    : 0;
  const meanAmp = allAmplitudes.length > 0
    ? allAmplitudes.reduce((a, b) => a + b, 0) / allAmplitudes.length
    : 0;
  const dynamicsStd = allAmplitudes.length > 1
    ? Math.sqrt(allAmplitudes.reduce((s, a) => s + (a - meanAmp) ** 2, 0) / (allAmplitudes.length - 1))
    : 0;
  const tempoStability = allIntervalErrors.length > 1
    ? Math.sqrt(allIntervalErrors.reduce((s, e) => s + (e - meanIntervalError) ** 2, 0) / (allIntervalErrors.length - 1))
    : 0;

  // SCORE_DISPLAY_FIX (Part C): when all input reports carry D4 segment
  // data (onsetEfficiency defined), aggregate using a totalBeats-weighted
  // average of the per-segment D4 scores. This preserves the IC/GA/HC/OE
  // formula for sessions where the timing analyzer fired at least one
  // segment boundary (SessionEnd, ActivityGap, or GridDiscontinuity).
  //
  // Falls back to computeLegacyScore when any report lacks onsetEfficiency
  // (short warmup, old saved sessions, or legacy Rust path).
  //
  // Note: totalBeats-weighting ≠ duration-weighting at variable BPM.
  // A 60s segment at 200 BPM contributes 200 beats vs a 60s segment at
  // 60 BPM contributing only 60. For fixed-BPM practice (the common
  // case) this is equivalent to duration-weighting. If variable-BPM
  // sessions are added later, weight by endMs - startMs instead.
  const allHaveD4 = reports.every(
    r => 'onsetEfficiency' in r && r.onsetEfficiency !== undefined
  );
  const score = (() => {
    if (allHaveD4 && totalBeats > 0) {
      const d4 = reports.reduce((s, r) => s + r.score * r.totalBeats, 0) / totalBeats;
      return Math.round(d4);
    }
    return computeLegacyScore({
      hitsCount,
      missCount,
      perfectCount,
      goodCount,
      okCount,
      stdDeviationMs: stdDev,
    });
  })();
  const grade = gradeForScore(score);

  return {
    totalBeats, hitsCount, missCount, skippedBeats,
    perfectCount, goodCount, okCount,
    meanDeviationMs: meanDev,
    stdDeviationMs: stdDev,
    meanAbsDeviationMs: meanAbsDev,
    meanIntervalErrorMs: meanIntervalError,
    grade,
    score,
    deviations: allDeviations,
    dynamicsStd,
    meanAmplitude: meanAmp,
    tempoStabilityMs: tempoStability,
    longestStreak,
    // Grade-band one-liner (matches Rust `generate_comment` so the
    // multi-segment path doesn't visibly change tone from a single
    // segment). The narrative card below this comment carries the
    // shape-aware "what does the score actually mean" framing; the
    // segment count is appended as a small contextual suffix instead
    // of being the entire comment as it was before.
    comment: reports.length > 1
      ? `${commentForScore(score, hitsCount + missCount)} (${reports.length} segments)`
      : commentForScore(score, hitsCount + missCount),
    // Insights stay empty: the `SessionNarrativeView` rendered on top
    // of this report now produces the contextual interpretation that
    // the rule-based insights used to provide, and the rule-based
    // insights themselves (Rust `generate_insights`) operate on the
    // per-segment level — running them on the aggregate would produce
    // double-counted or misleading observations (e.g. "you rushed by
    // 5ms" computed from a mean that cancelled segments where you
    // dragged). The narrative is the right home for aggregate prose.
    insights: [],
    gridCorrelation: allGridCorrelations.length > 0
      ? allGridCorrelations.reduce((a, b) => a + b, 0) / allGridCorrelations.length
      : 0,
    intervalConsistency: allIntervalConsistencies.length > 0
      ? allIntervalConsistencies.reduce((a, b) => a + b, 0) / allIntervalConsistencies.length
      : undefined,
    gridAlignment: allGridAlignments.length > 0
      ? allGridAlignments.reduce((a, b) => a + b, 0) / allGridAlignments.length
      : undefined,
  };
}
