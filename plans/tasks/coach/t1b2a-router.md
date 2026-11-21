# Leg t1b2a: the typed-command router, in English, as pure code

Worktree `/home/dgx-delgado/yames-coach-t1b2a`, branch `coach-t1b2a`. Logs under `/tmp/coach-t1b2a/`.

The first half of `t1b2-typed-commands.md` (read it: its rules are yours). Split by session 3 because
every leg with UI, fifteen locales and layout scenes ran past 300k tokens. This half is pure
TypeScript and tests: no UI, no locale file other than English, no layout scene. t1b2b (next) writes
the other fourteen verb tables and wires the router into Ask's text box.

Read: `plans/tasks/coach/BRIEF.md` ("Owner decisions"); `plans/coach/progress/t1a1.md`, `t1a2.md`
(the tools, the runner, resolution) and `t1b1.md` (`runAskCall`, `askYours`, the never-list: you
return what those take, you do not call them). Design, read-only:
`/home/dgx-delgado/yames-coach-design-out/TOOLS.md` 2.1 (the "typed command" row) and 2.5,
`DESIGN.md` 5.3 (the order of attempts).

## What to build

1. **`src/coach/ask/router.ts`**: `routeCommand(text, table, facts)` → one of
   `{ kind: "call", call }` (a tool call the runner takes as it is), `{ kind: "which", choices }`
   (two or more calls, for "Which one?"), `{ kind: "yours", item }` (a never-list item, for t1b1's
   "that one is yours") or `{ kind: "none" }`. Pure: no React, no store, no i18n runtime; `facts` is
   the small plain object it needs (the screen, whether a tempo can be set there, whether minutes
   can, whether a Session is on a ready or result screen): define it, and a function that builds it
   from what `askTools.ts` already has, so t1b2b's wiring is one call.
2. **The table's shape** (`src/coach/ask/commandTable.ts`): the data a language supplies: the six
   verbs (open / go, start / play, slower, faster, loop, show), the nouns for the screens and the
   Settings sections, the units ("bpm", "minutes", "bar", "step"), the never-list's words, and a
   flag for languages written without spaces (the router then matches by contained words). Typed,
   with a validator a test runs over a table (no empty list, no word in two verbs, no never-list
   word that is also a verb). **The English table** in `src/locales/en/askCommands.json` (or
   beside the router if a JSON namespace would drag `i18n.locales.test.ts` in: say which you chose
   and why; t1b2b must be able to add fourteen files of the same shape and one test that walks them).
3. **Rules** (all from the parent brief; each one a test):
   - a bare number: a tempo where a tempo can be set, minutes on Today where that is the only number
     that makes sense, otherwise `which` with both; never a guess;
   - names go to the tool as `query`; the router does not resolve them;
   - nothing on the never-list ever becomes a call: those words return `yours`;
   - a sentence that is not a command returns `none`. A question ("why was I late?", "what is a
     pentatonic?", "can you open paths for me later?") is not a command. **A wrong action is the
     failure that matters**: write the near-miss table first (at least forty English lines that
     contain a verb or a number and must return `none` or `yours`), then the commands.
   - nothing routes to a tool whose `when(ctx)` is false: the runner refuses those anyway, but the
     router should not offer `which` between a possible and an impossible call.
4. **Every tool reachable**: a test walks the registry and proves each player tool has at least one
   English command that routes to it, or is listed with its reason as chip-only.
5. **For c3b, recorded and fixed here if it is small**: `progress/t1b1.md`, "For leg t1b2 / c3b": a
   chip's words are stored as the player's turn and `askPrompt` shows a model a question with no
   reply. Make `askPrompt` drop a `user` turn that a `tool` turn answered (with a test). If it is not
   small, write what you found and leave it.

## Not yours

Wiring into `AskPanel` (t1b2b). The other fourteen tables (t1b2b). The panel's drawing (t1b1). Fact
cards (c2b1a runs beside you and owns `src/coach/ask/intents.ts`, `cards.ts`, `suggest.ts` and the
matcher from typed English to a card: you own `router.ts` and `commandTable.ts`; neither of you edits
`AskPanel.tsx` or `askTools.ts` beyond an exported helper, and if you must, say so in the report).

## Gates

tsc, vitest, build. No layout run (nothing visible changes).

## Report

As the rules block's "The end of the leg", with the command table (what was typed → the result), the
near-miss table, the chip-only tools and why, and what t1b2b needs to know (the table's file shape,
the one call that wires it).
