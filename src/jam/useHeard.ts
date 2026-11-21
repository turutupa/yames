import { useEffect, useRef, useState } from "react";
import { publish } from "../coach/bus";
import { harmonyMarkBar, harmonySetTempo, harmonyStart, harmonyStop, onHarmonyReading } from "../ipc";
import { scheduleHeld } from "../songs/scheduleHold";
import type { HeardChart, HeardLive, HeardSummary } from "../ipc";
import { rememberHeard } from "./heard";

/** How long after the worker ended by itself before it is asked for again. */
const RETRY_MS = 1500;
const RETRIES = 3;

/**
 * Starts and stops, one at a time and in the order they were asked for: a
 * chart change stops one worker and starts the next in the same tick, and the
 * two commands would otherwise race in the backend. Each stop names the
 * worker it means (`harmonyStop(id)`), so even out of turn it cannot stop
 * another's.
 */
let turn: Promise<unknown> = Promise.resolve();
function inTurn<T>(job: () => Promise<T>): Promise<T> {
  const next = turn.then(job, job);
  turn = next.catch(() => {});
  return next;
}

/**
 * Runs the free-play engine while `active`: the setting is on, a jam is
 * playing and the input is listening. Off, nothing is invoked at all.
 *
 * The worker ends when the input stops or restarts (a device change restarts
 * the input); the page is told with a null reading and asks again, a few
 * times.
 *
 * `jamRun`: a jam is playing on the Jam screen (not a Session's free play).
 * When it stops, the coach's bus hears `jamStopped` once (leg c5a1), carrying
 * what the last stretch of hearing in that run came to, when there was one;
 * with "Hear what I play" off nothing was heard and the event has no `heard`.
 * Published once the stop has returned, never while the band plays.
 */
export function useHeard({
  active,
  chart,
  bpm,
  formBar,
  jamRun = false,
}: {
  active: boolean;
  chart: HeardChart | null;
  bpm: number;
  formBar: number;
  jamRun?: boolean;
}): HeardLive | null {
  const [live, setLive] = useState<HeardLive | null>(null);
  const running = useRef(false);
  const bpmRef = useRef(bpm);
  bpmRef.current = bpm;
  const formBarRef = useRef(formBar);
  formBarRef.current = formBar;
  // One chart per jam: its text is its identity.
  const chartKey = chart ? JSON.stringify(chart) : "";
  const chartRef = useRef(chart);
  chartRef.current = chart;
  // The last stop of hearing in this jam run: what `jamStopped` carries.
  const heardInRun = useRef<Promise<HeardSummary | null> | null>(null);

  useEffect(() => {
    if (!active) return;
    let gone = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // The worker this effect started last, for its own stop.
    let id: number | null = null;
    const start = (first: boolean) => {
      timer = null;
      inTurn(async () => {
        // asked for, then the jam stopped before its turn came
        if (gone) return;
        // A stale schedule is cleared only when no stop is still being graded
        // against it: that stop clears it itself once its grade is read
        // (`src/songs/scheduleHold.ts`), and the pause lifts with the clear:
        // up to about 5.6 s behind a Session Take whose right notes are checked.
        id = await harmonyStart(chartRef.current, bpmRef.current, first && !scheduleHeld());
        // `gone` by now: the cleanup's stop is behind this in the queue and
        // finds the id
        if (gone) return;
        running.current = id !== null;
        // a form of one bar never changes bar: say where it is now
        if (id !== null && chartRef.current) harmonyMarkBar(formBarRef.current, bpmRef.current).catch(() => {});
      }).catch(() => {});
    };
    const unlisten = onHarmonyReading((next) => {
      if (gone) return;
      setLive(next);
      if (next === null) {
        running.current = false;
        if (retries < RETRIES && !timer) {
          retries += 1;
          timer = setTimeout(() => start(false), RETRY_MS);
        }
      }
    });
    start(true);
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
      running.current = false;
      setLive(null);
      void unlisten.then((off) => off()).catch(() => {});
      const stopped = inTurn(async () => (id === null ? null : harmonyStop(id))).catch(() => null);
      heardInRun.current = stopped;
      void stopped.then(rememberHeard);
    };
  }, [active, chartKey]);

  // The jam's run. Declared after the hearing above on purpose: a stop ends
  // both in one commit, and React runs the cleanups in this order, so the
  // hearing's stop is already in `heardInRun` when the run's end reads it.
  useEffect(() => {
    if (!jamRun) return;
    heardInRun.current = null;
    return () => {
      const at = Date.now();
      const heard = heardInRun.current;
      heardInRun.current = null;
      void (heard ?? Promise.resolve(null)).then((summary) =>
        publish(summary ? { type: "jamStopped", at, heard: summary } : { type: "jamStopped", at }),
      );
    };
  }, [jamRun]);

  // The bar lines, so the engine knows which chord of the chart sounds.
  useEffect(() => {
    if (!active || !chartRef.current || !running.current) return;
    harmonyMarkBar(formBar, bpmRef.current).catch(() => {});
  }, [active, formBar]);

  // The tempo: a jam with no chart sends no bar lines to carry it. In turn,
  // so it reaches the worker a start in flight is about to make.
  const toldBpm = useRef(bpm);
  useEffect(() => {
    if (!active || toldBpm.current === bpm) {
      toldBpm.current = bpm;
      return;
    }
    toldBpm.current = bpm;
    inTurn(() => harmonySetTempo(bpm)).catch(() => {});
  }, [active, bpm]);

  return active ? live : null;
}
