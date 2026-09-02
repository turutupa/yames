/**
 * Everything a wizard step may need from the app, in one context.
 *
 * Steps get navigation through `WizardStepProps` and app state through
 * `useWizardEnv()`. Keeping the app state here (rather than in step props)
 * is what lets O2–O5 add steps without touching `OnboardingWizard.tsx` or
 * the step contract.
 */
import { createContext, useContext } from "react";
import type { OnboardingContext, StepId } from "./onboardingMachine";

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
