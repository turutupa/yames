import { useEffect, useRef, useState } from "react";
import { harmonyMarkBar, harmonyStart, harmonyStop, onHarmonyReading } from "../ipc";
import type { HeardChart, HeardLive } from "../ipc";
import { rememberHeard } from "./heard";

/** How long after the worker ended by itself before it is asked for again. */
const RETRY_MS = 1500;
const RETRIES = 3;

/**
 * Runs the free-play engine while `active`: the setting is on, a jam is
 * playing and the input is listening. Off, nothing is invoked at all.
 *
 * The worker ends when the input stops (a device change restarts the input);
 * the page is told with a null reading and asks again, a few times.
 */
export function useHeard({
  active,
  chart,
  bpm,
  formBar,
}: {
  active: boolean;
  chart: HeardChart | null;
  bpm: number;
  formBar: number;
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

  useEffect(() => {
    if (!active) return;
    let gone = false;
    let retries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const start = () => {
      timer = null;
      harmonyStart(chartRef.current, bpmRef.current)
        .then((started) => {
          if (gone) return;
          running.current = started;
          // a form of one bar never changes bar: say where it is now
          if (started && chartRef.current) harmonyMarkBar(formBarRef.current, bpmRef.current).catch(() => {});
        })
        .catch(() => {});
    };
    const unlisten = onHarmonyReading((next) => {
      if (gone) return;
      setLive(next);
      if (next === null) {
        running.current = false;
        if (retries < RETRIES && !timer) {
          retries += 1;
          timer = setTimeout(start, RETRY_MS);
        }
      }
    });
    start();
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
      running.current = false;
      setLive(null);
      void unlisten.then((off) => off()).catch(() => {});
      harmonyStop()
        .then(rememberHeard)
        .catch(() => {});
    };
  }, [active, chartKey]);

  // The bar lines, so the engine knows which chord of the chart sounds.
  useEffect(() => {
    if (!active || !chartRef.current || !running.current) return;
    harmonyMarkBar(formBar, bpmRef.current).catch(() => {});
  }, [active, formBar]);

  return active ? live : null;
}
