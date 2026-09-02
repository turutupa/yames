import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Dispatch, SetStateAction } from "react";
import type {
  BrainTier,
  CoachMode,
  InstrumentId,
  ModelTier,
  Verbosity,
  VoiceMode,
} from "../../types";
import type { CoachCapabilities, ModelStatus, VoiceDiagnostic } from "../../ipc";
import {
  deleteModels,
  getCoachCapabilities,
  getModelStatus,
  onTtsSpeechEnded,
  setInstrument as setInstrumentBackend,
  storeSave,
  ttsSetVoice,
  ttsSpeak,
  ttsStop,
} from "../../ipc";
import { InstrumentDropdown } from "../../components/InstrumentDropdown";
import { formatBytes } from "./formatBytes";
import { coachStatusLabel } from "./coachStatus";

// Short per-voice sample line played when the user clicks a voice
// button. Each line is distinct on purpose so the user can hear timbre
// + cadence differences when toggling between voices, instead of
// hearing the same sentence repeated. Keep these under ~3 seconds of
// speech — long previews stack badly on rapid clicks and make the
// settings page feel sluggish.
const VOICE_PREVIEW_LINES: Record<string, string> = {
  lessac: "Hi! I'm Lessac. Ready to practice?",
  amy: "Hi! I'm Amy. Let's get those reps in.",
  ryan: "Hey, Ryan here. Locked in and ready.",
};

/**
 * Practice Coach settings section — owns the toggle groups for AI tier,
 * instrument, voice delivery, and voice personality, plus the post-install
 * management buttons (download voices / remove models). Pure UI: state lives
 * in the parent and is mutated through the provided setters.
 */
export function CoachSettingsSection({
  coachBrainTier,
  setCoachBrainTier,
  coachVoiceMode,
  setCoachVoiceMode,
  coachVoiceName,
  setCoachVoiceName,
  coachVerbosity,
  setCoachVerbosity,
  coachMode,
  setCoachMode,
  modelStatus,
  setModelStatus,
  modelDownloading,
  studioAvailable,
  brainUpdateAvailable,
  availableVoices,
  voiceDiagnostics,
  instrument,
  setInstrument,
  onStartDownload,
  onRequestDownload,
}: {
  coachBrainTier: BrainTier;
  setCoachBrainTier: Dispatch<SetStateAction<BrainTier>>;
  coachVoiceMode: VoiceMode;
  setCoachVoiceMode: Dispatch<SetStateAction<VoiceMode>>;
  coachVoiceName: string;
  setCoachVoiceName: Dispatch<SetStateAction<string>>;
  coachVerbosity: Verbosity;
  setCoachVerbosity: Dispatch<SetStateAction<Verbosity>>;
  coachMode: CoachMode;
  setCoachMode: Dispatch<SetStateAction<CoachMode>>;
  modelStatus: ModelStatus | null;
  setModelStatus: Dispatch<SetStateAction<ModelStatus | null>>;
  modelDownloading: boolean;
  studioAvailable: boolean;
  brainUpdateAvailable: boolean;
  availableVoices: [string, string][];
  voiceDiagnostics: VoiceDiagnostic[];
  instrument: string;
  setInstrument: Dispatch<SetStateAction<string>>;
  onStartDownload: (tier: ModelTier) => void;
  onRequestDownload: (tier: ModelTier) => void;
}) {
  const { t } = useTranslation();
  // Tracks the in-flight `deleteModels()` IPC call so the Remove button
  // can show a "Removing…" state and stays clickable-but-disabled. The
  // backend does `std::fs::remove_dir_all` on a 4 GB tree, which on
  // macOS takes 1-3 seconds — without this guard the user can fire
  // multiple deletes back-to-back or assume the button is broken when
  // the UI doesn't react. Local state instead of lifting into the hook
  // because nothing outside this component cares about the removal
  // phase (the download progress bar in MainWindow gates on
  // `modelDownloading`, which is a separate concern).
  const [removing, setRemoving] = useState(false);
  // Which voice (if any) is currently mid-preview. Drives the inline
  // equalizer-style bars rendered inside that voice's toggle button so
  // the user gets visible feedback during the 200-1500 ms synthesis
  // latency window AND throughout the ~2-3 s preview line — without
  // this the click felt unresponsive and people clicked again,
  // triggering an interrupt-then-restart loop.
  const [speakingVoiceId, setSpeakingVoiceId] = useState<string | null>(null);
  // Pending-speech counter. Each `previewVoice` call increments;
  // every `tts-speech-ended` event from the backend decrements. When
  // the counter drains to zero we know the LAST speech we initiated
  // has actually finished (either playing all the way through or
  // being interrupted by the next click), and only then do we clear
  // the bars. `useRef` so the value survives renders without forcing
  // a re-render when it changes — we render off `speakingVoiceId`,
  // not the counter.
  //
  // Why a counter rather than a single bool: rapid voice clicks
  // interrupt each other (the backend kills the in-flight subprocess
  // and starts a new one), and each `tts_speak` invocation produces
  // exactly one `tts-speech-ended` event. If we used a bool the FIRST
  // ended event (for the interrupted speech) would clear bars while
  // the second speech is still about to play — visible flicker. The
  // counter naturally handles arbitrary depth: N clicks = N ended
  // events = bars clear only after the Nth one.
  const pendingSpeechRef = useRef(0);

  // Truthful brain state for the status line under the Brain toggle.
  // `modelStatus` only knows whether the weights are on disk; this
  // knows whether the build can run them and whether one is actually
  // resident. Refetched whenever the on-disk state or the selected
  // tier changes, and when a download finishes — `load_coach_model` is
  // driven from `useSession`, so residency flips without this
  // component re-rendering on its own.
  const [coachCaps, setCoachCaps] = useState<CoachCapabilities | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCoachCapabilities()
      .then((caps) => {
        if (!cancelled) setCoachCaps(caps);
      })
      .catch(() => {
        // Leave the line hidden rather than guessing at a state.
        if (!cancelled) setCoachCaps(null);
      });
    return () => {
      cancelled = true;
    };
  }, [
    modelStatus?.brainReady,
    modelStatus?.brainTier,
    modelDownloading,
    coachBrainTier,
  ]);
  const coachStatus = coachStatusLabel(coachCaps, !!modelStatus?.brainReady);

  // Subscribe to the backend's "speech ended" event. Lifecycle:
  //   - mount: register listener
  //   - unmount: unregister (returned Promise from `onTtsSpeechEnded`
  //     resolves with the unlisten fn)
  // The `cancelled` flag handles the race where the component
  // unmounts BEFORE the listener Promise resolves — without it the
  // resolved unlisten fn would leak and keep dispatching to a dead
  // setState. Same pattern as other event subscribers in this app.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    onTtsSpeechEnded(() => {
      // Drain the counter by one. `Math.max(0, ...)` keeps the
      // counter floor-clamped in case a non-preview speech (e.g.
      // a coach tip fired from elsewhere) emits an ended event we
      // weren't tracking — without the clamp the next preview's
      // increment would land at 0 and the ended event would
      // immediately re-clear the bars.
      pendingSpeechRef.current = Math.max(0, pendingSpeechRef.current - 1);
      if (pendingSpeechRef.current === 0) {
        setSpeakingVoiceId(null);
      }
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);

  // Voice preview helper. Note: NO in-flight gate — by design, rapid
  // clicks across voices should interrupt the previous utterance, not
  // queue. The backend `tts_speak` is serialized via spawn_blocking,
  // so to actually interrupt we explicitly call `ttsStop()` first; the
  // Rust side bumps a generation counter and `kill -9`s the tracked
  // subprocess, releasing the spawn_blocking thread so the next speak
  // can fire immediately. Result: clicking Lessac → Amy → Ryan plays
  // only Ryan's preview, no audible overlap.
  const previewVoice = (voiceId: string) => {
    const line = VOICE_PREVIEW_LINES[voiceId];
    if (!line) return;
    // Optimistic flip BEFORE awaiting any IPC: the user feels the bars
    // appear within a frame of the click. The async ttsSpeak below
    // will eventually start playing; the matching ended event clears
    // the indicator at the exact end of audio.
    setSpeakingVoiceId(voiceId);
    pendingSpeechRef.current += 1;
    // Fire-and-forget interrupt. If nothing is playing, the kill is a
    // no-op (the engine just bumps its generation counter); if
    // something IS playing, the in-flight utterance is killed before
    // we queue the new one. The killed speech's `tts_speak` handler
    // will STILL emit `tts-speech-ended` on exit, which is why the
    // counter approach handles rapid clicks cleanly.
    ttsStop().catch(() => {});
    ttsSpeak(line).catch(() => {
      // Speech failed to even reach speak_standalone (backend errored
      // before the spawn_blocking ran). The backend's ended-event
      // emit runs regardless of the inner result, so we don't need to
      // decrement the counter here — it'll fire normally. But guard
      // against the edge case where the IPC layer itself rejected
      // (e.g. command not registered) by decrementing as a fallback.
      // If the backend ALSO emits the ended event we'd double-
      // decrement, but the floor-clamp prevents the counter going
      // negative and the visual outcome is still correct.
      pendingSpeechRef.current = Math.max(0, pendingSpeechRef.current - 1);
      if (pendingSpeechRef.current === 0) {
        setSpeakingVoiceId(null);
      }
    });
  };

  // `id` is the deep-link target for O4's "Pick a voice" toast, the same way
  // `settings-appearance` anchors W2's "More themes in Settings".
  return (
    <section className="settings-section" id="settings-coach">
      {/* EXPERIMENTAL badge: signals to users that the coach is a labs
          feature and that behaviour may shift between builds. The flask
          icon mirrors the "labs" visual language people already know
          from Chrome/Firefox/etc., and the amber palette keeps it
          tonally distinct from the accent-pink active toggle state so
          the badge actually reads as a callout rather than chrome. */}
      <div className="settings-section-title">
        <h2>{t("settings.coach.title")}</h2>
        <span
          className="experimental-badge"
          title={t("settings.coach.betaHint")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
            <path d="M8.5 2h7" />
            <path d="M7 16h10" />
          </svg>
          {t("settings.coach.beta")}
        </span>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.coach.brain")}</label>
          <span className="setting-hint">{t("settings.coach.brainHint")}</span>
        </div>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${coachBrainTier === "off" ? "active" : ""}`}
            data-tooltip={t("settings.coach.brainOffHint")}
            onClick={() => {
              setCoachBrainTier("off");
              storeSave("coachBrainTier", "off");
            }}
          >
            {t("common.off")}
          </button>
          <button
            className={`toggle-btn ${coachBrainTier === "standard" ? "active" : ""}`}
            data-tooltip={t("settings.coach.brainStandardHint")}
            disabled={modelDownloading}
            onClick={() => {
              if (modelStatus?.brainReady && modelStatus.brainTier === "standard") {
                setCoachBrainTier("standard");
                storeSave("coachBrainTier", "standard");
                if (!modelStatus.voiceReady) onStartDownload("standard");
              } else {
                onRequestDownload("standard");
              }
            }}
          >
            {t("settings.coach.brainStandard")}
          </button>
          {/* "Studio" in the UI, `full` on the wire — the tier id is
              persisted in the settings store and in models/brain/tier,
              so only the label moved (see MODEL_URLS in
              useCoachDownload.ts). Disabled below 16 GB of RAM per
              ROADMAP §3: an 8B Q4_K_M needs ~8 GB resident and would
              thrash swap on a smaller machine. */}
          <button
            className={`toggle-btn ${coachBrainTier === "full" ? "active" : ""}`}
            data-tooltip={
              studioAvailable
                ? t("settings.coach.brainStudioHint")
                : t("settings.coach.brainStudioNeedsRam")
            }
            disabled={modelDownloading || !studioAvailable}
            onClick={() => {
              if (modelStatus?.brainReady && modelStatus.brainTier === "full") {
                setCoachBrainTier("full");
                storeSave("coachBrainTier", "full");
                if (!modelStatus.voiceReady) onStartDownload("full");
              } else {
                onRequestDownload("full");
              }
            }}
          >
            {t("settings.coach.brainStudio")}
          </button>
        </div>
      </div>
      {/* Honest brain status. Never says "active" unless a real model
          is resident in a build that can run one — see coachStatus.ts. */}
      {coachStatus && (
        <div className={`coach-brain-status coach-brain-status-${coachStatus.tone}`}>
          {t(coachStatus.key, coachStatus.params)}
        </div>
      )}

      {/* Migration affordance. A brain downloaded before the Qwen3
          refresh still loads, but the engine now builds a Qwen3 ChatML
          prompt, so an older family answers with visible template
          artifacts. Re-running the normal download flow for the tier
          that is already installed overwrites the weights in place; we
          never delete the old file behind the user's back. */}
      {brainUpdateAvailable && (
        <div className="setting-row">
          <div className="setting-label">
            <label>{t("settings.coach.brainUpdate")}</label>
            <span className="setting-hint">{t("settings.coach.brainUpdateHint")}</span>
          </div>
          <button
            className="toggle-btn"
            disabled={modelDownloading}
            onClick={() => {
              const tier: ModelTier =
                modelStatus?.brainTier === "full" && studioAvailable ? "full" : "standard";
              onStartDownload(tier);
            }}
          >
            {modelDownloading
              ? t("settings.coach.downloading")
              : t("settings.coach.brainUpdateAction")}
          </button>
        </div>
      )}
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.coach.scoringMode")}</label>
          <span className="setting-hint">{t("settings.coach.scoringModeHint")}</span>
          <span className="setting-hint" style={{ marginTop: 4 }}>
            {coachMode === "pro"
              ? t("settings.coach.scoringProDesc")
              : t("settings.coach.scoringDefaultDesc")}
          </span>
        </div>
        <div className="toggle-group">
          {(["default", "pro"] as const).map((mode) => (
            <button
              key={mode}
              className={`toggle-btn ${coachMode === mode ? "active" : ""}`}
              onClick={() => {
                setCoachMode(mode);
                storeSave("coachMode", mode);
              }}
            >
              {mode === "default" ? t("settings.coach.scoringDefault") : t("settings.coach.scoringPro")}
            </button>
          ))}
        </div>
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.coach.instrument")}</label>
          <span className="setting-hint">{t("settings.coach.instrumentHint")}</span>
        </div>
        <InstrumentDropdown
          value={instrument}
          onChange={(val) => {
            // Update local state + persistent store (for next-launch
            // restore) AND push to the backend so the DSP picks up the
            // new InstrumentProfile immediately (D0).
            setInstrument(val);
            storeSave("instrument", val);
            setInstrumentBackend(val as InstrumentId).catch(() => {
              // Backend may not be ready during early boot; the lib.rs
              // restore path will hydrate from the store anyway.
            });
          }}
          // When the Brain is "off" there's no coach to tune detection
          // for, so the instrument selector is locked alongside the
          // other coach-dependent controls (Voice) to keep the section
          // visually consistent.
          disabled={coachBrainTier === "off"}
        />
      </div>
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.coach.voice")}</label>
          <span className="setting-hint">{t("settings.coach.voiceHint")}</span>
        </div>
        <div className="toggle-group">
          {(["silent", "voice"] as const).map((mode) => (
            <button
              key={mode}
              className={`toggle-btn ${coachVoiceMode === mode ? "active" : ""}`}
              data-tooltip={
                mode === "silent"
                  ? t("settings.coach.voiceSilentHint")
                  : t("settings.coach.voiceSpeakHint")
              }
              disabled={coachBrainTier === "off" || (mode === "voice" && availableVoices.length === 0)}
              onClick={() => {
                setCoachVoiceMode(mode);
                storeSave("coachVoiceMode", mode);
              }}
            >
              {t(`settings.coach.voiceModes.${mode}`)}
            </button>
          ))}
        </div>
      </div>
      {/* C5 verbosity — controls how often spoken events fire. "Default"
          honours the gatekeeper's tier decision verbatim. "More" promotes
          written-tier events to spoken so the coach is more talkative
          mid-session. The setting is silent when Voice is off (TTS is
          gated by `voiceMode` regardless). */}
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.coach.verbosity")}</label>
          <span className="setting-hint">{t("settings.coach.verbosityHint")}</span>
        </div>
        <div className="toggle-group">
          {(["less", "default", "more"] as const).map((mode) => (
            <button
              key={mode}
              className={`toggle-btn ${coachVerbosity === mode ? "active" : ""}`}
              data-tooltip={
                mode === "less"
                  ? t("settings.coach.verbosityLessHint")
                  : mode === "default"
                    ? t("settings.coach.verbosityDefaultHint")
                    : t("settings.coach.verbosityMoreHint")
              }
              disabled={coachBrainTier === "off" || coachVoiceMode !== "voice"}
              onClick={() => {
                setCoachVerbosity(mode);
                storeSave("coachVerbosity", mode);
              }}
            >
              {t(`settings.coach.verbosityModes.${mode}`)}
            </button>
          ))}
        </div>
      </div>
      {/* Voice Name stays mounted regardless of the Voice toggle so the
          settings list doesn't reflow when the user flips between Silent
          and Voice. When Voice is off (or the Brain is off entirely),
          the row dims via the standard `disabled` opacity to match the
          other locked controls. */}
      <div className="setting-row">
        <div className="setting-label">
          <label>{t("settings.coach.voiceName")}</label>
          <span className="setting-hint">
            {coachBrainTier === "off"
              ? t("settings.coach.voiceNameBrainOffHint")
              : coachVoiceMode !== "voice"
                ? t("settings.coach.voiceNameSilentHint")
                : modelStatus?.voiceReady
                  ? t("settings.coach.voiceNameReadyHint")
                  : t("settings.coach.voiceNameDownloadHint")}
          </span>
        </div>
        <div className="toggle-group">
          {([["lessac", "Lessac"], ["amy", "Amy"], ["ryan", "Ryan"]] as const).map(([id, name]) => {
            // Diagnostics is the source of truth: it reflects on-disk
            // file size + Piper engine completeness, not just "the
            // voice id exists on disk". Fall back to availableVoices
            // only if diagnostics haven't loaded yet (first paint).
            const diag = voiceDiagnostics.find((d) => d.id === id);
            const downloaded = diag
              ? diag.ready
              : availableVoices.some(([vid]) => vid === id);
            const voiceNameDisabled =
              coachBrainTier === "off" ||
              coachVoiceMode !== "voice" ||
              !downloaded;
            // Human-readable tooltip explains exactly why a voice is
            // unavailable so the user knows the Repair button below
            // will actually fix it.
            const titleText = !diag
              ? downloaded
                ? name
                : t("settings.coach.voiceNotDownloaded", { name })
              : diag.ready
                ? name
                : diag.engineMissing
                  ? t("settings.coach.voiceEngineMissing", { name })
                  : diag.corrupted
                    ? t("settings.coach.voiceCorrupted", { name })
                    : diag.onnxMissing || diag.jsonMissing
                      ? t("settings.coach.voiceFilesMissing", { name })
                      : t("settings.coach.voiceUnavailable", { name });
            const speaking = speakingVoiceId === id;
            return (
              <button
                key={id}
                className={`toggle-btn voice-toggle-btn ${coachVoiceName === id ? "active" : ""}`}
                disabled={voiceNameDisabled}
                title={titleText}
                onClick={() => {
                  setCoachVoiceName(id);
                  storeSave("coachVoiceName", id);
                  // Sequence matters: push the new voice id into the
                  // engine BEFORE asking it to speak, so the preview
                  // actually uses the voice the user just clicked.
                  // `ttsSetVoice` is fire-and-forget on the Rust side
                  // (mutates the engine's `voice` field via a mutex),
                  // so by the time `ttsSpeak` lands the voice swap is
                  // already in place. The preview runs unconditional
                  // of `coachVoiceMode` — users should be able to
                  // audition voices even with Voice toggled off.
                  ttsSetVoice(id);
                  previewVoice(id);
                }}
              >
                <span className="voice-toggle-btn__label">{name}</span>
                {/* Equalizer-style indicator. Width is reserved
                    regardless of state (data-active flips opacity, not
                    display) so the button doesn't reflow when a
                    preview starts/ends — that was the alternative
                    flicker mode if we conditionally rendered the
                    element. `currentColor` lets the bars inherit the
                    active/inactive button text color so the contrast
                    stays right across themes. aria-hidden because the
                    bars are purely decorative; screen readers get the
                    voice name from the button label. */}
                <span
                  className="voice-wave"
                  data-active={speaking}
                  aria-hidden="true"
                >
                  <span className="voice-wave__bar" />
                  <span className="voice-wave__bar" />
                  <span className="voice-wave__bar" />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {/* Voices section — only when the AI brain is installed AND
          voices aren't ready yet (or any voice is corrupted/missing
          dylibs). One button, one job: trigger the unified download
          flow which the backend already gates intelligently — it
          skips the brain GGUF if present, re-extracts Piper if the
          engine dylibs are gone, and pulls only the voice files that
          are missing or undersized. That's why the per-voice
          "Repair X" affordance is gone: it was three buttons for what
          is logically one action. The hint text leans on the
          diagnostics to explain *why* the user needs to download
          (engine missing vs files missing vs corrupted) so they know
          a single click will fix everything in one pass. */}
      {modelStatus?.brainReady &&
        (!modelStatus.voiceReady ||
          voiceDiagnostics.some((d) => !d.ready)) && (
          <div className="coach-download-section coach-voices-section">
            <p className="setting-hint" style={{ marginBottom: 8 }}>
              {voiceDiagnostics.some((d) => d.engineMissing)
                ? t("settings.coach.voicesEngineMissing")
                : voiceDiagnostics.some((d) => d.corrupted)
                  ? t("settings.coach.voicesCorrupted")
                  : t("settings.coach.voicesNotInstalled")}
            </p>
            {/* OS-specific remediation from Rust, shown only when the
                engine itself is broken. Speech now works on Windows and
                Linux too, and those platforms fail for reasons the
                translated copy above can't cover (AV quarantine of
                piper.exe, a missing espeak-ng-data folder). The string
                is English-only by design — it names filesystem paths
                and package names, same as the download error banner. */}
            {(() => {
              const hint = voiceDiagnostics.find((d) => d.engineHint)?.engineHint;
              return hint ? (
                <p className="setting-hint" style={{ marginBottom: 8, opacity: 0.75 }}>
                  {hint}
                </p>
              ) : null;
            })()}
            {/* Always render the button so it doesn't pop in/out of
                the layout — instead disable it while a download is in
                flight. The global progress bar in MainWindow already
                visualises what's happening; we just need to make the
                button non-clickable so the user can't queue another
                download on top. */}
            <button
              className="coach-download-btn"
              disabled={modelDownloading}
              onClick={() =>
                onStartDownload(
                  (modelStatus.brainTier as ModelTier) ?? "standard",
                )
              }
            >
              {/* Lucide-style download glyph. `currentColor` so it
                  picks up the accent tint from `.coach-download-btn`
                  and stays in sync if the theme palette changes. */}
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {modelDownloading ? t("settings.coach.downloading") : t("settings.coach.downloadVoices")}
            </button>
          </div>
        )}
      {/* Manage section — separate from Voices so "Remove models" isn't
          visually adjacent to "Download voices" (the user pointed out
          that mixing the two affordances in one row read as
          duplication). Always visible when the brain is installed so
          the user can recover the disk space the coach is using. The
          size label combines brain + voices because both are
          uninstalled by `deleteModels()` in one shot. */}
      {modelStatus?.brainReady && (
        <div className="coach-download-section coach-manage-section">
          <p className="setting-hint" style={{ marginBottom: 8 }}>
            {t("settings.coach.installed", {
              tier: modelStatus.brainTier === "full"
                ? t("settings.coach.brainStudio")
                : t("settings.coach.brainStandard"),
              size: formatBytes(modelStatus.brainSizeBytes + modelStatus.voiceSizeBytes),
            })}
          </p>
          <button
            className="coach-download-btn"
            disabled={removing || modelDownloading}
            onClick={async () => {
              setRemoving(true);
              try {
                await deleteModels();
                setModelStatus(await getModelStatus());
                setCoachBrainTier("off");
                storeSave("coachBrainTier", "off");
              } finally {
                // `finally` (not just the happy path) so a backend
                // error doesn't leave the button stuck in "Removing…"
                // forever — the user can retry once the failure is
                // visible.
                setRemoving(false);
              }
            }}
          >
            {/* Lucide-style trash glyph. Same stroke/fill convention as
                the download icon above so the two buttons read as a
                matched pair when sitting one on top of the other. */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
            {removing ? t("settings.coach.removing") : t("settings.coach.removeModels")}
          </button>
        </div>
      )}
    </section>
  );
}
