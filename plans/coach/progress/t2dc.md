# t2dc: fixes from the review of t2d (MERGE AFTER FIXES)

Branch `coach-t2d` (worktree `/home/dgx-delgado/yames-coach-t2d`), after `merge coach` (ffffc218: rem2, tc2).
Work list `/tmp/coach-orch/t2d-review.md`. Logs `/tmp/coach-t2d/`.

## Done (in the working tree; see the commits)

- H1 es: notCommand "a mayor escala", "a menor escala", "a gran escala"; near-misses in `recipeCases/es.ts`.
- M1: bare 五声音阶 / 五声 (zh-CN), 五聲音階 / 五聲 (zh-TW), "ngũ cung" (vi) removed from minorPentatonic.
  vi.ts case moved to "ngũ cung thứ"; near-misses added. No existing show_scale test pinned the bare words.
- M2: `scaleCall` uses `recipeRootAt` (h = B, null "b" unread); `chordCall` reads a native root name
  (`nativeChordName`: "h7" B7, "fism" F#m, "b7" unread, "bb7" still Bb7).
- L1: `recipe.barFrom` (de "ab", "vom"; pl "od"; ru "с", "со", "от"), a number typed "4." (`Text.ordinals`),
  and the table's ordinal place ("4 takt") refuse the bars.
- L2: ru "полуувеличенный" removed. L3: nl "mol" removed from roots.flat (a mol = Ab or a German-style A minor).
- L4: rootNames collisions with fillers / notCommand / connectors / verbs / shapes are validator problems.
- L5: es "el tiempo", fr "le placement" in make.graded.
- L6 / Q6: near-misses for de, nl, pl, fr, it, ru, tr, pt-BR.

## Gates

(pending)
