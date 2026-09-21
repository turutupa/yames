/**
 * Watching it back — the picture, the mix and the verdict on one clock.
 *
 * `W21-CAMERA.md` items 4, 6, 7 and 8. The player has stopped, the coach has
 * said its one thing, and this is the reward `plans/ECHORA.md` E0.7 is about:
 * your own hands, with a teacher's marks on the tape beside them.
 *
 * ## One clock, and which thing holds it
 *
 * **The mix holds it.** The take's WAV plays in an `<audio>` element here, the
 * picture is slaved to it, and the tape's head and the moving mark on the
 * coloured excerpt are both read off it. Three followers and one leader: every
 * other arrangement is three things that agree until somebody scrubs.
 *
 * The axis everything is expressed in is **transport milliseconds** — time
 * since beat 0 of the first pass of the range, at the click's own tempo
 * (`songs/camera/tape.ts`). From there:
 *
 *   audio position  = transport + startOffsetMs        (where beat 0 sits in the WAV)
 *   video position  = audio position + videoOffsetMs + nudge
 *
 * `startOffsetMs` is the engine's, measured by the take's writer thread and
 * exact to one output buffer. `videoOffsetMs` is the camera's, fitted from the
 * pass's beat events, and is good to a few tens of milliseconds and no better
 * — which is what the nudge is for and why the nudge is remembered per camera
 * (`songs/camera/keys.ts`).
 *
 * ## Why the mix is not played through the engine
 *
 * `play_take` starts a take and stops it. It cannot seek, cannot loop a
 * passage, cannot run at half speed and reports no position, and this screen
 * needs all four. The shelf's own play button is unchanged and still goes
 * through the engine with the band muted; only the review with a picture plays
 * the file here.
 *
 * ## ...and out of the speaker the player chose (2026-09-20, W25)
 *
 * The one user-visible cost of that, which `src.ts` has been stating since
 * W21: the engine plays out of the output device chosen in settings, and a
 * media element plays out of the system default. On a machine with an
 * interface — which is most of the people this app is for — the review came
 * out of a different speaker from the band. `setSinkId` moves it, where the
 * webview has one and the two namespaces can be joined on a label
 * (`songs/camera/sink.ts` is that join, and is honest about being a match).
 * Where they cannot, the note under the controls says which speaker it is
 * using rather than leaving somebody to wonder why it sounds different.
 *
 * ## With no picture, none of this is on screen
 *
 * `SongReview` renders this only when the take has a video. A review with
 * sound alone is exactly what it was before this file existed, which is A9's
 * condition for the camera shipping at all.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { storeLoad, storeSave } from "../../../ipc";
import { barLengthMs, slipJump } from "../../../songs/camera/tape";
import type { Tape } from "../../../songs/camera/tape";
import {
  AUDIO_OUTPUT_KEY,
  cameraNudgeKey,
  NUDGE_LIMIT_MS,
  NUDGE_STEP_MS,
} from "../../../songs/camera/keys";
import { followChosenOutput } from "../../../songs/camera/sink";
import type { SinkDevice, SinkState } from "../../../songs/camera/sink";
import { mediaSrc } from "../../../songs/camera/src";
import { msAtBeat } from "../../../songs/camera/offset";
import { clampRange, rangeTempoSteps } from "../../../songs/schedule";
import { printedBarNumber } from "../../../songs/position";
import { TakeTape } from "./TakeTape";
import type { SongAttemptReview } from "../review/useSongAttempt";
import type { BarRange } from "../../../songs/schedule";
import "../../../styles/songs-take-video.css";

/** The recording this review is of, as much of it as the picture needs. */
export type ReviewTakeVideo = {
  takeId: string;
  /** Absolute path (or already a URL) of the mix. */
  path: string;
  /**
   * Absolute path (or already a URL) of the picture, or `null` for a take
   * recorded with the camera off — which is every take until somebody turns
   * it on.
   *
   * This view is not drawn at all in that case (`SongReview` checks), so A9
   * still holds: with no picture the review is exactly what it was. What the
   * null is FOR is "Save as a video", which works on a take with sound alone
   * — the excerpt and the marks over a plain ground.
   */
  videoPath: string | null;
  /** What the fit measured, or null when it had too little to go on. */
  videoOffsetMs?: number;
  /** Where beat 0 sits in the WAV, from the take's own sidecar. */
  startOffsetMs?: number;
  /** Which camera, so the nudge is remembered for that one. */
  deviceId?: string | null;
};

/**
 * The speeds worth a button.
 *
 * 100, 70 and 50. Seventy is the coach's own number — every "slow it down"
 * fix in `useSongActions` lands there — so the tape offering the same speed
 * means "watch it at the speed you are about to practise it at".
 */
const SPEEDS = [100, 70, 50] as const;

/** How far ahead of a slip the picture lands: half a bar of that bar. */
const SLIP_LEAD_BARS = 0.5;

/** How far the picture may drift from the sound before it is pulled back. */
const DRIFT_MS = 90;

export type TakeVideoViewProps = {
  review: SongAttemptReview;
  take: ReviewTakeVideo;
  /** The pass laid out in time. Built once by the host and shared. */
  tape: Tape;
  /**
   * The bars to loop, counted as played-bar indices, or null for the whole
   * attempt. The coach's "Watch it" passes the finding's bars; the review
   * passes whatever the player has selected on the excerpt.
   */
  loopBars?: BarRange | null;
  /** Which pass to play. `null` plays them all in order. */
  pass?: number | null;
  onPass?: (pass: number) => void;
  /** Where playback is, so the excerpt can draw its own moving mark. */
  onPosition?: (transportMs: number | null) => void;
  /**
   * The coach pressed "Watch it".
   *
   * A counter rather than a flag: the same finding pressed twice has to rewind
   * and play again, and a boolean that was already true would do nothing the
   * second time. Zero, the starting value, plays nothing — a review does not
   * begin by making a noise at somebody.
   */
  watchNonce?: number;
  /** The speed to open at, as a percentage. */
  startSpeed?: number;
  /**
   * Somewhere else needs the take to itself — "Save as a video" plays it
   * again on its own clock, and two transports over one recording is two
   * things a person has to keep in step by hand.
   *
   * A counter rather than a flag, for `watchNonce`'s reason: the second
   * export has to pause this player too, and a boolean that was already true
   * would do nothing.
   */
  pauseNonce?: number;
  className?: string;
};

export function TakeVideoView({
  review,
  take,
  tape,
  loopBars = null,
  pass = null,
  onPass,
  onPosition,
  watchNonce = 0,
  startSpeed = 100,
  pauseNonce = 0,
  className,
}: TakeVideoViewProps) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [playing, setPlaying] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [speed, setSpeed] = useState(startSpeed);
  const [nudgeMs, setNudgeMs] = useState(0);
  const [broken, setBroken] = useState(false);

  const startOffsetMs = take.startOffsetMs ?? 0;
  const baseOffsetMs = take.videoOffsetMs ?? 0;

  /** The window being looped, in transport milliseconds. */
  const loop = useMemo(() => {
    const chosen = pass === null ? null : pass;
    if (!loopBars && chosen === null) return null;
    const steps = rangeTempoSteps(review.score, review.range, review.tempoPercent);
    const clamped = clampRange(review.score, review.range);
    const first = review.score.bars[clamped.startBar]?.startTick ?? 0;
    const ticksPerQuarter = review.score.ticksPerQuarter || 960;
    const beatOf = (bar: number, end: boolean) => {
      const entry = review.score.bars[Math.min(Math.max(bar, clamped.startBar), clamped.endBar)];
      if (!entry) return 0;
      const tick = end ? entry.startTick + entry.lengthTicks : entry.startTick;
      return (tick - first) / ticksPerQuarter;
    };
    const within = loopBars
      ? { startMs: msAtBeat(steps, beatOf(loopBars.startBar, false)), endMs: msAtBeat(steps, beatOf(loopBars.endBar, true)) }
      : { startMs: 0, endMs: tape.passMs };
    const base = (chosen ?? 0) * tape.passMs;
    return { startMs: base + within.startMs, endMs: base + within.endMs };
  }, [loopBars, pass, review, tape.passMs]);

  /**
   * W25 — the take plays out of the speaker the player chose.
   *
   * Once, when the element exists: `setSinkId` sticks to the element, and
   * re-running it on every render would be an enumeration a second. The
   * chosen device's NAME comes from the same store key the engine was set
   * from, so there is one answer to "which output" and this follows it.
   */
  const [sink, setSink] = useState<SinkState>({ kind: "systemDefault" });
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    let alive = true;
    void storeLoad<string>(AUDIO_OUTPUT_KEY)
      .catch(() => null)
      .then(async (wanted) => {
        if (!alive) return;
        const state = await followChosenOutput({
          element: audio,
          wanted: typeof wanted === "string" ? wanted : null,
          enumerate: async () =>
            typeof navigator === "undefined" || !navigator.mediaDevices
              ? []
              : ((await navigator.mediaDevices.enumerateDevices()) as unknown as SinkDevice[]),
        });
        if (alive) setSink(state);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  /** The nudge, remembered for this camera. */
  const nudgeKey = cameraNudgeKey(take.deviceId ?? null);
  useEffect(() => {
    let alive = true;
    void storeLoad<number>(nudgeKey)
      .then((saved) => {
        if (alive && typeof saved === "number" && Number.isFinite(saved)) setNudgeMs(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [nudgeKey]);

  const nudge = useCallback(
    (delta: number) => {
      setNudgeMs((current) => {
        const next = Math.max(-NUDGE_LIMIT_MS, Math.min(NUDGE_LIMIT_MS, current + delta));
        void storeSave(nudgeKey, next).catch(() => {});
        return next;
      });
    },
    [nudgeKey],
  );

  /** Transport milliseconds → where that is in each file. */
  const audioAt = useCallback((ms: number) => (ms + startOffsetMs) / 1000, [startOffsetMs]);
  const videoAt = useCallback(
    (ms: number) => (ms + startOffsetMs + baseOffsetMs + nudgeMs) / 1000,
    [startOffsetMs, baseOffsetMs, nudgeMs],
  );

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(tape.lengthMs, ms));
      const audio = audioRef.current;
      const video = videoRef.current;
      if (audio) audio.currentTime = Math.max(0, audioAt(clamped));
      if (video) video.currentTime = Math.max(0, videoAt(clamped));
      setNowMs(clamped);
      onPosition?.(clamped);
    },
    [audioAt, videoAt, tape.lengthMs, onPosition],
  );

  /** A nudge while it is playing has to move the picture now, not next seek. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, videoAt(nowMs));
    // Only when the nudge changes: doing it on every `nowMs` would seek the
    // video sixty times a second, which is a stutter rather than a picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudgeMs]);

  /** The rate, on both, with the pitch kept where the platform will. */
  useEffect(() => {
    const rate = speed / 100;
    for (const element of [audioRef.current, videoRef.current]) {
      if (!element) continue;
      element.playbackRate = rate;
      // `preservesPitch` is what stops half speed sounding like a tape
      // slowing down. Where the webview has it, it is on; `pitchKept` below
      // is how the screen says which the player got.
      (element as HTMLMediaElement & { preservesPitch?: boolean }).preservesPitch = true;
    }
  }, [speed]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    const video = videoRef.current;
    if (!audio) return;
    if (loop && (nowMs < loop.startMs - 1 || nowMs >= loop.endMs - 1)) seek(loop.startMs);
    setPlaying(true);
    void audio.play().catch(() => setBroken(true));
    void video?.play().catch(() => {
      // A picture that will not play is a review with sound, which is a
      // review. The audio carries on.
    });
  }, [loop, nowMs, seek]);

  const pause = useCallback(() => {
    setPlaying(false);
    audioRef.current?.pause();
    videoRef.current?.pause();
  }, []);

  /**
   * The clock, once a frame.
   *
   * The audio element is read rather than a timer accumulated: a timer and a
   * media element disagree the moment the machine is busy, and the one that is
   * right is the one making the sound.
   */
  useEffect(() => {
    if (!playing) return;
    let handle = 0;
    const tick = () => {
      handle = requestAnimationFrame(tick);
      const audio = audioRef.current;
      const video = videoRef.current;
      if (!audio) return;
      const ms = audio.currentTime * 1000 - startOffsetMs;

      if (loop && ms >= loop.endMs) {
        seek(loop.startMs);
        return;
      }
      if (ms >= tape.lengthMs) {
        pause();
        seek(loop ? loop.startMs : 0);
        return;
      }

      setNowMs(ms);
      onPosition?.(ms);
      // Playing past a mistake is how a player leaves it behind, so the next
      // press of "next slip" looks forward from here rather than from
      // whichever one they jumped to a minute ago.
      if (lastSlip.current !== null && ms > lastSlip.current) lastSlip.current = null;

      // The picture, pulled back when it has drifted. A seek every frame would
      // stutter; a seek never would let the two walk apart over a long take.
      if (video && video.readyState >= 1) {
        const wanted = videoAt(ms);
        if (Math.abs(video.currentTime - wanted) * 1000 > DRIFT_MS) {
          video.currentTime = Math.max(0, wanted);
        }
      }
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, loop, seek, pause, startOffsetMs, tape.lengthMs, videoAt, onPosition]);

  // Nothing is left playing behind a review that has gone.
  useEffect(
    () => () => {
      onPosition?.(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /**
   * "Watch it", pressed.
   *
   * Seventy per cent and the finding's bars, from the top of them — the coach
   * rewinding to the spot. Keyed on the counter, so pressing the same button
   * twice rewinds twice, and skipped at zero so a review never opens by
   * playing at somebody.
   */
  useEffect(() => {
    if (watchNonce <= 0) return;
    setSpeed(70);
    seek(loop ? loop.startMs : 0);
    play();
    // The press is the whole trigger; `loop` and `play` are read as they are
    // at that moment and must not re-fire this on their own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchNonce]);

  /** Something else has taken the take. Stand down rather than play over it. */
  useEffect(() => {
    if (pauseNonce <= 0) return;
    pause();
    // The press is the whole trigger; `pause` is read as it is at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pauseNonce]);

  /** Half a bar of the bar the slip is in — a teacher rewinds to just before. */
  const leadMs = useMemo(() => {
    const bar = tape.ticks.find((tick) => tick.atMs >= nowMs)?.bar ?? review.range.startBar;
    return barLengthMs(review.score, review.range, review.tempoPercent, bar) * SLIP_LEAD_BARS;
  }, [tape.ticks, nowMs, review]);

  /**
   * The slip the last jump landed on, so pressing "next" again moves on.
   *
   * The lead puts the playhead IN FRONT of the note it jumped to, so a search
   * from the playhead would find the same mistake for ever; `tape.ts` says the
   * same thing from the other side. Cleared by a scrub and by playback, so
   * after either the search starts from where the player actually is.
   */
  const lastSlip = useRef<number | null>(null);
  const jump = useCallback(
    (direction: 1 | -1) => {
      const found = slipJump(tape, lastSlip.current ?? nowMs, direction, leadMs);
      if (!found) return;
      lastSlip.current = found.slipMs;
      seek(found.atMs);
    },
    [tape, nowMs, leadMs, seek],
  );

  const pitchKept = useMemo(
    () =>
      typeof HTMLMediaElement !== "undefined" &&
      "preservesPitch" in HTMLMediaElement.prototype,
    [],
  );

  const bars = loopBars
    ? `${String(printedBarNumber(review.score, loopBars.startBar))}–${String(printedBarNumber(review.score, loopBars.endBar))}`
    : null;

  return (
    <section
      className={`songs-take-video${className ? ` ${className}` : ""}`}
      data-testid="songs-take-video"
      aria-label={t("songs.camera.watchTitle")}
    >
      <div className="songs-take-video-stage">
        <video
          ref={videoRef}
          className="songs-take-video-picture"
          src={mediaSrc(take.videoPath ?? "")}
          muted
          playsInline
          preload="auto"
          onError={() => setBroken(true)}
        />
        {/* The mix. No controls of its own: the row below is the one set of
            controls for both, because two transports on one screen is two
            transports a person has to keep in step by hand. */}
        <audio
          ref={audioRef}
          src={mediaSrc(take.path)}
          preload="auto"
          onEnded={() => pause()}
          onError={() => setBroken(true)}
        />
        {broken && <p className="songs-take-video-broken">{t("songs.camera.cannotPlay")}</p>}
      </div>

      <TakeTape tape={tape} nowMs={nowMs} loop={loop} onScrub={seek} />

      <div className="songs-take-video-controls">
        <button
          type="button"
          className="songs-btn songs-btn-primary songs-take-video-play"
          onClick={() => (playing ? pause() : play())}
        >
          {playing ? t("songs.camera.pause") : t("songs.camera.play")}
        </button>

        <div className="songs-take-video-slips" role="group" aria-label={t("songs.camera.slips")}>
          <button
            type="button"
            className="songs-btn"
            disabled={tape.slips.length === 0}
            onClick={() => jump(-1)}
          >
            {t("songs.camera.prevSlip")}
          </button>
          <button
            type="button"
            className="songs-btn"
            disabled={tape.slips.length === 0}
            onClick={() => jump(1)}
          >
            {t("songs.camera.nextSlip")}
          </button>
        </div>

        <div className="songs-take-video-speeds" role="group" aria-label={t("songs.speed")}>
          {SPEEDS.map((percent) => (
            <button
              key={percent}
              type="button"
              className="songs-chip"
              data-active={speed === percent ? "" : undefined}
              aria-pressed={speed === percent}
              onClick={() => setSpeed(percent)}
            >
              {t("songs.percent", { percent })}
            </button>
          ))}
        </div>

        {tape.passes.length > 1 && onPass && (
          <div className="songs-take-video-passes" role="group" aria-label={t("songs.review.passes")}>
            {tape.passes.map((n) => (
              <button
                key={n}
                type="button"
                className="songs-chip"
                data-active={n === pass ? "" : undefined}
                aria-pressed={n === pass}
                onClick={() => {
                  onPass(n);
                  seek(n * tape.passMs);
                }}
              >
                {t("songs.review.pass", { n: n + 1 })}
              </button>
            ))}
          </div>
        )}

        <div className="songs-take-video-nudge" role="group" aria-label={t("songs.camera.nudge")}>
          <button type="button" className="songs-btn" onClick={() => nudge(-NUDGE_STEP_MS)}>
            {t("songs.camera.nudgeEarlier")}
          </button>
          <span className="songs-take-video-nudge-at">
            {t("songs.camera.nudgeAt", { ms: Math.round(nudgeMs) })}
          </span>
          <button type="button" className="songs-btn" onClick={() => nudge(NUDGE_STEP_MS)}>
            {t("songs.camera.nudgeLater")}
          </button>
        </div>
      </div>

      <p className="songs-take-video-note">
        {bars ? t("songs.camera.watchingBars", { bars }) : t("songs.camera.watchingAll")}{" "}
        {pitchKept ? t("songs.camera.pitchKept") : t("songs.camera.pitchDropped")}{" "}
        {take.videoOffsetMs === undefined ? t("songs.camera.noOffset") : t("songs.camera.nudgeHow")}
        {/* W25 — which speaker, but only when it is not the one they chose.
            "It is coming out of the thing you picked" is not news; "it is
            coming out of something else" is the only version worth a
            sentence, and it is the one a player would otherwise have to
            work out for themselves. */}
        {sink.kind !== "following" && sink.kind !== "systemDefault" && (
          <>
            {" "}
            {sink.kind === "unsupported"
              ? t("songs.camera.sinkUnsupported", { device: sink.wanted })
              : t("songs.camera.sinkUnmatched", { device: sink.wanted })}
          </>
        )}
      </p>
    </section>
  );
}

export default TakeVideoView;
