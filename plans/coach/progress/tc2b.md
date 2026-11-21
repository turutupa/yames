# tc2b — tip lines say only what the code that selects them measured

Fix leg after the review of tc2 (`/tmp/coach-orch/tc2-review.md`, MERGE AFTER FIXES). Branch `coach-tc2`,
worktree `/home/dgx-delgado/yames-coach-tc2`, tools and fragments `/tmp/coach-tc2/b/`. Keys:
`tc2b.keys.txt` (39, every locale) + 4 es-only keys (`/tmp/coach-tc2/b/es-extra.keys.txt`).

## The triggers, checked in code
- `stamina`: `detectStaminaPattern` (`src/coach/presetAwareness.ts:250-305`) takes the preset's sessions in
  one 10-BPM band, sorted by date, and compares the mean score of the oldest third with the newest third
  (drop >= 10). `staminaMinutes` = average estimated session length in that band. Fired once per session
  at `staminaMinutes * 30 s` (`useRealtimeTips.ts:136-147`). Nothing scores a session minute by minute and
  the current tempo is not compared with the band.
- `check_in`: five minutes since the coach last spoke (`gatekeeper.ts:1283-1295`); a stop does not reset it.
- `fatigue`: **nothing fires it in production** (only tests force it; the three production `force` callers
  in `useToolCoach.ts` send `ramp_complete`, `boundary_signal_a`, `grid_discontinuity`). Its lines are held
  to the documented contract: accuracy falling over three minutes at a constant BPM. Nothing fires the slot
  today. No detector built (not this leg).

## What changed (English)
- All 24 `stamina` lines (the 17 tc2 reworded, 7 older; `piano.stamina.neutral.1` was one the review did
  not list): "around minute N" / "past the N-minute mark" / "at this tempo" -> "your sessions here run
  about {staminaMinutes} minutes, and the recent ones scored lower than the early ones", varied per
  instrument; the break stays an offer. Placeholder kept in every line.
- `generic.fatigue.correction.2` "... than the ones before."; four "drifting" -> "slipping".
- check_in: `correction.5` (review) and the three lines with the same unmeasured claim of continuous play
  (`correction.1` "continuous", `correction.4` "without a pause", `neutral.2` "uninterrupted");
  `correction.0` "Take 10" -> "Take a few minutes off" (every locale read it as ten minutes).
- `acoustic-guitar.fatigue.correction.7` / `electric-guitar.fatigue.correction.7`: one sentence, "and stop
  any time something hurts". `piano.dragging_trend.correction.7` "Aim each one a hair earlier".
- `drums.fatigue.correction.2` / `.7`: no hydrate, no drink of water.
- es only: "Tirada larga" -> "Rato largo" (2), "Bajo abajo" -> "Deja el bajo" (2).
- LOW 9 (`piano.check_in.neutral.1/.4` offering feedback on a passage): left as the review allows; same
  shape as the untouched `neutral.3`.

## The lint (`src/coach/toolTips.locales.test.ts`)
- `BODY_STATE` + pain(s) / painful (not "painless"), exhausted, worn out, numb, hydrat*; "stamina" only as
  "your stamina" / "stamina wall|is|runs|fading|dropping|gone" (a Path grades `stamina`). "tension" and
  "posture" were already in `LINT` (the review missed that).
- `BODY_WORD` (break slots) + drink, water; lets by "a touch", "no pressure", "fresh start".
- New `STAMINA_PER_MINUTE` for the `stamina` slot: "minute {staminaMinutes}", "{staminaMinutes}-minute
  mark", "around / at / past / after / by minute", "at this tempo". `LINT_KNOWN` stays empty.
- A test of the lint's edges (what it catches, what it lets by).

## For the owner
- The `fatigue` slot (63 lines per locale) and the rest intervention keyed on it have no detector:
  nothing shows them. Whoever wires one must meet what the lines already say (accuracy / scores falling
  over minutes at one BPM, misses rising), or reword them.
- The stamina lines could be more exact with a small code change: pass `bpmLow`, `bpmHigh`, `scoreDrop`
  into the template context ("at 120-130 BPM your recent sessions scored 12 points lower").
- `generic.check_in.neutral.5` "Long run with no slips" is also stronger than "five minutes since the
  coach spoke"; left (not in the review).

## Status
- [x] English (40 keys: the 39 above + `generic.fatigue.encouragement.2` "Quality's drifting" ->
  "slipping", found after the review's four) + lint; `toolTips.locales.test.ts` 51/51 (coach-tc2b-lint).
- [x] Fourteen locales: three sonnet translators (de fr it es nl / pl ru tr pt-BR vi / ja ko zh-CN zh-TW,
  brief `/tmp/coach-tc2/b/HELPER.md`), one sonnet proof-reader per group (`PROOF.md`): fixes in it (10:
  "allo stesso tempo" read as "at the same time", "fascia di tempo" -> "fascia di BPM"), pl (13: calque
  "osuwać się", "po N minut" read as "after"), fr 3, ru 2, ko 4, es 1, nl 1. The 40th key was written by
  the coder and proof-read in all 14 by a fifth sonnet (`/tmp/coach-tc2/b/one.json`).
- [x] Key diff against tc2's last commit (`node scripts/tool-tips-keydiff.mjs 088396f7
  plans/coach/progress/tc2b.keys.txt`): every locale 40 changed, 0 outside, 0 unchanged; es also has the
  4 es-only keys as "outside" (by design, `/tmp/coach-tc2/b/es-extra.keys.txt`).
- [x] Proof the new lint bites: a mirror (`/tmp/coach-tc2/b/lint.mjs`) over tc2's English (088396f7)
  flags all 24 stamina lines + `drums.fatigue.correction.2` (hydrate) + `.7` (water); over HEAD, none.
- [x] Merged `coach` (clean). Gates: tsc pass (coach-tc2b-tsc); build pass (coach-tc2b-build); `npm run
  test` 472/473 files, 51041 tests, only the known TabStage.render symlink file fails (coach-tc2b-test,
  `/tmp/coach-tc2/b/test.log`); layout `tool-coach.spec.ts` `--workers=2` 57 passed, 2 skipped
  (coach-tc2b-layout).

## Native reads wanted
it "a tempo costante" / "a tempo invariato"; ko "어떤 템포 구간"; tr "aksıyor" (slipping), "ipucu" (tip); pl
and ru "minut" / "минут" after a variable N (right for some N only, as every count line in those files).

## Left
- `drums.fatigue.encouragement.1` "Quality's drifting — get off the throne for 60 seconds." has the same
  "drifting" fault (found at the end; not changed).
- `generic.check_in.neutral.5` "Long run with no slips" (see "For the owner").
