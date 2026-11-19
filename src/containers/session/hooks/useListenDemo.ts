/**
 * Listen first (card #28): Watch with Sound, on the engine.
 *
 * The demo is a song (`src/session/listenDemo.ts`) played through the Session's
 * one engine queue, so it never crosses a Take's sends. Its life:
 *
 * - **start**: whatever the ready screen had loaded (the Take's song and the
 *   scorer's schedule) is taken off, the demo's song goes on with its mix, and
 *   the transport starts. Nothing asks for the input and nothing is scheduled
 *   for the scorer, so nothing is heard as playing or graded.
 * - **the input**: the engine is told a demo is playing (`setListenDemo`)
 *   before it sounds and told it stopped after it is silent, so a
 *   microphone hearing the speakers is never counted as the player.
 * - **stop** (Watch again, its key, Start take, another view, a new step, the
 *   song's own end): the transport stops and the song goes. `active` stays up
 *   until the engine has said it stopped (`isPlaying` false), so the Session
 *   never reads the demo's play/stop edges as a Take's (`useSessionRun`).
 *   Then the ready screen loads its Take again.
 *
 * `active` is the Session's gate; `playing` is what the Watch button shows.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearScoreSchedule,
  clearSong,
  loadSong,
  onJamEnded,
  setListenDemo,
  setPlaying,
  setSongMix,
  storeLoad,
  storeSave,
} from "../../../ipc";
import type { JamBand } from "../../../jam";
import { LISTEN_SOUND_KEY, buildListenDemo } from "../../../session/listenDemo";
import type { TakePlan } from "../../../session/take";

export type ListenPhase = "off" | "on" | "stopping" | "stopped";

export type ListenDemoInput = {
  enqueue: (work: () => Promise<unknown>) => Promise<unknown>;
  isPlaying: boolean;
  /** The pattern on the ready screen, or null where there is none to hear. */
  take: TakePlan | null;
  /** A ready screen (a Take's, or a timed block's) is on: the only place a demo plays. */
  ready: boolean;
  /** The Session's view is on screen. */
  shown: boolean;
  instrument?: string;
  lineup?: JamBand;
  bandVolume: number;
  /** Something else the engine held is now gone (the Take's song): forget it. */
  onTakeOff?: () => void;
};

export type ListenDemoControl = {
  /** Watch plays the notes as well as lighting them (Settings, kept). */
  sound: boolean;
  setSound: (on: boolean) => void;
  /** The demo has the engine: the Session ignores the transport while this is up. */
  active: boolean;
  /** The demo is playing, as Watch shows it. */
  playing: boolean;
  /** How many demos have finished on this screen: Watch says "again" after one. */
  heard: number;
  start: () => void;
  /**
   * Stop it. `tail: false` when something the player plays starts straight
   * after (a warm-up's Start): the input counts at once rather than after the
   * demo's last note has rung out.
   */
  stop: (options?: { tail?: boolean }) => void;
};

/**
 * Give the input back to the player. Never silently: a lost "off" would leave
 * the input deaf until the engine's own bound runs out, so a failure is said
 * and tried once more.
 */
async function liftGate(tail: boolean): Promise<void> {
  try {
    await setListenDemo(false, { tail });
  } catch (err) {
    console.warn("[yames] the engine did not take the listen demo's end; trying again", err);
    try {
      await setListenDemo(false, { tail });
    } catch (again) {
      console.error("[yames] the input stays ignored until the demo's own bound runs out", again);
    }
  }
}

export function useListenDemo(input: ListenDemoInput): ListenDemoControl {
  const { isPlaying, take, ready, shown } = input;
  const [sound, setSoundState] = useState(true);
  const [phase, setPhase] = useState<ListenPhase>("off");
  const [heard, setHeard] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const latest = useRef(input);
  latest.current = input;
  /** Which demo the queued sends belong to: a stop makes the start before it moot. */
  const generation = useRef(0);
  /** The take the demo was built from, so a new one (a tempo nudge) stops it. */
  const playingTake = useRef<TakePlan | null>(null);

  useEffect(() => {
    void storeLoad<boolean>(LISTEN_SOUND_KEY).then((saved) => {
      if (saved === false) setSoundState(false);
    });
    // A page that reloaded in the middle of a demo left the engine ignoring
    // the input: this page plays no demo yet, so it hears the player at once.
    void latest.current.enqueue(() => liftGate(false));
  }, []);

  const setSound = useCallback((on: boolean) => {
    setSoundState(on);
    void storeSave(LISTEN_SOUND_KEY, on).catch(() => {});
  }, []);

  const stop = useCallback((options?: { tail?: boolean }) => {
    const tail = options?.tail ?? true;
    const now = phaseRef.current;
    if (now === "off" || now === "stopping" || now === "stopped") return;
    const mine = ++generation.current;
    phaseRef.current = "stopping";
    setPhase("stopping");
    playingTake.current = null;
    void latest.current.enqueue(async () => {
      await setPlaying(false).catch(() => {});
      await clearSong().catch(() => {});
      // Silent now: the input is the player's again (after the last note's
      // tail, unless what comes next is the player's own).
      await liftGate(tail);
      if (generation.current === mine) {
        phaseRef.current = "stopped";
        setPhase("stopped");
      }
    });
  }, []);

  const start = useCallback(() => {
    const { take: plan, ready: onReady, instrument, lineup, bandVolume } = latest.current;
    if (!plan || !onReady || phaseRef.current !== "off") return;
    const mine = ++generation.current;
    phaseRef.current = "on";
    setPhase("on");
    playingTake.current = plan;
    latest.current.onTakeOff?.();
    const demo = buildListenDemo(plan, { instrument, lineup, bandVolume });
    void latest.current.enqueue(async () => {
      if (generation.current !== mine) return;
      try {
        await setPlaying(false).catch(() => {});
        // Nothing for the scorer, and nothing the input hears counts: the
        // demo is never heard as a Take, nor as practice.
        await clearScoreSchedule().catch(() => {});
        await setListenDemo(true, { lengthMs: demo.lengthMs }).catch((err) => {
          console.warn("[yames] the engine was not told a listen demo is playing", err);
        });
        const importer = await import("../../../songs/import");
        const transport = importer.buildTransport(demo.score, demo.range, {
          loops: false,
          tempoPercent: 100,
          countInBars: demo.countInBars,
          startTick: 0,
        });
        await loadSong(transport, demo.backing);
        await setSongMix(demo.mix);
        if (generation.current !== mine) return;
        await setPlaying(true);
        // Armed again as it starts to sound: the deadline is from now, so a
        // slow load cannot let the last note through.
        await setListenDemo(true, { lengthMs: demo.lengthMs }).catch((err) => {
          console.warn("[yames] the engine was not told the listen demo started", err);
        });
      } catch (err) {
        console.warn("[yames] the listen demo would not load", err);
        if (generation.current === mine) {
          await clearSong().catch(() => {});
          await liftGate(false);
          phaseRef.current = "stopped";
          setPhase("stopped");
        }
      }
    });
  }, []);

  // Stopped, and the engine agrees: the ready screen has the engine back. Off a
  // ready screen (a warm-up's Start already playing) there is no Take edge to
  // mistake, so the sends being done is enough.
  useEffect(() => {
    if (phase !== "stopped" || (isPlaying && ready)) return;
    phaseRef.current = "off";
    setPhase("off");
    setHeard((n) => n + 1);
  }, [phase, isPlaying, ready]);

  // The song played to its end and stopped itself.
  useEffect(() => {
    if (phase !== "on") return;
    const off = onJamEnded(() => stop());
    return () => {
      void off.then((fn) => fn()).catch(() => {});
    };
  }, [phase, stop]);

  // Leaving the ready screen, the Session, or a new pattern: it stops.
  useEffect(() => {
    if (phaseRef.current !== "on") return;
    if (!ready || !shown || (playingTake.current && take !== playingTake.current)) stop();
  }, [ready, shown, take, stop]);

  // A new ready screen says "Watch" again, not "again".
  useEffect(() => {
    setHeard(0);
  }, [take]);

  return useMemo(
    () => ({ sound, setSound, active: phase !== "off", playing: phase === "on", heard, start, stop }),
    [sound, setSound, phase, heard, start, stop],
  );
}
