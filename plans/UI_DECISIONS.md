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

- **U2.6 — "Last session" on the metronome screen.** *decided.* It stays on
  the stage rather than moving into the coach: it is the one line that answers
  "did I practise yesterday", which is a question you ask before opening
  anything. Built in C1 as `LastSession`, and it shows only the numbers a
  saved session actually recorded — the duration is dropped from the line
  entirely when no segment carried one, rather than estimated.

---

## 3. Drill screen — `Drill`

- **U3.1 — The plan is an editable sentence, not a form.** *decided.*
  `80 → 120 · +5 BPM · every 12 bars`, with a second line for
  `4 beats per bar · quarter notes · wood click · options`. Each token opens a
  two-row popover. The eight stepper rows leave the main view; no setting
  is hidden.

  *Built in two goes.* The first kept the rows in an "All settings"
  disclosure below the sentence and dimmed the ones you had not clicked —
  which is a form that is always on the stage, only sometimes greyed. The
  artboard draws a floating card hanging under the phrase instead, and that
  is what ships: `DrillConfigPopover`, one window per token, holding only
  that token's fields, closing on Escape or a click outside. The disclosure,
  its toggle and its eight rows are deleted. The window clears the whole plan
  block rather than the token that opened it, so the second line of tokens
  stays clickable while one is open.

- **U3.1b — What a mode does is on the button that does it.** *decided.* A
  line of prose under the plan explained the selected mode for the whole time
  the ramp was stopped — describing a choice already made, and taking a row of
  the stage from the climb. It is a hover on each of Linear / Zigzag /
  Adaptive now (`aria-describedby`, so it is not mouse-only), which also means
  the two modes you did NOT pick are readable before you pick them.

- **U3.1c — Every phrase in the plan opens something, and each opens its
  own.** *decided.* Three follow-ons from the owner reviewing U3.1:

  - The bar count and the beat count shared a window, so clicking "6 beats per
    bar" on the quiet line opened a card belonging to "every 12 bars" four
    inches away. They are separate phrases and they get separate windows.
  - The subdivision and the click were plain text in a line of clickable
    words, which reads as a bug rather than as a rule. Both are tokens now.
  - The subdivision was plain text *because* the engine pinned every ramp to
    quarter notes. That is lifted: `speedRamp.subdivision` is the drill's own,
    persisted with the rest of the plan. The exercise where a player most
    wants a subdivided pulse — climbing a passage one step at a time — was the
    one place they could not ask for one. The click stays global (the same
    setting the header chip changes): two doors to one switch, deliberately,
    because a drill playing a different sound from the metronome would be a
    second thing to keep in sync.

- **U3.7 — A drill may descend.** *decided.* A target below the start is a
  descending drill and is exactly as valid as an ascending one: "play it at
  120 and work down to 80 until it is clean" is a real exercise, and the app
  could not express it — `configure_speed_ramp` clamped the target to a floor
  of the start tempo, and the field carried the same floor, so the plan could
  not be typed. `advance_ramp` now thinks in OUT (toward the target) and BACK
  (toward the start) rather than up and down, and reads which is which off the
  plan; for an ascending drill every branch resolves to what it did before.
  The two tempo fields are uncoupled as a consequence — raising the start past
  the target no longer drags the target with it.

- **U3.2 — The grid becomes the climb.** *decided.* One column per tempo
  step, one cell per bar, rising left to right so the picture's shape is the
  exercise's shape. Promoted from below the fold to the screen's main object.

- **U3.3 — The last run is drawn under tonight's plan.** *built.* A band
  along the foot of every bar the last run played, a wall line where it
  stopped, and one sentence saying how far you got and when — so the wall is
  on screen before you press start. Still the raw material for exercise
  ceilings later.

  **What a run records.** A new `DrillRun` (`src-tauri/src/session.rs`,
  its own `drillRunHistory` store, capped at thirty like the session
  history) carries the plan that was running — start, target, increment,
  decrement, bars per step, beats per bar, subdivision, mode, cyclic — the
  position it stopped at, and `reach`: the bars actually played at each
  tempo it touched.

  *Not a field on `SavedSession`*, which is what it looks like it should
  be. A saved session cannot exist without a `SessionReport`, which cannot
  exist without the mic; most drills are played with the input off, and
  those are exactly the runs whose wall this has to draw. Hanging the
  underlay off `evalSessionHistory` would have left the picture blank for
  everyone who practises without evaluation on, and blank for a reason
  nothing on screen could explain. "Clear all sessions" clears both.

  *Bars per tempo, not just a step index*, because a step index is only
  meaningful against the ladder it was counted on and that ladder is not
  recoverable later: adaptive counts a step per decision including the ones
  that went down, and a cyclic ramp counts past the end of its own ladder.
  Tempo is the one coordinate that means the same thing in two runs.

  **Matching a run to a plan that has changed.** By tempo, never by column
  index. A column of tonight's climb stands at a tempo; what goes under it
  is what the past run played *at that tempo*. Tonight's 90→140 against last
  night's 80→120 therefore draws an underlay on 90–120 and nothing above,
  which is true — you have not played those. A run counts as the same
  *exercise* when `barsPerStep`, `beatsPerBar` and `subdivision` match,
  because those three are what one cell means; start, target, increment,
  mode and cyclic are the *route* and are deliberately ignored, or nudging a
  target from 120 to 125 would throw away every run you had ever done.

  **Which run, and when there is none.** The newest run that is comparable
  *and* shares a tempo it actually played — so "last run" means the last run
  of this exercise, not the last time you pressed start. When there is none,
  nothing is drawn: no swatch, no note, no empty underlay. An underlay of
  zeroes reads as "you got nowhere", which is a different claim from "there
  is no record of this".

  **The note beside the chart, half-built on purpose.** The artboard said
  "You got five bars into 110 before the timing came apart." The first half
  ships. The second does not: nothing records *why* a run ended, and a
  stopped run is a phone call as often as it is a wall. Pressing start and
  stopping again is not recorded at all — without one completed step there
  is no wall to draw, and the record would only crowd out the last real run.

- **U3.4 — Adaptive carries a badge saying it listens.** *decided.* It is
  the one mode whose behaviour depends on the audio input being on.

- **U3.5 — What the climb shows mid-run.** *decided.* The plan fills in:
  cells behind the playhead are filled, the rest outlined, and a playhead line
  stands at the current bar. Behind all of it, a wash covers the ground
  already swept — the playhead says where you are, and the filled cells answer
  that one column at a time, so without it a long plan looks much the same
  near the start as near the end.

  The blocker recorded here is gone: U3.3 built `DrillRun`, and a run now
  records the bars it played at every tempo it touched. The achieved path
  drawn *over* the plan is therefore buildable, and is deliberately not built
  — the last run is drawn UNDER tonight's plan instead (U3.3), and a second
  overlay on the same cells would be a fourth thing competing for them.

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

### U6.5 · Zen is always dark, on purpose — **decided**

`fullscreen.css:12` paints Zen with a literal `radial-gradient(#0d0d1a → #000)`
and `.fs-bpm` with a literal `rgba(255,255,255,0.95)`. Neither is a token, so
Zen is the same near-black screen under all thirteen themes. The accents are
themed — the dots and the play button follow `--accent` — so it reads as
"lights down, your colour on top", which is a defensible thing to want from a
mode called Zen.

Checked because it looked like a theming bug: under Ivory, whose
`--text-primary` is `#2c2416`, tokenised text on that background would have
been invisible. It is not tokenised, so nothing is unreadable today.

The owner's call is that it stays that way. Zen is the mode for turning the
room down, and the accents still carry the theme, so it reads as "lights out,
your colour on top" rather than as a theme that failed to apply. The jolt
leaving a light theme is the point of the mode, not a defect in it.

So the literals stay literals. What must not happen is a later pass
"tokenising Zen for consistency": under Ivory that would put `#2c2416` text on
`#0d0d1a` and make the tempo invisible. If Zen is ever tokenised, it needs its
own dark palette, not the active theme's.

### U3.6 · "Up and down" and "Count-in" — **decided**

Promoting these two settings to the drill transport briefly gave each of them
two names: the form said Countdown and Cyclic, the transport said Count-in and
Loop. One setting with two names on one screen is worse than either name, so
the transport now uses the form's keys and there is one vocabulary again.

Loop was also wrong on the facts. `advance_ramp` flips direction at the target
and again at the start, so a cyclic ramp climbs and descends without ever
finishing. Loop suggests the climb repeating from the bottom, which is a
different exercise.

Both are now changed, in fifteen languages, along with the description that
was carrying the meaning "Cyclic" failed to.

"Repeat" was considered and rejected. The chain's repeat starts again at step
one; `advance_ramp` turns round at the target and descends. Giving both the
same word would put two behaviours behind one label in an app that has both on
adjacent screens — the exact collision this entry was written to avoid. "Up
and down" describes the shape, which is the thing the drill is for.

The engine's flag stays `cyclic`. Only the word the musician reads changed.


### U9.1 · A chain is a list of copies, not a list of pointers — **decided**

A chain step holds a full configuration of its own. Referencing presets by id
would mean editing "Warmup" silently changes every chain that used it, and
deleting it breaks them; the owner's call was that a preset should be atomic,
because a pointer is a thing the user has to hold in their head and nothing on
the screen can show them.

The cost is real and accepted: a step that came from a preset does not track
that preset afterwards. The two are the same shape, so "save this step as a
preset" and "add this preset as a step" both stay one-line operations.

### U9.2 · Two axes per gap: when to move, and how to arrive — **decided**

The trigger answers *when* — when I say (button, hotkey or footswitch), after
N bars, after N seconds. The transition answers *how* — clean cut, count me
in, rest a bar. Keeping them separate is what lets a chain say "after two
minutes, with two bars of count-in", which is the thing a warm-up actually
wants and which a single trigger control cannot express.

### U9.3 · The bar you are in always finishes — **decided, and forced**

`engine.rs` resets `measure_beat` to 0 the instant `beat_groups` changes, so a
config swap lands as an immediate downbeat wherever it happens. For a bar-based
trigger that is free, because the switch already falls on a bar line. For a
time-based one or a pedal press it would cut the bar in half — in 7/8, halfway
through. So every switch defers to the next downbeat. Not an option, a rule.

### U9.4 · It is called a chain — **decided**

"Chain" is vague in isolation and precise where it lives: in a list headed
PRESETS, beside presets, "chain" says exactly what it is. Setlist and routine
are musician's words for something a musician would expect to hold songs or a
practice plan, and a chain here may hold neither.

### U9.5 · The count-in has to be unwelded from the ramp — **decided**

Closed, and built. `CountIn { beats, done }` lives on `AppState`, `arm_count_in`
is a registered command, the engine's `warming` reads the count rather than the
ramp, and `src/chain/runtime.ts` emits a `countIn` effect between steps. The
rest of this entry is the reasoning that got there, kept because it is the part
that was misread once.

Worth stating plainly, because it has already been misread once: this is about
where the code lives, not about what a musician hears. The count-in plays at
the *new* tempo with its own click, and that is the right cue — nothing here
proposes changing it. Unwelding does not alter a drill's count-in at all. It
only lets something other than a drill have one.

The engine already plays a count-in, with its own click and a clean handover
where the last warm-up beat becomes beat 0. It is gated on `ramp_warming_up`
and reads `speed_ramp.warmup_*`, so today only a drill can have one. U9.2's
"count me in" needs that machinery to belong to the engine rather than to the
ramp. Modest Rust work, and the audio side of it is already written.

### U9.6 · A chain ends, unless you say how many times to repeat it — **decided**

The default is that a routine finishes and stops. A metronome that will not
stop on its own is a metronome you have to go and switch off, and the point of
chaining is to stop watching it.

Repeat is a count, not a toggle. "Loop forever" and "three times through" are
the same control with different numbers, and the count is the one that can
express both — where a checkbox can only ever mean forever. It belongs to the
chain, not to a gap: repeating is what the whole routine does, and hanging it
off the last transition would read as a fifth step.

The drill's `cyclic` is deliberately NOT this. A cyclic ramp turns round at
the target and descends, which is a shape; a repeated chain starts again at
step one. Same word, two behaviours — worth keeping apart in the vocabulary
(see U3.6, which settled it: the drill says "Up and down").

### U9.7 · The transport counts the steps — **decided**

"Step 1 of 4" and "next in 5 bars", with a way to skip ahead. A chain hides
what a metronome normally shows plainly — what it is about to do — so the
transport has to say it, and the count is also how you know the routine is
progressing at all when two adjacent steps sound similar.


### U2.3 · The accent control is built — **decided**

Closed. It was drawn on the artboard from the start and stayed unbuilt because
two of its three states had nothing behind them: the engine accented where beat
groups opened and nowhere else, and the only way to hear a bar with no accents
was to give up the grouping by switching to FREE.

`AccentMode` is the engine's now — parsed once when the cached params refresh,
so the audio thread compares an integer rather than a string on every beat, per
the "click is sacred" rule. `groups` is the default and is what a meter means;
`all` and `none` deliberately override both of the cases that have their own
accent rules, FREE mode and a running ramp, because a player who asked for
every beat means every beat.

The one thing not offered is a per-beat accent editor — tapping individual dots
to move where the accents fall. That is a different feature and a bigger one;
the grouping already expresses it for every meter the app ships.
