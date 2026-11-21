/**
 * What `make_exercise` would add, drawn above its proposal (mock 17; leg t2c):
 * the one line (the same words My exercises shows), the notes of one time
 * through on a small neck with the first one marked and named, and the source,
 * "Worked out by the app". What will be graded is said under it, before the
 * press (`ProposalCard`). Plain SVG from the generator's facts; theme tokens
 * only (`ask.css`). Draws once per proposal, never per beat.
 */
import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ExercisePreview } from "../../coach/tools/types";
import { myExerciseLine } from "../../session/myExerciseWords";

const FRET_W = 26;
const STRING_GAP = 12;
const PAD_X = 14;
const PAD_TOP = 8;
const NUMBER_ROW = 14;
const DOT_R = 4.6;

/** The neck the notes sit on: one column per fret from just below the lowest to the highest. */
function NotesNeck({ notes, label }: { notes: ExercisePreview["notes"]; label: string }) {
  const { lo, hi, cells } = useMemo(() => {
    const frets = notes.map((n) => n.fret);
    const low = Math.max(0, Math.min(...frets) - 1);
    const high = Math.max(...frets, low + 3);
    const seen = new Map<string, { string: number; fret: number; first: boolean }>();
    notes.forEach((n, i) => {
      const key = `${n.string}:${n.fret}`;
      if (!seen.has(key)) seen.set(key, { string: n.string, fret: n.fret, first: i === 0 });
    });
    return { lo: low, hi: high, cells: [...seen.values()] };
  }, [notes]);
  const columns = hi - lo + 1;
  const width = PAD_X * 2 + columns * FRET_W;
  const height = PAD_TOP + STRING_GAP * 5 + NUMBER_ROW + 6;
  const y = (string: number) => PAD_TOP + (string - 1) * STRING_GAP;
  const x = (fret: number) => PAD_X + (fret - lo) * FRET_W + FRET_W / 2;
  return (
    <svg className="ask-make-neck" viewBox={`0 0 ${width} ${height}`} width="100%" role="img" aria-label={label} data-testid="ask-make-neck">
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line key={`s${s}`} className="ask-make-string" x1={PAD_X} x2={width - PAD_X} y1={y(s)} y2={y(s)} />
      ))}
      {Array.from({ length: columns + 1 }, (_, i) => (
        <line key={`f${i}`} className="ask-make-fret" x1={PAD_X + i * FRET_W} x2={PAD_X + i * FRET_W} y1={y(1)} y2={y(6)} />
      ))}
      {Array.from({ length: columns }, (_, i) => lo + i)
        .filter((f) => f > 0)
        .map((f) => (
          <text key={`n${f}`} className="ask-make-fretnum" x={x(f)} y={y(6) + NUMBER_ROW} textAnchor="middle">
            {f}
          </text>
        ))}
      {cells.map((c) => (
        <circle
          key={`${c.string}:${c.fret}`}
          className={c.first ? "ask-make-dot ask-make-dot-first" : "ask-make-dot"}
          cx={c.fret === 0 ? PAD_X - DOT_R : x(c.fret)}
          cy={y(c.string)}
          r={c.first ? DOT_R + 1.4 : DOT_R}
          data-first={c.first ? "true" : undefined}
        />
      ))}
    </svg>
  );
}

export const MakeExercisePreview = memo(function MakeExercisePreview({ preview }: { preview: ExercisePreview }) {
  const { t } = useTranslation();
  const { summary, notes } = preview;
  const first = summary.firstNote;
  const frets = notes.map((n) => n.fret);
  return (
    <div className="ask-make" data-testid="ask-make-preview">
      <p className="ask-make-line" data-testid="ask-make-line">
        {myExerciseLine(t, summary)}
      </p>
      <NotesNeck notes={notes} label={t("coachTools.make.notesLabel", { n: notes.length, from: Math.min(...frets), to: Math.max(...frets) })} />
      <p className="ask-make-first" data-testid="ask-make-first">
        {first.name
          ? t("coachTools.make.startsOn", { note: first.name, string: first.string, fret: first.fret })
          : t("coachTools.make.startsOnString", { string: first.string, fret: first.fret })}
      </p>
      <p className="coach-block-source ask-tool-source" data-source="app">
        <span>{t("coachTools.make.source")}</span>
      </p>
    </div>
  );
});
