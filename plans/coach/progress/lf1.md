# lf1: two layout scenes that failed on `coach` itself

Branch `coach-lf1`, worktree `/home/dgx-delgado/yames-coach-lf1`, logs and shots `/tmp/coach-lf1/`.

## 1. phone-learning: the footer after a Watch at 360 px

- Measured (job coach-lf1-pl-diag-2, the spec now prints what it saw): `data-fit` unset, the row
  302 px wide, `scrollWidth` 307, and the Watch button 84 then 86 px between two reads. `fitRow`
  would have set `tight` had it run: it had stopped running on this row.
- Cause: `useFitRow(ref, label)` keyed its effect on the ref object. The footer row is unmounted
  and mounted again (`WatchFooterRow` returns null while Watch is unavailable; SessionView mounts it
  conditionally), and a remount without a label change kept the observers on the old, detached row.
  Whether the old row's last ResizeObserver call landed after the new row settled was a race:
  1 failure in 12 alone, every time under load. Present since the hook was written (owner fix of
  2026-11-18, `useFitRow`), not a merge's CSS.
- Fix: `useFitRow(row: HTMLElement | null, label)` keyed on the element; `WatchFooterRow` passes a
  callback ref's element (`useState`). No CSS change; touch targets unchanged (Watch 44 px as icon).

## 2. tool-coach in German: Listen 3–7 px past a 1024 window (input refused)

- Cause: the bar at 1024–1199 keeps Listen's word, and nothing in the row could give (every child
  `flex-shrink: 0`, the readouts present though transparent before the first bar). Introduced with
  Listen itself (c2a2, 7a364910 / 44749f6b), measured in English only.
- Fix (shell.css, max-width 1199, bars with Listen only): gaps 22 -> 16; each readout's label
  under its number; Listen's word, Count-in's word and a setlist's Skip may take a second line
  inside their own pill (only when the row is full: the spacer gives first). Nothing shed, no
  translation touched.

## Gates

See the final report (job names coach-lf1-*).
