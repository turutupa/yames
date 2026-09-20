import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { JamBandState } from "../../jam/types";

/** How long a cue stays up. Long enough to read, short enough to miss. */
const CUE_MS = 2000;

interface TradeCueProps {
  /** What the band is doing on the bar being played. */
  bandState: JamBandState;
  isPlaying: boolean;
}

/**
 * "Your four" / "Band's back", in the corner, for two seconds.
 *
 * Trading is the one practice tool where the screen has to say something
 * unprompted: the drums thin out to hats and the bass steps out, and if you
 * are not watching the timeline the first you know about it is that the music
 * changed under you. So the cue arrives at the bar line, in the corner where
 * it does not cover the chord.
 *
 * The plan asks for this spoken, because your eyes are on the neck
 * (JAM_MODE §4.4). Speech waits for a voice that works on all three platforms;
 * until then this is the honest version of the same cue, and saying so in the
 * code is better than a TODO nobody reads.
 */
export function TradeCue({ bandState, isPlaying }: TradeCueProps) {
  const { t } = useTranslation();
  const [cue, setCue] = useState<JamBandState | null>(null);
  const previous = useRef<JamBandState | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      previous.current = null;
      setCue(null);
      return;
    }
    const before = previous.current;
    previous.current = bandState;
    // Only a CHANGE is news. The first bar of a jam is not an announcement
    // that the band is playing, and eight bars of "full" are not eight
    // announcements that it still is.
    if (before === null || before === bandState) return;
    setCue(bandState);
    const timer = setTimeout(() => setCue(null), CUE_MS);
    return () => clearTimeout(timer);
  }, [bandState, isPlaying]);

  if (!cue) return null;

  const text =
    cue === "hatsOnly"
      ? t("jam.cue.yours")
      : cue === "silent"
        ? t("jam.cue.silent")
        : t("jam.cue.back");

  return (
    <div className="jam-cue" role="status" data-state={cue}>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M11 5 6 9H3v6h3l5 4z" />
        <path d="M15.5 9.5a4 4 0 0 1 0 5" />
        <path d="M18 7a8 8 0 0 1 0 10" />
      </svg>
      <span className="jam-cue-text">{text}</span>
    </div>
  );
}
