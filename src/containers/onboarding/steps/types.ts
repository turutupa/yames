/**
 * The contract every wizard step implements (onboarding README, "Contract
 * every step follows"). O2–O5 add a step by writing one file that exports a
 * `React.ComponentType<WizardStepProps>` and adding one entry to
 * `steps/index.ts` — the shell (`OnboardingWizard.tsx`) never changes.
 *
 * Navigation comes in as props; everything else (instrument, sound, theme,
 * the soft click, always-on-top, the shared machine context) comes from
 * `useWizardEnv()` in `../WizardContext`, so adding a step never grows the
 * shell's prop list either.
 */
import type { ComponentType } from "react";
import type { OnboardingContext, StepId } from "../onboardingMachine";

export type WizardStepProps = {
  /** Advance (the step persists its own result first). */
  onNext: () => void;
  onBack: () => void;
  /** Marks the step skipped, then advances. */
  onSkip: () => void;
  /** The step is the visible one (steps stay mounted only while active today). */
  isActive: boolean;
};

export type WizardStepDef = {
  id: StepId;
  Component: ComponentType<WizardStepProps>;
  /**
   * Return false to hide the step for this run (e.g. audio-input when the
   * coach tier is "off" and the user declined the optional branch).
   * Omitted = always enabled.
   */
  isEnabled?: (ctx: OnboardingContext) => boolean;
  /** Hidden from the progress dots (W0 is chrome-less). */
  hideInProgress?: boolean;
};

export type { OnboardingContext, StepId };
