# Leg cues1: Rhythm Foundations' cues (one thing to try)

Branch `coach-cues1`, worktree `/home/dgx-delgado/yames-coach-cues1`, logs `/tmp/coach-cues1/`.

## State

- [x] Step 1: read; 52 Exercises (46 in Steps, 6 warm-ups), dump `/tmp/coach-cues1/rhythm-foundations-dump.txt`.
- [x] Level 1 (beginner: on-the-beat, eighths, rests, other-strings, two warm-ups): 17 Exercises, 158 cues, check 0 errors.
- [x] Level 2 (intermediate: off-beats, the-push, sixteenths, triplets, two warm-ups): 18 Exercises, 154 cues, 0 errors.
- [x] Level 3 (advanced: sixteenth-syncopation, gear-changes, two-strings-at-once, with-the-band, two warm-ups):
  17 Exercises, 152 cues, 0 refusals, check 0 errors. All 52 Exercises: 464 cues, 220 distinct sentences.
- [x] Proof-read (below): 9 objections, all taken; 464 cues, 219 distinct sentences, 0 refusals.
- [x] Translations: fourteen languages, 219 sentences each, merged (`c326b2eb`). The fr, es and it files
  (whose helper was still running when the first agent stopped) were checked by cues1b with
  `/tmp/coach-cues1/check_i18n.py` like the other eleven: valid, 219 keys, none over 48, no "!", digits and
  quoted counts kept. Merge log `/tmp/coach-cues1/merge.log` (0 errors; only "different numbers" warnings
  where a pack writes "fret five" as 5), check `/tmp/coach-cues1/gc5.log` (0 errors, 0 warnings).
- [x] Two wording points (`1658d696`): the-and `extras` "Miss the string on each beat after the first."
  (could read as "the beat after the first one") -> "Miss the string on '2', '3' and '4'." in English and all
  fourteen; pl's one-finger-per-fret `notes` cue (fifth-tune, triplet-tune, gear-riff) was a phrase ->
  "Kładź jeden palec na próg: pięć, siedem, osiem." Check `/tmp/coach-cues1/fix1.log`: 0 errors.
- [x] Gates (below)

## The numbers

464 cues on 52 Exercises (46 in Steps, 6 warm-ups), 219 distinct sentences, 0 refusals. By trigger: general
52, heard 52, late 52, early 52, extras 46, stringChange 46, lastBars 44, openString 42, notes 38,
afterHeld 34, shift 6.

Longest cue per language (characters; the limit is 48):

| lng | len | cue |
|---|---|---|
| en | 47 | quarter-riff.cue.0 "Keep the fretting fingers close to the strings." |
| de | 48 | open-quarters.cue.0 "Spiel jeden Ton so, dass der Klick verschwindet." |
| es | 48 | quarter-riff.cue.9 "Sostén las dos últimas notas dos clics cada una." |
| fr | 48 | halves.cue.2 "Laisse sonner la note longue ; ne la rejoue pas." |
| it | 48 | eighth-riff.cue.4 "Metti ogni pennata in giù sul battito del piede." |
| ja | 41 | gears.cue.0 「1 and, 2-trip-let, 3 e and a, 4」と数えましょう。 |
| ko | 39 | sync-riff.cue.0 '1 and, (2) and, (3) and 4'를 소리 내어 세세요. |
| nl | 48 | halves.cue.2 "Laat de lange noot klinken; niet opnieuw spelen." |
| pl | 48 | the-and.cue.5 "Przed każdym „i” poczekaj, aż stopa się uniesie." |
| pt-BR | 48 | gear-one.cue.0 "Encaixe duas notas em cada clique, baixo e cima." |
| ru | 48 | gear-one.cue.2 "Играйте каждую ноту дважды в такте 2, не больше." |
| tr | 48 | gear-one.cue.1 "Her çiftin iki notasını da çal, aşağı ve yukarı." |
| vi | 48 | open-quarters.cue.7 "Chuyển pick sang dây mới khi nốt trước còn ngân." |
| zh-CN | 35 | gears.cue.0 数“1 and, 2-trip-let, 3 e and a, 4”。 |
| zh-TW | 35 | gears.cue.0 數「1 and, 2-trip-let, 3 e and a, 4」。 |

Want a native read: nl, pl, tr, vi (the helpers were least sure there). "fill" (the drummer's) and "wide
note" (a triplet-over-two note) were hard for zh, vi, ru and tr: check those cues first.

## Gates (rhythm-foundations, on `1658d696`)

- `npm run paths -- check` (every pack): 16 Paths ok, 0 errors (`/tmp/coach-cues1/check-all.log`).
- `npx tsc --noEmit`: clean (`/tmp/coach-cues1/tsc.log`).
- `npm run test`: 392 of 393 files, 15,536 of 15,536 tests passed (`/tmp/coach-cues1/vitest.log`). The one
  file is the known worktree-only `TabStage.render.test.tsx` (Vite refuses a file reached through the
  `node_modules` link); one "Timeout calling onTaskUpdate" under load, with every test passing.
- `npm run build`: ok (`/tmp/coach-cues1/build.log`).

## The proof-read (a separate sonnet reader: cues, tabs, purposes, how-tos, the guide's rules only)

9 objections (`/tmp/coach-cues1/proof-rhythm-foundations/objections.md`), all taken (was -> now):
open-quarters openString "Rest the fretting hand and count the beats." (two ideas) -> "Keep the fretting hand
off the strings." · half-rest early "Breathe out through both silent beats." (tension teaching, not the count)
-> "Wait out both silent beats, then come in."; stringChange "Move to the next string during the rest." (the
changes in this tab are inside the eighth runs) -> "Keep the pick close as you cross." · the-and general "Play
each note as the foot comes up." (the first note is on beat 1) -> "Play each 'and' as ..." · shuffle and
band-shuffle stringChange "Move across as each open note ends." (the crossings come after each short note, back
to the open one too) -> "Move across right after each short note." · band-eighths general "Leave '2' and '3' to
the drums." (bar 4 plays beat 3) -> "... till the fill." · funk-line afterHeld "Count through the gap, then come
in." (the held note is the last quarter, not a gap) -> "Count the long note's beat, then come in." · pyramid
extras "Play one, two, three, then four notes a beat." (only the way up) -> "Count each beat's notes and play no
more." · three-over-two late "Make the three wide notes all the same length." (no help to a late player) ->
"Play the first wide note right on the click."

Answered, not changed: none (the reader passed the stock lines as deliberate).

## Refusals and rewordings

- "Say each fret number before you play it." (`notes`, 21 variants): `cueTexts` refused it on every
  `stringSet` variant ("a layout of frets, and the frets moved differently") -> "Read one note ahead in the
  tab as you play." (0 refusals after).
- "Keep the hand moving up to the last note." (sixteenth-riff `lastBars`, 2 variants): "hand ... moving" reads
  as the hand's position -> "Keep the swing going right to the last note."
- "Move the hand up as each new bar starts." and then "Shift as each new bar starts, not after."
  (gallop-up `shift`, 6 variants: the frets move differently between keys) -> "Arrive on the new note as each
  bar starts."
