import { useState } from "react";
import { useTranslation } from "react-i18next";
import { megabytes, takeLength, TAKES_SIZE_NOTICE_BYTES } from "../../jam/takes";
import type { JamTake } from "../../jam/types";
import { formatDate } from "../practice-coach/coachCardHelpers";

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
  onPlay,
  onStop,
  onDelete,
}: TakesSectionProps) {
  const { t, i18n } = useTranslation();
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
      <div className="jam-section-head">
        <span className="stage-label">{t("jam.takes.label")}</span>
        {/* Only once the folder is worth mentioning. Below the threshold a
            number here would be clutter on a screen read at arm's length. */}
        {available && heavy && (
          <span className="jam-takes-size">
            {t("jam.takes.size", { megabytes: megabytes(dirBytes) })}
          </span>
        )}
      </div>

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
                  <button
                    type="button"
                    className="jam-take-delete"
                    disabled={busy || recording}
                    onClick={() => setConfirming(take.id)}
                  >
                    {t("jam.takes.delete")}
                  </button>
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
