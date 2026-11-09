/**
 * Watching a jam back — the picture, and the form going by under it (W33 §1).
 *
 * Songs' review has had this since W21: your own hands with the teacher's
 * marks beside them. A jam has no marks and no score, so what goes under the
 * picture is the thing a jam IS — the bar grid of the form with the bar you
 * are hearing lit, the chord on it, and the one coming next.
 *
 * ## One clock, and the mix holds it
 *
 * The take's WAV plays in an `<audio>` element here and everything else
 * follows it: the picture is slaved to it, the grid is read off it. Three
 * followers and one leader, which is the arrangement `TakeVideoView`'s header
 * argues for at length and for the same reason — every other one is three
 * things that agree until somebody scrubs.
 *
 * Time is milliseconds from the take's FIRST SAMPLE. A jam has no beat zero
 * to measure from (`TakePosition.startOffsetMs` is a song's field), so the
 * sound needs no correction; the PICTURE does, and gets `videoOffsetMs` plus
 * whatever the player has nudged.
 *
 * ## Why the mix is not played through the engine
 *
 * `play_take` starts a take and stops it. It cannot seek and reports no
 * position, and scrubbing by bar needs both. The shelf's own play button is
 * unchanged and still goes through the engine with the band muted; only this
 * panel plays the file itself.
 *
 * ## The nudge is per camera AND per sound source
 *
 * W32 established why (`keys.ts`, `plans/SONGS.md` A12): a take of Yames and
 * your input is early by the input buffer, one of everything this computer
 * plays is late by the output buffer, and one remembered number would carry
 * one mode's answer silently into the other.
 *
 * ## A take with no picture opens too
 *
 * And then the timeline IS the view. That is most takes — the camera is a
 * thing you turn on — and a panel that only existed for filmed takes would be
 * a panel most people never saw.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { revealInFolder, storeLoad, storeSave } from "../ipc";
import { jamBand } from "../jam/compile";
import type { Jam, JamTake } from "../jam/types";
import { jamTapeShape } from "./jamStrip";
import { jamAt, jamChorusBars, jamScrub, msAtJamBar } from "./jamPlayback";
import {
  AUDIO_OUTPUT_KEY,
  CAMERA_DEVICE_KEY,
  cameraNudgeKey,
  NUDGE_LIMIT_MS,
  NUDGE_STEP_MS,
} from "./keys";
import { followChosenOutput } from "./sink";
import type { SinkDevice, SinkState } from "./sink";
import { mediaSrc } from "./src";

/**
 * "Save as a video", behind a `lazy` of its own.
 *
 * The shelf already pays for this panel lazily; the compositor is a second
 * third of a megabyte on top, and a player who opens a take to watch it has
 * not asked to export one. `JamTakeVideo` rather than `SaveAsVideo` itself,
 * so there is one place that knows how a jam's clip is put together.
 */
const JamTakeVideo = lazy(() =>
  import("./JamTakeVideo").then((m) => ({ default: m.JamTakeVideo })),
);

/** How far the picture may drift from the sound before it is pulled back. */
const DRIFT_MS = 90;

function PlayGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="3" y="2" width="3.5" height="12" rx="1" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
    </svg>
  );
}

export function JamTakeView({
  jam,
  take,
  vibeLabel,
  onBeforePlay,
  onDelete,
}: {
  jam: Jam;
  take: JamTake;
  /** What the vibe is called, already translated. */
  vibeLabel?: string | null;
  /** Stop whatever the engine is playing: two transports is two things adrift. */
  onBeforePlay?: () => void;
  /** Delete this take. The shelf owns the confirmation; this is the press. */
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const [playing, setPlaying] = useState(false);
  const [nowMs, setNowMs] = useState(0);
  const [nudgeMs, setNudgeMs] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [broken, setBroken] = useState(false);
  const [sink, setSink] = useState<SinkState>({ kind: "systemDefault" });

  /** Who is playing, for the clip's line-up. The stage's own answer. */
  const lineup = useMemo(() => {
    const band = jamBand(jam);
    const who = [
      band.drums ? t("jam.band.drums") : null,
      band.bass ? t("jam.band.bass") : null,
      band.keys ? t("jam.band.keys") : null,
    ].filter(Boolean);
    return who.length > 0 ? who.join(" · ").toLowerCase() : null;
  }, [jam, t]);

  /**
   * The take's own grid, in milliseconds.
   *
   * The SAME shape the compositor is handed, so the bar lit here and the bar
   * named in the video a player saves from this panel cannot disagree — which
   * is the whole reason `jamTapeShape` is a function rather than lines inside
   * the painter.
   */
  const shape = useMemo(
    () =>
      jamTapeShape(
        jam,
        take,
        vibeLabel,
        (n) => t("jam.takeVideo.chorus", { count: n }),
        lineup,
        t("jam.takeVideo.next"),
      ),
    [jam, take, vibeLabel, lineup, t],
  );

  const at = useMemo(() => jamAt(shape, nowMs), [shape, nowMs]);
  const cells = useMemo(() => jamChorusBars(shape, at.chorus), [shape, at.chorus]);
  const hasPicture = !!take.videoPath;

  /** The picture's own correction: the fit, plus whatever the player nudged. */
  const videoAt = useCallback(
    (ms: number) => (ms + (take.videoOffsetMs ?? 0) + nudgeMs) / 1000,
    [take.videoOffsetMs, nudgeMs],
  );

  /** The nudge, remembered for this camera and this kind of recording. */
  const [nudgeKey, setNudgeKey] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void storeLoad<string>(CAMERA_DEVICE_KEY)
      .catch(() => null)
      .then((deviceId) => {
        if (!alive) return null;
        const key = cameraNudgeKey(typeof deviceId === "string" ? deviceId : null, take.sound);
        setNudgeKey(key);
        return storeLoad<number>(key).catch(() => null);
      })
      .then((saved) => {
        if (alive && typeof saved === "number" && Number.isFinite(saved)) setNudgeMs(saved);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [take.sound]);

  const nudge = useCallback(
    (delta: number) => {
      setNudgeMs((current) => {
        const next = Math.max(-NUDGE_LIMIT_MS, Math.min(NUDGE_LIMIT_MS, current + delta));
        if (nudgeKey) void storeSave(nudgeKey, next).catch(() => {});
        return next;
      });
    },
    [nudgeKey],
  );

  /**
   * ...and out of the speaker the player chose.
   *
   * The engine plays out of the output device chosen in settings and a media
   * element plays out of the system default, so on a machine with an interface
   * — which is most of the people this app is for — a take played here would
   * come out of a different speaker from the band. `sink.ts` is the join.
   */
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

  const seek = useCallback(
    (ms: number) => {
      const clamped = Math.max(0, Math.min(shape.lengthMs, ms));
      const audio = audioRef.current;
      const video = videoRef.current;
      if (audio) audio.currentTime = clamped / 1000;
      if (video) video.currentTime = Math.max(0, videoAt(clamped));
      setNowMs(clamped);
    },
    [shape.lengthMs, videoAt],
  );

  /** A nudge while it plays has to move the picture now, not at the next seek. */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, videoAt(nowMs));
    // Only when the nudge changes: on every `nowMs` this would seek the video
    // sixty times a second, which is a stutter rather than a picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nudgeMs]);

  const pause = useCallback(() => {
    setPlaying(false);
    audioRef.current?.pause();
    videoRef.current?.pause();
  }, []);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    onBeforePlay?.();
    if (nowMs >= shape.lengthMs - 1) seek(0);
    setPlaying(true);
    void audio.play().catch(() => setBroken(true));
    void videoRef.current?.play().catch(() => {
      // A picture that will not play leaves a take with sound, which is a
      // take. The sound carries on.
    });
  }, [onBeforePlay, nowMs, shape.lengthMs, seek]);

  /**
   * The clock, once a frame, read off the element that is making the sound.
   *
   * Never off a timer: a timer and a media element disagree the moment the
   * machine is busy, and the one that is right is the one you can hear.
   */
  useEffect(() => {
    if (!playing) return;
    let handle = 0;
    const tick = () => {
      handle = requestAnimationFrame(tick);
      const audio = audioRef.current;
      const video = videoRef.current;
      if (!audio) return;
      const ms = audio.currentTime * 1000;
      if (ms >= shape.lengthMs) {
        pause();
        seek(0);
        return;
      }
      setNowMs(ms);
      if (video && video.readyState >= 1) {
        const wanted = videoAt(ms);
        if (Math.abs(video.currentTime - wanted) * 1000 > DRIFT_MS) {
          video.currentTime = Math.max(0, wanted);
        }
      }
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [playing, pause, seek, shape.lengthMs, videoAt]);

  /**
   * ...and the panel comes to you when it opens.
   *
   * The takes are the LAST group of a setup drawer that scrolls, so a panel
   * that unfolded four hundred pixels under the fold would be a press that
   * appeared to do nothing — which is exactly what the layout suite measured
   * the first time this was drawn: the chord was 1,558 px below the window at
   * 1440×900. `start` and not `nearest`, which was the second thing it
   * measured — `nearest` scrolls the least it can get away with, so a panel
   * whose top edge had just come into view was left alone with the chord
   * eight pixels under the bottom of a 1100×720 window. The TOP goes to the
   * top: the picture and the chord are what you opened it for, and the three
   * actions at its foot are a scroll away rather than the other way round.
   */
  useEffect(() => {
    panelRef.current?.scrollIntoView({ block: "start", inline: "nearest" });
  }, []);

  /** Nothing is left playing behind a panel that has closed. */
  useEffect(
    () => () => {
      audioRef.current?.pause();
      videoRef.current?.pause();
    },
    [],
  );

  return (
    <div className="jam-watch" ref={panelRef}>
      <audio ref={audioRef} src={mediaSrc(take.path)} preload="metadata" crossOrigin="anonymous" />

      {hasPicture && (
        <div className="jam-watch-picture">
          <video
            ref={videoRef}
            className="jam-watch-video"
            src={mediaSrc(take.videoPath!)}
            preload="metadata"
            muted
            playsInline
            crossOrigin="anonymous"
          />
        </div>
      )}

      {/* WHERE IN THE FORM YOU ARE, which with no picture is the whole view.
          The chord large and the next one beside it, in the words the clip
          uses, so watching a take back and watching the video of it made from
          this panel read the same. */}
      <div className="jam-watch-now">
        <span className="jam-watch-chord">{at.chord || "—"}</span>
        {at.next && (
          <span className="jam-watch-next">{`${t("jam.takeVideo.next")} ${at.next}`}</span>
        )}
        <span className="jam-watch-where">
          {t("jam.watch.where", {
            bar: at.formBar + 1,
            chorus: t("jam.takeVideo.chorus", { count: at.chorus }),
          })}
        </span>
      </div>

      {/* The bar grid: the FORM, one cell a bar, for the time round you are
          hearing — the same thing the stage's own timeline draws, and the same
          thing a player counts. A press goes there. A cell the take does not
          contain is drawn and dead, so the grid never changes width and the
          bar you are looking for is in the same place every chorus. */}
      <div className="jam-watch-grid" role="group" aria-label={t("jam.form.label")}>
        {cells.map((cell) => (
          <button
            type="button"
            key={cell.formBar}
            className="jam-watch-bar"
            disabled={cell.barsIn === null}
            data-current={cell.barsIn === at.barsIn ? "" : undefined}
            data-opens={cell.formBar === 0 ? "" : undefined}
            aria-label={t("jam.watch.goToBar", { bar: cell.formBar + 1 })}
            onClick={() => cell.barsIn !== null && seek(msAtJamBar(shape, cell.barsIn))}
          >
            {cell.formBar + 1}
          </button>
        ))}
      </div>

      <div className="jam-watch-transport">
        <button
          type="button"
          className={`jam-watch-play${playing ? " playing" : ""}`}
          aria-label={playing ? t("jam.takes.stop") : t("jam.takes.play")}
          onClick={() => (playing ? pause() : play())}
        >
          {playing ? <PauseGlyph /> : <PlayGlyph />}
        </button>
        <button
          type="button"
          className="jam-watch-step"
          aria-label={t("jam.watch.barBack")}
          onClick={() => seek(jamScrub(shape, nowMs, -1))}
        >
          ‹
        </button>
        <button
          type="button"
          className="jam-watch-step"
          aria-label={t("jam.watch.barOn")}
          onClick={() => seek(jamScrub(shape, nowMs, 1))}
        >
          ›
        </button>
        <span className="jam-watch-spacer" />
        {/* The picture's own offset. Only with a picture, because with none
            there is nothing to line the sound up against. */}
        {hasPicture && (
          <span className="jam-watch-nudge">
            <span className="jam-watch-nudge-label">{t("jam.watch.nudge")}</span>
            <button type="button" aria-label={t("jam.watch.nudgeBack")} onClick={() => nudge(-NUDGE_STEP_MS)}>
              −
            </button>
            <span className="jam-watch-nudge-value">{`${nudgeMs > 0 ? "+" : ""}${String(nudgeMs)}`}</span>
            <button type="button" aria-label={t("jam.watch.nudgeOn")} onClick={() => nudge(NUDGE_STEP_MS)}>
              +
            </button>
          </span>
        )}
      </div>

      {broken && <p className="jam-watch-note">{t("jam.watch.broken")}</p>}
      {/* Which speaker, but only when it is not the one they chose. "It is
          coming out of the thing you picked" is not news; the other answer is
          the one a player would otherwise have to work out for themselves.
          The same two sentences the Songs review uses, from the same keys. */}
      {sink.kind !== "following" && sink.kind !== "systemDefault" && (
        <p className="jam-watch-note">
          {sink.kind === "unsupported"
            ? t("songs.camera.sinkUnsupported", { device: sink.wanted })
            : t("songs.camera.sinkUnmatched", { device: sink.wanted })}
        </p>
      )}

      <div className="jam-watch-row">
        <button
          type="button"
          className="jam-watch-action"
          aria-expanded={exporting}
          onClick={() => {
            pause();
            setExporting((was) => !was);
          }}
        >
          {t("jam.takeVideo.save")}
        </button>
        <button
          type="button"
          className="jam-watch-action"
          onClick={() => void revealInFolder(take.path).catch(() => {})}
        >
          {t("songs.clip.showInFolder")}
        </button>
        {onDelete && (
          <button type="button" className="jam-watch-action jam-watch-delete" onClick={onDelete}>
            {t("jam.takes.delete")}
          </button>
        )}
      </div>

      {exporting && (
        <div className="jam-watch-export">
          <Suspense fallback={null}>
            <JamTakeVideo
              jam={jam}
              take={take}
              vibeLabel={vibeLabel}
              onBeforeSave={pause}
              nudgeMs={nudgeMs}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

export default JamTakeView;
