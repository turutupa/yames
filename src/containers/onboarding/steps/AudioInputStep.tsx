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
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

/** How long the meter must stay above the noise floor before Next opens. */
export const SIGNAL_HOLD_MS = 1000;
/** Resolution of the hold accumulator. */
const TICK_MS = 100;

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
    setListening(true);
    return () => setListening(false);
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
      setHeldMs((ms) => {
        const next = ms + TICK_MS;
        if (next >= SIGNAL_HOLD_MS) setProven(true);
        return next;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [isActive, proven]);

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
