/**
 * Which part of the file is yours.
 *
 * `SONGS.md` A3: the player picks a track on import, guitars and basses
 * first, and **the tuning and the capo are shown before anything plays** —
 * because finding out the file is in Eb after you have tuned up is the whole
 * complaint this answers.
 *
 * This is setup, so it is a sheet over the stage rather than a control on it
 * (`JAM_UX_DECISIONS` A13): it happens once, before you count in.
 */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { SongTrackChoice } from "../../songs/import";

/** MIDI note to a note name, for the tuning line. Sharps, no octave games. */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function tuningLabel(tuning: number[]): string {
  // Low string first, the way a player says a tuning out loud — "E A D G B E"
  // — while the array is stored highest-first.
  return [...tuning]
    .reverse()
    .map((midi) => NOTE_NAMES[((midi % 12) + 12) % 12])
    .join(" ");
}

export interface TrackPickerProps {
  title: string;
  fileName: string;
  tracks: SongTrackChoice[];
  onChoose: (trackIndex: number) => void;
  onCancel: () => void;
}

export function TrackPicker({ title, fileName, tracks, onChoose, onCancel }: TrackPickerProps) {
  const { t } = useTranslation();
  const firstRef = useRef<HTMLButtonElement>(null);

  // Escape closes, and the first track takes focus: the keyboard reach the
  // rest of the app has (UI_DECISIONS U1.5 on settings, same idea).
  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div className="songs-picker-scrim" role="presentation" onClick={onCancel}>
      <div
        className="songs-picker"
        role="dialog"
        aria-modal="true"
        aria-label={t("songs.picker.title")}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="songs-picker-head">
          <h2 className="songs-picker-title">{title || fileName}</h2>
          <p className="songs-picker-sub">{t("songs.picker.which")}</p>
        </header>
        <ul className="songs-picker-list">
          {tracks.map((track, i) => (
            <li key={track.index}>
              <button
                type="button"
                ref={i === 0 ? firstRef : undefined}
                className="songs-picker-track"
                data-kind={track.kind}
                onClick={() => onChoose(track.index)}
                disabled={track.stringCount === 0}
              >
                <span className="songs-picker-track-name">{track.name}</span>
                <span className="songs-picker-track-detail">
                  {track.stringCount === 0
                    ? t("songs.picker.notTab")
                    : t("songs.picker.strings", { count: track.stringCount })}
                </span>
                {track.stringCount > 0 && (
                  <span className="songs-picker-track-tuning">
                    {tuningLabel(track.tuning)}
                    {track.capo > 0 && ` · ${t("songs.capo", { fret: track.capo })}`}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
        <footer className="songs-picker-foot">
          <button type="button" className="songs-btn" onClick={onCancel}>
            {t("songs.picker.cancel")}
          </button>
        </footer>
      </div>
    </div>
  );
}
