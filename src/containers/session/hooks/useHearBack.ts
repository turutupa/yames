/**
 * "Hear bar N: yours, then the demo" (DESIGN 4.2 "Hear it back", leg c5b2):
 * the player's own bar from the Take just played, then the demo of that bar
 * at the Take's tempo. The engine half is c5b1 (`hearTake` and its slot); this
 * is the sequence, every send through the Session's one engine queue.
 *
 * 1. **The press**: the voice's line is cut (`setVoiceHearing`) and the input
 *    is gated as the listen demo gates it (`setListenDemo(true, ...)`), so the
 *    speakers are never heard as the player; then `hearTake(serial, N, N)`.
 * 2. **The player's bar ends** (`take-playback-ended` for that generation, or
 *    a bound past its length): `stopHearTake(generation)` is AWAITED first
 *    (c5b1b review L1: the bar must be out of the take slot before anything
 *    starts), then the demo of the pattern bar (`buildListenDemo` with
 *    `bars`), its song, its mix, and the transport.
 * 3. **The end** (the demo's own end, a second press, Start, leaving the
 *    result, a new step, leaving the Session): the hear-back is stopped, the
 *    demo's song taken off, the gate lifted. The ready screen that comes next
 *    loads its Take again, as after a listen demo (`onTakeOff`).
 *
 * `active` stays up until the engine has said it stopped, so the Session
 * never reads the demo's play/stop edges as a Take's. State: refs, plus one
 * `useState` for the chip, set at the press, at the boundary between the
 * halves, and at the end. Nothing here runs per frame or per beat.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearScoreSchedule,
  clearSong,
  hearTake,
  heardTake,
  loadSong,
  onJamEnded,
  onTakePlaybackEnded,
  setListenDemo,
  setPlaying,
  setSongMix,
  stopHearTake,
} from "../../../ipc";
import type { HeldTake } from "../../../ipc";
import type { JamBand } from "../../../jam";
import type { HearBar, HearStage } from "../../../coach/hearBack";
import { setVoiceHearing } from "../../../coach/voice";
import type { RunPhase } from "../../../session/runner";
import { buildListenDemo } from "../../../session/listenDemo";
import type { TakePlan } from "../../../session/take";
import { whenScheduleFree } from "../../../songs/scheduleHold";
import { onSoundStarting } from "../../../soundGate";
import { liftGate } from "./useListenDemo";

/**
 * When to ask again whether the Take's audio is held: the engine moves it into
 * its slot at the very end of the notes pass, a moment after the late grade the
 * result is drawn from (c5b1). The last answer stands.
 */
export const HELD_ASKS_MS = [0, 400, 1200, 2500, 5000] as const;

/** Past the player's bar's own length, the ending is taken as given if the event never came. */
export const YOURS_BOUND_MS = 1500;
/** Past the demo's own length, the same. */
export const DEMO_BOUND_MS = 3000;
/** The player's bar's margins (150 ms before, 300 after), with room: the first gate, before its length is known. */
const YOURS_GUESS_MS = 1000;

export type HearBackInput = {
  enqueue: (work: () => Promise<unknown>) => Promise<unknown>;
  isPlaying: boolean;
  phase: RunPhase;
  /** The result's Take (`TakeOutcome.takeId`), or null. */
  takeId: string | null;
  /** The pitch pass's serial its grade carried (`ScorerTakeGrade.notesSerial`), or null: never held then. */
  serial: number | null;
  /** The Take as played (its Exercise, variant and tempo). */
  take: TakePlan | null;
  /** The Session's view is on screen. */
  shown: boolean;
  instrument?: string;
  lineup?: JamBand;
  bandVolume: number;
  /** The Take's song is about to leave the engine (the demo's goes on): forget it. */
  onTakeOff?: () => void;
};

export type HearBackControl = {
  /** What the engine said about this result's Take; null before it has answered. */
  held: HeldTake | null;
  stage: HearStage;
  /** The played bar being heard, while it is. */
  bar: number | null;
  /** It has the engine (or has not let it go yet): the Session ignores the transport. */
  active: boolean;
  /** The chip: start for this bar, or stop what is playing. */
  toggle: (bar: HearBar) => void;
  stop: (options?: { tail?: boolean }) => void;
};

type Shown = { stage: HearStage; bar: number | null };
const OFF: Shown = { stage: "off", bar: null };

export function useHearBack(input: HearBackInput): HearBackControl {
  const { isPlaying, phase, takeId, serial, shown } = input;
  const latest = useRef(input);
  latest.current = input;
  const [now, setNow] = useState<Shown>(OFF);
  const stageRef = useRef<HearStage>("off");
  /** Which press the queued sends belong to: a stop makes everything before it moot. */
  const generation = useRef(0);
  /** The engine's playback generation of the player's bar, until it is stopped. */
  const engineGen = useRef<number | null>(null);
  /** The demo's song is on the engine. */
  const demoLoaded = useRef(false);
  /** Our own Start is being sent: the sound gate's call is ours, not a Start to stop for. */
  const selfStart = useRef(false);
  /** A Start from elsewhere cut it: the transport is not ours to stop. */
  const cutByStart = useRef(false);
  const bound = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [held, setHeld] = useState<{ takeId: string; serial: number; held: HeldTake } | null>(null);

  const show = useCallback((stage: HearStage, bar: number | null) => {
    stageRef.current = stage;
    setNow({ stage, bar });
  }, []);
  const clearBound = useCallback(() => {
    if (bound.current !== null) clearTimeout(bound.current);
    bound.current = null;
  }, []);
  /** The stop's sends are done with a demo on the transport: off once the engine says it is silent. */
  const settled = useRef(false);

  const stop = useCallback(
    (options?: { tail?: boolean }) => {
      const at = stageRef.current;
      if (at === "off" || at === "stopped") return;
      const tail = options?.tail ?? true;
      const mine = ++generation.current;
      clearBound();
      settled.current = false;
      show("stopped", null);
      void latest.current.enqueue(async () => {
        const g = engineGen.current;
        engineGen.current = null;
        if (g !== null) await stopHearTake(g).catch(() => false);
        const hadDemo = demoLoaded.current;
        demoLoaded.current = false;
        if (hadDemo && !cutByStart.current) {
          await setPlaying(false).catch(() => {});
          await clearSong().catch(() => {});
        }
        cutByStart.current = false;
        await liftGate(tail);
        setVoiceHearing(false);
        if (generation.current !== mine) return;
        // Nothing played through the transport: nothing to wait for.
        if (!hadDemo || !latest.current.isPlaying) return show("off", null);
        settled.current = true;
      });
    },
    [clearBound, show],
  );

  // Stopped, and the engine agrees it is silent: the result has the engine back.
  useEffect(() => {
    if (!settled.current || stageRef.current !== "stopped" || isPlaying) return;
    settled.current = false;
    show("off", null);
  }, [isPlaying, show]);

  /** The player's bar ran out: the demo of it, once the bar has left the take slot. */
  const yoursEnded = useCallback(
    (mine: number, g: number, bar: HearBar) => {
      if (generation.current !== mine || stageRef.current !== "yours" || engineGen.current !== g) return;
      clearBound();
      show("demo", bar.played);
      const { take, instrument, lineup, bandVolume } = latest.current;
      if (!take) return stop();
      const demo = buildListenDemo(take, { instrument, lineup, bandVolume, bars: { from: bar.pattern, to: bar.pattern } });
      void latest.current.enqueue(async () => {
        // First, and awaited: the player's bar out of the take slot (review L1).
        await stopHearTake(g).catch(() => false);
        if (engineGen.current === g) engineGen.current = null;
        if (generation.current !== mine) return;
        try {
          latest.current.onTakeOff?.();
          demoLoaded.current = true;
          // After any stop still being graded against it (`scheduleHold.ts`).
          await whenScheduleFree();
          await clearScoreSchedule().catch(() => {});
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
          selfStart.current = true;
          const started = setPlaying(true);
          selfStart.current = false;
          await started;
          // Armed again as it starts to sound: the deadline is from now.
          await setListenDemo(true, { lengthMs: demo.lengthMs }).catch((err) => {
            console.warn("[yames] the engine was not told the demo of the bar started", err);
          });
          if (generation.current === mine) {
            clearBound();
            bound.current = setTimeout(() => {
              if (generation.current === mine && stageRef.current === "demo") stop();
            }, demo.lengthMs + DEMO_BOUND_MS);
          }
        } catch (err) {
          selfStart.current = false;
          console.warn("[yames] the demo of the bar would not load", err);
          if (generation.current === mine) stop();
        }
      });
    },
    [clearBound, show, stop],
  );

  const toggle = useCallback(
    (bar: HearBar) => {
      const at = stageRef.current;
      if (at === "yours" || at === "demo") return stop();
      if (at !== "off") return;
      const { serial: asked, take, phase: where } = latest.current;
      if (asked === null || !take || where !== "result") return;
      const mine = ++generation.current;
      cutByStart.current = false;
      show("yours", bar.played);
      setVoiceHearing(true);
      // The longest the gate needs before the player's bar's own length is known.
      const guess = buildListenDemo(take, { bars: { from: bar.pattern, to: bar.pattern } }).lengthMs;
      void latest.current.enqueue(async () => {
        if (generation.current !== mine) return;
        try {
          await setListenDemo(true, { lengthMs: 2 * guess + YOURS_GUESS_MS }).catch((err) => {
            console.warn("[yames] the engine was not told the bar is playing back", err);
          });
          const back = await hearTake(asked, bar.played, bar.played);
          // Kept whatever happened meanwhile: a stop queued behind this one stops it.
          engineGen.current = back.generation;
          if (generation.current !== mine) return;
          // The gate for both halves, now that the first one's length is known.
          await setListenDemo(true, { lengthMs: back.lengthMs + 2 * guess }).catch(() => {});
          if (generation.current !== mine) return;
          clearBound();
          bound.current = setTimeout(() => yoursEnded(mine, back.generation, bar), back.lengthMs + YOURS_BOUND_MS);
        } catch (err) {
          // Refused (not held any more, the click running): nothing to hear.
          console.warn("[yames] the bar could not be played back", err);
          if (generation.current !== mine) return;
          await liftGate(false);
          setVoiceHearing(false);
          if (generation.current === mine) show("off", null);
        }
      });
    },
    [clearBound, show, stop, yoursEnded],
  );

  // The player's bar ran off its end.
  const barRef = useRef<HearBar | null>(null);
  useEffect(() => {
    if (now.stage !== "yours") return;
    const off = onTakePlaybackEnded((g) => {
      const mine = generation.current;
      const bar = barRef.current;
      if (g === undefined || g !== engineGen.current || !bar) return;
      yoursEnded(mine, g, bar);
    });
    return () => {
      void off.then((fn) => fn()).catch(() => {});
    };
  }, [now.stage, yoursEnded]);
  const toggleWithBar = useCallback(
    (bar: HearBar) => {
      if (stageRef.current === "off") barRef.current = bar;
      toggle(bar);
    },
    [toggle],
  );

  // The demo played to its end and stopped itself.
  useEffect(() => {
    if (now.stage !== "demo") return;
    const off = onJamEnded(() => stop());
    return () => {
      void off.then((fn) => fn()).catch(() => {});
    };
  }, [now.stage, stop]);

  // Any Start that is not ours (the engine has already cut the bar).
  useEffect(
    () =>
      onSoundStarting(() => {
        if (selfStart.current) return;
        const at = stageRef.current;
        if (at !== "yours" && at !== "demo") return;
        cutByStart.current = true;
        stop({ tail: false });
      }),
    [stop],
  );

  // Leaving the result (Go again, Slower, a loop, the next step, the recap),
  // another Take's result, or the Session's view: stopped.
  const playedFor = useRef<string | null>(null);
  useEffect(() => {
    const at = stageRef.current;
    if (at === "yours" || at === "demo") {
      if (phase !== "result" || !shown || takeId !== playedFor.current) stop({ tail: false });
    }
    if (at === "off" && phase === "result") playedFor.current = takeId;
  }, [phase, takeId, shown, stop, now.stage]);

  // Unmounted mid-way: let the bar and the demo go.
  useEffect(
    () => () => {
      clearBound();
      stop({ tail: false });
    },
    [clearBound, stop],
  );

  // Is this result's Take held? Asked a few times: the audio is moved into the
  // slot a moment after the grade the result was drawn from.
  useEffect(() => {
    if (phase !== "result" || serial === null || takeId === null) return;
    let gone = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let answered = false;
    HELD_ASKS_MS.forEach((at, i) => {
      timers.push(
        setTimeout(() => {
          if (gone || answered) return;
          void heardTake(serial)
            .then((answer) => {
              if (gone || answered) return;
              if (answer.held || i === HELD_ASKS_MS.length - 1) {
                answered = true;
                setHeld({ takeId, serial, held: answer });
              }
            })
            .catch(() => {});
        }, at),
      );
    });
    return () => {
      gone = true;
      timers.forEach(clearTimeout);
    };
  }, [phase, serial, takeId]);

  const heldNow = held && held.takeId === takeId && held.serial === serial ? held.held : null;
  return useMemo(
    () => ({
      held: heldNow,
      stage: now.stage,
      bar: now.bar,
      active: now.stage !== "off",
      toggle: toggleWithBar,
      stop,
    }),
    [heldNow, now, toggleWithBar, stop],
  );
}
