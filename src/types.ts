export type Subdivision = 1 | 2 | 3 | 4 | 5 | 6;
export type WidgetMode = "compact" | "comfortable";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

/**
 * Instrument IDs supported by the DSP `InstrumentProfile` system (D0 of the
 * DSP & Coach plan). These map 1:1 to the Rust `Instrument` enum via
 * kebab-case ids. "other" is the explicit fallback (no instrument-specific
 * calibration); the first-launch picker surfaces a real choice.
 */
export type InstrumentId =
  | "drums"
  | "electric-guitar"
  | "acoustic-guitar"
  | "bass"
  | "piano"
  | "other";

export type SpeedRamp = {
  startBpm: number;
  targetBpm: number;
  increment: number;
  decrement: number;
  barsPerStep: number;
  beatsPerBar: number;
  mode: "linear" | "zigzag" | "adaptive";
  cyclic: boolean;
  aggressiveness: "conservative" | "moderate" | "aggressive";
  active: boolean;
  currentStep: number;
  currentBpm: number;
  direction: "up" | "down";
  barsInStep: number;
  completed: boolean;
  warmupBeats: number;
  warmupCount: number;
};

export type AppState = {
  bpm: number;
  isPlaying: boolean;
  subdivision: Subdivision;
  mode: WidgetMode;
  corner: Corner;
  alwaysOnTop: boolean;
  widgetAlwaysOnTop: boolean;
  accentColor: string;
  theme: string;
  volume: number;
  soundType: string;
  timeSignature: number;
  beatGroups: number[];
  freeMode: boolean;
  speedRamp: SpeedRamp;
  /** Selected instrument id; drives DSP profile + coach vocabulary. */
  instrument: InstrumentId;
};

export type BeatEvent = {
  beat: number;
  measureBeat: number; // bar-local position (0..beatsPerMeasure), accurate after meter changes
  subdivision: number;
  isDownbeat: boolean;
};

// ---------------------------------------------------------------------------
// MIDI types
// ---------------------------------------------------------------------------

export type MidiMsgType = "cc" | "note" | "pc";

export type MidiDeviceInfo = {
  id: number;
  name: string;
  isConnected: boolean;
};

export type MidiActivity = {
  channel: number;
  type: MidiMsgType;
  number: number;
  value: number;
};

export type MidiBinding = {
  action: string;
  channel: number | null;
  msgType: MidiMsgType;
  number: number;
};

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export type Preset = {
  id: string;
  name: string;
  createdAt: number;
  bpm: number;
  subdivision: number;
  timeSignature: number;
  beatGroups?: number[];
  freeMode?: boolean;
  soundType: string;
  volume: number;
  view: "beat" | "drill";
  speedRamp?: {
    startBpm: number;
    targetBpm: number;
    increment: number;
    decrement: number;
    barsPerStep: number;
    beatsPerBar: number;
    mode: string;
    cyclic: boolean;
    warmupBeats: number;
    aggressiveness?: string;
  };
};

// ---------------------------------------------------------------------------
// Audio Output Device types
// ---------------------------------------------------------------------------

export type AudioOutputDevice = {
  name: string;
  isDefault: boolean;
  isBluetooth: boolean;
};

// ---------------------------------------------------------------------------
// Audio Input / Evaluation types
// ---------------------------------------------------------------------------

export type AudioInputDevice = {
  name: string;
  isDefault: boolean;
  isInterface: boolean;
  /** Number of input channels from the device's default config. 0 = unknown. */
  channels: number;
};

export type AudioSpectrum = {
  bands: number[];
  rms: number;
};

export type BeatFeedback = {
  beatIndex: number;
  /** Deviation from expected beat time in ms (negative = early, positive = late) */
  deviationMs: number;
  /** Error in interval between this onset and previous (ms) */
  intervalErrorMs: number;
  /** "perfect" | "good" | "ok" | "miss" */
  classification: "perfect" | "good" | "ok" | "miss" | "skipped";
  /** Amplitude of matched onset (0.0 for miss) */
  amplitude: number;
  /** Current calibration offset in ms */
  calibrationOffsetMs: number;
  /** Confidence in calibration (0.0–1.0) */
  calibrationConfidence: number;
  /** Grid correlation score (0.0–1.0). High = structured exercise, low = free playing */
  gridCorrelation: number;
};

export type SessionReport = {
  totalBeats: number;
  hitsCount: number;
  missCount: number;
  skippedBeats: number;
  perfectCount: number;
  goodCount: number;
  okCount: number;
  meanDeviationMs: number;
  stdDeviationMs: number;
  meanAbsDeviationMs: number;
  meanIntervalErrorMs: number;
  grade: string;
  score: number;
  deviations: number[];
  dynamicsStd: number;
  meanAmplitude: number;
  tempoStabilityMs: number;
  longestStreak: number;
  comment: string;
  insights: string[];
  gridCorrelation: number;
  /** Mean onset efficiency over the segment window (0.0–1.0).
   *  Absent when no segments were recorded (short warmup, etc.). */
  onsetEfficiency?: number;
  /** Mean hit completeness over the segment window (0.0–1.0).
   *  `beat_count / total_expected_beats` averaged across segments.
   *  Absent when no segments were recorded. */
  hitCompleteness?: number;
  /** Mean interval consistency over the segment window (0.0–1.0).
   *  Gaussian decay of IOI MAD — 1.0 = perfectly even note spacing.
   *  Absent when no segments were recorded. */
  intervalConsistency?: number;
  /** Mean grid alignment over the segment window (0.0–1.0).
   *  Confidence-weighted hit quality — 1.0 = all hits perfectly on-beat.
   *  Absent when no segments were recorded. */
  gridAlignment?: number;
  /** Play mode derived server-side from onsetEfficiency (≥0.65 → structured).
   *  Absent when no segments were recorded. Falls back to JS derivation when
   *  absent (e.g. old saved sessions, short warmup bursts). */
  playMode?: 'structured' | 'noodling';
  /** Coach scoring mode active when this session was recorded.
   *  Optional for backward compatibility with old session logs. */
  coachMode?: "default" | "pro";
  /** Mean amplitude of downbeat onsets averaged across segments.
   *  Absent when no segment had enough downbeat data points. */
  downbeatAmpAvg?: number;
  /** Mean amplitude of upbeat onsets averaged across segments.
   *  Absent when no segment had enough upbeat data points. */
  upbeatAmpAvg?: number;
  /** Mean amplitude of subdivision onsets averaged across segments.
   *  Absent when no segment had enough subdivision data points. */
  subdivisionAmpAvg?: number;
  /** Population std dev of all matched onset amplitudes averaged across segments.
   *  Absent when no segment had enough matched onsets. */
  ampStdDev?: number;
  /** Count of accent (downbeat) beats that were matched within the active
   *  window. 0 for live mini-reports and old saved sessions.
   *  Use with `accentBeatsCount` to compute Default-mode accuracy. */
  accentHitsCount?: number;
  /** Total accent positions in the active segment window. 0 for live
   *  mini-reports and old saved sessions. */
  accentBeatsCount?: number;
  /** Subdivision count active during this session (1 = quarter, 2 = eighth,
   *  4 = sixteenth). Defaults to 1 for backward compat. */
  subdivision?: number;
};

export type SavedSession = {
  id: string;
  timestamp: number;
  bpm: number;
  timeSignature: number;
  report: SessionReport;
  presetId?: string;
  presetName?: string;
  /** Per-segment exercise data. Absent for sessions saved before this field
   *  was added — UI silently hides the segment timeline for old sessions. */
  segments?: SessionSegment[];
};

// ---------------------------------------------------------------------------
// Diagnostic Session Logs (D1) — heavyweight per-session JSON written
// by the backend for dev/debug. Mirrors `src-tauri/src/session_log.rs`.
// ---------------------------------------------------------------------------

export type Classification = "perfect" | "good" | "ok" | "miss" | "skipped";

export type MatchReason =
  | "inside-window"
  | "outside-window"
  | "no-activity"
  | "below-confidence"
  | "chord-cluster";

export type SegmentEndReason =
  | "settings-change"
  | "activity-gap"
  // Signal D — grid-correlation boundary. Player was locked to the
  // subdivision grid and then sustained a low correlation for several
  // beat ticks. Distinct from `activity-gap` (player still playing,
  // just not following the grid anymore). Must stay in sync with the
  // `SegmentEndReason` enum in `src-tauri/src/session_log.rs` which
  // uses `#[serde(rename_all = "kebab-case")]`.
  | "grid-discontinuity"
  | "session-end"
  | "user-stopped";

export type ExpectedBeat = {
  index: number;
  timestampMs: number;
  isAccent: boolean;
  expectedBpm: number;
};

export type DetectedOnset = {
  timestampMs: number;
  amplitude: number;
  centroid: number;
  confidence: number;
};

export type MatchDecision = {
  beatIndex: number;
  onsetIndices: number[];
  deviationMs: number;
  classification: Classification;
  reason: MatchReason;
};

export type ActivityTransition = {
  timestampMs: number;
  transition: string;
};

/**
 * D3c — four-component scoring breakdown. Each component is in `[0, 1]`.
 *
 * - `intervalConsistency` — Gaussian decay of interval-error stddev,
 *   tempo-aware. Latency-independent (measures spacing, not absolute
 *   alignment).
 * - `gridAlignment` — confidence-weighted average of classification
 *   scores (perfect=100 / good=80 / ok=50 / miss=0).
 * - `hitCompleteness` — `matched / total_expected_beats`. Denominator
 *   is total expected over the WHOLE segment lifespan, not just active
 *   beats; closes the under-play loophole.
 * - `onsetEfficiency` — matched onsets / max(total detected onsets,
 *   instrument floor). Distinguishes structured practice from noodling.
 *
 * The final segment score is the weighted sum:
 * `score = ic×W1 + ga×W2 + hc×W3 + oe×W4` (each × 100). See `D3c` in
 * `plans/DSP_AND_COACH_PLAN.md` for weight tuning details.
 */
export type ComponentScores = {
  intervalConsistency: number;
  gridAlignment: number;
  hitCompleteness: number;
  onsetEfficiency: number;
};

/**
 * Path B — payload of the `inferred-grid-changed` Tauri event.
 *
 * The Rust matcher's rhythm-inference picks the divisor of the beat
 * the player is actually playing (1=quarter, 2=8th, 3=triplet,
 * 4=16th, 6=sextuplet) and scores against THAT, not the user's click
 * setting. This event fires whenever the locked divisor or lock-state
 * changes; the coach UI surfaces a subtle "Tracking 16ths" caption
 * when `locked` is true.
 */
export type InferredGridChanged = {
  /** Divisor the matcher is currently scoring against. */
  divisor: number;
  /**
   * Whether the inference has crystallized. False during cold-start
   * (< 8 onsets or no candidate clears MIN_LOCK_FIT). The UI should
   * NOT show the "Tracking …" caption when this is false — the
   * matcher is still guessing.
   */
  locked: boolean;
  /** Fit ratio of the locked divisor in [0, 1]. */
  confidence: number;
};

export type PracticeSegment = {
  startMs: number;
  endMs: number;
  startBpm: number;
  endBpm: number;
  score: number;
  componentScores: ComponentScores;
  endReason: SegmentEndReason;
};

// The Rust-side `PracticeSegmentEnded` event payload type was removed
// from JS in 2026-05 — no consumer was subscribing to the
// `practice-segment-ended` Tauri event (mini-reports are driven by
// isPlaying falling-edge instead). The Rust struct still exists and is
// emitted for future wiring + the SessionAccumulator side-effect, but
// the TS type only needs to come back if/when a JS listener does.

export type SessionLog = {
  bpm: number;
  timeSignature: number;
  subdivision: number;
  timestamp: number;
  durationMs: number;
  instrument: string;
  instrumentProfileVersion: number;
  expectedBeats: ExpectedBeat[];
  detectedOnsets: DetectedOnset[];
  matches: MatchDecision[];
  spuriousOnsets: number[];
  activityTransitions: ActivityTransition[];
  segments: PracticeSegment[];
  report: SessionReport;
};

/**
 * Discriminator for FeedMessage payloads.
 *
 * `chip-prompt` is the user-affordance message that follows a
 * `mini-report` and surfaces tap-to-answer suggestion chips. Splitting
 * the chips off the mini-report card keeps the two concerns visually
 * separated: the mini-report is content FROM the coach ("here's how
 * the segment went"), the chip-prompt is an input affordance FOR the
 * user ("here's what you can ask next"). They used to share a single
 * card and the chips looked like part of the coach's commentary —
 * see CoachFeedMessage.tsx for the rendering split.
 */
export type FeedMessageType = "session-start" | "mini-report" | "session-end" | "system" | "coach-tip" | "user-chat" | "coach-chat" | "chip-prompt";

export type SessionSegment = {
  report: SessionReport;
  bpm: number;
  timeSignature: number;
  startTime?: number;
  endTime?: number;
};

/**
 * One follow-up chip on a feed message. The shape is intentionally
 * UI-only (id + label + optional affordance) so the chip catalog can
 * change shape without rippling into the feed contract.
 */
export type FeedChip = {
  /** Stable id from the chip catalog. */
  id: string;
  /** User-visible button text. */
  label: string;
  /** Resolved answer text (for canned/template-fill). `null` for LLM
   *  chips — the UI routes those into free-text input. */
  answer: string | null;
  /** Optional follow-up action (e.g. "Drop to 130 BPM"). */
  affordance?: {
    label: string;
    action: "set-bpm" | "open-chat";
    bpmDelta?: number;
  };
};

/**
 * A coach-emitted affordance attached to a `coach-tip` or
 * `coach-chat` message. Mirrors the chip-affordance shape but
 * additionally carries a `dismissLabel` because interventions are
 * proactive (user must be able to decline cleanly) whereas chip
 * affordances are reactive (tapping is already an acceptance).
 *
 * Currently surfaced on `coach-tip` messages emitted by the
 * intervention layer in `useSession.ts`.
 */
export type FeedAffordance = {
  /** Primary accept button label. */
  actionLabel: string;
  /** Action to dispatch on accept. Mirrors `InterventionAction` in
   *  `src/coach/interventions.ts` — keep in lockstep. */
  action:
    | { kind: "set-bpm"; bpmDelta: number }
    | { kind: "take-break"; durationMs: number }
    | { kind: "clear-calibration" };
  /** Secondary dismiss button label (e.g. "Stay at 150"). */
  dismissLabel: string;
  /** Stable id of the intervention that produced this affordance.
   *  Used by the UI to mark an intervention as accepted/declined and
   *  remove the buttons after a single tap. */
  interventionId: string;
};

export type FeedMessage = {
  id: string;
  type: FeedMessageType;
  timestamp: number;
  content: string;
  report?: SessionReport;
  meta?: { bpm: number; timeSignature: number };
  segments?: SessionSegment[];
  urgency?: "urgent" | "normal";
  /** Suggested follow-up questions for the user. Surfaced on mini-report. */
  chips?: FeedChip[];
  /** Coach-emitted affordance — surfaced on intervention-bearing tips. */
  affordance?: FeedAffordance;
  /** Set to true once the user has either accepted or dismissed the
   *  affordance, so the UI can hide the buttons without removing the
   *  message text. */
  affordanceResolved?: boolean;
  /** When true, the UI renders a spinner instead of the message text
   *  until the matching `tts-speech-started` event fires. Used to
   *  sync the visible text with the audible voice so the user doesn't
   *  read the greeting/tip seconds before they hear it (see
   *  `speakAndReveal` in useSession.ts). */
  pending?: boolean;
};

// ---------------------------------------------------------------------------
// Practice Coach — UI-side tier / voice / verbosity types.
//
// These mirror the runtime settings owned by `useCoachDownload` and
// rendered by `CoachSettingsSection`. Hoisted here so the same union
// isn't redeclared in every consumer (the previous setup had four
// copies between `useCoachDownload.ts`, `SettingsView.tsx`, and
// `CoachSettingsSection.tsx` which drifted apart whenever a new
// option was added).
// ---------------------------------------------------------------------------

/** "off" — no AI coaching; "standard" / "full" — model size tiers. */
export type BrainTier = "off" | "standard" | "full";

/** Subset of BrainTier that corresponds to a downloadable model. */
export type ModelTier = "standard" | "full";

/** Audio delivery channel for coach feedback. */
export type VoiceMode = "silent" | "voice";

/**
 * C5 — how often the coach speaks. Maps to the plan's 4-way knob:
 *   - "less"    → only urgent-tier events speak; calm/check-in events
 *                 stay written-only (less chatty coach for focus
 *                 sessions where TTS interruptions are unwelcome).
 *   - "default" → honours the gatekeeper's tier decision verbatim.
 *   - "more"    → promotes written-tier events to spoken so the coach
 *                 is more talkative mid-session.
 *
 * The plan's "Silent" tier is covered by `voiceMode === "silent"`
 * (separate setting) rather than a fourth value here — keeping voice-on
 * orthogonal from verbosity-level keeps the UI affordances cleaner.
 */
export type Verbosity = "less" | "default" | "more";

/**
 * Scoring mode for the practice coach.
 *   - "default" → Focuses on steady time and musical feel. Forgiving on
 *                 precision — great for warming up and general practice.
 *   - "pro"     → Counts every subdivision and grades against the full beat
 *                 grid. More demanding — built for players pushing their
 *                 accuracy.
 */
export type CoachMode = "default" | "pro";
