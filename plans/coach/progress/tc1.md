# tc1 — the tip catalogue's old English lines, reworded in fifteen languages

Branch `coach-tc1`, worktree `/home/dgx-delgado/yames-coach-tc1`, logs `/tmp/coach-tc1/`.

## Scope
The 30 lines the English honesty lint listed (`src/coach/toolTips.locales.test.ts`), less its one false
positive (`proMode.generic.flat_dynamics.neutral.1`, "across the bar" = a bar of music, kept as is: the
lint's pattern now skips "across / per / in / of / each / every the bar"), plus:
- `catalog.acoustic-guitar.session_start_cold.neutral.1` ("Get tuned up"): the lint read `tune|tuning`, not `tuned`.
- `catalog.generic.dragging_trend.neutral.7`: a pitch word (half-step) in a timing line.
- `proMode.generic.flat_dynamics.neutral.0`, `proMode.generic.weak_downbeats.neutral.1`: "pick attack", a
  guitar word, in the instrument-neutral overlay.
- 9 lines the lint's `\bwrist\b` missed because they say "wrists" (now `\bwrists?\b`).

42 keys (`tc1.keys.txt`), each in all fifteen locales. The lint's allow-list (`LINT_KNOWN`) is empty; the
lint gained `tuned/tunes/tuner`, `wrists`, a pitch-word check on the timing scenarios and a guitar-word
check (`pick attack`, `pick hand`, `strum`) on every `generic` vocabulary.

Rules applied: **cause** = a line naming the body as the reason (tension, wrists, shoulders) claims a
cause nobody measured; the fatigue slot fires on accuracy falling at an unchanged tempo, so a fatigue line
may say that, and a stamina line (`{staminaMinutes}`) may say the score at this tempo drops around that
minute; a break is offered as a suggestion. **tuning** = nothing about tuning. **timing word** = no pitch
words in timing lines. **neutral vocab** = no guitar words in `generic`. Slots, severities, placeholders
and variant counts unchanged.

## Table (rule: C = cause/body, T = tuning, P = pitch word in timing, G = guitar word in generic)

| key | old English | new English | rule |
|---|---|---|---|
| `catalog.generic.dragging_trend.neutral.7` | Drag is showing. Imagine the click is a half-step earlier than you think. | Drag is showing. Aim for the front edge of each click, not the middle. | P |
| `catalog.generic.check_in.correction.4` | Long stretch — check the wrists and shoulders before continuing. | Long stretch without a pause. A short break is an option before you continue. | C |
| `catalog.drums.fatigue.encouragement.0` | Hands tightening up? Shake the wrists out and come back. | Hits are slipping at the same tempo. Sticks down a moment, then come back. | C |
| `catalog.drums.fatigue.encouragement.5` | Wrists locking up — quick shake-out, then continue. | Accuracy's sliding — quick break, then continue. | C |
| `catalog.drums.fatigue.correction.2` | Stop before tension takes over. 90 seconds off, hydrate, return. | Hits keep slipping at this tempo. 90 seconds off, hydrate, return. | C |
| `catalog.drums.fatigue.correction.3` | Wrists are tight. Stop, stretch the forearms, two minutes off. | Misses are climbing at one tempo. Stop, sticks down, two minutes off. | C |
| `catalog.drums.stamina.neutral.2` | Fatigue shows around minute {staminaMinutes} on the kit. Rest the wrists, then return. | Your scores on the kit dip around minute {staminaMinutes}. A short rest, then return. | C |
| `catalog.electric-guitar.session_start_cold.neutral.2` | Tune up, settle in, then play when you're ready. | Get comfortable, settle in, then play when you're ready. | T |
| `catalog.electric-guitar.fatigue.encouragement.1` | Wrist or forearm feeling locked? Quick pause, then come back in. | Accuracy's been slipping for a few minutes. Quick pause, then come back in. | C |
| `catalog.electric-guitar.fatigue.encouragement.2` | Tension creeping in — set the guitar down for 60 seconds. | Misses creeping in at this tempo — set the guitar down for 60 seconds. | C |
| `catalog.electric-guitar.fatigue.encouragement.3` | Shoulder lifting? Drop it, breathe, then resume. | Long run at one tempo. Breathe, then resume. | C |
| `catalog.electric-guitar.fatigue.encouragement.7` | Take 30 seconds, roll the shoulders, then back to it. | A 30-second break is an option, then back to it. | C |
| `catalog.electric-guitar.fatigue.correction.0` | Fatigue's showing in the pick attack — stop, rest the arm 90 seconds. Tired picking builds tension. | Accuracy has been dropping at the same tempo — stop, guitar down 90 seconds, then check it again. | C |
| `catalog.electric-guitar.fatigue.correction.1` | You're past peak — guitar down, stretch the wrist, then back in. | Scores are below your peak — guitar down for a minute, then back in. | C |
| `catalog.electric-guitar.fatigue.correction.3` | Wrist is straining. Set the guitar down, stretch the forearm, two minutes off. | Misses keep rising at this tempo. Set the guitar down, two minutes off. | C |
| `catalog.electric-guitar.fatigue.correction.6` | Stop. Wrist circles, forearm stretches, then come back fresh. | Stop here. Two minutes away from the guitar, then come back fresh. | C |
| `catalog.electric-guitar.stamina.neutral.0` | Past the {staminaMinutes}-minute mark your picking hand tenses. Shake it out, then resume. | Past the {staminaMinutes}-minute mark your timing at this tempo tends to slip. A short break, then resume. | C |
| `catalog.acoustic-guitar.session_start_cold.neutral.1` | Get tuned up and start whenever — I'll listen from the first note. | Get settled and start whenever — I'll listen from the first note. | T |
| `catalog.acoustic-guitar.fatigue.encouragement.1` | Wrist feeling locked? Quick stretch, then come back in. | Accuracy's sliding at this tempo. Quick break, then come back in. | C |
| `catalog.acoustic-guitar.fatigue.encouragement.2` | Tension creeping into the strum — guitar down for 60 seconds. | Misses creeping into the strum — guitar down for 60 seconds. | C |
| `catalog.acoustic-guitar.fatigue.encouragement.3` | Shoulder lifting? Drop it, breathe, then continue. | Been strumming at one tempo a while. Breathe, then continue. | C |
| `catalog.acoustic-guitar.fatigue.encouragement.7` | Take 30 seconds, roll the shoulders, then back to it. | Take 30 seconds if you want them, then back to it. | C |
| `catalog.acoustic-guitar.fatigue.correction.1` | You're past peak — set the guitar down, stretch the wrist, then return. | Scores are below your peak — set the guitar down for a minute, then return. | C |
| `catalog.acoustic-guitar.fatigue.correction.6` | Hard stop. Wrist circles, forearm stretches, then continue when loose. | Hard stop. Two minutes off, then continue when you're ready. | C |
| `catalog.acoustic-guitar.muddy_hits.neutral.1` | Good coverage, soft hits. More wrist force through the strings. | Good coverage, soft hits. Strum a little harder through the strings. | C |
| `catalog.bass.fatigue.encouragement.2` | Tension building in the right hand? Brief break, then come back in. | Notes are slipping at the same tempo. Brief break, then come back in. | C |
| `catalog.bass.fatigue.encouragement.5` | Shoulder lifting? Drop it, breathe, then continue. | Long run at one tempo. Breathe, then continue. | C |
| `catalog.bass.fatigue.encouragement.7` | Take 30 seconds, roll the wrists, then back to it. | Take 30 seconds if you want them, then back to it. | C |
| `catalog.bass.fatigue.correction.6` | Hard stop. Wrist circles and forearm stretches before continuing. | Hard stop. Two minutes off the bass before continuing. | C |
| `catalog.piano.recovery.encouragement.2` | Recovered — stay loose in the shoulders. | Recovered — keep it steady. | C |
| `catalog.piano.fatigue.encouragement.0` | Wrists tightening up? Lift the hands, breathe, then back in. | Accuracy's slipping at this tempo. Lift the hands, breathe, then back in. | C |
| `catalog.piano.fatigue.encouragement.2` | Tension creeping into the shoulders — 60 seconds off the keys. | Misses creeping in at this tempo — 60 seconds off the keys. | C |
| `catalog.piano.fatigue.encouragement.5` | Shoulders climbing? Drop them, breathe, then play. | Been at the keys a while. Breathe, then play. | C |
| `catalog.piano.fatigue.encouragement.6` | Take 30 seconds, roll the wrists, then back to it. | A 30-second break is an option, then back to it. | C |
| `catalog.piano.fatigue.encouragement.7` | Wrist tension building. Pause, drop the hands to your lap, breathe. | Accuracy's sliding at one tempo. Pause, hands in your lap, breathe. | C |
| `catalog.piano.fatigue.correction.2` | Tired playing buries the dynamics. Stop, rest the wrists, restart. | Scores keep dropping at this tempo. Stop, rest, restart. | C |
| `catalog.piano.fatigue.correction.3` | Wrists are straining. Set the hands down, stretch the forearms, two minutes off. | Misses keep rising at one tempo. Hands off the keys, two minutes off. | C |
| `catalog.piano.fatigue.correction.6` | Hard stop. Wrist circles and shoulder rolls before continuing. | Hard stop. Two minutes off the keys before continuing. | C |
| `catalog.piano.stamina.neutral.0` | Tension in your touch around minute {staminaMinutes}. Release, breathe, come back clean. | Your scores at this tempo slip around minute {staminaMinutes}. Breathe, come back clean. | C |
| `catalog.piano.stamina.neutral.1` | Around minute {staminaMinutes} the wrist tension creeps in. Brief rest, then resume. | Around minute {staminaMinutes} the misses start to creep in. Brief rest, then resume. | C |
| `proMode.generic.flat_dynamics.neutral.0` | Low amplitude variation across beat positions — try varying your pick attack. | Low amplitude variation across beat positions — try varying your attack strength. | G |
| `proMode.generic.weak_downbeats.neutral.1` | Your upbeats are dominating — increase pick attack on beats 1 and 3. | Your upbeats are dominating — increase attack on beats 1 and 3. | G |

## Proof that nothing else changed
`node scripts/tool-tips-keydiff.mjs coach plans/coach/progress/tc1.keys.txt` compares every locale's
`toolTips.json` with `coach`, leaf by leaf, and exits 1 on any key changed outside the list (or added /
removed); it also names a listed key a locale left unchanged. `--table` prints the English table above.

## Status
- [x] English reworded (42), lint allow-list empty, lint widened, key-diff script.
- [x] Fourteen locales (five sonnet helpers, `/tmp/coach-tc1/HELPER.md`). Key diff against `coach`: every
  locale `42 keys changed, 0 outside the list, 0 listed but unchanged`; `git diff --stat` 84 lines (42 -/+)
  per file, the 15 `toolTips.json` only. Where a locale's old text already met the rule (a neutral
  "attack" in proMode: nl, pl, ru, ja, pt-BR, it, tr, zh-TW) the helper reworded it lightly so the key
  changed with the English.
- [x] Gates (2026-11-21): tsc pass (job coach-tc1-tsc); build pass (coach-tc1-build); `npm run test`
  453/455 files (coach-tc1-test): the known TabStage.render symlink file, and `src/session/take.test.ts`
  timing out at 20 s under load; re-run alone with the catalogue tests, 4/4 files, 62/62 pass
  (coach-tc1-test-named; take.test 6.6 s). Full layout suite owed (tip text changed; not run here).

## Open (not in this leg's scope)
About 55 more lines in the fatigue / check_in / stamina slots name the body without the lint's words
("Hands are getting tired", "Forearms talking to you?", "your hands tighten up", "Grip tightening on the
neck?"). They claim the same unmeasured cause; a follow-up leg could reword them and widen the lint
(`hands?|forearms?|grip|fingers` in those three slots). List: `node /tmp/coach-tc1/scenarios.mjs <worktree>`.
