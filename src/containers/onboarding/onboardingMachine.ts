/**
 * Onboarding wizard state machine (ONBOARDING_PLAN §3).
 *
 * Pure `(state, event, steps) => state`. No React, no IPC, no store — every
 * transition is unit-testable in isolation (`onboardingMachine.test.ts`).
 *
 * The step *list* is injected rather than imported so the machine never pulls
 * React components into a pure module: callers pass the gates derived from the
 * registry (`src/containers/onboarding/steps/index.ts`). O2–O5 add steps by
 * appending to that registry; nothing here changes.
 */

/** Every step id in flow order. O2–O5 fill in the middle ones. */
export type StepId =
  | "welcome"
  | "instrument"
  | "sound-look"
  | "hands-free"
  | "coach"
  | "audio-input"
  | "hear-it-work"
  | "ready";

export type OnboardingContext = {
  /** Step ids the user explicitly skipped (Esc, "Skip", or "Just give me the click"). */
  skipped: string[];
  /** Step ids the user actually landed on, in visit order (deduped). */
  visited: string[];
  /** Set by W4 (O4) so W5/W6 can gate themselves. */
  coachTier?: "off" | "standard" | "full";
  /**
   * W4's optional branch (decision 3): a user who picked timing-only can still
   * ask to "try the listening feature", which makes W5/W6 appear for them.
   * Intent, not outcome — `inputConfigured` records what W5 actually achieved.
   */
  tryListening?: boolean;
  /** Set by W5 (O5) so W6 can gate itself. */
  inputConfigured?: boolean;
};

/**
 * `welcome` is W0 (its own status because the shell hides the progress dots
 * and footer there); `step` is any other registry entry; `done` means the
 * overlay is closed and the outcome has been decided.
 */
export type OnboardingStatus = "idle" | "welcome" | "step" | "done";

/** How the wizard ended — drives what `useOnboarding` persists. */
export type OnboardingOutcome = "completed" | "skipped" | "closed";

export type OnboardingState = {
  status: OnboardingStatus;
  /** Current step id; `null` when `status` is `idle` or `done`. */
  stepId: StepId | null;
  context: OnboardingContext;
  /** Only set when `status === "done"`. */
  outcome?: OnboardingOutcome;
};

export type OnboardingEvent =
  /** From `idle`: open at W0. From `welcome`: enter the first enabled step. */
  | { type: "START_SETUP" }
  /** "Just give me the click" — closes and marks every unvisited step skipped. */
  | { type: "SKIP_ALL" }
  | { type: "NEXT" }
  | { type: "BACK" }
  | { type: "SKIP_STEP" }
  | { type: "JUMP"; stepId: StepId }
  | { type: "CLOSE" }
  /** Steps report their result into the shared context (O2–O5). */
  | { type: "SET_CONTEXT"; patch: Partial<OnboardingContext> };

/**
 * The only thing the machine needs to know about a step: its id and whether
 * it applies to this run. Mirrors `WizardStepDef` minus the React component.
 */
export type StepGate = {
  id: StepId;
  isEnabled?: (ctx: OnboardingContext) => boolean;
};

export const INITIAL_ONBOARDING_STATE: OnboardingState = {
  status: "idle",
  stepId: null,
  context: { skipped: [], visited: [] },
};

function enabledSteps(steps: StepGate[], ctx: OnboardingContext): StepGate[] {
  return steps.filter((s) => (s.isEnabled ? s.isEnabled(ctx) : true));
}

/**
 * The next (or previous, with `direction: -1`) step that `isEnabled` allows,
 * starting from `from`. Returns `null` when the flow runs off either end.
 * `from === null` means "before the first step".
 */
export function nextEnabledStep(
  steps: StepGate[],
  from: StepId | null,
  ctx: OnboardingContext,
  direction: 1 | -1 = 1,
): StepId | null {
  const isOn = (s: StepGate) => (s.isEnabled ? s.isEnabled(ctx) : true);
  // `from === null` sits just outside the array on the side we walk from, so
  // direction 1 starts at the first step and direction -1 at the last.
  const fromIndex =
    from === null
      ? direction === 1
        ? -1
        : steps.length
      : steps.findIndex((s) => s.id === from);
  if (from !== null && fromIndex < 0) return null; // id not in the registry
  if (direction === 1) {
    for (let i = fromIndex + 1; i < steps.length; i++) {
      if (isOn(steps[i])) return steps[i].id;
    }
    return null;
  }
  for (let i = fromIndex - 1; i >= 0; i--) {
    if (isOn(steps[i])) return steps[i].id;
  }
  return null;
}

function visit(ctx: OnboardingContext, id: StepId): OnboardingContext {
  if (ctx.visited.includes(id)) return ctx;
  return { ...ctx, visited: [...ctx.visited, id] };
}

function skip(ctx: OnboardingContext, id: StepId): OnboardingContext {
  if (ctx.skipped.includes(id)) return ctx;
  return { ...ctx, skipped: [...ctx.skipped, id] };
}

function enterStep(ctx: OnboardingContext, id: StepId): OnboardingState {
  return {
    status: id === "welcome" ? "welcome" : "step",
    stepId: id,
    context: visit(ctx, id),
  };
}

function finish(
  ctx: OnboardingContext,
  outcome: OnboardingOutcome,
): OnboardingState {
  return { status: "done", stepId: null, context: ctx, outcome };
}

/** Advance from `state.stepId`; running off the end completes the wizard. */
function advance(state: OnboardingState, steps: StepGate[], ctx: OnboardingContext): OnboardingState {
  const next = nextEnabledStep(steps, state.stepId, ctx, 1);
  return next ? enterStep(ctx, next) : finish(ctx, "completed");
}

/**
 * The reducer. `steps` is the flow-ordered registry (welcome first, ready
 * last); events that make no sense in the current state return `state`
 * unchanged so callers can dispatch blindly from key handlers.
 */
export function onboardingReducer(
  state: OnboardingState,
  event: OnboardingEvent,
  steps: StepGate[],
): OnboardingState {
  const ctx = state.context;

  if (event.type === "SET_CONTEXT") {
    return { ...state, context: { ...ctx, ...event.patch } };
  }

  switch (state.status) {
    case "idle":
      // Only opening events do anything from idle.
      if (event.type === "START_SETUP") {
        const first = steps.length ? steps[0].id : null;
        return first ? enterStep(ctx, first) : state;
      }
      if (event.type === "JUMP") {
        return enabledSteps(steps, ctx).some((s) => s.id === event.stepId)
          ? enterStep(ctx, event.stepId)
          : state;
      }
      return state;

    case "welcome":
      switch (event.type) {
        case "START_SETUP":
        case "NEXT":
          return advance(state, steps, ctx);
        // Esc on W0 is "Just give me the click", not "skip this screen".
        case "SKIP_ALL":
        case "SKIP_STEP": {
          const remaining = enabledSteps(steps, ctx)
            .map((s) => s.id)
            .filter((id) => id !== "welcome" && !ctx.visited.includes(id));
          const next = remaining.reduce<OnboardingContext>((acc, id) => skip(acc, id), ctx);
          return finish(next, "skipped");
        }
        case "JUMP":
          return enabledSteps(steps, ctx).some((s) => s.id === event.stepId)
            ? enterStep(ctx, event.stepId)
            : state;
        case "CLOSE":
          return finish(ctx, "closed");
        default:
          return state;
      }

    case "step":
      switch (event.type) {
        case "NEXT":
          return advance(state, steps, ctx);
        case "SKIP_STEP": {
          const next = state.stepId ? skip(ctx, state.stepId) : ctx;
          return advance({ ...state, context: next }, steps, next);
        }
        case "BACK": {
          const prev = nextEnabledStep(steps, state.stepId, ctx, -1);
          return prev ? enterStep(ctx, prev) : state;
        }
        case "JUMP":
          return enabledSteps(steps, ctx).some((s) => s.id === event.stepId)
            ? enterStep(ctx, event.stepId)
            : state;
        case "SKIP_ALL": {
          const remaining = enabledSteps(steps, ctx)
            .map((s) => s.id)
            .filter((id) => id !== "welcome" && !ctx.visited.includes(id));
          const next = remaining.reduce<OnboardingContext>((acc, id) => skip(acc, id), ctx);
          return finish(next, "skipped");
        }
        case "CLOSE":
          // "Start practicing" on W7 is a CLOSE that counts as completion.
          return finish(ctx, ctx.visited.includes("ready") ? "completed" : "closed");
        case "START_SETUP":
          return state;
        default:
          return state;
      }

    case "done": {
      // Re-opening (Settings → "Run setup again", or the chip) is a fresh
      // run: the previous run's skipped/visited must not leak into it.
      const fresh: OnboardingContext = { skipped: [], visited: [] };
      if (event.type === "START_SETUP") {
        const first = steps.length ? steps[0].id : null;
        return first ? enterStep(fresh, first) : state;
      }
      if (event.type === "JUMP") {
        return enabledSteps(steps, fresh).some((s) => s.id === event.stepId)
          ? enterStep(fresh, event.stepId)
          : state;
      }
      return state;
    }
  }
}

/** Curried form for `useReducer(makeOnboardingReducer(steps), …)`. */
export function makeOnboardingReducer(steps: StepGate[]) {
  return (state: OnboardingState, event: OnboardingEvent): OnboardingState =>
    onboardingReducer(state, event, steps);
}

/** True while the overlay should be on screen. */
export function isWizardOpen(state: OnboardingState): boolean {
  return state.status === "welcome" || state.status === "step";
}
