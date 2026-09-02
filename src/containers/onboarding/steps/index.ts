/**
 * Step registry — the single source of flow order.
 *
 * Adding a step (O2–O5) = one file + one entry here, inserted at its place in
 * the flow. The shell reads this array for rendering and the machine reads
 * `{ id, isEnabled }` from it for navigation; neither needs editing.
 *
 * Flow (ONBOARDING_PLAN §3):
 *   W0 welcome → W1 instrument → W2 sound-look → W3 hands-free → W4 coach →
 *   W5 audio-input → W6 hear-it-work → W7 ready
 */
import type { StepGate } from "../onboardingMachine";
import type { WizardStepDef } from "./types";
import { WelcomeStep } from "./WelcomeStep";
import { InstrumentStep } from "./InstrumentStep";
import { SoundLookStep } from "./SoundLookStep";
import { HandsFreeStep } from "./HandsFreeStep";
import { ReadyStep } from "./ReadyStep";

export const ONBOARDING_STEPS: WizardStepDef[] = [
  { id: "welcome", Component: WelcomeStep, hideInProgress: true },
  { id: "instrument", Component: InstrumentStep },
  { id: "sound-look", Component: SoundLookStep },
  { id: "hands-free", Component: HandsFreeStep },
  // O4: { id: "coach", Component: CoachStep },
  // O5: { id: "audio-input", Component: AudioInputStep,
  //        isEnabled: (ctx) => ctx.coachTier !== "off" || ctx.inputConfigured === true },
  // O5: { id: "hear-it-work", Component: HearItWorkStep,
  //        isEnabled: (ctx) => ctx.inputConfigured === true },
  { id: "ready", Component: ReadyStep },
];

/** The machine's view of the registry — ids and gates only, no components. */
export function stepGates(steps: WizardStepDef[] = ONBOARDING_STEPS): StepGate[] {
  return steps.map(({ id, isEnabled }) => ({ id, isEnabled }));
}

export type { WizardStepDef, WizardStepProps } from "./types";
