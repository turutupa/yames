# W1 — the setlist editor: duplicate, drag, and a block of steps

Worktree `C:\Users\alber\Dev\yames\.claude\worktrees\feedback-52-w1`,
branch `feedback-52-w1-setlist-editor` from `feedback-52`. Read the shared
BRIEF, then `src/setlist/setlists.ts` (the pure mutators — `newId`,
`duplicateSetlist`, `duplicateStep`, `reorderSteps`, `clampIndex`),
`src/types.ts` (`Setlist`, `SetlistStep`), `src/components/setlist/
SetlistParagraph.tsx` whole (its doc comment at the top and the comment
above the row's `role="button"` are load-bearing — this screen has been
bitten three times by things moving without a click, and once by a bare
`div` handing the click to `useDrag` on Windows), `src/containers/
main-window/hooks/useSetlistSession.ts` (how `selectedStepId` also
points the engine at the step, follows the runner while playing, and
mirrors live state back into the step while stopped), `src/setlist/
runtime.ts` (the runner addresses steps by index), the jam rows in
`src/components/presets/PresetSidebar.tsx` (the setlist context menu
near the end of the file; the jam menu's Duplicate item and
`useJamSession.ts`'s `duplicateJam` — the pattern; the jam rows'
`draggable` handlers and the Firefox `setData` note — the house drag),
`src/styles/setlist.css` (the row states: `selected`, `running`,
`:hover` share one border rule today), and `src/hotkeys.ts` with
`hotkeys.typing.test.ts` (the arrow keys are global BPM hotkeys; find
out how they are suppressed while an input has focus, because the row's
own key handling must not nudge the tempo).

## 1. Duplicate a setlist
- The setlist context menu becomes **Rename, Duplicate, Delete**, in
  that order, matching the jam menu.
- `useSetlistSession` gains `duplicateSetlist(id)` modelled on
  `duplicateJam`: name the copy `t("setlist.copyName", { name })`
  ("{{name}} copy"), save it through the existing IPC, insert it
  **directly after the source** in the list, and leave the selection
  where it was.
- `duplicateSetlist` in `setlists.ts` drops `countIn` today. Carry it.
  Extend its test.
- Prop `onDuplicateSetlist` threaded `PresetSidebar` → `Rail` →
  `MainWindow`, like `onDeleteSetlist`. Update the prop stubs in
  `Rail.test.tsx` and `MainHeader.test.tsx`.
- Keys `setlist.duplicateSetlist` and `setlist.copyName` in all fifteen
  `setlist.json` files, phrased like each locale's `jam.copyName`.
- Test: the setlist right-click offers rename, duplicate and delete
  (clone the jam test in `PresetSidebar.test.tsx`); the hook inserts
  the copy after the source with fresh ids and the count-in intact.

## 2. Drag a step to reorder
- **A grip handle** on the left of every row, in the same hover-reveal
  family as the tool buttons on the right (`opacity: 0` until the row
  is hovered, selected or focused within). Six-dot glyph, `title`
  `setlist.reorderHint` ("Drag to reorder"). The handle is what is
  `draggable`; the row is the drop target. Whole-row dragging is out:
  the selected row expands into an editor full of inputs, and a drag
  that starts inside a text field must never move the step.
- HTML5 drag, as the jam rows do it: `dataTransfer.setData("text/
  plain", …)` on start (Firefox refuses a drag without data), `data-
  dragging` on the source row, and a **drop line** between rows rather
  than a highlighted row — `data-drop="before" | "after"` on the row
  under the pointer, decided by the pointer's y against the row's
  midpoint, drawn as a 2px accent line at the row's top or bottom edge.
  A drop calls the pure mutator with the landing index; the mutator,
  not the component, clamps.
- **No drag while the setlist is playing** (`runningIndex >= 0`): the
  handle renders greyed, `draggable={false}`, title
  `setlist.stopToReorder` ("Stop the setlist to reorder"). The runner
  tracks steps by index; moving rows under it changes what plays next.
  The existing up/down buttons keep their current behaviour.
- The up/down buttons stay. They are the keyboard path and the
  touch-safe path (HTML5 drag does not exist on touch).

## 3. A block of steps
- `useSetlistSession` gains a **multi-selection beside the primary
  selection**, never instead of it: `selectedStepIds: Set<string>` and
  an anchor id. `selectedStepId` keeps every job it has (the engine
  mirror, the runner's start index, following the runner). The set is
  for bulk operations only.
- Clicks on a row: plain click selects that step as today and resets
  the set to `{id}` with the anchor at it; **shift-click** selects the
  range from the anchor to the clicked row (in list order, inclusive)
  and leaves the primary selection where it was; **ctrl-click (cmd on
  macOS)** toggles the clicked row in the set without moving the
  primary. Escape collapses the set to the primary. Starting the
  setlist collapses it too (the runner is about to move the primary).
- Keyboard, handled on the row's `onKeyDown` with `preventDefault` and
  `stopPropagation` so the global BPM hotkeys never see them:
  **Shift+↑/↓** extends the set from the focused row one step at a
  time (focus moves with it); **Alt+↑/↓** moves the whole block one
  position. Enter/Space keep selecting the row as today.
- **Dragging any row in the set moves the whole block**, keeping the
  steps' relative order, landing where the drop line says. Dragging a
  row outside the set moves only that row (and resets the set to it).
- The row's **duplicate and remove buttons act on the whole block when
  the row is in a set of more than one**. Their titles say so:
  `setlist.duplicateSteps` / `setlist.removeSteps` with `{{count}}`
  ("Duplicate {{count}} steps", "Remove {{count}} steps"); the
  singular keys stay for a set of one. Duplicates land as a block
  directly after the source block, with fresh ids.
- Visual: a third row state. `selected` keeps its border; `running`
  keeps its look; a row in the set (`multi`) gets a tinted background
  (`color-mix` of `--accent` into the surface, subtle) and no border
  change, so the three read as different things when they coincide.
  Check every combination in the existing row rules in `setlist.css`
  and do not let the shared border rule swallow the new state.

## 4. The data layer
In `setlists.ts`, pure, tested like the existing ones:
- `moveSteps(setlist, ids: string[], to: number)` — moves the named
  steps as a contiguous block to land at `to` (index in the list
  *after* removal, clamped), preserving their relative order; returns
  the same object when nothing changes. `reorderSteps` stays for the
  single-row case (or becomes a one-line wrapper — your call, say
  which).
- `removeSteps(setlist, ids)` and `duplicateSteps(setlist, ids)` (block
  lands after the last source step, fresh ids, `beatGroups` cloned).
- `stepRange(setlist, anchorId, targetId): string[]` for shift-click.
- Tests: a permutation property for `moveSteps` (every subset, every
  landing index, total length and id set preserved, relative order of
  the moved steps and of the untouched steps preserved), the empty and
  unknown-id cases, and the wrappers.

## 5. Locales
`setlist.json` in all fifteen files: `duplicateSetlist`, `copyName`,
`reorderHint` (reuse each locale's `jam.reorderHint` wording),
`stopToReorder`, `duplicateSteps`, `removeSteps`, `selectionHint` if
you show one. Placeholders identical across locales.

## 6. Tests
- `setlists.test.ts` — everything in §4.
- `SetlistParagraph.test.tsx` — drag start/over/drop on the handle
  moves a step; drop line position from pointer y; handle disabled
  while running; shift-click selects a range; ctrl-click toggles;
  Shift+↑ extends; Alt+↓ moves the block; a block drag moves all;
  remove on a block removes all; the `draw()` helper grows the new
  props.
- `useSetlistSession.test.ts` — the set beside the primary; starting
  the setlist collapses it; `duplicateSetlist`.
- `PresetSidebar.test.tsx` — the setlist menu.
- `hotkeys.typing.test.ts` or a sibling — a Shift+↑ on a focused step
  row does not change the BPM.

## Gates
`npx tsc --noEmit`, `npx vitest run` (whole; restore the onboarding
snapshot). Do not start the app. Report per the shared BRIEF, plus the
before/after vitest counts and the list of locale keys.
