/**
 * Everything a wizard step may need from the app, in one context.
 *
 * Steps get navigation through `WizardStepProps` and app state through
 * `useWizardEnv()`. Keeping the app state here (rather than in step props)
 * is what lets O2–O5 add steps without touching `OnboardingWizard.tsx` or
 * the step contract.
 */
import { createContext, useContext } from "react";
import type { UseMidiReturn } from "../../hooks/useMidi";
import type { ModelStatus } from "../../ipc";
import type {
  AudioInputDevice,
  AudioSpectrum,
  BeatFeedback,
  BrainTier,
  ModelTier,
} from "../../types";
import type { OnboardingContext, StepId } from "./onboardingMachine";

/**
 * The app's single `useCoachDownload` instance, narrowed to what W4 (O4)
 * needs. Same reasoning as `midi` above: the step drives the app's own hook
 * rather than mounting a second one, so a download started in the wizard is
 * the download the coach card, Settings and the footer bar all see — and it
 * keeps running when the step unmounts.
 */
export type WizardCoachEnv = {
  /** Total physical RAM in MB (T04). `null`/`0` = query failed. */
  systemMemoryMb: number | null;
  /** What is on disk right now; `null` until `get_model_status` answers. */
  modelStatus: ModelStatus | null;
  /** A model download is in flight (the wizard never waits for it). */
  downloading: boolean;
  /** 0..1, or null while the first progress event is outstanding. */
  downloadFraction: number | null;
  /** Hand-off to `useCoachDownload().handleStartDownload`. */
  startDownload: (tier: ModelTier) => void;
  /** Sets the active tier *and* persists `coachBrainTier`. */
  setBrainTier: (tier: BrainTier) => void;
};

/**
 * The app's single `useEvaluation` instance, narrowed to what W5 and W6 (O5)
 * need. Same reasoning as `midi` and `coach`: the steps drive the app's own
 * hook rather than opening a second audio stream, so the device the user picks
 * in the wizard *is* the device Settings, the coach card and W7's summary row
 * see — and W6's take runs through the normal analyzer, which is the only way
 * the calibration seed it leaves behind can be real.
 */
export type WizardEvaluationEnv = {
  devices: AudioInputDevice[];
  /** Selected input device name; `undefined`/`""` = system default. */
  selectedDevice?: string;
  /** Persists `evaluationDevice` and restarts the stream when it is running. */
  selectDevice: (name: string) => void;
  /** 0-indexed capture channel. */
  selectedChannel: number;
  selectChannel: (channel: number) => void;
  /** True while the shared input stream is running. */
  listening: boolean;
  /** Idempotent "make sure it is on/off" — never a flip; see `setListening`. */
  setListening: (on: boolean) => void;
  /** Latest `audio-spectrum` payload, or null when nothing is listening. */
  spectrum: AudioSpectrum | null;
  /** Latest `beat-feedback` payload — W6's onset dots and drift needle. */
  lastFeedback: BeatFeedback | null;
  /** Rolling mean deviation in ms over the last 16 scored beats. */
  avgDeviation: number;
};

export type WizardEnv = {
  /** App version, for the W0 footer. */
  appVersion: string;

  // --- Live settings the steps read and write -----------------------------
  instrument: string;
  /** False on a true first run — `instrument` is then just the fallback. */
  instrumentChosen: boolean;
  setInstrument: (id: string) => void;
  soundType: string;
  themeId: string;
  coachTier: string;
  /** Name of the selected audio input device, if any (W5/W7). */
  inputDeviceName?: string | null;
  /** A MIDI/gamepad binding for play/stop exists (W3/W7). */
  hasFootswitch: boolean;
  alwaysOnTop: boolean;
  setAlwaysOnTop: (value: boolean) => void;

  // --- Hands-free control (W3) --------------------------------------------
  /**
   * The app's single `useMidi` instance — devices, bindings and learn mode.
   * W3 drives it rather than mounting its own so a binding made in the wizard
   * is the same binding the rest of the app (and W7's summary) sees.
   */
  midi: UseMidiReturn;
  /** Gamepad/footswitch bindings by action id (MainWindow's `footBindings`). */
  gamepadBindings: Record<string, string>;

  // --- Practice coach (W4) --------------------------------------------------
  /** Facts and hand-offs for the coach step; see `WizardCoachEnv`. */
  coach: WizardCoachEnv;

  // --- Audio input + "hear it work" (W5/W6) ---------------------------------
  /** The app's evaluation hook, narrowed; see `WizardEvaluationEnv`. */
  evaluation: WizardEvaluationEnv;

  // --- The demo click ------------------------------------------------------
  /** Start the soft 80 BPM preview click (idempotent). */
  startSoftClick: () => void;
  /** Stop it and restore the user's BPM/volume (idempotent). */
  stopSoftClick: () => void;
  softClickPlaying: boolean;
  /** Increments on every engine beat — steps use it to pulse in time. */
  beatTick: number;

  // --- Machine ------------------------------------------------------------
  /** Shared machine context (`skipped`, `visited`, coach tier, …). */
  machineContext: OnboardingContext;
  /**
   * Ids the registry actually offers on this run. W7 uses it so a summary row
   * is only a button when jumping there leads somewhere — rows for steps
   * O2–O5 have not added yet render as static text.
   */
  availableSteps: StepId[];
  /**
   * Selection is not navigation (see `steps/types.ts`). A step stages the
   * user's choice and registers what to persist here; the shell runs it right
   * before it advances on Next — and never on Skip or Back. Pass `null` when
   * there is nothing to commit. Cleared automatically when the step changes.
   */
  setStepCommit: (commit: (() => void) | null) => void;
  /**
   * Enable/disable the footer's Next (and the ←/→/Enter equivalents) — e.g.
   * W1 keeps it off until an instrument is selected. Resets to enabled when
   * the step changes, so a step that never calls it is always advanceable.
   */
  setNextEnabled: (enabled: boolean) => void;
  /** Jump to a step (W7 summary rows). */
  jumpTo: (id: StepId) => void;
  /** "Just give me the click" — end the wizard, skipping everything left. */
  skipAll: () => void;
  /** W0 → first step. */
  startSetup: () => void;
  /** Close the wizard (W7 "Start practicing"). */
  finish: () => void;
  /** Wired by O6. The W7 tour button is hidden while this is undefined. */
  onRequestTour?: () => void;
  /**
   * W2's "More themes in Settings": hides the wizard, opens Settings →
   * Appearance, and brings the wizard back when the user leaves Settings.
   * Hidden while undefined (same rule as `onRequestTour`).
   */
  openThemeSettings?: () => void;
  /** Merge a result into the machine context (O2–O5). */
  setMachineContext: (patch: Partial<OnboardingContext>) => void;
};

const WizardEnvContext = createContext<WizardEnv | null>(null);

export const WizardEnvProvider = WizardEnvContext.Provider;

export function useWizardEnv(): WizardEnv {
  const env = useContext(WizardEnvContext);
  if (!env) {
    throw new Error("useWizardEnv must be used inside the onboarding wizard");
  }
  return env;
}
