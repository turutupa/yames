# Learning paths — decision log

> **Status:** Working document, not the roadmap. Started 2026-09-03.
> **Purpose:** every open question for the learning-paths pivot lives here
> so nothing gets lost across long discussions. One entry per decision.
> When a decision is made, its status flips and the outcome is written
> inline with the date. When every entry in a group is decided, that
> group is ready to be written into `ROADMAP.md`.
> **How to work it:** top to bottom. Groups are in dependency order and
> entries inside a group are too. Each open entry carries a proposed
> default so the common case is one exchange. Anything we choose not to
> decide yet is marked *deferred* with the reason, never left blank.

Status key: **decided** · **open** · **deferred**

---

## 0. Decided so far (2026-09-03)

- **D0.1 Center of gravity is learning paths.** An exercise with a known
  score (notes, rhythm, accents) is what lets the app score precisely.
  Free play can only measure timing against the click and against
  itself; a known target removes that ceiling.
- **D0.2 Free play stays a timing coach** and gains a deterministic
  insight layer (see E3). Everything it computes also serves path mode.
- **D0.3 Exercise content is never written by the model.** Exercises come
  from curated packs or the deterministic generator. The model picks the
  next step, explains, and narrates progress.
- **D0.4 Hand-authored exercise packs ship before the generator.**
  Quality and speed; the generator later produces variations.
- **D0.5 Theory lives inside exercises**, as a short human-written "why"
  plus a fretboard view driven by deterministic data. No open-ended
  theory tutor is promised.
- **D0.6 Polyphonic pitch (ONNX basic-pitch) moves to the stretch phase.**
  Shred and blues material is mostly monophonic; YIN-class tracking is
  enough for the first releases.
- **D0.7 Presets gain an optional score.** A preset with a score is an
  exercise; it works with or without the coach. Free-play presets keep
  working unchanged. Paths are ordered lists of exercises on top.
- **D0.8 Color-coded timing on the exercise's own tab ships in the first
  path release.** It needs no pitch detection: expected note, matched
  onset, deviation → color. Rendering the notes the player *actually*
  played waits for pitch (C2).
- **D0.9 "Sound emotional" is not measured or claimed.** Bend pitch
  accuracy, vibrato rate/width, timing and dynamics are.

---

## A. Product scope

- **A1 — Launch paths.** *open.* Which goals exist on day one and how
  many exercises each needs to feel real.
  Proposed default: two paths, "Shred mechanics" and "Blues feel",
  10–12 exercises each, guitar only.
- **A2 — What a path is.** *open.* Linear list vs skill graph; what
  moves you forward (tempo ceiling reached, score threshold, review
  due, or a combination).
  Proposed default: linear list per path with prerequisite links
  between paths later; progression = comfortable-BPM ceiling on the
  exercise reaches the step's target, plus spaced-repetition reviews.
- **A3 — Instruments in scope for paths.** *open.*
  Proposed default: electric guitar first; acoustic and bass reuse the
  same exercise format with their own packs later. Drums/piano stay
  free-play only for now.
- **A4 — Goal selection.** *open.* How the user states the goal ("I want
  to be a shredder") and whether the app recommends a path from history.
  Proposed default: a path picker with a one-line description each;
  recommendation from history is a later coach feature.
- **A5 — Free play vs path mode as modes.** *open.* Is path mode a
  separate tab, or does loading an exercise preset just switch the
  metronome view into exercise mode?
  Proposed default: no new tab. Loading an exercise puts the tab strip
  on the metronome view; the Drill tab runs path steps.

## B. Data model

- **B1 — Exercise format.** *open.* Fields per note (string, fret,
  finger, midi, beat position, duration, accent, technique tag such as
  bend/vibrato/hammer/pull/slide/palm-mute), rhythm incl. rests, loop
  length, tuning, position, tempo range, "why" text, author, version.
- **B2 — Where exercises live.** *open.* Bundled JSON in the app vs
  user-importable files; how packs are versioned and updated.
  Proposed default: bundled JSON packs, importable later, one schema
  version field from day one.
- **B3 — Preset / exercise merge.** *open.* Migration of existing user
  presets, how the sidebar shows exercises vs plain presets, naming.
- **B4 — Progress storage.** *open.* What the SQLite store (roadmap 1.1)
  must hold for paths: attempts per exercise, per-note results,
  ceilings, review schedule, path position.
- **B5 — Path format.** *open.* Steps, targets per step, prerequisites,
  and whether a path can be edited by the user.

## C. Evaluation

- **C1 — Rhythm scoring against a known score.** *open.* The matcher
  runs against the exercise's expected-onset schedule instead of the
  inferred grid (roadmap 2.4). What changes when the target is known:
  a missing onset is a miss not a rest, extra onsets are extra notes,
  and accents are checked against the score.
- **C2 — Pitch scope.** *open.* Monophonic tracker, run after a
  segment ends, opt-in with a visible indicator. Which techniques are
  measured first: note identity, bend target accuracy, vibrato
  rate/width, hammer/pull legato credit.
  Proposed default: note identity and bend accuracy first.
- **C3 — Dynamics and accents.** *open.* Amplitude-based accent
  detection, tolerance, and how it is scored (component or flag).
- **C4 — Alignment rule.** *open.* How played onsets map to expected
  notes when the player drops or adds notes, handling of the count-in,
  and looping (the exercise repeats, the score must not).
  Proposed default: sequence alignment (Needleman–Wunsch style) per
  loop with a count-in of one bar ignored.
- **C5 — Pass criteria.** *open.* What "passed this tempo step" means
  (e.g. score ≥ 85 for ≥ 8 bars with no missed notes) and what resets
  a ceiling.
- **C6 — Trust view.** *open.* The colored tab after play (D0.8):
  color scale, what a tap on a note shows, and the eyes-free spoken
  summary of the same information.

## D. UX (a design pass on paper precedes engine work)

- **D1 — Tab view.** *open.* Songsterr-style scrolling vs a static
  strip that highlights; cursor sync with the beat; what happens at
  loop boundaries.
- **D2 — During play.** *open.* What is on screen while playing an
  exercise, and the eyes-free variant (exercise name, position and
  tempo spoken; next/previous on a footswitch).
- **D3 — After play.** *open.* The review card: colored notes, score,
  what the coach says, and playback. Playback options: MIDI rendering
  of expected notes with the click, later MIDI of detected notes (needs
  C2), later the opt-in audio ring buffer from the roadmap's stretch
  phase.
- **D4 — Path screens.** *open.* Path picker, progress view, "due
  today", and how a step is started with one action.
- **D5 — Hands-free actions.** *open.* New MIDI/hotkey actions for path
  mode (next/previous exercise, repeat, mark done, ask what next).

## E. The coach in path mode

- **E1 — Boundary speech.** *open.* What the coach says when an exercise
  segment ends and which facts the model receives (score, per-note
  results summary, ceiling movement). Deterministic first, model
  rephrase second, as today.
- **E2 — Path guidance.** *open.* Deterministic next-step rule vs model
  suggestion; either way the user confirms before anything loads.
- **E3 — Free-play insight layer.** *open.* The deterministic
  diagnostics list: per-beat-position bias, per-subdivision hit rate,
  tempo band where consistency collapses, drift within a segment,
  accent placement. Stored, queryable, narrated.
- **E4 — Chat scope.** *open.* Grounded questions about the player's
  own results and about the loaded exercise's "why". Tool-grounded
  chat narrows to session, history, insight and exercise tools.

## F. Engineering and gates

- **F1 — Fixture strategy.** *open.* Synthetic fixtures per exercise
  (perfect, dropped note, extra note, late accents) plus at least one
  captured real recording per pack.
- **F2 — Latency.** *open.* Merge T04b and T06b; measure the model on an
  integrated GPU before any model-dependent path feature is promised.
- **F3 — Coaching quality gate.** *open.* A fixed transcript set
  reviewed for grounding, variety and tone, alongside tool selection.
- **F4 — Roadmap rewrite.** *open.* Which items of Phases 1–3 survive,
  in what order, once groups A–E are decided.
