# Leg c3b1b: the card items of the held-out tool test set, and the harness reading the cards

Branch `coach-c3b1b` (from `coach`). Logs in `/tmp/coach-c3b1b/`. No UI, no strings, no Rust source.

## What landed

| File | What |
|---|---|
| `evals/coach/tools/<lng>.jsonl` | 195 card-leg items appended (en / es / de 24 each: 20 card, 2 none, 1 call, 1 which; it, pt-BR, nl, pl, tr, ja, ko, zh-CN, zh-TW 10 each: 8 card, 1 none, 1 call; fr, ru, vi 11 each: 9 card). 447 items in all. |
| `evals/coach/README.md` | The card items, the rule baseline on them, the new hashes. No item quoted. |
| `src/coach/ask/evalCards.ts` | `EVAL_CARDS` = `FACT_CARDS` as plain data (id, note, `args`). A card added to `FACT_CARDS` reaches the validator, the grammar and the prompt with no edit here. |
| `src/coach/ask/grammar.ts` | New `cardsRule`: each card's own arguments typed as a tool's (`argsBody`); a card with no declared `args` keeps the old generic argument. One call site in `choiceGrammar`. |
| `src/coach/ask/choicePrompt.ts` | New `cardLine`: `id(args): note to the first stop`, `take` (one value) not shown. One call site in `choicePrefix`; the format line says `{"card":ID,"args":{...}}`. |
| `src/coach/ask/evalWorld.ts` | `judgeExpected`: a card's args through `checkCall(…, FACT_CARDS)`; a Session's Step must exist. |
| `src/coach/ask/evalRun.ts` | `rulesCard` (the matcher between router and search, as `typedCardAnswerer` gates it); a card is right by id + args (`cardArgsKey`); `Summary.cardsWrong`, `cardsUninvited`; two columns in the table. |
| `scripts/coach-eval.mjs` | The rules note and the console line name the cards. |
| `src/coach/ask/choice-grammar.gbnf` | Regenerated (typed card rules). |
| Tests | full-mix test on (`evalSet.test.ts`); `grammar.test.ts` (typed card args); `choicePrompt.test.ts` (card lines; real cards gated at 900, 40 cards reported); `evalRun.test.ts` (the cards in the rule chain, card scoring). |

## Rule baseline (`/tmp/coach-c3b1b/rules-2/`)

Card items: right card 7/159 (en 7/20, every other language 0: the matcher is English only), wrong card 0,
no card 152; cards given where none expected 0. Whole set 447: right 108, right tool 25/183, wrong actions 0,
asked 11/27, yours 11/24, none 54/54.

## For the measurement leg

- The world keeps no Takes: "a last Take" is the Session's `result` phase (the context says
  `Session: result`). The model sees no measured numbers; it only chooses.
- Score cards with the args (`premise`, `what`): a bare `why_not_counted` on a "is my muting graded"
  item is wrong.
- The README is read by c3d: it quotes no item. Keep it that way.

## Open: the prefix budget

With the seven cards the choice prefix is 1113 estimated tokens against DESIGN 5.5's 900 (tools and
format ~870, cards ~250). Rust does not cap it. `choicePrompt.test.ts` now gates the tools part at 900 and
the cards' section at 300, and prints the total. Decision owed: raise the budget, shorten the tool lines
(c3bp is editing them), or send cards by name only.

## Gates

- tsc: pass (`coach-c3b1b-tsc`, `-tsc-2`). Eval vitest files (6): 897 passed (`coach-c3b1b-vt-2`).
- build: pass (`coach-c3b1b-build`).
- full vitest: 49998 passed, 1 failed + the known `TabStage.render.test.tsx`; the failure
  (`SupportSection.test.tsx`, export via save dialog) passes alone (`coach-c3b1b-vt-support`).
  `/tmp/coach-c3b1b/vitest.log`.
- `npm run test:rust`: 1274 passed, 3 failed, all wall-clock under load (timing sixteenths, kit decode
  linearity, harmony worker window wait); the three and the grammar precheck re-run: 4 passed
  (`coach-c3b1b-rust-2`). `/tmp/coach-c3b1b/rust.log`.
