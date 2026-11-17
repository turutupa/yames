/**
 * Step registry — the single source of flow order.
 *
 * Adding a step (O2–O5) = one file + one entry here, inserted at its place in
 * the flow. The shell reads this array for rendering and the machine reads
 * `{ id, isEnabled }` from it for navigation; neither needs editing.
 *
 * Flow (ONBOARDING_PLAN §3, reordered for the MVP on 2026-11-16):
 *   W0 welcome → W1 instrument → W5 audio-input → W6 hear-it-work →
 *   W4 coach → W2 sound-look → W3 hands-free → W7 ready
 *
 * The learning side grades from the guitar (revamp BRIEF: "First Mechanics
 * grading needs a mic or direct input"), so hearing the guitar comes right
 * after the instrument and is on every run, whatever the coach tier. The
 * steps that only tune the tools (click sound, theme, pedal) come after it,
 * where a tester who already hears themselves can skip them.
 */
import type { StepGate } from "../onboardingMachine";
import type { WizardStepDef } from "./types";
import { WelcomeStep } from "./WelcomeStep";
import { InstrumentStep } from "./InstrumentStep";
import { SoundLookStep } from "./SoundLookStep";
import { HandsFreeStep } from "./HandsFreeStep";
import { CoachStep } from "./CoachStep";
import { AudioInputStep } from "./AudioInputStep";
import { HearItWorkStep } from "./HearItWorkStep";
import { ReadyStep } from "./ReadyStep";

export const ONBOARDING_STEPS: WizardStepDef[] = [
  { id: "welcome", Component: WelcomeStep, hideInProgress: true },
  { id: "instrument", Component: InstrumentStep },
  // On every run (MVP, 2026-11-16). It used to be gated on the coach tier,
  // with an opt-in for timing-only users (plan decision 3); the learning side
  // cannot grade without an input, so the question is now asked of everyone,
  // and "Skip, I'll set this up later" is still there for a player who only
  // wants the click.
  { id: "audio-input", Component: AudioInputStep },
  // W6 gates on the *outcome* of W5, not on the intent: an input that never
  // produced signal (skipped W5, or a dead interface) has nothing to
  // demonstrate, and "hear it work" with nothing to hear is the fake result
  // the plan forbids. `inputConfigured` is set by W5's commit, so skipping W5
  // skips W6 with it.
  {
    id: "hear-it-work",
    Component: HearItWorkStep,
    isEnabled: (ctx) => ctx.inputConfigured === true,
  },
  { id: "coach", Component: CoachStep },
  { id: "sound-look", Component: SoundLookStep },
  { id: "hands-free", Component: HandsFreeStep },
  { id: "ready", Component: ReadyStep },
];

/** The machine's view of the registry — ids and gates only, no components. */
export function stepGates(steps: WizardStepDef[] = ONBOARDING_STEPS): StepGate[] {
  return steps.map(({ id, isEnabled }) => ({ id, isEnabled }));
}

export type { WizardStepDef, WizardStepProps } from "./types";
