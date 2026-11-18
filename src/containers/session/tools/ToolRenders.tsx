/**
 * The small picture on each Tools card: the tool itself, drawn in SVG and CSS.
 *
 * The owner, on the old cards: "these massive tall cards look awful too — at
 * least have some cool render for each one". Each one rests in a still frame
 * and moves only while its card is hovered or focused (`tools-page.css`), and
 * never under reduced motion. Where a number on a render is the player's own
 * (the metronome's tempo and meter, the drill's ramp), it is the real one;
 * everything else is illustration, drawn as shapes rather than as names, so
 * nothing on it can be read as a record of what they did.
 *
 * Colours are the theme's (`--accent`, `--accent-2`, the text levels), which is
 * why the SVGs paint with `currentColor` and `style` rather than attributes: a
 * presentation attribute does not take `var()`.
 */
import { meterTotal } from "../../../utils/meter";

/** Where a group of beats opens: the beats the click accents. */
function accents(groups: number[]): Set<number> {
  const out = new Set<number>();
  let at = 0;
  for (const g of groups) {
    out.add(at);
    at += g;
  }
  return out;
}

export function MetronomeRender({
  bpm,
  groups,
  meter,
}: {
  bpm: number;
  groups: number[];
  /** "4/4", or nothing (free mode, where the bar has no meter to name). */
  meter: string | null;
}) {
  // Two to eight beats: enough to read as a bar, never so many the row turns to dust.
  const beats = Math.min(8, Math.max(2, meterTotal(groups) || 4));
  const acc = accents(groups.length ? groups : [beats]);
  return (
    <div className="tr-metro">
      <div className="tr-read">
        <b>{Math.round(bpm)}</b>
        <span>BPM</span>
        {meter && <em>{meter}</em>}
      </div>
      <svg className="tr-pend" viewBox="0 0 66 84">
        <path
          d="M22 6h22l14 72H8z"
          style={{ fill: "color-mix(in srgb, currentColor 10%, transparent)" }}
          stroke="currentColor"
          strokeOpacity=".55"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M12 60h42" stroke="currentColor" strokeOpacity=".3" strokeWidth="1.2" />
        <g className="tr-rod">
          <line x1="33" y1="72" x2="33" y2="10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <rect x="27" y="26" width="12" height="9" rx="2" fill="currentColor" />
        </g>
        <circle cx="33" cy="72" r="3" fill="currentColor" />
      </svg>
      <div className="tr-beats" style={{ ["--n" as string]: beats }}>
        {Array.from({ length: beats }, (_, i) => (
          <i
            key={i}
            data-acc={acc.has(i) ? "" : undefined}
            data-on={i === 0 ? "" : undefined}
            style={{ animationDelay: `${(i * 2) / beats}s` }}
          />
        ))}
      </div>
    </div>
  );
}

const SET_ROWS = [
  { w: 64, bpm: 80 },
  { w: 48, bpm: 96 },
  { w: 76, bpm: 110 },
  { w: 56, bpm: 126 },
];

export function SetlistRender() {
  return (
    <div className="tr-set">
      {SET_ROWS.map((row, i) => (
        <div
          key={i}
          className="tr-row"
          data-done={i === 0 ? "" : undefined}
          data-now={i === 1 ? "" : undefined}
        >
          {i === 1 ? (
            <svg viewBox="0 0 12 12">
              <path d="M2 1.5 10.5 6 2 10.5z" fill="currentColor" />
            </svg>
          ) : (
            <span>{i + 1}</span>
          )}
          <span className="tr-bar" style={{ width: `${row.w}%` }} />
          <span className="tr-t">
            {row.bpm}
            <small>BPM</small>
          </span>
          {i === 1 && <i className="tr-prog" />}
        </div>
      ))}
    </div>
  );
}

/** The staircase: eight steps from the bottom-left to the target line. */
const STAIRS = "M0 108 V96 H37.5 V83 H75 V70 H112.5 V57 H150 V45 H187.5 V32 H225 V19 H262.5 V6 H300";
const DONE = "M0 96 H37.5 V83 H75 V70 H112.5 V57 H150 V45 H187.5";

export function DrillRender({
  startBpm,
  targetBpm,
  targetLabel,
}: {
  startBpm: number;
  targetBpm: number;
  targetLabel: string;
}) {
  return (
    <div className="tr-drill">
      <span className="tr-ax" data-top="">
        {Math.round(targetBpm)}
      </span>
      <span className="tr-ax">{Math.round(startBpm)}</span>
      <span className="tr-target">{targetLabel}</span>
      <svg viewBox="0 0 300 110" preserveAspectRatio="none">
        <defs>
          <linearGradient id="tools-drill-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity=".32" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line
          x1="0"
          y1="6"
          x2="300"
          y2="6"
          style={{ stroke: "var(--accent-2)" }}
          strokeOpacity=".7"
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          y1="108"
          x2="300"
          y2="108"
          style={{ stroke: "var(--text-primary)" }}
          strokeOpacity=".14"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={STAIRS}
          fill="none"
          style={{ stroke: "var(--text-primary)" }}
          strokeOpacity=".22"
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <g className="tr-done">
          <path d={`${DONE} V108 H0 Z`} fill="url(#tools-drill-fill)" />
          <path
            d={DONE}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      <i className="tr-dot" />
    </div>
  );
}

/** A rock beat over four bars of eighths. */
const LANES: { id: string; label: string; hit: (i: number) => boolean }[] = [
  { id: "hat", label: "HAT", hit: () => true },
  { id: "snare", label: "SN", hit: (i) => i % 8 === 2 || i % 8 === 6 },
  { id: "kick", label: "KICK", hit: (i) => i % 8 === 0 || i % 8 === 5 },
];

export function JamRender() {
  return (
    <div className="tr-jam">
      <div className="tr-chords">
        {["A7", "D7", "A7", "E7"].map((c, i) => (
          <span key={i} data-now={i === 1 ? "" : undefined}>
            {c}
          </span>
        ))}
      </div>
      <div className="tr-drums">
        {LANES.map((lane) => (
          <div key={lane.id} className="tr-lane" data-lane={lane.id}>
            <b>{lane.label}</b>
            {Array.from({ length: 32 }, (_, i) => (
              <i key={i} data-hit={lane.hit(i) ? "" : undefined} />
            ))}
          </div>
        ))}
      </div>
      <i className="tr-ph" />
    </div>
  );
}

/** Two bars of a picked arpeggio: [string, 0 = high e; fret]. */
const RIFF: [number, number][] = [
  [5, 0], [3, 2], [2, 2], [1, 0], [2, 2], [3, 2], [4, 3], [2, 0],
  [1, 1], [2, 0], [4, 2], [2, 2], [1, 3], [0, 0], [1, 3], [2, 2],
];

export function SongsRender() {
  // Drawn twice across a strip twice the field's width, so the roll loops.
  const per = 100 / (RIFF.length * 2);
  return (
    <div className="tr-tab">
      <div className="tr-names">
        {["e", "B", "G", "D", "A", "E"].map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <div className="tr-field">
        <div className="tr-lines">
          {Array.from({ length: 6 }, (_, i) => (
            <i key={i} />
          ))}
        </div>
        <div className="tr-roll">
          {[0, 1].flatMap((copy) =>
            RIFF.flatMap(([s, f], i) => {
              const idx = copy * RIFF.length + i;
              const out = [
                <span
                  key={`n${idx}`}
                  className="tr-note"
                  style={{ left: `${idx * per + per / 2}%`, top: `${((s + 0.5) * 100) / 6}%` }}
                >
                  {f}
                </span>,
              ];
              if (i % 8 === 0) out.push(<i key={`b${idx}`} className="tr-barline" style={{ left: `${idx * per}%` }} />);
              return out;
            }),
          )}
        </div>
        <div className="tr-played" />
        <i className="tr-ph" />
      </div>
    </div>
  );
}
