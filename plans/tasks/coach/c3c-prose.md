# Leg c3c: prose: labelled general advice, English first; no digit and no note name, by construction

Worktree `/home/dgx-delgado/yames-coach-c3c`, branch `coach-c3c`. Logs under `/tmp/coach-c3c/`.
A small leg: aim for under 170k tokens.

PLAN's c3c. **Needs c3b2a merged** (`src/coach/ask/model.ts`, the chain, the speed gate); after c3b2b
or beside it (c3b2b changes one data line in `model.ts`: merge that first if both are open). It edits
`model.ts`, `grammar.ts` and Ask's answer rendering: not beside pol2, t2c or chip1.

Read: `plans/coach/progress/c3a.md` (`mode: "prose"`: 96 tokens, temperature 0.7, top-p 0.9; only
`answered` is an answer), `c3b1.md`, `c3b2a.md`, `c3b2b.md`. Code: `src/coach/rephraseGuard.ts`
(`keepsFacts`, the precedent: a deterministic check after the model speaks), `src/paths/honesty.ts`
(`bannedClaimsIn(text, isCoach)`), `src/coach/blocks/resolve.ts` (the `general` source) and the
existing label `coachBlocks.source.general` ("General advice · not from your playing", already in all
fifteen locales, with the hollow-circle glyph in `CoachBlocks.tsx`). Design, read-only: `DESIGN.md`
5.3 (engine 4b, the topic table's last row), 5.4 (guardrails 1, 2, 4, 6), 5.5, 12 q3 (decided: prose
labelled general advice, English first). `NEXT-LEGS-s4b.md` judgement calls 10 to 13.

## The owner's rules where they bite here

- **The model states no fact about the player.** No digit, no note name, in any prose shown: a
  structural check on the output in code, not a list of phrases in the prompt.
- **The app labels the source, never the model**: prose is a text block with `source: { kind:
  "general" }`; a text block without a source is not rendered (guardrail 2, `resolve.ts`).
- "The pass mark", never "the bar"; nothing about tuning (owner decision 9: no "check your tuning"
  until the app has a tuner); nothing during a Take (c3b2a's cancel covers this call too).
- English only: in every other locale nothing is generated; the label key exists there already and the
  turn ends on the rule-made answer (the passage or the plain statement).

## What to build

1. **When prose is written** (judgement call 10): the choice grammar gains one alternative,
   `{"answer":"advice"}` ("a general technique or practice question no card or tool answers"), in
   `choiceGrammar` and its description in `choicePrompt`. On it, when the UI language is English and
   time is left in the turn's 8 s, the app makes **one** prose call (`mode: "prose"`, `deadlineMs` =
   what remains). "One model call a turn" (DESIGN 5.5) becomes "one choice and at most one prose call,
   inside the same 8 s"; say so in the progress file. The grammar fixture's Rust test re-runs.
2. **The prose prompt**, `src/coach/ask/prosePrompt.ts` (pure): a prefix byte-identical turn to turn
   (a test) asking for at most three sentences, the answer first, guitar and practice only, no numbers,
   no note or chord names, nothing about the player's playing; the question and the passage search
   found (if any) in `context`. Budget test: prefix ≤ 900, context ≤ 450, output 96.
3. **The guard**, `src/coach/proseGuard.ts` (new; `rephraseGuard.ts` stays as it is): `proseOk(text)`
   → `{ ok: true, text } | { ok: false, why }`. Rejects: any `\p{Nd}` digit; a note or chord name (a
   one-letter word A to G in either case, alone or with `#`, `♯`, `b`, `♭` or a chord quality, except
   the article "a" / "A" before a lowercase word that is not a musical word such as "minor", "major",
   "flat", "sharp", "string", "chord", "note"); `bannedClaimsIn(text, true)`; "the bar" meaning the
   threshold; any form of "tune" / "tuning"; an empty text. Keeps at most the first three whole
   sentences. A rejected or `truncated` prose adds nothing: the rule-made answer stands. False
   positives are acceptable, false negatives are not: table tests with at least forty cases each way,
   written by hand (letters inside words, "E string", "a C", "Am7", "A minor", "a good grip").
4. **Pain is answered by rule** (guardrail 4): a typed English question naming pain ("pain", "hurts",
   "ache", "numb", "tingling", and their forms) never reaches the model; the answer is the fixed
   sentence "Stop, rest, and see someone who can look at it." with the `general` label. Tiredness is
   not pain ("tired", "sore" after a long Session go to the model as advice). Tests both ways.
5. **Rendering**: the prose is one text block under the rule-made answer with its label, in the same
   place c3b2a adds the model's choice; "Looking for more in my own words… Stop" covers both calls.
6. **A small prose set**, `evals/coach/prose/en.jsonl`: forty technique and practice questions written
   by a sonnet helper and re-read by a second one (never from the app's templates), held out like the
   tool set (hashes). A harness mode (`--mode prose`) that runs them and reports, per model: answered,
   rejected by the guard (by reason), truncated, timed out, median and slowest-tenth time. One queue
   job with the largest model on the machine (Qwen3 4B if c3b2b's files are there, else the 0.6B as a
   pipe check, said so). The gate (DESIGN C3c): **zero guard violations in what would be shown**, true
   by construction; the report gives the rejection rate, which says whether prose is worth showing.
7. **Strings**: none new expected (the label exists); any added lands in fifteen locales.

## Not yours

Prose in other languages (each needs its own lint and review first, DESIGN 5.5). Rephrasing the line
or the note (never). The choice's measurements (c3b2b). The worker.

## Gates

tsc, vitest, build; `npm run test:rust` (the grammar fixture with the new alternative); layout by name:
`ask.spec.ts`, `ask-tools.spec.ts`, `smooth.spec.ts`, one scene of a prose answer with its label at
1440 and on a phone (pictures only when `YAMES_SHOT_DIR` is set). No probe: no new compute beyond
c3b2a's turn and its 8 s.

## Report

As the rules block's "The end of the leg": the guard's cases, the pain list, the prose set's run, and
a "diff for review" paragraph for `model.ts`, `grammar.ts` and the Ask rendering.
