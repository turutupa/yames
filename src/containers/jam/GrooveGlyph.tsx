import type { Groove } from "../../jam/grooves";
import type { JamLane, JamLevel } from "../../jam/types";

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
 */
const ROWS: readonly { lane: JamLane; alt?: JamLane }[] = [
  // The cymbal line: hats, unless the groove is a ride groove.
  { lane: "hat", alt: "ride" },
  { lane: "snare" },
  { lane: "kick" },
];

/** Dot radius by level: an accent is the big one, a ghost barely there. */
const RADIUS: Record<Exclude<JamLevel, 0>, number> = { 1: 1.5, 2: 2.2, 3: 0.9 };

const COLUMN = 5;
const ROW = 6;

export function GrooveGlyph({ groove }: { groove: Groove }) {
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
