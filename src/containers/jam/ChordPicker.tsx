import { useTranslation } from "react-i18next";
import { SHARP_NAMES, chordSuffix, noteName, parseChordName } from "../../jam/harmony";
import type { Chord, ChordQuality, Key } from "../../jam/harmony";
import { AS_THE_FORM } from "../../jam/progression";

/**
 * The qualities offered, in the order a player would look for them.
 *
 * The triads first, then the sevenths, then the colours. Not every quality
 * `harmony.ts` knows — `dim7` and `m7b5` are here because a turnaround needs
 * them, and `9` because a funk jam is unplayable without it — but the ORDER is
 * the point: the chord you want is almost always in the first row.
 */
export const PICKER_QUALITIES: readonly ChordQuality[] = [
  "maj",
  "min",
  "7",
  "maj7",
  "m7",
  "6",
  "m6",
  "m7b5",
  "dim",
  "dim7",
  "aug",
  "sus2",
  "sus4",
  "add9",
  "9",
];

interface ChordPickerProps {
  /** 0-based bar of the chorus being edited — the picker's whole subject. */
  bar: number;
  /** What the bar plays now, for the highlight. Null when it is the form's. */
  current: Chord | null;
  /** True when this bar has no chord of its own and follows the form. */
  followsForm: boolean;
  /** The key, so the roots are spelled the way the rest of the screen spells them. */
  playedKey: Key;
  /** A chord name to store, or `AS_THE_FORM` to clear the bar. */
  onPick: (name: string) => void;
  onClose: () => void;
}

/**
 * Twelve roots, the qualities, and a way out.
 *
 * A panel under the timeline rather than a popover over the cell, and
 * deliberately: the cell is one of thirty-two on a row that reflows with the
 * window, and a floating thing anchored to it lands off-screen for bar 32 at
 * the width people actually use. The panel is always in the same place, which
 * is worth more than proximity when you are picking with a plectrum in your
 * hand (JAM_MODE §3.4).
 *
 * The roots are written sharp, exactly as the key picker writes them and for
 * the same reason — a root button has no chord to spell itself from yet. What
 * gets STORED is the name in the key's own spelling, so a bar picked as "A#"
 * in F minor is written down and read back as "Bb".
 */
export function ChordPicker({
  bar,
  current,
  followsForm,
  playedKey,
  onPick,
  onClose,
}: ChordPickerProps) {
  const { t } = useTranslation();
  const root = current?.root ?? playedKey.root;
  const quality: ChordQuality = current?.quality ?? "maj";

  /** The name to store for a root and quality, spelled from the key. */
  const nameFor = (nextRoot: number, nextQuality: ChordQuality) =>
    `${noteName(nextRoot, "sharp")}${chordSuffix(nextQuality)}`;

  return (
    <div className="jam-chord-picker" role="group" aria-label={t("jam.changes.pickFor", { bar: bar + 1 })}>
      <div className="jam-chord-picker-head">
        <span className="stage-label">{t("jam.changes.pickFor", { bar: bar + 1 })}</span>
        <span className="jam-chord-picker-now">
          {followsForm
            ? t("jam.changes.asTheForm")
            : /* Read back through the parser rather than printed from the
                 buttons, so what the panel says is what the record holds. */
              (parseChordName(nameFor(root, quality)) ? nameFor(root, quality) : "")}
        </span>
        <button type="button" className="jam-link" onClick={onClose}>
          {t("jam.changes.done")}
        </button>
      </div>

      <div className="jam-keys" role="group" aria-label={t("jam.changes.root")}>
        {SHARP_NAMES.map((name, value) => (
          <button
            key={name}
            type="button"
            className={`jam-key${!followsForm && root === value ? " active" : ""}`}
            aria-pressed={!followsForm && root === value}
            onClick={() => onPick(nameFor(value, quality))}
          >
            {noteName(value, "sharp")}
          </button>
        ))}
      </div>

      <div className="jam-chord-qualities" role="group" aria-label={t("jam.changes.quality")}>
        {PICKER_QUALITIES.map((id) => (
          <button
            key={id}
            type="button"
            className={`jam-chord-quality${!followsForm && quality === id ? " active" : ""}`}
            aria-pressed={!followsForm && quality === id}
            onClick={() => onPick(nameFor(root, id))}
          >
            {/* The suffix as it is written on a chart, with the bare major
                shown as a triad rather than as an empty button. */}
            {chordSuffix(id) || t("jam.changes.major")}
          </button>
        ))}
      </div>

      {/* Clearing a bar is not deleting it — the bar goes back to playing
          whatever the form plays there, which is the answer for most bars of
          most tunes and the one you want back after a mistake. */}
      <button
        type="button"
        className={`jam-chord-clear${followsForm ? " active" : ""}`}
        aria-pressed={followsForm}
        onClick={() => onPick(AS_THE_FORM)}
      >
        {t("jam.changes.asTheForm")}
      </button>
    </div>
  );
}
