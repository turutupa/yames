# M08-JAM-GAPS — what the band looks like on a phone, and what breaks

> Produced by M08 (`mob/m08-main-v121`) on 2026-09-20, the day `main` v1.2.1
> was merged into `mobile` and Jam started compiling and running on Android.
> **This is M09's brief-in-waiting.** M08 made the band *work* on a phone; it
> deliberately did not make it *fit*. Everything below is measured, and every
> claim has a picture beside it.

## How this was measured

`npm run shots:mobile -- --only tab-jam,jam,jam-band,jam-setup --widths
360,390,430` — the repo's own phone harness (`scripts/mobile-shots.mjs` over
`shots.html` + `src/shots/mockIpc.ts`), headless Edge with
`Emulation.setDeviceMetricsOverride({ mobile: true })` and touch emulation on,
against a `YAMES_MOBILE=1` build. Below the mock IPC boundary this is the
shipping UI.

Twelve shots were written; **all twelve fail the harness's own overflow
assertion**, which is the headline. The shots live outside the repo (the
harness writes to a temp folder by design); re-run the command above to
reproduce them byte for byte.

Three new scenes were added to the harness for this: `tab-jam` (the tab
pressed), and `jam` / `jam-band` / `jam-setup`, which reuse the same scenarios
the desktop store shots use, so a phone shot and a desktop shot of the same
screen can be put side by side.

## The one thing M08 fixed, because it was not "ugly", it was "no door"

**The library sheet had no jams in it.** On a desktop the rail hands
`PresetSidebar` the jam list, the active jam and eight callbacks; the phone's
library *sheet* passed presets and setlists and nothing else. So the Jam tab
opened empty and there was no way to open a jam at all — the tab was
unreachable unless one happened to be restored from the store. Fixed on this
branch (`fix(mobile): the library on a phone now has the jams in it`).

Everything else below is left for M09.

---

## The stage does not fit, at any phone width

The measurement, straight out of the harness:

| Width | Stage lays out at | Elements past an edge |
|---|---|---|
| 360 | **953 px** | 11 |
| 390 | **953 px** | 10 |
| 430 | **907 px** | 10 |

The content region scrolls sideways at every width. The named offenders are
the same at all three:

```
div.tempo-block     [39 … 544.8]  +154.8 past 390
span.stage-label    [39 … 544.8]  +154.8
div.bpm-display     [39 … 544.8]  +154.8
div.tempo-controls  [335 … 544.8] +154.8
button.bpm-btn      [391 … 435]   +45
button.tap-btn      [455 … 544.8] +154.8
```

**The tempo block is the worst of it, and it is an operability gap, not a
cosmetic one:** the big BPM number is on screen but `−`, `+` and TAP are
entirely off the right edge. A musician on the Jam tab cannot change the
tempo without a horizontal scroll they have no reason to discover. `jam-360.png`
shows a sliver of the `−` button's circle at the right margin and nothing
else of the row.

## The band's rows draw their controls on top of each other

`jam-band-360.png` is the clearest picture in the set. Each player's row —
Drums, Bass, Keys — is `name · picker · volume · switch` on one line, and at
360 px the picker, the slider and the switch overlap:

- **"GROOVE" is painted underneath the volume slider's track**, with the thumb
  over the "O". Same for Bass ("STYLE") and Keys ("COMPING").
- The picker's chevron sits inside the slider.
- The switch survives on the right, so the row is still *usable* by accident,
  but the picker is not: its label and its chevron are both under the slider.

The desktop layout suite already has a gate for exactly this
(`tests/layout/jam.spec.ts` — "keeps the volume and the switch reachable on
every player's row"), and it passes, because it runs at 760 px and up. **M09
should extend that spec to 360/390/430 rather than write a new one.**

## The context bar is clipped

At every width the top row — the JAM chip, the vibe name, the two volume
controls, "Cheat sheet", "Set up" and the `⋯` overflow — runs off the right.
In `jam-360.png` all that is left of "Cheat sheet" / "Set up" is two letters
("sl") behind the `⋯` button. Both are reachable *only* through the overflow
menu, which is at least a door; "Set up" is the whole configuration of the
mode and deserves better than third place in a `⋯`.

## Seven tabs in a bottom bar built for six

Jam is a fifth destination and the bar now carries seven buttons
(Metronome · Drill · Setlist · Jam · Settings │ Library · Zen). At 360 px the
first label truncates to **"Metrono…"**. It is legible and the icons carry the
meaning, so this is cosmetic — but it is the first thing anyone will notice,
and M03d chose those labels specifically to fit *six*.

## What already works, and should not be touched

Worth writing down so M09 does not "fix" it:

- **The setup drawer is the best screen of the three.** On a phone it is a
  full-width sheet rather than a docked right-hand panel, and the vibe tiles,
  the "which one" chips and "one of yours" all read cleanly at 360
  (`jam-setup-360.png`). Play and Count-in stay pinned at the bottom.
- **The timeline fits.** Twelve bars wrap to a 4 × 3 grid at 360, the current
  bar is lit, and the loop marks sit above each row.
- **The NOW block fits**: the chord, what is coming, the scales line and the
  FRETBOARD link all wrap correctly.
- **Stop and Count-in** are pinned above the tab bar and are the two controls
  a player actually reaches for mid-song.

## Ranked, for M09

1. **The tempo controls are off screen** on the Jam tab. Operability.
2. **The band rows overlap** — picker under slider. Operability.
3. **The context bar is clipped**; "Set up" deserves a first-class place.
4. **Seven tabs, one truncated label.** Cosmetic, and the most visible.
5. The stage's 907–953 px floor is the root cause of 1 and 3; a phone layout
   for `.jam-view` fixes both at once.

## Not in these pictures

- **Takes and the custom-kit folder are absent on a phone by design** (M08):
  a take records you through a microphone a mobile build does not have, and a
  kit of your own is a folder a phone has nowhere to point at. If a future
  brief wants either, it is a new capability, not a layout fix.
- **Spoken cues are absent** for the same reason — no voice in a mobile build.
- The cheat sheet's own screens were not photographed; they are reached from
  the context bar, which is where this document stops.
