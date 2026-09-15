# W6 — the groove editor: make it yours

Branch: `jam/w6-editor`, from `jam`. Your area is NEW files only:
`src/containers/jam/editor/` (the component, its helpers, tests) and
`src/styles/jam-editor.css`. You do not edit any existing file and you do
not create anything else under `src/containers/jam/` (the UI worker is
building `JamView.tsx` there and will mount your component after you both
land). Read `plans/tasks/jam/BRIEF.md` first, then `plans/JAM_MODE.md` §4.1
and the contract in `src/jam/types.ts` (`JamPattern`, `JamLevel`,
`JamCustomGroove`).

The design is `design/drummer/GrooveEditor.dc.html` (the docked drawer at
the bottom of the stage) — static HTML, open at 1440×900. Build the
component the drawer contains, not the drawer: the UI worker decides where
it docks.

## The component

`GrooveEditor` with props:

```ts
{
  value: JamCustomGroove;
  onChange: (next: JamCustomGroove) => void;
  /** The tick being played right now, or null when stopped; lights a column. */
  playingTick: number | null;
  /** Bar or fill being edited. */
  page: "bar" | "fill";
  onPageChange: (page: "bar" | "fill") => void;
  onDone: () => void;
  onReset: () => void;
}
```

- Lanes: hat, snare, kick, ride (crash is not editable today: it is the
  crash on the one). Columns: `beatsPerBar × ticksPerBeat`, grouped by beat
  with the gap the design shows, beat numbers above the first column of each
  group and the sub-tick labels muted.
- A cell cycles off → hit → accent → ghost → off on click; shift-click goes
  backwards. Cells are at least 44px tall. The four states look as the
  design draws them (off, dot, bright dot with glow, small dim dot). The
  column being played gets an outline.
- The middle column of a triplet beat is drawn quieter (a shuffle leaves it
  empty), still clickable.
- Header row: the groove's name (editable inline, `contentEditable` is
  fine), a "Yours" pill, the meter caption ("4 beats in triplets · the
  columns follow the meter"), the Bar / Fill page switch, Reset and Done.
- Legend row: the four states and "Click a cell to cycle".
- Keyboard: arrow keys move a focus ring between cells, space cycles, so it
  is usable without a mouse. `aria-label` on every cell ("Snare, beat 2,
  tick 3: accent").
- Pure helpers in `editorModel.ts`: `cycleLevel`, `setCell`,
  `emptyPattern(beatsPerBar, ticksPerBeat)`, `resizePattern(pattern, from,
  to)` (a groove edited in 8ths then switched to 16ths keeps its hits and
  gains empty columns; coarser drops the in-between hits — the rule from
  plan §4.1), `fromGroove(groove)` making a `JamCustomGroove` out of a preset
  groove to start from.
- Styles in `src/styles/jam-editor.css` using the app's CSS custom
  properties (`--accent`, `--bg-card`, `--border`, `--text-secondary`; see
  `src/styles/shell.css`), never hard-coded colours, so it follows the
  thirteen themes.

Tests: cycling order, shift-cycling, resize both directions, keyboard
navigation moves focus and space cycles, the aria labels read correctly, a
12-column triplet bar renders 4 groups of 3.

## Gates

The ones in BRIEF.md; your files touch only `tsc` and `vitest`, run all
five anyway.

## Report

As in BRIEF.md, with the component's props and the helper export list.
