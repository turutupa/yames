/**
 * Notes lighting as they are hit, while the transport runs (`SONGS.md` A7).
 *
 * ## Two sources, and which one wins
 *
 * **`score-onset` is the real thing.** With a `ScoreSchedule` loaded, the
 * analyzer already knows which expected onset each played note matched, and
 * it now says so as it happens: one event per expected note, as soon as that
 * note's matching window closes, carrying the same state and deviation the
 * review will carry. A bar of sixteenths lights four different notes on four
 * different verdicts. Provisional by nature — the alignment at the end of the
 * attempt can still revise the last bar — and the review that appears the
 * moment you stop is the authority either way.
 *
 * **`beat-feedback` is the fallback, and stays.** It is what the metronome's
 * own live ring has always drawn from: one verdict per beat, no knowledge of
 * a score. With no schedule loaded nothing emits a `score-onset` at all, so
 * this is what a drill or a path step with no material behind it gets, and a
 * beat's verdict then lights every attack inside that beat — exact on
 * quarters, a smear on sixteenths.
 *
 * The switch is one-way and per pass: the first `score-onset` to arrive turns
 * the beat smear off. Two sources painting the same notes would disagree —
 * the beat verdict is about the click and the onset verdict is about the note
 * — and the one that knows which note it means should win.
 *
 * Nothing here costs the click anything: two event listeners and a map, on
 * the UI thread, and the audio side does not know it exists.
 */
import { useEffect, useRef, useState } from "react";
import { onBeatFeedback, onScoreOnset, scoreTimingBands } from "../../../ipc";
import type { LiveOnset, TimingBands } from "../../../ipc";
import type { BeatFeedback } from "../../../types";
import { markFor } from "./marks";
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

/**
 * A live per-note verdict, as the same mark the review will draw.
 *
 * Through `markFor`, and through the same `bands` the review is given, so a
 * note that lights amber mid-pass does not turn green in the panel underneath
 * it a second later. `markFor` reads only the three fields a `LiveOnset`
 * carries; the accent verdict a full `OnsetResult` also has is not one of
 * them, and is not known live (`score.rs`).
 */
export function markFromOnset(onset: LiveOnset, bands: TimingBands | null): TimingMark {
  return markFor(
    { id: onset.id, state: onset.state, deviationMs: onset.deviationMs, pass: onset.pass },
    bands,
  );
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
  /** The click's tempo, for the bands a live mark is drawn against. */
  bpm?: number;
};

export function useLiveNoteLights(input: LiveLightsInput): LiveLights {
  const [lights, setLights] = useState<LiveLights>(() => new Map());

  // Read through a ref: a feedback event is about the beat that just
  // happened, and the listener must not be torn down and rebuilt every time
  // the cursor moves.
  const latest = useRef(input);
  latest.current = input;

  /**
   * The same thresholds the review will use, fetched once per schedule.
   *
   * `null` until it answers, and `null` for good on a build whose command
   * fails — `markFor` then draws everything that was hit as on time and
   * everything missed as missed, which is coarser and not wrong.
   */
  const bands = useRef<TimingBands | null>(null);
  const { schedule, bpm } = input;
  useEffect(() => {
    bands.current = null;
    if (!schedule) return;
    let alive = true;
    void scoreTimingBands(schedule, 60_000 / Math.max(1, bpm ?? 120))
      .then((found) => {
        if (alive) bands.current = found;
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [schedule, bpm]);

  useEffect(() => {
    if (!input.isPlaying) {
      // The review takes over the moment the transport stops, and a stale
      // smear underneath it would disagree with it note for note.
      setLights(new Map());
      return;
    }
    // Once the analyzer has said something about a NOTE, it stops being
    // useful to say anything about the beat it was in.
    let perNote = false;
    let stopBeats: (() => void) | undefined;
    let stopOnsets: (() => void) | undefined;

    const onsets = onScoreOnset((onset) => {
      const { schedule } = latest.current;
      if (!schedule) return;
      perNote = true;
      const mark = markFromOnset(onset, bands.current);
      setLights((previous) => {
        const next = new Map(previous);
        next.set(onset.id, mark);
        return next;
      });
    });

    const beats = onBeatFeedback((feedback) => {
      if (perNote) return;
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

    void beats.then((fn) => {
      stopBeats = fn;
    });
    void onsets.then((fn) => {
      stopOnsets = fn;
    });
    return () => {
      void beats.then((fn) => fn());
      void onsets.then((fn) => fn());
      stopBeats?.();
      stopOnsets?.();
    };
  }, [input.isPlaying]);

  return lights;
}
