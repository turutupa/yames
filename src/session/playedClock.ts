/**
 * The Session's "played" clock without the time Watch spent playing the
 * pattern for the player (acceptance 5, P2-11): a demo heard is not practice,
 * so the bar's "4:12 played" and the recap's minutes stand still through it.
 * The countdown of a timed Session keeps real time (the owner, 2026-11-18).
 */
export type DemoClock = {
  /** The Session this clock is for (`RunState.startedAt`): a new one starts at zero. */
  startedAt: number;
  /** Demo time already over. */
  total: number;
  /** When the demo now playing began, or null. */
  since: number | null;
};

export const NO_DEMO: DemoClock = { startedAt: 0, total: 0, since: null };

/** The demo started or stopped at `now`; a new Session (`startedAt`) resets the clock. */
export function demoEdge(clock: DemoClock, playing: boolean, now: number, startedAt: number): DemoClock {
  const c = clock.startedAt === startedAt ? clock : { startedAt, total: 0, since: null };
  if (playing) return c.since === null ? { ...c, since: now } : c;
  if (c.since === null) return c;
  return { ...c, total: c.total + Math.max(0, now - c.since), since: null };
}

/** Milliseconds played: since the start, less every demo heard (and the one playing). */
export function playedMs(startedAt: number, now: number, clock: DemoClock): number {
  const same = clock.startedAt === startedAt;
  const demo = same ? clock.total + (clock.since !== null ? Math.max(0, now - clock.since) : 0) : 0;
  return Math.max(0, now - startedAt - demo);
}
