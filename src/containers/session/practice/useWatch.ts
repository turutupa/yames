/**
 * Watch, for every view (acceptance 5, P1-1): the Neck, the Runway and the Tab
 * show the same thing when the player asks to see the pattern before playing
 * it, and the same Watch and Sound buttons sit under each.
 *
 * Watch has two sources, and every view reads them the same way, as a
 * `BeatPosition` it already knows how to follow:
 *
 * - **Sound on** (card #28, the default): the Session's demo on the engine
 *   (`useListenDemo`). Its position is the engine's own report (`beat`).
 * - **Sound off**: a silent preview. Its position is made here, at the Take's
 *   tempo, a bar of count-in and then the pattern looping until stopped. It is
 *   reported once a beat; each view smooths between reports with the same
 *   cursor it smooths the engine's with (`songs/cursor`, `usePracticeCursor`).
 *
 * The hotkey (L unless remapped) reaches whichever screen is on through
 * `watchBus`. Stopping is the same everywhere: the button again, its key,
 * Start, another view, or leaving the screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BeatPosition } from "../../../songs/position";
import { TICKS_PER_QUARTER } from "../../../songs/types";
import type { TakePlan } from "../../../session/take";
import { TAKE_COUNT_IN_BARS } from "../../../session/take";
import { runwayModel } from "../highway/runwayModel";
import type { RunwayModel } from "../highway/runwayModel";
import type { ListenDemoControl } from "../hooks/useListenDemo";
import { onToggleWatch } from "./watchBus";
import { closeAsk } from "../../coach/askStore";

export type WatchControl = {
  /** Something to watch: a ready screen with a pattern of more than one note. */
  canWatch: boolean;
  /** Watch can play the notes (a ready screen with the demo): the Sound switch is shown. */
  hasSound: boolean;
  /** Watch plays the notes (Settings, kept). */
  soundOn: boolean;
  /** Watch is on: the demo playing, or the silent preview running. */
  showing: boolean;
  /** One demo has been heard on this screen: Watch says "again". */
  again: boolean;
  /** Where the watched pattern is: the demo's engine report or the preview's own. Null when not watching. */
  beat: BeatPosition | null;
  /** The watched pattern is moving (the engine plays the demo; the preview always). */
  playing: boolean;
  /** The silent preview's loop, in ticks, for a view that unwraps passes (the Tab). */
  loopTicks: number;
  toggle: () => void;
  toggleSound: () => void;
};

/** The silent preview's clock: where it is after `elapsed` ticks of it. */
export function silentWatchPosition(
  model: Pick<RunwayModel, "barTicks" | "countInTicks" | "endTick" | "onsets">,
  elapsed: number,
): BeatPosition {
  const start = model.barTicks[0] ?? model.onsets[0]?.tick ?? 0;
  const lead = Math.max(0, start - model.countInTicks);
  if (elapsed < lead) return { songBar: null, songTick: model.countInTicks + Math.max(0, elapsed), songPass: 0, songCountIn: true };
  const span = Math.max(1, model.endTick - start);
  const into = elapsed - lead;
  return { songBar: null, songTick: start + (into % span), songPass: Math.floor(into / span), songCountIn: false };
}

/** The silent preview's position, reported once a beat while it runs. */
function useSilentWatch(model: RunwayModel | null, bpm: number, perQuarter: number, on: boolean): BeatPosition | null {
  const [pos, setPos] = useState<BeatPosition | null>(null);
  useEffect(() => {
    if (!on || !model) {
      setPos(null);
      return;
    }
    const t0 = performance.now();
    const perMs = (Math.max(1, bpm) * perQuarter) / 60_000;
    let id = 0;
    const report = () => {
      const elapsed = (performance.now() - t0) * perMs;
      setPos(silentWatchPosition(model, elapsed));
      const next = (Math.floor(elapsed / perQuarter) + 1) * perQuarter;
      id = window.setTimeout(report, Math.max(15, (next - elapsed) / perMs + 2));
    };
    report();
    return () => window.clearTimeout(id);
  }, [on, model, bpm, perQuarter]);
  return on ? pos : null;
}

export function useWatch({
  take,
  running,
  listen,
  beat,
  isPlaying,
  view,
}: {
  take: TakePlan | null;
  /** The pattern itself runs (a Take, a warm-up after Start): no Watch then. */
  running: boolean;
  /** The demo, on a ready screen. Absent: Watch is the silent preview alone and there is no Sound switch. */
  listen?: ListenDemoControl;
  /** The engine's report: where the demo is. */
  beat: BeatPosition | null;
  isPlaying: boolean;
  /** The view on screen: changing it stops Watch, as it always has. */
  view: string;
}): WatchControl {
  const model = useMemo(() => (take ? runwayModel(take, TAKE_COUNT_IN_BARS) : null), [take]);
  const perQuarter = take && take.score.ticksPerQuarter > 0 ? take.score.ticksPerQuarter : TICKS_PER_QUARTER;
  const canWatch = !running && !!model && model.onsets.length > 1;
  const [watching, setWatching] = useState(false);
  const hearing = !running && !!listen?.playing;
  const showing = canWatch && (watching || hearing);
  const silent = useSilentWatch(model, take?.bpm ?? 0, perQuarter, canWatch && watching);
  // Watch and Hear it move the picture: Ask's drawer gets out of its way (leg c2a1).
  useEffect(() => {
    if (showing) closeAsk({ restoreFocus: false });
  }, [showing]);

  const latest = useRef({ running, listen, canWatch });
  latest.current = { running, listen, canWatch };

  /** Watch, or stop watching: the demo with Sound on, the silent preview with it off. */
  const toggle = useCallback(() => {
    const { running: isRunning, listen: demo, canWatch: can } = latest.current;
    if (isRunning || !can) return;
    if (demo?.sound) {
      setWatching(false);
      if (demo.playing) demo.stop();
      else if (!demo.active) demo.start();
      return;
    }
    setWatching((w) => !w);
  }, []);
  useEffect(() => onToggleWatch(toggle), [toggle]);

  /** Sound on or off. Whatever was being watched stops, so the switch is never half-applied. */
  const toggleSound = useCallback(() => {
    const demo = latest.current.listen;
    if (!demo) return;
    setWatching(false);
    if (demo.active) demo.stop();
    demo.setSound(!demo.sound);
  }, []);

  // A Take or a warm-up started, a new pattern, or another view: the preview stops.
  useEffect(() => {
    if (running) setWatching(false);
  }, [running]);
  useEffect(() => {
    setWatching(false);
  }, [take]);
  const firstView = useRef(view);
  useEffect(() => {
    if (view === firstView.current) return;
    firstView.current = view;
    setWatching(false);
    const demo = latest.current.listen;
    if (demo?.playing) demo.stop();
  }, [view]);
  // Leaving the screen: a demo it started does not outlive it.
  useEffect(() => () => latest.current.listen?.stop(), []);

  const position = !showing ? null : hearing ? beat : silent;
  return {
    canWatch,
    hasSound: canWatch && !!listen,
    soundOn: !!listen?.sound,
    showing,
    again: !!listen?.sound && (listen?.heard ?? 0) > 0,
    beat: position,
    playing: showing && (hearing ? isPlaying : !!silent),
    loopTicks: model ? Math.max(1, model.endTick - (model.barTicks[0] ?? 0)) : 0,
    toggle,
    toggleSound,
  };
}
