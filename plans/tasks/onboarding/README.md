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

**Selection never advances a step.** A card click selects (and may
preview); only Next / Start practicing / Skip advance. Every step's
tests must cover "click does not advance".

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

## First-run detection (O1 owns this; corrected by O1b)

Detection reads one **prior-use signal**, not the `instrument` key alone:

> prior use ⇔ (`instrument` set AND ≠ `"other"`) OR `getSessionHistory()`
> non-empty OR `listPresets()` non-empty

- `onboarding.version` unset AND no prior use → full wizard (W0).
- `onboarding.version` unset AND any prior use → existing user: no wizard;
  set `onboarding.version = 1` + `onboarding.completedAt`, offer the tour once.
- `onboarding.version` set → normal launch.

Why the signal is wider than `instrument` (O1b bug):
`commands.rs::persist_state` writes the whole `AppState` to `settings.json`
on every settings command (`set_bpm`, `set_volume`, `set_theme`, … — twelve
call sites). On a fresh install it therefore wrote
`instrument: "other"` — `Instrument::default()`, which means *"no choice
made"*, not a choice — before the user had touched anything. The old rule
("`instrument` set → existing user") then skipped the wizard forever and
stamped the schema, and the pre-wizard `InstrumentPickerModal` keyed on the
same signal, so it likely never showed for new users either.

Both sides are fixed:

- Rust: `commands.rs::should_persist_instrument` gates the write —
  `persist_state` writes `instrument` only when the store already has the
  key, or when the state holds a real choice (anything but `Other`). Every
  other key is written as before. Unit-tested as a pure function
  (`commands::tests::default_instrument_is_not_written_into_a_store_without_one`
  and friends) because `persist_state` needs a live Tauri `State`/`AppHandle`.
  The store now truthfully lacks an instrument until the user picks one or
  the coming-soon migration in `lib.rs` (~L171) writes one.
- Rust: `commands.rs::resolve_startup_window` decides which window opens.
  `lastWindow` is written only by `show_main` / `show_floating`, so it is
  absent exactly once — on a fresh install — and the old `"floating"`
  default meant a first-time user saw the 400x160 widget while the wizard
  mounted (and played its preview click) inside the still-hidden main
  window, with `app_ready` returning early and never calling `show()`.
  It now defaults to `"main"`; a stored value is honoured verbatim. Both
  startup call sites share the function (`app_ready`, and the widget's
  show/hide in `lib.rs` ~L402) — they have to agree or a fresh install
  would open both windows.
- Frontend: `useOnboarding.hasPriorUse(instrument, sessionCount, presetCount)`
  is pure and exported, and treats `"other"` exactly like an absent key. It
  is correct on its own even against an old store already poisoned with
  `instrument: "other"`, and a `getSessionHistory()`/`listPresets()` call
  that rejects counts as *no* signal (never as prior use).

## Where the briefs live

Worktrees are created from `main`, which may not contain `plans/`.
Read briefs from the main checkout:
`C:\Users\alber\Dev\yames\plans\tasks\onboarding\` (or `plans/` on the
`docs/roadmap-phase0` branch). Base your branch on `main`.
