# Leg c0: plumbing (the bus, the lazy context, app-side sources)

Worktree `/home/dgx-delgado/yames-coach-c0`, branch `coach-c0`. Logs under `/tmp/coach-c0/`.
Read `plans/tasks/coach/BRIEF.md` first. Design: DESIGN.md sections 9.1, 9.2, 9.3 (the first two rows of
the table) and the C0 row of section 10. No visible change in the app; no new strings.

## What to build

1. **`src/coach/bus.ts`**: a module-level emitter for `CoachEvent` (the union in DESIGN 9.2), with
   `publish(event)`, `subscribe(listener)` and a snapshot shaped for `useSyncExternalStore` (the last
   event of each kind is enough; say what you chose). No React state, no timers, nothing that allocates
   per beat. Publishing with no subscriber costs nothing measurable.
2. **Publish lines.** One line beside each dispatch that already exists, for the Session events only:
   `stepReady`, `takeStarted`, `takeResult { outcome, review }`, `timedEnded`, `sessionRecap` in
   `src/containers/session/hooks/useSessionRun.ts`. `takeResult` carries the whole review, findings
   included (today the Session reads only `review.segment` and drops the rest: that is the point). The
   milestone events (`cleanTempoMoved`, `stepOpened`, `levelDone`, `pathDone`), `jamStopped`,
   `songPassReviewed`, `toolRunEnded` and `appOpened` are **typed in the union now and published by later
   legs**: do not touch `useJamSession.ts`, `useSongAttempt.ts`, `useSegmentCoach.ts` or `MainWindow.tsx`.
3. **`src/coach/context.ts`**: the `CoachContext` type as in DESIGN 9.1 (fix names against the real
   types; where a field's source does not exist yet, leave the field optional and say so),
   `buildCoachContext(latest: CoachSources)` which reads from a `latest` object of refs / getters and is
   never called in a render, and `contextForModel(ctx, maxTokens = 450)` with a test that holds the cap
   (count tokens with a stated approximation, e.g. characters / 3.5, and keep the estimate conservative).
   `brain` reflects the model selector another leg is building: type it as
   `{ llmCompiled: boolean; choice: string; resident: boolean; fastEnough: boolean }` and fill it from
   whatever the caller passes in; do not import the loader.
4. **`ResolvedBlock.source`** in `src/coach/blocks/resolve.ts`, drawn by `CoachBlocks.tsx` as its own line
   under the text it covers: an icon and words ("Measured · Take 2", "From the Path · Step 2", "Worked out
   by the app", "General advice · not from your playing"), per DESIGN 3.6. App-side only: the model's
   catalogue (`blocks/spec.ts`, v1) and the generated grammar must not change (`spec.test` unchanged).
   `songs/verdict.ts` sets it to measured. The source words are the one place this leg adds strings:
   put them where the blocks' other strings live, in all fifteen locales.

## Hunks you own in shared files

`useSessionRun.ts`: the publish lines only, each a single added line next to an existing dispatch. Another
leg (c1a) adds fields to what is saved with a Take in the same file: keep your hunks minimal so the two
merge.

## Gates

tsc, vitest (new tests: bus, context cap, resolve/source, CoachBlocks), build; layout specs
`coach-blocks.spec.ts` and `songs-review.spec.ts`. A test that a Take's `takeResult` event carries
`review.findings`.

## Report

As BRIEF "The end of a leg". Say plainly which `CoachContext` fields have no source yet.
