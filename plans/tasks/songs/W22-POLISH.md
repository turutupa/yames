# W22 — Polish: what the orchestrator saw when it looked at W18's captures

Branch `songs-w22-polish`, from `songs-v1` as it stands (it must contain
`merge(songs-w18-stage)`). Size S–M. Frontend only. W19 (import offer,
library order, starter shelf) and W21 (camera) are in flight around the
same screen in NEW files: touch only what each item names, append locale
keys at the END of their namespace, and remember the plural test is total
now (pl/ru need `_few` and `_many`, es/fr/it/pt-BR need `_many`,
ja/ko/vi/zh-CN/zh-TW take no `_one`).

1. **The playback cursor.** In `ember-songs-playing` the transport reads
   bar 4 and there is no cursor anywhere on the tab. Find out which it is
   and fix it: (a) W18's selection overlay (`z-index: 1`, over the
   engraving) paints over alphaTab's cursor, which is a child of the host;
   (b) the cursor colour vanishes on some themes; (c) the shots harness's
   mocked beat events carry no advancing `songTick`/`songBar`, so the
   cursor W13 drives from `songTick` never leaves tick 0 — in which case
   the mock is wrong and must emit what the engine emits (W9's fields), and
   the question still has to be answered for the real app by reading the
   code path. The cursor must be unmistakable in all 13 themes, sit ABOVE
   the selection band and BELOW the handles, and the tab must keep it in
   view (scroll the system into view before the cursor reaches it, not
   after). Add the test that was missing: in the playing scene the cursor
   element exists, is inside the tab viewport, is not covered at its centre
   point (`elementFromPoint`), and has moved between two readings a bar
   apart. Same check for the live note lights (W14/W15): a lit note is
   visible, not under the overlay.
2. **A due passage sets the selection** (W18's stated gap): pressing a due
   item on a song opens it with that passage selected, looping, at the
   tempo the promise was made at, exactly as the review's `loopBars` does.
3. **Words a player understands at a glance** (`plans/WEBSITE_DECISIONS.md`,
   the audience rule; `plans/COACH_UX.md` B1). In the strip: the loop chip
   reads "Loop" (pressed when on), not "Round and round"; saving a portion
   is "Save this part", not "Keep it"; the pass counter reads "3rd time
   round", not "Go 3"; "Once through" stays. In the review, "Loop bars 5–8
   at 77" must say what 77 is ("at 77 BPM", or the percentage if that is
   what the strip shows — be consistent with the strip). Change `en` and
   translate the change in the other 14 locales.
4. **One chip, not two, for the same bars.** When a saved portion covers
   exactly a section's bars, both chips light. Light the saved one and let
   the section chip rest, or do not offer to save a portion identical to a
   section — pick the simpler and say which.
5. **Singular in English** (W20's finding; English copy is yours to fix in
   this task): `metronome.tapCount`, `metronome.clicksPerBar`,
   `drill.beatsSummary`, `drill.everyBars` read "1 taps", "1 bars". Give
   them `_one`/`_other` and every locale the forms its language needs.
6. **Housekeeping:** remove the `songs.countIn.*` keys W18 left unused
   (keep `counting`), in all 15 locales; the active chip in Ivory is hard
   to tell from an inactive one — give the active state a cue that is not
   only colour (weight or a mark), in the chip component everybody shares,
   and check Jam's chips did not change for the worse.

Judge by looking: capture `songs-playing`, `songs-portion` and
`songs-review-rushing` headlessly (`node scripts/take-screenshots.mjs
--shot <scene> --theme <t> --out <dir>`) in Ember, Ivory, Manuscript and
Mono, open the images, and describe what you saw. Save them to
`polish-shots\` in your worktree (git-ignored) and give the paths.

## Gates

build, vitest, `npm run test:layout`.
