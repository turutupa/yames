# c4b3 handoff: item 5 (the scenes) is leg c4b4

c4b3 built items 1 to 4 (see `c4b3.md`). Item 5 was not started, on the size rule.

## c4b4: the scenes (brief `c4b2-weekly-plateaus-milestones.md` item 8, the prompt's item 5)

- A Progress seed in the shot harness (`src/shots/mockIpc.ts` `sessionSeed`, `src/shots/scenarios.ts`
  `Shot.session.seed`): three Sessions last week (the player's week start), a clean tempo moving, so the
  look-back shows; a variant with C stuck three Sessions (the plateau question); a variant whose last
  Session (yesterday) first passed an Exercise, with its ceiling row (the milestone card). The harness
  answers `list_clean_tempo_spans` with `[]` today: give it the seed's spans (the look-back waits for them
  when graded).
- Scenes with `stop: "progress"`: look-back, plateau, milestone; desktop (1160 with the dock, DESIGN 10)
  and a phone width; one in German; Ember and Manuscript. A new `tests/layout/companion.spec.ts` (the card
  inside the page, nothing cut, no sideways scroll; `today-line.spec.ts` is the model), pictures only when
  `YAMES_SHOT_DIR` is set. Also the Path suggestion on Paths (needs a seed whose last Session finished a
  Level) and the dot on the rail and the tab bar.
- Three shots to `/tmp/coach-c4b3/shots/` (or the next leg's folder) for the orchestrator.
- Gate: `--lock coach-layout`, the new spec plus `rail phone-learning today-line coach-session short-window`.
