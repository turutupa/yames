import { useState } from "react";
import {
  type Chord,
  type KeyMode,
  type PitchClass,
  chordName,
  chordsInKey,
  seventhsInKey,
} from "../../jam/diatonic";
import { type Instrument, shapesFor } from "../../jam/chordShapes";
import { ChordDiagram } from "./ChordDiagram";
import "../../styles/chords.css";

/**
 * The chords of the key, in a row.
 *
 * Set the key to A and this is the answer to "what can I play": A Bm C#m D E
 * F#m G#dim, each as a small box, the one the jam is on right now lit up.
 * Roles are tinted rather than labelled — home, the step away, the pull back
 * — so the shape of the key is visible before any of it is read.
 *
 * Sevenths sit behind a toggle. Showing fourteen chords at once is the wall
 * of diagrams the owner asked us not to build (plans/JAM_MODE.md §4.3); a
 * player who wants Imaj7 knows to ask for it.
 *
 * ## For the integrator
 *
 * No translation keys: this worker's area is new files only, and a key has
 * to land in fifteen locale files to exist at all. Every visible word here
 * arrives as a prop with an English default, so wiring i18n is a matter of
 * passing translated strings in — nothing in this file has to change.
 */

export type KeyChordsStripProps = {
  root: PitchClass;
  mode: KeyMode;
  /** The chord playing right now, lit in the row. */
  current?: Chord | null;
  onPick?: (chord: Chord) => void;
  instrument?: Instrument;
  /** Controlled sevenths toggle. Leave out and the strip keeps its own. */
  sevenths?: boolean;
  onSeventhsChange?: (next: boolean) => void;
  seventhsLabel?: string;
  /**
   * Draw a grip for each chord, or just its name. Default on.
   *
   * Off for a player with no frets. A horn player still wants the chords of
   * the key — those are music — but a row of guitar diagrams in front of them
   * is furniture about somebody else's instrument.
   */
  diagrams?: boolean;
};

export function KeyChordsStrip({
  root,
  mode,
  current = null,
  onPick,
  instrument = "guitar",
  sevenths,
  onSeventhsChange,
  seventhsLabel = "7ths",
  diagrams = true,
}: KeyChordsStripProps) {
  const [ownSevenths, setOwnSevenths] = useState(false);
  const showSevenths = sevenths ?? ownSevenths;
  const chords = showSevenths ? seventhsInKey(root, mode) : chordsInKey(root, mode);

  const toggle = () => {
    const next = !showSevenths;
    if (sevenths === undefined) setOwnSevenths(next);
    onSeventhsChange?.(next);
  };

  return (
    <div className="key-chords" data-testid="key-chords-strip">
      <div className="key-chords-row">
        {chords.map((chord) => {
          const shape = diagrams ? shapesFor(chord.root, chord.quality, { instrument })[0] : null;
          const isCurrent =
            current !== null && current.root === chord.root && current.quality === chord.quality;
          const name = chordName(chord.root, chord.quality, { root, mode });
          return (
            <button
              key={chord.degree + "-" + String(chord.root)}
              type="button"
              data-testid="key-chord"
              className={[
                "key-chord",
                "key-chord-" + chord.role,
                isCurrent ? "is-current" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-pressed={isCurrent}
              aria-label={name}
              onClick={() => onPick?.({ root: chord.root, quality: chord.quality })}
            >
              {shape ? (
                <ChordDiagram shape={shape} size="xs" selected={isCurrent} label={name} />
              ) : (
                <span className="key-chord-name">{name}</span>
              )}
              <span className="key-chord-degree">{chord.degree}</span>
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={["key-chords-sevenths", showSevenths ? "is-on" : ""].filter(Boolean).join(" ")}
        data-testid="key-chords-sevenths"
        aria-pressed={showSevenths}
        onClick={toggle}
      >
        {seventhsLabel}
      </button>
    </div>
  );
}

export default KeyChordsStrip;
