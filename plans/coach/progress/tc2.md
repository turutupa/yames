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

## Status
- [x] English reworded (98), lint widened (mirror `/tmp/coach-tc2/lint.mjs`: 97 hits on `coach`'s English,
  0 on this branch's).
- [ ] Fourteen locales (sonnet helpers, `/tmp/coach-tc2/HELPER.md`, fragments `/tmp/coach-tc2/i18n/`,
  applied by `/tmp/coach-tc2/apply.mjs`, which keeps the file's formatting).
- [ ] Proof-readers, one per group.
- [ ] Gates.
