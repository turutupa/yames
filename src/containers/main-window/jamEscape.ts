/**
 * What Escape closes on the Jam tab.
 *
 * Escape means "put away the thing that is open", and on this tab several
 * things can be open at once: a field being typed into, a dialog, the groove
 * editor, the chord picker, and the jam itself. Which one gets put away is an
 * ORDER, from the innermost outwards, and an order is the kind of thing that
 * is wrong in one place and right in three others unless it lives somewhere
 * on its own.
 *
 * It lives here rather than inside the listener because the listener is
 * twenty lines of DOM inside a two-thousand-line component, and this is the
 * only part of it worth arguing about. The DOM questions — is something being
 * typed into, is a dialog up — are answered there and passed in as booleans.
 */
export type JamEscapeTarget = "nothing" | "chordPicker" | "jam";

export interface JamEscapeState {
  /** Focus is in an input, a textarea or a contenteditable. */
  typing: boolean;
  /** A `dialog` or `alertdialog` is on screen; it owns the key. */
  dialogOpen: boolean;
  /** The groove editor is down. It has its own Done and takes no key from here. */
  editorOpen: boolean;
  /** The bar the chord picker is open on, or null when it is shut. */
  editingBar: number | null;
}

/**
 * The innermost thing open, or "nothing" when the key is not ours to take.
 *
 * The chord picker is the case that was missing and the one that cost the
 * most: it is a panel rather than a dialog — a popover anchored to bar 32
 * lands off-screen at the width people use — so nothing above it catches
 * Escape on its behalf, and it had no keyboard way out at all. The key went
 * straight past it and closed the tune you were editing the changes of.
 */
export function jamEscapeTarget({
  typing,
  dialogOpen,
  editorOpen,
  editingBar,
}: JamEscapeState): JamEscapeTarget {
  if (typing || dialogOpen || editorOpen) return "nothing";
  if (editingBar !== null) return "chordPicker";
  return "jam";
}
