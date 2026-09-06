# UI revamp — parity inventory

> **Status:** Built 2026-09-04 as `UI_REVAMP.md` item A1, before anything was
> deleted or moved. This is the record of what Yames does *today*.
> **Purpose:** the revamp's merge condition. Every feature listed here must
> exist after the revamp, with exactly one exception (§2).
> **How to use:** each Phase C item ticks off its own area and nothing merges
> into `ui-revamp` with unticked boxes in that area. A box you cannot tick is
> either a bug to fix or a decision to take — never a box to quietly delete.
> **Companion:** `MANUAL_TEST_CHECKLIST.md` covers what *changed* in the last
> release. This covers what *exists*. They overlap and both are needed.

Baseline: `main` at 1f22919, v1.0.4. English locale carries **688 keys**
across 30 groups; **649** of them must survive the revamp.

---

## 1. How parity is checked

1. **Locale-key coverage (automated, CI).** Every user-visible string is a
   key. The check fails when a key has no call site, or a call site names a
   key that does not exist. The allowlist in §2 is the only permitted set of
   deletions. This is the cheapest and broadest net: 688 keys is a far more
   complete inventory of the product than any list a person would write.
2. **Action coverage (automated, unit test).** All 22 bindable actions in
   `src/hotkeys.ts` still resolve in `useActionDispatcher`, minus `tab-3`.
3. **This document (manual).** For everything that has no string and no
   binding — layout behaviour, persistence, device handling.

---

## 2. The deletion allowlist

Exactly one feature is removed (`UI_DECISIONS.md` U1.7). Anything else
missing after the revamp is a bug, not a decision.

**Pocket Check / Track**

- [ ] `src/containers/pocket-check/` — 9 files including `TrackView.tsx`
      (485 lines) and `TrackView.test.tsx`
- [ ] Locale group `pocketCheck` — 36 keys, all 15 languages
- [ ] Locale key `nav.pocketCheck` — 1 key, all 15 languages
- [ ] Locale keys `settings.hotkeys.actions.tab-3` and
      `settings.hotkeys.descs.tab-3` — 2 keys, all 15 languages (found during
      A6; the hotkey list carries its own label for every action)
- [ ] Bindable action `tab-3` (`src/hotkeys.ts`, `useActionDispatcher`)
- [ ] The `"track"` member of `MainView` and its branches in
      `MainWindow.tsx`, `MainHeader.tsx`, `useTabRouting.ts`,
      `useFullscreenLifecycle.ts`
- [ ] The onboarding tour stop and hint trigger that reference it
      (`onboarding/tour/stops.ts`, `onboarding/hints/triggers.test.ts`)

**Checked before deleting (A6, 2026-09-04):** every IPC call `TrackView`
made — `getCalibrationOffset`, `onBeat`, `setCalibrationOffset`, `setPlaying`,
`togglePlayback` — is defined in `src/ipc.ts` and used elsewhere or wraps a
live engine command, so nothing in `src-tauri` existed solely for Pocket
Check. `getCalibrationOffset` / `setCalibrationOffset` are now unreferenced
from the UI but kept: they wrap the running auto-calibration, and deleting the
wrapper would remove a capability the coach work is likely to want.

**The original precondition, kept for the record:** any IPC command, Rust
type or timing-analysis path that only the Track view exercises today. If
something in `src-tauri` exists solely for Pocket Check, that is a separate
decision and a separate PR — this revamp does not touch Rust.

---

## 3. Inventory by area

### 3.1 Shell and navigation — *Phase B*
Locale groups: `nav`, `tooltip`, `volume`

- [ ] Switch between Metronome and Drill; the active mode is unambiguous
- [ ] The last mode is restored on relaunch
- [ ] Settings opens and returns you to the mode you were in
- [ ] Sound set picker: click, wood, beep, drum — audible change within a beat
- [ ] Metronome volume and TTS voice volume, independently, both persisted
- [ ] Floating widget opens from the shell
- [ ] Share menu: WhatsApp, X, Facebook, Reddit, copy link
- [ ] Always-on-top toggle
- [ ] Window controls (minimise, maximise, close) on Windows and Linux
- [ ] Double-click on empty stage enters Zen
- [ ] Help (`?` / Cmd-/): tour, run setup again, shortcuts sheet, report a problem
- [ ] Update banner: available, install and restart, updating
- [ ] Audio-error notice with "open settings" and dismiss

### 3.2 Metronome — *Phase C1*
Locale groups: `metronome`, `meter`, `subdiv`, `sound`, `driftMeter`

- [ ] BPM 20–300 via −/+, drag, direct entry, slider/ruler
- [ ] Tap tempo, with the tap count shown from the second tap
- [ ] Tempo marking follows `TEMPO_MARKINGS` exactly
- [ ] Subdivisions 1–6, all reachable by click and by hotkey
- [ ] Meter presets: FREE, 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, 8/8, 9/8, 12/8,
      **in ascending order**
- [ ] Meter variants (5/4 as 3+2 or 2+3; 7/8 and 8/8 likewise)
- [ ] FREE mode: 1–16 beats, chevrons wrap at both ends, no accent on any beat
- [ ] Beat-group editor: add/remove beats, per-group accents
- [ ] Cycling meters with hotkey / widget / Zen walks the same order and wraps
- [ ] An unrecognised grouping lands on 4/4 on next/previous, not 2/4
- [ ] Changing meter mid-play keeps main window, widget and Zen dots aligned
      with the audible accent
- [ ] Per-beat hit/miss colouring on the dots while evaluation is on
- [ ] Early/late drift readout while playing (`UI_DECISIONS.md` U2.5)
- [ ] Changing meter mid-practice does not erase the open practice segment
- [ ] Presets saved with the retired "Never" accent still load (they map to FREE)

### 3.3 Drill — *Phase C2*
Locale group: `drill` (34 keys)

- [ ] Modes: linear, zigzag, adaptive
- [ ] Adaptive aggressiveness: conservative, moderate, aggressive
- [ ] Start BPM, target BPM, speed up, slow down, beats per bar, repeats
- [ ] Count-in on/off; cyclic on/off
- [ ] The step grid, with the current cell visible during a run
- [ ] Step and target readout while running; completion state
- [ ] Estimated duration
- [ ] Config auto-collapses on play and re-expands on stop, unless the user
      has toggled it manually
- [ ] Hover highlighting between a field and the part of the grid it controls
- [ ] The evaluation panel and its score breakdown after a run

### 3.4 Coach — *Phase B (frame only)*
Locale groups: `coachStatus`, `coachCard`, `coachDetail`, `coachReport`, `eval`

The panel's **contents ship unchanged** (U4.4). These boxes confirm nothing
was lost in the move into the new dock.

- [ ] Open and close the coach; state persists across relaunch
- [ ] Status line: listening, playing, noodling, thinking, speaking, tracking
- [ ] Feed and History tabs; session detail; clear-all with confirmation
- [ ] Chat input and send
- [ ] Chips
- [ ] Mini-reports and the session narrative
- [ ] Score breakdown, beats hit, coverage, grid, segment
- [ ] Session list: today, yesterday, older; delete one; delete all
- [ ] Input level meter and spectrum in the coach header
- [ ] Voice: greeting, speech, interrupt within a beat, metronome ducking

### 3.5 Zen — *Phase C4*
Locale group: `zen` (13 keys)

- [ ] Enter and exit (double-click, hotkey, Esc); exit hint
- [ ] All six effects: Cosmos, Gravity, Pulse, Radar, Rain, Warp
- [ ] Effect picker and theme picker inside Zen
- [ ] OS fullscreen toggle, separately from Zen
- [ ] Big BPM, beat dots with sub-dots, correct at any meter including 7 beats
- [ ] Drill ramp info and ramp grid while a drill is running
- [ ] Count-in display
- [ ] Tempo, subdivision and meter controls without leaving Zen

### 3.6 Presets — *Phase B*
Locale groups: `presets`, `emptyStates`

- [ ] List, search, open and close the library; keyboard shortcut
- [ ] Load a preset; the active one is marked
- [ ] Save current; update; rename; delete
- [ ] Dirty indicator and revert
- [ ] Per-mode preset lists (metronome vs drill)
- [ ] Empty state when there are none

### 3.7 Settings — *Phase C3*
Locale groups: `settings` (234 keys), `keybindings`, `coachDownload`,
`instrument`, `instrumentPicker`

All eight sections keep their contents (U7.1):

- [ ] General — language (15), updates, always-on-top, run setup again,
      take the tour, reset hints
- [ ] Appearance — all themes, animation style, view transitions, reduced motion
- [ ] Devices — audio output, audio input, channel, MIDI device, instrument
      picker, input tester with record and playback
- [ ] Coach — tier selection, model download and removal, honest status line,
      voice download and selection, verbosity, coaching mode
- [ ] Widget — widget-specific options and always-on-top
- [ ] Hotkeys — all 22 actions rebindable, MIDI learn, conflict dialogs,
      reset to defaults, global-shortcut opt-in
- [ ] Support
- [ ] About — version, licences
- [ ] The settings timeline / section navigation

### 3.8 Floating widget — *untouched, verify only*
Locale group: `widget`

- [ ] Opens, stays on top, shows BPM and dots
- [ ] Meter and ramp readouts
- [ ] Returns to the main window
- [ ] Still themed correctly after the token additions (A2)

### 3.9 Onboarding — *anchors move in Phase B*
Locale groups: `onboarding` (141 keys), `whatsNew`

- [ ] Welcome; "just give me the click"; "set me up"
- [ ] Wizard steps: instrument, sound and look, hands-free, coach, audio
      input, hear it work, ready
- [ ] Finish-setup chip behaviour
- [ ] Spotlight tour: all stops highlight the right controls, at 800×900 and
      at the minimum 480×780 window — **every stop re-anchored to the new
      shell**
- [ ] Progressive hints, at most one per session; reset hints
- [ ] What's-new modal
- [ ] Coach voice toast

### 3.10 Cross-cutting — *every phase*
Locale groups: `common`, `share`, `audioError`, `updateBanner`

- [ ] All 15 languages still load; the language picker lists native names
- [ ] All ten themes still apply, in both groups (dark and light)
- [ ] Reduced motion honoured everywhere
- [ ] The window works down to the 480×780 minimum
- [ ] No screen scrolls horizontally at any supported size

---

## 4. Bindable actions

All 22 must resolve after the revamp except `tab-3`. `tab-1` and `tab-2`
keep their meanings; the third slot stays free until Paths exists (U1.8).

| | | |
|---|---|---|
| `play` | `bpm-up` | `bpm-down` |
| `bpm-up-1` | `bpm-down-1` | `sub-next` |
| `sub-prev` | `sub-1` | `sub-2` |
| `sub-3` | `sub-4` | `sig-next` |
| `sig-prev` | `fullscreen` | `os-fullscreen` |
| `toggle-widget` | `toggle-sidebar` | `toggle-coach` |
| `tab-1` | `tab-2` | ~~`tab-3`~~ *(removed)* |
| `settings` | | |

Each must work from a keyboard binding **and** from a MIDI binding, and
survive a rebind and a reset to defaults.

---

## 5. Sign-off

| Phase item | Areas it must tick | Signed off |
|---|---|---|
| A6 Pocket Check removal | §2 in full | automated ✓ — see below |
| B The shell | 3.1, 3.4, 3.6, 3.9, §4 | code landed, **needs eyes** |
| C1 Metronome | 3.2 | code landed, **needs eyes** |
| C2 Drill | 3.3 | code landed, **needs eyes** |
| C3 Settings | 3.7 | surfaces only; renders, **needs eyes** |
| C4 Zen | 3.5 | renders; always-dark decided (U6.5), **needs eyes** |
| C5 Themes | 3.10 themes row, 3.8 | code landed, **needs eyes** |
| Chains | §6 below | code landed, **needs a real engine** |
| D Merge to main | everything, on a release build | not started |

## 6. Preset chains

Built after the revamp (UI_REVAMP §14, decisions U9.1–U9.7). What a browser
can show has been checked; what it cannot has not.

**Seen working:** chains listed beside presets; loading one puts the track on
the stage with the metronome still under it; all four transition editors open
inside the window; the transport counts and sheds without overflowing at
thirteen widths from 480 to 1440; add, remove, duplicate, reorder.

**Not seen at all — the browser preview has no audio engine and emits no beat
events, so none of this has ever run:**

- [ ] A trigger firing at all — bars, seconds, or manual
- [ ] The arming rule: a trigger that fires mid-bar must wait for the downbeat
- [ ] A step's configuration actually reaching the engine on handover
- [ ] `repeat` wrapping to step one, and a chain ending cleanly after the last
- [ ] `rest` silencing and restoring the volume
- [ ] Skip landing on the next downbeat rather than immediately
- [ ] Two adjacent steps with different meters — the case U9.3 exists for

**What "automated ✓" covers.** `test/i18n.coverage.test.ts` fails if any
English key has no reference in `src/`, or any `t("…")` names a key that does
not exist. It is what caught `settings.hotkeys.{actions,descs}.tab-3`
surviving the Pocket Check removal, and 14 dead strings besides.
`test/i18n.locales.test.ts` holds all fifteen languages to the same key set
and the same placeholders. Between them, a feature cannot lose its strings
quietly.

**What "needs eyes" means.** Nothing in Phase B or C has been seen running.
The evidence is types, 2,528 unit tests, 229 cargo tests and a rule-by-rule
diff of the built CSS — all of which prove the code is consistent, and none
of which prove a layout looks right. A browser cannot boot this app (every
Tauri call fails) and stubbing the bridge hung the page, so the first step on
picking this up is `npm run tauri dev` and a pass down §3 with the app in
front of you.
