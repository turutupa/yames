# fix1: two layout regressions and the "Passed · Pass mark" wording

Branch `coach-fix1`, from `coach` at d25a8873.

## 1. short-window.spec.ts: session-input-failed (runway) in aurora at 1024x700

- **Cause, verified**: leg pm's rename. The runway's ready screen shows the pass mark as a line in its
  left column ("The pass mark: 85% even and 95% of the notes heard, at 80 BPM."). Six characters longer
  than "The bar: ...", it wraps in Aurora at 1024 wide, and the second line pushed the input-failed card
  9 px under the window (ends at 709 in 700; Start itself was inside). Swapping only the English back to
  "The bar:" made the case pass (`/tmp/coach-fix1/bisect-text.log`); reverted.
- **Fix** (`RunwayTake.tsx` class `session-runway-passmark`, `session.css` short-window block): under
  760 px of height, while the input's trouble is on the runway's ready screen, the pass mark steps aside
  as the neck's bar already did there ("the bar is back the moment the input is"). Nothing is graded
  without an input. Holds for any length of sentence, so German and Russian too; no locale changed.

## 2. neck.spec.ts: session-neck-box at 620x780 (ring gap -0.66 against -0.5)

- **Cause, measured** (a scratch diagnostic in the ignored `.layout-cache/diag/`, the same scene in this
  worktree and in the base worktree's source): the neck's box was 252.7 px tall at the base and 220 px
  after c1b1. Two things took the 33 px: the pass mark c1b1 put beside the tempo is baseline-aligned, so
  at 620 wide its second line hung under the number (head 86.2 to 108.4 px), and the ready note is 52 px
  where the old coach line was 39.5. NOW's ring is `2 * (r * extent + RING_PAD)` with a constant pad, so
  on a smaller neck it reaches the dot on the next string: gap = about 0.23 r - 3.0 px (r = dot radius);
  r was 12.26 at the base (gap -0.17), 10.4 to 10.7 after c1b1.
  (c1b1's notes said the value did not follow the note's height; with the note hidden the neck grows to
  276 px and r to 13.6, so it does.)
- **Fix** (`coach.css`, the short / narrow query c1b1 wrote): the pass mark is centred on the tempo
  (`align-self: center`, line height 1.3) and the ready note's headline is 15 px instead of 16. The neck
  is 238 px (r 11.47, gap about -0.35). Tolerance untouched; the 620x780 neck cases passed 15 of 15 with
  `--repeat-each 3`. The remaining 15 px against the base is the note's box, which is the design.

## 3. "Passed · Pass mark 85%"

`session.result.barChip` / `barChipCount` now read "Needs {{bar}}%" / "Needs {{bar}} or fewer", the
wording of mock 07 ("PASSED · NEEDS 85%"). The miss chip reads "✗ Needs 85%" beside "What held it back";
its screen-reader text still says "Pass mark not met". Of the other fourteen locales only Japanese said
it twice (合格 · 合格ライン 85%): now "{{bar}}% 以上" / "{{bar}} 以下". The zh, ko and the European
locales use different words for passed and the threshold. No test quoted the sentence; the e2e regex
`PASSED · ` still matches, its comment updated.

## Gates

- Full layout suite (`/tmp/coach-fix1/layout-full.log`): 1263 passed, 249 skipped, 1 failed:
  `songs-stage.spec.ts` "plays with the space bar without scrolling the tab", a 90 s timeout under load
  on the Songs screen (no coach leg touches it); re-run alone it passes (`/tmp/coach-fix1/songs-rerun.log`).
- `npx tsc --noEmit`: clean. `npm run build`: ok. Vitest: 11711 tests passed, 383 of 384 files; the one
  file is the known worktree-only `TabStage.render.test.tsx` (Bravura.woff2 through the symlink).
