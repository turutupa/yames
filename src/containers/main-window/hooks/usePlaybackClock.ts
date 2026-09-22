import { useEffect, useRef, useState } from "react";
import type { BeatEvent } from "../../../types";

/**
 * Bars and seconds since playback started, for the docked transport.
 *
 * WHAT `isDownbeat` ACTUALLY MEANS. Not "the top of a bar". The engine sets
 * it from `sub == 0` on the song path and `sub_count == 0` on the click's
 * (`engine.rs`), so it is true once per BEAT and false only on a subdivision
 * tick — "this tick is a whole beat" and nothing more. Every other reader
 * wants exactly that (the accent dots, the group editor's sub-beat state, the
 * zen visuals), so the field keeps its meaning and the counting moved here:
 * this hook used to add a bar on every one of them and say "4" on beat four
 * of bar one.
 *
 * The first beat of a bar is `isDownbeat && measureBeat === 0`, which is the
 * same pair the engine itself tests when it opens a bar (the crash on the
 * one: `measure_beat == 0 && sub_count == 0`). `measureBeat` is bar-local and
 * captured before the counters advance, so it is 0 again the moment the meter
 * changes mid-play — a beat-group change resets it deliberately — and a tempo
 * change never touches it.
 *
 * WHERE THE ENGINE KNOWS BETTER, IT IS ASKED. In Songs the event carries
 * `songBar`, the played bar of the piece, and the tab cursor is drawn from
 * the same field: reading it rather than counting is what stops the readout
 * and the cursor disagreeing over a loop, a repeat or a range that does not
 * start at bar one. A jam's bar reaches the transport the same way and does
 * not come through here at all — `Transport` reads `formBar`/`chorus` off the
 * event directly, and this hook could not: `formBar` 0 of `chorus` 1 is also
 * what a plain click reports, so there is no telling a jam from a metronome
 * by the event alone. On that tab the number this hook returns is the running
 * total, which is the only thing left to mean.
 *
 * Bars are otherwise counted rather than read because `BeatEvent` carries no
 * bar length and the engine's `beat` is a running total that does not reset
 * when the meter changes mid-play.
 *
 * The clock is wall time, not derived from the beat count: a tempo ramp
 * changes how long a bar lasts, and "elapsed" should keep meaning elapsed.
 */
export function usePlaybackClock(running: boolean, currentBeat: BeatEvent | null) {
  const [bar, setBar] = useState(1);
  const [elapsedSeconds, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);
  const lastBeat = useRef<number | null>(null);
  const lastSub = useRef<number | null>(null);
  const barsSeen = useRef(0);

  // Reset on every start; freeze (rather than clear) on stop, so the numbers
  // are still readable after the last note.
  useEffect(() => {
    if (!running) {
      startedAt.current = null;
      lastBeat.current = null;
      lastSub.current = null;
      return;
    }
    setBar(1);
    setElapsed(0);
    startedAt.current = Date.now();
    lastBeat.current = null;
    lastSub.current = null;
    barsSeen.current = 0;
    const id = setInterval(() => {
      if (startedAt.current !== null) {
        setElapsed((Date.now() - startedAt.current) / 1000);
      }
    }, 500);
    return () => clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (!running || !currentBeat) return;
    // The engine can re-emit the same tick; only act on a new one. A tick is
    // its beat AND its subdivision — with 8ths selected two events share a
    // beat index, and a bar opens on the first of them.
    if (lastBeat.current === currentBeat.beat && lastSub.current === currentBeat.subdivision) {
      return;
    }
    lastBeat.current = currentBeat.beat;
    lastSub.current = currentBeat.subdivision;

    // A COUNT-IN IS NOT A BAR OF THE PIECE. The click's own never arrives —
    // the event loop swallows those beats before they reach the window — but
    // a song's does, because somebody counting you in is something to watch.
    if (currentBeat.songCountIn) return;

    // Songs: the engine's own bar, 0-based on the wire and 1-based on screen,
    // exactly as `songPosition` reads it for the cursor.
    if (typeof currentBeat.songBar === "number") {
      setBar(currentBeat.songBar + 1);
      return;
    }

    // Everything else counts bar lines. The first one seen is bar one, not
    // bar two, and a run that began part-way through a bar spends that
    // fragment on bar one rather than promoting it to a bar of its own.
    if (currentBeat.isDownbeat && currentBeat.measureBeat === 0) {
      barsSeen.current += 1;
      setBar(barsSeen.current);
    }
  }, [running, currentBeat]);

  return { bar, elapsedSeconds };
}
