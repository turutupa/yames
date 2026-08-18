# First-Time User Experience (FTUE) Plan

> **Goal.** Give every new Yames user a warm, fast, and genuinely useful
> welcome — so the app makes a great first impression, and they understand
> the full value (metronome → drill → pocket check) within 2 minutes.
>
> **Non-goals.** No forced tour. No annoying pop-ups after first launch.
> Nothing that re-appears once dismissed.

---

## Research Synthesis

Before defining tasks, key findings from studying top-tier FTUE patterns
(Superhuman, Notion, Linear, GarageBand, Figma):

| Finding | How we apply it |
|---------|----------------|
| Value in 60 seconds | First thing user hears is a click. Wizard navigates to each tab so they see the actual UI. |
| Skippable = higher completion | Every step has "I'll explore on my own" — soft label, not "Skip". |
| ≤ 5 steps per tour | Each tab tour has max 4 coach marks. |
| Progress indicator is non-negotiable | Persistent "Step 2 of 4" pill + dot stepper visible throughout. |
| Interactive > passive slideshow | Coach marks point at real UI elements. Steps ask user to *do* something, not just read. |
| Welcome framing, not education | Welcome screen: 3 sentences max. Emotional hook, not feature list. |
| Open directly into the app | No splash screen interstitial. Welcome modal floats *over* the real metronome. |

---

## Architecture Overview

```
MainWindow.tsx
  └── OnboardingProvider (context)
        ├── WelcomeModal          — shown once, first launch only
        └── OnboardingWizard      — step-by-step coach marks overlay
              ├── MetronomeTour   (4 steps)
              ├── DrillTour       (3 steps)
              ├── PocketCheckTour (3 steps)
              └── SettingsTour    (3 steps)
```

**Persistence:** `storeSave("onboardingCompleted", true)` via the existing
`ipc.ts` helpers. Same pattern as the instrument picker modal.

**First-run detection:** `storeLoad("onboardingCompleted")` on mount in
a new `useOnboarding` hook. If `null` (key absent) → show welcome flow.
Works correctly across updates (key already written, flow never replays).

**Tab routing:** The wizard drives `setView` to navigate to each tab
before its coach marks appear. Users see the real UI — no fake mockups.

---

## Component Plan

### `useOnboarding` hook
`src/containers/main-window/hooks/useOnboarding.ts`

- `isFirstRun: boolean` — whether to show the flow (loaded async on mount)
- `step: OnboardingStep | null` — current coach mark descriptor
- `tourIndex: number` — which tour (0–3)
- `advance()` / `back()` / `skip()` / `complete()` — navigation actions
- On `complete()` or `skip()`: calls `storeSave("onboardingCompleted", true)`,
  nulls out all state

### `WelcomeModal`
`src/components/onboarding/WelcomeModal.tsx`

Floats centered over the metronome view. Semi-transparent backdrop (not full block).
User can still see the metronome behind it — reinforcing "this is the app".

```
┌─────────────────────────────────────┐
│                                     │
│   Welcome to Yames.                 │
│                                     │
│   A precision metronome and         │
│   practice coach — built to make    │
│   your practice sessions count.     │
│                                     │
│   Thanks for trying it. If it       │
│   clicks for you, tell a friend 🎸  │
│                                     │
│  [ Take a quick tour ]              │
│  [ I'll explore on my own  ]        │
│                                     │
└─────────────────────────────────────┘
```

"Take a quick tour" → starts `OnboardingWizard`.
"I'll explore on my own" → marks onboarding complete, closes.

### `OnboardingWizard`
`src/components/onboarding/OnboardingWizard.tsx`

Renders:
1. A spotlight overlay (darkened backdrop with a cutout around the target element)
2. A floating tooltip card anchored to the target element
3. A persistent progress bar: tour tabs + step dots

Tooltip card anatomy:
```
┌─────────────────────────────────┐
│  Metronome  ● ● ○ ○             │  ← tour name + step dots
│─────────────────────────────────│
│  BPM Dial                       │  ← step title
│  Drag or scroll to set your     │
│  tempo. Works up to 300 BPM.    │  ← step body
│─────────────────────────────────│
│  [ Back ]           [ Next → ]  │
│  I'll explore on my own         │  ← soft skip, always visible
└─────────────────────────────────┘
```

Tour tab indicator (top of wizard overlay):
```
  [● Metronome]  [○ Drill]  [○ Pocket Check]  [○ Settings]
```
Clicking an inactive tab does nothing (avoids confusion). Progress only
moves forward via "Next".

### Spotlight mechanism

Each `OnboardingStep` descriptor carries:
```ts
interface OnboardingStep {
  targetSelector: string;   // CSS selector of the element to highlight
  title: string;
  body: string;
  tooltipAnchor: 'top' | 'bottom' | 'left' | 'right';
  action?: 'do-something';  // optional interactive prompt
}
```

Implementation: measure target element via `getBoundingClientRect()`,
punch a transparent hole in a full-screen `position: fixed` overlay div
using `clip-path` or a box-shadow approach (classic coach mark trick).

---

## Tour Content

### Tour 1 — Metronome (4 steps)

| Step | Target element | Content |
|------|---------------|---------|
| 1 | BPM dial / number display | **"Set your tempo"** — Drag the dial, scroll, or type a BPM directly. Goes from 20 to 300. |
| 2 | Play/stop button | **"Start the click"** — Hit play. You'll hear the metronome and see the beat ring pulse. Try it now. |
| 3 | Time signature selector | **"Pick your meter"** — 4/4 for most things. 3/4 for waltzes. 7/8 when you're feeling bold. |
| 4 | Presets button / sidebar | **"Save your setups"** — Save any combination of BPM, time sig, and sound as a preset. Great for warm-up routines. |

### Tour 2 — Drill (3 steps)

Wizard calls `setView("drill")` before showing step 1.

| Step | Target element | Content |
|------|---------------|---------|
| 1 | Start/target BPM inputs | **"Set your speed ramp"** — Choose where you start and where you want to end up. Drill builds tempo gradually so your muscle memory keeps up. |
| 2 | Increment / loop controls | **"Control the climb"** — How many BPM to add per loop, and how many loops before it steps up. Small increments = cleaner gains. |
| 3 | Play button + ramp indicator | **"Start the ramp"** — Hit play and focus on playing clean. Yames handles the tempo increases. When you nail a segment, it moves you forward. |

### Tour 3 — Pocket Check (3 steps)

Wizard calls `setView("track")` before showing step 1.

| Step | Target element | Content |
|------|---------------|---------|
| 1 | Track selector / idle screen | **"Test your timing"** — Pocket Check listens to you play and scores your timing against the click. Honest feedback, not flattery. |
| 2 | Tap area / record button | **"Play along"** — Start the metronome, play something, then stop. Pocket Check analyzes how locked-in you were. |
| 3 | Score display area | **"Read your score"** — The ring shows timing accuracy. The coach message tells you what to work on. Run it a few sessions in a row to see real progress. |

### Tour 4 — Settings (3 steps)

Wizard calls `setView("settings")` before showing step 1.

| Step | Target element | Content |
|------|---------------|---------|
| 1 | Theme / visual section | **"Make it yours"** — Light, dark, or one of the custom themes. The visual style doesn't affect anything functional — pick what keeps you focused. |
| 2 | MIDI / audio device section | **"Plug in your gear"** — Connect a MIDI controller or pick your audio output. Yames works great with a foot pedal for hands-free start/stop. |
| 3 | Practice coach tier | **"Coach intensity"** — The coach can be quiet (just scores) or talkative (full narrative tips). Tune it to how much feedback you want while playing. |

---

## Priority Tiers

### P0 — Core flow (must-ship for FTUE to be meaningful)

- [ ] `useOnboarding` hook with first-run detection + persistence
- [ ] `WelcomeModal` component (design + copy above)
- [ ] Wire `WelcomeModal` into `MainWindow.tsx` following `InstrumentPickerModal` pattern
- [ ] Ensure app always opens to metronome view on first launch (check `useTabRouting` — if it restores to a non-"beat" tab before any tab is saved, default to "beat")

### P1 — Wizard (the main event)

- [ ] `OnboardingWizard` container with tour state machine
- [ ] Spotlight overlay component (CSS clip-path approach — no extra deps)
- [ ] Tooltip card component with back/next/skip
- [ ] Tour tab progress indicator (visual only, not interactive)
- [ ] Step dot indicator within each tour
- [ ] `MetronomeTour` — 4 steps with selectors and copy above
- [ ] `DrillTour` — 3 steps, triggers `setView("drill")`
- [ ] `PocketCheckTour` — 3 steps, triggers `setView("track")`
- [ ] `SettingsTour` — 3 steps, triggers `setView("settings")`
- [ ] Return to `"beat"` view when wizard closes

### P2 — Polish

- [ ] Animated transition when switching tabs between tours (300ms ease)
- [ ] Subtle pulse animation on the spotlight cutout to draw the eye
- [ ] "Replay tour" option in Settings so users can re-run it later
- [ ] Keyboard support: arrow keys for next/back, Esc to skip
- [ ] Reduce motion: respect `prefers-reduced-motion` — disable spotlight pulse and transitions

### P3 — Nice-to-have

- [ ] Track which tours were completed vs skipped (store per-tour flags, not just a single `onboardingCompleted`)
- [ ] Surface a contextual "learn more" coach mark the first time a user hits a feature they haven't seen in the tour
- [ ] Analytics: log `onboarding_started`, `onboarding_completed`, `onboarding_skipped_at_step` events if telemetry is ever wired

---

## Implementation Notes

### Selector strategy for spotlight
Use `data-onboarding-id="bpm-dial"` attributes on target elements instead
of class/id selectors. Decouples the onboarding layer from styling concerns.
Add these attributes surgically to the ~13 target elements across the four views.

### Tab switching during wizard
The wizard calls `setView` from `useTabRouting` (passed down via props or
context). Before switching, briefly show a "Moving to Drill…" transition
slide so the tab change feels intentional, not jarring.

### Mobile / small windows
The wizard tooltip card should be `position: fixed` and responsive.
On narrow windows (< 480px), anchor it bottom-center regardless of
`tooltipAnchor` to avoid clipping. Pocket Check is currently desktop-only
anyway — no special case needed there.

### No new dependencies
The spotlight overlay, tooltip card, and modal are all plain React + CSS.
No Shepherd.js, Intro.js, or Driver.js. Those libraries fight with Tauri's
webview in non-trivial ways, and the design above is simple enough to build
from scratch in < 400 lines.

### Existing `InstrumentPickerModal` interaction
The welcome flow runs *after* the instrument picker. If it's the first launch:
1. `InstrumentPickerModal` fires (existing behavior, unchanged)
2. After user picks an instrument → `WelcomeModal` appears
3. User starts tour or skips

To chain these: in `MainWindow.tsx`, watch `showInstrumentPicker` going from
`true → false` and trigger `showWelcome` if `isFirstRun` is true. Or simply
check both in `useOnboarding`: if no `instrument` key exists yet, defer
showing the welcome until `instrument` is written.

---

## File Checklist

```
src/
  components/
    onboarding/
      WelcomeModal.tsx          (new)
      OnboardingWizard.tsx      (new)
      OnboardingTooltip.tsx     (new)
      SpotlightOverlay.tsx      (new)
      tours/
        MetronomeTour.ts        (new — step descriptors only, no JSX)
        DrillTour.ts            (new)
        PocketCheckTour.ts      (new)
        SettingsTour.ts         (new)
  containers/
    main-window/
      hooks/
        useOnboarding.ts        (new)
      MainWindow.tsx            (surgical edit — wire WelcomeModal + OnboardingWizard)
  containers/
    metronome/MetronomeView.tsx        (surgical edit — add data-onboarding-id attrs)
    drill/DrillView.tsx                (surgical edit — add data-onboarding-id attrs)
    pocket-check/TrackIdleView.tsx     (surgical edit — add data-onboarding-id attrs)
    settings/SettingsView.tsx          (surgical edit — add data-onboarding-id attrs)
```

Total new files: ~9. All focused and < 150 lines each.
Total edited files: 5 (all surgical — just wiring + data attributes).

---

## Copy Reference

### Welcome modal copy (final)

> **Welcome to Yames.**
>
> A precision metronome and practice coach — built for musicians who take
> their playing seriously.
>
> Thanks for downloading. If it clicks for you, tell a friend. 🎸

CTAs: **"Take a quick tour"** / *"I'll explore on my own"*

### Tour intro slides (brief tab-transition card shown when switching tabs)

- Drill: *"Next up: Drill mode — your speed trainer."*
- Pocket Check: *"Next up: Pocket Check — your timing judge."*
- Settings: *"Last up: Settings — make Yames yours."*

---

## Status

> Started: 2026-08-18
> Last updated: 2026-08-18

| Tier | Status |
|------|--------|
| P0 — Core flow | ⬜ Not started |
| P1 — Wizard | ⬜ Not started |
| P2 — Polish | ⬜ Not started |
| P3 — Nice-to-have | ⬜ Not started |
