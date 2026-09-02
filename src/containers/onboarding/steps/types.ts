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
 *
 * ## Selection is never navigation (house rule — every step must honour it)
 *
 * Clicking a choice inside a step — an instrument card, a sound, a theme, a
 * coach tier — may ONLY select it: highlight it, and stage or persist it.
 * It must never call `onNext()`. Advancing is a separate, deliberate act:
 * the footer's Next button, Enter, or →. Skip advances without persisting.
 *
 * Why: a misclick on a card used to jump the user a screen forward with a
 * choice they did not mean to make. One click, one consequence.
 *
 * How to implement a step that stages a choice:
 *
 *   const { setStepCommit, setNextEnabled } = useWizardEnv();
 *   const [staged, setStaged] = useState(initialFromCurrentSetting);
 *   useEffect(() => {
 *     setNextEnabled(staged !== undefined);        // gate Next on a choice
 *     setStepCommit(staged ? () => persist(staged) : null);
 *   }, [staged, setNextEnabled, setStepCommit]);
 *
 * The shell runs the registered commit immediately before it advances on
 * Next, and clears both the commit and the Next gate when the step changes.
 * A step with nothing to stage can ignore both: Next stays enabled.
 * Re-entering a step (W7's summary rows, the "Finish setup" chip) must
 * preselect the setting that is live today rather than starting blank.
 */
import type { ComponentType } from "react";
import type { OnboardingContext, StepId } from "../onboardingMachine";

export type WizardStepProps = {
  /**
   * Advance. The shell runs the step's registered commit (`setStepCommit`)
   * first, so the choice is persisted before the move. Call this only from a
   * deliberate "go forward" action — never from selecting something.
   */
  onNext: () => void;
  onBack: () => void;
  /** Marks the step skipped, then advances. Persists nothing. */
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
