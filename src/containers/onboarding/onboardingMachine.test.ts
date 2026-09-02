/**
 * Onboarding machine — every transition, the skip paths, `isEnabled` gating
 * and JUMP. Pure reducer, so no DOM and no store here.
 */
import { describe, it, expect } from "vitest";
import {
  INITIAL_ONBOARDING_STATE,
  isWizardOpen,
  makeOnboardingReducer,
  nextEnabledStep,
  onboardingReducer,
  type OnboardingContext,
  type OnboardingState,
  type StepGate,
} from "./onboardingMachine";

/** The O1 registry: W0, W1, W7. */
const STEPS: StepGate[] = [
  { id: "welcome" },
  { id: "instrument" },
  { id: "ready" },
];

/** A future registry with a gated step in the middle (O4/O5 shape). */
const GATED: StepGate[] = [
  { id: "welcome" },
  { id: "instrument" },
  { id: "audio-input", isEnabled: (ctx) => ctx.coachTier !== "off" },
  { id: "ready" },
];

const reduce = (state: OnboardingState, event: Parameters<typeof onboardingReducer>[1], steps = STEPS) =>
  onboardingReducer(state, event, steps);

/** Walk a list of events from the initial state. */
function run(
  events: Parameters<typeof onboardingReducer>[1][],
  steps = STEPS,
  from = INITIAL_ONBOARDING_STATE,
): OnboardingState {
  return events.reduce((s, e) => onboardingReducer(s, e, steps), from);
}

describe("nextEnabledStep", () => {
  it("walks forward from the start and off the end", () => {
    const ctx: OnboardingContext = { skipped: [], visited: [] };
    expect(nextEnabledStep(STEPS, null, ctx, 1)).toBe("welcome");
    expect(nextEnabledStep(STEPS, "welcome", ctx, 1)).toBe("instrument");
    expect(nextEnabledStep(STEPS, "ready", ctx, 1)).toBeNull();
  });

  it("walks backward and off the front", () => {
    const ctx: OnboardingContext = { skipped: [], visited: [] };
    expect(nextEnabledStep(STEPS, "instrument", ctx, -1)).toBe("welcome");
    expect(nextEnabledStep(STEPS, "welcome", ctx, -1)).toBeNull();
    expect(nextEnabledStep(STEPS, null, ctx, -1)).toBe("ready");
  });

  it("skips steps whose isEnabled returns false", () => {
    const off: OnboardingContext = { skipped: [], visited: [], coachTier: "off" };
    const on: OnboardingContext = { skipped: [], visited: [], coachTier: "standard" };
    expect(nextEnabledStep(GATED, "instrument", off, 1)).toBe("ready");
    expect(nextEnabledStep(GATED, "instrument", on, 1)).toBe("audio-input");
    expect(nextEnabledStep(GATED, "ready", off, -1)).toBe("instrument");
  });

  it("returns null for an id that is not in the registry", () => {
    const ctx: OnboardingContext = { skipped: [], visited: [] };
    expect(nextEnabledStep(STEPS, "coach", ctx, 1)).toBeNull();
  });
});

describe("idle", () => {
  it("ignores navigation events", () => {
    for (const type of ["NEXT", "BACK", "SKIP_STEP", "SKIP_ALL", "CLOSE"] as const) {
      expect(reduce(INITIAL_ONBOARDING_STATE, { type })).toBe(INITIAL_ONBOARDING_STATE);
    }
  });

  it("START_SETUP opens at W0", () => {
    const s = reduce(INITIAL_ONBOARDING_STATE, { type: "START_SETUP" });
    expect(s.status).toBe("welcome");
    expect(s.stepId).toBe("welcome");
    expect(s.context.visited).toEqual(["welcome"]);
    expect(isWizardOpen(s)).toBe(true);
  });

  it("JUMP opens directly at a step (the chip opens at W1)", () => {
    const s = reduce(INITIAL_ONBOARDING_STATE, { type: "JUMP", stepId: "instrument" });
    expect(s.status).toBe("step");
    expect(s.stepId).toBe("instrument");
  });

  it("JUMP to a step that isEnabled hides is a no-op", () => {
    const s = reduce(
      { ...INITIAL_ONBOARDING_STATE, context: { skipped: [], visited: [], coachTier: "off" } },
      { type: "JUMP", stepId: "audio-input" },
      GATED,
    );
    expect(s.status).toBe("idle");
  });
});

describe("welcome (W0)", () => {
  const welcome = run([{ type: "START_SETUP" }]);

  it("START_SETUP enters the first real step", () => {
    const s = reduce(welcome, { type: "START_SETUP" });
    expect(s.stepId).toBe("instrument");
    expect(s.status).toBe("step");
    expect(s.context.visited).toEqual(["welcome", "instrument"]);
  });

  it("NEXT does the same (→ key)", () => {
    expect(reduce(welcome, { type: "NEXT" }).stepId).toBe("instrument");
  });

  it("BACK is a no-op", () => {
    expect(reduce(welcome, { type: "BACK" })).toBe(welcome);
  });

  it("SKIP_ALL ends the run and marks every remaining step skipped", () => {
    const s = reduce(welcome, { type: "SKIP_ALL" });
    expect(s.status).toBe("done");
    expect(s.outcome).toBe("skipped");
    expect(s.stepId).toBeNull();
    expect(s.context.skipped).toEqual(["instrument", "ready"]);
    expect(isWizardOpen(s)).toBe(false);
  });

  it("Esc on W0 is SKIP_ALL, not skip-this-step", () => {
    const s = reduce(welcome, { type: "SKIP_STEP" });
    expect(s.status).toBe("done");
    expect(s.outcome).toBe("skipped");
    expect(s.context.skipped).toEqual(["instrument", "ready"]);
  });

  it("SKIP_ALL honours isEnabled when listing what was skipped", () => {
    const start = run([{ type: "SET_CONTEXT", patch: { coachTier: "off" } }, { type: "START_SETUP" }], GATED);
    const s = onboardingReducer(start, { type: "SKIP_ALL" }, GATED);
    expect(s.context.skipped).toEqual(["instrument", "ready"]);
  });

  it("CLOSE ends the run without marking anything skipped", () => {
    const s = reduce(welcome, { type: "CLOSE" });
    expect(s.status).toBe("done");
    expect(s.outcome).toBe("closed");
    expect(s.context.skipped).toEqual([]);
  });
});

describe("steps", () => {
  const instrument = run([{ type: "START_SETUP" }, { type: "START_SETUP" }]);

  it("NEXT advances and records the visit", () => {
    const s = reduce(instrument, { type: "NEXT" });
    expect(s.stepId).toBe("ready");
    expect(s.context.visited).toEqual(["welcome", "instrument", "ready"]);
  });

  it("NEXT off the last step completes the run", () => {
    const s = run([{ type: "START_SETUP" }, { type: "START_SETUP" }, { type: "NEXT" }, { type: "NEXT" }]);
    expect(s.status).toBe("done");
    expect(s.outcome).toBe("completed");
    expect(s.context.skipped).toEqual([]);
  });

  it("SKIP_STEP marks the step and advances", () => {
    const s = reduce(instrument, { type: "SKIP_STEP" });
    expect(s.stepId).toBe("ready");
    expect(s.context.skipped).toEqual(["instrument"]);
  });

  it("SKIP_STEP is idempotent about the skipped list", () => {
    const once = reduce(instrument, { type: "SKIP_STEP" });
    const back = reduce(once, { type: "BACK" });
    const twice = reduce(back, { type: "SKIP_STEP" });
    expect(twice.context.skipped).toEqual(["instrument"]);
  });

  it("BACK from the first step returns to W0", () => {
    const s = reduce(instrument, { type: "BACK" });
    expect(s.status).toBe("welcome");
    expect(s.stepId).toBe("welcome");
  });

  it("BACK skips a disabled step", () => {
    const ready = run(
      [
        { type: "SET_CONTEXT", patch: { coachTier: "off" } },
        { type: "START_SETUP" },
        { type: "NEXT" },
        { type: "NEXT" },
      ],
      GATED,
    );
    expect(ready.stepId).toBe("ready");
    expect(onboardingReducer(ready, { type: "BACK" }, GATED).stepId).toBe("instrument");
  });

  it("NEXT includes a step once isEnabled allows it", () => {
    const s = run(
      [
        { type: "SET_CONTEXT", patch: { coachTier: "standard" } },
        { type: "START_SETUP" },
        { type: "NEXT" },
        { type: "NEXT" },
      ],
      GATED,
    );
    expect(s.stepId).toBe("audio-input");
  });

  it("JUMP moves to any enabled step (W7 summary rows)", () => {
    const ready = reduce(instrument, { type: "NEXT" });
    const s = reduce(ready, { type: "JUMP", stepId: "instrument" });
    expect(s.stepId).toBe("instrument");
    expect(s.status).toBe("step");
  });

  it("JUMP to a step O2–O5 have not registered yet is a no-op", () => {
    const s = reduce(instrument, { type: "JUMP", stepId: "sound-look" });
    expect(s).toBe(instrument);
  });

  it("CLOSE after W7 counts as completion", () => {
    const ready = reduce(instrument, { type: "NEXT" });
    const s = reduce(ready, { type: "CLOSE" });
    expect(s.status).toBe("done");
    expect(s.outcome).toBe("completed");
  });

  it("CLOSE before W7 is just a close", () => {
    const s = reduce(instrument, { type: "CLOSE" });
    expect(s.outcome).toBe("closed");
  });

  it("SET_CONTEXT merges without moving", () => {
    const s = reduce(instrument, { type: "SET_CONTEXT", patch: { coachTier: "standard" } });
    expect(s.stepId).toBe("instrument");
    expect(s.context.coachTier).toBe("standard");
    expect(s.context.visited).toEqual(["welcome", "instrument"]);
  });
});

describe("done", () => {
  const done = run([{ type: "START_SETUP" }, { type: "SKIP_ALL" }]);

  it("re-opening starts a fresh run — the old skipped list does not leak", () => {
    const s = reduce(done, { type: "START_SETUP" });
    expect(s.status).toBe("welcome");
    expect(s.context.skipped).toEqual([]);
    expect(s.context.visited).toEqual(["welcome"]);
  });

  it("re-opening at a step (the chip) also resets the context", () => {
    const s = reduce(done, { type: "JUMP", stepId: "instrument" });
    expect(s.stepId).toBe("instrument");
    expect(s.context.skipped).toEqual([]);
    expect(s.context.visited).toEqual(["instrument"]);
  });

  it("ignores navigation events", () => {
    for (const type of ["NEXT", "BACK", "SKIP_STEP", "SKIP_ALL", "CLOSE"] as const) {
      expect(reduce(done, { type })).toBe(done);
    }
  });
});

describe("makeOnboardingReducer", () => {
  it("curries the registry for useReducer", () => {
    const r = makeOnboardingReducer(STEPS);
    expect(r(INITIAL_ONBOARDING_STATE, { type: "START_SETUP" }).stepId).toBe("welcome");
  });
});
