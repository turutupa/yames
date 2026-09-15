import { useEffect, useRef, useState } from "react";
import { type ChordQuality, type PitchClass, chordName } from "../../jam/diatonic";
import { type Instrument, type PlacedShape, type ShapeSize, shapesFor } from "../../jam/chordShapes";
import { ChordDiagram } from "./ChordDiagram";
import "../../styles/chords.css";

/**
 * One chord, every way to play it.
 *
 * The owner's rule for this whole feature: never a wall of diagrams. So this
 * is one chord's shapes and nothing else, laid out left to right in the
 * order you meet them walking up the neck — the open shape first if there is
 * one, then the three-string triads, then the barres, then the seventh
 * voicings — in a strip that scrolls rather than a grid that sprawls.
 *
 * "Next shape" exists because the other hand is busy. It is one button, it
 * wraps, and a footswitch can press it.
 *
 * `onSelect` reports the chosen shape so the screen around this can light
 * the same notes on the big fretboard.
 *
 * ## For the integrator
 *
 * Every visible word is a prop with an English default, for the reason given
 * in `KeyChordsStrip`.
 */

export type ChordShapesRowProps = {
  root: PitchClass;
  quality: ChordQuality;
  instrument?: Instrument;
  /** Controlled selection. Leave out and the row keeps its own. */
  selectedIndex?: number;
  onSelect?: (index: number, shape: PlacedShape) => void;
  nextLabel?: string;
  sizeLabels?: Record<ShapeSize, string>;
  /** Shown before the fret number of a shape that is not at the nut. */
  fretLabel?: (fret: number) => string;
};

const DEFAULT_SIZE_LABELS: Record<ShapeSize, string> = {
  triad: "triad",
  open: "open",
  barre: "barre",
  seventh: "7th",
};

export function ChordShapesRow({
  root,
  quality,
  instrument = "guitar",
  selectedIndex,
  onSelect,
  nextLabel = "Next shape",
  sizeLabels = DEFAULT_SIZE_LABELS,
  fretLabel = (fret) => "fret " + String(fret),
}: ChordShapesRowProps) {
  const shapes = shapesFor(root, quality, { instrument });
  const [ownIndex, setOwnIndex] = useState(0);
  const selected = Math.min(selectedIndex ?? ownIndex, Math.max(0, shapes.length - 1));
  const scroller = useRef<HTMLDivElement | null>(null);

  // The chord changes under you while the jam plays; start again at the
  // shape nearest the nut rather than at whatever index the last chord left.
  useEffect(() => {
    setOwnIndex(0);
  }, [root, quality, instrument]);

  useEffect(() => {
    const node = scroller.current?.children[selected];
    if (node && typeof (node as HTMLElement).scrollIntoView === "function") {
      (node as HTMLElement).scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [selected]);

  const pick = (index: number) => {
    if (shapes.length === 0) return;
    const next = ((index % shapes.length) + shapes.length) % shapes.length;
    if (selectedIndex === undefined) setOwnIndex(next);
    onSelect?.(next, shapes[next]);
  };

  const name = chordName(root, quality);

  return (
    <div className="chord-shapes" data-testid="chord-shapes-row">
      <div className="chord-shapes-head">
        <span className="chord-shapes-name">{name}</span>
        <button
          type="button"
          className="chord-shapes-next"
          data-testid="chord-shapes-next"
          onClick={() => pick(selected + 1)}
          disabled={shapes.length < 2}
        >
          {nextLabel}
        </button>
      </div>
      <div className="chord-shapes-scroll" ref={scroller} role="listbox" aria-label={name}>
        {shapes.map((shape, index) => (
          <button
            key={shape.id}
            type="button"
            role="option"
            aria-selected={index === selected}
            data-testid="chord-shape"
            className={["chord-shape", index === selected ? "is-selected" : ""]
              .filter(Boolean)
              .join(" ")}
            title={shape.name}
            onClick={() => pick(index)}
          >
            <ChordDiagram shape={shape} size="sm" selected={index === selected} showName={false} />
            <span className="chord-shape-size">{sizeLabels[shape.size]}</span>
            {shape.position > 0 && (
              <span className="chord-shape-where">{fretLabel(shape.position)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export default ChordShapesRow;
