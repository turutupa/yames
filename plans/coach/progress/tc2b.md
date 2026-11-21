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
- [x] English (39 keys) + lint; vitest `toolTips.locales.test.ts` 51/51 (job coach-tc2b-lint).
- [ ] Fourteen locales (three sonnet translators, then three proof-readers).
- [ ] Merge `coach`; gates.
