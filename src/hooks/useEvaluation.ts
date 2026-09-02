import { useState, useEffect, useRef, useCallback } from "react";
import {
  listAudioInputDevices,
  startEvaluation,
  stopEvaluation,
  getEvaluationState,
  onAudioSpectrum,
  onAudioInputDevicesChanged,
  onBeatFeedback,
  onInferredGridChanged,
  setInputGain,
  storeLoad,
  storeSave,
} from "../ipc";
import type { AudioInputDevice, AudioSpectrum, BeatFeedback, InferredGridChanged } from "../types";

/**
 * Default input-gain (dB) applied when a device has no persisted value.
 * +20 dB is a sane baseline for typical guitar/interface input chains —
 * matches the `AudioInputTestModal` initial state. Keep this in sync.
 */
const DEFAULT_INPUT_GAIN_DB = 20;

/** Resolve the per-device input-gain store key. */
function gainStoreKey(device: string | undefined): string {
  return `inputGain_${device ?? "__default"}`;
}

/**
 * Load the persisted input gain for the given device and push it to the
 * Rust DSP. Without this, the cpal callback runs at unity (0 dB) until the
 * user opens the tester modal, which silently capped scoring for users with
 * a quiet input (e.g. unboosted electric guitar).
 */
async function applyPersistedGain(device: string | undefined): Promise<void> {
  const saved = await storeLoad<number>(gainStoreKey(device));
  await setInputGain(saved ?? DEFAULT_INPUT_GAIN_DB);
}

/** Colors matching feedback classifications — reads theme CSS vars */
export const FEEDBACK_COLORS = {
  get perfect() { return getComputedStyle(document.documentElement).getPropertyValue("--feedback-perfect").trim() || "#10b981"; },
  get good() { return getComputedStyle(document.documentElement).getPropertyValue("--feedback-good").trim() || "#06b6d4"; },
  get ok() { return getComputedStyle(document.documentElement).getPropertyValue("--feedback-ok").trim() || "#f59e0b"; },
  get miss() { return getComputedStyle(document.documentElement).getPropertyValue("--feedback-miss").trim() || "#6b7280"; },
  skipped: "transparent",
};

export function useEvaluation(options?: { coachMode?: "default" | "pro" }) {
  const [enabled, setEnabled] = useState(false);
  const [devices, setDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string | undefined>(undefined);
  /** 0-indexed channel index (0 = default, matches Rust-side). */
  const [selectedChannel, setSelectedChannel] = useState<number>(0);

  // Keep a ref so that all three startEvaluation call sites always send the
  // current coachMode without needing it in their useCallback dep arrays.
  const coachModeRef = useRef<"default" | "pro">("default");
  useEffect(() => {
    coachModeRef.current = options?.coachMode ?? "default";
  }, [options?.coachMode]);
  const [spectrum, setSpectrum] = useState<AudioSpectrum | null>(null);
  const [showRealtime, setShowRealtime] = useState(true);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Beat feedback tracking
  const [lastFeedback, setLastFeedback] = useState<BeatFeedback | null>(null);
  const [dotFeedback, setDotFeedback] = useState<Map<number, BeatFeedback>>(new Map());
  const [recentDeviations, setRecentDeviations] = useState<number[]>([]);
  const feedbackUnlistenRef = useRef<(() => void) | null>(null);

  // Rhythm-inference (Path B): which divisor the matcher decided the
  // user is playing. Null when not locked / not enabled.
  const [inferredGrid, setInferredGrid] = useState<InferredGridChanged | null>(null);
  const gridUnlistenRef = useRef<(() => void) | null>(null);

  // Serialization flag: prevents concurrent stop+start races on the Rust Mutex
  // when the user changes device or channel rapidly. A second change fired while
  // a restart is in-flight is silently dropped — state updates still apply, but
  // the stream stays on the previous device/channel until the restart completes.
  const restartingRef = useRef(false);

  // Load saved preferences on mount + sync persisted input gain to Rust DSP.
  // This last step is critical: the cpal callback defaults to unity gain
  // on every app launch, so users with a quiet input were silently scored
  // against raw, unboosted audio until they happened to open the tester.
  useEffect(() => {
    (async () => {
      const savedDevice = await storeLoad<string>("evaluationDevice");
      if (savedDevice) setSelectedDevice(savedDevice);
      const savedRealtime = await storeLoad<boolean>("evaluationShowRealtime");
      if (savedRealtime !== undefined) setShowRealtime(savedRealtime);
      const savedChannel = await storeLoad<number>("evaluationChannel");
      if (savedChannel !== undefined && savedChannel !== null) setSelectedChannel(savedChannel);
      // Always push the persisted gain to Rust — even if no device is saved
      // yet (the "__default" bucket), so unity-gain is never the de facto
      // setting on first launch.
      await applyPersistedGain(savedDevice ?? undefined);
    })();
  }, []);

  // Subscribe to spectrum events when enabled
  useEffect(() => {
    if (!enabled) {
      setSpectrum(null);
      return;
    }
    let cancelled = false;
    onAudioSpectrum((s) => {
      if (!cancelled) setSpectrum(s);
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    });
    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [enabled]);

  // Subscribe to beat-feedback events when enabled
  useEffect(() => {
    if (!enabled) {
      setLastFeedback(null);
      setDotFeedback(new Map());
      setRecentDeviations([]);
      return;
    }
    let cancelled = false;
    onBeatFeedback((fb) => {
      if (cancelled) return;
      setLastFeedback(fb);
      // Update dot feedback map (keyed by beat position in measure — set by consumer)
      setDotFeedback((prev) => {
        const next = new Map(prev);
        next.set(fb.beatIndex, fb);
        return next;
      });
      // Track recent deviations for drift meter (skip misses and skipped)
      if (fb.classification !== "miss" && fb.classification !== "skipped") {
        setRecentDeviations((prev) => {
          const next = [...prev, fb.deviationMs];
          return next.slice(-16); // keep last 16
        });
      }
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        feedbackUnlistenRef.current = unlisten;
      }
    });
    return () => {
      cancelled = true;
      if (feedbackUnlistenRef.current) {
        feedbackUnlistenRef.current();
        feedbackUnlistenRef.current = null;
      }
    };
  }, [enabled]);

  // Subscribe to inferred-grid changes when enabled (Path B caption)
  useEffect(() => {
    if (!enabled) {
      setInferredGrid(null);
      return;
    }
    let cancelled = false;
    onInferredGridChanged((grid) => {
      if (cancelled) return;
      setInferredGrid(grid);
    }).then((unlisten) => {
      if (cancelled) {
        unlisten();
      } else {
        gridUnlistenRef.current = unlisten;
      }
    });
    return () => {
      cancelled = true;
      if (gridUnlistenRef.current) {
        gridUnlistenRef.current();
        gridUnlistenRef.current = null;
      }
    };
  }, [enabled]);

  // Sync with backend state on mount
  useEffect(() => {
    getEvaluationState().then(setEnabled);
    listAudioInputDevices().then(setDevices);
    const unlisten = onAudioInputDevicesChanged(setDevices);
    return () => { unlisten.then(fn => fn()); };
  }, []);

  const refreshDevices = useCallback(async () => {
    const devs = await listAudioInputDevices();
    setDevices(devs);
    return devs;
  }, []);

  /**
   * Latest values, for callbacks that must stay referentially stable.
   * `setListening` is called from effects in the onboarding wizard (O5): if its
   * identity changed whenever the device or channel changed, those effects
   * would re-run and stop/start the shared stream underneath the user.
   */
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const selectedDeviceRef = useRef(selectedDevice);
  selectedDeviceRef.current = selectedDevice;
  const selectedChannelRef = useRef(selectedChannel);
  selectedChannelRef.current = selectedChannel;

  /**
   * Explicit start/stop, as opposed to `toggle`'s flip.
   *
   * The wizard's W5 (level meter) and W6 ("hear it work") mount and unmount
   * around the same shared stream, so they need "make sure it is on/off" rather
   * than "invert it" — a `toggle` racing an unmount cleanup ends with the
   * stream in the wrong state. Idempotent, and shares `restartingRef` with
   * `selectDevice`/`selectChannel` so a call landing mid-restart is dropped
   * instead of opening a second stream on the same device.
   */
  const setListening = useCallback(async (on: boolean) => {
    if (on === enabledRef.current) return;
    if (restartingRef.current) return;
    restartingRef.current = true;
    try {
      if (on) {
        await refreshDevices();
        await startEvaluation(
          selectedDeviceRef.current,
          selectedChannelRef.current,
          coachModeRef.current,
        );
      } else {
        await stopEvaluation();
      }
      enabledRef.current = on;
      setEnabled(on);
    } finally {
      restartingRef.current = false;
    }
  }, [refreshDevices]);

  const toggle = useCallback(async () => {
    if (enabled) {
      await stopEvaluation();
      setEnabled(false);
    } else {
      await refreshDevices();
      await startEvaluation(selectedDevice, selectedChannel, coachModeRef.current);
      setEnabled(true);
    }
  }, [enabled, selectedDevice, selectedChannel, refreshDevices]);

  const selectDevice = useCallback(async (deviceName: string) => {
    setSelectedDevice(deviceName);
    // Reset channel to 0 when device changes (per task spec).
    setSelectedChannel(0);
    await storeSave("evaluationDevice", deviceName);
    await storeSave("evaluationChannel", 0);
    // Apply this device's persisted gain before (re)starting the stream so
    // the DSP sees boosted samples from the very first callback.
    await applyPersistedGain(deviceName);
    // If currently active, restart with new device (channel 0).
    if (enabled) {
      if (restartingRef.current) return;
      restartingRef.current = true;
      try {
        await stopEvaluation();
        await startEvaluation(deviceName, 0, coachModeRef.current);
      } finally {
        restartingRef.current = false;
      }
    }
  }, [enabled]);

  const selectChannel = useCallback(async (channel: number) => {
    setSelectedChannel(channel);
    await storeSave("evaluationChannel", channel);
    // If currently active, restart with the new channel immediately.
    if (enabled) {
      if (restartingRef.current) return;
      restartingRef.current = true;
      try {
        await stopEvaluation();
        await startEvaluation(selectedDevice, channel, coachModeRef.current);
      } finally {
        restartingRef.current = false;
      }
    }
  }, [enabled, selectedDevice]);

  const toggleRealtime = useCallback(async () => {
    const next = !showRealtime;
    setShowRealtime(next);
    await storeSave("evaluationShowRealtime", next);
  }, [showRealtime]);

  // Signal detection: true if any band has meaningful energy
  const hasSignal = spectrum != null && spectrum.rms > 0.01;

  // Average recent deviation for drift meter
  const avgDeviation = recentDeviations.length > 0
    ? recentDeviations.reduce((a, b) => a + b, 0) / recentDeviations.length
    : 0;

  return {
    enabled,
    toggle,
    setListening,
    devices,
    refreshDevices,
    selectedDevice,
    selectDevice,
    selectedChannel,
    selectChannel,
    spectrum,
    hasSignal,
    showRealtime,
    toggleRealtime,
    // Beat feedback
    lastFeedback,
    dotFeedback,
    recentDeviations,
    avgDeviation,
    // Rhythm inference (Path B caption)
    inferredGrid,
  };
}
