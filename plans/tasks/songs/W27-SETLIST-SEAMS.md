# W27 — The seam between two setlist steps: no stub bar, no lost bar

Branch `songs-w27-setlist-seams`, from `songs-v1` as it stands (it must
contain `merge(songs-w26-setlist-bars)`). Size M. W26 fixed "after 8 bars
moved on after 8 beats" and, doing it, found four more things it was not
allowed to touch. Read W26's commit body first
(`git log songs-w26-setlist-bars -1 --format=%B`), then
`src/setlist/runtime.ts`, `useSetlistRunner.ts`, `applySetlistStep.ts`
and the seam test W26 added to `runtime.test.ts` (it documents the
stream the engine really emits). These bugs are on `main` too, since
v1.1.0. In priority order, one commit per item, stop cleanly at a boundary.

## 1. A step that changes the meter gets a one-beat stub bar (engine)

The runner lands a switch on a bar line and posts the new `beat_groups`.
The engine sees it on the **next buffer** and, at the **next tick**,
forces `measure_beat = 0; sub_count = 0` (`engine.rs`, the
`cached.beat_groups_changed` block just above
`let is_downbeat = sub_count == 0;`). That tick is one beat after the
bar line. So the seam bar is one beat long: the player hears two
accents a beat apart, and the new step loses a bar of real playing.
`applySetlistStep.ts`'s comment says the reset "is a no-op there". It
is not, and cannot be: the config leaves the UI only after the landing
tick has already sounded.

Fix it in the engine, where the one answer to "where is the bar" lives:

- A `beat_groups` change that arrives **while playing** is held and
  applied at the next bar line (`measure_beat` wrapping to 0 on a whole
  beat), not at the next tick. The old bar finishes at its old length.
  For the setlist that means: the switch is posted at bar line N (as
  today), the bar that starts at N is still the OLD meter, and the new
  meter starts at N+1 — so the runner must post the change **one bar
  early**, i.e. when it arms, not when it lands. Work out which side
  moves: either the runner sends the next step's meter at arm time and
  everything else at landing, or the engine gains "apply at next bar
  line" semantics and the runner's landing moves with it. Pick the one
  that leaves ONE place deciding where a bar starts, say why, and make
  W26's seam test assert the real thing: last bar of the 4/4 step is
  four beats, first bar of the 7/8 step is seven, no stub, the new step
  plays all its bars.
- A change while **stopped**, and a change made by hand in the
  metronome view while playing, must behave as they do today unless
  you can show today's behaviour is also wrong (a musician changing
  4/4 to 3/4 mid-bar by hand: restarting the bar at once is arguably
  what they expect — do not change it without saying so in the report).
  The deferral is for the setlist's posted change; give it its own
  flag or field rather than changing what `set_beat_groups` means for
  every caller.
- Jam's form restarts on a meter change (`form_restart` in the same
  block). It must restart at the same bar line the meter does.
- **The click is sacred.** No allocation, no lock held longer, nothing
  new on the callback beyond a compare and a copy into pre-reserved
  capacity. `alloc_probe` and the existing engine tests are the gate;
  add engine tests that drive ticks across a deferred change in 4/4→7/8,
  7/8→4/4, with sixteenths running, and with a change posted twice
  before the bar line (last one wins).
- Fix `applySetlistStep.ts`'s comment to say what is true.

## 2. A `countIn` transition costs the entered step a bar

`land()` enters the step with `anchored: true`, so the count-in's
transition tick (forced to `measureBeat 0`) counts as bar one and an
"8 bars" step after a count-in plays 7. `start()` already does it
right (`anchored: false`). W26's proposed one-liner: `land()` enters a
count-in step unanchored. Do it; rewrite the stale "treats countIn as a
cut for now (U9.5)" test to assert what is now true: the step's bar
one, and its seconds clock, begin after the count.

## 3. Five fixtures teach the wrong contract

`isDownbeat` from the engine is `subdivision === 0` — true on EVERY
whole beat. A bar line is `isDownbeat && measureBeat === 0`. These
build ticks the engine cannot produce and would let the bug class back:
`src/containers/jam/JamView.test.tsx:26`,
`src/containers/main-window/hooks/useJamSession.test.ts:159`,
`src/containers/onboarding/steps/HearItWorkStep.test.tsx:42`,
`src/containers/onboarding/OnboardingWizard.test.tsx:240`,
`src/containers/zen/FullscreenView.test.tsx:80` (also flattens 7/8's
inner group accents, so "an accent is not a bar line" is never tried).
Make one shared engine-shaped tick builder under `src/test/` (W26's
driver in `runtime.test.ts` is the model), use it in all five and in
W26's three files, and if any production code turns out to pass only
because its fixture lied, fix the code and say so.

## 4. The drill's beat dot uses `beat % beatsPerBar`

`src/containers/drill/DrillView.tsx:269`. `FloatingWidget.tsx` and
`FullscreenView.tsx` were both moved off that modulo to `measureBeat`,
because the engine restarts the bar on a grouping change and the modulo
then lights the wrong dot. Same fix, with a test that changes the
grouping mid-play.

## Rules and gates

The usual: `git checkout -B songs-w27-setlist-seams songs-v1` first
(worktrees start stale); `rustup override set
stable-x86_64-pc-windows-msvc`; `CARGO_TARGET_DIR=C:\yt-w27`;
`--no-default-features`; Rust tests only via `node
scripts/rust-test.mjs`; copy `node_modules` from
`C:\Users\alber\Dev\yames-songs\node_modules` **with robocopy run from
PowerShell, not from Bash** (from Bash `/E` is mangled into a path,
nothing is copied, exit 0, and the build then dies on
`@coderline/alphatab`); never push, never merge, never start the app;
explicit `git add` paths; commits end with
`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

Gates: `npm run build`, `npm run test`, `npm run test:rust`,
`npm run test:dsp`, `npm run test:highbpm`, `npm run test:layout`
(`--workers=3`; the machine is loaded, re-run a failure alone before
believing it). Stay out of `src/songs/camera/**`,
`src/containers/songs/**` and `take_video.rs` (W25 is in them).

Report: which side moved in item 1 and why; what a hand-made meter
change does now; every gate's number; a release-note sentence a
musician would understand for items 1 and 2; anything a fixture had
been hiding.
