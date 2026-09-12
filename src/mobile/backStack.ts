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
import { useCallback, useEffect, useRef } from "react";
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
 * `open` is the only dependency, and — as with `Sheet`'s focus effect, which
 * had the same shape of bug (M05 fix 4) — that is the whole point. Every call
 * site passes an inline arrow for `onClose`, so its identity changes on every
 * render of the screen it belongs to, which with the metronome running is
 * twice a second. With `onClose` in the array this effect re-registered that
 * often, and re-registering is not free here: the stack is **ordered**, and
 * Back closes the top of it.
 *
 * React runs every passive cleanup before any of the effects that replace
 * them, and both run child-before-parent. So with two layers open — the
 * settings pane registered by `MainWindow` and a sheet registered inside it —
 * one ordinary re-render unwound the stack `[settings, sheet]` and rebuilt it
 * as `[sheet, settings]`. Back then closed the settings pane out from under
 * an open sheet.
 *
 * The entry is therefore one stable function per mounted layer, which reads
 * the latest `onClose` through a ref when Back actually arrives — so the
 * newest closure still runs, and the registration outlives the renders.
 */
export function useBackDismiss(open: boolean, onClose: Dismiss) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Stable for this hook's lifetime: it is both what sits in the stack and
  // the key `remove` looks for, so it must not change between the two.
  const dismiss = useCallback(() => onCloseRef.current(), []);

  useEffect(() => {
    if (!open) return;
    push(dismiss);
    return () => remove(dismiss);
  }, [open, dismiss]);
}
