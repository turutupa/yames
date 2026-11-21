# Leg c3bp: the choice prompt's "by a little" fixes, re-measured

Branch `coach-c3bp` (from `coach`). Logs `/tmp/coach-c3bp/`; runs, scripts and raw outputs in
`/home/dgx-delgado/scratch/yames-c3bp-results/` (the old runs in `…/yames-c3b-results/` are untouched).
Table: `evals/coach/results/2026-11-20-prompt-tables.md`. The held-out set is unchanged (hashes pass).

## What landed

| File | What |
|---|---|
| `src/coach/ask/choicePrompt.ts` | (1) every enum value listed: up to 13 where the argument is, a longer set once after the tools as `ROOT=…` / `SCALE=…` (the argument says `=ROOT`); `chord=ROOT+suffix` (the form, no example). (2) the format line says "an optional arg? only if the player said it"; `set_tempo(bpm# or direction=slower\|faster, at?#)`. (3) `set_setting(key, value, at?)` followed by a `key=value:` line (`SETTING_VALUES`: theme ids, locale codes, neck\|runway\|tab, 0..150\|auto, on\|off), overridable with `opts.settingValues`. (4) `ChoiceFacts.named` + `namedTitles(question, titles, table?)` -> a `Paths these words name: A; B` context line right after `Tools here`; the "which" line now says "as a name that fits two titles". `CHOICE_PREFIX_TOKENS` 900 -> 1100. |
| `src/coach/ask/grammar.ts` | `ONE_OF` (`set_tempo`: `bpm` \| `direction`, exactly one, then `at?`): one slot of alternatives. Every other tool's rule is byte-identical (the fixture diff is the `t-set-tempo` line only). |
| `src/coach/ask/evalRun.ts` | `askRequestFor`'s context carries `named` (titles of the item's language, its command table). |
| `src/coach/tools/resolve.ts` | `UNSPACED` exported (no behaviour change). |
| `src/coach/ask/choice-grammar.gbnf` | regenerated (set_tempo). |

## Design notes

- **Exclusive bpm / direction** follows the runner exactly: `set_tempo.propose` refuses both and neither
  (`refused.shape`); the grammar now cannot write either, and `grammar.test.ts` runs the runner on the same
  four shapes. `at` stays (the undo's guard; the runner takes it).
- **set_setting's value stays free text in the grammar**: the runner also takes a theme's or a language's
  display name ("Deutsch") and partial matches (`titleMatch`), so an enum there would refuse what it accepts.
  The values are in the prompt only.
- **namedTitles** is the router's matcher (`titleMatch`) applied to each word of 4+ letters (each 2-character
  run in a script without spaces), minus the language's command words (verbs, connectors, units, ordinals,
  swap choices, on/off, polite / filler / question / not-a-command words: "swap the first one" names no
  "First Chords…"). The titles fitting the most words, at most `MAX_CHOICES` (6). Paths only, not Steps.

## Revision 2 (the head)

Revision 1's measurement named three general defects; revision 2 (commit `23e203d0`) addresses them:
the undo's guards (`isUndoGuard`: an optional arg whose note says "undo's guard": set_tempo / set_setting /
click_subdivision `at`) are no longer shown (the models filled them with the asked number); the which line
says "as when 'Paths these words name' lists two or more"; the none line "and for a tool that is not in
'Tools here'". Prefix 1072 est. tokens. Two measured revisions in all, each measured once.

## Numbers (chain rules-first, 252 items; full tables in `evals/coach/results/2026-11-20-prompt-tables.md`)

| | base (coach, old prompt) | r1 (`5e564a4c`) | r2 (`23e203d0`, head) |
|---|---|---|---|
| 4B right tool / right args / wrong action | 128 / 97 / 28 (11.1%) | 137 / 114 / 31 (12.3%) | 136 / 115 / 41 (16.3%) |
| 8B right tool / right args / wrong action | 134 / 117 / 19 (7.5%) | 142 / 131 / 26 (10.3%) | 146 / 134 / 39 (15.5%) |

Arguments fixed as predicted; wrong actions rose, because a well-formed call now runs where a malformed one
was refused: the remaining wrong actions are decisions (which / yours / none / another tool). r2 is worse
than r1 on wrong actions (it removed the last accidental refusals; its which / none lines did not make
either model ask). For the stock models in the app, the old prompt has the fewest wrong actions; for
c3d1's training prompts r2 is the well-formed one. The orchestrator picks; reverting r2 is one commit.

Owed (a third revision is not this leg's): set_tempo's "bpm# or direction" makes the models pick the
direction when the player gave a number ("sube a 120" -> faster); the signature could say "bpm# when a
number is said". Not measured.

## Gates

tsc pass (`coach-c3bp-tsc2`); vitest src/coach/ask + src/coach/tools 1329 passed (`coach-c3bp-vt3`); full
vitest 49237 passed, the one failing file the known `TabStage.render.test.tsx` (`coach-c3bp-vitest`,
`/home/dgx-delgado/scratch/jobq/734-coach-c3bp-vitest.log`); build pass (`coach-c3bp-build`); the Rust
precheck of the regenerated fixture `the_generated_choice_grammar_passes_the_precheck` pass
(`coach-c3bp-rust-precheck`; no Rust source changed, so not the whole `test:rust`).

## For leg c3d1 (renders prompts with this file)

`choicePrefix(catalogue, cards, opts)`: same positional signature; `opts` gains `settingValues?` (default
`SETTING_VALUES`). Its default OUTPUT changed (that is the fix). `choiceContext(facts)`: same signature;
`ChoiceFacts` gains optional `named`; to render what the app/eval shows, set
`named: namedTitles(text, pathTitlesInLanguage, commandTableFor(lang))`. With `named` absent or empty the
context is byte-identical to before.
