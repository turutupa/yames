/**
 * The hint runtime — one module-level object shared by every
 * `useFirstTimeHint` call in the window.
 *
 * Why a singleton rather than per-hook state: the rate limit is "at most one
 * hint per app session". Six independent hooks each reading
 * `hints.lastShownSession` from the store would all see "no hint yet" and all
 * decide to show, because the store round-trip is async. The single in-memory
 * slot (`claimedBy` / `slotUsed`) makes the decision synchronous and
 * race-free: the first hint whose trigger fires takes the slot, the others
 * see it taken and stay quiet until the next app start.
 *
 * Hydration happens once, lazily, on the first `ensureHintSession()` — which
 * `useAppHints` calls on mount, i.e. at app start. That call is also where
 * the app session counter is incremented.
 */
import { storeLoad, storeSave } from "../../../ipc";
import {
  APP_SESSION_COUNT_KEY,
  HINT_IDS,
  HINT_LAST_SHOWN_SESSION_KEY,
  HINT_STATE_KEYS,
  WIDGET_OPENED_KEY,
  hintShownKey,
  type HintId,
} from "./types";

export type HintRuntime = {
  /** 1-based app session number for this run. */
  session: number;
  /** Hints that have already been shown, ever. */
  shown: Set<HintId>;
  /** A hint has taken this session's single slot. */
  slotUsed: boolean;
  /** The hint currently occupying the slot (null once it is dismissed). */
  claimedBy: HintId | null;
  /** The floating widget has been opened at least once, ever. */
  widgetOpened: boolean;
};

let runtime: HintRuntime | null = null;
let hydrating: Promise<HintRuntime> | null = null;

/** The hydrated runtime, or null before the first `ensureHintSession()`. */
export function peekHintRuntime(): HintRuntime | null {
  return runtime;
}

/**
 * Hydrate the runtime and count this app start as a new session. Safe to call
 * from many hooks — only the first call does the work.
 */
export function ensureHintSession(): Promise<HintRuntime> {
  if (runtime) return Promise.resolve(runtime);
  if (!hydrating) hydrating = hydrate();
  return hydrating;
}

async function hydrate(): Promise<HintRuntime> {
  const [count, lastShown, widgetOpened, ...flags] = await Promise.all([
    storeLoad<number>(APP_SESSION_COUNT_KEY),
    storeLoad<number>(HINT_LAST_SHOWN_SESSION_KEY),
    storeLoad<boolean>(WIDGET_OPENED_KEY),
    ...HINT_IDS.map((id) => storeLoad<boolean>(hintShownKey(id))),
  ]);
  const session = (typeof count === "number" && count > 0 ? count : 0) + 1;
  const shown = new Set<HintId>(
    HINT_IDS.filter((_, i) => flags[i] === true),
  );
  runtime = {
    session,
    shown,
    // Defensive: if the counter ever fails to advance (store write lost), a
    // stored `lastShownSession` at or beyond this session still holds the
    // limit rather than letting a second hint through.
    slotUsed: typeof lastShown === "number" && lastShown >= session,
    claimedBy: null,
    widgetOpened: widgetOpened === true,
  };
  await storeSave(APP_SESSION_COUNT_KEY, session).catch(() => {});
  return runtime;
}

/**
 * Try to take this session's hint slot for `id`.
 *
 * Returns true when the caller may render the hint: it has never been shown,
 * and either it already holds the slot or the slot is free.
 */
export function claimHintSlot(rt: HintRuntime, id: HintId): boolean {
  if (rt.shown.has(id)) return false;
  if (rt.claimedBy === id) return true;
  if (rt.claimedBy !== null || rt.slotUsed) return false;
  rt.claimedBy = id;
  return true;
}

/**
 * Record that `id` was shown: never again, and no other hint this session.
 *
 * Called as soon as the card becomes visible (not on dismissal) — a hint the
 * user saw and then quit the app on has still been shown. Idempotent, so
 * `markShown()` from the card's dismiss button is free to call it again.
 */
export async function persistHintShown(rt: HintRuntime, id: HintId): Promise<void> {
  const first = !rt.shown.has(id);
  rt.shown.add(id);
  rt.slotUsed = true;
  if (!first) return;
  await storeSave(hintShownKey(id), true).catch(() => {});
  await storeSave(HINT_LAST_SHOWN_SESSION_KEY, rt.session).catch(() => {});
}

/** The card for `id` is gone; free the slot object (the limit still stands). */
export function releaseHintSlot(rt: HintRuntime, id: HintId): void {
  if (rt.claimedBy === id) rt.claimedBy = null;
}

/** Remember that the floating widget was opened (widget-discover's precondition). */
export async function markWidgetOpened(): Promise<void> {
  const rt = runtime;
  if (rt) {
    if (rt.widgetOpened) return;
    rt.widgetOpened = true;
  }
  await storeSave(WIDGET_OPENED_KEY, true).catch(() => {});
}

/**
 * Settings → General → "Reset hints". Clears every `hints.*` key so all six
 * can fire again, and frees this session's slot so the next trigger shows
 * something immediately.
 */
export async function resetHints(): Promise<void> {
  await Promise.all(HINT_STATE_KEYS.map((key) => storeSave(key, null).catch(() => {})));
  if (runtime) {
    runtime.shown.clear();
    runtime.slotUsed = false;
    runtime.claimedBy = null;
  }
}

/** Test-only: forget the hydrated runtime so the next call re-reads the store. */
export function __resetHintRuntimeForTests(): void {
  runtime = null;
  hydrating = null;
}
