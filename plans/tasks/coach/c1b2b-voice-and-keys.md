# Leg c1b2b: the voice at boundaries, and the three coach actions

Worktree `/home/dgx-delgado/yames-coach-c1b2b`, branch `coach-c1b2b`. Logs under `/tmp/coach-c1b2b/`.

The second half of what session 1 briefed as `c1b2-today-speech-keys.md`. **Read that file first**: its
reading list (BRIEF, `progress/c1b1.md`, DESIGN section 8's Voice row and 5.1's last table row) is
yours. Also `plans/coach/progress/c4c.md` ("What landed", the `SessionCoach.tsx` row: the cue is now the
ready note's headline and the Take's order) and `c0.md` (the bus: Session events are published before
React commits, subscribers read the payload).

## Yours

Items 2 and 3 of `c1b2-today-speech-keys.md`, whole, and item 4 for their strings:

- **The voice at boundaries**: only with Voice on (`coachVoiceMode`), only at boundaries: the order on
  a ready screen (the cue), the finding on a result. Never in a count-in or a Take; Start stops it at
  once. It speaks the same translated sentence the screen shows (no second wording), through the speech
  path that exists. **No Rust change**; if one seems needed, stop and report. Prefer a subscriber on the
  coach bus outside `SessionView`. Tests: nothing is spoken between `takeStarted` and the result; a
  Start during speech cuts it; Voice off speaks nothing; "Go again" (which skips the ready screen) does
  not speak the order over the count-in.
- **Three actions**, bindable to any key or MIDI button, unbound by default: `ask-explain-last`,
  `ask-what-next`, `accept-suggestion`, as the leg file describes. No panel opens. All three do nothing
  while a Take runs. Registered in `hotkeys.ts` and the action dispatcher with their scopes
  (`hotkeys.scopes.test`), listed in Settings' bindings like the other actions.

Nothing here may cost the click: no speech starts while anything is sounding, and nothing subscribes to
the beat.

## Not yours

Today's line (leg c1b2a, which may be running beside you: it owns `TodayView.tsx`). The tools' coach
(c2a2, merged). Any model.

## Hunks you own in shared files

`hotkeys.ts`, the action dispatcher, the Settings bindings list, the speech subscriber, the locale
files (your keys only, in one block per file so a merge is mechanical). In `SessionView.tsx` only what
the actions cannot do from outside it.

## Gates

tsc, vitest, build; `hotkeys.scopes.test`; the parity `localeKeys` and `surface` suites (the manifest if
a settings key is added: then say so in a "diff for review" paragraph); layout by name:
`settings.spec.ts`, `coach-session.spec.ts`, `smooth.spec.ts` (nothing new commits during a Take). The
full layout suite is the orchestrator's, after 8 PM Pacific on a weekday (run it yourself if your gates
start after 8 PM).

## Report

As the rules block's "The end of the leg", with what each action says in three states (no Take yet,
after a slipped Take, after a pass) and the list of every place speech can start, with the test that
guards each.
