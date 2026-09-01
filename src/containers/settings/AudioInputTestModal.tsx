import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { AudioInputDevice, AudioSpectrum } from "../../types";
import {
  listAudioInputDevices,
  startEvaluation,
  stopEvaluation,
  onAudioSpectrum,
  storeSave,
  storeLoad,
  setInputGain,
  startRecording,
  stopRecording,
  startPlayback,
  stopPlayback,
  discardRecording,
  getWaveform,
  onPlaybackFinished,
} from "../../ipc";
import { ChannelDropdown } from "../../components/ChannelDropdown";

interface Props {
  open: boolean;
  onClose: () => void;
  selectedDevice: string | undefined;
  onDeviceChange: (device: string) => void;
  initialDevices?: AudioInputDevice[];
  /** If true, evaluation stream is already running — skip start/stop */
  evaluationActive?: boolean;
  /** 0-indexed channel index to capture (matches the channel picker in settings). */
  inputChannel?: number;
  /** Called when the user changes channel inside the modal, so the parent
   *  can persist the selection and keep settings in sync. */
  onChannelChange?: (ch: number) => void;
}

type RecState = "idle" | "recording" | "recorded" | "playing";

export default function AudioInputTestModal({ open, onClose, selectedDevice, onDeviceChange, initialDevices, evaluationActive, inputChannel = 0, onChannelChange }: Props) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<AudioInputDevice[]>(initialDevices ?? []);
  const [listening, setListening] = useState(false);
  const [spectrum, setSpectrum] = useState<AudioSpectrum | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);

  // Smoothed RMS for stable dB display
  const smoothRmsRef = useRef(0);

  // Debounced signal status
  const [hasSignal, setHasSignal] = useState(false);
  const signalTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Recording/playback state
  const [recState, setRecState] = useState<RecState>("idle");
  const [recDuration, setRecDuration] = useState(0);
  const [recElapsed, setRecElapsed] = useState(0);
  const [waveform, setWaveform] = useState<number[]>([]);
  const [playProgress, setPlayProgress] = useState(0);
  const [inputGainDb, setInputGainDb] = useState(20); // 0 to +40 dB, default +20
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const playbackUnlistenRef = useRef<(() => void) | null>(null);
  // Live waveform sampled every 100ms during recording
  const liveWaveformRef = useRef<number[]>([]);
  const [liveWaveform, setLiveWaveform] = useState<number[]>([]);

  // Stream-settling: true while a new device/channel stream is spinning up.
  // Cleared by the first spectrum event (cpal only emits once the stream is
  // actually running) or after a 3s safety timeout.
  const [streamSettling, setStreamSettling] = useState(true);
  const streamSettlingRef = useRef(true);
  const settlingTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Load devices when modal opens
  useEffect(() => {
    if (open) {
      // Refresh device list in background (initialDevices provides instant display)
      listAudioInputDevices().then(setDevices);
      // Restore saved gain for current device
      storeLoad<number>(`inputGain_${selectedDevice ?? "__default"}`).then((g) => {
        const gain = g ?? 20;
        setInputGainDb(gain);
        setInputGain(gain);
      });
    } else {
      // Clean up everything when modal closes
      if (listening) stopEvaluation();
      setListening(false);
      setSpectrum(null);
      setHasSignal(false);
      smoothRmsRef.current = 0;
      setRecState("idle");
      setRecDuration(0);
      setRecElapsed(0);
      setWaveform([]);
      setPlayProgress(0);
      liveWaveformRef.current = [];
      setLiveWaveform([]);
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
      if (playbackUnlistenRef.current) { playbackUnlistenRef.current(); playbackUnlistenRef.current = null; }
      clearInterval(timerRef.current);
      clearTimeout(signalTimerRef.current);
      // Reset settling so the next open starts with the button disabled until
      // the stream fires its first spectrum event.
      clearTimeout(settlingTimerRef.current);
      streamSettlingRef.current = true;
      setStreamSettling(true);
    }
  }, [open]);

  // Start listening automatically when modal opens
  useEffect(() => {
    if (!open) return;
    if (evaluationActive) {
      // Stream already running — just subscribe to events, no settling needed
      setListening(true);
      streamSettlingRef.current = false;
      setStreamSettling(false);
      return;
    }
    const start = async () => {
      await startEvaluation(selectedDevice, inputChannel);
      setListening(true);
    };
    start();
    return () => {
      if (!evaluationActive) {
        stopEvaluation();
      }
      setListening(false);
    };
  // NOTE: inputChannel is intentionally NOT in the dep array. Channel changes
  // are handled exclusively by handleChannelChange, which restarts the stream
  // directly. Including inputChannel here would cause a second restart every
  // time the channel is changed (once from handleChannelChange, once from this
  // effect reacting to the parent's selectedChannel updating) → double stream
  // open on the same CoreAudio device → crash.
  //
  // NOTE: selectedDevice is also intentionally NOT in the dep array for the
  // same reason. Device changes are handled exclusively by handleDeviceChange,
  // which does its own stop+start. Including selectedDevice here causes a
  // second startEvaluation() every time the device is changed (once from
  // handleDeviceChange, once from this effect) → two live CoreAudio streams
  // both writing to recording_buf → double samples → slow-mo playback.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, evaluationActive]);

  // Intercept Escape so it closes only the modal, not the whole settings panel.
  // Use capture phase (third arg = true) so this fires before any bubble-phase
  // handler that the settings overlay might have registered.
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [open, onClose]);

  // Subscribe to spectrum events
  useEffect(() => {
    if (!open || !listening) return;
    let cancelled = false;
    onAudioSpectrum((s) => {
      if (!cancelled) {
        setSpectrum(s);
        // First spectrum event = stream is fully up and ready to record.
        // cpal only emits once the CoreAudio stream is actually running,
        // making this the correct "device ready" signal.
        if (streamSettlingRef.current) {
          streamSettlingRef.current = false;
          setStreamSettling(false);
          clearTimeout(settlingTimerRef.current);
          settlingTimerRef.current = undefined;
        }
      }
    }).then((unlisten) => {
      if (cancelled) unlisten();
      else unlistenRef.current = unlisten;
    });
    return () => {
      cancelled = true;
      if (unlistenRef.current) { unlistenRef.current(); unlistenRef.current = null; }
    };
  }, [open, listening]);

  const handleDeviceChange = useCallback(async (deviceName: string) => {
    onDeviceChange(deviceName);
    await storeSave("evaluationDevice", deviceName);
    // Only restart when the modal owns the stream lifecycle (evaluationActive=false).
    // When evaluationActive=true, onDeviceChange → evaluation.selectDevice already
    // handles the stop/start + channel reset — don't race it.
    if (listening && !evaluationActive) {
      // Mark as settling while the new device's stream spins up.
      // Cleared on first spectrum event (or 3s safety timeout).
      clearTimeout(settlingTimerRef.current);
      streamSettlingRef.current = true;
      setStreamSettling(true);
      settlingTimerRef.current = setTimeout(() => {
        streamSettlingRef.current = false;
        setStreamSettling(false);
        settlingTimerRef.current = undefined;
      }, 3000);
      await stopEvaluation();
      // When device changes, reset to channel 0 — channel indices are
      // device-specific and may not be valid on the new device.
      await startEvaluation(deviceName || undefined, 0);
      onChannelChange?.(0);
    }
    // Restore saved gain for new device. Default to the same +20 dB baseline
    // we use on first mount — anything else creates an inconsistency where
    // switching devices silently drops your gain to 0 dB even though a
    // brand-new device starts at +20.
    const savedGain = await storeLoad<number>(`inputGain_${deviceName || "__default"}`);
    const gain = savedGain ?? 20;
    setInputGainDb(gain);
    setInputGain(gain);
    // Reset recording state on device change
    setRecState("idle");
    setWaveform([]);
  }, [evaluationActive, listening, onDeviceChange, onChannelChange]);

  const handleChannelChange = useCallback(async (ch: number) => {
    onChannelChange?.(ch);
    // Only restart evaluation when the modal owns the stream lifecycle.
    // When evaluationActive=true the parent (useEvaluation.selectChannel) already
    // restarts the stream via onChannelChange — doing it again here causes a
    // double stop/start race on the SharedAudioInput mutex → spinner of death.
    if (listening && !evaluationActive) {
      // Mark as settling while the new channel's stream spins up.
      clearTimeout(settlingTimerRef.current);
      streamSettlingRef.current = true;
      setStreamSettling(true);
      settlingTimerRef.current = setTimeout(() => {
        streamSettlingRef.current = false;
        setStreamSettling(false);
        settlingTimerRef.current = undefined;
      }, 3000);
      await stopEvaluation();
      await startEvaluation(selectedDevice, ch);
    }
  }, [evaluationActive, listening, selectedDevice, onChannelChange]);

  const handleGainChange = useCallback((db: number) => {
    setInputGainDb(db);
    storeSave(`inputGain_${selectedDevice ?? "__default"}`, db);
    setInputGain(db);
  }, [selectedDevice]);

  // ─── Recording ──────────────────────────────────────────────

  const handleRecord = useCallback(async () => {
    liveWaveformRef.current = [];
    setLiveWaveform([]);
    try {
      await startRecording();
    } catch (err) {
      // Stream may not be ready yet (e.g. rapid channel change still settling).
      // Reset quietly rather than leaving the UI stuck in a half-recording state.
      console.error("[AudioInputTestModal] start_recording failed:", err);
      liveWaveformRef.current = [];
      setLiveWaveform([]);
      return;
    }
    setRecState("recording");
    setRecElapsed(0);
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setRecElapsed(elapsed);
      // Sample dB-scaled RMS for the live waveform display
      const rms = smoothRmsRef.current;
      const db = rms > 0.00001 ? 20 * Math.log10(rms) : -60;
      const barH = Math.max(0, Math.min(1, (Math.max(-60, db) + 60) / 60));
      liveWaveformRef.current = [...liveWaveformRef.current, barH];
      setLiveWaveform([...liveWaveformRef.current]);
      if (elapsed >= 10) {
        // Auto-stop at 10 seconds
        handleStopRecording();
      }
    }, 100);
  }, []);

  const handleStopRecording = useCallback(async () => {
    clearInterval(timerRef.current);
    liveWaveformRef.current = [];
    setLiveWaveform([]);
    const duration = await stopRecording();
    setRecDuration(duration);
    const wf = await getWaveform();
    setWaveform(wf);
    setRecState("recorded");
  }, []);

  const handlePlay = useCallback(async () => {
    setRecState("playing");
    setPlayProgress(0);
    await startPlayback();
    const start = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setPlayProgress(Math.min(elapsed / recDuration, 1));
    }, 50);
    // Listen for playback finished
    onPlaybackFinished(() => {
      clearInterval(timerRef.current);
      setPlayProgress(0);
      setRecState("recorded");
    }).then((unlisten) => {
      playbackUnlistenRef.current = unlisten;
    });
  }, [recDuration]);

  const handleStopPlayback = useCallback(async () => {
    clearInterval(timerRef.current);
    await stopPlayback();
    setPlayProgress(0);
    setRecState("recorded");
  }, []);

  const handleDiscard = useCallback(async () => {
    await discardRecording();
    setRecState("idle");
    setWaveform([]);
    liveWaveformRef.current = [];
    setLiveWaveform([]);
    setRecDuration(0);
  }, []);

  if (!open) return null;

  // Derive channel info from the current device list entry.
  const selectedDeviceObj = devices.find((d) => d.name === selectedDevice);
  const modalChannelCount = selectedDeviceObj?.channels ?? 0;
  const modalIsInterface = selectedDeviceObj?.isInterface ?? false;

  const rawRms = spectrum?.rms ?? 0;

  // Smooth RMS with EMA for stable dB readout
  const alpha = 0.3; // lower = smoother
  smoothRmsRef.current = smoothRmsRef.current * (1 - alpha) + rawRms * alpha;
  const rms = smoothRmsRef.current;

  const dbValue = rms > 0.0001 ? 20 * Math.log10(rms) : -60;
  const dbClamped = Math.max(-60, Math.min(0, dbValue));
  const levelPct = ((dbClamped + 60) / 60) * 100;
  const bands = spectrum?.bands ?? new Array(16).fill(0);

  // Debounce signal status — require 500ms of consistent state before switching
  const signalNow = rawRms > 0.01;
  if (signalNow !== hasSignal) {
    if (!signalTimerRef.current) {
      signalTimerRef.current = setTimeout(() => {
        setHasSignal(signalNow);
        signalTimerRef.current = undefined;
      }, signalNow ? 100 : 800); // fast on, slow off
    }
  } else {
    if (signalTimerRef.current) {
      clearTimeout(signalTimerRef.current);
      signalTimerRef.current = undefined;
    }
  }

  return (
    <div className="input-test-modal-overlay" onClick={onClose}>
      <div className="input-test-modal" onClick={(e) => e.stopPropagation()}>
        <div className="input-test-modal-header">
          <h3>{t("settings.inputTest.title")}</h3>
          <button className="input-test-modal-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="input-test-modal-body">
          {/* Device + channel + hint grouped so the body's 20px gap only
              applies once for this whole block, not for each sub-item. */}
          <div className="input-test-device-area">
            <div className="input-test-device-row">
              <label className="input-test-label">{t("settings.inputTest.device")}</label>
              <InputDeviceDropdown
                devices={devices}
                value={selectedDevice ?? ""}
                onChange={handleDeviceChange}
              />
            </div>
            {modalChannelCount > 1 && (
              <ChannelDropdown
                channelCount={modalChannelCount}
                value={inputChannel}
                isInterface={modalIsInterface}
                onChange={handleChannelChange}
              />
            )}
            {inputChannel >= 2 && modalIsInterface && (
              <span className="channel-picker-hint" title={t("settings.devices.loopbackHint")}>
                {t("settings.devices.loopback")}
              </span>
            )}
          </div>

          <div className="input-test-gain-section">
            <div className="input-test-meter-label">
              <span>{t("settings.inputTest.sensitivity")}</span>
              <span className="input-test-db">{inputGainDb > 0 ? `+${inputGainDb}` : inputGainDb} dB</span>
            </div>
            <input
              type="range"
              className="input-test-gain-slider"
              min={0}
              max={40}
              step={1}
              value={inputGainDb}
              onChange={(e) => handleGainChange(Number(e.target.value))}
            />
          </div>

          <div className="input-test-meter-section">
            <div className="input-test-meter-label">
              <span>{t("settings.inputTest.level")}</span>
              <span className="input-test-db">{dbClamped > -59 ? `${Math.round(dbClamped)} dB` : "-\u221E dB"}</span>
            </div>
            <div className="input-test-meter-track">
              <div
                className={`input-test-meter-fill ${levelPct > 90 ? "clipping" : levelPct > 70 ? "hot" : ""}`}
                style={{ width: `${levelPct}%` }}
              />
              <div className="input-test-meter-ticks">
                <span>-60</span>
                <span>-40</span>
                <span>-20</span>
                <span>0 dB</span>
              </div>
            </div>
          </div>

          <div className="input-test-spectrum-section">
            <div className="input-test-meter-label">
              <span>{t("settings.inputTest.frequency")}</span>
            </div>
            <div className="input-test-spectrum">
              {bands.map((level, i) => (
                <div key={i} className="input-test-spectrum-col">
                  <div
                    className={`input-test-spectrum-bar ${level > 0.8 ? "hot" : ""}`}
                    style={{ height: `${level * 100}%` }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ─── Record / Playback section ─── */}
          <div className="input-test-rec-section">
            <div className="input-test-meter-label">
              <span>{t("settings.inputTest.recordPlayback")}</span>
              <span className="input-test-rec-time">
                {recState === "recording" ? `${recElapsed.toFixed(1)}s / 10s` :
                 (recState === "recorded" || recState === "playing") ? `${recDuration.toFixed(1)}s` :
                 "\u00A0"}
              </span>
            </div>

            {/* Fixed-height area for waveform / progress bar */}
            <div className="input-test-rec-display">
              {(recState === "recorded" || recState === "playing") && waveform.length > 0 ? (
                <div className="input-test-waveform">
                  <div className="input-test-waveform-bars">
                    {waveform.map((level, i) => (
                      <div key={i} className="input-test-waveform-col">
                        <div
                          className={`input-test-waveform-bar ${
                            recState === "playing" && i / waveform.length <= playProgress ? "played" : ""
                          }`}
                          style={{ height: `${Math.max(level * 100, 2)}%` }}
                        />
                      </div>
                    ))}
                  </div>
                  {recState === "playing" && (
                    <div
                      className="input-test-waveform-cursor"
                      style={{ left: `${playProgress * 100}%` }}
                    />
                  )}
                </div>
              ) : recState === "recording" ? (
                liveWaveform.length > 0 ? (
                  <div className="input-test-waveform rec-live">
                    <div className="input-test-waveform-bars">
                      {liveWaveform.map((h, i) => (
                        <div key={i} className="input-test-waveform-col">
                          <div
                            className="input-test-waveform-bar"
                            style={{ height: `${Math.max(h * 100, 2)}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="input-test-rec-progress">
                    <div
                      className="input-test-rec-progress-fill"
                      style={{ width: `${(recElapsed / 10) * 100}%` }}
                    />
                  </div>
                )
              ) : (
                <div className="input-test-rec-empty" />
              )}
            </div>

            {/* Controls — always visible, disabled by state */}
            <div className="input-test-rec-controls">
              <button
                className="input-test-rec-btn record"
                onClick={recState === "recording" ? handleStopRecording : handleRecord}
                disabled={recState === "playing" || (streamSettling && recState === "idle")}
              >
                {recState === "recording" ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="2" y="2" width="12" height="12" rx="1.5" />
                    </svg>
                    {t("settings.inputTest.stop")}
                  </>
                ) : streamSettling ? (
                  <>
                    <span className="input-test-rec-dot settling" />
                    {t("settings.inputTest.ready")}
                  </>
                ) : (
                  <>
                    <span className="input-test-rec-dot" />
                    {t("settings.inputTest.record")}
                  </>
                )}
              </button>
              <button
                className="input-test-rec-btn play"
                onClick={recState === "playing" ? handleStopPlayback : handlePlay}
                disabled={recState !== "recorded" && recState !== "playing"}
              >
                {recState === "playing" ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
                      <rect x="2" y="2" width="12" height="12" rx="1.5" />
                    </svg>
                    {t("settings.inputTest.stop")}
                  </>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
                    </svg>
                    {t("settings.inputTest.play")}
                  </>
                )}
              </button>
              <button
                className="input-test-rec-btn discard"
                onClick={handleDiscard}
                disabled={recState !== "recorded" && recState !== "playing"}
              >
                {t("settings.inputTest.discard")}
              </button>
            </div>
          </div>

          <div className={`input-test-status ${hasSignal ? "active" : ""}`}>
            <span className={`input-test-status-dot ${hasSignal ? "connected" : ""}`} />
            {hasSignal ? t("settings.inputTest.signalDetected") : t("settings.inputTest.noSignal")}
          </div>
        </div>
      </div>
    </div>
  );
}

function InputDeviceDropdown({
  devices,
  value,
  onChange,
}: {
  devices: AudioInputDevice[];
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { t } = useTranslation();

  const options = useMemo(
    () => [
      { value: "", label: t("settings.inputTest.systemDefault") },
      ...devices.map((d) => ({
        value: d.name,
        label: d.name + (d.isDefault ? t("settings.inputTest.defaultSuffix") : ""),
      })),
    ],
    [devices, t],
  );

  const selected = options.find((o) => o.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className={`midi-dropdown ${open ? "open" : ""}`} ref={ref} style={{ flex: 1 }}>
      <button
        className="midi-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <span className="midi-dropdown-value">
          <span className={`midi-dropdown-dot ${value ? "connected" : ""}`} />
          {selected.label}
        </span>
        <svg
          className="midi-dropdown-chevron"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="midi-dropdown-menu">
          {options.map((opt) => (
            <button
              key={opt.value}
              className={`midi-dropdown-item ${opt.value === value ? "selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              type="button"
            >
              {opt.value === value && (
                <svg
                  className="midi-dropdown-check"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
