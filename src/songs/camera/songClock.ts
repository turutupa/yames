/**
 * Songs' answer to "how far into the music are we" (W32).
 *
 * The camera used to ask this question itself, because the camera was Songs'
 * alone. Now a jam asks it too and answers it differently — a bar of a form
 * rather than a tick of a score — so the question became an interface
 * (`TakeClock` in `src/takes/useTakeCamera.ts`) and this is the song's
 * implementation of it. Both halves are exactly the lines that used to be
 * inside the hook, moved rather than rewritten: the sampler is `sampleFor`,
 * and the take's opening instant is still minus `startOffsetMs`.
 */
import { sampleFor } from "../../takes/offset";
import type { TakeClock } from "../../takes/useTakeCamera";
import type { BarRange } from "../schedule";
import type { SongScore } from "../types";

export function songClock(
  score: SongScore,
  range: BarRange,
  tempoPercent: number,
): TakeClock {
  return {
    sample: (event, arrivalMs) =>
      sampleFor(
        score,
        range,
        tempoPercent,
        {
          songBar: event.songBar,
          songTick: event.songTick,
          songPass: event.songPass,
          songCountIn: event.songCountIn,
        },
        arrivalMs,
      ),
    // `startOffsetMs` is where beat 0 sits INSIDE the file, so the file's
    // first sample is at minus that much in the piece (`take.rs`).
    startMs: (take) => {
      const at = take.position?.startOffsetMs;
      return typeof at === "number" && Number.isFinite(at) ? -at : null;
    },
  };
}
