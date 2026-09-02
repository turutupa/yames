# Yames First-Run & Product Polish Plan

> **Status:** Active. Parallel product track to `ROADMAP.md`; it does not
> block or depend on the roadmap phases except where noted (coach step
> uses T03/T04 capabilities).
> **Written:** 2026-09-02.
> **Audience:** owner + coding agents. Each item in §7 is sized and has a
> gate; §8 turns them into worker briefs under `plans/tasks/onboarding/`.
> **Goal in one line:** the first ten minutes with Yames should feel like
> a finished product made by people who practice — not a settings page.

---

## 1. What happens today on first launch

| Moment | Today |
|---|---|
| Window opens | 800×900, always-on-top, dark theme, metronome tab, coach card collapsed. |
| First-run detection | `storeLoad("instrument")` is empty → `InstrumentPickerModal` (5 instruments, skippable; skip = electric guitar). That is the entire onboarding. |
| Coach | `coachBrainTier` defaults to `off`, `coachVoiceMode` to `silent`. Nothing invites the user to try it or explains what it is. |
| Audio input | Never set up unless the user finds Settings → Devices. |
| Hotkeys / MIDI / gamepad | Undiscoverable until Settings → Hotkeys. |
| Tabs (Metronome, Drill, Track), Zen, floating widget, presets | Unexplained. |
| Updates | `autoCheckUpdates` on; banner appears when an update exists. No "what's new". |
| Re-running setup | Impossible. No help menu, no tour. |
| Empty states | Coach card has one; presets/history/drill have none. |

Strengths to build on: the picker's copy and card style already look
good (`.instrument-picker-*` in `main-window.css`), the coach greeting
system is context-aware, the hotkeys section is complete, the input
tester and audio-input test modal already exist, and the app is fully
localised (15 locales).

---

## 2. Principles

1. **Hear a click in under ten seconds.** The skip path must land on a
   working metronome immediately. Setup is offered, never imposed.
2. **One decision per screen, every screen skippable, everything
   re-openable.** Esc skips; Settings → General → "Run setup again";
   Help → "Take the tour". **Selecting never advances.** Clicking a
   card only selects it (and may preview live); only Next, Start
   practicing, or Skip moves on, so a misclick is harmless (owner rule,
   2026-09-02).
3. **The app demonstrates itself.** The click plays softly during the
   wizard; sound and theme choices preview live; the last step lets the
   user play a few bars and see timing dots. Show, don't explain.
4. **Honest about hardware.** The coach step recommends a tier from real
   RAM/GPU facts (T03/T04 capabilities) and never oversells a download.
5. **Eyes-free carries through.** Every wizard step is keyboard-only
   navigable; the hands-free step maps a footswitch on the spot.
6. **Progressive disclosure after day one.** Six contextual one-time hints
   replace a wall of explanation; at most one hint per session.
7. **No new strings outside i18n. No motion that ignores the user's
   reduced-motion preference. Minimum window (480×780) must fit every
   screen.**

---

## 3. The first-run flow

```
launch ─► first run? ──no──► normal app (+ what's-new if version changed)
            │yes
            ▼
   [W0] Welcome ── "Just give me the click" ──► metronome + "Finish setup" chip
            │ "Set me up (about a minute)"
            ▼
   [W1] Instrument ─► [W2] Sound & look ─► [W3] Hands-free ─► [W4] Coach?
                                                                 │
                                          no ◄───────────────────┼─────────► yes
                                          │                                  ▼
                                          │                     [W5] Audio input + level check
                                          │                                  ▼
                                          │                     [W6] Hear it work (play 8 beats)
                                          ▼                                  ▼
                                   [W7] Ready ◄──────────────────────────────┘
                                          │ "Start practicing"
                                          ▼
                              metronome @ 80 BPM ─► offer the 6-stop tour
```

### W0 — Welcome
- Full-window overlay, logo pulsing in sync with a soft 80 BPM click
  (uses `onBeat`; muted if the user chose "Just give me the click").
- Copy: product name, one line ("A metronome built for real practice.
  Hands stay on the instrument."), two buttons. Version and "Free,
  local, open source" in small print.
- "Just give me the click" → closes, applies defaults (electric guitar,
  Obsidian theme, woodblock), shows a small "Finish setup" chip in the
  header that opens the wizard at W1 and disappears once completed or
  dismissed twice.

### W1 — Instrument
- The existing picker content in the wizard frame. Skip = electric
  guitar (unchanged). Selecting plays a short instrument-appropriate
  click sample preview? No — sound is W2. Keep W1 pure.

### W2 — Sound & look
- Left: click sound cards (the 6 engine sound sets), hovering/focusing a
  card switches the softly-playing click to it; Space toggles play.
- Right: three curated themes (Obsidian, Aurora, Ivory) with live
  preview by applying the theme to the whole window behind the overlay;
  "More themes in Settings" link.
- Both persist immediately via the existing `setSoundType` / `setTheme`.

### W3 — Hands-free control
- Three cards: Keyboard (shows the five keys that matter: Space,
  ↑/↓ BPM, T tap tempo, C coach, Cmd/Ctrl-1/2 tabs), MIDI footswitch,
  Gamepad.
- MIDI: live device list from `listMidiDevices` / `onMidiDevicesChanged`.
  If a device is present: "Press the pedal you want for Play/Stop" using
  the existing capture path (`KeybindingCaptureModal` / `useMidi`
  learn mode) → one binding saved. Otherwise a one-line "Plug one in
  any time; Yames will offer to map it."
- Gamepad: same idea via `useGamepad`.

### W4 — Practice coach (opt-in)
- Two lines on what it does (listens through your input, scores timing,
  speaks tips) and a privacy line (all local, nothing leaves the machine).
- Three choices with honest facts from `getCoachCapabilities()` and
  `getSystemMemoryMb()` (T03/T04): *Timing feedback only* (no download),
  *Standard brain* (~2.5 GB download, ~4 GB RAM), *Studio* (~5 GB,
  needs 16 GB RAM; disabled with reason below 16 GB). The recommended
  one is pre-selected.
- Choosing a brain starts the download in the background immediately
  (existing `useCoachDownload`), with progress shown as a thin bar in
  the wizard footer and later in the coach card; the wizard does not
  wait for it.
- Voice: not chosen here; when the voice download completes a toast
  offers "Pick a voice" (deep-links to Settings → Coach).

### W5 — Audio input (only if W4 ≠ timing-off, or user opts in)
- Device dropdown (existing `AudioInputDropdown`), live level meter
  (existing `AudioInputTestModal` internals extracted to a reusable
  `InputLevelMeter`), channel picker when the device has >1 channel.
- Guidance line per instrument ("Plug your guitar into the interface,
  or use the laptop mic — the mic works, an interface is better").
- Gate: the meter must show signal for ≥ 1 s before "Next" enables;
  "Skip, I'll set this up later" always available.

### W6 — Hear it work
- Metronome plays 8 beats at 80 BPM; the user plays along; the existing
  real-time onset dots and timing ring render inside the wizard
  (reusing `DriftMeter` / evaluation components). At the end: one
  honest sentence from the template coach ("Mostly on top of the beat —
  the coach will track this every session") and the calibration
  offset is seeded exactly as a normal session would.
- If nothing is detected: "Didn't hear anything — check the input level"
  with a back button to W5. Never a fake result.

### W7 — Ready
- Summary card: instrument, sound, theme, control method, coach tier,
  input device. Each row is a link back to that step.
- "Start practicing" → wizard closes, metronome at 80 BPM, instrument
  preset applied, coach card collapsed with the greeting reflecting the
  setup ("Set up for electric guitar with a footswitch. Hit play when
  you're warm.").
- Offer the tour: "Show me around (30 s)" / "I'll explore".

---

## 4. The tour (spotlight, six stops)

In-house spotlight component (`Tour.tsx`), no third-party library:
targets are elements carrying `data-tour="<id>"`; the component measures
their rects on open/resize and cuts a rounded hole in a dimmed overlay
with a card anchored to the target. Keyboard: ←/→/Esc. Reduced motion
disables the hole's easing.

| # | Target | One sentence | Hotkey shown |
|---|---|---|---|
| 1 | BPM dial | Drag, scroll, type, or tap the tempo. | ↑/↓, T |
| 2 | Subdivision + groups | Click subdivisions and shape the bar with beat groups. | S / G |
| 3 | Presets sidebar | Save any setup and switch instantly. | P |
| 4 | Drill tab | Ramp tempo automatically; the coach can adapt it. | Cmd/Ctrl-2 |
| 5 | Coach card | Listens, scores, and speaks. Press ? to ask it anything. | C, ? |
| 6 | Zen + widget | Fullscreen visuals, or a tiny always-on-top widget. | F, W |

Re-openable from Help and from Settings → General. Stored as
`tour.seenVersion` so a redesigned UI can re-offer it.

---

## 5. Progressive hints (one per session, each fires once)

`useFirstTimeHint(id)` renders a small dismissible card near the
relevant control; state under `hints.<id>` in the store.

| id | Trigger | Copy |
|---|---|---|
| `drill-first-open` | first time on Drill tab | "Set start, target and step. Adaptive mode lets the coach decide." |
| `preset-suggest` | same BPM+subdivision+groups used in 3 sessions with no preset | "Save this setup as a preset?" (button) |
| `coach-ask` | first mini-report rendered | "Press ? any time to ask the coach about this." |
| `zen-first` | first time entering Zen | "Esc leaves Zen. Effects are in Settings → Appearance." |
| `widget-discover` | 5th session, widget never opened | "Try the floating widget (W) over your DAW or tabs." |
| `midi-plugged` | MIDI device appears and has no bindings | "Map a pedal to Play/Stop?" (button opens capture) |

---

## 6. Everyday polish

- **Empty states** with one action each: presets ("Save your first
  preset" → P), session history ("Your sessions will show up here after
  you stop the metronome"), drill idle (explains modes), coach card
  (existing, keep).
- **What's new**: after an update, a one-time modal with the release
  notes for the installed version (the updater already fetches
  `latest.json`; show the `notes` body once, store `whatsNew.seenVersion`).
- **Help menu** (header `?` button, also Cmd/Ctrl-/): Take the tour, Run
  setup again, Keyboard shortcuts (sheet reusing `HotkeysSettingsSection`
  read-only), Report a problem (existing log export), Website, Version.
- **Always-on-top on first run**: keep the default, but the W7 summary
  states it with a toggle ("Yames stays above other windows — change").
- **Motion**: the wizard uses the existing `ViewTransition` pattern;
  everything honours `prefers-reduced-motion` and the `viewTransitions`
  preference.
- **Minimum window**: every wizard/tour screen verified at 480×780 and
  at 800×900; content scrolls inside the card, never the window.
- **Website + README**: a "First run" section with three screenshots
  from the extended `take-screenshots.sh` (macOS) and the Windows
  equivalent.

---

## 7. Work items (sized; gate = definition of done)

| # | Item | Size | Depends on | Gate |
|---|---|---|---|---|
| O1 | Wizard shell: `src/containers/onboarding/` (overlay, step frame, progress dots, keyboard nav, focus trap), pure `onboardingMachine.ts`, `useOnboarding` (store keys `onboarding.version`, `onboarding.completedAt`, `onboarding.skipped[]`), W0 + W1 + W7, "Finish setup" chip, Settings → General → Run setup again. Replaces `InstrumentPickerModal` mount (component kept as the W1 body). Migration: existing users (instrument set, no `onboarding.version`) get no wizard, only the what's-new/tour offer. | M | — | vitest for the machine (all transitions, skip paths, migration); component tests for W0/W1/W7; `tsc`, i18n key parity test green; manual at 480×780. |
| O2 | W2 sound & look with live preview | S | O1 | component test; sound switches within one beat; theme reverts on Esc if not confirmed. |
| O3 | W3 hands-free with live MIDI/gamepad detection and one-tap Play/Stop mapping | M | O1 | vitest with mocked `listMidiDevices`/`onMidiAction`; manual with a real pedal (owner). |
| O4 | W4 coach opt-in with honest tiers + background download hand-off + voice toast | M | O1, T03, T04 | vitest for tier recommendation (RAM matrix); download starts and wizard proceeds without waiting. |
| O5 | W5 audio input + `InputLevelMeter` extraction + W6 hear-it-work | M | O1, O4 | component tests; W6 uses the real evaluation path (no fake result); manual on mic and interface (owner). |
| O6 | Tour component + six stops + `data-tour` attributes + Help entry | M | O1 | vitest for rect/anchoring math; keyboard nav; manual on both window sizes. |
| O7 | Hints framework + six hints + rate limit | M | O1 | vitest: fires once, one per session, persisted. |
| O8 | Empty states, what's-new modal, Help menu, always-on-top row, reduced-motion audit | S–M | O1 | snapshot tests; what's-new shows exactly once per version. |
| O9 | Screenshots, website/README "First run" section, locale copy review for all 15 languages | S | O1–O8 | assets in `docs/img/onboarding/`; i18n parity test green. |

Order: O1 → (O2, O3, O6, O7 in parallel) → O4 → O5 → O8 → O9.
O4/O5 wait for roadmap T03/T04 to merge so the coach step is truthful.

---

## 8. Success criteria

- Skip path: click audible ≤ 10 s after launch on a cold start.
- Full wizard: ≤ 90 s for a user who accepts defaults; every step
  operable with keyboard only.
- No fake feedback anywhere (W6 shows real onsets or says it heard
  nothing).
- Zero untranslated strings (existing `i18n.locales` parity test).
- All new UI passes at 480×780 without page scroll.
- Every screen re-reachable from Help or Settings.

---

## 9. Decisions (owner approved the proposals, 2026-09-02)

1. **Tone.** Product-neutral copy in the wizard; the coach's own voice
   takes over from W6 ("hear it work") onward.
2. **Default theme.** Obsidian preselected in W2.
3. **Timing-only users** still get W5+W6 offered as an optional "Try the
   listening feature" branch.
4. **Always-on-top** stays on by default; W7 shows it with a toggle.
5. **Studio tier** appears in W4 greyed out with the RAM reason when the
   machine has < 16 GB; selectable otherwise.
