import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { SaveAsVideo } from "./SaveAsVideo";
import { mediaSrc } from "./src";
import { jamStrip, jamTapeShape, jamWindowMs } from "./jamStrip";
import type { Jam, JamTake } from "../jam/types";

/**
 * "Save as a video", for a jam (W30).
 *
 * The owner, going to bed: *"I think this would be a killer feature … for
 * making a recording of the app, and sharing on social media, but also cause
 * folks can record themselves jamming … in fact, i already wanted to record
 * myself tonight to share with a friend."* This is that, and it needed almost
 * nothing new: W25 built the compositor, the real-time recording, the chunked
 * save, the Yames mark and the share row for Songs, and the only part of it
 * that was ever about songs was the band across the middle.
 *
 * So this file is forty lines: work out the jam's bar grid and chords
 * (`jamStrip.ts`), hand them to the same screen, and say that a jam has no
 * chosen bars to pick between and no verdict to paint.
 *
 * **A take with no picture still makes a clip**, and for a jam that is the
 * common case rather than the exception: the chords going by over a plain
 * ground with the Yames mark on it is "a recording of the app", which is the
 * first of the two things he asked for.
 */
export function JamTakeVideo({
  jam,
  take,
  vibeLabel,
  onBeforeSave,
}: {
  jam: Jam;
  take: JamTake;
  /** What the vibe is called, already translated. Goes in the caption. */
  vibeLabel?: string | null;
  /** Stop whatever else is playing: two transports is two things out of step. */
  onBeforeSave?: () => void;
}) {
  const { t } = useTranslation();
  const shape = useMemo(
    () => jamTapeShape(jam, take, vibeLabel, (n) => t("jam.takeVideo.chorus", { count: n })),
    [jam, take, vibeLabel, t],
  );
  const strip = useMemo(() => jamStrip(shape), [shape]);
  const span = useMemo(
    () => ({ startMs: 0, endMs: shape.lengthMs }),
    [shape.lengthMs],
  );

  return (
    <SaveAsVideo
      strip={strip}
      windowMs={jamWindowMs(shape)}
      // The whole take, always: a jam has no selection to have made, and the
      // question is not asked.
      spanFor={() => span}
      canChooseBars={false}
      canShowMarks={false}
      mixSrc={mediaSrc(take.path)}
      videoSrc={take.videoPath ? mediaSrc(take.videoPath) : null}
      // A jam's take has no beat 0 to measure from — `TakePosition` says so —
      // and the picture's own offset is zero until the camera comes to Jam.
      startOffsetMs={0}
      videoOffsetMs={take.videoOffsetMs ?? 0}
      title={jam.name}
      onBeforeSave={onBeforeSave}
    />
  );
}

export default JamTakeVideo;
