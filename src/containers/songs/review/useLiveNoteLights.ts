/**
 * Notes lighting as they are hit, while the transport runs (`SONGS.md` A7).
 *
 * ## What this is honest about
 *
 * **There is no live per-onset event, and this stands in for one.** The
 * analyzer's per-onset verdicts (`onsetResults`) are produced by
 * `ScheduleRun::report`, which only runs when a segment closes — so the first
 * moment anything knows that onset 41 was a miss is after you stopped. The
 * only thing that arrives *during* a pass is `beat-feedback`, one event per
 * beat, carrying a classification and a deviation, and that is what the
 * metronome's own live ring has always drawn from.
 *
 * So: a beat's verdict lights every attack that falls inside that beat. On a
 * bar of quarter notes that is exact. On a bar of sixteenths it is one
 * verdict across four attacks, which is a smear — and the review that appears
 * the moment you stop replaces it with the real thing, per onset. The brief
 * allows exactly this and asks that it be said out loud, so it is said here
 * and in the report.
 *
 * Nothing here costs the click anything: it is an event listener and a map,
 * on the UI thread, and the audio side does not know it exists.
 */
import { useEffect, useRef, useState } from "react";
import { onBeatFeedback } from "../../../ipc";
import type { BeatFeedback } from "../../../types";
import type { TimingMark } from "./marks";
import type { ScoreSchedule } from "../../../songs/types";

export type LiveLights = ReadonlyMap<number, TimingMark>;

/** A beat's verdict, as one of the marks the review already draws. */
export function markFromFeedback(feedback: BeatFeedback): TimingMark | null {
  const early = feedback.deviationMs < 0;
  switch (feedback.classification) {
    case "perfect":
      return "onTime";
    case "good":
      return early ? "slightlyEarly" : "slightlyLate";
    case "ok":
      return early ? "early" : "late";
    case "miss":
      return "missed";
    // A beat nobody played over is not a verdict about the score — the
    // player may simply be resting where the score rests.
    case "skipped":
      return null;
  }
}

/** Which onsets of a schedule fall inside one beat of the played range. */
export function onsetsInBeat(schedule: ScoreSchedule, beatInRange: number): number[] {
  const floor = Math.floor(beatInRange);
  const out: number[] = [];
  for (const onset of schedule.onsets) {
    if (onset.beat >= floor && onset.beat < floor + 1) out.push(onset.id);
  }
  return out;
}

export type LiveLightsInput = {
  schedule: ScoreSchedule | null;
  /** Quarter notes from the start of the range, as the cursor has it. */
  beatInRange: number;
  isPlaying: boolean;
};

export function useLiveNoteLights(input: LiveLightsInput): LiveLights {
  const [lights, setLights] = useState<LiveLights>(() => new Map());

  // Read through a ref: a feedback event is about the beat that just
  // happened, and the listener must not be torn down and rebuilt every time
  // the cursor moves.
  const latest = useRef(input);
  latest.current = input;

  useEffect(() => {
    if (!input.isPlaying) {
      // The review takes over the moment the transport stops, and a stale
      // smear underneath it would disagree with it note for note.
      setLights(new Map());
      return;
    }
    let stop: (() => void) | undefined;
    const unlisten = onBeatFeedback((feedback) => {
      const { schedule, beatInRange } = latest.current;
      if (!schedule) return;
      const mark = markFromFeedback(feedback);
      if (!mark) return;
      const ids = onsetsInBeat(schedule, beatInRange);
      if (ids.length === 0) return;
      setLights((previous) => {
        const next = new Map(previous);
        for (const id of ids) next.set(id, mark);
        return next;
      });
    });
    void unlisten.then((fn) => {
      stop = fn;
    });
    return () => {
      void unlisten.then((fn) => fn());
      stop?.();
    };
  }, [input.isPlaying]);

  return lights;
}
