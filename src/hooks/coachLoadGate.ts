/**
 * Whether a Path Session is in progress, for the coach model's loader (ms1).
 *
 * "Never start a load during a Take" is wider than the click: between two
 * Takes the click is stopped, and a load started there runs on into the next
 * one. So the loader waits for the whole Session, any run phase but idle and
 * recap. `SessionView` says so here; `coachLoader.ts` listens.
 *
 * Its own module, with no IPC in it, so the Session screen (which the phone
 * build carries too) does not pull the desktop loader into its import graph.
 */

let busy = false;
const listeners = new Set<() => void>();

/** A Session's run phase is past idle and not yet at its recap. */
export function setCoachSessionBusy(next: boolean): void {
  if (next === busy) return;
  busy = next;
  for (const listener of [...listeners]) listener();
}

export function coachSessionBusy(): boolean {
  return busy;
}

export function subscribeCoachSessionBusy(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
