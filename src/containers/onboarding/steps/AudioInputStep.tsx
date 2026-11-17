/**
 * W5 — Audio input (ONBOARDING_PLAN §3 W5, decision 3).
 *
 * Pick the input, then prove it works. The step deliberately owns no audio of
 * its own: it drives the app's single `useEvaluation` through the wizard env
 * (`env.evaluation`), exactly as W3 drives the single `useMidi` — so the device
 * chosen here is the one Settings, the coach card, W6's take and W7's summary
 * row all see, and only one stream is ever open.
 *
 * The gate is the honest part. "Next" stays off until the meter has actually
 * seen signal above the noise floor for a full second, because the whole point
 * of W6 is that it cannot be faked: an input that has never made a number move
 * has no business being called "set up". "Skip, I'll set this up later" is
 * always there — the metronome works without any of this.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AudioInputDropdown } from "../../../components/AudioInputDropdown";
import { ChannelDropdown } from "../../../components/ChannelDropdown";
import {
  InputLevelMeter,
  SIGNAL_FLOOR_RMS,
  useSmoothedRms,
} from "../../../components/InputLevelMeter";
import type { AudioInputDevice } from "../../../types";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

/** How long the meter must stay above the noise floor before Next opens. */
export const SIGNAL_HOLD_MS = 1000;
/** Resolution of the hold accumulator. */
const TICK_MS = 100;
/**
 * How long the step listens to silence before it says "nothing heard yet" and
 * lists what to check. Long enough to find the guitar and play a few notes,
 * short enough that a muted interface or a refused microphone is not a
 * mystery.
 */
export const NOTHING_HEARD_MS = 6000;

/** How the guitar reaches the computer. Only picks a device; never navigates. */
export type InputMode = "mic" | "direct";

/**
 * The device a mode means, from what the system lists. A microphone is the
 * default device when that is not an interface, else the first non-interface;
 * "" (the system default) when there is none to name. Direct input is the
 * first interface, or null when none is plugged in.
 */
export function deviceForMode(devices: AudioInputDevice[], mode: InputMode): string | null {
  if (mode === "direct") return devices.find((d) => d.isInterface)?.name ?? null;
  const mics = devices.filter((d) => !d.isInterface);
  return (mics.find((d) => d.isDefault) ?? mics[0])?.name ?? "";
}

/**
 * Instruments with their own guidance line. Anything else (and the "soon"
 * instruments) falls back to `guidance.other`, so a new instrument id can
 * never render an empty sentence.
 */
const GUIDED_INSTRUMENTS = new Set([
  "electric-guitar",
  "acoustic-guitar",
  "bass",
  "drums",
  "piano",
]);

export function AudioInputStep({ onSkip, isActive }: WizardStepProps) {
  const { t } = useTranslation();
  const { evaluation, instrument, setMachineContext, setStepCommit, setNextEnabled } =
    useWizardEnv();

  // The env object is rebuilt on every spectrum event (it carries the
  // spectrum), so its callbacks must never appear in an effect's deps — the
  // stream would be stopped and restarted several times a second. Latest-value
  // refs keep the lifecycle effect keyed on `isActive` alone.
  const setListeningRef = useRef(evaluation.setListening);
  setListeningRef.current = evaluation.setListening;

  // Own the stream while the step is on screen; hand it back on the way out.
  // W6 starts its own take, so there is no overlap to manage here.
  useEffect(() => {
    if (!isActive) return;
    const setListening = setListeningRef.current;
    void setListening(true);
    return () => {
      void setListening(false);
    };
  }, [isActive]);

  const rawRms = evaluation.spectrum?.rms ?? 0;
  const smoothedRms = useSmoothedRms(rawRms);
  const rawRmsRef = useRef(rawRms);
  rawRmsRef.current = rawRms;

  // --- The one-second gate -------------------------------------------------
  // Time above the floor is accumulated, not required to be continuous: a
  // plucked note decays below the floor between hits, and demanding one
  // unbroken second would fail an acoustic guitar for being an acoustic
  // guitar. Latched once reached — the meter is allowed to fall silent again
  // while the user reads the rest of the screen.
  const [heldMs, setHeldMs] = useState(0);
  const [proven, setProven] = useState(false);
  const device = evaluation.selectedDevice ?? "";
  const channel = evaluation.selectedChannel;
  // A new device or channel has proved nothing yet.
  useEffect(() => {
    setHeldMs(0);
    setProven(false);
  }, [device, channel]);

  useEffect(() => {
    if (!isActive || proven) return;
    const id = window.setInterval(() => {
      if (rawRmsRef.current <= SIGNAL_FLOOR_RMS) return;
      setHeldMs((ms) => ms + TICK_MS);
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [isActive, proven]);

  // Latching in its own effect rather than inside the updater above: React
  // may call an updater twice under StrictMode, and a state change is not
  // something to do from inside one.
  useEffect(() => {
    if (heldMs >= SIGNAL_HOLD_MS) setProven(true);
  }, [heldMs]);

  // --- Nothing heard -------------------------------------------------------
  // Counted only while the stream is really open, so a device that is still
  // starting (or failed to) is not reported as silent.
  const [silentMs, setSilentMs] = useState(0);
  useEffect(() => {
    setSilentMs(0);
  }, [device, channel]);
  const listening = evaluation.listening;
  useEffect(() => {
    if (!isActive || proven || !listening) return;
    const id = window.setInterval(() => setSilentMs((ms) => ms + TICK_MS), TICK_MS);
    return () => window.clearInterval(id);
  }, [isActive, proven, listening]);
  const nothingHeard = !proven && silentMs >= NOTHING_HEARD_MS && heldMs === 0;

  // --- What Next means here ------------------------------------------------
  // The device and channel are already persisted by `selectDevice` /
  // `selectChannel` (they write the store as the user picks, exactly as
  // Settings does). The commit records the one thing only this step knows:
  // that an input was set up *and* was heard, which is what W6 gates on.
  const commit = useCallback(() => {
    setMachineContext({ inputConfigured: true });
  }, [setMachineContext]);

  useEffect(() => {
    setNextEnabled(proven);
    setStepCommit(proven ? commit : null);
  }, [proven, commit, setNextEnabled, setStepCommit]);

  const selectedDeviceObj = useMemo(
    () => evaluation.devices.find((d) => d.name === evaluation.selectedDevice),
    [evaluation.devices, evaluation.selectedDevice],
  );
  const channelCount = selectedDeviceObj?.channels ?? 0;
  const isInterface = selectedDeviceObj?.isInterface ?? false;

  // --- Microphone or direct input ----------------------------------------
  // The cards are a shortcut into the device list, not a second setting: the
  // one stored is the device. What a card shows as chosen follows the device,
  // unless the player asked for direct input and there is no interface yet.
  const [askedDirect, setAskedDirect] = useState(false);
  const mode: InputMode = isInterface || askedDirect ? "direct" : "mic";
  const noInterface = askedDirect && !isInterface && deviceForMode(evaluation.devices, "direct") === null;
  const chooseMode = (next: InputMode) => {
    const name = deviceForMode(evaluation.devices, next);
    setAskedDirect(next === "direct");
    if (name !== null && name !== (evaluation.selectedDevice ?? "")) evaluation.selectDevice(name);
  };

  const startError = evaluation.startError ?? null;
  const noDevices = evaluation.devices.length === 0;
  const retry = () => {
    const setListening = setListeningRef.current;
    setSilentMs(0);
    // In order: a start that lands while the stop is still running is dropped
    // by the hook (one stream per device), so wait for the stop.
    void Promise.resolve(setListening(false)).then(() => setListening(true));
  };

  const guidanceKey = GUIDED_INSTRUMENTS.has(instrument)
    ? `onboarding.audioInput.guidance.${instrument}`
    : "onboarding.audioInput.guidance.other";

  const holdPct = Math.min(100, Math.round((heldMs / SIGNAL_HOLD_MS) * 100));

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.audioInput.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("onboarding.audioInput.subtitle")}</p>

      <div
        className="onboarding-input-modes"
        role="group"
        aria-label={t("onboarding.audioInput.mode.label")}
      >
        <button
          type="button"
          className={`onboarding-input-mode${mode === "mic" ? " selected" : ""}`}
          aria-pressed={mode === "mic"}
          onClick={() => chooseMode("mic")}
          data-testid="audio-input-mode-mic"
        >
          <b>{t("onboarding.audioInput.mode.mic.title")}</b>
          <span>{t("onboarding.audioInput.mode.mic.desc")}</span>
        </button>
        <button
          type="button"
          className={`onboarding-input-mode${mode === "direct" ? " selected" : ""}`}
          aria-pressed={mode === "direct"}
          onClick={() => chooseMode("direct")}
          data-testid="audio-input-mode-direct"
        >
          <b>{t("onboarding.audioInput.mode.direct.title")}</b>
          <span>{t("onboarding.audioInput.mode.direct.desc")}</span>
        </button>
      </div>
      {noInterface && (
        <p className="onboarding-input-note" role="status" data-testid="audio-input-no-interface">
          {t("onboarding.audioInput.noInterface")}
        </p>
      )}

      <div className="onboarding-input-device">
        <label className="onboarding-input-label" htmlFor="onboarding-input-device">
          {t("onboarding.audioInput.device")}
        </label>
        <div id="onboarding-input-device" data-testid="audio-input-device">
          <AudioInputDropdown
            devices={evaluation.devices}
            value={evaluation.selectedDevice ?? ""}
            onChange={(name) => evaluation.selectDevice(name)}
            defaultLabel={t("settings.inputTest.systemDefault")}
            defaultSuffix={t("settings.inputTest.defaultSuffix")}
          />
        </div>
        {channelCount > 1 && (
          <div data-testid="audio-input-channel">
            <ChannelDropdown
              channelCount={channelCount}
              value={channel}
              isInterface={isInterface}
              onChange={(ch) => evaluation.selectChannel(ch)}
            />
          </div>
        )}
      </div>

      <p className="onboarding-input-guidance" data-testid="audio-input-guidance">
        {t(guidanceKey)}
      </p>

      <InputLevelMeter
        rms={smoothedRms}
        label={t("settings.inputTest.level")}
        className="onboarding-input-meter"
      />

      {/* The gate, stated rather than implied: a disabled Next with no reason
          beside it is the single most common "the app is broken" report. */}
      <div
        className={`onboarding-input-gate${proven ? " proven" : ""}`}
        role="status"
        data-testid="audio-input-gate"
      >
        <span className="onboarding-input-gate-dot" aria-hidden="true" />
        <span>
          {proven
            ? t("onboarding.audioInput.heard")
            : t("onboarding.audioInput.waiting")}
        </span>
        {!proven && (
          <span className="onboarding-input-gate-bar" aria-hidden="true">
            <span
              className="onboarding-input-gate-fill"
              style={{ width: `${holdPct}%` }}
            />
          </span>
        )}
      </div>

      {/* What to do when it does not work, by what went wrong. One panel at a
          time, the most basic first: no device at all, then a device that
          would not open, then a device that opened and heard nothing. */}
      {!proven && (noDevices || startError || nothingHeard) && (
        <div className="onboarding-input-trouble" role="status" data-testid="audio-input-trouble">
          {noDevices ? (
            <>
              <p className="onboarding-input-trouble-title">
                {t("onboarding.audioInput.noDevices.title")}
              </p>
              <p>{t("onboarding.audioInput.noDevices.body")}</p>
            </>
          ) : startError ? (
            <>
              <p className="onboarding-input-trouble-title">
                {t("onboarding.audioInput.openFailed.title")}
              </p>
              <p>{t("onboarding.audioInput.openFailed.body")}</p>
              <p className="onboarding-input-trouble-small">
                {t("onboarding.audioInput.silent.permission")}
              </p>
            </>
          ) : (
            <>
              <p className="onboarding-input-trouble-title">
                {t("onboarding.audioInput.silent.title")}
              </p>
              <ul>
                <li>
                  {mode === "direct"
                    ? t("onboarding.audioInput.silent.direct")
                    : t("onboarding.audioInput.silent.mic")}
                </li>
                <li>{t("onboarding.audioInput.silent.permission")}</li>
                <li>{t("onboarding.audioInput.silent.other")}</li>
              </ul>
            </>
          )}
          {!noDevices && (
            <button
              type="button"
              className="onboarding-btn onboarding-btn-ghost"
              onClick={retry}
              data-testid="audio-input-retry"
            >
              {t("onboarding.audioInput.retry")}
            </button>
          )}
        </div>
      )}

      {/* Always available, in the step body as well as the footer: this is the
          screen where a user without an interface should be able to leave
          without feeling they have failed a check. */}
      <button
        type="button"
        className="onboarding-btn onboarding-btn-ghost onboarding-input-skip"
        onClick={onSkip}
        data-testid="audio-input-skip"
      >
        {t("onboarding.audioInput.skip")}
      </button>
    </div>
  );
}
