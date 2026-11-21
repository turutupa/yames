# lf1: two layout scenes that failed on `coach` itself

Branch `coach-lf1`, worktree `/home/dgx-delgado/yames-coach-lf1`, logs and shots `/tmp/coach-lf1/`.

## 1. phone-learning: the footer after a Watch at 360 px

- Measured (the spec now prints what it saw; a MutationObserver on `data-fit` for the diagnosis):
  `data-fit` unset, row 302 px, `scrollWidth` 307; the Watch button 84 then 86 px between two reads
  after `settleAnimations`; the fit's last call took `data-fit` off and found the row fitting.
- Cause: `.practice-watch` and `.practice-sound` were under `button { transition: all 0.15s }`
  (global.css). `fitRow` takes `data-fit` off to measure; the forced style recalc starts Watch's
  padding and min-width on their way back to the word form, so the row was measured with Watch still
  narrow, read as fitting, and was left 3–5 px too wide once Watch grew. Slower and Faster had the
  same fix in dd9a9680 (2026-11-19); Watch and Sound did not. A race: 1 in 12 alone, every time under
  load; German at 412 failed 2 in 6.
- Fix: both buttons transition colours only (session.css). Also `useFitRow` is keyed on the row
  element (callback ref), so a row that mounts after the first render is fitted (latent: the row is
  null while Watch is unavailable). No touch target changed (Watch 44 px as its icon).

## 2. tool-coach in German: Listen 3–7 px past a 1024 window (input refused)

- Cause: at 1024–1199 the bar keeps Listen's word and nothing in it could give (every child
  `flex-shrink: 0`; the readouts present, transparent, before the first bar). Since Listen landed
  (c2a2, 7a364910 / 44749f6b), measured in English only.
- Fix (shell.css, max-width 1199, bars with Listen only): gaps 22 -> 16; each readout's label under
  its number; Listen's word, Count-in's word and a setlist's Skip may take a second line inside their
  own pill (only when the row is full: the spacer gives first). Nothing shed, no translation touched.
  pt-BR's loaded Setlist at 1024 (19–30 px over before the Count-in/Skip rule) now fits too.

## Gates

See the final report (job names coach-lf1-*).
