import { useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (...args: any[]) => any;

/**
 * The same handlers, behind functions that never change.
 *
 * The app's shell re-renders at every beat (`MainWindow` holds the beat in
 * state) and hands its children a fresh closure for every `onThis` each time,
 * which is what stops `memo` from sparing a child the beat has nothing to do
 * with: the rail was rendered nine times a second through a Take (2026-11-19).
 * Wrapping each closure in `useCallback` would mean getting forty dependency
 * lists right. This keeps one stable function per name that calls whichever
 * closure the latest render handed in, so a memoised child sees the same
 * props and a press still runs today's code.
 *
 * For handlers only: things called from an event, a timer or an effect. A
 * function the child calls WHILE RENDERING (a render prop, a selector) must
 * not go through here, because a child that does not re-render would not
 * call the new one.
 */
export function useStableHandlers<T extends Record<string, Handler | undefined>>(handlers: T): T {
  const latest = useRef(handlers);
  latest.current = handlers;
  const stable = useRef<Record<string, Handler>>({});
  const out: Record<string, Handler | undefined> = {};
  for (const key of Object.keys(handlers)) {
    if (handlers[key] === undefined) {
      out[key] = undefined;
      continue;
    }
    out[key] = stable.current[key] ??= (...args) => latest.current[key]?.(...args);
  }
  return out as T;
}
