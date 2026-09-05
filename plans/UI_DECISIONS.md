# UI revamp — decision log

> **Status:** Active. The decisions behind the app redesign, so no later
> session re-litigates them. Execution lives in `UI_REVAMP.md`.
> **Written:** 2026-09-04.
> **Reference:** the design canvas —
> https://claude.ai/code/artifact/35ee5455-0403-4b5c-ab32-fe99703729a5
> Artboards are cited by name below (`Main`, `Drill`, `CoachCentre`, …).
> **Audience:** the owner and the coding agents implementing the revamp.
> **How to use:** an entry marked *decided* is closed — implement it, do not
> re-open it in a PR description. An entry marked *first release* is decided
> for what ships next and deliberately silent about later cases. An entry
> marked *open* still needs an answer, and the phase that needs it is named.

Status key: **decided** · **first release** · **open** · **deferred**

---

## 0. The direction

- **U0.1 — Direction A, "Workspace".** *decided 2026-09-04.* A persistent
  left rail carrying modes and the library, a docked transport, and panels
  that dock at the window edges. Chosen over B (top bar with floating
  overlays) and C (no chrome, summon everything), both drawn at equal
  fidelity on the canvas's *Directions* page.
  **Why:** it is the only one of the three where a library has a permanent
  home. Learning paths, an exercise library and routines all need one, and
  in B and C each would eventually grow another tab strip or have nowhere
  to live. The owner's framing: a musician's work area — tools on the left,
  the work in the middle — and the easiest of the three to extend.
  **Cost accepted:** the rail spends 252px of width on every screen at all
  times, and it is the largest of the three to build.

---

## 1. The shell

- **U1.1 — One rail carries modes *and* the library.** *decided.* The tab
  strip and the sliding preset drawer become one 252px column: modes at the
  top, the contextual library beneath them, coach / Zen / Settings pinned at
  the bottom. See `Main`, `Shell`.
  **Why:** vertical space scales to more modes; the app window is wide and
  under-used; and it answers ROADMAP §12 Q4 (exercise library UX) without a
  fifth tab.

- **U1.2 — The transport is docked, never floating.** *decided.* An 88px bar
  along the bottom of the content region carrying Play/Stop, the bar count,
  elapsed time and the input status. Identical on every screen.
  **Why:** today's floating Play button overlaps content — on the Drill tab
  it covers the bottom rows of the grid.

- **U1.3 — The stage is anchored to the rail, not centred.** *decided.* The
  tempo readout sits at a fixed offset from the rail's right edge. Opening a
  panel, or resizing, never moves it.
  **Why:** today the whole metronome column slides sideways when the coach
  opens. The number you are staring at while playing must not move.

- **U1.4 — Seven unlabelled icons become three labelled chips plus an
  overflow.** *decided.* Sound, volume and audio input stay in the context
  bar with visible labels; widget and share move into the overflow menu;
  Zen and Settings move to the rail.

- **U1.5 — Settings is a sheet over the window, not a fourth mode.**
  *decided.* Opened from the rail, dismissed with Esc, returns you exactly
  where you were.
  **Why:** settings is not a place you practise; it should not compete with
  the modes for a slot, and `prevTab` bookkeeping disappears with it.

- **U1.6 — The coach dock is shell geometry, not coach content.** *decided.*
  Phase B builds the 380px dock, its open/close, and its promotion to the
  centre. Today's `CoachCard` renders inside it unchanged.
  **Why:** the dock's geometry is what every later coach feature depends on.
  Building the tutor into today's narrow rail means building it twice.

- **U1.7 — Pocket Check is removed.** *decided 2026-09-04, owner.* The
  `track` mode, `src/containers/pocket-check/`, its routing, hotkeys, MIDI
  action, locale keys and tests all go. This is the one explicit exception
  to the parity rule (U8.1).

- **U1.8 — Paths is not shown until it exists.** *decided.* The mockups show
  a third rail item with a "SOON" badge so the slot is visible while
  designing. It does not ship. The rail is built to grow; the item appears
  when the mode does.
  **Why:** a promise with no date, shown to musicians, is a cost with no
  benefit.

---

## 2. Metronome screen — `Main`, `MetronomePlaying`

- **U2.1 — The BPM slider becomes a tempo ruler.** *decided.* Ticks every
  5 BPM, majors every 20, the Italian markings laid out at their real
  positions from `TEMPO_MARKINGS`, the current band highlighted.
  Narrow bands (Andantino, Allegretto, Vivace) are not labelled — there is
  not room, and the marking beside the number already names the current one.

- **U2.2 — Subdivisions get drawn rhythms and names.** *decided.* Six tiles
  showing real beamed groups with tuplet numerals, each labelled (Quarter,
  Eighth, Triplet, Sixteenth, Quintuplet, Sextuplet).
  **Why:** today's six glyphs are near-identical at a glance and need a
  tooltip to tell apart.

- **U2.3 — Meter and accent are separate controls.** *decided.* Meter
  becomes a chip with a picker (the `METER_PRESETS` list plus FREE); accent
  becomes its own three-state control (group starts / every beat / none).
  **Why:** today's meter row mixes two concepts — the retired `Never` /
  `Always` accent options (`timeSignature` 0/1) still render beside the time
  signatures.

- **U2.4 — Beat dots are the primary object while playing.** *decided.*
  34px at rest, 46px playing, subdivision ticks retained, grouped with a gap
  between beat groups.
  **Why:** it is the one thing read from two metres away with an instrument
  in your hands.

- **U2.5 — The drift meter returns to this screen, deliberately.** *decided.*
  A timing band showing bias, spread and hit rate in plain words, visible
  only while playing.
  **Why:** `DriftMeter` was pulled from the metronome screen after #40 made
  it paint for the first time — it had been rendering at `opacity: 0` since
  it was written, so nobody had ever actually decided it belonged. This is
  that decision, taken on purpose. It is not a revert of #40.

- **U2.6 — "Last session" on the metronome screen.** *open (Phase C1).*
  Drawn on `Main`. It may belong only inside the coach. Decide when C1
  starts; costs nothing either way.

---

## 3. Drill screen — `Drill`

- **U3.1 — The plan is an editable sentence, not a form.** *decided.*
  `80 → 120 · +5 BPM · every 12 bars`, with a second line for
  `4 beats per bar · quarter notes · wood click`. Each token opens a
  two-row popover. The eight stepper rows leave the main view; no setting
  is hidden.

- **U3.2 — The grid becomes the climb.** *decided.* One column per tempo
  step, one cell per bar, rising left to right so the picture's shape is the
  exercise's shape. Promoted from below the fold to the screen's main object.

- **U3.3 — The last run is drawn under tonight's plan.** *decided.* Filled
  cells show how far you got last time, so the wall is on screen before you
  start. This is also the raw material for exercise ceilings later.

- **U3.4 — Adaptive carries a badge saying it listens.** *decided.* It is
  the one mode whose behaviour depends on the audio input being on.

- **U3.5 — What the climb shows mid-run.** *open (Phase C2).* Either the
  plan filling in, or the achieved path drawn over the plan when adaptive
  diverges from it. The second is more honest and more work.

---

## 4. The coach — `CoachOptions`, `CoachCentre`

- **U4.1 — One panel at two sizes, with a rule.** *decided. Answers
  ROADMAP §12 Q5 ("coach card, or a dedicated chat view").* It docks at the
  right edge while the click is running and takes the centre the moment you
  stop, with the metronome collapsing to a live strip along the top. One
  button, one keystroke and one MIDI action move it either way.
  **Why:** you have a question exactly when you stop playing, and nothing to
  watch at that moment. Docking preserves the beat dots during a take;
  centring gives an answer room for evidence.

- **U4.2 — Evidence sits next to the sentence.** *decided.* When the coach
  makes a claim about your playing, the deterministic data behind it renders
  in the same message.
  **Why:** "deterministic decides, model narrates" only reads as trustworthy
  if the numbers are visible. The card on `CoachCentre` uses per-beat-position
  bias, which is computable today.

- **U4.3 — The coach never acts on its own.** *decided.* Any change it
  proposes is a button you press or a footswitch you tap.

- **U4.4 — Everything inside the panel is out of scope for this revamp.**
  *deferred.* The evidence cards, chips, conversation layout and history view
  are coach work, not shell work. Today's `CoachCard` ships inside the new
  dock unchanged.

---

## 5. Themes and tokens

- **U5.1 — The token contract grows.** *decided.* The design uses more
  levels than `themes.ts` exposes. Additions (names provisional, settle in
  Phase A2):
  `--accent-2`, `--accent-2-subtle`, `--accent-2-text`,
  `--text-tertiary`, `--text-faint`, `--bg-panel`, `--bg-raised`.
  Existing variables are **added to, never renamed** — a rename touches all
  ten themes and every stylesheet.

- **U5.2 — The coach gets its own accent.** *decided.* `--accent-2` exists
  so the coach reads as a different kind of thing from the metronome. With
  only `--accent`, the coach borrows the app's colour — and in a violet
  theme it disappears into it entirely.

- **U5.3 — Three new themes exist; the fate of the ten is open.**
  *open (Phase C5).* Ash (cold graphite, acid lime, 4px corners, Archivo),
  Ember (warm brown-black, burnt orange, 16px corners, Outfit) and
  Manuscript (warm paper, ink indigo, serif) are drawn on the canvas.
  Whether they replace the shipped ten, join them, or the ten are re-cut on
  the new token set is undecided. Note the site currently sells "Ten themes".

- **U5.4 — Numerals are a fixed display face; the UI font follows the
  theme.** *first release.* Bricolage Grotesque for tempo numerals in every
  theme; `--font-family` continues to drive everything else.

---

## 6. Zen — no artboard, follows the established vocabulary

- **U6.1 — Zen is a restyle, not a redesign.** *decided.* It is already what
  the rest of the redesign argues toward: nothing on screen but the beat.

- **U6.2 — Three rungs of one ladder, not two modes.** *decided.* Normal →
  playing (chrome dims, dots grow) → Zen (chrome gone, visuals on). Same
  screen, three levels of undress.

- **U6.3 — Zen and Drill share one climb component.** *decided.* Zen renders
  its own ramp grid today (`fs-ramp-grid`). After C2 there is one component,
  used by both.
  **Why:** two implementations of the same object drift apart, and already
  have.

- **U6.4 — One tempo-control vocabulary.** *decided.* Zen's
  `−5 −1 +1 +5` cluster and the transport's `− +` plus tap are two
  vocabularies for one job. They converge on the transport's.

---

## 7. Settings — no artboard, follows the established vocabulary

- **U7.1 — Restyle only, and the coach section's content is untouched.**
  *decided.* Eight sections across ~3,900 lines, of which
  `CoachSettingsSection` is 758 (tiers, model download, voice). The revamp
  restyles the shell of settings and leaves what each section contains
  exactly as it is.

---

## 8. Scope

- **U8.1 — Parity is a hard requirement.** *decided 2026-09-04, owner.*
  Every feature Yames has today exists after the revamp. Not a goal — a
  merge condition, checked mechanically (see `UI_REVAMP.md` §2).

- **U8.2 — The exclusion list is exactly one item.** *decided.* Pocket Check
  (U1.7). Anything else missing after the revamp is a bug.

- **U8.3 — Learning paths are not built.** *decided.* The `PathMode`
  artboard exists to prove the shell absorbs the pivot without new tabs. It
  is a test of the frames, not a specification to implement.

---

## 9. What this implies elsewhere (not yet applied)

Recorded here rather than edited into the owner's documents.

- **`ROADMAP.md` §12 Q4** (exercise library: presets or a separate tab) —
  answered by U1.1: the rail carries the library, no fifth tab.
- **`ROADMAP.md` §12 Q5** (tutor surface) — answered by U4.1.
- **`ROADMAP.md` §2** — the "Tabs" row of the current-state table changes
  when U1.7 lands.
- **`LEARNING_PATHS_DECISIONS.md`** — A5, C6, D1, D2, D3 and D4 are all
  *informed* by the canvas but are **not** decided here. That document is
  the owner's to work through; this revamp does not depend on it and must
  not pre-empt it.
