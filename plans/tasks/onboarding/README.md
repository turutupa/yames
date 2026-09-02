# Onboarding task briefs — first-run experience & product polish

Source plan: `plans/ONBOARDING_PLAN.md` (read §2 principles, §3 flow,
§9 decisions before any brief). Same working rules as
`plans/tasks/phase-0/README.md` — read that file too: one branch per
task, `refactor:`/`chore:` commits, no file rewrites, validation chain
after every step, report format, Windows toolchain notes.

## Order and parallelism

```
O1 wizard shell + machine + W0/W1/W7 + reset  ──►  O2 sound & look (W2)
                                              ──►  O3 hands-free (W3)
                                              ──►  O6 tour
                                              ──►  O7 hints
O4 coach opt-in (W4)   needs O1 + roadmap T03/T04 merged
O5 input + hear-it-work (W5/W6)   needs O4
O8 empty states / what's-new / help   needs O1 (parallel with O2–O7)
O9 screenshots + docs   last
```

## Contract every step follows (defined by O1, consumed by O2–O5)

```ts
// src/containers/onboarding/steps/types.ts
export type WizardStepProps = {
  onNext: () => void;          // advance (persists step result first)
  onBack: () => void;
  onSkip: () => void;          // marks step skipped, advances
  isActive: boolean;           // step is the visible one
};
export type WizardStepDef = {
  id: "welcome" | "instrument" | "sound-look" | "hands-free" | "coach" |
      "audio-input" | "hear-it-work" | "ready";
  Component: React.ComponentType<WizardStepProps>;
  /** Return false to hide the step for this run (e.g. audio-input when
   *  coach tier is "off" and the user declined the optional branch). */
  isEnabled?: (ctx: OnboardingContext) => boolean;
};
```

Steps register in `src/containers/onboarding/steps/index.ts` in flow
order. Adding a step = adding a file + one array entry. The machine
(`onboardingMachine.ts`) is pure: `(state, event) => state`, no React,
fully unit-tested.

## Store keys (tauri-plugin-store `settings.json`, via `storeLoad/Save`)

| key | type | meaning |
|---|---|---|
| `onboarding.version` | number | wizard schema version completed or skipped (1 for this plan) |
| `onboarding.completedAt` | ISO string | when W7 was reached |
| `onboarding.skipped` | string[] | step ids skipped |
| `onboarding.chipDismissed` | number | times the "Finish setup" chip was dismissed (hide at 2) |
| `tour.seenVersion` | number | tour version last completed/dismissed |
| `hints.<id>` | boolean | hint shown |
| `hints.lastShownSession` | number | session counter of the last hint (rate limit) |
| `whatsNew.seenVersion` | string | app version whose notes were shown |

## First-run detection (O1 owns this)

- `instrument` unset AND `onboarding.version` unset → full wizard (W0).
- `instrument` set AND `onboarding.version` unset → existing user:
  no wizard; set `onboarding.version = 1`, offer the tour once.
- `onboarding.version` set → normal launch.

## Where the briefs live

Worktrees are created from `main`, which may not contain `plans/`.
Read briefs from the main checkout:
`C:\Users\alber\Dev\yames\plans\tasks\onboarding\` (or `plans/` on the
`docs/roadmap-phase0` branch). Base your branch on `main`.
