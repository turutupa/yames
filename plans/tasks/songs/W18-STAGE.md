# W18 — The Songs stage: what you need is on the screen, and the review arrives where you were looking

Branch `songs-w18-stage`, from `songs-v1`. Size M. Frontend only:
`src/containers/songs/**`, `src/styles/songs.css`, the shots scenes,
`tests/layout/**`. The orchestrator looked at the screen for the first
time on 2026-09-20 (headless capture, Ember, 1400×900 and 1100×720) and
measured three defects that 107 green layout tests did not see, because no
test asked whether a thing was *visible*:

| | top | viewport |
|---|---|---|
| band faders (`.songs-band`) | 928 px | 900 px |
| the review (`.songs-review`) after stop | 1075 px | 900 px |
| at 1100×720: faders 824, review 971 | | 720 px |

So a player who stops sees nothing happen (the review is a scroll away,
under the fold), and the faders A13 says live on the stage cannot be
reached while playing without scrolling. The tab frame is ~520 px with its
own scroll, inside an outer scroller: a scroll inside a scroll.

## What to build

1. **The stage is one screen.** No outer scroll in Songs at any supported
   window size. The header, the tab and one compact control strip share the
   height; the tab flexes and keeps its own scroll (it follows the cursor
   anyway). The control strip holds the range, the sections, the count-in
   and the band — the band as a compact row (name, a short fader, mute),
   collapsing to icons with a popover only below the width where a row no
   longer fits (container queries, portalled popover: `UI_DECISIONS.md`,
   the Jam UI pass rules). Everything you change while playing is visible
   while playing (`JAM_UX_DECISIONS.md` A13).
2. **The review arrives where you were looking** (`COACH_UX.md` A4). On
   stop, the review takes the tab's place in the same frame — the sentence,
   the coloured excerpt, the button — with the full tab one press away
   ("Back to the tab", Escape, or simply pressing play, which also
   dismisses it). It must never need a scroll to be noticed; its own
   content may scroll inside the frame if "what else" is opened. Focus
   moves to the review's heading for keyboard and screen-reader users and
   returns to play on dismiss. Respect `prefers-reduced-motion`.
3. **One count-in, not two.** The stage has "Straight in / 1 bar / 2 bars"
   and the docked transport still shows the metronome's own count-in
   switch, which does nothing in Songs (W9: `load_song` clears it). In
   Songs the transport's switch is hidden or becomes the same control; do
   whichever matches how Jam solved it.
4. **The sidebar's preset panel does not belong in Songs.** Under the song
   list it says "No presets yet — save a tempo, sound and meter", which
   means nothing for a song. Show the song's takes and due passages there
   instead if W14 put them elsewhere, or nothing.
5. **Tests that ask the question that was missed.** In `tests/layout`: at
   the minimum window size, 1100×720 and 1400×900, in a long-string locale
   if W16's switch has landed — while playing, every control in the strip
   is inside the viewport; after stop, the review's heading and its action
   button are inside the viewport without scrolling; no element in Songs
   other than the tab viewport and the opened "what else" has
   `scrollHeight > clientHeight`. Add the same "is it on screen" assertion
   for Jam's stage controls if it is missing there.

## Rules

Judge by looking: capture each state with `node scripts/take-screenshots.mjs
--shot <scene> --theme <t> --out <dir>` (headless; the Browser pane cannot
draw while the owner is away) in Ember, Ivory and Manuscript, open the
images, and describe in the report what you saw. New strings go at the END
of their namespace object in `en` and the 14 other locales (W16 is
translating values in the same files right now; keep yours few and
appended so the merge is trivial). W15 owns `useLiveNoteLights` and
`useSongTakePitch`; mount them as they are. No new dependency.

## Gates

build, vitest, `npm run test:layout` (it has a port per checkout now).
