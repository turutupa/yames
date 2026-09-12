/**
 * What the system Back gesture closes, and in what order.
 *
 * M00 found Back *finishing the activity mid-click*: one stray edge-swipe on a
 * music stand and the metronome was gone, process and all. The fix has two
 * halves. The Android half (`YamesMobilePlugin`) sends the app to the
 * background instead of killing it. This half is the other one: while the app
 * has something open — a sheet, zen mode, the settings pane — Back should
 * close that first, the way it does in every other Android app.
 *
 * The shape is a stack of dismiss handlers. Each dismissible layer registers
 * itself while it is open and unregisters when it closes; Back pops the top
 * one. When the stack empties, the Android side is told it may background the
 * app on the next Back without asking, which is what keeps the common case
 * instant rather than a round trip through the webview.
 *
 * Only reachable on a phone: every caller is behind `IS_MOBILE`.
 */
import { useEffect } from "react";
import { setBackIntercept } from "./native";

type Dismiss = () => void;

/** Innermost layer last. */
const stack: Dismiss[] = [];

/** What the Android side was last told, so we do not re-send it every change. */
let announced = false;

function announce() {
  const wanted = stack.length > 0;
  if (wanted === announced) return;
  announced = wanted;
  setBackIntercept(wanted).catch(() => {
    // A failed sync is not worth a broken UI: the worst case is that Back
    // backgrounds the app with a sheet still open, which is recoverable, and
    // the next open or close tries again.
    announced = !wanted;
  });
}

function push(dismiss: Dismiss) {
  stack.push(dismiss);
  announce();
}

function remove(dismiss: Dismiss) {
  const at = stack.lastIndexOf(dismiss);
  if (at >= 0) stack.splice(at, 1);
  announce();
}

/**
 * Close the topmost open layer. Returns false when there was nothing to close,
 * which the caller treats as "this Back was not ours".
 */
export function dismissTop(): boolean {
  const dismiss = stack[stack.length - 1];
  if (!dismiss) return false;
  // The layer's own close path removes it from the stack via the effect
  // cleanup; popping here as well would break a layer that animates out.
  dismiss();
  return true;
}

/** For tests, and for a hot reload that would otherwise leave ghosts. */
export function resetBackStack() {
  stack.length = 0;
  announced = false;
}

/**
 * Register a dismissible layer with the Back gesture for as long as it is open.
 *
 * `onClose` is read through a ref-free closure on purpose: it is called at most
 * once per Back press and always from the current render's stack entry, because
 * the effect re-registers whenever the callback identity changes.
 */
export function useBackDismiss(open: boolean, onClose: Dismiss) {
  useEffect(() => {
    if (!open) return;
    push(onClose);
    return () => remove(onClose);
  }, [open, onClose]);
}
