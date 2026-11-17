# The practice view: neck + runway (decided 2026-11-16, behind a switch)

Read `CLAUDE.md`, `plans/tasks/mvp/PLAN.md`, `plans/tasks/revamp-3d/BRIEF.md`, then this.

## Why

The owner compared Gibson's app (a flat horizontal note highway: six string lanes, fret numbers
on a timeline; `review-fretboard/gibson.png`) with our realistic 3D neck during a Take
(`review-fretboard/yames-take.png`). A review panel (an intermediate guitarist, a product designer,
a graphics engineer) agreed: **hybrid**. The realistic neck wins on WHERE (shapes, chord tones,
position); a flat lane wins on WHEN and WHAT NEXT, which is what a player reads mid-phrase. Today
the "what next" is a small alphaTab strip, so the eye jumps between neck and tab.

## What to build (behind a switch; the current view stays the default)

**During a mechanics Take, "neck + runway":**
- **Neck, about 45% of the height:** the same 3D neck, but straight-on: slight tilt, six strings evenly spaced, high e on TOP (as in tab), zoomed on the active frets, with the whole-neck strip kept. The note just judged flashes green/blue/red as today. The next one or two notes show as faint ghost markers. Keep the stage on-demand: no continuous 3D animation. If you add an approach ring that closes on the beat, it must not make the 3D stage render every frame; put it in the DOM lane instead.
- **Runway, about 22%, directly under the neck:** six lanes in the same string order and colours. Fret-number circles for the next two bars scroll right to left into a fixed hit line on the left. Each judged note keeps an early/late dot at its place for the rest of the bar (the guitarist: "per-note timing that stays visible for the bar"). It replaces the alphaTab panel during a Take; standard tab stays one toggle away.
- **Hierarchy:** during a Take, the big live stats (% heard, bars, BPM) shrink to one compact row; the result screen keeps the big numbers.
- **Theory exercises:** the runway collapses and the neck takes the room (WHERE matters more).
- **Phone or portrait layouts:** the runway with a small neck window above it, with no perspective neck. Flip the runway's time axis to vertical if that reads better.

## How (from the engineer's review; read the code to confirm)

- **The runway is DOM/SVG moved by one CSS `translate3d` per frame through a ref.** No React re-render per frame, no Canvas2D repaint, no WebGL. Build the strip once per Take, or per bar if long. Scroll at 60 fps (the 30 fps cap is for the WebGL stage).
- **Position from the engine:**
  - `BeatEvent.songTick` reaches `useSessionRun` as `beat`; it already feeds `useLiveNoteLights` with `songTick/960`.
  - Smooth between reports with `src/songs/cursor.ts` (`onReport`, `cursorTickAt`, `leadFromFrame`) and the rAF loop pattern in `src/containers/songs/TabStage.tsx` (around lines 855–898). That code re-anchors on each report, never runs backwards, and snaps on seeks.
  - Pre-roll the lane during the count-in from the count-in beats and the BPM, so notes are already arriving at bar 1.
  - Add a small visual offset setting (±30 ms) only if needed.
- **Notes:** `take.schedule` gives each onset's `beat` and `noteIds`; map them to string and fret through `take.score.notes`. Live verdicts (`onScoreOnset`: `{id, pass, state, deviationMs}`) colour the marker by `(id, pass)` with a data attribute.
- **During a Take with the runway**, the neck stays on-demand (it moves only on judged notes and ghost changes).
- **WebKitGTK:** if compositing is off (transforms become CPU repaints), detect it and drop the lane to 30 fps with a smaller layer.

## The switch, for an A/B with testers

- A "Neck / Runway" toggle on the Take screen (and its saved setting `practiceView`, default `"neck"`). Testers flip it themselves; record the view on each Take row (`facts` already exists on `PathTakeRow`) so results can be compared.
- The designer's test, for the owner to run with 5 testers. Each plays an unseen 8-bar Exercise at 70 BPM in both views, in alternating order. Compare:
  - wrong-position notes in bar 1
  - timing spread and % heard in bars 2–8
  - a 1-second "which string and fret is next?" glance test
  - which view they'd open tomorrow
- **Ship the runway as default** if timing improves and position errors don't rise.

## Gates and rules

As in PLAN.md:
- `tsc`, vitest, `build`, the layout suite for the session screens. Add `?shot=` scenes for the runway (mechanics running, theory running, phone portrait), reaching `__SHOT_READY__`.
- A layout test that the lane moves while a Take runs and stops after.
- A CPU measurement during a running Take: runway vs current, with Chromium on the GPU (`--use-gl=angle --use-angle=gl-egl --enable-gpu --ignore-gpu-blocklist`). The orchestrator's script is `~/projects/.preview/perf.mjs`.
- No logic changes in `src/session/**`.
- Strings in all 15 locales, translated.
