import { chordName } from "../../jam/diatonic";
import type { PlacedShape } from "../../jam/chordShapes";
import type { PitchClass } from "../../jam/harmony";
import "../../styles/chords.css";

/**
 * One chord box.
 *
 * Six strings (four on a bass) across, five frets down, a dot where a finger
 * goes, an o over a string you let ring and an × over one you damp. It is
 * the oldest notation guitarists have and it works because it is a picture
 * of the neck seen head-on.
 *
 * Drawn as inline SVG with the app's own colour variables, so it follows
 * every theme without a second stylesheet and without a library.
 *
 * At `xs` the finger numbers come off. A 64px box is for recognising the
 * chord in a row of seven, not for learning the fingering; the numbers at
 * that size are a grey smudge that makes the dots harder to count, not
 * easier.
 */

export type ChordDiagramSize = "xs" | "sm" | "md";

export type ChordDiagramProps = {
  shape: PlacedShape;
  size?: ChordDiagramSize;
  selected?: boolean;
  /** The name over the box. Defaults to the chord's own name. */
  label?: string;
  /** Pass false for a bare box, e.g. when the name is already above the row. */
  showName?: boolean;
  /**
   * What to write on each sounding note: its name, or what it is doing in
   * the chord. Left out, the dots carry the finger numbers as before.
   *
   * The same question the neck answers with ON THE DOTS, asked of a grip
   * instead of a scale — and the answer was already in the data. Every
   * `PlacedShape` carries the pitch class each string sounds; nothing had
   * ever drawn it. A box that says which dot is the third is the difference
   * between copying a shape and knowing one.
   *
   * It replaces the finger numbers rather than joining them: there is one
   * circle and it holds one character. Fingering is how to grab the chord
   * and this is what the chord IS, and a player wanting the first is not
   * asking the second at the same moment.
   */
  nameNote?: (pc: PitchClass) => string;
};

const STRING_GAP = 10;
const FRET_GAP = 12;
const ROWS = 5;
const PAD_LEFT = 13;
const PAD_RIGHT = 7;
/** Room above the nut for the name and the o / × markers. */
const TOP_WITH_NAME = 26;
/** Room for the markers alone, when the name is already above the row. */
const TOP_BARE = 14;
const BOTTOM = 5;

/** The width a six-string box is drawn at internally; the scale hangs off it. */
const REFERENCE_WIDTH = PAD_LEFT + 5 * STRING_GAP + PAD_RIGHT;

const RENDERED_WIDTH: Record<ChordDiagramSize, number> = { xs: 64, sm: 96, md: 132 };

export function ChordDiagram({
  shape,
  size = "sm",
  selected = false,
  label,
  showName = true,
  nameNote,
}: ChordDiagramProps) {
  const strings = shape.frets.length;
  const TOP = showName ? TOP_WITH_NAME : TOP_BARE;
  const gridWidth = (strings - 1) * STRING_GAP;
  const viewWidth = PAD_LEFT + gridWidth + PAD_RIGHT;
  const viewHeight = TOP + ROWS * FRET_GAP + BOTTOM;
  const scale = RENDERED_WIDTH[size] / REFERENCE_WIDTH;
  const name = label ?? chordName(shape.root, shape.quality);
  /* At `xs` the finger numbers come off — see the note above. A note name is
     one or two characters in the same circle, so it comes off for the same
     reason and at the same size. */
  const showDotText = size !== "xs";
  const showFingers = showDotText && !nameNote;

  const x = (index: number) => PAD_LEFT + index * STRING_GAP;
  const rowCentre = (fret: number) => TOP + (fret - shape.baseFret) * FRET_GAP + FRET_GAP / 2;
  const inBox = (fret: number) => fret >= shape.baseFret && fret < shape.baseFret + ROWS;

  const gridLeft = x(0);
  const gridRight = x(strings - 1);
  const atNut = shape.baseFret === 1;
  const barre = shape.barre && inBox(shape.barre.fret) ? shape.barre : undefined;

  return (
    <span
      className={["chord-diagram", "chord-diagram-" + size, selected ? "is-selected" : ""]
        .filter(Boolean)
        .join(" ")}
      data-testid="chord-diagram"
    >
      <svg
        width={Math.round(viewWidth * scale)}
        height={Math.round(viewHeight * scale)}
        viewBox={"0 0 " + String(viewWidth) + " " + String(viewHeight)}
        role="img"
        aria-label={name + ", " + shape.name}
      >
        {showName && (
          <text
            className="chord-diagram-name"
            data-testid="chord-name"
            x={(gridLeft + gridRight) / 2}
            y={13}
            textAnchor="middle"
          >
            {name}
          </text>
        )}

        {/* The frets. */}
        {Array.from({ length: ROWS + 1 }, (_, row) => (
          <line
            key={"fret" + String(row)}
            className="chord-diagram-fret"
            x1={gridLeft}
            y1={TOP + row * FRET_GAP}
            x2={gridRight}
            y2={TOP + row * FRET_GAP}
          />
        ))}

        {/* The strings. */}
        {Array.from({ length: strings }, (_, i) => (
          <line
            key={"string" + String(i)}
            className="chord-diagram-string"
            x1={x(i)}
            y1={TOP}
            x2={x(i)}
            y2={TOP + ROWS * FRET_GAP}
          />
        ))}

        {atNut && (
          <line
            className="chord-diagram-nut"
            data-testid="chord-nut"
            x1={gridLeft}
            y1={TOP}
            x2={gridRight}
            y2={TOP}
          />
        )}

        {!atNut && (
          <text
            className="chord-diagram-basefret"
            data-testid="chord-base-fret"
            x={gridLeft - 4}
            y={rowCentre(shape.baseFret) + 3}
            textAnchor="end"
          >
            {shape.baseFret}
          </text>
        )}

        {barre && (
          <rect
            className="chord-diagram-barre"
            data-testid="chord-barre"
            x={x(strings - barre.from) - 4}
            y={rowCentre(barre.fret) - 4}
            width={x(strings - barre.to) - x(strings - barre.from) + 8}
            height={8}
            rx={4}
          />
        )}

        {shape.frets.map((fret, i) => {
          if (fret === null) {
            return (
              <text
                key={"mark" + String(i)}
                className="chord-diagram-mute"
                data-testid="chord-mute"
                x={x(i)}
                y={TOP - 4}
                textAnchor="middle"
              >
                ×
              </text>
            );
          }
          if (fret === 0) {
            const pc = shape.pitches[i];
            const open =
              nameNote && showDotText && pc !== null && pc !== undefined ? nameNote(pc) : null;
            /* An open string sounds as much as a fretted one, so when the box
               is naming its notes it has to name this one too — an open D
               chord is three dots and two open strings, and labelling only
               the dots would say a five-note chord has three notes in it.
               The name takes the o's place rather than sitting beside it:
               above the nut is what says "open", and there is no room for
               both. */
            if (open !== null) {
              return (
                <text
                  key={"mark" + String(i)}
                  className="chord-diagram-open-name"
                  data-testid="chord-open-name"
                  x={x(i)}
                  y={TOP - 4}
                  textAnchor="middle"
                >
                  {open}
                </text>
              );
            }
            return (
              <circle
                key={"mark" + String(i)}
                className="chord-diagram-open"
                data-testid="chord-open"
                cx={x(i)}
                cy={TOP - 7}
                r={2.6}
              />
            );
          }
          return null;
        })}

        {shape.frets.map((fret, i) => {
          if (fret === null || fret === 0 || !inBox(fret)) return null;
          const finger = shape.fingers[i];
          const pc = shape.pitches[i];
          const note =
            nameNote && showDotText && pc !== null && pc !== undefined ? nameNote(pc) : null;
          return (
            <g key={"dot" + String(i)}>
              <circle
                className="chord-diagram-dot"
                data-testid="chord-dot"
                cx={x(i)}
                cy={rowCentre(fret)}
                r={4.2}
              />
              {note !== null && (
                <text
                  className="chord-diagram-note"
                  data-testid="chord-note"
                  x={x(i)}
                  y={rowCentre(fret) + 2.5}
                  textAnchor="middle"
                >
                  {note}
                </text>
              )}
              {showFingers && finger !== null && finger !== undefined && (
                <text
                  className="chord-diagram-finger"
                  data-testid="chord-finger"
                  x={x(i)}
                  y={rowCentre(fret) + 2.5}
                  textAnchor="middle"
                >
                  {finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </span>
  );
}

export default ChordDiagram;
