import type { JamLane, JamLevel, JamPattern } from "../../jam/types";

/**
 * A groove, drawn from its own table.
 *
 * Three rows of dots, one column per tick: the kick underneath, the snare in
 * the middle, and whichever cymbal the groove is played on across the top.
 * Nothing here is hand-placed — the picture IS the pattern, so a groove whose
 * table is edited cannot end up with a glyph that shows the old one, and eight
 * cards can be told apart at a glance without reading their names.
 *
 * The rows are in drum-notation order, high to low, which is the order anyone
 * who has seen a drum chart already reads.
 *
 * **Three rows, and the percussion is not one of them.** Fifty-eight grooves
 * carry a percussionist (fifth pass) and none of it is drawn here, on purpose:
 * a card is a picture of the DRUMS, three dots high, read at a glance in a
 * wall of a hundred and fifteen. A shaker's sixteen sixteenths across a fourth
 * row would be the loudest thing on every Latin card and would say the least —
 * every one of them has one. What the percussion is doing is on the band row,
 * where there is a line of prose to say it in.
 */
const ROWS: readonly { lane: JamLane; alt?: JamLane }[] = [
  // The cymbal line: hats, unless the groove is a ride groove.
  { lane: "hat", alt: "ride" },
  { lane: "snare" },
  { lane: "kick" },
];

/**
 * Dot radius by level: a peak is the biggest, an accent the one under it, a
 * ghost barely there. A peak only ever appears in a fill, so on a card it is
 * the stroke that says "and here the drummer let go".
 */
const RADIUS: Record<Exclude<JamLevel, 0>, number> = { 1: 1.5, 2: 2.2, 3: 0.9, 4: 2.8 };

const COLUMN = 5;
const ROW = 6;

/**
 * The least a thing has to be to be drawn: a meter and a bar. Structural, so
 * a groove you drew in the editor gets the same picture as a preset — it is
 * the same table, and a glyph that only worked on the eight shipped grooves
 * would leave the ninth card blank.
 */
export type GlyphGroove = {
  beatsPerBar: number;
  ticksPerBeat: number;
  bar: JamPattern;
};

export function GrooveGlyph({ groove }: { groove: GlyphGroove }) {
  const ticks = groove.beatsPerBar * groove.ticksPerBeat;
  const width = ticks * COLUMN;
  const height = ROWS.length * ROW;

  return (
    <svg
      className="jam-glyph"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      // The name below the glyph is the card's label; this is the picture.
      focusable="false"
    >
      {ROWS.map((row, r) => {
        // A swing ride has nothing on the hat worth drawing on the top line,
        // so the top line becomes the ride. Whichever lane is busier wins.
        const primary = row.lane;
        const alt = row.alt;
        const count = (lane: JamLane) => groove.bar[lane].filter((l) => l !== 0).length;
        const lane = alt && count(alt) > count(primary) ? alt : primary;
        const y = r * ROW + ROW / 2;
        return groove.bar[lane].map((level, i) => {
          const x = i * COLUMN + COLUMN / 2;
          if (level === 0) {
            // The empty ticks are drawn too, faintly: a rest is a column of
            // the bar, not a gap in it, and without them a shuffle and a
            // straight groove have the same picture at different widths.
            return (
              <circle
                key={`${lane}-${i}`}
                className="jam-glyph-rest"
                cx={x}
                cy={y}
                r={0.5}
              />
            );
          }
          return (
            <circle
              key={`${lane}-${i}`}
              className="jam-glyph-hit"
              data-level={level}
              cx={x}
              cy={y}
              r={RADIUS[level]}
            />
          );
        });
      })}
    </svg>
  );
}
