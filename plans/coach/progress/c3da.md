# Leg c3da: what the small router's misses say (analysis only, 2026-11-21)

Branch `coach-c3da` (from `coach` at 51464eaf). No app code, no training records, no model run. Inputs:
`~/scratch/yames-c3d/runs/b1-06b-full/` (`heldout/{alone,chain-rules-first,chain-model-first}/results.json`,
`val/final-q8_0/outcomes.jsonl`, `data/validation.rendered.jsonl`), `evals/coach/train/{train,validation}.jsonl`,
`evals/coach/tools/*.jsonl`. Scripts (read-only, no model): `/tmp/coach-c3da/analyze.mjs` (output
`/tmp/coach-c3da/analysis.txt`), `/tmp/coach-c3da/binom.mjs`. One queue job re-scored the chain with
`coach`'s rules over the same model outputs (section 1d).

**Held-out hygiene.** Held-out items are named by id. Their typed text is quoted only where a RULES defect
needs the line to be fixed (section 1c), never for a model miss. A leg that writes training data reads
sections 3 and 5 only, and takes nothing from 1c.

## 1. Where the right-tool misses are (held-out, 183 expected calls)

### 1a. Model alone: 30 misses (153/183)

| what it said | n | items (expected tool) |
|---|---|---|
| **which** | 16 | set_tempo bpm 3 (es-010, it-002, nl-004); load_preset 3 (es-012, de-012, zh-CN-006); play_exercise 3 (es-023, ko-004, zh-CN-008); open_path 2 (fr-004, it-005); start_today 1 (es-003); click_subdivision 1 (de-011); follow_path 1 (pl-008); test_out 1 (zh-CN-002); load_jam 1 (zh-TW-007) |
| **none** | 10 | open_settings 2 (en-024 section devices, de-020 section coach); load_preset 1 (en-015); load_jam 1 (fr-006); set_tempo bpm 1 (fr-002); follow_path 1 (es-006); show_chord 1 (es-020); show_scale 1 (es-021); go_to 1 (de-001); play_exercise 1 (pl-006) |
| **yours** | 2 | set_tempo slower (en-059, the near-miss "dragging" wording); set_goal (vi-004) |
| **another tool** | 2 | start_today -> swap_part (de-003); follow_path -> start_today (zh-TW-005) |
| a card | 0 | |

By language (misses / calls): en 3/25, es 7/25, de 5/25, fr 3/9, it 2/9, zh-CN 3/9, pl 2/9, zh-TW 2/9,
nl 1/9, vi 1/9, ko 1/9, pt-BR / tr / ru / ja 0/9.

By argument shape: **a bare tempo number is the single biggest hole** (4 of the 12 set_tempo {bpm} items,
33%, all "put it at N" with no unit, said "which" or "none"; the 30 {direction} items lost 1); **load_preset / load_jam: 6 misses of 18 items (33%)**,
against 24 of 165 (15%) for every other tool; "which" for a name that resolves to exactly one title: 9
(play_exercise, open_path, follow_path, test_out, start_today, load_*).

### 1b. Chain rules-first: 39 misses (144/183); 14 from the rules, 25 from the model

The rules answered 81 of the 447 items, 54 of them right. On calls the rules cost 12 the model had right
and saved 3 the model had wrong (es-023 play_exercise, fr-004 and it-005 open_path: the model said
"which"): 153 - 12 + 3 = 144. Rules' wrong answers by expected kind: call -> make_exercise 4, call ->
which 7, call -> Path search 2, call -> yours 1, which -> make_exercise 1, card -> yours 9, card -> Path
search 3.

### 1c. Each item the rules got wrong, with a verdict (snapshot b5170fca, which the job ran)

Verdicts: **D** = a rules defect, **A** = the rules' answer is acceptable (the expectation is narrow),
**E** = the expectation is wrong, **O** = the chain's order, not a rule.

| id | typed | rules said | model alone | verdict |
|---|---|---|---|---|
| en-004 | make part 3 harder | make_exercise {shape: "part 3 harder"} | right | **D**, fixed on `coach` (1d) |
| en-014 | make the click play three to a beat | make_exercise {shape: …} | right | **D**, fixed on `coach` |
| de-015 | mach das theme auf ember | make_exercise {shape: …} | right | **D**, fixed on `coach` |
| pl-001 | zrob 20 minut dzis, mam czas | make_exercise {shape: …} | right | **D**, fixed on `coach` |
| de-025 (which) | mach akkorde auf | make_exercise {shape: "akkorde auf"} | right | **D**, fixed on `coach` |
| es-012 | carga el gallop | which (jam "gallop" / preset "gallop") | which (also wrong) | **D** (minor): `load` with no noun offers both tools without asking whether a jam or a preset has the name; only a preset does |
| nl-005 | laad blues in a ff | which (jam / preset) | right | **D**, same cause |
| ko-003 | slow rock 불러와 | which (jam / preset) | right | **D**, same cause |
| tr-003 | Gallop presetini yükle | which | right | **D**: the noun "preset" with a Turkish case suffix is not read as the noun, so the line falls to the no-noun branch |
| nl-006 | thema naar velvet graag | which | right | **D** (not traced to its line): a theme set by name should be one call; "naar" + a trailing "graag" likely misses `settingCall` |
| ko-006 | 언어 일본어로 바꿔줘 | which | right | **D** (not traced): a language named in the language's own word; c3d1 noted the eval host knows codes only, so the rules cannot resolve a language name |
| ja-003 | タッピング開いて | which (one choice) | right | **A**: deliberate (`pressNamedGo`, review t1b2b): with no spaces a navigating name is always a press. One press, never a wrong action |
| es-017 | encuentra mi limite en ráfagas que crecen | Path search passage | other args | **O**: the search answered an imperative with a tool's verb in it; the model was never asked |
| tr-002 | ikinci parçayı değiştir, daha zor bir şey olsun | Path search passage | right | **O**, same |
| vi-004 | ghi muc tieu: … | yours recording | yours (also wrong) | **D**: the vi never-list reads "ghi" (as in "ghi âm", record) alone; "ghi mục tiêu" is "write down a goal" |
| de-053, fr-019, it-018, pl-019, tr-019, ru-019, vi-019, zh-CN-019 (score_made_of) | "what is the score here made of", eight languages | yours grades / grading | right (8/8) | **D**: the never-list's "grades" words catch a question about how the pass mark is built. A question is not a request to change a grade |
| de-048 (why_not_counted feel) | bewertet die app eigentlich auch den groove | yours grading | right | **D**, same cause |
| en-050, pl-016, vi-018 (cards) | three Take questions | Path search passage | wrong card, other args, right | **O**: in the eval chain the search runs before the model; in the app the cards' matcher runs first but reads English only |

Net: 15 of the 27 wrong rule answers are rules defects (5 already fixed on `coach`), 5 are the chain's
order (search before the model), 1 is acceptable by design. None is an expectation error. None of the 27
was a wrong action (every one was a press, a refusal or a passage).

### 1d. The same model outputs through `coach`'s rules (51464eaf)

Job `coach-c3da-chain-coach` (1373): `node scripts/coach-eval.mjs chain --order rules-first --outcomes
heldout/alone/outcomes.jsonl` from this worktree; no model run, the held-out COUNT untouched. Output
`/tmp/coach-c3da/chain-on-coach/` (compare script `/tmp/coach-c3da/coachchain.mjs`).

**Right tool 148/183 (80.9%)** (snapshot 144, model alone 153), wrong actions 7 (unchanged), cards right
129, which asked 20/27. The rules answer 76 items (54 right). The five `make_exercise {shape: …}` answers
are gone (`coach`'s `make` route reads a recipe or nothing; the model now gets those lines, and was right on
all five). **Everything else in 1c is still there on `coach`**: the nine card questions -> yours, the
`load` with no noun -> which (es-012, nl-005, ko-003, tr-003), nl-006 and ko-006 -> which, vi-004 -> yours
recording, and the five Path search passages (es-017, tr-002, en-050, pl-016, vi-018). On calls the rules
still cost 8 the model had right and save 3.

### 1e. Validation misses (35 of 525)

| expected -> said | n |
|---|---|
| card why_not_counted with a `what` -> the same card, another `what` (pitch<->tone 4, feel/posture/fingering/handAttribution/muting/tension 6) | 10 |
| load_jam / load_preset -> none 5, which 1, open_path 1, other jam text 1 | 8 |
| set_setting coachVoice off -> yours 3, none 1, "on" 1 (intent `voice_off`) | 5 |
| which (ambiguous Step / Exercise name) -> the tool | 4 |
| card what_changed -> none | 2 |
| yours -> none 2, which 1 | 3 |
| none -> yours 2, which 1 (a "voice off" on a screen where it is withheld; two chat lines) | 3 |

By language: zh-TW 6, nl 4, pl 4, pt-BR / tr / ja / zh-CN 3, es / vi / ko 2, de / it / ru 1, en / fr 0.
The same three holes as the held-out set: thin argument shapes (card `what`, load_*, voice off), and
"which" decided without the titles the name matches.

## 2. The cards (model alone: 16 wrong, 15 uninvited)

**Wrong card (10)**: what_changed -> improving 2 and improving -> what_changed 1; where_slipped ->
what_changed 2 and -> early_or_late 1; score_made_of -> why_not_counted 2; improving -> early_or_late 1;
why_not_counted -> early_or_late 1. **Same card, wrong argument (6)**: why_not_counted `what` 5 (pitch ->
pickDirection, muting -> fingering, pickDirection -> feel / tension / none given), early_or_late premise
late -> early 1. **Card -> none (4)**: why_not_counted with a `what` (pickDirection 2, muting, tension).

**Uninvited (15)**: 12 of the 13 near-miss `none` items (vibrato, a bend reaching its note, loudness: things
nothing measures) got a card: why_not_counted {what: feel} 6, early_or_late {premise: early} 4 (ru, ja,
ko, zh-TW: the card the model falls back on in those scripts), improving 1, pass_mark_distance 1,
why_not_counted {what: tension} 1. The 3 "how far off was I" items (expected which) got pass_mark_distance:
that is a defensible answer (the card's short note is literally "how close to passing"); the set's
convention of `which` for them is narrow, worth the set's owner re-reading (E-candidate, not changed).

**Confusable by their notes alone** (the long notes the model saw):

| pair | why the notes do not separate them | the short note (now) |
|---|---|---|
| what_changed / improving | both are "is it getting better"; the long notes differ only in "the one before" vs "a named window … needs three" buried mid-sentence | "Take vs the one before" / "progress over Takes": one vs many, readable |
| where_slipped / early_or_late | where_slipped's note ends "which way the notes there leaned"; early_or_late's says "by bars of the tune": each note contains the other's key word | "where it slipped" / "early or late": separable |
| where_slipped / what_changed | "which bars were bad" read as a comparison; nothing in what_changed's note says it is not about bars | separable |
| score_made_of / why_not_counted {what} | "what it does not grade" vs "why something is not graded on this Exercise": the same clause | "what the pass mark checks" / "why it counted or not": still overlap on "is X graded" |
| why_not_counted's `what` values | the enum is ids only (pitch, tone, feel, posture, tension, fingering, handAttribution, muting, pickDirection) with no gloss; pitch/tone and feel/posture are near-synonyms in several languages | no per-value note at all |
| pass_mark_distance / "how far off" (which) | "each check against its pass mark" answers "how far off" | "how close to passing" makes it closer still |

What would tell them apart in the prompt: one line per `what` value with a gloss (pitch = the right
notes; tone = the sound's colour; feel = groove; posture / tension = the body), and a line that a card
answers only something the app measures (vibrato, bends, loudness: none). The 21-card catalogue on `coach`
adds Path / plan / theory cards whose shorts ("what it is for", "how to play it", "what to try next")
are a new confusable cluster with exercise_try vs where_slipped; the next held-out cards need items there.

## 3. What the misses say about the training data (counts only; no records written)

Training set: 9,975 records, 665 a language, every language identical in mix: call 3,030 (30%), none
2,370 (24%), card 1,995 (20%), which 1,365 (14%), yours 1,215 (12%). The held-out set: call 41%, card 36%,
none 12%, which 6%, yours 5%.

| shape | train records | held-out items | model-alone misses | verdict |
|---|---|---|---|---|
| load_preset + load_jam | **37** (0.4% of all, 1.2% of calls) | 18 calls (10%) | 6 (33% of them) + 8 of 35 val misses | most under-represented; the generator drops most (the fixed world has 3 names each) |
| set_tempo {bpm} | **74** (vs 390 set_tempo {direction}) | 12 (and 30 {direction}) | 4 (33%) | under-represented; worse, 218 `which` records are "play X at N", so a number next to nothing reads as "which" |
| set_setting coachVoice off | **6** (`voice_off`, vs voice_on 63) | 0 | 0 (5 val misses) | a generation bug or a runner refusal, not a choice |
| open_settings {section: devices} | **0** (c3d1: never generated; 161 `yours_devices`) | 1 | 1 | contradiction between data and set: decide which is right |
| why_not_counted {what} | **131** (11-24 per value) | ~20 | 5 wrong value + 4 none | ten values sharing 131 records; 10 of 35 val misses |
| none_unmeasured (vibrato, bends, loudness) | **87** (vs 1,995 cards) | 13 near-miss nones | 12 got a card | hard negatives too few against the card mass |
| early_or_late | 630 (32% of cards: plain, rushing, dragging intents) | 9% of card items | the fallback card in 4 scripts | over-represented |
| which | 1,365, of which play_exercise 433, open_step 304, find_edge 201 | 27 | 16 calls said which | `which` outnumbers the call for the same tool: play_exercise 433 vs 152, find_edge 201 vs 75, open_path 142 vs 75, follow_path 141 vs 75 |
| none (all) | 2,370; wrong-screen 686, withheld 315 | 54 | calls -> none 10 (5.5%) | mildly over-represented; the larger lean is to "which" |

**Does the lean go to "none"?** Less than to "which". Calls lost: 16 to which, 10 to none. The
over-represented class in the data is `which` (14% vs 6%), and the model learnt "a name → which" because
the prompt usually cannot tell it whether a name is ambiguous (the `named` titles line was on only 151 of
525 validation prompts). "none" is over-represented too (24% vs 12%), but its misses cluster where the
data has no positive examples (devices, bare bpm, load_*), which reads as "unknown shape → none", not as a
prior.

**Weakest languages.** Held-out (calls): es 7/25, de 5/25, fr 3/9, zh-CN 3/9. Validation: zh-TW 6/35, nl 4,
pl 4. The data is identical per language, so language is not a balance problem; the es / de misses are
the bare-number and load_* shapes, and the CJK misses are "which" for unique names (no spaces, no
named-titles line). With 9 calls a language, nothing below en / es / de is distinguishable from noise
(section 4).

## 4. Is the held-out set big enough to gate per language?

**Right tool >= 90%.** With n calls the gate allows floor(n / 10) misses: 9 calls -> 0 misses (8/9 is
88.9%, a fail), 25 -> 2, 50 -> 5, 100 -> 10. How often the gate is wrong (binomial, `binom.mjs`):

| calls a language | misses allowed | a 95% model fails | an 85% model passes |
|---|---|---|---|
| 9 | 0 | 37% | 23% |
| 25 (en/es/de today) | 2 | 13% | 25% |
| 50 | 5 | 4% | 22% |
| 100 | 10 | 1% | 10% |

So at 9 calls the per-language gate is a coin with a bias, and even 25 does not separate 85% from 95%.
**50 calls a language** is the least that keeps a good model from failing by chance (4%); **100** is what
it takes to also catch a bad one (10%).

**Wrong action < 2%.** n items allow ceil(0.02 n) - 1 wrong: 22 items -> 0 (one wrong action is 4.5%), 50
-> 0, 60 -> 1, 100 -> 1, 150 -> 2. A model whose true rate is 1% fails a 22-item language 20% of the time
and a 60-item one 12%. Per language this gate means "zero"; it is meaningful only pooled (447 items: a 1%
model fails 4%) or at 150+ a language.

**What it would take.** Twelve languages (fr, it, pt-BR, nl, pl, tr, ru, vi, ja, ko, zh-CN, zh-TW; the
brief said ten) have 22-23 items with 9 calls. To match en / es / de (60 items: 25 calls, 5 which, 4 yours,
6 none, 20 cards) each needs about **+38 items: +16 calls, +4 which, +3 yours, +3 none, +12 cards**,
~456 hand-written items in all (the c3b1a/c3b1b method: a writer and a reader per language, never shown
the command tables, the training wordings or the matcher). To reach a gate worth its name (50 calls a
language), all fifteen need **+25 calls (en/es/de) or +41 calls (the twelve)**: ~570 call items,
spread over the tools as the app weights them (set_tempo bpm and direction, set_setting, load_*,
open_settings sections, the which/unique-name pairs), plus cards for the 14 cards added since (Path,
plan, theory, help) and items for the new tool and the "advice" answer. As its own leg: ~1,000 items,
15 writers + 15 readers, the hashes recorded again. Until then: gate on the pooled numbers and report the
per-language rows as information, with the counts beside them.

## 5. Recommendations for the next training run (ordered)

1. **Put the title count in the prompt and key `which` on it.** Render the `named` line (the titles a
   name matches, from `namedTitles`) on every record that names something, so "which" is readable rather
   than guessed. Evidence: 16 of 30 call misses are "which" for a name with one title; 4 val misses the
   reverse; CJK worst.
2. **Rebalance `which` against the call for the same tool** to about 1:2 (today 433 which vs 152 calls for
   play_exercise, 201 vs 75 for find_edge), and bring `which` to ~8% of records (14% now, 6% in the set).
3. **Raise load_preset / load_jam from 37 to ~300 records** (20 a language), by widening the world's
   jam / preset names (c3d1: a host whose lists vary) so the runner accepts them; with "load X" with no
   noun as a call when only one list has the name. Evidence: 33% miss rate, 8 val misses.
4. **set_tempo {bpm} from 74 to ~450** (on par with {direction}), including the bare "put it at N" on
   screens where only tempo applies, and keep "N" -> `which` only where minutes also apply. Evidence:
   4 of the set's 12 {bpm} items missed (33%), against 1 of 30 {direction}.
5. **Hard negatives for "a card about something unmeasured"**: none_unmeasured from 87 to ~400
   (vibrato, bends, dynamics, slides, tone colour where not graded), in Session result screens, written in
   every script. Evidence: 12 of 13 near-miss nones got a card.
6. **why_not_counted `what`: ~40 records per value** (now 11-24), with the near-synonym pairs (pitch /
   tone, feel / posture / tension, fingering / handAttribution) as contrasting wordings, and a gloss per
   value in the card's argument note. Evidence: 9 held-out, 10 val misses.
7. **Fix the generator holes**: `voice_off` (6 records vs 63 for on), `open_settings` devices (0 records;
   decide with the set's owner whether "where are the audio device options" is a navigation or yours).
8. **Cards: rebalance and render the short notes.** early_or_late down from 32% of cards to its share
   (~1/21 of the cards once 21 are in), every card on `coach` given wordings (the 14 new ones have none),
   and pairs written against each other (what_changed vs improving, where_slipped vs early_or_late,
   score_made_of vs why_not_counted). Re-render with the short notes, as the app sends them.
9. **Mix closer to the set and to use**: calls 35%, cards 30%, none 15% (of which half hard negatives),
   which 8%, yours 7%, advice ~5%. The per-language balance stays (it is not where the misses are).
10. **Training recipe**: keep the full fine-tune at lr 1e-5; validation EM rose 84% -> 93% from epoch 1
    to 2 and the loss was still falling (0.0595 -> 0.0227), so run **3 epochs with an epoch-2 snapshot**
    and select on validation, with validation split by whole wordings per *argument shape* (not only per
    intent) so the val number sees new shapes.

**Rules or model first?** At 0.07 s a turn the model costs nothing a player notices, but the rules are the
only router with zero wrong actions and the only one on a build with no model. So fix the rules and keep
them first, with one change of order: the rules should answer only when they are sure (a call, a
"yours" that is a request), and hand the model what they cannot settle. Concretely: (a) the never-list
must not fire on a question about how grading works (9 card items lost; a "how / what / does … grade"
question goes to the cards), (b) `load` with no noun should resolve against the player's jam and preset
names before offering both, (c) the Turkish suffix and the vi "ghi" word, (d) a Path search passage
should not end the turn when a model is on (5 lost): search after the model, or when the model says
none. With those, rules-first would have lost 3 calls (nl-006, ko-006, ja-003) instead of 12 on this run
(8 on `coach` today) and kept the 3 it saved: 153 - 3 + 3 = 153, the model-alone number, with the rules'
safety kept. Fixing nl-006 / ko-006 too would put it at 155.
Model-first is not safer: the rules' "which" for a no-space navigating name (ja) is a deliberate guard the
model does not have.
