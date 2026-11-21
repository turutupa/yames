# t2f: "Add it" does nothing on the phone's Ask sheet

Branch `coach-t2f` (from `coach` at 3b51af73). Logs: the job queue (`job logs coach-t2f-*`).

## The cause (measured, `coach-t2f-diag`)

After a typed line the box keeps the focus (the send button's `onMouseDown` preventDefault,
leg t1b2b), so the sheet carries `data-typing` and hides its context line ("Looking at: Today")
and footer (`src/styles/ask.css:908`). The context line sits in the head, ABOVE the thread
(`src/containers/coach/AskPanel.tsx:94`). A tap on "Add it":

- `pointerdown`, `touchstart`, `pointerup`, `touchend`, `mousedown`: target the button, nothing
  prevented, nothing covering it (`elementFromPoint` at its centre is the button);
- `mousedown` blurs the box: `onBlur` -> `setTyping(false)` (`AskPanel.tsx:278`), the context
  line comes back above the thread and everything below moves down;
- `mouseup` then lands on `.ask-tool.ask-proposal` (the turn around the button), so the `click`
  goes to the common ancestor, never to the button: `pressProposal` is never called.
- Calling `pressProposal(id)` directly on the same page gives the receipt: the runner, the host,
  the view check and the lazy generator are all fine on a phone.

Not covered, not the drag handler (the grip only), not refused, not a missing chunk.

**Every button in the thread and the chip row was affected while the box had the focus**: the
same spec, before the fix, also fails a "Go to Paths" chip pressed with the box focused (no
receipt). Proposals, chips, Undo, "Not now", the receipt's next chips: all the same path. Desktop
is untouched (the dock has no `data-typing` rule).

## The fix

`AskPanel.tsx`, the phone branch only: while typing, a `mousedown` on a button of the thread or
the chip row (`pressedInThread`) is prevented, so the box keeps the focus and nothing moves before
the click lands; the panel's `onClick` then blurs the box, so the keyboard goes away after the
press as it did before. The send button is excluded (the keyboard stays up after a send).

## Tests

- `tests/layout/ask-make-phone.spec.ts`: t2d's phone fixme scene un-fixme'd (typed recipe, tap
  "Add it", receipt with Undo, "Open Paths", the Undo ended; every target 44 px; the box asserted
  focused before the tap), and a chip pressed with the box focused. Both failed before the fix
  (`coach-t2f-before`).
- `src/containers/coach/askPhonePress.test.ts`: which presses count.

## Status

- [x] cause, fix, spec, unit test; tsc green (`coach-t2f-tsc`)
- [ ] spec after the fix, vitest, build, layout gates
