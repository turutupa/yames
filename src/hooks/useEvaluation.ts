import { useState, useEffect, useRef, useCallback } from "react";
import { storeLoad, storeSave } from "../ipc";
import { listAudioInputDevices, startEvaluation, stopEvaluation, getEvaluationState, onAudioSpectrum, onAudioInputDevicesChanged, onBeatFeedback, onInferredGridChanged, setInputGain } from "../ipc.desktop";
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

  /**
   * Every start and stop of the input, one after another.
   *
   * `start_evaluation` and `stop_evaluation` are async commands: two sent
   * without waiting run on two runtime threads, in either order. A stop sent
   * just before a start could land after it and leave the input off while
   * the screen says it is on (2026-11-16, B1: a Session started right after
   * Exit could not hear the guitar). So each one waits for the last, and
   * decides what to do when its turn comes, from the state as it is then. A
   * call made during a restart used to be dropped, which was the same
   * silence by another road; now it waits its turn.
   */
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const serial = useCallback(<T,>(work: () => Promise<T>): Promise<T> => {
    const next = chain.current.then(work, work);
    chain.current = next.catch(() => {});
    return next;
  }, []);
  /** What the queued calls leave the input at, ahead of them running. */
  const wantRef = useRef(false);
  /** A start, stop or restart has been asked for since mount. */
  const touchedRef = useRef(false);
  /**
   * Bumped by every on/off asked for. A call that finishes may correct
   * `wantRef` to what really happened (a start that failed) only while no
   * newer on/off has been asked: otherwise it would undo the newer one, and a
   * `toggle` made then would flip the wrong way.
   */
  const intentRef = useRef(0);

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
    getEvaluationState().then((on) => {
      // Only before any start or stop of ours: after one, it knows better.
      if (touchedRef.current) return;
      wantRef.current = on;
      enabledRef.current = on;
      setEnabled(on);
    });
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

  /** Start or stop now (inside `serial`), unless it already is. */
  const apply = useCallback(async (on: boolean, device?: string, channel?: number) => {
    if (on === enabledRef.current) return;
    if (on) {
      await refreshDevices();
      await startEvaluation(
        device ?? selectedDeviceRef.current,
        channel ?? selectedChannelRef.current,
        coachModeRef.current,
      );
    } else {
      await stopEvaluation();
    }
    enabledRef.current = on;
    setEnabled(on);
  }, [refreshDevices]);

  /**
   * Explicit start/stop, as opposed to `toggle`'s flip.
   *
   * The wizard's W5 (level meter) and W6 ("hear it work") mount and unmount
   * around the same shared stream, so they need "make sure it is on/off" rather
   * than "invert it" — a `toggle` racing an unmount cleanup ends with the
   * stream in the wrong state. Idempotent, and in turn with every other start,
   * stop and restart (`serial`), so the last call made is the state it ends in.
   */
  const setListening = useCallback(
    (on: boolean) => {
      wantRef.current = on;
      touchedRef.current = true;
      const intent = ++intentRef.current;
      return serial(async () => {
        try {
          await apply(on);
        } finally {
          // A start that failed leaves it off, whatever was asked; only the
          // latest intent may say so.
          if (intentRef.current === intent) wantRef.current = enabledRef.current;
        }
      });
    },
    [serial, apply],
  );

  /** Flip what the calls made so far leave it at, not what the last render saw. */
  const toggle = useCallback(() => setListening(!wantRef.current), [setListening]);

  /** Restart on another device or channel, if it is on when its turn comes. */
  const restart = useCallback(
    (device: string | undefined, channel: number) => {
      touchedRef.current = true;
      // A restart is no new on/off: it corrects `wantRef` only if none was
      // asked for after it.
      const intent = intentRef.current;
      return serial(async () => {
        if (!enabledRef.current) return;
        await stopEvaluation();
        enabledRef.current = false;
        try {
          await startEvaluation(device, channel, coachModeRef.current);
          enabledRef.current = true;
        } finally {
          setEnabled(enabledRef.current);
          if (intentRef.current === intent) wantRef.current = enabledRef.current;
        }
      });
    },
    [serial],
  );

  const selectDevice = useCallback(async (deviceName: string) => {
    setSelectedDevice(deviceName);
    selectedDeviceRef.current = deviceName;
    // Reset channel to 0 when device changes (per task spec).
    setSelectedChannel(0);
    selectedChannelRef.current = 0;
    await storeSave("evaluationDevice", deviceName);
    await storeSave("evaluationChannel", 0);
    // Apply this device's persisted gain before (re)starting the stream so
    // the DSP sees boosted samples from the very first callback.
    await applyPersistedGain(deviceName);
    // If currently active, restart with new device (channel 0).
    await restart(deviceName, 0);
  }, [restart]);

  const selectChannel = useCallback(async (channel: number) => {
    setSelectedChannel(channel);
    selectedChannelRef.current = channel;
    await storeSave("evaluationChannel", channel);
    // If currently active, restart with the new channel immediately.
    await restart(selectedDeviceRef.current, channel);
  }, [restart]);

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
