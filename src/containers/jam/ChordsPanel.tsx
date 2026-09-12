import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Fretboard, BASS_STANDARD_TUNING, GUITAR_STANDARD_TUNING } from "../../components/fretboard";
import { ChordShapesRow, KeyChordsStrip } from "../../components/chords";
import { chordNotes, chordName, keyRootName } from "../../jam/harmony";
import { shapesFor } from "../../jam/chordShapes";
import type { Instrument } from "../../jam/chordShapes";
import type { Chord, Key } from "../../jam/harmony";
import type { ScaleSuggestion } from "../../jam/scales";

interface ChordsPanelProps {
  /** The key as the player READS it — already transposed. */
  playedKey: Key;
  /** The chord the jam is on, transposed, or null when chords are off. */
  current: Chord | null;
  /** The first scale suggestion, drawn on the neck when no shape is picked. */
  scale: ScaleSuggestion | null;
  /**
   * Which neck to draw, or null for a player who does not have one. A horn
   * player still gets the chords of the key — those are music, not an
   * instrument — but a guitar diagram would be furniture.
   */
  instrument: Instrument | null;
  fretboardOpen: boolean;
  /** The chord the shapes row is pinned to, or null while it follows the jam. */
  pinned: Chord | null;
  onPin: (chord: Chord | null) => void;
  shapeIndex: number;
  onShapeIndex: (index: number) => void;
  sevenths: boolean;
  onSevenths: (next: boolean) => void;
}

/**
 * The chords of the key, one chord's shapes, and the neck.
 *
 * The rule this panel exists to keep (JAM_MODE §4.3, §8.9) is **never a wall
 * of diagrams**. So: one strip of the key's chords, the one you are playing
 * lit; one row of that chord's shapes, which advances with the changes so the
 * grips arrive one chord at a time while you play; sevenths behind a toggle;
 * and the neck itself behind a link. Tap a chord in the strip and the row pins
 * to it instead of following — that is the "follow the jam" switch, expressed
 * as the thing you were already going to do rather than as a control beside it.
 */
export function ChordsPanel({
  playedKey,
  current,
  scale,
  instrument,
  fretboardOpen,
  pinned,
  onPin,
  shapeIndex,
  onShapeIndex,
  sevenths,
  onSevenths,
}: ChordsPanelProps) {
  const { t } = useTranslation();

  /** What the shapes row is about: the pinned chord, or whatever is playing. */
  const subject = pinned ?? current;

  const shapes = useMemo(
    () => (instrument && subject ? shapesFor(subject.root, subject.quality, { instrument }) : []),
    [instrument, subject],
  );

  /**
   * What the neck lights up.
   *
   * The picked shape when there is one, because you are looking at the neck to
   * find that grip; the scale otherwise, because you are looking at it to find
   * somewhere to go. `Fretboard` lights every place a pitch class falls rather
   * than drawing a grip — the grip itself is the diagram in the row — so this
   * also moves the board up the neck to where the shape sits.
   */
  const board = useMemo(() => {
    const picked = shapes[Math.min(shapeIndex, Math.max(0, shapes.length - 1))];
    if (picked) {
      const pitches = picked.pitches.filter((p): p is number => p !== null);
      return {
        startFret: picked.position > 2 ? picked.position - 1 : 0,
        highlight: { pitchClasses: pitches, rootPitchClass: picked.root },
      };
    }
    if (scale) {
      return {
        startFret: 0,
        highlight: { pitchClasses: scale.pitchClasses, rootPitchClass: scale.root },
      };
    }
    if (subject) {
      return {
        startFret: 0,
        highlight: { pitchClasses: chordNotes(subject), rootPitchClass: subject.root },
      };
    }
    return null;
  }, [shapes, shapeIndex, scale, subject]);

  const subjectName = subject ? chordName(subject, playedKey) : "";

  return (
    <section className="jam-chords" aria-label={t("jam.chords.label")}>
      <div className="jam-chords-head">
        <span className="stage-label">{t("jam.chords.inKey", { key: keyLabel(playedKey, t) })}</span>
        {instrument && subject && (
          <button
            type="button"
            role="switch"
            aria-checked={pinned === null}
            className={`transport-switch jam-switch ${pinned === null ? "on" : ""}`}
            title={t("jam.chords.followHint")}
            onClick={() => onPin(pinned === null ? subject : null)}
          >
            <span className="transport-switch-track" aria-hidden="true" />
            {t("jam.chords.follow")}
          </button>
        )}
      </div>

      <KeyChordsStrip
        root={playedKey.root}
        mode={playedKey.mode}
        current={subject}
        instrument={instrument ?? "guitar"}
        diagrams={instrument !== null}
        sevenths={sevenths}
        onSeventhsChange={onSevenths}
        seventhsLabel={t("jam.chords.sevenths")}
        onPick={(chord) => {
          onPin(chord);
          onShapeIndex(0);
        }}
      />

      {instrument && subject && (
        <ChordShapesRow
          root={subject.root}
          quality={subject.quality}
          instrument={instrument}
          selectedIndex={shapeIndex}
          onSelect={(index) => onShapeIndex(index)}
          nextLabel={t("jam.chords.nextShape")}
          sizeLabels={{
            triad: t("jam.chords.sizeTriad"),
            open: t("jam.chords.sizeOpen"),
            barre: t("jam.chords.sizeBarre"),
            seventh: t("jam.chords.sizeSeventh"),
          }}
          fretLabel={(fret) => t("jam.chords.fret", { fret })}
        />
      )}

      {instrument && fretboardOpen && board && (
        <Fretboard
          tuning={instrument === "bass" ? BASS_STANDARD_TUNING : GUITAR_STANDARD_TUNING}
          startFret={board.startFret}
          highlight={board.highlight}
          size="large"
          className="jam-fretboard"
          ariaLabel={t("jam.fretboard.aria", { chord: subjectName })}
        />
      )}
    </section>
  );
}

/** "A blues", "D minor", "G major" — the key, in the reader's language. */
function keyLabel(key: Key, t: (k: string, o?: Record<string, unknown>) => string): string {
  return t(`jam.key.${key.mode}Named`, { root: keyRootName(key) });
}
