/**
 * When the brain is in memory, and when it is not.
 *
 * The model is only resident while somebody is practising. That is a
 * deliberate policy, not an optimisation:
 *
 *   - **Nothing loads at mount.** `useSession` used to fire
 *     `loadCoachModel()` from its mount effect *and* again from
 *     `startSession` while the first was still in flight. Rust dropped
 *     the resident worker before spawning the replacement, so the second
 *     call tore down a working brain — and a failure at that point left
 *     none at all. Launching the app also paid 4 GB of RAM for a model
 *     the user might never ask a question of.
 *   - **A download does not load either.** Fetching weights is not the
 *     same act as wanting them resident; Settings says "ready — loads
 *     when you start a session" and means it.
 *   - **Sessions load.** `startSession` calls `ensureCoachLoaded()`, which
 *     dedupes the in-flight promise here and is idempotent in Rust
 *     (same path + size + mtime → no reload; a changed file → the worker
 *     swaps the weights on its own thread). While it runs, tips use
 *     templates and the status line says "warming up".
 *   - **Idle unloads.** `scheduleCoachIdleUnload()` at session end drops
 *     the worker after {@link COACH_IDLE_UNLOAD_MS} of no practice. The
 *     next session start reloads it.
 *
 * Module-level state rather than a hook: residency is a property of the
 * process, not of a React tree, and two mounted components must not each
 * own their own idea of it.
 */
import { loadCoachModel, unloadCoachModel } from "../ipc";

/**
 * How long the brain stays resident after the last session ends.
 *
 * Ten minutes is the gap between "they stepped away from the instrument
 * for a moment" and "they are done" — long enough that a break between
 * two practice sessions does not pay the multi-second reload, short
 * enough that an app left open overnight is not sitting on 4 GB.
 */
export const COACH_IDLE_UNLOAD_MS = 10 * 60 * 1000;

/** The in-flight `load_coach_model` call, if one is running. */
let inFlight: Promise<boolean> | null = null;
/** Result of the last completed load. */
let resident = false;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Load the brain if it is not already loaded, coalescing concurrent
 * callers onto one IPC call.
 *
 * Returns whether a model is resident afterwards. A refusal (`false` —
 * no weights, legacy family, a build with no LLM) is not an error: the
 * caller carries on with the template coach.
 */
export async function ensureCoachLoaded(): Promise<boolean> {
  cancelCoachIdleUnload();
  if (resident) return true;
  if (inFlight) return inFlight;
  inFlight = loadCoachModel()
    .then((ok) => {
      resident = ok;
      return ok;
    })
    .catch(() => {
      resident = false;
      return false;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}

/** True while an `ensureCoachLoaded()` call is still running. */
export function coachLoadPending(): boolean {
  return inFlight !== null;
}

/** True when the last load succeeded and nothing has unloaded since. */
export function coachResident(): boolean {
  return resident;
}

/** Drop the worker now (brain tier switched off, weights being deleted). */
export async function unloadCoach(): Promise<void> {
  cancelCoachIdleUnload();
  resident = false;
  try {
    await unloadCoachModel();
  } catch {
    // Nothing to unload, or the backend is already gone. Either way the
    // frontend's view is "not resident", which is what matters here.
  }
}

/**
 * Arm the idle unload. Called when a session ends; cancelled by the next
 * `ensureCoachLoaded()`.
 */
export function scheduleCoachIdleUnload(): void {
  cancelCoachIdleUnload();
  if (!resident) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void unloadCoach();
  }, COACH_IDLE_UNLOAD_MS);
}

export function cancelCoachIdleUnload(): void {
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

/** Test seam — drops all module state without touching the backend. */
export function __resetCoachLoaderForTests(): void {
  cancelCoachIdleUnload();
  inFlight = null;
  resident = false;
}
