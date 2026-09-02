import { useCallback, useEffect, useState } from "react";
import {
  cancelModelDownload,
  getModelStatus,
  getSystemMemoryMb,
  onDownloadComplete,
  onDownloadProgress,
  startModelDownload,
  storeLoad,
  storeSave,
  ttsListVoices,
  ttsSetVoice,
  ttsSetVolume,
  ttsVoiceDiagnostics,
} from "../ipc";
import type { DownloadProgress, ModelStatus, VoiceDiagnostic } from "../ipc";
import type { BrainTier, CoachMode, ModelTier, VoiceMode, Verbosity } from "../types";
import { needsBrainUpdate, standardAvailable, studioAvailable } from "../coach/brainTiers";
import { unloadCoach } from "./coachLoader";

// Legacy persisted values may still carry "chime" from an earlier
// release; we collapse it to "silent" on load and rewrite the store so
// the user lands on a valid option after migration.
type PersistedVoiceMode = VoiceMode | "chime";

/**
 * Brain weights, per ROADMAP §3. Both Apache-2.0, both from Qwen's own
 * GGUF repos (`bartowski/Qwen_Qwen3-*-GGUF` carries the same quants if
 * these ever move).
 *
 *   standard  Qwen3-4B  Q4_K_M  2,497,280,256 B (2.33 GiB) — the floor
 *   full      Qwen3-8B  Q4_K_M  5,027,783,488 B (4.68 GiB) — "Studio",
 *                                offered only at >= 16 GB RAM
 *
 * Sizes verified 2026-09-02 and mirrored by `models.rs::min_brain_bytes`,
 * which rejects a download that comes back implausibly small.
 *
 * The `full` tier id is deliberately unchanged even though the label is
 * now "Studio" — it is persisted in the settings store and written to
 * `models/brain/tier` on disk, so renaming it would strand every existing
 * install. Only the user-facing string moved.
 *
 * Never Qwen2.5-3B: non-commercial Qwen Research License (ROADMAP §3).
 */
const MODEL_URLS: Record<ModelTier, string> = {
  standard:
    "https://huggingface.co/Qwen/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf",
  full: "https://huggingface.co/Qwen/Qwen3-8B-GGUF/resolve/main/Qwen3-8B-Q4_K_M.gguf",
};

/**
 * Owns Practice Coach model + voice state for MainWindow:
 *  - which brain tier is active (off / standard / full),
 *  - voice mode + chosen voice,
 *  - the current download status (progress bar + error / success banners),
 *  - the "are you sure you want to download N gigabytes?" pending tier.
 *
 * Side effects:
 *  - Restores tiered settings from the persistent store on mount.
 *  - Subscribes to backend `download-progress` and `download-complete`
 *    events so progress bars stay in sync across hot reloads.
 *  - Persists the selected tier whenever a download finishes.
 */
export function useCoachDownload() {
  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [modelDownloading, setModelDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] =
    useState<DownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadingTier, setDownloadingTier] = useState<ModelTier | null>(
    null,
  );
  const [pendingDownloadTier, setPendingDownloadTier] =
    useState<ModelTier | null>(null);
  // Total physical RAM, for the Studio tier gate. `null` until the IPC
  // answers; `studioAvailable` treats both null and 0 as "unknown, allow".
  const [systemMemoryMb, setSystemMemoryMb] = useState<number | null>(null);

  const [coachBrainTier, setCoachBrainTierState] = useState<BrainTier>("off");
  /**
   * Setter wrapper: switching the brain off must also free the RAM.
   * Nothing else did — the tier flag only gated *future* prompts, so a
   * user who turned the coach off after a session kept paying 4 GB for a
   * model that would never be asked anything again. Loading is the
   * mirror image and deliberately does NOT happen here: weights become
   * resident when a session starts, not when a toggle is pressed
   * (`hooks/coachLoader.ts`).
   */
  const setCoachBrainTier = useCallback((tier: BrainTier) => {
    setCoachBrainTierState(tier);
    if (tier === "off") void unloadCoach();
  }, []);
  const [coachVoiceMode, setCoachVoiceMode] = useState<VoiceMode>("silent");
  const [coachVoiceName, setCoachVoiceName] = useState("lessac");
  // C5 verbosity. "default" honours the gatekeeper's tier verbatim.
  // "more" promotes written-tier events to spoken (see useSession).
  const [coachVerbosity, setCoachVerbosity] = useState<Verbosity>("default");
  // Scoring mode: "default" is musical-feel focused; "pro" grades against
  // the full beat grid for players pushing accuracy.
  const [coachMode, setCoachMode] = useState<CoachMode>("default");
  const [availableVoices, setAvailableVoices] = useState<[string, string][]>(
    [],
  );
  // Per-voice diagnostic flags driven by `tts_voice_diagnostics`. Lets
  // the Settings UI render a per-voice "Repair" button when a voice is
  // missing on disk, has a corrupted .onnx (size < MIN_ONNX_BYTES), or
  // when the Piper engine itself is broken (dylibs / binary missing).
  // Kept alongside `availableVoices` so existing call sites that only
  // need the ready list don't have to adapt.
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<VoiceDiagnostic[]>(
    [],
  );
  // Voice playback gain (0..1). Lives next to the metronome volume in the
  // unified header slider so users can tame the coach independently.
  const [ttsVolume, setTtsVolumeState] = useState<number>(1.0);

  // Load all Practice Coach settings from store on mount.
  useEffect(() => {
    getModelStatus().then(setModelStatus);
    // Asked once on mount — physical RAM does not change while the app
    // runs, and a failure just leaves the Studio tier ungated.
    getSystemMemoryMb().then(setSystemMemoryMb).catch(() => {});
    storeLoad<BrainTier>("coachBrainTier").then((v) => {
      // Raw setter: restoring a persisted "off" at startup is not the
      // user switching the brain off, and nothing is resident yet.
      if (v) setCoachBrainTierState(v);
    });
    storeLoad<PersistedVoiceMode>("coachVoiceMode").then((v) => {
      if (!v) return;
      if (v === "chime") {
        // One-time migration: chime mode no longer exists. Anyone who had
        // it selected falls back to silent and we rewrite the store so the
        // legacy value doesn't reappear on the next launch.
        setCoachVoiceMode("silent");
        storeSave("coachVoiceMode", "silent");
        return;
      }
      setCoachVoiceMode(v);
    });
    storeLoad<string>("coachVoiceName").then((v) => {
      if (v) {
        setCoachVoiceName(v);
        ttsSetVoice(v);
      }
    });
    storeLoad<Verbosity>("coachVerbosity").then((v) => {
      if (v === "default" || v === "more") setCoachVerbosity(v);
    });
    storeLoad<CoachMode>("coachMode").then((v) => {
      if (v === "default" || v === "pro") setCoachMode(v);
    });
    storeLoad<number>("coachTtsVolume").then((v) => {
      if (typeof v === "number" && Number.isFinite(v)) {
        const clamped = Math.max(0, Math.min(1, v));
        setTtsVolumeState(clamped);
        ttsSetVolume(clamped).catch(() => {});
      }
    });
    ttsListVoices().then(setAvailableVoices);
    ttsVoiceDiagnostics().then(setVoiceDiagnostics).catch(() => {});
  }, []);

  // Setter wrapper: persist + push the new gain into the Rust TTS engine so
  // the next afplay invocation honours it. Errors are swallowed because the
  // backend simply ignores out-of-range values via clamp.
  const setTtsVolume = useCallback((volume: number) => {
    const clamped = Math.max(0, Math.min(1, volume));
    setTtsVolumeState(clamped);
    storeSave("coachTtsVolume", clamped);
    ttsSetVolume(clamped).catch(() => {});
  }, []);

  const handleStartDownload = useCallback(async (tier: ModelTier) => {
    setModelDownloading(true);
    setDownloadingTier(tier);
    setPendingDownloadTier(null);
    setDownloadError(null);
    setDownloadSuccess(false);
    setDownloadProgress({
      component: "brain",
      downloadedBytes: 0,
      totalBytes: 0,
      fraction: 0,
      done: false,
    });
    try {
      await startModelDownload(MODEL_URLS[tier], "brain", "model.bin", tier);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
      setModelDownloading(false);
      setDownloadProgress(null);
      setDownloadingTier(null);
    }
  }, []);

  // Subscribe to backend progress / completion events.
  useEffect(() => {
    const unsubProgress = onDownloadProgress((progress) => {
      setDownloadProgress(progress);
      if (progress.done) {
        getModelStatus().then(setModelStatus);
      }
    });
    const unsubComplete = onDownloadComplete((result) => {
      if (result.success && result.tier) {
        // Full brain+voices install path — tier present, persist + flip
        // the active brain tier.
        //
        // Deliberately NOT loading the model here. Downloading weights is
        // not the same act as wanting them in RAM: Settings shows "ready
        // — loads when you start a session" and the next `startSession`
        // picks them up. Because `load_coach_model` fingerprints the file
        // (path + size + mtime), an "Update brain" that lands while a
        // session is running is picked up by the session after it — the
        // old weights are never left answering forever.
        setCoachBrainTier(result.tier as ModelTier);
        storeSave("coachBrainTier", result.tier);
        setDownloadSuccess(true);
        getModelStatus().then(setModelStatus);
        ttsListVoices().then(setAvailableVoices);
        ttsVoiceDiagnostics().then(setVoiceDiagnostics).catch(() => {});
      } else if (result.success) {
        // Per-voice repair path — no `tier` field on the event so we
        // don't clobber the active brain tier. Still refresh model
        // status + diagnostics so the UI reflects the freshly-repaired
        // voice (the previously disabled toggle should now light up).
        setDownloadSuccess(true);
        getModelStatus().then(setModelStatus);
        ttsListVoices().then(setAvailableVoices);
        ttsVoiceDiagnostics().then(setVoiceDiagnostics).catch(() => {});
      } else if (!result.cancelled && result.error) {
        setDownloadError(result.error);
      }
      setModelDownloading(false);
      setDownloadProgress(null);
      setDownloadingTier(null);
    });

    return () => {
      unsubProgress.then((u) => u());
      unsubComplete.then((u) => u());
    };
  }, []);

  const cancelDownload = useCallback(() => {
    cancelModelDownload();
  }, []);

  return {
    // model state
    modelStatus,
    setModelStatus,
    modelDownloading,
    downloadProgress,
    downloadError,
    setDownloadError,
    downloadSuccess,
    setDownloadSuccess,
    downloadingTier,
    pendingDownloadTier,
    setPendingDownloadTier,
    // Tier gating / migration — all three decided in Rust against the RAM
    // the OS actually reports and the family marker on disk. `systemMemoryMb`
    // is kept for copy ("this machine has 16 GB"), not for gating.
    systemMemoryMb,
    studioAvailable: studioAvailable(modelStatus),
    standardAvailable: standardAvailable(modelStatus),
    brainUpdateAvailable: needsBrainUpdate(modelStatus),
    // coach prefs
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
    availableVoices,
    voiceDiagnostics,
    ttsVolume,
    setTtsVolume,
    // actions
    handleStartDownload,
    cancelDownload,
  };
}

export type UseCoachDownloadReturn = ReturnType<typeof useCoachDownload>;
