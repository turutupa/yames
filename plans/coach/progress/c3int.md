# Leg c3int: c3b1b + c3bp + c3d1 brought together before training

Worktree `/home/dgx-delgado/yames-coach-c3b1b`, branch `coach-c3b1b`. Logs `/tmp/coach-c3int/`.

## The merge

`coach` merged in (`143d4ee6`). `choicePrompt.ts` conflicted on the format lines only: c3bp's lines kept,
with c3b1b's `{"card":ID,"args":{...}}`; `cardLine(card, notes)` and the card loop sit on c3bp's `argText`.
`grammar.ts` merged clean (`cardsRule` on c3bp's `slotsOf` / `argsBody`). `choice-grammar.gbnf` regenerated
(`node scripts/coach-eval.mjs grammar --out src/coach/ask/choice-grammar.gbnf`).

## The prefix budget

`CHOICE_TOOLS_TOKENS` 1100 (tools and format, gated), `CHOICE_CARDS_TOKENS` 300 (the "Cards:" section,
gated), `CHOICE_PREFIX_TOKENS` = 1400 (the whole, gated). Measured (`estimateTokens`): **1337** in all, tools
and format 1090, the seven cards 245. Worst case of a turn against the 4,096 window: ~100 (Rust's system
text and ChatML) + 1400 prefix + 450 context (Rust refuses more) + ~150 question (DESIGN 5.5's figure; nothing
caps a typed question today) + 96 answer (prose; a choice is 48) = **~2,200**. The prefix is decoded once and
kept, so a turn pays only the context, the question and the answer.

More cards (c2b2a: Path, plan, theory): 55 tokens are left in the 300; a one-line card costs ~18 (40 of them
measure 706), so **about three more fit**. Past that, every card goes by its id and three words (~7 each,
about twenty-five in 300): a change to `cardLine` only, and the eval's prompt follows.

## The training data (`evals/coach/train/`, seed 1, `CARD_MIX`)

10,500 records (train 9,975, validation 525). Every language the same:

| per language | call | which | yours | none | card | total |
|---|---|---|---|---|---|---|
| all fifteen | 213 | 96 | 85 | 166 | 140 | 700 |

`none` = 69 not a request (now with `none_unmeasured`: vibrato, bends, dynamics, slides) + 48 wrong screen +
21 withheld + 28 card questions turned away (`card-near`: ~8 a Take running, ~6 ungraded, ~14 no Take).
Cards: ~28 with `premise` (ja 25, zh-CN 26, nl / zh-TW 29), ~14 with `what`. Validation: 35 a language, 7
of them cards (split by whole wordings, so validation's cards lean to two or three intents a language).
The non-card shares are c3d1's `DEFAULT_MIX` scaled by 0.76.

How a card answer is decided (`judgeCard`, code only): `checkCall(card, FACT_CARDS)` (a refused shape is
dropped), then `runFactCard`'s gate before any card body: a Take running -> `none`; an ungraded player ->
`none`; the card when its `when` holds, a Take of this Exercise is there, or it reads the Exercise
(`score_made_of`, `why_not_counted` with a `what`); otherwise `none` (no Take). The world keeps no Takes, so
`cardContext` gives the Session's result screen a measured Take of the Exercise on screen (the held-out
set's convention), and sets `run.ungraded` to the runner's `null`: the eval world's `contextFor` writes
`false`, which `ungradedPlayer` reads as ungraded (not changed there: owed, see below).

Arguments come from the intent, never from the text: `card_rushing` -> `premise: early`, `card_dragging` ->
`premise: late`, `card_metric_graded` -> `what: <metric>` (slot `{metric}` from `vocab.metric`). The
wordings (8 sonnet helpers, never shown the held-out set) moved the directional `card_early_or_late`
wordings into the two new intents and wrote the rest.

Leakage: the generator drops texts within edit distance 3 of a held-out text (164 dropped: zh-CN 59, es 17,
en 14, ko 13, ja 12, the rest 0-9). `trainData.test.ts` finds **0 leaks** and the held-out hashes equal the
README's. The renderer sets `ChoiceFacts.named = namedTitles(text, titles, commandTableFor(lang))` (151 of
525 validation prompts carry the line).

## Commands for the training leg

```sh
node scripts/coach-train.mjs render --in evals/coach/train/train.jsonl --out <dir>/train.rendered.jsonl --check
node scripts/coach-train.mjs render --in evals/coach/train/validation.jsonl --out <dir>/validation.rendered.jsonl --check
```

Both ran here (`coach-c3int-render-train`, `-render-val`): 9,975 and 525 rendered, 0 failing the grammar
or `checkCall` (cards checked against `FACT_CARDS`). Rendered copies in `/tmp/coach-c3int/`.

## Gates

Logs `/home/dgx-delgado/scratch/jobq/<id>-coach-c3int-*.log`.

- tsc: pass (`coach-c3int-tsc-2`, 841).
- vitest `src/coach/train src/coach/ask`: 1508 passed (`-vt-train-2`, 834).
- full `npm run test` (842): 50111 passed, 1 failed + the known `TabStage.render.test.tsx`. The failure,
  `useSessionRun.loop.test.tsx` "with no argument it is today's", is not touched here and passes alone
  (`-vt-loop`, 854).
- build: pass (843).
- `npm run test:rust` (844): 1275 passed, 2 failed; `the_generated_choice_grammar_passes_the_precheck` ok.
  The two failures are TTS timing tests (`interruption_returns_promptly`,
  `a_line_cut_by_a_device_change_comes_back_interrupted`) under load; no Rust changed; the TTS playback
  tests re-run: 9 passed (`-rust-tts`, 864).
- render `--check`: train 9,975 / validation 525, 0 failing (833, 832).

## Owed

- `evalWorld.contextFor` writes `run.ungraded: false` (the runner's "graded" is `null`): `ungradedPlayer`
  reads every eval Session as ungraded. Harmless for the tools today; any eval code that runs a card's gate
  on `contextFor` will refuse. A one-line fix with a hash-neutral eval re-run.
- No second reader of the new card wordings (one helper per language pair wrote and self-checked them).
- One helper (de / nl) ran a `node -e` JSON check, against the rules.
