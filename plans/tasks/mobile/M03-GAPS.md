# M03-GAPS — what breaks at phone widths

> Produced by M03a (`mob/m03a-css-mechanics`) on 2026-09-11, so the M03
> worker starts from a list rather than a guess. Every number here was
> measured, not estimated.

## How this was measured

`shots.html` + `src/shots/mockIpc.ts` — the repo's own screenshot harness — was
driven through each screen in a headless Chromium at 360×800, 390×844 and
430×932 with `Emulation.setDeviceMetricsOverride({ mobile: true })` and touch
emulation on. `matchMedia('(pointer: coarse)')` and `(hover: none)` both
report true in that browser, so the styling a phone gets is the styling that
was photographed and measured.

Screenshots are in `m03a/`, named `<screen>-<width>.png`, at 2× device scale.
For each screen the probe recorded every element whose box crosses the
viewport edge, and every interactive control whose **hit area** (its border
box widened by any transparent `::before` / `::after` this pass added) is
under 44×44.

Two caveats that matter when reading the pictures:

- **The desktop chrome is still there.** The titlebar, its three window
  buttons and the 68px icon rail are in every shot because M02 had not landed
  when these were taken. On a phone none of them ship (plan §3), so roughly
  68px of width and 38px of height come back. Where a row overflows by less
  than 68px, losing the rail may be the whole fix; the per-screen notes say
  which those are.
- **The mock backend's setters are no-ops.** `set_bpm` and friends return
  without changing state, so nothing can be made dirty. Two screens therefore
  could not be photographed and were surveyed by reading the CSS instead —
  they are marked as such.

## What M03a already changed

Read this first: some of what the pictures would have shown is already fixed,
and the rest of this document assumes it.

- **Every `:hover` rule is inside `@media (hover: hover)`** — 204 rules across
  21 stylesheets. A tapped control no longer keeps its hover state until the
  next tap lands elsewhere.
- **Safe-area tokens exist**: `--safe-top` / `--safe-right` / `--safe-bottom` /
  `--safe-left` on `:root` in `shell.css`, applied to the window's top
  padding, the content gutters, the transport, zen's absolutely positioned
  furniture, and the three centred dialogs. **They are all 0 until
  `index.html`'s viewport meta gains `viewport-fit=cover`** — a frontend
  change this task was not allowed to make. *M03 must add it, or none of the
  safe-area work does anything.*
- **Touch targets under `@media (pointer: coarse)`**: 59 kinds of control were
  under 44px; 18 remain, and the per-screen notes say which and why.
- **Two things stop being invisible on touch**, because hover was their only
  reveal: the beat-dot paging arrows (`opacity: 0` *and*
  `pointer-events: none`) and zen's top controls, control bar and exit hint.

---

## Ranked: the five that decide whether this feels like an app or a squeeze

### 1. The preset sidebar is a 252px drawer on a 360px screen — L

`presets-sidebar-360.png`. Expanding the library slides a 252px panel over 70%
of the screen with no scrim and no dismiss affordance; the beat view behind it
is squeezed into 108px and is still live. This is the one the plan already
names (§4 M03): on a phone it becomes a bottom sheet, and the rail's mode
buttons become whatever navigation replaces the rail.

Note the sheet has to carry two different lists: in Metronome mode the header
reads PRESETS, in Setlist mode it reads SETLISTS (`setlist-editor-360.png`).

### 2. The drill's climb chart is 650px of horizontal overflow — L

`drill-360.png`. `.drill-climb-track` runs 659px past a 360px viewport and
119 of its cells with it; what you see is a single vertical orange line where
a chart should be. It is not a narrow-window case of the desktop layout, it is
a layout that has no narrow form at all. The chart needs a phone shape —
fewer columns, a scroller, or a different representation of the same 16 steps.

The plan sentence above it survives contact with 360px and reads well; only
the chart is broken.

### 3. Settings rows are a two-column grid that never collapses — L

`settings-360.png`, `settings-scroll2/3/4-*.png`. Every row is *label +
description* on the left and a control on the right, and neither half gives
way: the description wraps to one word per line ("Local AI model for coaching"
becomes four lines) while the control is pushed 105–140px off the right edge.
Theme cards overflow by 137px, toggle groups by 110px.

At 360 this affects every section. The fix is a phone stacking rule — label
over control, full width — and it is the single largest CSS job in M03.

While you are there: the settings card is `max-width: 680px` centred inside a
region that is 292px wide once the rail takes its 68, so it is not the cap
that is hurting, it is the row.

### 4. The meter picker opens 286px wider than the screen — M

`beat-meter-menu-360.png`. Tapping the meter chip opens `.meter-picker`, whose
`.time-sig-row` runs 275px past the right edge — most of the time signatures
are simply unreachable. A popover anchored to a chip is a desktop shape; on a
phone this wants to be a sheet or a wrapping grid.

The same shape, `.sub-dropdown` from the sound chip, does fit
(`beat-sound-picker-*.png`) — so this is one panel, not the pattern.

### 5. The meter row runs 86–116px off the right edge — M

`beat-*.png`, and it is behind every screen that shows the beat view.
`.meter-head` holds the meter chip, the beat stepper and "4 clicks/bar"
(`.beat-clicks`) on one line, and the line is ~116px too long at 360 — the
stepper's "+" and the whole of "4 clicks/bar" are cut off. Dropping the rail
buys 68px of that, so this one may come most of the way back for free; the
rest is a wrap or a second line.

---

## Screen by screen

Sizes given as `hit area`, which includes the transparent overlays this pass
added. "S / M / L" is the size of the M03 job, as in ROADMAP.md.

### Beat view — `beat-{360,390,430}.png`

| | |
|---|---|
| Overflow | 116px @360, 86px @390, 46px @430 — all of it `.meter-head` |
| Renders | Yes |

- **Meter row overflows** (ranked #5 above). `.meter-head` → `.beat-stepper-row`
  → `.beat-clicks`. **M**
- **The metronome figure, BPM readout, ±, TAP and the beat dots all fit** at
  360 and read well. No work. The BPM ruler (`.bpm-slider`) is now 44px tall
  on touch with the same 10px bar drawn centred in it.
- **Accent control** (`Group starts / Every beat / None`) is 44px tall now but
  its row still crosses the edge by 2–6px at 360. Borderline; the rail's 68px
  covers it. **S**
- **Subdivision row**: six buttons at `flex: 1` come out 29px wide at 360
  (54px tall). Six × 44 + gaps needs 294px and the content box is 244px with
  the rail present, 312 without — so **this fixes itself when the rail goes**,
  and M03 should re-measure rather than force a min-width. **S**
- **Group editor / meter presets**: reached through the meter chip — see the
  meter picker below. 
- **Sound picker** (`beat-sound-picker-*.png`): the dropdown fits at all three
  widths and its items are 44px tall. No work.
- **Still under 44**: `.context-chip` 34×44 and `.context-chip-range` 36×44 —
  both heights are fine and both widths are set by the context bar's own
  narrow-width rules (`@media (max-width: 619px)` pins the fader to 36px).
  A context bar redesign fixes both. **M**

### Beat view — meter picker — `beat-meter-menu-{360,390,430}.png`

| | |
|---|---|
| Overflow | 286px @360, 256px @390, 216px @430 |
| Renders | Yes |

Ranked #4 above. `.meter-picker` and its `.time-sig-row`. **M**

### Drill view — `drill-{360,390,430}.png`

| | |
|---|---|
| Overflow | 659px @360, 644px @390, 624px @430 |
| Renders | Yes |

- **The climb chart** (ranked #2). **L**
- **The plan line** — "60 → 135 / +5 BPM / every 8 bars" — wraps to three
  lines and reads correctly at 360. Its nouns are buttons and they are 44px
  tall now. No work.
- **The plan's detail line** ("4 beats per bar · Quarter · Drum sound ·
  Options") is 22px tall and can only reach 28px of hit area, because the line
  below it is 10px away. Reaching 44 means more line-height. **S**
- **Runs**: the mock has no drill runs, so the runs list showed its empty
  state. Survey it again in M03 with runs present.
- `.drill-climb-cell` is 7×27 — a chart cell rather than a control; it is only
  in the list because it is a `<button>`. Whatever shape the chart takes will
  decide its size.

### Setlist view, empty — `setlist-{360,390,430}.png`

| | |
|---|---|
| Overflow | none at any width |
| Renders | Yes |

The best-behaved screen in the app. "No setlist open", the explanation and
"New setlist" all fit and centre well at 360. No work.

### Setlist editor — `setlist-editor-{360,390,430}.png`

| | |
|---|---|
| Overflow | 27px @360 (`.transport-input-narrow`), none at 390/430 |
| Renders | Yes — open a setlist from the library; "New setlist" opens an inline rename instead |

- **The step sentence stops being a sentence.** At 360 "70 BPM / 4/4 / quarter
  / for 8 bars / then cut / · / wood / · / volume 70%" breaks to one or two
  words a line and reads as a stack of fragments. It is the screen's whole
  idea, so this is worth real attention: a narrower phrasing, or a deliberate
  two-column form. **M**
- **The transport's right-hand controls** are cut at 360 by 27px. **S**
- **The step tools** (up, down, duplicate, delete) are four 25×23 icons 2px
  apart. Their hit areas now reach 27×45, and 27 is all the width there is
  until they are spaced out. **S**
- **The folded step name** is a dotted-underline button in a sentence with its
  own line 6px below; hit area 28×28, and it needs line-height to do better. **S**
- **The count-in and repeat steppers** are the smallest controls in the app at
  13×17 and carry no class of their own. M03a reaches them through
  `.setlist-stepper-field button` and takes them to 45×39; the last 5px of
  height is the 22px gap between the two stepper rows at 360. **S**
- **Save bar**: the editor's save affordance is `.preset-text-btn--save`
  ("No changes" / "Save"), 44px tall now. Fits.

### Settings — `settings-{360,390,430}.png`, `settings-scroll{2,3,4}-*.png`

| | |
|---|---|
| Overflow | 140px @360, 110px @390, 105px @430 |
| Renders | Yes; four scroll positions captured, covering General, Appearance, Sound, Devices, Practice Coach and About |

- **The two-column row** (ranked #3). **L**
- **Sections that do not ship on a phone** and were deliberately left alone by
  the touch pass: MIDI (`.midi-dropdown-trigger` 124×30, `.midi-refresh-btn`
  64×28), the input test (`.input-test-btn` 64×29), hotkeys (16 ×
  `.hotkey-bind-btn` at 30px tall, `.hotkey-defaults-btn` 119×27) and the
  updater (`.update-check-btn` 119×23). M02 removes all of them; if any
  survives, it needs 44px. **S, conditional**
- **Language, themes, instrument, sound output, About** are the sections that
  do ship, and every control in them is 44px tall now. Their *rows* still
  overflow — same fix as #3.
- The settings timeline (the tick rail down the right edge) is drawn at the
  viewport's right edge and is partly cut at 360. Decide whether a phone wants
  it at all. **S**

### Preset sidebar — `presets-sidebar-{360,390,430}.png`

| | |
|---|---|
| Overflow | 48px @360 (the beat view behind it), none at 430 |
| Renders | Yes |

- **Becomes a bottom sheet** (ranked #1). **L**
- Its rows are 44px tall now; its two header icons (search, add) sit 2px apart
  and reach 28×44 — spacing them is part of the sheet design. **S**

### Zen / fullscreen — `zen-{360,390,430}.png`

| | |
|---|---|
| Overflow | `.fs-controls` by 4px each side @360; none at 390/430 |
| Renders | Yes |

- **The way out is now visible on touch** (M03a). The hint reads
  *"Double-click or press Esc to exit"* — **which is desktop language a phone
  user cannot act on.** A phone has no Esc and double-tap is the zoom gesture.
  M03 needs a locale string for touch and, preferably, a real exit button
  rather than a gesture. This is the highest-value copy change in the mobile
  port. **S for the string, M for the button**
- The 7-button control row touches both edges at 360 and is 4px over. The
  buttons are 40×40 with 44×44 hit areas; the row needs 4px, not a redesign. **S**
- Zen's canvas effects were not performance-tested here — that needs the real
  device (plan §6).

### Onboarding wizard — `onboarding-{welcome,step2,step3,step4}-{360,390,430}.png`

| | |
|---|---|
| Overflow | none in the wizard; the 3–9 overflowing elements are the beat view *behind* the overlay |
| Renders | Yes — Settings → "Run setup again" → Open |

This is the screen that survives 360px best. The card, its progress dots, the
sound grid, the theme rows and the Back / Skip / Next row all fit, and every
button is 44px tall now.

Two things to fix, neither of them layout:

- **"Hover a card to hear the click or see the theme."** There is no hover on
  a phone, so the instruction is wrong *and* the preview it describes cannot
  happen. A phone wants tap-to-preview and a different sentence. **S**
- M02 cuts the coach, audio-input, hear-it-work and hands-free steps, so the
  wizard M03 sees will be shorter than these four shots. Re-survey after M02.

### Unsaved-changes dialog — *not photographed*

The mock backend's setters are no-ops, so no preset or setlist can be made
dirty and the dialog cannot be reached. Surveyed by reading `shell.css`:

- `.unsaved-card` is `width: min(460px, calc(100vw - 48px))`, so it is 312px
  at 360 — **it fits**, with 24px each side.
- `.unsaved-actions` is a flex row of Cancel / Discard / Save with a spacer
  between the first and the other two. Three buttons of "Don't save" /
  "Cancel" / "Save" length in 260px of content box is tight and likely to wrap
  at 360 in the longer locales (German, Portuguese). **Verify with a real
  build; S if it wraps.**
- Its buttons are 44px tall under a coarse pointer (M03a).
- The overlay now pads itself clear of the safe-area insets.

### Instrument picker modal — *not photographed*

It only opens on first launch, and the harness's store has an instrument set.
Surveyed by reading `instrument-picker.css`:

- **`.instrument-picker-modal { min-width: 480px }` — a guaranteed 120px
  overflow at 360**, and 90px at 390. The modal is wider than the phone before
  anything inside it is considered. **M**
- `.instrument-picker-grid` is `repeat(3, 1fr)` with six instruments; at phone
  width that wants two columns.
- The overlay has no padding of its own beyond the safe-area insets M03a
  added, so the card would touch both edges even after the min-width goes.

Its grid is shared with the wizard's instrument step
(`InstrumentPickerGrid`, seen in `onboarding-step2-*.png`), which *does* fit —
so the fix is the modal's own box, not the grid.

---

## Controls still under 44px, and why

18 kinds, down from 59. None of them are an oversight.

**Cut on a phone (plan §1) — no rule was written for them:**
`.wc-btn` ×3 (46×37; the titlebar is 38px tall, so they could not reach 44
without changing desktop), `.hotkey-bind-btn`, `.hotkey-defaults-btn`,
`.input-test-btn`, `.midi-dropdown-trigger`, `.midi-refresh-btn`,
`.update-check-btn`.

**Width set by a container, not by the control — a layout fix, not a CSS one:**
`.context-chip` 34×44, `.context-chip-open` 34×44, `.context-chip-range`
36×44, `.sub-row-btn` 29×54, `.preset-sidebar-head-btn` 28×44,
`.setlist-step-tools button` 27×45, `.setlist-step-remove` 27×45.

**Blocked by the gap to the next row — reaching 44 would mean answering a tap
aimed at the line above:** `.drill-plan-detail-token` 28 tall,
`.setlist-folded-name` 28×28, `.setlist-stepper-field button` 45×39.

**Not really a control:** `.drill-climb-cell` 7×27 (a chart cell).

---

## Open questions for M03

1. **`viewport-fit=cover` in `index.html`.** Without it every safe-area token
   is 0 and the insets do nothing. Who adds it — M02 or M03?
2. **What replaces the rail?** Bottom tab bar, or a sheet? Everything in
   ranked #1 and half of #5 depends on the answer, and it is worth deciding
   before any CSS is written.
3. **Does the climb chart keep its shape on a phone?** A 16-step grid at 360px
   is either a horizontal scroller or a different picture. This is a design
   decision, not a breakpoint.
4. **Zen's exit.** A visible button, or a gesture with a hint that a phone user
   can act on? The current hint names Esc and a double-click.
5. **Does the settings timeline ship on a phone?** It is a hover-era scroll
   indicator down the right edge.
6. **Landscape is out for v1** (plan §1), so nothing here was measured in it.
   Worth confirming the lock lands before M03 finishes, or the two-column
   settings row will be re-litigated.
7. **Should `scripts/css-hover-audit.mjs` join the gate chain?** It exits
   non-zero on an unwrapped `:hover` rule and takes under a second. Adding it
   to `package.json` and CI would stop the 204 rules coming back one at a
   time, but that is a repo-wide decision and this task did not take it.
