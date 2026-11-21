import { useState, useEffect, useRef, useCallback } from "react";
import { coachGenerate, ttsSpeak, onBeatFeedback, onAdaptiveEval, notifySettingsChange, clearCalibrationCacheEntry, onTtsSpeechStarted, onPracticeSegmentEnded } from "../ipc";
import type { AdaptiveEvalRequest } from "../ipc";
import type { BeatFeedback, BrainTier, FeedChip, FeedMessage } from "../types";
import type { useEvaluation } from "./useEvaluation";
import {
  coachLoadPending,
  coachResident,
} from "./coachLoader";
import { safeRephrase } from "../coach/rephraseGuard";
import {
  appendCoachUtterance,
  appendInstrumentChange,
  appendPresetChange,
  appendUserAction,
  formatForLLM,
  type Narrative,
} from "../coach/narrative";
import {
  evaluate as gatekeeperEvaluate,
  shouldDropForStaleness,
  type GatekeeperEvent,
  type GatekeeperContext,
  type GatekeeperState,
  type ScenarioTag,
} from "../coach/gatekeeper";
import {
  createShuffleState,
  pickTemplate,
  pickTemplateForSeverities,
  recordUtterance,
  type ShuffleState,
  type Vocabulary,
} from "../coach/templates";
import { severityPlan, type CoachStance } from "../coach/learningMode";
import { TEMPLATE_CATALOG } from "../coach/templateCatalog";
import {
  adaptiveScenario,
  buildAdaptiveCommentPrompt,
  isUsableComment,
} from "../coach/adaptiveComment";
import {
  createInterventionState,
  pickIntervention,
  recordIntervention,
  type InterventionContext,
  type InterventionRateState,
  type SelectedIntervention,
} from "../coach/interventions";
import { computeRecentHitCompleteness } from "../coach/reportStats";
import { createSessionToken } from "../coach/sessionGuard";
import { coachDebug } from "../utils/debug";
import { meterKey } from "../utils/meter";
import { useRealtimeTips } from "../containers/practice-coach/hooks/useRealtimeTips";
import { useSegmentCoach } from "../containers/practice-coach/hooks/useSegmentCoach";
import { appendAskTurn, askCoach, askTurnId } from "../containers/coach/askStore";
import { usePracticeHistory, usePracticeHistoryState } from "./usePracticeHistory";

export { __resetHistoryNoticeForTests, type StartSessionOptions } from "./usePracticeHistory";

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
  /** How hard the coach is on the player (ROADMAP 1.5). `"learning"`
   *  widens every gatekeeper tolerance by half, keeps corrections out
   *  of the player's ears, and asks the catalogue for an encouraging
   *  phrasing first. It changes nothing about the score, which is
   *  computed and stored exactly as strictly in either stance.
   *  Defaults to `"strict"` — today's behaviour — if absent. */
  coachStance?: CoachStance;
  /**
   * The user's brain-tier setting. No longer read: since the model selector
   * a session neither loads nor unloads the model (`hooks/coachLoader.ts`
   * owns it). Kept so callers need not change in this step.
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
  /**
   * True while a jam is loaded on the Jam tab — that is, while a BAND is
   * playing rather than a click.
   *
   * JAM_MODE §3, principle 5: a band is louder than a click, and through
   * speakers its hits land on the grid and the mic scores them as your notes.
   * Every segment recorded while this is true is tagged `mode: "jam"` so a
   * score earned over the band is never read later as a clean one.
   */
  jamMode?: boolean;
  /**
   * Nothing spoken while this is true. A running Session (`COACH_UX.md` A3): a
   * teacher who talks over your playing is a bad teacher, and speech during a
   * Take ruins the Take. The coach's feed and its history carry on as usual.
   */
  hushed?: boolean;
}

export function useSession({ evaluation, isPlaying, bpm, timeSignature, beatGroups, presetId, presetName, voiceMode = "silent", coachVerbosity = "default", coachMode = "default", coachStance = "strict", instrument = "electric-guitar", setBpm, inDrillRamp = false, drillStartBpm, drillTargetBpm, drillCompleted = false, jamMode = false, hushed = false }: UseSessionOptions) {
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
  const {
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
  } = usePracticeHistoryState({ bpm, isPlaying });
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  // Step 5 — play-style derived from onset_efficiency each mini-report.
  // 'structured' = ≥0.65 ratio of matched onsets; 'noodling' = <0.65.
  // undefined until the first scoreable segment lands.
  const [playMode, setPlayMode] = useState<"structured" | "noodling" | undefined>(undefined);

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
    if (voiceMode !== "voice" || hushed) return;
    ttsSpeak(text).catch(() => {});
  }, [voiceMode, hushed]);

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

    if (voiceMode !== "voice" || hushed) {
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
  }, [voiceMode, hushed]);
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
  // Learning vs strict, read from the same long-lived beat callback and
  // so kept in a ref for the reason above. The player may flip it
  // mid-session and the next tip should honour the new setting.
  const stanceRef = useRef<CoachStance>(coachStance);
  useEffect(() => { stanceRef.current = coachStance; }, [coachStance]);
  // The tempo band this preset has stalled in before, loaded once from
  // history at session start (ROADMAP 1.7). A fact about the player's
  // past, so it does not change while they play — but the beat callback
  // that reads it outlives the load, hence the ref.
  const presetCeilingRef = useRef<GatekeeperContext["presetCeiling"]>(undefined);

  // ── inDrillRamp: stable ref for use in long-lived beat callbacks ──
  const inDrillRampRef = useRef(inDrillRamp);
  useEffect(() => { inDrillRampRef.current = inDrillRamp; }, [inDrillRamp]);
  const drillStartBpmRef = useRef(drillStartBpm);
  useEffect(() => { drillStartBpmRef.current = drillStartBpm; }, [drillStartBpm]);
  const drillTargetBpmRef = useRef(drillTargetBpm);
  useEffect(() => { drillTargetBpmRef.current = drillTargetBpm; }, [drillTargetBpm]);
  // A ref, not a prop, for the same reason as the ramp above: the segment is
  // closed from a long-lived callback, and what matters is whether the band
  // was playing when it ended rather than which tab is open now.
  const jamModeRef = useRef(jamMode);
  useEffect(() => { jamModeRef.current = jamMode; }, [jamMode]);
  // Tracks the previous inDrillRamp value so the effect below can
  // detect the true→false transition that fires ramp_complete.
  const prevInDrillRampRef = useRef(inDrillRamp);
  // Guards ramp_complete against false positives when the user stops
  // mid-ramp (completed stays false; only a natural ramp finish sets it true).
  const drillCompletedRef = useRef(drillCompleted);
  useEffect(() => { drillCompletedRef.current = drillCompleted; }, [drillCompleted]);

  // ── Segment coaching: rising-edge start tracking + falling-edge
  // mini-report generation. wasPlayingRef lives inside the hook.
  const { reset: resetSegmentCoach } = useSegmentCoach({
    isPlaying, active, timeSignature, instrumentLabel,
    coachVerbosity, coachMode,
    segmentReportsRef, segmentStartRef, prevSessionBestRef,
    narrativeRef, sessionIdRef, activeRef, playBpmRef,
    beatsInSegmentRef, jamModeRef, quietRef, setMessages, setPlayMode,
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
      stance: stanceRef.current,
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
        stance: stanceRef.current,
        presetCeiling: presetCeilingRef.current,
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

      const severities = severityPlan(event.scenario, event.tier, stanceRef.current);
      const drawn = pickTemplateForSeverities(TEMPLATE_CATALOG, shuffleStateRef.current, {
        vocab: vocabRef.current,
        scenario: event.scenario,
        severities,
        context: event.context,
      });
      if (!drawn) {
        coachDebug("event.drop-no-template", { scenario: event.scenario, severities, vocab: vocabRef.current });
        return;
      }
      const { text: template, severity } = drawn;

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
        if (!intervention && !quietRef.current && !coachLoadedRef.current && coachLoadPending()) {
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
        if (!intervention && modelMaySpeak()) {
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
            const rephrased = safeRephrase(template, await coachGenerate("tip", llmPrompt));
            if (rephrased !== template) {
              comment = rephrased;
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

      if (!modelMaySpeak()) {
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
        stance: stanceRef.current,
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

      const drawn = pickTemplateForSeverities(TEMPLATE_CATALOG, shuffleStateRef.current, {
        vocab,
        scenario: event.scenario,
        severities: severityPlan(event.scenario, event.tier, stanceRef.current),
        context: event.context,
      });
      if (!drawn) return;
      const template = drawn.text;

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
        stance: stanceRef.current,
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

  const { isActive, startSession, endSession } = usePracticeHistory({
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
  });

  /**
   * Phase 5 — route a chip tap (or its follow-up affordance) into the feed.
   *
   * Three actions are supported:
   *   - `answer`: opens Ask with the chip's label and its pre-resolved
   *     answer in the thread (leg c2a2: the feed is gone). For LLM chips
   *     (`answer === null`) the chip's label is asked in Ask (`askCoach`),
   *     where the conversation lives since leg c2a1.
   *   - `set-bpm`: applies a delta to the current BPM via the optional
   *     `setBpm` callback (no-op when not wired). The delta is clamped
   *     to the metronome's safe range to mirror chip rendering.
   *   - `open-chat`: opens Ask with the caret in its text box.
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
        if (narrativeRef.current) {
          narrativeRef.current = appendUserAction(
            narrativeRef.current,
            `User tapped: "${chip.label}"`,
          );
        }
        if (chip.answer != null) {
          // Canned / template-fill — answer was resolved at chip
          // selection time. The note's chips open Ask (DESIGN 7, leg
          // c2a2): the question and its answer land in Ask's thread, the
          // answer as the app's own words, and are spoken as before.
          askCoach();
          appendAskTurn({ id: askTurnId(), kind: "user", text: chip.label });
          appendAskTurn({ id: askTurnId(), kind: "app", text: chip.answer });
          if (narrativeRef.current) {
            narrativeRef.current = appendCoachUtterance(
              narrativeRef.current,
              chip.answer,
            );
          }
          maybeSpeak(chip.answer, "normal");
        } else {
          // LLM pathway — the chip label is asked in Ask, where the
          // model can handle it as a question.
          askCoach({ question: chip.label });
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
        askCoach();
        break;
      }
    }
  }, [bpm, setBpm, maybeSpeak, instrument, evaluation.selectedDevice, voiceMode]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    active,
    messages,
    startedAt,
    /**
     * Whether a session is on as of the calls already made, not as of the
     * last render: false from the moment an end begins, true from the moment
     * a start does. `active` lags it by a render.
     */
    isActive,
    startSession,
    endSession,
    clearMessages,
    handleChipAction,
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
  event: GatekeeperEvent,
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

/*
 * `severityForEvent` used to live here, "inline so changes to the
 * scenario→severity mapping live next to the wiring point". Learning
 * mode needed the same mapping to decide what counts as a correction,
 * and two copies of that answer would have drifted within a release, so
 * it moved to `src/coach/learningMode.ts` as `severityFor` — with a test
 * file, which it never had here. Call `severityPlan` instead: it returns
 * the same answer in strict stance and an ordered preference in
 * learning stance.
 */

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
