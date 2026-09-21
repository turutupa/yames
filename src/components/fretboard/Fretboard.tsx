/**
 * A fretboard, drawn as inline SVG.
 *
 * Every colour comes from the app's CSS custom properties through
 * `styles/fretboard.css`, so the board follows whatever theme the app is
 * wearing without this file knowing a single hex value. Geometry is computed
 * here; nothing else is.
 *
 * The board is a picture, not a control: it takes a set of pitch classes and
 * lights up every place on the neck where they fall. It knows nothing about
 * chords, keys or scales — `src/jam/scales.ts` decides what to highlight and
 * hands the notes over.
 */

import { useState } from "react";
import { pitchClass, type PitchClass } from "../../jam/harmony";
import "../../styles/fretboard.css";

/** Open strings as MIDI note numbers, lowest string first. */
export type Tuning = readonly number[];

/** E A D G B E, the standard guitar. Low E is MIDI 40 (E2). */
export const GUITAR_STANDARD_TUNING: Tuning = [40, 45, 50, 55, 59, 64];

/** E A D G, the four-string bass. Low E is MIDI 28 (E1). */
export const BASS_STANDARD_TUNING: Tuning = [28, 33, 38, 43];

/**
 * Where the dots in the wood go. The brief asks for 3 5 7 9 12; the rest of
 * the standard set is here so a strip drawn up at the fifteenth fret still
 * looks like a guitar.
 */
const SINGLE_MARKERS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_MARKERS = new Set([12, 24]);

export type FretboardSize = "small" | "large" | "sheet";

export type FretboardHighlight = {
  /** Every pitch class to light up, in any order. */
  pitchClasses: readonly PitchClass[];
  /** The one that gets a filled dot. Omit for a board with no root. */
  rootPitchClass?: PitchClass | null;
};

export type FretboardProps = {
  /** Open strings, lowest first. Defaults to standard guitar. */
  tuning?: Tuning;
  /** How many fret cells to draw. Default 12. */
  frets?: number;
  /**
   * The first fret drawn. 0 means start at the nut, and the open strings get
   * their own column to the left of it; anything higher starts up the neck
   * and there are no open strings to show.
   */
  startFret?: number;
  highlight: FretboardHighlight;
  /**
   * What a note IS, for the label that appears when you rest on it.
   *
   * The board draws where the notes are and says nothing about what they are,
   * which leaves "which one is the flat third" — the question a player is
   * actually asking of it — unanswered. It still knows nothing about keys or
   * scales: the caller names the note, this only puts the words on screen.
   * Absent: no labels, and the board is the picture it always was.
   */
  describeNote?: (pitchClass: PitchClass) => string;
  /**
   * Write each note's name inside its dot.
   *
   * The printed cheat sheets a player already owns name every note on the
   * neck, and "which note is this" is the question a diagram of dots cannot
   * answer by itself — hovering answers it one note at a time, which is no
   * use to somebody learning where the C's are. Absent: dots, as before.
   */
  nameNote?: (pitchClass: PitchClass) => string;
  size?: FretboardSize;
  /**
   * Read out to a screen reader. The caller supplies it already translated —
   * this component holds no strings of its own. Without it the board is
   * hidden from assistive technology, which is the honest default for a
   * decoration that repeats what the text beside it already says.
   */
  ariaLabel?: string;
  className?: string;
};

type Metrics = {
  fretWidth: number;
  stringGap: number;
  dotRadius: number;
  pad: number;
  numberRow: number;
  openColumn: number;
  fontSize: number;
};

const METRICS: Record<FretboardSize, Metrics> = {
  small: {
    fretWidth: 20,
    stringGap: 11,
    dotRadius: 4,
    pad: 8,
    numberRow: 11,
    openColumn: 15,
    fontSize: 7,
  },
  large: {
    fretWidth: 38,
    stringGap: 20,
    dotRadius: 7.5,
    pad: 12,
    numberRow: 18,
    openColumn: 26,
    fontSize: 11,
  },
  /*
   * The scales cheat sheet: a whole neck per scale, a dozen scales down the
   * page, the way the printed card prints them.
   *
   * `large` is drawn for ONE neck with room around it, and the sheet used to
   * use it — stretched to the width of a maximized window, which is about
   * two and a half times its natural size. Every dot came out eighteen
   * pixels across and a single scale took a third of the screen, so you read
   * two of them and scrolled. The card fits six.
   *
   * So: wide enough not to want stretching, and the strings close enough
   * together that a neck is a band rather than a wall. The dots go with
   * them — a scale is a SHAPE, and the eye reads the shape off the spacing
   * between dots, which a dot nearly as wide as its fret leaves none of.
   */
  sheet: {
    fretWidth: 46,
    stringGap: 13,
    dotRadius: 4.6,
    pad: 8,
    numberRow: 13,
    openColumn: 22,
    fontSize: 8,
  },
};

export default function Fretboard({
  tuning = GUITAR_STANDARD_TUNING,
  frets = 12,
  startFret = 0,
  describeNote,
  nameNote,
  highlight,
  size = "large",
  ariaLabel,
  className,
}: FretboardProps) {
  const metrics = METRICS[size];
  /** The note the pointer is on, or null. Only ever one. */
  const [hovered, setHovered] = useState<{ string: number; fret: number; pc: PitchClass } | null>(
    null,
  );
  const fretCount = Math.max(1, Math.floor(frets));
  const nutStart = Math.max(0, Math.floor(startFret)) === 0;
  // The lowest fret with a wire under it. When the board starts at the nut
  // the open strings live in their own column and fret 1 is the first cell.
  const firstFret = Math.max(1, Math.floor(startFret));
  const lastFret = firstFret + fretCount - 1;

  const stringCount = tuning.length;
  const openColumn = nutStart ? metrics.openColumn : 0;
  const boardLeft = metrics.pad + openColumn;
  const boardTop = metrics.pad;
  const boardWidth = fretCount * metrics.fretWidth;
  const boardHeight = Math.max(1, stringCount - 1) * metrics.stringGap;
  const width = boardLeft + boardWidth + metrics.pad;
  const height = boardTop + boardHeight + metrics.pad + metrics.numberRow;

  const highlighted = new Set(highlight.pitchClasses.map((pc) => pitchClass(pc)));
  const rootPc =
    highlight.rootPitchClass === null || highlight.rootPitchClass === undefined
      ? null
      : pitchClass(highlight.rootPitchClass);

  /** The centre of a fret cell. `fret` 0 is the open-string column. */
  const fretX = (fret: number) =>
    fret === 0 ? boardLeft - openColumn / 2 : boardLeft + (fret - firstFret + 0.5) * metrics.fretWidth;

  /** Highest-sounding string on top, the way a chart is drawn. */
  const stringY = (index: number) => boardTop + (stringCount - 1 - index) * metrics.stringGap;

  const fretWires: number[] = [];
  for (let fret = firstFret; fret <= lastFret; fret++) fretWires.push(fret);

  const dots: Array<{ string: number; fret: number; pc: PitchClass; root: boolean }> = [];
  for (let index = 0; index < stringCount; index++) {
    const open = tuning[index];
    const from = nutStart ? 0 : firstFret;
    for (let fret = from; fret <= lastFret; fret++) {
      if (fret !== 0 && fret < firstFret) continue;
      const pc = pitchClass(open + fret);
      if (!highlighted.has(pc)) continue;
      dots.push({ string: index, fret, pc, root: rootPc !== null && pc === rootPc });
    }
  }

  // The markers get a number, and so does the first fret of a board that
  // starts up the neck — otherwise nothing on it says where the hand goes. A
  // board that starts at the nut needs no such help.
  const numberedFrets = fretWires.filter(
    (fret) =>
      SINGLE_MARKERS.has(fret) || DOUBLE_MARKERS.has(fret) || (!nutStart && fret === firstFret),
  );

  const accessibility = ariaLabel
    ? ({ role: "img", "aria-label": ariaLabel } as const)
    : ({ "aria-hidden": true } as const);

  return (
    <svg
      className={`fretboard fretboard-${size}${className ? ` ${className}` : ""}`}
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      data-testid="fretboard"
      {...accessibility}
    >
      <rect
        className="fretboard-wood"
        x={boardLeft}
        y={boardTop - metrics.stringGap / 2}
        width={boardWidth}
        height={boardHeight + metrics.stringGap}
        rx={size === "large" ? 4 : 2}
      />

      {/* The dots in the wood, behind everything else. */}
      {fretWires.map((fret) => {
        const centre = fretX(fret);
        const middle = boardTop + boardHeight / 2;
        if (DOUBLE_MARKERS.has(fret)) {
          return (
            <g key={`marker-${fret}`}>
              <circle
                className="fretboard-inlay"
                cx={centre}
                cy={middle - metrics.stringGap * 0.9}
                r={metrics.dotRadius * 0.62}
              />
              <circle
                className="fretboard-inlay"
                cx={centre}
                cy={middle + metrics.stringGap * 0.9}
                r={metrics.dotRadius * 0.62}
              />
            </g>
          );
        }
        if (!SINGLE_MARKERS.has(fret)) return null;
        return (
          <circle
            key={`marker-${fret}`}
            className="fretboard-inlay"
            cx={centre}
            cy={middle}
            r={metrics.dotRadius * 0.62}
          />
        );
      })}

      {/* Fret wires. The one at the left edge is the nut when we start there. */}
      {fretWires.map((fret) => {
        const x = boardLeft + (fret - firstFret + 1) * metrics.fretWidth;
        return (
          <line
            key={`wire-${fret}`}
            className="fretboard-fret"
            x1={x}
            y1={boardTop}
            x2={x}
            y2={boardTop + boardHeight}
          />
        );
      })}
      <line
        className={nutStart ? "fretboard-nut" : "fretboard-fret"}
        x1={boardLeft}
        y1={boardTop - (nutStart ? metrics.stringGap / 4 : 0)}
        x2={boardLeft}
        y2={boardTop + boardHeight + (nutStart ? metrics.stringGap / 4 : 0)}
      />

      {/* Strings. */}
      {tuning.map((_open, index) => {
        const y = stringY(index);
        return (
          <line
            key={`string-${index}`}
            className="fretboard-string"
            x1={boardLeft - openColumn}
            y1={y}
            x2={boardLeft + boardWidth}
            y2={y}
          />
        );
      })}

      {/* The notes. */}
      {dots.map((dot) => (
        <circle
          key={`dot-${dot.string}-${dot.fret}`}
          className={`fretboard-dot${dot.root ? " fretboard-dot-root" : ""}`}
          cx={fretX(dot.fret)}
          cy={stringY(dot.string)}
          r={dot.fret === 0 ? metrics.dotRadius * 0.85 : metrics.dotRadius}
          data-testid="fret-dot"
          data-fret={dot.fret}
          data-string={dot.string}
          data-pitch-class={dot.pc}
          data-root={dot.root ? "true" : undefined}
          onPointerEnter={describeNote ? () => setHovered(dot) : undefined}
          onPointerLeave={describeNote ? () => setHovered(null) : undefined}
        />
      ))}

      {/* The names, over the dots that are already there. A separate pass so
          every name sits above every dot: drawn with its own circle, a name
          on one string would be half-covered by the dot on the next. */}
      {nameNote &&
        dots.map((dot) => (
          <text
            key={`name-${dot.string}-${dot.fret}`}
            className={`fretboard-dot-name${dot.root ? " fretboard-dot-name-root" : ""}`}
            x={fretX(dot.fret)}
            y={stringY(dot.string)}
            fontSize={metrics.dotRadius * 1.05}
            textAnchor="middle"
            dominantBaseline="central"
            pointerEvents="none"
          >
            {nameNote(dot.pc)}
          </text>
        ))}

      {/* Fret numbers, so a board that starts up the neck says where it is. */}
      {numberedFrets.map((fret) => (
        <text
          key={`number-${fret}`}
          className="fretboard-number"
          x={fretX(fret)}
          y={boardTop + boardHeight + metrics.pad + metrics.fontSize}
          fontSize={metrics.fontSize}
          textAnchor="middle"
        >
          {fret}
        </text>
      ))}

      {/* What the note under the pointer is. Drawn in the board's own
          coordinates rather than as an HTML layer over it: the board is one
          SVG and this way it cannot be clipped by anything the board happens
          to be sitting inside, which on this screen is a drawer that scrolls.
          Clamped to the board, so a note at either end is still readable. */}
      {hovered &&
        describeNote &&
        (() => {
          const text = describeNote(hovered.pc);
          /*
           * Half again the board's own type.
           *
           * It used to be drawn at exactly the size of the names inside the
           * dots, so the answer to "what is this note" was no more prominent
           * than the question — the owner: "the popovers in the fretboard
           * work but look too small". A label is read once and dismissed; it
           * should win the moment it is up.
           */
          const fontSize = metrics.fontSize * 1.5;
          const padX = fontSize * 0.6;
          const boxW = text.length * fontSize * 0.62 + padX * 2;
          const boxH = fontSize * 1.8;
          const cx = fretX(hovered.fret);
          const left = Math.min(Math.max(cx - boxW / 2, 2), width - boxW - 2);
          /*
           * Clear of the dot by a whole dot's width, and above it.
           *
           * The pointer sits on the note and its arrow hangs down and to the
           * right of that, so a label a few units above used to end up under
           * the cursor: "render behind the cursor so some are not legible".
           * Below is the last resort rather than a preference — it is the
           * side the cursor is on — so it is taken only when the note is so
           * near the top of the board that there is genuinely no room.
           */
          const gap = metrics.dotRadius * 2;
          const above = stringY(hovered.string) - metrics.dotRadius - gap - boxH;
          const top = above < 2 ? stringY(hovered.string) + metrics.dotRadius + gap : above;
          return (
            <g className="fretboard-note-label" pointerEvents="none">
              <rect x={left} y={top} width={boxW} height={boxH} rx={boxH / 4} />
              <text
                x={left + boxW / 2}
                y={top + boxH / 2}
                fontSize={fontSize}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {text}
              </text>
            </g>
          );
        })()}
    </svg>
  );
}

/**
 * The lowest fret at which a scale's root falls on the lowest string — the
 * fret a player would call the position. Fret 0 is a real answer: it means
 * the open position, which is where an E minor pentatonic lives.
 */
export function positionForRoot(tuning: Tuning, rootPitchClass: PitchClass): number {
  const open = pitchClass(tuning[0]);
  const target = pitchClass(rootPitchClass);
  return pitchClass(target - open);
}

export type FretboardStripProps = {
  tuning?: Tuning;
  highlight: FretboardHighlight;
  /** How many frets the box spans. Four is a hand. */
  span?: number;
  /**
   * Where the box starts. Left out, it is the fret where the root falls on
   * the lowest string — the position a player would name.
   */
  startFret?: number;
  ariaLabel?: string;
  className?: string;
};

/**
 * One position of the neck rather than the whole twelve frets: a hand's worth
 * of frets starting where the root is. Small enough to sit beside the chord
 * on the jam screen.
 */
export function FretboardStrip({
  tuning = GUITAR_STANDARD_TUNING,
  highlight,
  span = 4,
  startFret,
  ariaLabel,
  className,
}: FretboardStripProps) {
  const start =
    startFret !== undefined
      ? startFret
      : highlight.rootPitchClass === null || highlight.rootPitchClass === undefined
        ? 0
        : positionForRoot(tuning, highlight.rootPitchClass);
  return (
    <Fretboard
      tuning={tuning}
      frets={span}
      startFret={start}
      highlight={highlight}
      size="small"
      ariaLabel={ariaLabel}
      className={className ? `fretboard-strip ${className}` : "fretboard-strip"}
    />
  );
}
