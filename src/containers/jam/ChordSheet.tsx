import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChordDiagram } from "../../components/chords";
import { Fretboard, BASS_STANDARD_TUNING, GUITAR_STANDARD_TUNING } from "../../components/fretboard";
import { chordsInKey, seventhsInKey } from "../../jam/diatonic";
import { shapesFor } from "../../jam/chordShapes";
import { chordName, keyRootName } from "../../jam/harmony";
import type { PlacedShape, Instrument } from "../../jam/chordShapes";
import type { Chord, Key } from "../../jam/harmony";
import type { ScaleSuggestion } from "../../jam/scales";
import type { Jam } from "../../jam/types";
import { JamSheet } from "./JamSheet";

/**
 * The one shape a page like this should draw for a chord.
 *
 * "The open one or the first barre" (JAM_UX_DECISIONS A8). Not simply the
 * first shape the library returns: the lowest thing on the neck for a minor
 * seventh is often a three-string triad, which is a fine grip and a terrible
 * introduction. A page you glance at should show the chord the way you would
 * teach it.
 */
export function basicShape(shapes: PlacedShape[]): PlacedShape | null {
  return (
    shapes.find((s) => s.size === "open") ??
    shapes.find((s) => s.size === "barre") ??
    shapes[0] ??
    null
  );
}

/** The pinned shape as the record stores it, matched back to a real grip. */
export function pinnedShapeOf(
  jam: Jam,
  instrument: Instrument | null,
): { shape: PlacedShape; chord: Chord } | null {
  const pin = jam.pinnedShape;
  if (!pin || !instrument) return null;
  const shapes = shapesFor(pin.root as Chord["root"], pin.quality as Chord["quality"], {
    instrument,
  });
  const shape = shapes[Math.min(Math.max(pin.index, 0), Math.max(0, shapes.length - 1))];
  if (!shape) return null;
  return { shape, chord: { root: shape.root, quality: shape.quality } };
}

interface ChordSheetProps {
  jam: Jam;
  onEdit: (patch: Partial<Omit<Jam, "id" | "createdAt">>) => void;
  onClose: () => void;
  /** The key as the player READS it — already transposed. */
  playedKey: Key;
  /** The chord the jam is on, or null when chords are off. */
  current: Chord | null;
  /** The scale to draw on the neck for this key. */
  scale: ScaleSuggestion | null;
  /** Which neck to draw, or null for a player who has none. */
  instrument: Instrument | null;
  /** The chord whose shapes are expanded, or null. Screen state. */
  expanded: Chord | null;
  onExpand: (chord: Chord | null) => void;
  /** Which of the expanded chord's shapes is selected; `jam-next-shape` steps it. */
  shapeIndex: number;
  onShapeIndex: (index: number) => void;
  sevenths: boolean;
  onSevenths: (next: boolean) => void;
  fretboardOpen: boolean;
  onFretboard: (open: boolean) => void;
}

/**
 * The chords of the key, as a page you can glance at (JAM_UX_DECISIONS A8).
 *
 * The owner's words were: "the fretboard and the chords are amazing, but they
 * shouldn't keep changing." So shapes left the playing screen entirely. On the
 * playing screen only two things move on their own now — the timeline and the
 * chord you are on. Everything harmonic lives here, and here nothing moves
 * unless you ask it to.
 *
 * One basic shape per chord, seven of them, in a grid. Tap one and every way
 * to play it opens underneath. Pin one and it goes to the corner of the
 * playing screen and stays there until you unpin it. "Follow the jam" is a
 * switch, off by default, for the player who did want the old behaviour — and
 * the fretboard is the same bargain: opt in, and when open it shows ONE box
 * for the key rather than a scale that swaps on every chord.
 */
export function ChordSheet({
  jam,
  onEdit,
  onClose,
  playedKey,
  current,
  scale,
  instrument,
  expanded,
  onExpand,
  shapeIndex,
  onShapeIndex,
  sevenths,
  onSevenths,
  fretboardOpen,
  onFretboard,
}: ChordSheetProps) {
  const { t } = useTranslation();

  const follows = !!jam.shapesFollow;

  /**
   * Which chord the expanded row is about.
   *
   * The one you tapped; or, with "Follow the jam" on, the one the band is
   * playing. Following is a mode you chose, so it wins over a tap the moment
   * it is on — which is exactly what "follow" means.
   */
  const subject = follows ? (current ?? expanded) : expanded;

  const chords = useMemo(
    () =>
      sevenths
        ? seventhsInKey(playedKey.root, playedKey.mode)
        : chordsInKey(playedKey.root, playedKey.mode),
    [sevenths, playedKey.root, playedKey.mode],
  );

  const shapes = useMemo(
    () => (instrument && subject ? shapesFor(subject.root, subject.quality, { instrument }) : []),
    [instrument, subject],
  );

  const picked = shapes.length
    ? shapes[Math.min(Math.max(shapeIndex, 0), shapes.length - 1)]
    : null;

  const pin = jam.pinnedShape ?? null;
  const isPinned =
    !!pin && !!picked && pin.root === picked.root && pin.quality === picked.quality;

  /**
   * The neck, static.
   *
   * The key's scale and nothing else: not the current chord's, which is what
   * made it "keep changing". One box, the one you would use, and it is the
   * same box in bar 1 and bar 9.
   */
  const board = scale
    ? { startFret: boxStart(scale), highlight: { pitchClasses: scale.pitchClasses, rootPitchClass: scale.root } }
    : null;

  return (
    <JamSheet
      kind="chords"
      title={t("jam.chords.inKey", { key: keyLabel(playedKey, t) })}
      subtitle={t("jam.chords.sheetLead")}
      onClose={onClose}
    >
      <div className="jam-chord-grid" role="group" aria-label={t("jam.chords.label")}>
        {chords.map((chord) => {
          const shape = instrument
            ? basicShape(shapesFor(chord.root, chord.quality, { instrument }))
            : null;
          const name = chordName({ root: chord.root, quality: chord.quality }, playedKey);
          const on =
            !!subject && subject.root === chord.root && subject.quality === chord.quality;
          return (
            <button
              key={`${chord.degree}-${chord.root}`}
              type="button"
              className={`jam-chord-card${on ? " active" : ""}`}
              aria-pressed={on}
              aria-label={name}
              onClick={() => {
                onExpand(on ? null : { root: chord.root, quality: chord.quality });
                onShapeIndex(0);
              }}
            >
              {shape ? (
                <ChordDiagram shape={shape} size="sm" selected={on} label={name} />
              ) : (
                <span className="jam-chord-card-name">{name}</span>
              )}
              <span className="jam-chord-card-degree">{chord.degree}</span>
            </button>
          );
        })}
      </div>

      <div className="jam-chord-switches">
        <div
          className="accent-control jam-segmented"
          role="group"
          aria-label={t("jam.chords.sizeLabel")}
        >
          <div className="accent-options">
            <button
              type="button"
              className={`accent-option${sevenths ? "" : " active"}`}
              aria-pressed={!sevenths}
              onClick={() => onSevenths(false)}
            >
              {t("jam.chords.triads")}
            </button>
            <button
              type="button"
              className={`accent-option${sevenths ? " active" : ""}`}
              aria-pressed={sevenths}
              onClick={() => onSevenths(true)}
            >
              {t("jam.chords.sevenths")}
            </button>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={follows}
          className={`transport-switch jam-switch ${follows ? "on" : ""}`}
          title={t("jam.chords.followHint")}
          onClick={() => onEdit({ shapesFollow: !follows })}
        >
          <span className="transport-switch-track" aria-hidden="true" />
          {t("jam.chords.follow")}
        </button>
      </div>

      {subject && instrument && shapes.length > 0 && (
        <section className="jam-chord-ways" aria-label={t("jam.chords.everyWay", {
          chord: chordName(subject, playedKey),
        })}>
          <div className="jam-sheet-group-head">
            <span className="stage-label">
              {t("jam.chords.everyWay", { chord: chordName(subject, playedKey) })}
            </span>
            <span className="jam-sheet-lead">{t("jam.chords.lowToHigh")}</span>
            <button
              type="button"
              className={`jam-link${isPinned ? " active" : ""}`}
              aria-pressed={isPinned}
              onClick={() =>
                onEdit({
                  pinnedShape: isPinned
                    ? null
                    : picked
                      ? { root: picked.root, quality: picked.quality, index: shapes.indexOf(picked) }
                      : null,
                })
              }
            >
              {isPinned ? t("jam.chords.unpin") : t("jam.chords.pin")}
            </button>
          </div>
          <div className="jam-chord-shapes">
            {shapes.map((shape, index) => (
              <button
                key={shape.id}
                type="button"
                className={`jam-chord-shape${index === shapeIndex ? " active" : ""}`}
                aria-pressed={index === shapeIndex}
                onClick={() => onShapeIndex(index)}
              >
                <ChordDiagram
                  shape={shape}
                  size="sm"
                  selected={index === shapeIndex}
                  showName={false}
                />
                <span className="jam-chord-shape-label">
                  {t(`jam.chords.size${sizeKey(shape.size)}`)}
                </span>
                {/* Where it sits, for the shapes that have somewhere to sit.
                    An open shape is at the nut by definition, and a label
                    reading "open · open" says nothing twice. */}
                {shape.position > 0 && (
                  <span className="jam-chord-shape-fret">
                    {t("jam.chords.fret", { fret: shape.position })}
                  </span>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {instrument && (
        <section className="jam-chord-neck">
          <div className="jam-sheet-group-head">
            <button
              type="button"
              role="switch"
              aria-checked={fretboardOpen}
              className={`transport-switch jam-switch ${fretboardOpen ? "on" : ""}`}
              onClick={() => onFretboard(!fretboardOpen)}
            >
              <span className="transport-switch-track" aria-hidden="true" />
              {t("jam.fretboard.label")}
            </button>
            {fretboardOpen && scale && (
              <span className="jam-sheet-lead">
                {t("jam.fretboard.staysPut", {
                  scale: t(scale.labelKey, { defaultValue: scale.scale }),
                  fret: boxStart(scale),
                })}
              </span>
            )}
          </div>
          {fretboardOpen && board && (
            <Fretboard
              tuning={instrument === "bass" ? BASS_STANDARD_TUNING : GUITAR_STANDARD_TUNING}
              startFret={board.startFret}
              highlight={board.highlight}
              size="large"
              className="jam-fretboard"
              ariaLabel={t("jam.fretboard.aria", { chord: keyRootName(playedKey) })}
            />
          )}
        </section>
      )}
    </JamSheet>
  );
}

/**
 * Which fret the box starts at: the scale's root on the low E string.
 *
 * That is where a guitarist actually finds a box — E minor pentatonic is "at
 * the nut" or "at the twelfth", and both are the sixth string. 0 for E, 8 for
 * C. Static, so the neck stops moving (A8).
 */
function boxStart(scale: ScaleSuggestion): number {
  return (scale.root - 4 + 12) % 12;
}

/** `ShapeSize` to the suffix of its locale key. */
function sizeKey(size: PlacedShape["size"]): string {
  return size.charAt(0).toUpperCase() + size.slice(1);
}

/** "A blues", "D minor", "G major" — the key, in the reader's language. */
function keyLabel(key: Key, t: (k: string, o?: Record<string, unknown>) => string): string {
  return t(`jam.key.${key.mode}Named`, { root: keyRootName(key) });
}
