# tc2 — the break slots stop naming the body, in fifteen languages

Branch `coach-tc2`, worktree `/home/dgx-delgado/yames-coach-tc2`, logs `/tmp/coach-tc2/`.

## Scope
tc1's last section: the fatigue / check_in / stamina lines of the tools' tip catalogue that give the
player's body as a fact or as the cause of what was played, or ask a leading question presuming a body
state. The app measures timing against the click (and notes where grading is on), never fatigue, tension,
pain, posture or tuning.

98 keys (`tc2.keys.txt`), each in all fifteen locales:
- 92 in the three break slots (fatigue, check_in, stamina): every line naming a body part, a body state
  ("tired", "fatigue", "stiffening", "heavy", "tendons", "injury", "stamina wall", "you're past peak"), or a
  body instruction ("shake it out", "stretch the forearm", "breathe", "come back fresh"). Eleven of them are
  tc1 lines that still said "breathe", "hands" or "fresh" (the slot's rule is now: no body at all).
- 3 check_in lines that offered to listen to things the app cannot separate ("left hand, right hand",
  "limb sync"): the widened lint hits them (hands, limb); reworded to an open offer.
- 2 outside the slots, a body state given as the cause of dragging (`bass.dragging_trend.correction.4`
  "the finger's getting heavy", `piano.dragging_trend.correction.7` "The fingers are getting heavy").
- 1 the lint does not catch: `electric-guitar.stamina.neutral.3` ("lose edge on the picking", a claim about
  the attack nothing measured).

Rules applied (as tc1's): say what was measured (accuracy / scores / misses at this tempo, around minute
{staminaMinutes}), offer the break without the diagnosis, or ask an open question. The three "you'll buy
yourself an injury" lines and "you'll hurt yourself" became a plain "stop if anything hurts". Slots,
severities, placeholders and variant counts unchanged.

## The lint (`src/coach/toolTips.locales.test.ts`), widened
- `BODY_STATE`, everywhere: tired, fatigue, sore, ache, cramp, stiff, injury, tendon, strain, stamina,
  "getting heavy", "feel(s/ing) heavy/tight/locked", "working too hard / harder than", "past (your) peak",
  "hurt" (except "anything / something hurts").
- `BODY_WORD`, in the fatigue / check_in / stamina slots only: hand, finger, wrist, arm, forearm, shoulder,
  limb, grip, body, breath(e), relax, loose, tight, tense, shake, fresh, recover, heavy, pressure, touch,
  attack, "your back", "you (tend to) fade", "stretch" unless it is time ("long / quiet / solid ...
  stretch"), "neck" unless it is the guitar's ("on / up / down / along / across / off the neck",
  "neck pickup / position"), the way tc1 handled "the bar".
- The allow-list `LINT_KNOWN` stays empty.
- Outside the break slots the hand words stay allowed: "Picking hand is landing before the click" names
  which hand, a different question (open point below).

## Five pairs (the full old/new table: `node scripts/tool-tips-keydiff.mjs coach --table`)
| key | old English | new English |
|---|---|---|
| `generic.fatigue.neutral.3` | Same tempo, falling accuracy. Hands are getting tired. | Same tempo, falling accuracy. A short rest is an option. |
| `drums.fatigue.encouragement.2` | Forearms talking to you? Brief pause, then back in. | Hits drifting at the same tempo. Brief pause, then back in. |
| `electric-guitar.fatigue.encouragement.5` | Grip tightening on the neck? Loosen up, then play. | Want a short break? Then play on. |
| `bass.fatigue.correction.7` | Push past this and you'll buy yourself an injury. Stop and recover. | Take a real break now, and stop if anything hurts. |
| `piano.stamina.neutral.3` | Fatigue in the hands shows around minute {staminaMinutes}. Rest, then return. | Your scores dip around minute {staminaMinutes}. Rest, then return. |

## Proof
- The widened lint on `coach`'s English: `coach`'s `en/toolTips.json` put in place, job
  `coach-tc2-lint-oncoach` FAILS, `expected [ …(97) ] to deeply equal []` (log
  `/tmp/coach-tc2/lint-oncoach.log`); file restored from HEAD. On this branch: job `coach-tc2-lint`, 50/50.
- `node scripts/tool-tips-keydiff.mjs coach plans/coach/progress/tc2.keys.txt`: every locale (en + 14)
  `98 keys changed, 0 outside the list, 0 listed but unchanged`; `git diff --stat` 98 -/+ per file.
- No copy of these lines in `templateCatalog.ts` (a loader since c5c3) or in Rust (grep of four of the old
  lines over `src/`, `src-tauri/src/`, `scripts/`: only the locale files).

## Translation
Three sonnet translators (de fr it es nl / pl ru tr pt-BR vi / ja ko zh-CN zh-TW; brief
`/tmp/coach-tc2/HELPER.md`), fragments in `/tmp/coach-tc2/i18n/`, checked by `/tmp/coach-tc2/check.mjs`
(98 keys, placeholders, no "!", each differs from the locale's old line), applied by
`/tmp/coach-tc2/apply.mjs` (sets values by key, refuses a file whose formatting would change). Then one
sonnet proof-reader per group who had not translated it (`/tmp/coach-tc2/PROOF.md`): 11 fixes in group 1
(it "allo stesso tempo" read as "at the same time"; nl "piek" -> "beste niveau"; gendered "ready"), 45 in
group 2 ("is an option" calques, pl/ru "won't hurt", pt-BR "tempo" vs "andamento"), 17 in group 3 (zh
"next pass" was the Take word 遍 -> 轮/輪; ko 손 "hand" left in two lines; zh-CN sticks 鼓槌, zh-TW 刷弦).

Native reads wanted: **ko** (many orders end in plain 해요체 where the file mostly uses -세요; the proof-reader
left them), **it** ("mantenendo lo stesso tempo", "a un solo tempo"), **tr** ("acıtıyorsa" in the pain lines,
"kafanı topla"), **ru** ("соберитесь с мыслями"), **vi** ("chỗ nào đau"), **pt-BR** ("ritmo" for timing).

## Open (not this leg's)
- Outside the break slots ~60 lines still attribute timing to a hand ("Picking hand is landing before the
  click", "Right hand is leading the left", "Hands are racing") or give a body instruction ("Relax your
  hands", "Stay loose", "Drop your right hand to your lap, breathe"). The app hears one onset stream: it
  cannot tell which hand, or kick from snare. A follow-up leg could reword them to the measured fact.
- `generic.check_in.correction.0` "Take 10": most locales read it as ten minutes (as before this leg).

## Status
- [x] English reworded (98), lint widened (mirror `/tmp/coach-tc2/lint.mjs`).
- [x] Fourteen locales, proof-read.
- [x] Gates (2026-11-21): tsc pass (coach-tc2-tsc); build pass (coach-tc2-build); `npm run test` 466/467
  files, 50363 tests, only the known TabStage.render symlink file fails (coach-tc2-test,
  `/tmp/coach-tc2/test.log`).
- [ ] Layout `tool-coach.spec.ts`: first run 42/57 with 15 timeouts on a loaded box (6 jobs, other legs'
  layout runs; `/tmp/coach-tc2/layout.log`); re-run with `--workers=2` (coach-tc2-layout-2).
