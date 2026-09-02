import { useState, useEffect, useRef, useCallback } from "react";
import { getFinalSessionReport, stopEvaluation, getSessionHistory, saveSession, clearSession, coachGenerate, isCoachLoaded, ttsSpeak, onBeatFeedback, onAdaptiveEval, notifySettingsChange, clearCalibrationCacheEntry, onTtsSpeechStarted, onPracticeSegmentEnded } from "../ipc";
import type { AdaptiveEvalRequest } from "../ipc";
import type { BeatFeedback, BrainTier, FeedChip, FeedMessage, SessionReport, SessionSegment } from "../types";
import type { useEvaluation } from "./useEvaluation";
import {
  coachLoadPending,
  coachResident,
  ensureCoachLoaded,
  scheduleCoachIdleUnload,
} from "./coachLoader";
import { loadHistoryWithBudget, renderGreeting } from "../coach/greeting";
import {
  appendCoachUtterance,
  appendInstrumentChange,
  appendPresetChange,
  appendSegmentEnd,
  appendUserAction,
  createNarrative,
  formatForLLM,
  type Narrative,
} from "../coach/narrative";
import {
  detectRecurringIssues,
  detectStaminaPattern,
  formatPresetSummaryForLLM,
  summarizePreset,
} from "../coach/presetAwareness";
import {
  createGatekeeper,
  evaluate as gatekeeperEvaluate,
  resetCooldowns,
  shouldDropForStaleness,
  type GatekeeperEvent,
  type GatekeeperState,
  type ScenarioTag,
} from "../coach/gatekeeper";
import {
  createShuffleState,
  pickTemplate,
  recordUtterance,
  type ShuffleState,
  type Severity,
  type Vocabulary,
} from "../coach/templates";
import { TEMPLATE_CATALOG } from "../coach/templateCatalog";
import {
  adaptiveScenario,
  buildAdaptiveCommentPrompt,
  isUsableComment,
} from "../coach/adaptiveComment";
import {
  isSegmentReportable,
  shortPocketNote,
} from "../coach/miniReport";
import {
  createInterventionState,
  pickIntervention,
  recordIntervention,
  type InterventionContext,
  type InterventionRateState,
  type SelectedIntervention,
} from "../coach/interventions";
import { accuracyPct, commentForScore, computeLegacyScore, computeRecentHitCompleteness, gradeForScore, rescoreReport, scoredBeats } from "../coach/reportStats";
import { createSessionToken } from "../coach/sessionGuard";
import { coachDebug } from "../coach/debug";
import { meterKey } from "../utils/meter";
import { useRealtimeTips } from "../containers/practice-coach/hooks/useRealtimeTips";
import { useSegmentCoach } from "../containers/practice-coach/hooks/useSegmentCoach";

// ── Realtime-tip evaluation window ──────────────────────────────────
// The gatekeeper consumes the last N BeatFeedback entries when deciding
// whether to comment. 32 is roughly two 4/4 bars at 4 beats per bar
// times two evaluation cycles — enough to detect a trend without
// over-smoothing single-beat anomalies. The ring is reset on every
// session start (no cross-session bleed) — see endSession state reset.
const REALTIME_WINDOW_BEATS = 32;
// Cap how often the gatekeeper is consulted regardless of time sig.
// In 7/8 (or other odd meters) two bars can be just 14 beats; without
// this floor we'd evaluate too aggressively and burn the cooldown
// budget. In 4/4 this is one evaluation per ~2 bars at 120 BPM.
const MIN_BEATS_PER_EVAL_CHECK = 8;
// Suppress all reactive tips (gatekeeper + realtime) for the first N ms
// of each session so the player has time to warm up before feedback lands.
const COACH_WARMUP_MS = 20_000;

type Evaluation = ReturnType<typeof useEvaluation>;

interface UseSessionOptions {
  evaluation: Evaluation;
  isPlaying: boolean;
  bpm: number;
  timeSignature: number;
  /**
   * Accent grouping of the bar. Watched alongside `timeSignature` so a
   * variant switch that keeps the same total (7/8 `[3,2,2]` → `[2,3,2]`)
   * still produces one debounced coach boundary — `timeSignature` alone
   * cannot see it.
   */
  beatGroups?: number[];
  presetId?: string;
  presetName?: string;
  voiceMode?: "silent" | "voice";
  /** C5 — user-tunable verbosity tier. Maps to the plan's "Silent /
   *  Default / More" knob (voiceMode "silent" already covers the
   *  Silent case, so this only widens or tightens what reaches TTS
   *  on top of the existing spoken/written tier split).
   *  - "default" → no changes; honours gatekeeper tier as-is.
   *  - "more"    → written events with severity ≥ neutral get
   *                promoted to spoken (more talkative coach).
   *  Defaults to "default" if absent. */
  coachVerbosity?: "less" | "default" | "more";
  /** Scoring mode. "default" focuses on musical feel and steady time;
   *  "pro" grades against the full beat grid subdivision-by-subdivision.
   *  Defaults to "default" if absent. */
  coachMode?: "default" | "pro";
  /**
   * The user's brain-tier setting. `"off"` means no model is wanted, so
   * `startSession` does not load one — residency is a cost the user
   * opted into, not a default.
   */
  brainTier?: BrainTier;
  instrument?: string;
  /** Optional BPM setter so chip affordances can land tempo nudges
   *  (e.g. "Drop to 130 BPM"). When absent, set-bpm affordances are
   *  ignored — they still fire `kind: "set-bpm"` but the side-effect
   *  is a no-op. The hook does NOT clamp or validate; the caller is
   *  expected to delegate to the canonical `setBpm(...)` IPC. */
  setBpm?: (bpm: number) => void;
  /**
   * True while a drill speed-ramp is actively stepping toward the
   * target BPM (not yet at target and not completed). Suppresses
   * regular realtime tips via the `DRILL_RAMP_ACTIVE` gatekeeper
   * preempt; triggers a `ramp_complete` summary when it transitions
   * from true → false.
   */
  inDrillRamp?: boolean;
  /**
   * BPM where the current ramp started. Used to populate the
   * `{startBpm}` placeholder in the `ramp_complete` template.
   * Only meaningful when `inDrillRamp` is or was true.
   */
  drillStartBpm?: number;
  /**
   * BPM target of the current ramp. Used to populate the
   * `{endBpm}` placeholder in the `ramp_complete` template.
   * Only meaningful when `inDrillRamp` is or was true.
   */
  drillTargetBpm?: number;
  /**
   * True when the backend has flagged the ramp as successfully
   * completed (reached target BPM and held for the required bars).
   * Used to gate `ramp_complete` so a user stop mid-ramp does NOT
   * emit a false "made it to {endBpm}" summary.
   */
  drillCompleted?: boolean;
}

export function useSession({ evaluation, isPlaying, bpm, timeSignature, beatGroups, presetId, presetName, voiceMode = "silent", coachVerbosity = "default", coachMode = "default", brainTier = "off", instrument = "electric-guitar", setBpm, inDrillRamp = false, drillStartBpm, drillTargetBpm, drillCompleted = false }: UseSessionOptions) {
  const instrumentLabel = instrument === "drums" ? "drums/percussion"
    : instrument === "electric-guitar" ? "electric guitar"
    : instrument === "acoustic-guitar" ? "acoustic guitar"
    : instrument === "bass" ? "bass guitar"
    : instrument === "piano" ? "piano/keys"
    : "general instrument";
  // Map the raw instrument string to the templates' `Vocabulary` type.
  // Unknown instruments fall through to "generic" so the catalog still
  // resolves a template via the generic fallback.
  const vocab: Vocabulary =
    instrument === "drums" ? "drums"
    : instrument === "electric-guitar" ? "electric-guitar"
    : instrument === "acoustic-guitar" ? "acoustic-guitar"
    : instrument === "bass" ? "bass"
    : instrument === "piano" ? "piano"
    : "generic";
  const [active, setActive] = useState(false);
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  // Step 5 — play-style derived from onset_efficiency each mini-report.
  // 'structured' = ≥0.65 ratio of matched onsets; 'noodling' = <0.65.
  // undefined until the first scoreable segment lands.
  const [playMode, setPlayMode] = useState<"structured" | "noodling" | undefined>(undefined);
  const playBpmRef = useRef(bpm);
  const segmentReportsRef = useRef<SessionSegment[]>([]);
  const segmentStartRef = useRef<number>(Date.now());
  // Residency is owned by `hooks/coachLoader.ts`, which is module state
  // rather than hook state: whether a multi-gigabyte model is in RAM is a
  // property of the process, not of this component tree. This ref is a
  // local mirror kept in sync at the few points that change it, so the
  // hot paths below stay synchronous.
  const coachLoadedRef = useRef(false);
  const sessionIdRef = useRef(0);
  const messagesRef = useRef<FeedMessage[]>([]);
  // ── activeRef: synchronous mirror of `active` ─────────────────
  // React state updates are batched / async; async callbacks (LLM
  // results, late event-listener firings) that close over a stale
  // `active` boolean would speak/append after `endSession`. The ref
  // is updated in the same effect that reads `active`, so callbacks
  // can do a synchronous "is the session still alive?" check before
  // calling `maybeSpeak(...)` or `setMessages(...)`.
  const activeRef = useRef(false);

  // ── C1: Session Narrative ─────────────────────────────────────
  // Compact 2KB running log of the session arc. Seeded on
  // startSession, appended on every segment-end / coach utterance /
  // user action. Passed into the LLM context so the model has a
  // structured view of what's happened (vs. only the latest metric
  // snapshot).
  const narrativeRef = useRef<Narrative | null>(null);

  // ── C4: Gatekeeper state ──────────────────────────────────────
  // Decides WHEN to speak and on which channel. Pure state machine —
  // tied to session lifecycle (created in startSession, cleared in
  // endSession).
  const gatekeeperRef = useRef<GatekeeperState | null>(null);

  // ── C5: Shuffle-bag + similarity ring state ───────────────────
  // Keeps phrasing variety across the whole app run, not just per
  // session — that way the player doesn't hear "you're rushing —
  // 12ms early" twice in a row across two short sessions.
  const shuffleStateRef = useRef<ShuffleState>(createShuffleState());

  // ── Phase 5: intervention rate-limit state ────────────────────
  // Tracks the recent intervention timestamps (5-min rate cap = 2)
  // and per-id cooldowns. Pure in-memory state — interventions don't
  // need to survive a session boundary; the next session gets a fresh
  // slate and a fresh window. Reset on startSession.
  const interventionStateRef = useRef<InterventionRateState>(createInterventionState());

  // ── Phase 5: chip recency + prior-session score refs ──────────
  // `prevSessionBestRef` snapshots the best score from the most-recent
  // saved session for this preset (or globally if none) so chips like
  // "compare-last-session" have a number to anchor against. It's
  // refreshed on session start (so each new session sees the latest
  // history) and is null until the first history fetch lands.
  const prevSessionBestRef = useRef<number | undefined>(undefined);
  // `chatInputFocusRef` is a callback ref the CoachCard can register so
  // the chip "Ask something else…" can focus the input from inside the
  // hook. We use a ref-to-a-callback (not a DOM ref) because the input
  // lives in the CoachCard, not here — the card calls
  // `registerChatFocus(fn)` when it mounts and the hook invokes the
  // stored fn when an open-chat chip fires.
  const chatInputFocusRef = useRef<(() => void) | null>(null);
  const registerChatFocus = useCallback((fn: (() => void) | null) => {
    chatInputFocusRef.current = fn;
  }, []);

  // ── D4 Signal A: settings-change tracking refs ────────────────
  // Previous values used to detect BPM / preset / time-signature /
  // instrument changes mid-session. Seeded on startSession so the
  // first useEffect tick doesn't fire a false-positive boundary.
  // These reflect the LAST COMMITTED state — i.e. the values at the
  // moment the most recent `boundary_signal_a` event fired. They are
  // NOT updated on every render so a burst of rapid changes (e.g.
  // hammering -5 BPM six times) coalesces into a single event for
  // the net change ("tempo down to 90 BPM") instead of six cards.
  // Stable identity for the meter. `beatGroups` arrives as a fresh
  // array on every state-changed event, so the boundary effect must
  // depend on this string rather than the array reference.
  const meterId = meterKey(beatGroups ?? [timeSignature]);
  const prevBpmRef = useRef<number>(bpm);
  const prevPresetIdRef = useRef<string | undefined>(presetId);
  const prevTimeSignatureRef = useRef<number>(timeSignature);
  const prevMeterKeyRef = useRef<string>(meterKey(beatGroups ?? [timeSignature]));
  const prevInstrumentRef = useRef<string>(instrument);
  // Debounce timer used to coalesce config-change bursts. Each new
  // change resets the timer; the gatekeeper fires once the user
  // settles (no further changes for BOUNDARY_DEBOUNCE_MS).
  const boundaryDebounceRef = useRef<number | null>(null);

  // ── C4 first-4-beats hard rule: per-segment beat counter ──────
  // Counts beats since the current segment started. Resets on
  // session-start, on Signal A (settings change → new segment), and
  // on play-stop→play-start transitions (Signal B → new segment).
  // Fed into the gatekeeper as `ctx.beatsInSegment` so spoken events
  // get demoted to written during the first 4 beats of every segment,
  // per the plan's hard rule "No TTS during the first 4 beats of any
  // segment (let the player settle in)."
  const beatsInSegmentRef = useRef<number>(0);

  // Speak a comment when voice mode is on. The notification-level
  // selector was removed — the coach is either fully audible or fully
  // silent. The `urgency` parameter is accepted for call-site clarity
  // ("urgent" vs "normal") but does not gate playback any more.
  const maybeSpeak = useCallback((text: string, _urgency: "urgent" | "normal" = "urgent") => {
    if (voiceMode !== "voice") return;
    ttsSpeak(text).catch(() => {});
  }, [voiceMode]);

  // ── Pending-speech sync (spinner-to-text on tts-speech-started) ──
  //
  // The Rust TTS side emits `tts-speech-started` after Piper synthesis
  // finishes but BEFORE `afplay` is launched (see `tts.rs::speak`). We
  // maintain a FIFO queue of pending message IDs — each call to
  // `speakAndReveal` pushes its messageId, each event pops the head
  // and clears that message's `pending` flag. Because `tts_speak` is
  // gated by a single Mutex on the Rust side, speeches run
  // sequentially and the FIFO ordering holds.
  const pendingSpeechQueueRef = useRef<string[]>([]);
  useEffect(() => {
    const unlistenP = onTtsSpeechStarted(() => {
      const id = pendingSpeechQueueRef.current.shift();
      if (!id) return;
      setMessages(prev => prev.map(m =>
        m.id === id ? { ...m, pending: false } : m
      ));
    });
    return () => { unlistenP.then(fn => fn()); };
  }, []);

  /** Speak `text` and reveal the message with `messageId` exactly when
   *  the audio is about to start. Inserts the message ID into the
   *  pending queue; the tts-speech-started listener clears the pending
   *  flag when its turn comes up. Fallback behavior:
   *    - voiceMode != "voice"  → reveal immediately, no TTS call
   *    - ttsSpeak() rejects    → force-reveal so the spinner doesn't
   *                              get stuck on a TTS error
   *    - 5s safety timeout     → force-reveal if event never fires
   *
   *  The caller is responsible for having already inserted the message
   *  into `messages` with `pending: true`. This helper does not touch
   *  the message body — it only owns the reveal timing. */
  const speakAndReveal = useCallback((messageId: string, text: string, _urgency: "urgent" | "normal" = "urgent") => {
    const forceReveal = () => {
      setMessages(prev => prev.map(m =>
        m.id === messageId ? { ...m, pending: false } : m
      ));
      pendingSpeechQueueRef.current = pendingSpeechQueueRef.current.filter(qid => qid !== messageId);
    };

    if (voiceMode !== "voice") {
      forceReveal();
      return;
    }

    pendingSpeechQueueRef.current.push(messageId);

    // Safety net: if the started-event never fires (Rust panicked,
    // event got dropped, etc.) reveal after 5s so the spinner isn't
    // stuck forever.
    const safetyTimer = window.setTimeout(forceReveal, 5000);

    ttsSpeak(text)
      .then(() => {
        // Audio finished. The reveal happened on the started event;
        // if it somehow didn't, force it now (covers the path where
        // the event was dropped but afplay still ran).
        window.clearTimeout(safetyTimer);
        forceReveal();
      })
      .catch(() => {
        window.clearTimeout(safetyTimer);
        forceReveal();
      });
  }, [voiceMode]);
  const speakAndRevealRef = useRef(speakAndReveal);
  useEffect(() => { speakAndRevealRef.current = speakAndReveal; }, [speakAndReveal]);

  // ── Stable refs for values consumed by long-lived event listeners ──
  // The beat-feedback listener (mounted once per active+isPlaying
  // cycle) reads `vocab`, `instrumentLabel`, and `maybeSpeak`. If we
  // listed these in the effect deps, every preset/instrument/voice
  // change would tear down the Tauri listener and re-subscribe — and
  // between teardown and re-mount there's a window where the OLD
  // listener's callback (already in flight from Rust) fires with the
  // PREVIOUS vocab/instrument. Routing through refs lets us shrink the
  // effect deps to just lifecycle signals (active, isPlaying,
  // timeSignature) while still letting the callback read the latest
  // values.
  const vocabRef = useRef(vocab);
  useEffect(() => { vocabRef.current = vocab; }, [vocab]);
  const instrumentLabelRef = useRef(instrumentLabel);
  useEffect(() => { instrumentLabelRef.current = instrumentLabel; }, [instrumentLabel]);
  const maybeSpeakRef = useRef(maybeSpeak);
  useEffect(() => { maybeSpeakRef.current = maybeSpeak; }, [maybeSpeak]);

  // ── inDrillRamp: stable ref for use in long-lived beat callbacks ──
  const inDrillRampRef = useRef(inDrillRamp);
  useEffect(() => { inDrillRampRef.current = inDrillRamp; }, [inDrillRamp]);
  const drillStartBpmRef = useRef(drillStartBpm);
  useEffect(() => { drillStartBpmRef.current = drillStartBpm; }, [drillStartBpm]);
  const drillTargetBpmRef = useRef(drillTargetBpm);
  useEffect(() => { drillTargetBpmRef.current = drillTargetBpm; }, [drillTargetBpm]);
  // Tracks the previous inDrillRamp value so the effect below can
  // detect the true→false transition that fires ramp_complete.
  const prevInDrillRampRef = useRef(inDrillRamp);
  // Guards ramp_complete against false positives when the user stops
  // mid-ramp (completed stays false; only a natural ramp finish sets it true).
  const drillCompletedRef = useRef(drillCompleted);
  useEffect(() => { drillCompletedRef.current = drillCompleted; }, [drillCompleted]);

  // Keep messagesRef in sync for use in callbacks
  useEffect(() => { messagesRef.current = messages; }, [messages]);

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

  // Nothing is loaded at mount.
  //
  // This effect used to call `loadCoachModel()` here *and* `startSession`
  // called it again while the first was still in flight — and the Rust
  // side unconditionally dropped the resident worker before spawning a
  // replacement, so the second call tore down a working brain. It also
  // meant every launch paid 4 GB of RAM and a multi-second load for a
  // model the user might never ask anything of. The brain is loaded when
  // a session starts (see `startSession`) and dropped when the app has
  // been idle (see `endSession`), through the one deduped helper in
  // `hooks/coachLoader.ts`.
  //
  // We do still ask whether something is already resident — a second
  // window, or a session that ended less than the idle timeout ago.
  useEffect(() => {
    isCoachLoaded()
      .then((loaded) => {
        coachLoadedRef.current = loaded;
      })
      .catch(() => {});
  }, []);

  // ── Segment coaching: rising-edge start tracking + falling-edge
  // mini-report generation. wasPlayingRef lives inside the hook.
  const { reset: resetSegmentCoach } = useSegmentCoach({
    isPlaying, active, timeSignature, instrumentLabel,
    coachVerbosity, coachMode,
    segmentReportsRef, segmentStartRef, prevSessionBestRef,
    narrativeRef, sessionIdRef, activeRef, playBpmRef,
    beatsInSegmentRef, setMessages, setPlayMode,
  });

  // Drill ramp-complete detection: fires when inDrillRamp transitions
  // true→false during an active session. Emits a `ramp_complete` tip
  // as a forced gatekeeper event so cooldowns don't suppress it.
  useEffect(() => {
    const wasRamping = prevInDrillRampRef.current;
    prevInDrillRampRef.current = inDrillRamp;
    if (!wasRamping || inDrillRamp) return; // no true→false transition
    if (!drillCompletedRef.current) return; // user stopped mid-ramp — not a natural completion
    if (!active) return; // no active session
    const gk = gatekeeperRef.current;
    if (!gk) return;
    const startBpm = drillStartBpmRef.current ?? 0;
    const endBpm = drillTargetBpmRef.current ?? playBpmRef.current;
    const now = Date.now();
    const { state: nextState, event } = gatekeeperEvaluate(gk, {
      now,
      bpm: playBpmRef.current,
      window: realtimeWindowRef.current,
      beatsInSegment: beatsInSegmentRef.current,
      force: {
        scenario: "ramp_complete",
        context: { startBpm, endBpm },
      },
    });
    gatekeeperRef.current = nextState;
    if (!event) return;
    const severity = "neutral" as const;
    const template = pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
      vocab: vocabRef.current,
      scenario: "ramp_complete",
      severity,
      context: { startBpm, endBpm },
    });
    if (!template) return;
    const msgId = crypto.randomUUID();
    const msg: FeedMessage = {
      id: msgId,
      type: "coach-tip",
      timestamp: now,
      content: template,
      urgency: "normal",
      pending: voiceMode === "voice",
    };
    setMessages((prev) => [...prev, msg]);
    if (narrativeRef.current) {
      narrativeRef.current = appendCoachUtterance(narrativeRef.current, template);
    }
    speakAndReveal(msgId, template, "normal");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inDrillRamp, active]);


  // Real-time coaching: monitor beat feedback during active play.
  //
  // Flow per evaluation tick (every ~2 bars):
  //   1. C4 gatekeeper.evaluate(...) decides IF + WHICH scenario + WHICH channel.
  //   2. C5 pickTemplate(...) fills a phrasing from the catalog (with
  //      shuffle-bag variety + bigram similarity guard).
  //   3. Optional LLM rephrase — sees the filled template as the
  //      source-of-truth and is asked to rephrase preserving numbers.
  //   4. Stale-drop guard: if the BPM has drifted >5 since the event
  //      was tagged, drop the comment rather than landing stale info.
  const realtimeWindowRef = useRef<BeatFeedback[]>([]);
  const beatsSinceLastCheckRef = useRef<number>(0);

  // ── Real-time per-beat tip evaluators ─────────────────────────────
  // Stamina, pace-coaching, and grid-lost tips are evaluated inside
  // the beat-feedback effect. All state for those tips lives in the
  // hook; `seed` arms them from history at session start, and
  // `checkNoEventTips` fires them when the gatekeeper emits no event.
  const { seed: seedRealtimeTips, checkNoEventTips } = useRealtimeTips({
    shuffleStateRef,
    vocabRef,
    narrativeRef,
    speakAndRevealRef,
    setMessages,
    playBpmRef,
    realtimeWindowRef,
  });

  useEffect(() => {
    if (!active || !isPlaying) {
      realtimeWindowRef.current = [];
      beatsSinceLastCheckRef.current = 0;
      return;
    }

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    onBeatFeedback((fb) => {
      if (cancelled) return;
      const window = realtimeWindowRef.current;
      window.push(fb);
      if (window.length > REALTIME_WINDOW_BEATS) window.shift();
      beatsSinceLastCheckRef.current++;
      beatsInSegmentRef.current++;

      coachDebug("beat", {
        idx: fb.beatIndex,
        cls: fb.classification,
        devMs: Math.round(fb.deviationMs),
        amp: +fb.amplitude.toFixed(2),
        conf: +fb.calibrationConfidence.toFixed(2),
        winLen: window.length,
        beatsInSeg: beatsInSegmentRef.current,
        sinceCheck: beatsSinceLastCheckRef.current,
      });

      // Check every MIN_BEATS_PER_EVAL_CHECK beats or every 2 bars,
      // whichever is larger. The gatekeeper has its own cooldown math
      // so we can poll more frequently than the legacy 15s throttle
      // without spamming.
      const barsWorth = timeSignature * 2;
      if (beatsSinceLastCheckRef.current < Math.max(MIN_BEATS_PER_EVAL_CHECK, barsWorth)) return;
      beatsSinceLastCheckRef.current = 0;

      // Warmup guard: no reactive tips until the player has had time to settle.
      const now = Date.now();
      if (startedAt != null && now - startedAt < COACH_WARMUP_MS) return;

      const gk = gatekeeperRef.current;
      if (!gk) {
        coachDebug("gatekeeper.skip", "no-gatekeeper-yet");
        return; // session not fully started yet
      }
      coachDebug("gatekeeper.evaluate", {
        bpm: playBpmRef.current,
        winLen: window.length,
        beatsInSeg: beatsInSegmentRef.current,
      });
      const { state: nextState, event } = gatekeeperEvaluate(gk, {
        now,
        bpm: playBpmRef.current,
        window,
        beatsInSegment: beatsInSegmentRef.current,
        inDrillRamp: inDrillRampRef.current,
        verbosity: coachVerbosity,
        recentHitCompleteness: computeRecentHitCompleteness(segmentReportsRef.current),
      });
      gatekeeperRef.current = nextState;
      if (!event) {
        coachDebug("gatekeeper.no-event", "all-detectors-passed-or-cooldown");
        checkNoEventTips({ now, startedAt, coachVerbosity, voiceMode });
        return;
      }
      coachDebug("gatekeeper.event", {
        scenario: event.scenario,
        tier: event.tier,
        taggedBpm: event.taggedBpm,
        ctx: event.context,
      });

      // Staleness guard — if BPM has drifted significantly since the
      // event was tagged, drop it. Cheap belt-and-braces; in practice
      // it's the drill-adaptive path that triggers this most.
      if (
        shouldDropForStaleness(event.taggedBpm, playBpmRef.current)
      ) {
        coachDebug("event.drop-stale", { taggedBpm: event.taggedBpm, currentBpm: playBpmRef.current });
        return;
      }

      const severity = severityForEvent(event);
      const template = pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
        vocab: vocabRef.current,
        scenario: event.scenario,
        severity,
        context: event.context,
      });
      if (!template) {
        coachDebug("event.drop-no-template", { scenario: event.scenario, severity, vocab: vocabRef.current });
        return;
      }

      // Phase 5 — intervention layer. If the event matches an
      // intervention (and rate-limits + cooldowns pass), we replace
      // the template text with the intervention's "want to drop to X?"
      // copy and attach an affordance button. The gatekeeper still
      // owns WHEN to speak; the intervention layer only decides what
      // affordance to attach. Returns null when no intervention fits —
      // in which case the gatekeeper's template ships unchanged.
      const intervention = pickInterventionForEvent(
        event,
        playBpmRef.current,
        latestScoreFromWindow(realtimeWindowRef.current),
        startedAt ?? Date.now(),
        segmentReportsRef.current.length,
        interventionStateRef.current,
      );
      if (intervention) {
        // Record the intervention BEFORE we kick off the LLM async
        // path so a concurrent event in the same tick can't push the
        // rate-cap over.
        interventionStateRef.current = recordIntervention(
          interventionStateRef.current,
          intervention.intervention.id,
          Date.now(),
        );
        coachDebug("intervention.fire", {
          id: intervention.intervention.id,
          actionKind: intervention.action.kind,
        });
      }

      coachDebug("event.emit", { tier: event.tier, severity, template: template.slice(0, 80) });

      // Interventions always cross the TTS threshold per plan §
      // "Intervention design rules". Force the urgency to "urgent"
      // when an affordance is attached even if the gatekeeper's tier
      // decision was "written".
      const urgency: "urgent" | "normal" =
        event.tier === "spoken" || intervention ? "urgent" : "normal";

      // C5 — user-tunable verbosity.
      //   "more"    → promotes written → spoken (more talkative).
      //   "default" → honours gatekeeper tier verbatim.
      //   "less"    → demotes spoken → written for non-urgent scenarios
      //              ('check_in', 'fatigue', 'rest', 'preset_change').
      //              Interventions still cross the TTS threshold —
      //              they're action-bearing and silencing them would
      //              defeat the affordance.
      // "Silent" (voice off entirely) is enforced one layer down
      // inside `maybeSpeak` (voiceMode check).
      const verbosityPromotesToSpoken =
        coachVerbosity === "more" && event.tier === "written" && !intervention;
      const nonUrgentScenarios = new Set([
        "check_in",
        "fatigue",
        "rest",
        "preset_change",
      ]);
      const verbosityDemotesToWritten =
        coachVerbosity === "less" &&
        event.tier === "spoken" &&
        !intervention &&
        nonUrgentScenarios.has(event.scenario);
      const effectivelySpoken =
        (event.tier === "spoken" || intervention || verbosityPromotesToSpoken) &&
        !verbosityDemotesToWritten;

      // Capture the session id BEFORE kicking off the async LLM call.
      // If the user ends the session (or starts a new one) while the
      // rephrase is in-flight, we must drop the result rather than
      // append a stale coach-tip to the next session's feed and speak
      // it aloud — that's the same hazard guarded against in the
      // mini-report / greeting / end-of-session paths, and the
      // real-time path was previously missing the guard.
      const token = createSessionToken(sessionIdRef, activeRef);
      const generateTip = async () => {
        // When an intervention fires the spoken/written copy comes
        // from the intervention catalog — it's purpose-built ("want to
        // drop to 140?") and shouldn't be paraphrased away. The
        // gatekeeper's template still drives non-intervention events.
        let comment = intervention ? intervention.text : template;
        // First-event grace window: if the coach model is still loading
        // when an event fires, hold for up to 1 second so the rephrase
        // path can run instead of shipping the raw template. After 1s
        // we fall through and the player sees the template-only copy —
        // better than waiting indefinitely and silencing real-time
        // feedback. Only matters for non-intervention events because
        // interventions use their own catalog text verbatim.
        //
        // Gated on `coachLoadPending()`: in template mode no load is
        // ever in flight, so there is nothing to wait for and the tip
        // ships immediately. While a load IS in flight the coach card
        // reads "warming up" and tips are templates — the grace window
        // only buys the paraphrase when the load is nearly done.
        if (!intervention && !coachLoadedRef.current && coachLoadPending()) {
          const COACH_LOAD_GRACE_MS = 1000;
          const POLL_MS = 50;
          const start = Date.now();
          while (
            !coachLoadedRef.current &&
            coachLoadPending() &&
            Date.now() - start < COACH_LOAD_GRACE_MS
          ) {
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
            coachLoadedRef.current = coachResident();
            if (token.isStaleOrInactive()) {
              coachDebug("realtime-tip.discard-during-coach-wait", {
                waitedMs: Date.now() - start,
              });
              return;
            }
          }
          if (!coachLoadedRef.current) {
            coachDebug("realtime-tip.coach-load-grace-expired", {
              waitedMs: Date.now() - start,
              scenario: event.scenario,
            });
          } else {
            coachDebug("realtime-tip.coach-loaded-after-wait", {
              waitedMs: Date.now() - start,
            });
          }
        }
        if (!intervention && coachLoadedRef.current) {
          try {
            const narrativeBlock = narrativeRef.current
              ? `\n${formatForLLM(narrativeRef.current)}\n`
              : "";
            const llmPrompt = buildRephrasePrompt({
              template,
              scenario: event.scenario,
              context: event.context,
              instrumentLabel: instrumentLabelRef.current,
              narrativeBlock,
              // Feed the LLM the last 3 things it just said so we get
              // anti-repetition pressure even when the shuffle bag's
              // similarity ring failed to keep tonally-distinct phrasings.
              // The shuffle ring captures both template picks AND prior
              // rephrases (see `recordUtterance` call below), so this is
              // genuinely "what the user just heard."
              recentUtterances: shuffleStateRef.current.ring.slice(-3),
            });
            const rephrased = await coachGenerate("tip", llmPrompt);
            if (rephrased && rephrased.trim()) {
              comment = rephrased.trim();
              // Prime the similarity ring with the LLM rephrase too,
              // so the next pick doesn't echo a line the user JUST
              // heard verbatim.
              recordUtterance(shuffleStateRef.current, comment);
            }
          } catch (err) {
            // Fall back to the filled template — but surface the
            // failure so we can tell "LLM crashed" apart from "LLM
            // returned empty / blank rephrase."
            coachDebug("realtime-tip.llm-error", String(err));
          }
        }
        // Stale-session check: drop if either (a) a new session has
        // started since the event was tagged (sid bump) or (b) the
        // current session ended without restarting (activeRef flipped
        // false). See src/coach/sessionGuard.ts for the predicate.
        if (token.isStaleOrInactive()) {
          coachDebug("realtime-tip.discard-stale-or-inactive", { capturedAt: token.capturedAt, current: sessionIdRef.current, active: activeRef.current });
          return;
        }
        const tipId = crypto.randomUUID();
        const msg: FeedMessage = {
          id: tipId,
          type: "coach-tip",
          timestamp: Date.now(),
          content: comment,
          // Hide the tip behind a spinner until voice arrives — only
          // for the spoken tier. Written-only tips appear instantly.
          pending: effectivelySpoken,
          ...(intervention && {
            affordance: {
              actionLabel: intervention.actionLabel,
              action: intervention.action,
              dismissLabel: intervention.dismissLabel,
              interventionId: intervention.intervention.id,
            },
          }),
        };
        setMessages((prev) => [...prev, msg]);
        if (narrativeRef.current) {
          narrativeRef.current = appendCoachUtterance(
            narrativeRef.current,
            comment,
          );
        }
        // Only the spoken tier speaks aloud; written tier appears in
        // the feed silently per the gatekeeper's channel decision.
        // Interventions force-speak (see urgency above). "More"
        // verbosity also promotes written → spoken.
        if (effectivelySpoken) {
          speakAndRevealRef.current(tipId, comment, urgency);
        }
      };
      generateTip();
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // Deps intentionally shrunk to lifecycle signals only. `vocab`,
    // `instrumentLabel`, and `maybeSpeak` are now routed through refs
    // (declared above) so a preset/instrument/voice change doesn't
    // tear down and re-subscribe the listener — avoiding the
    // race-window where the in-flight callback closure runs with
    // stale values while Rust unsubscribes.
  }, [active, isPlaying, timeSignature]);

  // Adaptive drill: the ENGINE decides, the coach only narrates.
  //
  // T07 — this used to ask the LLM for the next tempo and push the
  // answer back via `setAdaptiveDecision`. In a template-only build
  // (which is every shipped build today) no reply ever started with
  // UP/DOWN, so every step parsed as "hold" and the drill never moved.
  // The engine now applies its own threshold decision before emitting
  // this event; all we do here is put a sentence in the feed.
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let unlisten: (() => void) | null = null;

    onAdaptiveEval((req: AdaptiveEvalRequest) => {
      if (cancelled) return;

      const scenario = adaptiveScenario(req.decision);
      // A step that didn't move the tempo isn't worth a feed line.
      if (!scenario) return;

      // The template line is the floor: it always exists, and it is
      // what ships when no model is resident. The LLM path (below)
      // only ever replaces it.
      const fallback =
        pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
          vocab: vocabRef.current,
          scenario,
          severity: "neutral",
          context: { bpm: req.newBpm, accuracyPct: req.accuracyPct },
        }) ??
        (req.decision === "up"
          ? `Tempo up to ${req.newBpm} BPM — accuracy at ${req.accuracyPct}%.`
          : `Tempo down to ${req.newBpm} BPM — accuracy at ${req.accuracyPct}%.`);

      const emit = (comment: string) => {
        const msg: FeedMessage = {
          id: crypto.randomUUID(),
          type: "coach-tip",
          timestamp: Date.now(),
          content: comment,
        };
        setMessages((prev) => [...prev, msg]);
        if (narrativeRef.current) {
          narrativeRef.current = appendCoachUtterance(
            narrativeRef.current,
            comment,
          );
        }
        maybeSpeakRef.current(comment, "normal");
      };

      if (!coachLoadedRef.current) {
        emit(fallback);
        return;
      }

      // Capture a token so a late reply is dropped if the session ends
      // OR restarts mid-LLM-call — otherwise a just-ended session would
      // still push a line into the next session's feed.
      const token = createSessionToken(sessionIdRef, activeRef);
      coachGenerate("drill", buildAdaptiveCommentPrompt(req))
        .then((response) => {
          if (cancelled || token.isStaleOrInactive()) return;
          const comment = isUsableComment(response) ? response.trim() : fallback;
          if (comment !== fallback) {
            // Prime the similarity ring so the next template pick
            // doesn't echo what the model just said.
            recordUtterance(shuffleStateRef.current, comment);
          }
          emit(comment);
        })
        .catch(() => {
          if (cancelled || token.isStaleOrInactive()) return;
          emit(fallback);
        });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // `maybeSpeak` is routed via `maybeSpeakRef` so voiceMode toggles
    // don't churn this listener subscription.
  }, [active]);

  // ── D4 Signal A — settings change detection (debounced) ──────────
  // Fires a FORCED gatekeeper event (`boundary_signal_a`) when the
  // player changes BPM, preset, time signature, or instrument
  // mid-session. Forced events bypass cooldowns and the streak
  // suppression — the coach "always has something to say" when the
  // config changes, per plan. Also notifies the Rust analyzer so the
  // open segment closes cleanly (no `practice-segment-ended` event:
  // SettingsChange goes via this Signal A path, not Signal B).
  //
  // Debounced: each change resets a timer; the gatekeeper only fires
  // once the user settles (no further changes for BOUNDARY_DEBOUNCE_MS).
  // This collapses a burst of -5/+5 BPM clicks into a single boundary
  // event describing the NET change ("tempo down to 105 BPM") rather
  // than spamming the feed with one card + one TTS per click.
  useEffect(() => {
    if (!active) {
      // Sync refs while inactive so a config change before
      // session-start doesn't trigger a phantom event on the first
      // tick of the next session.
      prevBpmRef.current = bpm;
      prevPresetIdRef.current = presetId;
      prevTimeSignatureRef.current = timeSignature;
      prevMeterKeyRef.current = meterId;
      prevInstrumentRef.current = instrument;
      return;
    }

    // Compute net changes from last-committed state to current props.
    // Note: we DO NOT commit prev*Ref here — that happens in the timer
    // callback so rapid changes coalesce into a single boundary event.
    const changes: { kind: string; from: string | number; to: string | number }[] = [];
    if (prevBpmRef.current !== bpm) {
      changes.push({
        kind: bpm > prevBpmRef.current ? "bpm-up" : "bpm-down",
        from: prevBpmRef.current,
        to: bpm,
      });
    }
    if (prevPresetIdRef.current !== presetId) {
      changes.push({
        kind: "preset",
        from: prevPresetIdRef.current ?? "free play",
        to: presetName ?? presetId ?? "free play",
      });
    }
    if (prevTimeSignatureRef.current !== timeSignature) {
      changes.push({
        kind: "time-sig",
        from: prevTimeSignatureRef.current,
        to: timeSignature,
      });
    } else if (prevMeterKeyRef.current !== meterId) {
      // Same bar length, different accent grouping — a real change the
      // player hears, invisible to `timeSignature`.
      changes.push({
        kind: "grouping",
        from: prevMeterKeyRef.current,
        to: meterId,
      });
    }
    if (prevInstrumentRef.current !== instrument) {
      changes.push({
        kind: "instrument",
        from: prevInstrumentRef.current,
        to: instrument,
      });
    }
    if (changes.length === 0) return;

    // Debounce window — long enough to absorb rapid -5/+5 button mashing
    // (~150-250ms click cadence) but short enough to feel responsive.
    const BOUNDARY_DEBOUNCE_MS = 600;
    // Snapshot current values into the closure so the timer fires with
    // exactly the state observed when it was scheduled. Subsequent
    // changes cancel + reschedule via the cleanup below, so closure
    // staleness is not a concern.
    const snapshot = { bpm, presetId, presetName, timeSignature, meterId, instrument };
    const timerId = window.setTimeout(() => {
      boundaryDebounceRef.current = null;

      // Collapse to a single forced event using the most "salient"
      // change. BPM beats preset beats time-sig beats instrument when
      // multiple shift inside one debounce window (e.g. preset apply
      // bumps both BPM and time-sig). The remaining changes are still
      // surfaced through `{change}` copy below.
      const priority = ["bpm-up", "bpm-down", "preset", "time-sig", "grouping", "instrument"];
      changes.sort((a, b) => priority.indexOf(a.kind) - priority.indexOf(b.kind));
      const primary = changes[0];
      const changeText = changes.map(formatChangeCopy).join("; ");

      // Commit the new committed-state BEFORE firing the gatekeeper
      // so any cascading effect re-runs see the post-commit state.
      const presetChanged = changes.some((c) => c.kind === "preset");
      prevBpmRef.current = snapshot.bpm;
      prevPresetIdRef.current = snapshot.presetId;
      prevTimeSignatureRef.current = snapshot.timeSignature;
      prevMeterKeyRef.current = snapshot.meterId;
      prevInstrumentRef.current = snapshot.instrument;

      // C1 narrative: log the preset change so the LLM sees the new
      // exercise when rephrasing the next mini-report. We append BEFORE
      // the gatekeeper / TTS path so any utterance prompts that consult
      // the narrative see the new preset name as fresh context.
      if (presetChanged && narrativeRef.current) {
        narrativeRef.current = appendPresetChange(
          narrativeRef.current,
          snapshot.presetName ?? snapshot.presetId ?? "free play",
        );
      }

      // C1 narrative: log instrument switches the same way preset
      // changes are logged. Plan §"Mid-session instrument switch"
      // calls for the coach to briefly acknowledge "Switched to piano —
      // different vocabulary now." The narrative line gives the LLM
      // that context for the next utterance and feeds the rephraser
      // when scenarios fire in the new vocabulary.
      const instrumentChanged = changes.some((c) => c.kind === "instrument");
      if (instrumentChanged && narrativeRef.current) {
        narrativeRef.current = appendInstrumentChange(
          narrativeRef.current,
          snapshot.instrument,
        );
      }

      // Notify the Rust analyzer to close its open segment cleanly.
      // Fire-and-forget — failure to notify (e.g. evaluation not
      // running) is harmless. The JS side still speaks the boundary.
      notifySettingsChange().catch(() => {});

      const gk = gatekeeperRef.current;
      if (!gk) return; // session not fully wired yet

      const { state: nextState, event } = gatekeeperEvaluate(gk, {
        now: Date.now(),
        bpm: snapshot.bpm,
        window: realtimeWindowRef.current,
        beatsInSegment: beatsInSegmentRef.current,
        force: {
          scenario: "boundary_signal_a",
          context: {
            kind: primary.kind,
            from: String(primary.from),
            to: String(primary.to),
            change: changeText,
          },
        },
      });
      gatekeeperRef.current = nextState;
      // Signal A closes the previous segment and opens a new one.
      // Reset the first-4-beats counter so the new segment's early
      // observational events get suppressed per the plan's hard TTS rule.
      beatsInSegmentRef.current = 0;
      if (!event) return;

      const severity = severityForEvent(event);
      const template = pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
        vocab,
        scenario: event.scenario,
        severity,
        context: event.context,
      });
      if (!template) return;

      const msgId = crypto.randomUUID();
      const msg: FeedMessage = {
        id: msgId,
        type: "coach-tip",
        timestamp: Date.now(),
        content: template,
        urgency: "urgent",
        pending: voiceMode === "voice",
      };
      setMessages((prev) => [...prev, msg]);
      if (narrativeRef.current) {
        narrativeRef.current = appendCoachUtterance(narrativeRef.current, template);
      }
      // Signal A is always-spoken (per plan + gatekeeper ALWAYS_SPOKEN).
      speakAndReveal(msgId, template, "urgent");
    }, BOUNDARY_DEBOUNCE_MS);
    boundaryDebounceRef.current = timerId;

    // Cleanup: every effect re-run (= a newer change arrived) and
    // unmount cancels the pending timer. This is what gives us the
    // debouncing behavior — each new click extends the window.
    return () => {
      if (boundaryDebounceRef.current !== null) {
        clearTimeout(boundaryDebounceRef.current);
        boundaryDebounceRef.current = null;
      }
    };
  }, [active, bpm, presetId, presetName, timeSignature, meterId, instrument, vocab, maybeSpeak, voiceMode, speakAndReveal]);

  // ── D4 Signal B extension — grid-discontinuity coaching ──────────
  // Rust emits `practice-segment-ended` with endReason "grid-discontinuity"
  // when the player sustains low grid-correlation while still playing
  // (distinct from activity-gap / user-stopped). Force the coach to
  // acknowledge it — bypasses cooldowns, same as ramp_complete / Signal A.
  useEffect(() => {
    if (!active) return;
    let unlisten: (() => void) | null = null;
    onPracticeSegmentEnded((payload) => {
      if (payload.endReason !== "grid-discontinuity") return;
      if (!activeRef.current) return;
      // Warmup guard — the Rust grid-correlation detector can fire within
      // the first few beats when the player hasn't started yet (correlation
      // is 0 with no onsets). Require at least 8 beats so the coach never
      // calls out a "dropped correlation" before the player has had a chance
      // to play. 8 beats ≈ 6.8 s at 70 BPM, 4 s at 120 BPM.
      if (payload.beatCount < 8) return;
      const gk = gatekeeperRef.current;
      if (!gk) return;
      const now = Date.now();
      const { state: nextState, event } = gatekeeperEvaluate(gk, {
        now,
        bpm: payload.bpm,
        window: realtimeWindowRef.current,
        beatsInSegment: beatsInSegmentRef.current,
        verbosity: coachVerbosity,
        force: {
          scenario: "grid_discontinuity",
          context: { score: Math.round(payload.score), bpm: payload.bpm },
        },
      });
      gatekeeperRef.current = nextState;
      if (!event) return;
      const template = pickTemplate(TEMPLATE_CATALOG, shuffleStateRef.current, {
        vocab: vocabRef.current,
        scenario: "grid_discontinuity",
        severity: "neutral",
        context: { score: Math.round(payload.score), bpm: payload.bpm },
      });
      if (!template) return;
      const msgId = crypto.randomUUID();
      const msg: FeedMessage = {
        id: msgId,
        type: "coach-tip",
        timestamp: now,
        content: template,
        urgency: "normal",
        pending: voiceMode === "voice",
      };
      setMessages((prev) => [...prev, msg]);
      if (narrativeRef.current) {
        narrativeRef.current = appendCoachUtterance(narrativeRef.current, template);
      }
      speakAndReveal(msgId, template, "normal");
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [active]);

  const startSession = useCallback(async () => {
    if (active) {
      coachDebug("startSession.noop-already-active");
      return;
    }
    coachDebug("startSession", { bpm, presetId, presetName, timeSignature, instrument });

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
    setActive(true);
    setStartedAt(now);
    setCardOpen(true);

    // Clear the feed synchronously BEFORE awaiting history. Without this,
    // any messages from a prior session stay visible for up to 500ms
    // while `loadHistoryWithBudget` races, producing a "stale state" flash
    // where the user sees the previous session's tips and session-end card
    // even though they just clicked Start on a new session.
    setMessages([]);

    // Clear backend session data in background — don't block UI
    clearSession().catch(() => {});

    // THE load point. The brain is resident only while somebody is
    // practising, so this is where it comes into memory — not at mount,
    // and not when the weights finish downloading. `ensureCoachLoaded`
    // dedupes concurrent callers and cancels any armed idle unload; the
    // Rust command is idempotent for the same weights and reloads only
    // when the file on disk has actually changed (path + size + mtime),
    // which is what makes an "Update brain" take effect on the next
    // session without ever tearing down a healthy worker.
    //
    // Skipped entirely when the user has the brain switched off: that
    // setting means "no model", and loading one anyway would be both a
    // 4 GB surprise and a lie about what the app is doing.
    if (brainTier !== "off") {
      ensureCoachLoaded().then((ok) => {
        coachLoadedRef.current = ok;
      });
    }

    // ── C2: Context-Aware Greetings ────────────────────────────
    // Race session-history loading against a 500ms budget. If history
    // arrives in time we pick from the 4-tier hierarchy; if not, we
    // ship the tier-4 ("cold") greeting and DO NOT replace it once
    // history finally arrives (avoids "greeting flicker" bug).
    const greetingId = crypto.randomUUID();
    const history = await loadHistoryWithBudget(() => getSessionHistory());

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
    seedRealtimeTips(presetId, presetName, history);

    const greeting = renderGreeting({
      presetId,
      presetName,
      bpm: playBpmRef.current,
      history,
      now,
    });

    // ── C1: Seed session narrative ────────────────────────────
    // Compact 2KB running log of the session arc. Prefer a real
    // prior-session summary when history is available; falls back to
    // a generic note. The seed line is always preserved across
    // truncation per the plan.
    const priorSummary = buildPriorSummary(history, presetId, presetName);
    narrativeRef.current = createNarrative({
      bpm: playBpmRef.current,
      presetId,
      presetName,
      priorSummary,
      instrument: instrumentLabel,
      now,
    });

    setMessages([{
      id: greetingId,
      type: "session-start",
      timestamp: now,
      content: greeting.text,
      // Spinner-until-audio: hide the text until the matching
      // `tts-speech-started` event fires (or until `speakAndReveal`
      // safety-net force-reveals). Without this the user reads the
      // greeting seconds before they hear it — see the comment on
      // `speakAndReveal`.
      pending: true,
    }]);

    // Defer TTS until we know whether the LLM is going to rephrase the
    // greeting — otherwise we'd speak the template, then speak the
    // rephrased version a moment later, and the user hears the
    // greeting twice. When no LLM is loaded, speak the template right
    // away since it's all we'll get; the spinner reveals in lockstep
    // with the audio.
    if (!coachLoadedRef.current) {
      speakAndReveal(greetingId, greeting.text);
    }

    // Record the greeting as the first coach utterance in the narrative.
    if (narrativeRef.current) {
      narrativeRef.current = appendCoachUtterance(
        narrativeRef.current,
        greeting.text,
        now,
      );
    }

    if (!evaluation.enabled) {
      evaluation.toggle();
    }

    // LLM paraphrase path — the coach LLM (when available) gets the
    // already-filled template + structured context and is asked to
    // rephrase for variety while preserving every number. The plan
    // calls this "LLM as paraphraser, never deciding what to say."
    // If the model is unavailable or times out, the template greeting
    // above ships as-is and is spoken via the fallback branches below.
    if (coachLoadedRef.current) {
      const token = createSessionToken(sessionIdRef, activeRef);
      const tierGreeting = greeting; // capture for the closure
      (async () => {
        try {
          // Tier-1 paraphrase keeps the rich structured context so the
          // LLM has the same numbers to anchor on. Lower tiers feed a
          // minimal hint.
          let context: string;
          if (tierGreeting.tier === "preset-with-history") {
            context = `Rephrase this practice-coach greeting for a player of ${instrumentLabel} starting a session. Preserve every number and the preset name exactly. Keep it to 1-2 sentences, warm but specific.\n\nOriginal: "${tierGreeting.text}"\n\nStructured facts (do NOT add new ones):\n${JSON.stringify(tierGreeting.context, null, 2)}`;
          } else {
            context = `Rephrase this practice-coach greeting for a player of ${instrumentLabel}. Preserve every number; keep it warm and short (1-2 sentences).\n\nOriginal: "${tierGreeting.text}"`;
          }
          const rephrased = await coachGenerate("greeting", context);
          if (token.isStaleOrInactive()) return;
          if (!rephrased || !rephrased.trim()) {
            // LLM returned nothing useful — fall back to speaking the
            // template greeting we've already shown in the feed. The
            // message stays `pending: true` until the audio starts.
            speakAndRevealRef.current(greetingId, tierGreeting.text);
            return;
          }
          setMessages((prev) => prev.map((m) =>
            m.id === greetingId ? { ...m, content: rephrased } : m
          ));
          speakAndRevealRef.current(greetingId, rephrased);
          // Replace the template coach utterance with the LLM rephrase
          // so downstream LLM calls see the actual greeting the user heard.
          if (narrativeRef.current) {
            narrativeRef.current = appendCoachUtterance(
              narrativeRef.current,
              rephrased,
            );
          }
        } catch {
          // LLM errored — fall back to the template greeting, but only
          // if the session is still live (same sid AND still active).
          if (!token.isStaleOrInactive()) {
            speakAndRevealRef.current(greetingId, tierGreeting.text);
          }
        }
      })();
    }
  }, [active, evaluation, presetId, presetName, maybeSpeak, instrumentLabel, speakAndReveal, brainTier]);

  const endSession = useCallback(async () => {
    if (!active) {
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
    // evaluation.toggle() below (lines ~1319-1321) still runs to update
    // React state; calling stop_evaluation twice is idempotent — the
    // Rust command returns early if the analyzer is already stopped.
    if (evaluation.enabled) {
      try {
        await stopEvaluation();
      } catch (e) {
        // stopEvaluation failing should never strand the session in active
        // state. Log the error for diagnosis (e.g. "Lock failed: poisoned"
        // from a timing-thread panic cascade) and continue the end flow.
        console.error("[endSession] stopEvaluation failed:", e);
      }
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
    const endMsgId = crypto.randomUUID();
    const placeholderComment = sessionReport ? "Session complete." : "Session ended — no data recorded.";
    // Only mark pending when we know an LLM summary will be generated
    // AND voice mode is on — otherwise the placeholder text is the
    // final text and there's no spinner-to-text swap to do. The actual
    // LLM rephrase path below converts the message to its final form
    // and calls speakAndReveal in the same tick.
    // A summary is generated whenever there's a report — `coach_generate`
    // falls back to the Rust session-summary template when no model is
    // resident, so this no longer keys off `coachLoadedRef`.
    const willSpeakSummary = !!sessionReport && voiceMode === "voice";
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
    setMessages((prev) => [...prev, endMsg]);

    if (evaluation.enabled) {
      evaluation.toggle();
    }
    segmentReportsRef.current = [];
    setActive(false);
    setStartedAt(null);

    // Save session — same gate as segment reportability. A session
    // that aggregates to 0 real hits is noise (mic dropouts, accidental
    // session start, etc.) and shouldn't pollute history.
    if (sessionReport && isSegmentReportable(sessionReport)) {
      saveSession({
        id: crypto.randomUUID(),
        timestamp: startedAt ?? now,
        bpm,
        timeSignature,
        report: sessionReport,
        presetId: presetId,
        presetName: presetName,
        segments: miniReportSegments.length > 0 ? miniReportSegments : undefined,
      }).catch(() => {});
    }

    // Generate coach summary in the background, then patch the message.
    // Deliberately NOT gated on `coachLoadedRef`: without a resident
    // model `coach_generate` returns the Rust `format_session_summary`
    // template, which is the only session wrap-up a template-mode user
    // ever gets. Gating here would leave them staring at the bare
    // "Session complete." placeholder.
    if (sessionReport) {
      // Capture a token so we can drop the result if the user starts
      // a NEW session before the LLM call resolves. Without this guard,
      // the old session's spoken summary leaks into the next session
      // via maybeSpeak() and any narrative updates pollute the fresh
      // narrative. NOTE: unlike every other site that uses
      // `isStaleOrInactive()`, this path INTENDS to fire post-end (to
      // patch the placeholder summary), so it deliberately uses the
      // sid-only `isStale()` check — `activeRef` is already false here.
      const token = createSessionToken(sessionIdRef);
      const durationSecs = Math.round((now - (startedAt ?? now)) / 1000);
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
    // Arm the idle unload: if no new session starts within
    // COACH_IDLE_UNLOAD_MS the worker is dropped and its RAM returned.
    // Cancelled by the next `ensureCoachLoaded()`.
    scheduleCoachIdleUnload();

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
  }, [active, evaluation, bpm, timeSignature, startedAt, presetId, presetName, maybeSpeak, instrumentLabel]);

  // Chat: send a user question to the coach
  const sendChat = useCallback((question: string) => {
    if (!question.trim()) return;

    // Add user message to feed immediately
    const userMsg: FeedMessage = {
      id: crypto.randomUUID(),
      type: "user-chat",
      timestamp: Date.now(),
      content: question,
    };
    setMessages((prev) => [...prev, userMsg]);

    // Log the user's question in the narrative so the coach LLM sees
    // recent chat turns inline with the session arc.
    if (narrativeRef.current) {
      narrativeRef.current = appendUserAction(
        narrativeRef.current,
        `User asked: "${question.trim()}"`,
      );
    }

    // C4 cooldown reset — user engagement signal. The plan calls for
    // a clean cooldown slate when the player types because they've
    // told us they're listening. Trend confirmations and bestStreak
    // are preserved.
    if (gatekeeperRef.current) {
      gatekeeperRef.current = resetCooldowns(
        gatekeeperRef.current,
        Date.now(),
      );
    }

    // Capture a token so the reply is dropped if the user starts a new
    // session before the LLM responds (sid bump) OR ends the session
    // without restarting (activeRef flip). Without either guard, the
    // answer to the OLD session's question would land in a new/ended
    // feed (and be spoken aloud over silence or a fresh greeting).
    const token = createSessionToken(sessionIdRef, activeRef);

    // Generate reply in background
    (async () => {
      const segments = segmentReportsRef.current;
      const aggregated = segments.length > 0 ? aggregateReports(segments.map(s => s.report)) : null;
      // Scored-beat denominator (not totalBeats) — same denominator as
      // the Rust score and every other accuracy surface. See
      // `src/coach/reportStats.ts` for the regression history.
      const accuracy = aggregated ? accuracyPct(aggregated) : 0;
      // v0.10: dropped `Grade:` from the chat session context. The UI
      // no longer surfaces letter grades, so feeding them to the LLM
      // just nudges it toward grade-flavoured language ("Tough
      // session", "rough patch") which contradicts the warmer framing
      // we're going for. Score (0-100) carries the same signal.
      const sessionData = aggregated
        ? `BPM: ${bpm}, Accuracy: ${accuracy}%, Score: ${aggregated.score}, Avg deviation: ${aggregated.meanDeviationMs.toFixed(1)}ms, Streak: ${aggregated.longestStreak}`
        : "No session data yet.";

      let reply = "I don't have enough session data to answer that yet. Start playing and I'll have more to work with!";
      try {
        let historyContext = "";
        if (presetId) {
          try {
            const history = await getSessionHistory();
            const summary = summarizePreset(presetId, presetName, history);
            if (summary.sessionCount > 0) {
              const issues = detectRecurringIssues(summary);
              const stamina = detectStaminaPattern(history, presetId);
              historyContext =
                "\n" +
                formatPresetSummaryForLLM(summary, { ...issues, stamina }) +
                "\n";
            }
          } catch { /* skip history */ }
        }

        const recentMsgs = messagesRef.current.slice(-6);
        const conversationContext = recentMsgs.length > 0
          ? "\nConversation so far:\n" + recentMsgs.map((m) =>
              m.type === "user-chat" ? `User: ${m.content}` : `Coach: ${m.content}`
            ).join("\n") + "\n"
          : "";

        const narrativeBlock = narrativeRef.current
          ? `\n${formatForLLM(narrativeRef.current)}\n`
          : "";

        const context = `Current session data:\n${sessionData}\nInstrument: ${instrumentLabel}${historyContext}${narrativeBlock}${conversationContext}\nUser asks: ${question}\nAnswer concisely based only on the data above.`;
        const answer = (await coachGenerate("chat", context))?.trim();
        // Empty answer → keep the "not enough data yet" line above
        // rather than showing the user a blank chat bubble.
        if (answer) reply = answer;
      } catch { /* use fallback */ }

      // Drop stale chat replies — either the user is in a new session
      // (sid bump, answer was generated against OLD context) or they
      // ended without restarting (speaking the reply after the
      // session-end card landed would be jarring).
      if (token.isStaleOrInactive()) {
        coachDebug("chat.discard-stale-or-inactive", { capturedAt: token.capturedAt, current: sessionIdRef.current, active: activeRef.current });
        return;
      }

      const replyId = crypto.randomUUID();
      const replyMsg: FeedMessage = {
        id: replyId,
        type: "coach-chat",
        timestamp: Date.now(),
        content: reply,
        // Hide chat replies behind a spinner until voice arrives so
        // the user doesn't read the answer seconds before they hear
        // it. When voice mode is off, speakAndReveal force-reveals
        // immediately.
        pending: voiceMode === "voice",
      };
      setMessages((prev) => [...prev, replyMsg]);
      if (narrativeRef.current) {
        narrativeRef.current = appendCoachUtterance(
          narrativeRef.current,
          reply,
        );
      }
      speakAndRevealRef.current(replyId, reply);
    })();
  }, [bpm, presetId, presetName, maybeSpeak, instrumentLabel, voiceMode]);

  /**
   * Phase 5 — route a chip tap (or its follow-up affordance) into the feed.
   *
   * Three actions are supported:
   *   - `answer`: appends a user-chat bubble (the chip label, so the
   *     transcript reads naturally) and a coach-chat bubble (the
   *     pre-resolved answer text). For LLM chips (`answer === null`)
   *     the chip is routed into the existing chat pipeline so the
   *     model gets to handle it.
   *   - `set-bpm`: applies a delta to the current BPM via the optional
   *     `setBpm` callback (no-op when not wired). The delta is clamped
   *     to the metronome's safe range to mirror chip rendering.
   *   - `open-chat`: focuses the input via the registered callback so
   *     the user can type a free-form question.
   *
   * The chip pathway is the ONLY way LLM chips reach `sendChat` — the
   * pre-built `chip.label` becomes the user's "question" so the model
   * sees what the user actually clicked.
   */
  const handleChipAction = useCallback((action: {
    kind: "answer" | "set-bpm" | "open-chat" | "take-break" | "clear-calibration" | "dismiss-affordance";
    messageId?: string;
    chip?: FeedChip;
    bpmDelta?: number;
    durationMs?: number;
  }) => {
    switch (action.kind) {
      case "answer": {
        const chip = action.chip;
        if (!chip) return;
        // User-chat bubble first so the transcript reads naturally.
        const userMsg: FeedMessage = {
          id: crypto.randomUUID(),
          type: "user-chat",
          timestamp: Date.now(),
          content: chip.label,
        };
        setMessages((prev) => [...prev, userMsg]);
        if (narrativeRef.current) {
          narrativeRef.current = appendUserAction(
            narrativeRef.current,
            `User tapped: "${chip.label}"`,
          );
        }
        if (chip.answer != null) {
          // Canned / template-fill — answer was resolved at chip
          // selection time. Land it immediately, but spin until voice
          // arrives so the text doesn't beat the audio.
          const coachMsgId = crypto.randomUUID();
          const coachMsg: FeedMessage = {
            id: coachMsgId,
            type: "coach-chat",
            timestamp: Date.now(),
            content: chip.answer,
            pending: voiceMode === "voice",
          };
          setMessages((prev) => [...prev, coachMsg]);
          if (narrativeRef.current) {
            narrativeRef.current = appendCoachUtterance(
              narrativeRef.current,
              chip.answer,
            );
          }
          speakAndRevealRef.current(coachMsgId, chip.answer, "normal");
        } else {
          // LLM pathway — fall through to the chat pipeline so the
          // model can handle the chip label as a question.
          sendChatRef.current?.(chip.label);
        }
        break;
      }
      case "set-bpm": {
        const delta = action.bpmDelta ?? 0;
        if (delta === 0 || !setBpm) return;
        const next = Math.max(20, Math.min(300, bpm + delta));
        setBpm(next);
        // Resolving an affordance hides the buttons but leaves the
        // tip text in place. The intervention's rate-cap entry was
        // already committed when the tip emitted, so accepting OR
        // dismissing both just close the buttons.
        if (action.messageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === action.messageId ? { ...m, affordanceResolved: true } : m,
            ),
          );
        }
        break;
      }
      case "take-break": {
        // For now, just resolve the affordance and log a coach
        // utterance. The actual "30s rest timer" UX is a follow-up —
        // wiring playback control through the session hook would
        // require threading another callback, which we defer. The
        // intervention text itself ("12 minutes in — pause for 30
        // seconds?") is already in the feed and gives the player the
        // intent; the affordance buttons go away on tap.
        if (action.messageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === action.messageId ? { ...m, affordanceResolved: true } : m,
            ),
          );
        }
        break;
      }
      case "clear-calibration": {
        // Plan §"Initial 10" #6 — Calibration retry. Fired by the
        // `calibration-retry` intervention on `low_confidence`. Clears
        // the per-instrument cache entry so the next session's timing
        // analyzer re-learns the offset from real onsets instead of
        // re-seeding the bad value. Best-effort: if the cache call
        // throws (e.g. IPC race during session-end), still close the
        // affordance — the user already declared intent.
        clearCalibrationCacheEntry(instrument, evaluation.selectedDevice ?? null)
          .catch(() => {
            // swallow — affordance still resolves
          });
        if (action.messageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === action.messageId ? { ...m, affordanceResolved: true } : m,
            ),
          );
        }
        break;
      }
      case "dismiss-affordance": {
        if (action.messageId) {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === action.messageId ? { ...m, affordanceResolved: true } : m,
            ),
          );
        }
        break;
      }
      case "open-chat": {
        chatInputFocusRef.current?.();
        break;
      }
    }
  }, [bpm, setBpm, maybeSpeak, instrument, evaluation.selectedDevice, voiceMode]);

  // `sendChatRef` lets `handleChipAction` reach `sendChat` without
  // declaring a circular `useCallback` dependency (handleChipAction →
  // sendChat → handleChipAction). The ref is patched on every render
  // below.
  const sendChatRef = useRef<((q: string) => void) | null>(null);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  const toggleCard = useCallback(() => {
    setCardOpen((v) => !v);
  }, []);

  // Keep the chat-send ref in sync so chip LLM actions can route into
  // it without forcing a circular hook dependency.
  useEffect(() => {
    sendChatRef.current = sendChat;
  }, [sendChat]);

  return {
    active,
    messages,
    startedAt,
    cardOpen,
    startSession,
    endSession,
    sendChat,
    clearMessages,
    toggleCard,
    handleChipAction,
    registerChatFocus,
    /** Step 5 — current play style, updated each mini-report. */
    playMode,
  };
}

/**
 * Phase 5 — derive a rough "current score" from the recent beat
 * feedback window. This is intentionally a coarse approximation —
 * the canonical score comes from `getSessionReport()` (Rust side),
 * but that's only available after a segment ends. For mid-segment
 * intervention checks we use the in-flight feedback window: roughly
 * the proportion of "perfect" + "good" hits, scaled to 0–100.
 *
 * Returning 0 when the window is empty is correct — without data,
 * intervention predicates fall through (e.g. BPM-drop requires score
 * < 70 so an empty-window 0 would qualify; we guard against this at
 * the call site by ALSO requiring `segments_completed >= 1` before
 * BPM-drop fires).
 */
function latestScoreFromWindow(window: BeatFeedback[]): number {
  if (window.length === 0) return 0;
  const weight = (c: BeatFeedback["classification"]) =>
    c === "perfect" ? 100 : c === "good" ? 80 : c === "ok" ? 50 : 0;
  const total = window.reduce((sum, fb) => sum + weight(fb.classification), 0);
  return Math.round(total / window.length);
}

/**
 * Phase 5 — adapter from the gatekeeper event + live session state to
 * the intervention selector. Kept thin: pure data assembly + delegate.
 *
 * The intervention layer is strictly additive — when it returns null
 * the gatekeeper's template ships unchanged. When it returns a
 * `SelectedIntervention` the caller replaces the template copy and
 * attaches the affordance.
 */
function pickInterventionForEvent(
  event: import("../coach/gatekeeper").GatekeeperEvent,
  bpm: number,
  score: number,
  sessionStartMs: number,
  segmentsCompleted: number,
  state: InterventionRateState,
): SelectedIntervention | null {
  const now = Date.now();
  const ctx: InterventionContext = {
    bpm,
    score,
    sessionDurationMs: Math.max(0, now - sessionStartMs),
    segmentsCompleted,
  };
  return pickIntervention(event, ctx, state, now);
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
  // surfaces letter grades (see `CoachFeedMessage.tsx` rationale) so
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
  if (presetId) {
    const summary = summarizePreset(presetId, presetName, history);
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

/**
 * Map a gatekeeper event to one of the three template severities.
 *
 * Heuristic per the plan's "voice rules":
 *   - Always-positive scenarios (personal best, recovery, milestones,
 *     new band locked) → `encouragement`.
 *   - Always-corrective scenarios (accuracy drop, fatigue) →
 *     `correction`.
 *   - Trend scenarios graduate: `neutral` while still being confirmed
 *     in the written channel, `correction` once the gatekeeper has
 *     promoted them to spoken (two consecutive confirmations).
 *   - Everything else → `neutral`.
 *
 * Kept inline so changes to scenario→severity mapping live next to
 * the wiring point rather than in a deep module.
 */
function severityForEvent(event: GatekeeperEvent): Severity {
  switch (event.scenario) {
    case "personal_best_streak":
    case "recovery":
    case "recovery_confirmed":
    case "tempo_milestone":
    case "new_band_locked":
      return "encouragement";
    case "accuracy_drop":
    case "fatigue":
      return "correction";
    case "bias_only":
      return "neutral";
    case "rushing_trend":
    case "dragging_trend":
      return event.tier === "spoken" ? "correction" : "neutral";
    case "low_confidence":
    case "check_in":
    case "boundary_signal_a":
    case "boundary_signal_b":
    default:
      return "neutral";
  }
}

/**
 * Build the LLM rephrase prompt. The model never decides WHAT to say
 * — it only rephrases the filled template for variety, preserving
 * every number and the scenario's intent.
 *
 * NOTE: We deliberately do NOT pass the structured `context` JSON to
 * the model. Local LLMs ignore key names and grab the most prominent
 * number — e.g. `{"priorOffsetMs": 0}` got interpreted as "0%
 * accuracy" and rephrased into a hallucinated "Rough patch at 0% —
 * ease the tempo down a touch and rebuild from a clean bar." The
 * template already contains every number the player needs; feeding
 * the model fewer signals = fewer ways for it to invent things.
 *
 * The narrative block is kept because it's free-form prose the model
 * can use for context-aware phrasing (e.g. acknowledging a previous
 * segment), and it doesn't carry stray ambiguous numbers.
 */
function buildRephrasePrompt(args: {
  template: string;
  scenario: ScenarioTag;
  /**
   * Deliberately unused at the moment — see the function doc comment.
   * Kept in the type so callers (and future iterations of this
   * function) don't have to thread the value through again if we
   * decide to re-introduce it via a safer formatting strategy.
   */
  context?: Record<string, number | string | boolean>;
  instrumentLabel: string;
  narrativeBlock: string;
  /**
   * The newest-last list of the most recent utterances the coach has
   * shipped this session (across all scenarios). Passed straight to
   * the LLM as an "avoid these phrasings" block so the model can
   * actively diverge from anything it (or the template fallback)
   * just emitted — addresses player feedback that even when the LLM
   * does run, it tends to settle into the same paraphrases. The
   * caller should pass at most ~3 entries; the prompt is short
   * enough that more dilutes the rephrase task.
   */
  recentUtterances?: string[];
}): string {
  // 2026-05-18 — prompt was loosened from
  //
  //     "Preserve EVERY number from the original exactly. DO NOT invent
  //      new percentages, facts, or advice. If you cannot rephrase
  //      while preserving every number, return the original verbatim."
  //
  // That phrasing was so strict the model often returned the original
  // verbatim, producing the "I keep getting the same sentences"
  // feedback. The numbers DO need to be preserved (mid-session tips
  // refer to "20ms behind" or "85% accuracy" — paraphrasing those
  // would silently mislead the player), but the rest of the sentence
  // should breathe. The new copy locks the numbers AND
  // instrument-specific words (so "snare" doesn't become "drum"),
  // explicitly invites variation in structure / length / tone, and —
  // critically — passes the last few utterances so the model has
  // concrete anti-repetition pressure.
  const lines: string[] = [
    `Rephrase this practice-coach observation for a player of ${args.instrumentLabel}.`,
    `Scenario: ${args.scenario}. Keep it 1 sentence, conversational, instrument-appropriate.`,
    `Keep all numbers and instrument-specific words. Otherwise rewrite freely in your own voice — vary sentence structure, length, and tone. Do NOT invent new facts or percentages.`,
  ];
  // Anti-repetition block: only inject when we actually have prior
  // utterances to avoid, otherwise the model would interpret an
  // empty "avoid these" list as a no-op suggestion to repeat itself.
  if (args.recentUtterances && args.recentUtterances.length > 0) {
    lines.push(``);
    lines.push(`Avoid these phrasings you just used (do not echo them):`);
    for (const u of args.recentUtterances) {
      lines.push(`- "${u}"`);
    }
  }
  lines.push(``);
  lines.push(`Original: "${args.template}"`);
  lines.push(args.narrativeBlock);
  return lines.join("\n");
}

/**
 * D4 Signal A — render a Signal-A change description used in the
 * `{change}` template placeholder. Kept human-readable: the coach
 * voice speaks the result verbatim, e.g. "tempo up to 140 BPM" or
 * "loading Practice Riff #3". Falls back to a generic "config
 * changed" for unrecognised kinds so the template still resolves.
 */
function formatChangeCopy(c: { kind: string; from: string | number; to: string | number }): string {
  switch (c.kind) {
    case "bpm-up":
      return `tempo up to ${c.to} BPM`;
    case "bpm-down":
      return `tempo down to ${c.to} BPM`;
    case "preset":
      return c.to === "free play" ? "preset cleared" : `loading "${c.to}"`;
    case "time-sig":
      return `time signature ${c.to}/4`;
    case "grouping":
      return `regrouped to ${String(c.to).split(",").join(" + ")}`;
    case "instrument":
      return `switching to ${c.to}`;
    default:
      return "config changed";
  }
}
