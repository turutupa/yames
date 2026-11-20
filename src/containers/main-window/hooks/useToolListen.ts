import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Listen, the tools' coach switch (DESIGN 7, the state table).
 *
 * | Event | What happens |
 * |---|---|
 * | Listen turned on | `startSession()` as the old Start did, opening no panel |
 * | Play, Stop, Play… | one coach session spans them (the session's own rules) |
 * | Listen off; leaving the tools; ten idle minutes | `endSession()`, which saves once |
 * | A Path Session begins | the Session does not own it (`useSessionRun`'s `theirs`) |
 * | Play with Listen off | the click and nothing else |
 *
 * The coach never turns the input on by itself: the only call to
 * `startSession` here is the player's press. And only a session this switch
 * started is ever ended here; a Path Session's own is its business.
 */

/** Ten minutes with Listen on and nothing playing ends it. */
export const LISTEN_IDLE_MS = 10 * 60_000;

/** The screens whose transport carries Listen. */
export const LISTEN_VIEWS: ReadonlySet<string> = new Set(["beat", "drill", "setlist", "jam"]);

/**
 * Screens the player can be on without having left the tools: the Tools list
 * between two of them, Settings over one, and a Path Session started while
 * Listen was on (it uses the session as its own, and ends nothing of it).
 */
const STAYS: ReadonlySet<string> = new Set([...LISTEN_VIEWS, "tools", "settings", "session"]);

export type ListenCoach = {
  active: boolean;
  /** As of the calls made, not the last render (`useSession`). */
  isActive: () => boolean;
  startSession: () => Promise<void>;
  endSession: () => Promise<void>;
};

export function useToolListen({
  view,
  isPlaying,
  coach,
}: {
  view: string;
  isPlaying: boolean;
  coach: ListenCoach;
}): { on: boolean; toggle: () => void } {
  const [mine, setMine] = useState(false);
  const mineRef = useRef(false);
  const latest = useRef(coach);
  latest.current = coach;

  const claim = useCallback((on: boolean) => {
    mineRef.current = on;
    setMine(on);
  }, []);

  const end = useCallback(() => {
    if (!mineRef.current) return;
    claim(false);
    void latest.current.endSession().catch(() => {});
  }, [claim]);

  const toggle = useCallback(() => {
    if (mineRef.current) {
      end();
      return;
    }
    claim(true);
    // Queued behind any end still running (`useSession`'s lifecycle turn).
    void latest.current.startSession().catch(() => {});
  }, [claim, end]);

  // The session ended some other way (it cannot from here, but the hook that
  // owns it is the one that knows): the switch follows it off.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !coach.active && !coach.isActive()) claim(false);
    wasActive.current = coach.active;
  }, [coach.active, coach.isActive, claim]);

  // Leaving the tools ends it.
  useEffect(() => {
    if (!STAYS.has(view)) end();
  }, [view, end]);

  // Ten idle minutes end it. Not while a Path Session is using it.
  useEffect(() => {
    if (!mine || isPlaying || view === "session") return;
    const timer = window.setTimeout(end, LISTEN_IDLE_MS);
    return () => window.clearTimeout(timer);
  }, [mine, isPlaying, view, end]);

  return { on: mine, toggle };
}
