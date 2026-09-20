# W4 — setlists drag in the library, the way jams do

Worktree `C:\Users\alber\Dev\yames\.claude\worktrees\feedback-52-w4`, branch
`feedback-52-w4-library-drag` from `jam-v6` at 2d5d8b1. Read the shared
BRIEF, then `src/components/presets/PresetSidebar.tsx` whole: the jam rows
carry a hand-rolled HTML5 drag (`draggable`, `onDragStart` with the
Firefox `setData` note, `onDragEnter` / `onDragOver` / `onDrop` /
`onDragEnd`, `data-dragging` / `data-drag-over`, the `dropJam` handler
that maps ids to LIBRARY indices because a filtered view's row index is
not the library index, `onReorderJams`), and the setlist rows just below
them, which have a context menu (Rename / Duplicate / Delete, W1) and no
drag. Then `src/ipc.ts` (`reorderSetlists`, which persists an ordered id
list and tolerates unknown ids — W1 already calls it from
`duplicateSetlist`), `src/containers/main-window/hooks/useSetlistSession.ts`
(`setlists`, `setSetlists`, `duplicateSetlist`'s `insertAfter`), the jam
side's `useJamSession.ts` `reorderJams` for the shape of the callback,
and `src/jam/jams.ts::reorderJams` with `src/setlist/setlists.ts` for
where a pure helper belongs.

## What the user gets
In the library sidebar a setlist row can be picked up and dropped
between other setlists, exactly as a jam row can today: same grab
feel, same drag-over styling, same "Drag to reorder" hint on hover, and
the order survives a restart. The owner noticed jams drag and setlists
do not, and the reporter's "drag to reorder" reads naturally as both.

## Build
1. **Pure helper.** `reorderSetlists(setlists, from, to)` in
   `src/setlist/setlists.ts`, mirroring `reorderJams` (clamped, same
   object when nothing moves). Tested like `reorderSteps`.
2. **Hook.** `useSetlistSession` gains `reorderSetlists(from, to)`:
   applies the helper to state, persists through the existing IPC with
   the ids in the new order, and leaves the open setlist and `dirty`
   alone. Test: state order and the persisted id list agree.
3. **Rows.** The setlist rows in `PresetSidebar` get the same five drag
   handlers, `draggable={!renamingSetlist}` (a row being renamed must not
   drag — copy the jam guard), `data-dragging` / `data-drag-over`, the
   `title` `setlist.reorderHint` (the key W1 added), and a `dropSetlist`
   that maps ids to library indices the way `dropJam` does. Prop
   `onReorderSetlists` threaded `PresetSidebar` → `Rail` → `MainWindow`
   next to `onDuplicateSetlist`; stubs in `Rail.test.tsx`.
4. **Styling.** Whatever selector styles the jam rows' `data-dragging` /
   `data-drag-over` must apply to setlist rows too; if it is scoped to
   the jam row class, widen it rather than duplicating the rule.
5. **A setlist and a jam are never dropped on each other.** Dragging a
   setlist over a jam row (or the reverse) shows no drop target and
   drops nowhere. Test it.

## Tests
`PresetSidebar.test.tsx`: clone the jam drag test ("dragStart on row 1,
drop on row 3 → onReorderJams(from, to)") for setlists, including the
filtered-view case (a search that hides rows must still report library
indices), the renaming guard, and the cross-kind drop. `setlists.test.ts`
and `useSetlistSession.test.ts` per §1–2. Nothing here touches Rust.

## Gates
`npx tsc --noEmit`, `npx vitest run` (whole; restore the onboarding
snapshot). Do not start the app. Report per the shared BRIEF.
