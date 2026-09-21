import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { megabytes, takeLength, TAKES_SIZE_NOTICE_BYTES } from "../../jam/takes";
import type { Jam, JamTake } from "../../jam/types";
import { formatDate } from "../practice-coach/coachCardHelpers";

/**
 * The compositor, downloaded the first time somebody asks for a video.
 *
 * A canvas painter, a media recorder and a share row is a third of a
 * megabyte, and the overwhelming majority of sessions never open this drawer
 * at all — let alone press the button. So it is behind a `lazy`, which is the
 * only thing on the Jam screen that is.
 */
const JamTakeVideo = lazy(() =>
  import("../../takes/JamTakeVideo").then((m) => ({ default: m.JamTakeVideo })),
);

/**
 * The shelf: this jam's takes, newest first (JAM_MODE §4.4).
 *
 * Under the band rather than beside the transport, because listening back is
 * not part of playing — it is what you do between choruses, once, and a row
 * of recordings under your thumb while you are trying to play is a row you
 * will hit by accident. The switch that turns recording on is up in the
 * practice row with the other things the band does to you; this is only the
 * result.
 *
 * The section is drawn even when the shelf is empty, and that is deliberate:
 * a feature that appears only once you have used it is a feature nobody finds.
 * What it says when empty is what recording is FOR.
 */

function PlayGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
    </svg>
  );
}

function StopGlyph() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
    </svg>
  );
}

interface TakesSectionProps {
  /**
   * `null` while the first `listTakes` is still out, `false` on a build whose
   * engine has no take commands. Both are pictures, not errors.
   */
  available: boolean | null;
  takes: JamTake[];
  /** True while the transport is recording one. The list waits for it. */
  recording: boolean;
  /**
   * Bytes the takes folder holds, across every jam, as the engine reports it.
   *
   * The whole folder rather than this jam's shelf: a disk filling up is a fact
   * about the disk, and the jam in front of you can have two takes on it while
   * the library has ninety.
   */
  dirBytes: number;
  /** The take playing back, or null. */
  playingId: string | null;
  /**
   * The jam these takes belong to, for "save as a video" (W30).
   *
   * The clip's bar grid and chord names come off the record rather than off
   * the take: a take is a WAV and a timestamp, and what makes the video worth
   * watching is the form it was played over. Absent — no jam loaded — and the
   * button is not drawn.
   */
  jam?: Jam | null;
  /** What the vibe is called, already translated. Goes in the clip's caption. */
  vibeLabel?: string | null;
  onPlay: (id: string) => void;
  onStop: () => void;
  onDelete: (id: string) => void;
}

export function TakesSection({
  available,
  takes,
  recording,
  dirBytes,
  playingId,
  jam,
  vibeLabel,
  onPlay,
  onStop,
  onDelete,
}: TakesSectionProps) {
  const { t, i18n } = useTranslation();
  /**
   * The take whose "save as a video" panel is open, or null.
   *
   * One at a time, and closed by default: the panel is a compositor, a canvas
   * and a share row, and six of them under six rows would be a drawer nobody
   * could read. Opening one closes the other.
   */
  const [sharing, setSharing] = useState<string | null>(null);
  /**
   * The take a Delete click has asked about, waiting for the second click.
   *
   * There is no undo — the file is gone — so the confirmation is the whole of
   * the safety net, and it is inline rather than a dialog: a modal over the
   * jam screen to delete one row of a list is a bigger interruption than the
   * mistake it is guarding against.
   */
  const [confirming, setConfirming] = useState<string | null>(null);

  const heavy = dirBytes >= TAKES_SIZE_NOTICE_BYTES;

  return (
    <section className="jam-takes" aria-label={t("jam.takes.label")}>
      {/* No heading of its own since the takes became a section of the sheet
          rather than the tail of "More": the section says TAKES above this,
          and saying it twice in six lines is the drawer talking to itself.
          The size still belongs here — it is about the folder, not about the
          feature — and only once the folder is worth mentioning, since below
          the threshold a number is clutter on a screen read at arm's length. */}
      {available && heavy && (
        <div className="jam-section-head">
          <span className="jam-takes-size">
            {t("jam.takes.size", { megabytes: megabytes(dirBytes) })}
          </span>
        </div>
      )}

      {available === false ? (
        <p className="jam-takes-empty">{t("jam.takes.unavailable")}</p>
      ) : takes.length === 0 ? (
        <p className="jam-takes-empty">
          {recording ? t("jam.takes.recordingNow") : t("jam.takes.empty")}
        </p>
      ) : (
        <ul className="jam-takes-list">
          {takes.map((take) => {
            const isPlaying = playingId === take.id;
            // While one take plays the engine has muted the band and is
            // playing a file; starting another or deleting one underneath it
            // is not a thing the engine has been asked to survive.
            const busy = playingId !== null && !isPlaying;
            return (
              <li className="jam-take" key={take.id} data-playing={isPlaying ? "" : undefined}>
                <button
                  type="button"
                  className={`jam-take-play${isPlaying ? " playing" : ""}`}
                  disabled={busy || recording}
                  aria-label={isPlaying ? t("jam.takes.stop") : t("jam.takes.play")}
                  title={isPlaying ? t("jam.takes.stop") : t("jam.takes.play")}
                  onClick={() => (isPlaying ? onStop() : onPlay(take.id))}
                >
                  {isPlaying ? <StopGlyph /> : <PlayGlyph />}
                </button>
                <span className="jam-take-when">
                  {formatDate(take.createdAt, t, i18n.language)}
                </span>
                <span className="jam-take-length">{takeLength(take.durationSec)}</span>
                {/* WHAT THIS ONE IS A RECORDING OF (`plans/SONGS.md` A12).
                    Only on the takes that are not the ordinary kind, because
                    a label on every row is a label nobody reads — and because
                    the thing worth noticing a week later is "this one has
                    whatever else the computer was playing in it". */}
                {take.sound === "everything" && (
                  <span className="jam-take-sound">{t("jam.takeSound.takeEverything")}</span>
                )}
                {/* What the band is doing while this plays. Said rather than
                    left to be noticed: a player who pressed play and heard no
                    drums would reasonably think the drummer had crashed. */}
                {isPlaying && (
                  <span className="jam-take-bandoff">{t("jam.takes.bandOff")}</span>
                )}
                <span className="jam-take-spacer" />
                {confirming === take.id ? (
                  <span className="jam-take-confirm">
                    <span className="jam-take-confirm-ask">{t("jam.takes.confirm")}</span>
                    <button
                      type="button"
                      className="jam-take-confirm-yes"
                      onClick={() => {
                        setConfirming(null);
                        onDelete(take.id);
                      }}
                    >
                      {t("jam.takes.confirmDelete")}
                    </button>
                    <button type="button" onClick={() => setConfirming(null)}>
                      {t("jam.takes.confirmKeep")}
                    </button>
                  </span>
                ) : (
                  <>
                    {/* A take you can send somebody. Before Delete, because
                        the two are opposite intentions and a row that puts
                        them side by side in the wrong order is a row people
                        mis-click. */}
                    {jam && (
                      <button
                        type="button"
                        className="jam-take-share"
                        aria-expanded={sharing === take.id}
                        disabled={busy || recording}
                        onClick={() =>
                          setSharing((was) => (was === take.id ? null : take.id))
                        }
                      >
                        {t("jam.takeVideo.save")}
                      </button>
                    )}
                    <button
                      type="button"
                      className="jam-take-delete"
                      disabled={busy || recording}
                      onClick={() => setConfirming(take.id)}
                    >
                      {t("jam.takes.delete")}
                    </button>
                  </>
                )}
                {jam && sharing === take.id && (
                  <div className="jam-take-video">
                    {/* Nothing while the chunk arrives: it is a hundred
                        milliseconds on any machine that has already loaded
                        the app, and a spinner for that reads as a fault. */}
                    <Suspense fallback={null}>
                      <JamTakeVideo
                        jam={jam}
                        take={take}
                        vibeLabel={vibeLabel}
                        onBeforeSave={onStop}
                      />
                    </Suspense>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* The promise used to be printed here forever. It is said once now, as
          a first-run hint at the moment recording is switched on
          (JAM_UX_DECISIONS A7) — the same words, at the one moment they are
          news rather than furniture. */}
    </section>
  );
}
