import type { BrainTier } from "../types";
import type { useEvaluation } from "./useEvaluation";
import type { Vocabulary } from "../coach/templates";
import type { CoachStance } from "../coach/learningMode";
import { usePracticeHistory, usePracticeHistoryState } from "./usePracticeHistory";
import { useToolCoach } from "./useToolCoach";

/*
 * `useSession` composes two hooks (leg c5c1, a split with no behaviour
 * change): `usePracticeHistory` (whether a session is on, its start and end,
 * the final report and the save) and `useToolCoach` (the feed, the tips,
 * speech, the chips). The history's state is made first, the tool coach
 * second, the history's start and end last. That keeps the effects in the
 * order the one hook ran them, but for the history's four mirrors, which now
 * run before the tool coach's ten instead of after: they share no ref (the
 * table is in `plans/coach/progress/c5c1.md`).
 */
export { __resetHistoryNoticeForTests, type StartSessionOptions } from "./usePracticeHistory";

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
  const {
    messages,
    setMessages,
    playMode,
    handleChipAction,
    clearMessages,
    maybeSpeak,
    speakAndReveal,
    speakAndRevealRef,
    resetSegmentCoach,
    seedRealtimeTips,
    prevBpmRef,
    prevPresetIdRef,
    prevTimeSignatureRef,
    prevMeterKeyRef,
    prevInstrumentRef,
    beatsInSegmentRef,
    gatekeeperRef,
    interventionStateRef,
    prevSessionBestRef,
    presetCeilingRef,
    narrativeRef,
    realtimeWindowRef,
    beatsSinceLastCheckRef,
    boundaryDebounceRef,
  } = useToolCoach({
    evaluation,
    isPlaying,
    bpm,
    timeSignature,
    beatGroups,
    presetId,
    presetName,
    voiceMode,
    coachVerbosity,
    coachMode,
    coachStance,
    instrument,
    setBpm,
    inDrillRamp,
    drillStartBpm,
    drillTargetBpm,
    drillCompleted,
    jamMode,
    hushed,
    instrumentLabel,
    vocab,
    active,
    startedAt,
    playBpmRef,
    segmentReportsRef,
    segmentStartRef,
    coachLoadedRef,
    sessionIdRef,
    activeRef,
    quietRef,
    modelMaySpeak,
  });
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
