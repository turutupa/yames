/**
 * The record switch, and the shelf under the song.
 *
 * Jam's surface, in Songs' clothes. The behaviour, the order of the controls
 * and every sentence are the ones `TakesSection` and the practice row already
 * use — including the privacy copy, which is read from the same locale keys
 * rather than copied into a `songs.takes.*` block. Two copies of a promise
 * about a microphone are two copies to keep in step, and the day they differ
 * is the day one of them is a lie.
 *
 * Only the class names are this mode's, because `songs.css` deliberately does
 * not reach into `jam.css` (its own header says so) and a stylesheet a mode
 * does not load is a mode whose controls draw unstyled.
 *
 * The switch is on the stage with the range, the speed and the band
 * (`JAM_UX_DECISIONS` A13: the stage holds what you are DOING) and the shelf
 * is under it rather than beside the transport — listening back is not part of
 * playing, and a row of recordings under your thumb while you are trying to
 * play is a row you will hit by accident.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { megabytes, takeLength, TAKES_SIZE_NOTICE_BYTES } from "../../jam/takes";
import type { JamTake } from "../../jam/types";
import { formatDate } from "../practice-coach/coachCardHelpers";

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

export interface SongTakesProps {
  available: boolean | null;
  takes: JamTake[];
  recording: boolean;
  dirBytes: number;
  playingId: string | null;
  /** The switch, as this song's record has it. */
  enabled: boolean;
  onRequestTakes: (next: boolean) => void;
  onPlay: (id: string) => void;
  onStop: () => void;
  onDelete: (id: string) => void;
}

/** The switch, for the stage's control row. */
export function SongRecordControl({
  available,
  enabled,
  recording,
  onRequestTakes,
}: Pick<SongTakesProps, "available" | "enabled" | "recording" | "onRequestTakes">) {
  const { t } = useTranslation();
  return (
    <div className="songs-control songs-control-record">
      <span className="songs-control-label">{t("jam.takes.label")}</span>
      <button
        type="button"
        className="songs-chip songs-chip-wide"
        data-active={enabled ? "" : undefined}
        data-recording={recording ? "" : undefined}
        aria-pressed={enabled}
        disabled={available === false}
        onClick={() => onRequestTakes(!enabled)}
      >
        {/* The dot is the same one the dialog's icon draws, and it is the
            whole of the "is it recording" signal on this control: a word that
            changed from "Record the take" to "Recording" would move the
            button's width under a finger that is reaching for it. */}
        <span className="songs-record-dot" data-live={recording ? "" : undefined} aria-hidden="true" />
        {recording ? t("jam.takes.recording") : t("jam.takes.record")}
      </button>
      <p className="songs-control-note">{t("jam.takes.lead")}</p>
    </div>
  );
}

/** The shelf: this song's takes, newest first. */
export function SongTakes({
  available,
  takes,
  recording,
  dirBytes,
  playingId,
  onPlay,
  onStop,
  onDelete,
}: SongTakesProps) {
  const { t, i18n } = useTranslation();
  /**
   * The take a Delete click has asked about, waiting for the second click.
   *
   * There is no undo — the file is gone — so the confirmation is the whole of
   * the safety net, and it is inline rather than a dialog: a modal over the
   * stage to delete one row of a list is a bigger interruption than the
   * mistake it guards against.
   */
  const [confirming, setConfirming] = useState<string | null>(null);

  const heavy = dirBytes >= TAKES_SIZE_NOTICE_BYTES;

  return (
    <section className="songs-takes" aria-label={t("jam.takes.label")}>
      {available && heavy && (
        <p className="songs-takes-size">{t("jam.takes.size", { megabytes: megabytes(dirBytes) })}</p>
      )}

      {available === false ? (
        <p className="songs-takes-empty">{t("jam.takes.unavailable")}</p>
      ) : takes.length === 0 ? (
        <p className="songs-takes-empty">
          {recording ? t("jam.takes.recordingNow") : t("jam.takes.empty")}
        </p>
      ) : (
        <ul className="songs-takes-list">
          {takes.map((take) => {
            const isPlaying = playingId === take.id;
            // While one take plays the engine has muted the band and is
            // playing a file; starting another or deleting one underneath it
            // is not a thing the engine has been asked to survive.
            const busy = playingId !== null && !isPlaying;
            return (
              <li className="songs-take" key={take.id} data-playing={isPlaying ? "" : undefined}>
                <button
                  type="button"
                  className={`songs-take-play${isPlaying ? " playing" : ""}`}
                  disabled={busy || recording}
                  aria-label={isPlaying ? t("jam.takes.stop") : t("jam.takes.play")}
                  title={isPlaying ? t("jam.takes.stop") : t("jam.takes.play")}
                  onClick={() => (isPlaying ? onStop() : onPlay(take.id))}
                >
                  {isPlaying ? <StopGlyph /> : <PlayGlyph />}
                </button>
                <span className="songs-take-when">
                  {formatDate(take.createdAt, t, i18n.language)}
                </span>
                <span className="songs-take-length">{takeLength(take.durationSec)}</span>
                {/* What the band is doing while this plays. Said rather than
                    left to be noticed: a player who pressed play and heard no
                    drums would reasonably think the band had crashed. */}
                {isPlaying && <span className="songs-take-bandoff">{t("jam.takes.bandOff")}</span>}
                <span className="songs-take-spacer" />
                {confirming === take.id ? (
                  <span className="songs-take-confirm">
                    <span className="songs-take-confirm-ask">{t("jam.takes.confirm")}</span>
                    <button
                      type="button"
                      className="songs-take-confirm-yes"
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
                    className="songs-take-delete"
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
    </section>
  );
}
