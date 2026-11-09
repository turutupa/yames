/**
 * The bar's slots — the two places the mode on the stage may put something.
 *
 * ## Why there is a slot at all (W36 item 2)
 *
 * The owner, on his third session with Songs: *"the top rail, do we need it
 * anymore? … can we merge the information from the songs stage area into that
 * rail? like the song name, the tuning etc"*. Songs was stacking three rows
 * above the music at a 1124 px window — the app's bar, the song's own head,
 * and a warning banner — and the tab was paying for all three.
 *
 * `MainHeader` is shared by every mode and by the phone build, so the song's
 * name, its part menu and its tuning cannot live inside it: the next mode that
 * wants a bar would add a second set of props and a second `view ===` branch,
 * and the file would end up knowing about every stage in the app. So the bar
 * offers ROOM and knows nothing about what goes in it. A mode fills it with a
 * portal, from its own component, out of its own state, and takes it away
 * again when it unmounts.
 *
 * ## Why an external store rather than a context
 *
 * The slot is a DOM node, and a portal needs the node itself — not a promise
 * of one. A context would mean a provider above both the bar and the stage,
 * which is `MainWindow`, which means threading a setter down into `MainHeader`
 * as two more props: the exact thing this exists to avoid. A ref callback
 * writing into a module store, read through `useSyncExternalStore`, is four
 * lines and gives the mode a re-render exactly when the node appears or goes.
 *
 * `more` is the overflow menu's own slot, and it exists and stops existing as
 * the menu opens and closes — which is the whole reason the reader has to be a
 * subscription rather than a lookup on mount.
 */
import { useSyncExternalStore } from "react";

/** Which room: the bar itself, or the overflow menu behind the ⋯ button. */
export type HeaderSlot = "bar" | "more";

const nodes: Record<HeaderSlot, HTMLElement | null> = { bar: null, more: null };
const listeners = new Set<() => void>();

/**
 * The bar says where a slot is, or that it has gone.
 *
 * Called from a ref callback, so React hands us `null` on unmount and the
 * mode's portal comes down with it. Nothing is notified when the node has not
 * actually changed: React calls a ref callback on every commit it re-creates
 * the closure on, and waking every mode for the same element is a render for
 * nothing.
 */
export function putHeaderSlot(slot: HeaderSlot, node: HTMLElement | null): void {
  if (nodes[slot] === node) return;
  nodes[slot] = node;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The node to portal into, or null while there is none.
 *
 * `null` is the honest answer on the first render and inside the "more" menu
 * while it is shut, and a mode that draws nothing then is a mode that draws
 * nothing — `createPortal` needs a container and there is not one.
 */
export function useHeaderSlot(slot: HeaderSlot): HTMLElement | null {
  return useSyncExternalStore(
    subscribe,
    () => nodes[slot],
    () => null,
  );
}
