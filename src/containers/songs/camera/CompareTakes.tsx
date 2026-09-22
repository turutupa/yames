/**
 * Then and now — the same bars, twice, locked to the music rather than to the
 * clock.
 *
 * `W21-CAMERA.md` addendum 11, `plans/ECHORA.md` A2 (the single-player
 * progress reel: "works with an audience of zero, costs no hosting, needs no
 * moderation") and `COACH_UX.md` C3, which is the rule this obeys — a
 * before-and-after is volunteered only when it is real. `useSongCompare` is
 * what decides that; this is what draws it, and it is the catalogue's
 * `compare` block's real component at last (`coach/blocks/slots.tsx`).
 *
 * ## The two are locked to BAR POSITIONS, and that is the whole design
 *
 * March was played at 70 % and tonight at 95 %, so bar 19 is eleven seconds
 * into one recording and eight into the other. Two players sharing one clock
 * would drift apart within a bar and be a bar out by the end of a chorus,
 * and the player would be looking at two different passages.
 *
 * So each side runs on **its own clock**, at its own natural rate — the old
 * take is not sped up to match, because a take played back at the wrong tempo
 * is not the take — and the two are **re-synced at every bar line**. The
 * newer pass leads. When it crosses into a bar, the older one is put where IT
 * was at that bar (`songs/camera/align.ts` does both conversions), and left
 * alone until the next line. Between lines they diverge by the difference in
 * tempo across one bar, which is a fraction of a bar and invisible; a
 * correction every frame would be a stutter, and no correction at all would
 * be the thing this exists to avoid.
 *
 * ## Each side has its own tape
 *
 * Because each side is its own pass with its own verdicts and its own colour
 * boundaries — the old one was judged against a window derived at ITS tempo,
 * and painting it with tonight's would flatter or damn it by arithmetic. The
 * tapes are `TakeTape`, unforked, under each picture.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { barAtMs, msAtBar, overlapOf } from "../../../songs/camera/align";
import { buildTape } from "../../../songs/camera/tape";
import type { Tape } from "../../../songs/camera/tape";
import { mediaSrc } from "../../../takes/src";
import { TakeTape } from "./TakeTape";
import type { CompareSide } from "../review/useSongCompare";
import { printedBarNumber } from "../../../songs/position";
import type { SongScore } from "../../../songs/types";
import { formatDate } from "../../practice-coach/coachCardHelpers";
import "../../../styles/songs-take-video.css";

/**
 * How far the follower may drift before a bar line pulls it back.
 *
 * It is not a drift tolerance so much as a floor on how often a seek is worth
 * making: a media element that is seeked when it is already within thirty
 * milliseconds of where it should be is a media element that stutters for no
 * reason anybody can hear.
 */
const SNAP_MS = 30;

export type CompareTakesProps = {
  older: CompareSide;
  newer: CompareSide;
  score: SongScore;
};

/** One side: a picture (or a plain ground), a tape, and a date. */
function tapeFor(side: CompareSide, score: SongScore): Tape {
  return buildTape({
    score,
    schedule: side.schedule,
    range: side.range,
    tempoPercent: side.tempoPercent,
    results: side.results,
    extras: side.extras,
    bands: side.bands,
  });
}

export function CompareTakes({ older, newer, score }: CompareTakesProps) {
  const { t, i18n } = useTranslation();
  const olderAudio = useRef<HTMLAudioElement>(null);
  const olderVideo = useRef<HTMLVideoElement>(null);
  const newerAudio = useRef<HTMLAudioElement>(null);
  const newerVideo = useRef<HTMLVideoElement>(null);

  const [playing, setPlaying] = useState(false);
  /** Where both are, as a fractional played-bar index. One number for two. */
  const [atBar, setAtBar] = useState(() => overlapOf(older.range, newer.range)?.startBar ?? 0);

  const bars = useMemo(() => overlapOf(older.range, newer.range), [older.range, newer.range]);
  const olderTape = useMemo(() => tapeFor(older, score), [older, score]);
  const newerTape = useMemo(() => tapeFor(newer, score), [newer, score]);

  /** A bar position → where each take was. */
  const msOf = useCallback(
    (side: CompareSide, bar: number) => msAtBar(score, side.range, side.tempoPercent, bar),
    [score],
  );

  /** ...and one side's own milliseconds → the bar it was in. */
  const barOf = useCallback(
    (side: CompareSide, ms: number) => barAtMs(score, side.range, side.tempoPercent, ms),
    [score],
  );

  /** Put one side at a bar position: its audio, and its picture with it. */
  const seekSide = useCallback(
    (
      side: CompareSide,
      audio: HTMLAudioElement | null,
      video: HTMLVideoElement | null,
      bar: number,
      force: boolean,
    ) => {
      const ms = msOf(side, bar);
      const wanted = (ms + side.startOffsetMs) / 1000;
      if (audio && (force || Math.abs(audio.currentTime - wanted) * 1000 > SNAP_MS)) {
        audio.currentTime = Math.max(0, wanted);
      }
      if (video) {
        const picture = (ms + side.startOffsetMs + side.videoOffsetMs) / 1000;
        if (force || Math.abs(video.currentTime - picture) * 1000 > SNAP_MS) {
          video.currentTime = Math.max(0, picture);
        }
      }
    },
    [msOf],
  );

  const seekBoth = useCallback(
    (bar: number) => {
      const held = bars ? Math.max(bars.startBar, Math.min(bars.endBar + 1, bar)) : bar;
      seekSide(older, olderAudio.current, olderVideo.current, held, true);
      seekSide(newer, newerAudio.current, newerVideo.current, held, true);
      setAtBar(held);
    },
    [bars, older, newer, seekSide],
  );

  const pause = useCallback(() => {
    setPlaying(false);
    for (const element of [
      olderAudio.current,
      olderVideo.current,
      newerAudio.current,
      newerVideo.current,
    ]) {
      element?.pause();
    }
  }, []);

  const play = useCallback(() => {
    if (!bars) return;
    if (atBar >= bars.endBar + 1 - 0.001) seekBoth(bars.startBar);
    setPlaying(true);
    // The pictures are muted and always were: the sound is the two mixes, and
    // a video element playing its own audio would be a third recording of the
    // same room.
    void newerAudio.current?.play().catch(() => setPlaying(false));
    void olderAudio.current?.play().catch(() => {});
    void newerVideo.current?.play().catch(() => {});
    void olderVideo.current?.play().catch(() => {});
  }, [bars, atBar, seekBoth]);

  /**
   * The clock, once a frame: the newer pass leads, the older follows at bar
   * lines.
   *
   * Read off the newer side's own audio element rather than off a timer, for
   * `TakeVideoView`'s reason — a timer and a media element disagree the
   * moment the machine is busy, and the one that is right is the one making
   * the sound.
   */
  const lastLine = useRef<number | null>(null);
  useEffect(() => {
    if (!playing || !bars) return;
    let handle = 0;
    const tick = () => {
      handle = requestAnimationFrame(tick);
      const lead = newerAudio.current;
      if (!lead) return;
      const ms = lead.currentTime * 1000 - newer.startOffsetMs;
      const bar = barOf(newer, ms);

      if (bar >= bars.endBar + 1) {
        pause();
        seekBoth(bars.startBar);
        return;
      }
      setAtBar(bar);

      // The re-sync. Only when the leader crosses INTO a bar: between lines
      // each take runs at its own tempo, which is what it was played at.
      const line = Math.floor(bar);
      if (lastLine.current !== line) {
        lastLine.current = line;
        seekSide(older, olderAudio.current, olderVideo.current, line, false);
      }
      // The newer side's own picture only has to be pulled back when it has
      // drifted, which a video element does on a busy machine.
      seekSide(newer, null, newerVideo.current, bar, false);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, bars, newer, older, barOf, seekSide, seekBoth, pause]);

  // Nothing is left playing behind a review that has gone.
  useEffect(() => () => pause(), [pause]);

  if (!bars) return null;

  const label = `${String(printedBarNumber(score, bars.startBar))}–${String(
    printedBarNumber(score, bars.endBar),
  )}`;

  const sides: { key: "older" | "newer"; side: CompareSide; tape: Tape }[] = [
    { key: "older", side: older, tape: olderTape },
    { key: "newer", side: newer, tape: newerTape },
  ];

  return (
    <section
      className="songs-compare"
      data-testid="songs-compare"
      aria-label={t("songs.compare.title", { bars: label })}
    >
      <div className="songs-compare-pair">
        {sides.map(({ key, side, tape }) => (
          <div className="songs-compare-side" key={key} data-side={key}>
            <p className="songs-compare-when">
              <span className="songs-compare-label">
                {key === "older" ? t("songs.compare.then") : t("songs.compare.now")}
              </span>
              <span className="songs-compare-date">
                {formatDate(side.startedAt, t, i18n.language)}
              </span>
              <span className="songs-compare-facts">
                {t("songs.compare.facts", {
                  percent: side.tempoPercent,
                  bpm: side.bpm,
                  score: Math.round(side.score),
                })}
              </span>
            </p>

            <div className="songs-compare-stage">
              {side.videoPath === null ? (
                // Sound alone, which is what most players will have. Said in
                // words rather than left as an empty box somebody wonders
                // about: A9's rule, applied to the second pane.
                <p className="songs-compare-nopicture">{t("songs.compare.soundOnly")}</p>
              ) : (
                <video
                  ref={key === "older" ? olderVideo : newerVideo}
                  className="songs-compare-picture"
                  src={mediaSrc(side.videoPath)}
                  muted
                  playsInline
                  preload="auto"
                />
              )}
              <audio
                ref={key === "older" ? olderAudio : newerAudio}
                src={mediaSrc(side.path)}
                preload="auto"
              />
            </div>

            {/* Its own tape, from its own pass, with its own colour
                boundaries. The mark on it is this side's reading of the one
                bar position both are at. */}
            <TakeTape
              tape={tape}
              nowMs={msOf(side, atBar)}
              loop={null}
              onScrub={(ms) => seekBoth(barOf(side, ms))}
            />
          </div>
        ))}
      </div>

      <div className="songs-compare-controls">
        <button
          type="button"
          className="songs-btn songs-btn-primary"
          onClick={() => (playing ? pause() : play())}
        >
          {playing ? t("songs.camera.pause") : t("songs.camera.play")}
        </button>
        <span className="songs-compare-at">
          {t("songs.clip.bar")} {printedBarNumber(score, Math.floor(atBar))}
        </span>
        <p className="songs-compare-note">{t("songs.compare.locked")}</p>
      </div>
    </section>
  );
}

export default CompareTakes;
