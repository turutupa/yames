/**
 * The bars you just played, with what happened written on them.
 *
 * Drawn here rather than through alphaTab, deliberately. The stage's tab is
 * an engraving of the whole song laid out to a measured width, and it takes
 * the better part of a second to produce; an excerpt inside a review is four
 * bars in a box a phone's width across, and it has to carry a mark, a colour
 * and sometimes a note name under every single attack. Asking the engraver
 * for that would mean a second alphaTab instance, a second copy of the music
 * font in the review, and a lazy chunk in a panel that is supposed to appear
 * the instant you stop. So this is strings and fret numbers, from the score
 * the importer already produced.
 *
 * It is also the `tabExcerpt` slot's real component (`slots.tsx`): the coach
 * points at bars, and this is what it points with, in the card and in the
 * review both.
 *
 * ## What is drawn
 *
 * One column per attack, in the order they were played, grouped by bar. Under
 * each column, the mark that says how it landed — and every mark is a SHAPE
 * as well as a colour (`marks.ts`), because a colour nobody can distinguish
 * is not a signal. Extras sit between the notes, at the beat they actually
 * fell on. An accent that was written and not heard gets a quiet mark of its
 * own; it is reported and never scored.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  MARK_GLYPH,
  MARK_TOKEN,
  accentMissed,
  markFor,
  noteNameOf,
  pitchMarkFor,
  type TimingMark,
} from "./marks";
import { barAtBeatInRange, printedBarNumber } from "../../../songs/position";
import type { BarRange } from "../../../songs/schedule";
import type {
  ExtraOnset,
  NoteVerdict,
  OnsetResult,
  ScoreSchedule,
  SongNote,
  SongScore,
} from "../../../songs/types";
import type { TimingBands } from "../../../ipc";

export type ReviewTabProps = {
  score: SongScore;
  /** The bars the schedule covers — what `ExpectedOnset.beat` counts from. */
  scheduleRange: BarRange;
  schedule: ScoreSchedule;
  /** The bars to draw. Absent draws the whole schedule's range. */
  showRange?: BarRange;
  results: readonly OnsetResult[];
  extras: readonly ExtraOnset[];
  bands: TimingBands | null;
  /** Which time round the loop to show. */
  pass: number;
  /** What the ear said about the notes, when a take was listened to. */
  pitch?: readonly NoteVerdict[];
  /**
   * W21 — where the tape is, in beats of the schedule, while a recording of
   * this pass plays back beside it.
   *
   * The column at or just before it is marked `data-now` and lifts, so the
   * picture, the tape and the page all point at the same note. `null` — the
   * normal case, and every case before the camera existed — marks nothing and
   * this component draws exactly what it always drew.
   */
  playheadBeat?: number | null;
  className?: string;
};

/** One thing to draw in a bar: an attack of the score, or a note nobody asked for. */
type Column =
  | {
      kind: "note";
      beat: number;
      bar: number;
      notes: SongNote[];
      mark: TimingMark;
      accent: boolean;
      heard: string | null;
    }
  | { kind: "extra"; beat: number; bar: number };

export function ReviewTab({
  score,
  scheduleRange,
  schedule,
  showRange,
  results,
  extras,
  bands,
  pass,
  pitch,
  playheadBeat = null,
  className,
}: ReviewTabProps) {
  const { t } = useTranslation();
  const strings = Math.max(1, score.tuning.length);

  const columns = useMemo(() => {
    const notesById = new Map<number, SongNote>();
    for (const note of score.notes) notesById.set(note.id, note);

    const resultFor = new Map<number, OnsetResult>();
    for (const r of results) if (r.pass === pass) resultFor.set(r.id, r);

    const pitchByNote = new Map<number, NoteVerdict>();
    for (const v of pitch ?? []) if (!pitchByNote.has(v.noteId)) pitchByNote.set(v.noteId, v);

    const first = showRange?.startBar ?? scheduleRange.startBar;
    const last = showRange?.endBar ?? scheduleRange.endBar;

    const out: Column[] = [];
    for (const onset of schedule.onsets) {
      const bar = barAtBeatInRange(score, scheduleRange, onset.beat);
      if (bar < first || bar > last) continue;
      const result = resultFor.get(onset.id);
      // No verdict for this pass means the pass never reached this onset —
      // the player stopped part way round. Nothing is claimed about it.
      if (!result) continue;
      const notes = onset.noteIds
        .map((id) => notesById.get(id))
        .filter((n): n is SongNote => n !== undefined);
      out.push({
        kind: "note",
        beat: onset.beat,
        bar,
        notes,
        mark: markFor(result, bands),
        accent: onset.accent && accentMissed(result),
        heard: heardName(notes, pitchByNote),
      });
    }

    for (const extra of extras) {
      if (extra.pass !== pass) continue;
      const bar = barAtBeatInRange(score, scheduleRange, extra.beat);
      if (bar < first || bar > last) continue;
      out.push({ kind: "extra", beat: extra.beat, bar });
    }

    // Extras sit BETWEEN the notes they fell between, which is only true if
    // everything is in one order — and a stable sort keeps a written note
    // ahead of an extra that landed on the same beat, where the written note
    // is the one the player meant.
    out.sort((a, b) => a.beat - b.beat);
    return out;
  }, [score, schedule, scheduleRange, showRange, results, extras, bands, pass, pitch]);

  const bars = useMemo(() => {
    const byBar = new Map<number, Column[]>();
    for (const column of columns) {
      const at = byBar.get(column.bar);
      if (at) at.push(column);
      else byBar.set(column.bar, [column]);
    }
    return [...byBar.entries()].sort((a, b) => a[0] - b[0]);
  }, [columns]);

  /**
   * W21 — the beat of the column the tape is currently over.
   *
   * The LAST column at or before the playhead, so a note stays lit until the
   * next one arrives rather than flickering on for the frame it is exactly
   * under. Computed once for the excerpt instead of per column, because the
   * comparison is against a number that changes sixty times a second.
   */
  const nowBeat = useMemo(() => {
    if (playheadBeat === null) return null;
    let found: number | null = null;
    for (const column of columns) {
      if (column.beat <= playheadBeat + 1e-6) found = column.beat;
      else break;
    }
    return found;
  }, [columns, playheadBeat]);

  if (bars.length === 0) {
    return <p className="songs-review-tab-empty">{t("songs.review.tab.nothing")}</p>;
  }

  return (
    <div
      className={className ? `songs-review-tab ${className}` : "songs-review-tab"}
      data-testid="songs-review-tab"
    >
      {bars.map(([bar, inBar]) => (
        <div className="songs-review-bar" key={bar}>
          <span className="songs-review-barno">{printedBarNumber(score, bar)}</span>
          <div className="songs-review-cols">
            {inBar.map((column, i) =>
              column.kind === "extra" ? (
                <ExtraColumn key={`x${String(i)}`} strings={strings} label={t("songs.review.mark.extra")} />
              ) : (
                <NoteColumn
                  key={`n${String(i)}`}
                  strings={strings}
                  column={column}
                  now={nowBeat !== null && column.beat === nowBeat}
                  label={t(`songs.review.mark.${column.mark}`)}
                  accentLabel={t("songs.review.mark.accentQuiet")}
                />
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The note that was actually heard, when it was not the one written. */
function heardName(notes: SongNote[], pitchByNote: Map<number, NoteVerdict>): string | null {
  // A chord is not assessed at all (`SONGS.md` S0.5), so only a single-note
  // attack can have a name under it.
  if (notes.length !== 1) return null;
  const mark = pitchMarkFor(pitchByNote.get(notes[0].id));
  if (!mark) return null;
  if (mark.kind === "wrong" || mark.kind === "octave") return noteNameOf(mark.heardMidi);
  return null;
}

function NoteColumn({
  strings,
  column,
  now = false,
  label,
  accentLabel,
}: {
  strings: number;
  column: Extract<Column, { kind: "note" }>;
  /** W21 — the tape is over this note right now. */
  now?: boolean;
  label: string;
  accentLabel: string;
}) {
  const frets = new Map<number, SongNote>();
  for (const note of column.notes) frets.set(note.string, note);

  return (
    <div className="songs-review-col" data-mark={column.mark} data-now={now ? "" : undefined}>
      <div className="songs-review-strings">
        {Array.from({ length: strings }, (_, i) => {
          // String 1 is the highest and sits on top, the way it is printed.
          const note = frets.get(i + 1);
          return (
            <span className="songs-review-cell" key={i}>
              {note ? String(note.fret) : ""}
            </span>
          );
        })}
      </div>
      <span
        className="songs-review-mark"
        style={{ color: MARK_TOKEN[column.mark] }}
        title={label}
        aria-label={label}
      >
        {MARK_GLYPH[column.mark]}
      </span>
      {column.accent && (
        <span className="songs-review-accent" title={accentLabel} aria-label={accentLabel}>
          &gt;
        </span>
      )}
      {column.heard && <span className="songs-review-heard">{column.heard}</span>}
    </div>
  );
}

function ExtraColumn({ strings, label }: { strings: number; label: string }) {
  return (
    <div className="songs-review-col songs-review-col-extra" data-mark="extra">
      <div className="songs-review-strings">
        {Array.from({ length: strings }, (_, i) => (
          <span className="songs-review-cell" key={i} />
        ))}
      </div>
      <span className="songs-review-mark" title={label} aria-label={label}>
        +
      </span>
    </div>
  );
}

export default ReviewTab;
