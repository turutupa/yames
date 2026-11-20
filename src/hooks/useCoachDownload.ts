import { useCallback, useEffect, useRef, useState } from "react";
import { storeLoad, storeSave } from "../ipc";
import { cancelModelDownload, getModelStatus, getSystemMemoryMb, onDownloadComplete, onDownloadProgress, startModelDownload, ttsListVoices, ttsSetVoice, ttsSetVolume, ttsVoiceDiagnostics } from "../ipc.desktop";
import type { DownloadProgress, ModelStatus, VoiceDiagnostic } from "../ipc.desktop";
import type { BrainTier, CoachMode, ModelTier, VoiceMode, Verbosity } from "../types";
import type { CoachStance } from "../coach/learningMode";
import { needsBrainUpdate, standardAvailable, studioAvailable } from "../coach/brainTiers";
import { registerCoachDownloadPort, restoreCoachModelChoice, setCoachModelChoice, setCoachModelDisk, setCoachModelDownload } from "./coachLoader";
import { useCoachModel } from "./useCoachModel";

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
 *
 * `models.rs` `BRAIN_ARTIFACTS` pins each of these beside its size and
 * SHA-256; `brainArtifacts.test.ts` holds the two lists equal, because a URL
 * Rust does not know downloads unchecked.
 */
export const MODEL_URLS: Record<ModelTier, string> = {
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

  /**
   * The model selector's choice. One state, held by the loader
   * (`hooks/coachLoader.ts`): Settings' tier buttons, the wizard and the
   * rail's selector all write it, and the loader loads, keeps or unloads the
   * model to match. Off unloads; it never deletes.
   */
  const coachBrainTier = useCoachModel().choice;
  const setCoachBrainTier = useCallback((tier: BrainTier) => {
    setCoachModelChoice(tier);
  }, []);
  // The loader learns what is on disk and how big the machine is from here.
  useEffect(() => {
    setCoachModelDisk(modelStatus, systemMemoryMb);
  }, [modelStatus, systemMemoryMb]);
  const [coachVoiceMode, setCoachVoiceMode] = useState<VoiceMode>("silent");
  const [coachVoiceName, setCoachVoiceName] = useState("lessac");
  // C5 verbosity. "default" honours the gatekeeper's tier verbatim.
  // "more" promotes written-tier events to spoken (see useSession).
  const [coachVerbosity, setCoachVerbosity] = useState<Verbosity>("default");
  // Scoring mode: "default" is musical-feel focused; "pro" grades against
  // the full beat grid for players pushing accuracy.
  const [coachMode, setCoachMode] = useState<CoachMode>("default");
  // How hard the coach is on you (ROADMAP 1.5). Independent of
  // `coachMode`: that one decides how the SCORE is computed, this one
  // decides how the coach talks about it. Strict is what has always
  // shipped.
  const [coachStance, setCoachStance] = useState<CoachStance>("strict");
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
    // The saved choice. The loader loads nothing before its startup gate
    // opens, after the first paint, and unloads nothing before this lands.
    storeLoad<BrainTier>("coachBrainTier")
      .then((v) => restoreCoachModelChoice(v))
      .catch(() => restoreCoachModelChoice(undefined));
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
    storeLoad<CoachStance>("coachStance").then((v) => {
      if (v === "strict" || v === "learning") setCoachStance(v);
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

  // ── The model selector's view of the download (ms1) ─────────────────
  // Whether the tier that finishes becomes the choice. Settings' tier
  // buttons and the wizard mean "use this one", so it does; the selector's
  // Download button means "fetch it", so the model is then there to pick
  // and nothing loads uninvited.
  const selectOnFinishRef = useRef(true);
  // The tier whose download is running, readable from the event handlers.
  const runningTierRef = useRef<ModelTier | null>(null);
  // Where the weights' download had got to, for a paused row.
  const brainFractionRef = useRef<number | null>(null);
  const brainBytesRef = useRef<{ downloaded: number; total: number } | null>(null);
  /**
   * A paused download. Rust's plain cancel kills curl and keeps the `.part`
   * file, and the next start resumes from it with `-C -` (after a restart
   * too: `ModelStatus.tiers[].partialBytes` brings it back to the row).
   */
  const [pausedDownload, setPausedDownload] = useState<{
    tier: ModelTier;
    fraction: number | null;
    downloadedBytes: number | null;
    totalBytes: number | null;
  } | null>(null);
  const [failedDownload, setFailedDownload] = useState<{
    tier: ModelTier;
    error: string;
    code: "space" | "checksum" | null;
  } | null>(null);
  /** A download the player cancelled: stopped, and its bytes removed. */
  const [cancelledTier, setCancelledTier] = useState<ModelTier | null>(null);

  const refreshStatus = useCallback(() => {
    getModelStatus().then(setModelStatus).catch(() => {});
  }, []);

  /**
   * Rust numbers downloads in the order they start, and every event carries
   * its download's number (`generation`). An event from a download older
   * than the one this hook started last is a stopped thread's late word
   * (Pause then a quick Resume, Cancel then Download) and must not clear the
   * newer download's state. `latestGenRef` is the highest number seen or
   * returned; `floorGenRef` the oldest still listened to. Events without a
   * number (an older backend) are taken as before.
   */
  const latestGenRef = useRef(0);
  const floorGenRef = useRef(0);

  const handleStartDownload = useCallback(async (tier: ModelTier, opts?: { select?: boolean }) => {
    // Anything numbered before this start is stale from here on, even before
    // Rust answers with this download's own number.
    floorGenRef.current = latestGenRef.current + 1;
    selectOnFinishRef.current = opts?.select ?? true;
    runningTierRef.current = tier;
    brainFractionRef.current = null;
    brainBytesRef.current = null;
    setPausedDownload(null);
    setFailedDownload(null);
    setCancelledTier(null);
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
      const generation = await startModelDownload(MODEL_URLS[tier], "brain", "model.bin", tier);
      if (typeof generation === "number") {
        latestGenRef.current = Math.max(latestGenRef.current, generation);
        floorGenRef.current = generation;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setDownloadError(msg);
      setFailedDownload({ tier, error: msg, code: null });
      runningTierRef.current = null;
      setModelDownloading(false);
      setDownloadProgress(null);
      setDownloadingTier(null);
    }
  }, []);

  // Subscribe to backend progress / completion events.
  useEffect(() => {
    /** False for a stale download's event; notes the number otherwise. */
    const current = (generation: number | undefined) => {
      if (typeof generation !== "number") return true;
      if (generation < floorGenRef.current) return false;
      latestGenRef.current = Math.max(latestGenRef.current, generation);
      return true;
    };
    const unsubProgress = onDownloadProgress((progress) => {
      if (!current(progress.generation)) return;
      if (progress.component === "brain" && progress.stage !== "checking") {
        brainFractionRef.current = progress.fraction;
        if (progress.totalBytes > 0) {
          brainBytesRef.current = { downloaded: progress.downloadedBytes, total: progress.totalBytes };
        }
      }
      setDownloadProgress(progress);
      if (progress.done) {
        getModelStatus().then(setModelStatus);
      }
    });
    const unsubComplete = onDownloadComplete((result) => {
      if (!current(result.generation)) return;
      const ranTier = runningTierRef.current;
      runningTierRef.current = null;
      if (ranTier && result.cancelled && result.discarded) {
        setCancelledTier(ranTier);
      } else if (ranTier && result.cancelled) {
        const bytes = brainBytesRef.current;
        setPausedDownload({
          tier: ranTier,
          fraction: brainFractionRef.current,
          downloadedBytes: bytes?.downloaded ?? null,
          totalBytes: bytes?.total ?? null,
        });
      } else if (ranTier && !result.success) {
        setFailedDownload({ tier: ranTier, error: result.error ?? "", code: result.code ?? null });
      }
      // What a stop left on disk (a kept part, a removed one) is Rust's to say.
      if (!result.success) refreshStatus();
      if (result.success && result.tier) {
        // Full brain+voices install path — tier present, persist + flip
        // the active brain tier.
        //
        // From Settings or the wizard, the tier downloaded becomes the
        // choice (from the selector it is only there to pick), and the loader takes it
        // from there (`hooks/coachLoader.ts`): it loads when no Take is
        // running, and because `load_coach_model` fingerprints the file
        // (path + size + mtime), new weights for a resident model are
        // swapped in on Rust's side rather than left answering forever.
        if (selectOnFinishRef.current) {
          setCoachBrainTier(result.tier as ModelTier);
          storeSave("coachBrainTier", result.tier);
        }
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
  }, [refreshStatus]);

  /** Pause: Rust stops the transfer and keeps the bytes for the next start. */
  const cancelDownload = useCallback(() => {
    cancelModelDownload();
  }, []);

  /**
   * Cancel: stop `tier`'s download and remove its bytes. A running one is
   * removed by Rust's download thread once curl has stopped (the complete
   * event then says `discarded`); a paused one is removed at once.
   */
  const discardDownload = useCallback(
    (tier: ModelTier) => {
      const opts = { discard: true, tier, url: MODEL_URLS[tier] };
      if (runningTierRef.current === tier) {
        void cancelModelDownload(opts).catch(() => {});
        return;
      }
      setPausedDownload((p) => (p?.tier === tier ? null : p));
      setFailedDownload((f) => (f?.tier === tier ? null : f));
      cancelModelDownload(opts)
        .then(() => setCancelledTier(tier))
        .catch((err) => {
          setFailedDownload({ tier, error: err instanceof Error ? err.message : String(err), code: null });
        })
        .finally(refreshStatus);
    },
    [refreshStatus],
  );

  // The selector reads the download from the loader's snapshot, and starts,
  // pauses or cancels it through this port: it is the same download Settings
  // runs, never a second one. Nothing here starts a download by itself.
  useEffect(
    () =>
      registerCoachDownloadPort({
        start: (tier) => void handleStartDownload(tier, { select: false }),
        pause: cancelDownload,
        cancel: discardDownload,
      }),
    [handleStartDownload, cancelDownload, discardDownload],
  );
  useEffect(() => {
    if (downloadingTier) {
      const p = downloadProgress;
      const voices = !!p && p.component !== "brain";
      const checking = !!p && p.component === "brain" && p.stage === "checking";
      setCoachModelDownload({
        tier: downloadingTier,
        phase: "running",
        stage: voices ? "voices" : checking ? "checking" : "brain",
        fraction: p && p.fraction > 0 ? p.fraction : null,
        downloadedBytes: p && !voices && p.totalBytes > 0 ? p.downloadedBytes : null,
        totalBytes: p && !voices && p.totalBytes > 0 ? p.totalBytes : null,
        error: null,
        code: null,
      });
    } else if (pausedDownload) {
      setCoachModelDownload({ ...pausedDownload, phase: "paused", stage: "brain", error: null, code: null });
    } else if (failedDownload) {
      setCoachModelDownload({
        tier: failedDownload.tier,
        phase: "failed",
        stage: "brain",
        fraction: null,
        error: failedDownload.error,
        code: failedDownload.code,
      });
    } else if (cancelledTier) {
      setCoachModelDownload({ tier: cancelledTier, phase: "cancelled", stage: "brain", fraction: null, error: null, code: null });
    } else {
      setCoachModelDownload(null);
    }
  }, [downloadingTier, downloadProgress, pausedDownload, failedDownload, cancelledTier]);

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
    coachStance,
    setCoachStance,
    availableVoices,
    voiceDiagnostics,
    ttsVolume,
    setTtsVolume,
    // actions
    handleStartDownload,
    /** Pause: keeps the bytes. */
    cancelDownload,
    /** Cancel: stops the tier's download and removes its bytes. */
    discardDownload,
    refreshStatus,
  };
}

export type UseCoachDownloadReturn = ReturnType<typeof useCoachDownload>;
