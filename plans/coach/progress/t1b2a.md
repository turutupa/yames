# Leg t1b2a: the typed-command router, in English, as pure code

Branch `coach-t1b2a` (from `coach` at `52eff613`). No Rust, no UI, no locale file, no layout run (nothing
visible changed: nobody calls the router yet).

## What landed

| File | What |
|---|---|
| `src/coach/ask/router.ts` (new) | `routeCommand(text, table, facts)` → `call` / `which` / `yours` / `none` (`none.notHere?`: a command whose tool's `when` says no here); `CommandFacts`; `commandFacts(ctx, view?, registry?)`. Pure: imports the registry, the block spec and the command table, nothing else at run time. |
| `src/coach/ask/commandTable.ts` (new) | `CommandTable` (the shape), `VERB_IDS` etc., `validateCommandTable(table)` (problems as sentences), `COMMAND_TABLES` (every `./commands/*.json`, by glob), `commandTableFor(lng)` (exact, then base language, else null: never English under another language). |
| `src/coach/ask/commands/en.json` (new) | The English table. |
| `src/coach/ask/router.test.ts` (new) | Near-miss table (71 none + 18 yours lines, on ten screens), 61 commands, bare number, `when`, every tool reachable, the validator, a no-spaces table, purity. |
| `src/containers/coach/askTools.ts` | One exported helper, `askCommandFacts()` (the facts from the registered host and context). Nothing else. |
| `src/containers/coach/askContext.ts` | `askPrompt` drops a `user` turn that a `tool` turn answered (dividers between them skipped). `askContext.test.ts` (new). |

## Decisions and why

- **The table lives beside the router, not in `src/locales/`.** i18next's loader globs every
  `src/locales/*/*.json` as a namespace; `i18n.locales.test.ts` would then demand it in all fifteen
  languages in this leg, and `i18n.coverage.test.ts` would read every word as an unused English key.
  `src/coach/ask/commands/<lng>.json`, named by locale code; `COMMAND_TABLES` picks a new file up with no
  code change, and `router.test.ts` "every table there is passes the validator" already walks them all.
- **Order of checks** (the file's head): a question (a `?`, or a first word from `questions`) → none; any
  `notCommand` word or phrase anywhere ("I", "it", "later", "not", "than", "for me", "back", "over") →
  none; any never-list phrase anywhere → `yours`; then the verb (first word; anywhere when `noSpaces`),
  whose rest must be used up exactly. A word left over is `none`.
- **Names are `query` as typed** (lower-cased, leading articles dropped): at most six words, no number, no
  unit, not a screen's name, not containing a session word, not starting with a connector.
- **A tool that cannot run here is not routed**: one call → `{ kind: "none", notHere: call }` (t1b2b may
  hand `notHere` to the runner, which refuses with "Not on this screen" and changes nothing, or fall
  through); several → only the possible ones are offered; one left → that call.
- **Bare number**: tempo when `set_tempo` can run and 20 ≤ n ≤ 300; minutes when the view is Today,
  `set_minutes` can run and 1 ≤ n ≤ 60; both → `which`; else none. With today's tools "both" never
  happens (no tempo on Today); the branch is tested with constructed facts.
- **Bare "start" / "play"** is `start_today` only on Today, Paths and Progress. Elsewhere (the Metronome,
  a Session) it is none: there is no tool for "start the click" or "start the Take".
- **`which` labels**: tempo reuses `coachTools.choice.rung`; the rest are new keys t1b2b must add in
  fifteen locales: `coachTools.command.minutes {minutes}`, `.jam {jam}`, `.preset {preset}`,
  `.swapHarder / .swapDifferent / .swapStyle {part}`, `.other {tool}`.

## Chip-only tools

None. Every player tool in the registry has an English command (`CHIP_ONLY` in `router.test.ts` is empty;
a new tool fails the walk until it gets a command or a reasoned line there). `loop_bars`, `make_exercise`,
`explain_screen` and `set_goal` are reachable but still answer "not yet" from the runner.

## For t1b2b

- The wiring is one call: `routeCommand(text, commandTableFor(i18n.language), askCommandFacts())`
  (skip the router when either is null), then `call` → `runAskCall(call, text)`; `which` → a refusal turn
  (`coachTools.why.which`, the choices); `yours` → `askYours(item, text)`; `none` → the next way of answering.
- A language is a file `src/coach/ask/commands/<code>.json` of `en.json`'s shape. `noSpaces: true` for
  ja, zh-CN, zh-TW, ko: the verb is found anywhere, phrases are matched by contained characters, particles
  in `fillers` are dropped at both ends of what is left (tested with a small Japanese table in the test).
- The `which` label keys above, in fifteen locales.

## Gates (logs in /tmp/coach-t1b2a/)

- `tsc --noEmit`: pass (`tsc.log`).
- vitest, full: 26951 passed in 414 files; the one file that does not load is the known
  `TabStage.render.test.tsx` (`Denied ID …Bravura.woff2`, the linked `node_modules`) (`vitest.log`). The
  leg's own files: 106 passed (`vt-router.log`).
- `npm run build`: pass (`build.log`).
- No layout run: nothing visible changed.

## Open points

- `askPrompt` now drops a player's turn that a tool answered; the model does not get the tool's receipt
  in words instead. c3b decides whether it should.
- Wording a player may type that is still `none` today ("show me my progress", "play some music" goes
  to `play_exercise` and is refused as not found). The near-miss table is the place to add a line when
  one turns up.
