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
 * (`JAM_UX_DECISIONS` A13: the stage holds what you are DOING).
 *
 * ## The shelf is behind the switch now (2026-09-20, W18)
 *
 * It used to be a section under the stage controls, and a section under the
 * stage controls is a section under the fold: it was one of the three blocks
 * that pushed the verdict 175 px below the bottom of a 900 px window. Nothing
 * about it wants to be on screen while you play — listening back is what you
 * do INSTEAD of playing — so it opens from its own switch as a popover and
 * closes again, and the stage keeps the height.
 *
 * Portalled to the body rather than drawn inside the strip, and placed by
 * Jam's own `useMenuPlacement`: the strip is the last row above the transport,
 * so a list drawn as its child opens straight off the bottom of the window.
 * The rule and the hook are the ones the jam screen's menus already use.
 */
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { megabytes, takeLength, TAKES_SIZE_NOTICE_BYTES } from "../../jam/takes";
import { useMenuPlacement } from "../jam/useMenuPlacement";
import type { JamTake } from "../../jam/types";
import { formatDate } from "../practice-coach/coachCardHelpers";
// W25 — a take looks like a take: a frame of it, and what it was a go at.
import { mediaSrc } from "../../takes/src";
import { printedBarNumber } from "../../songs/position";
import type { TakeDetail } from "./useSongTakes";
import type { SongScore } from "../../songs/types";

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
  /**
   * W25 — what each take was a go AT: bars, speed, times round, score.
   *
   * Optional, and empty is the state a shelf is in until the store answers —
   * the row then says what it always said, a date and a length. See
   * `useSongTakes`.
   */
  details?: Map<string, TakeDetail>;
  /** The song, so a row can print the bar numbers the PAGE uses. */
  score?: SongScore | null;
}

/**
 * The strip's takes group: the record switch, and the way to the shelf.
 *
 * Two controls rather than one, because they are two questions — "record what
 * I am about to play" and "let me hear what I already played" — and the second
 * is the one that must not be under a thumb reaching for the first.
 */
export function SongRecordControl({
  // W21 — the camera's chip, rendered inside this group. A node rather than an
  // import, so `SongTakes.tsx` goes on knowing nothing about cameras.
  camera,
  available,
  takes,
  recording,
  dirBytes,
  playingId,
  enabled,
  onRequestTakes,
  onPlay,
  onStop,
  onDelete,
  details,
  score,
}: SongTakesProps & { camera?: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Upwards: the strip is the last row above the transport, and a shelf that
  // opens downwards lands on Play.
  const { wrapRef, menuRef, style } = useMenuPlacement(open, { prefer: "above" });

  /*
   * Escape closes it, and so does a press anywhere else.
   *
   * The same two ways out every menu on the jam screen has. `pointerdown`
   * rather than `click`, so a press that lands on the stage closes the shelf
   * before whatever it landed on acts on it.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
    };
  }, [open, wrapRef, menuRef]);

  return (
    <div className="songs-strip-group songs-strip-takes" ref={wrapRef}>
      <span className="songs-strip-label">{t("jam.takes.label")}</span>
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
      <button
        type="button"
        className="songs-chip songs-takes-opener"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={available === false}
        onClick={() => setOpen((was) => !was)}
      >
        {t("jam.takes.label")}
        {takes.length > 0 && <span className="songs-takes-count">{takes.length}</span>}
      </button>

      {/* W21 — the camera, in this group rather than in one of its own: it is
          one decision about this pass in two parts, and a second group would
          have cost the strip a row and the tab its height at 480px. */}
      {camera}

      {open &&
        createPortal(
          <div
            className="songs-takes-pop"
            role="dialog"
            aria-label={t("jam.takes.label")}
            ref={menuRef}
            style={style}
          >
            {/* No lead line: the chip that opened this says "Takes", and
                what the shelf says when it is empty already says what
                recording is FOR. A second half-sentence above it read as a
                fragment. */}
            <SongTakes
              available={available}
              takes={takes}
              recording={recording}
              dirBytes={dirBytes}
              playingId={playingId}
              enabled={enabled}
              onRequestTakes={onRequestTakes}
              onPlay={onPlay}
              onStop={onStop}
              onDelete={onDelete}
              details={details}
              score={score}
            />
          </div>,
          document.body,
        )}
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
  details,
  score,
}: SongTakesProps) {
  const { t, i18n } = useTranslation();
  /**
   * W25 — "with picture", off by default.
   *
   * A filter and not a sort: a player looking for the go they filmed is
   * looking for a short list, and a shelf that quietly reordered itself would
   * make the row they pressed yesterday somewhere else today. Drawn only when
   * there is something to filter — a chip that always says "0 of 0" is a
   * control that teaches nothing.
   */
  const [filmedOnly, setFilmedOnly] = useState(false);
  const filmed = takes.filter((take) => take.videoPath).length;
  const shown = filmedOnly ? takes.filter((take) => take.videoPath) : takes;
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

      {/* W25 — the one filter worth having on a shelf of takes. */}
      {available !== false && filmed > 0 && takes.length > filmed && (
        <button
          type="button"
          className="songs-chip songs-takes-filter"
          data-active={filmedOnly ? "" : undefined}
          aria-pressed={filmedOnly}
          onClick={() => setFilmedOnly((was) => !was)}
        >
          {t("songs.takes.withPicture")}
        </button>
      )}

      {available === false ? (
        <p className="songs-takes-empty">{t("jam.takes.unavailable")}</p>
      ) : shown.length === 0 ? (
        <p className="songs-takes-empty">
          {filmedOnly
            ? t("songs.takes.noneFilmed")
            : recording
              ? t("jam.takes.recordingNow")
              : t("jam.takes.empty")}
        </p>
      ) : (
        <ul className="songs-takes-list">
          {shown.map((take) => {
            const isPlaying = playingId === take.id;
            // While one take plays the engine has muted the band and is
            // playing a file; starting another or deleting one underneath it
            // is not a thing the engine has been asked to survive.
            const busy = playingId !== null && !isPlaying;
            const detail = details?.get(take.id);
            return (
              <li className="songs-take" key={take.id} data-playing={isPlaying ? "" : undefined}>
                {/* W25 — a frame of it, grabbed at the first downbeat, so the
                    shelf shows what a take is a picture of. A take with the
                    camera off gets the same box empty rather than no box: a
                    list whose rows are different heights is a list nobody can
                    scan. */}
                <span className="songs-take-thumb" data-empty={take.thumbPath ? undefined : ""}>
                  {take.thumbPath && (
                    <img src={mediaSrc(take.thumbPath)} alt="" loading="lazy" />
                  )}
                </span>
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
                <span className="songs-take-facts">
                  <span className="songs-take-when">
                    {formatDate(take.createdAt, t, i18n.language)}
                    <span className="songs-take-length">{takeLength(take.durationSec)}</span>
                  </span>
                  {/* What it was a go AT. Bars as the PAGE numbers them, which
                      is what a player is looking at; the store counts played
                      bars from zero and nobody says those out loud. */}
                  {detail && score && (
                    <span className="songs-take-was">
                      {t("songs.takes.was", {
                        bars: `${String(printedBarNumber(score, detail.startBar))}–${String(
                          printedBarNumber(score, detail.endBar),
                        )}`,
                        percent: detail.tempoPercent,
                        goes: t("songs.review.goes", { count: Math.max(1, detail.passes) }),
                        score: Math.round(detail.score),
                      })}
                    </span>
                  )}
                </span>
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
