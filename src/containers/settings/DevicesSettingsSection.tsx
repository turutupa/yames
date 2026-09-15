import type { Dispatch, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AudioOutputDevice } from "../../types";
import {
  clearCalibrationCacheEntry,
  getCalibrationCacheEntry,
  listAudioOutputDevices,
} from "../../ipc";
import type { CalibrationCacheEntry } from "../../ipc";
import { AudioOutputDropdown } from "../../components/AudioOutputDropdown";
import { AudioInputDropdown } from "../../components/AudioInputDropdown";
import { MidiDeviceDropdown } from "../../components/MidiDeviceDropdown";
import { ChannelDropdown } from "../../components/ChannelDropdown";
import { OutputPairDropdown } from "../../components/OutputPairDropdown";
import type { useEvaluation } from "../../hooks/useEvaluation";
import type { UseMidiReturn } from "../../hooks/useMidi";

type EvaluationLike = ReturnType<typeof useEvaluation>;
type MidiLike = UseMidiReturn;

const RefreshIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

/**
 * Devices settings — audio output (with BT-latency warning), audio input
 * (with test button + per-instrument calibration cache hint), and MIDI
 * device selector. Pure UI; selection state is owned by the parent / by
 * the underlying hooks.
 *
 * The calibration-cache hint surfaces a tiny "Calibrated for this device"
 * note + a Recalibrate button when the current `(instrument, input
 * device)` pair has a cached offset. This is the user-facing payoff for
 * the DSP plan's per-instrument calibration cache: instead of waiting
 * ~8 beats every session for the auto-calibration to converge, the
 * pre-seeded offset means the very first beat is judged against the
 * learned offset.
 */
export function DevicesSettingsSection({
  audioOutputDevices,
  setAudioOutputDevices,
  selectedOutputDevice,
  outputPair,
  selectOutputPair,
  selectOutputDevice,
  outputPairFellBack,
  evaluation,
  midi,
  onOpenInputTest,
  instrument,
}: {
  audioOutputDevices: AudioOutputDevice[];
  setAudioOutputDevices: Dispatch<SetStateAction<AudioOutputDevice[]>>;
  selectedOutputDevice: string;
  outputPair: number;
  selectOutputPair: (pair: number) => void;
  selectOutputDevice: (deviceName: string) => void;
  outputPairFellBack: boolean;
  evaluation: EvaluationLike;
  midi: MidiLike;
  onOpenInputTest: () => void;
  instrument: string;
}) {
  const { t } = useTranslation();
  // Find the selected input device object to read its channel count.
  const selectedInputDevice = evaluation.devices.find(
    (d) => d.name === evaluation.selectedDevice,
  );
  const deviceChannelCount = selectedInputDevice?.channels ?? 0;
  // How many outputs the chosen device has, and how many whole pairs that
  // makes.
  //
  // "System default" is the empty name and has no entry of its own in the
  // list, so it resolves to whichever device is flagged `isDefault` — and
  // on the machine issue 52 came from, the interface IS the default. A
  // lookup by name alone hid the picker from exactly the person who asked
  // for it. The backend keys the stored pair under the empty name either
  // way, so the two agree on what "system default" means.
  const selectedOutputDeviceEntry =
    audioOutputDevices.find((d) => d.name === selectedOutputDevice) ??
    (selectedOutputDevice === ""
      ? audioOutputDevices.find((d) => d.isDefault)
      : undefined);
  const selectedOutputChannelCount = selectedOutputDeviceEntry?.channels ?? 0;
  const selectedOutputPairsAvailable = Math.floor(selectedOutputChannelCount / 2);
  // Per-instrument calibration cache lookup. We re-fetch whenever the
  // active `(instrument, audio input)` pair changes so the displayed
  // value tracks what start_evaluation would actually use next session.
  const [calEntry, setCalEntry] = useState<CalibrationCacheEntry | null>(null);
  const inputDevice = evaluation.selectedDevice ?? null;
  useEffect(() => {
    let cancelled = false;
    getCalibrationCacheEntry(instrument, inputDevice)
      .then((entry) => {
        if (!cancelled) setCalEntry(entry);
      })
      .catch(() => {
        if (!cancelled) setCalEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [instrument, inputDevice]);

  const handleRecalibrate = async () => {
    await clearCalibrationCacheEntry(instrument, inputDevice);
    setCalEntry(null);
  };

  return (
    // `id` is the deep-link target for the audio-failure notice, the same way
    // `settings-coach` is for O4's "Pick a voice" toast.
    <section className="hotkeys-section" id="settings-devices">
      <h2>{t("settings.devices.title")}</h2>
      <div className="midi-device-section">
        <label className="midi-label devices-subsection-label">{t("settings.devices.audioOutput")}</label>
        <div className="midi-device-row">
          <AudioOutputDropdown
            devices={audioOutputDevices}
            value={selectedOutputDevice}
            onChange={selectOutputDevice}
          />
          <button
            className="midi-refresh-btn"
            onClick={async () => {
              const devices = await listAudioOutputDevices();
              setAudioOutputDevices(devices);
            }}
            title={t("settings.devices.refreshAudio")}
          >
            <RefreshIcon />
          </button>
        </div>
        {selectedOutputDevice && audioOutputDevices.find((d) => d.name === selectedOutputDevice)?.isBluetooth && (
          <div className="audio-output-bt-warning">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>{t("settings.devices.btLatencyWarning")}</span>
          </div>
        )}
        {/* Which pair of the device's outputs everything plays on. Only
            for a device that HAS more than two — on a laptop there is
            nothing to choose, and a picker with one option in it is a
            question nobody asked. A drummer on a four-output interface
            puts the click on 3-4 and keeps 1-2 for the v-drums. */}
        {selectedOutputPairsAvailable > 1 && (
          <>
            <label
              className="midi-label devices-subsection-label"
              style={{ marginTop: 12 }}
            >
              {t("settings.devices.outputPair")}
            </label>
            <div className="midi-device-row">
              <OutputPairDropdown
                outputCount={selectedOutputChannelCount}
                value={outputPair}
                onChange={selectOutputPair}
              />
            </div>
            {outputPairFellBack && (
              <span className="channel-picker-hint">
                {t("settings.devices.outputPairFallback")}
              </span>
            )}
          </>
        )}
      </div>

      <div className="midi-device-section" style={{ marginTop: 28 }}>
        <label className="midi-label devices-subsection-label">{t("settings.devices.audioInput")}</label>
        <div className="midi-device-row">
          <AudioInputDropdown
            devices={evaluation.devices}
            value={evaluation.selectedDevice ?? ""}
            onChange={(val) => evaluation.selectDevice(val)}
          />
          <button
            className="input-test-btn"
            onClick={onOpenInputTest}
            title={t("settings.devices.testAudioInput")}
          >
            {t("settings.devices.test")}
          </button>
        </div>
        {/* Per-instrument calibration cache hint. Sits right under the
            device dropdown so the user sees it before touching anything
            else. Recalibrate button clears just this pair; other cached
            combos survive. */}
        {calEntry && (
          <div className="calibration-cache-hint">
            <span className="calibration-cache-text">
              {t("settings.devices.calibrated", {
                offset: `${calEntry.offsetMs >= 0 ? "+" : ""}${calEntry.offsetMs.toFixed(1)}`,
              })}
            </span>
            <button
              className="calibration-recalibrate-btn"
              onClick={handleRecalibrate}
              title={t("settings.devices.recalibrateHint")}
            >
              {t("settings.devices.recalibrate")}
            </button>
          </div>
        )}
        {/* Channel picker — shown for any multi-channel device (≥ 2 ch).
            Sits below the calibration hint using the same midi-dropdown
            style. For interfaces (Scarlett etc.) channels 3/4 are loopback. */}
        {deviceChannelCount > 1 && (
          <div className="midi-device-row" style={{ marginTop: 8 }}>
            <ChannelDropdown
              channelCount={deviceChannelCount}
              value={evaluation.selectedChannel}
              isInterface={selectedInputDevice?.isInterface ?? false}
              onChange={(ch) => evaluation.selectChannel(ch)}
            />
          </div>
        )}
        {evaluation.selectedChannel >= 2 && (selectedInputDevice?.isInterface ?? false) && (
          <span className="channel-picker-hint" title={t("settings.devices.loopbackHint")}>
            {t("settings.devices.loopback")}
          </span>
        )}
      </div>

      <div className="midi-device-section" style={{ marginTop: 28 }}>
        <label className="midi-label devices-subsection-label">{t("settings.devices.midi")}</label>
        <div className="midi-device-row">
          <MidiDeviceDropdown
            devices={midi.devices}
            value={midi.connectedDevice || ""}
            onChange={(val) => {
              if (val) {
                midi.connect(val);
              } else {
                midi.disconnect();
              }
            }}
          />
          <button
            className="midi-refresh-btn"
            onClick={() => midi.refreshDevices()}
            title={t("settings.devices.refreshMidi")}
          >
            <RefreshIcon />
          </button>
        </div>
        {!midi.connectedDevice && midi.devices.length === 0 && (
          <div className="midi-status">
            <span className="midi-status-dot" />
            {t("settings.devices.noMidi")}
          </div>
        )}
      </div>
    </section>
  );
}
