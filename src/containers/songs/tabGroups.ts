/**
 * Finding one note of the engraving, from one onset of the schedule.
 *
 * The review draws its own excerpt and can put a mark wherever it likes. The
 * STAGE cannot: the tab on the stage is alphaTab's engraving, laid out by a
 * renderer that knows nothing about us, and the only handle it offers is the
 * group it wraps every beat in — `<g class="b{beat.id}">`. That is what
 * `enableElementHighlighting` uses for its own highlight, and it is the
 * surface W12 could not paint because nothing mapped an onset id onto it.
 *
 * This file is that map, and it is pure so it can be tested without a
 * browser, an engraving, or alphaTab itself: everything it needs off
 * alphaTab's model is named structurally below.
 *
 * ## Two things it has to get right
 *
 * **The unroll.** `beat.playbackStart` is relative to its own BAR, and a
 * played bar knows which printed bar it is (`SongScore.bars[].printedBar`).
 * So the tick of a beat, on the played timeline, is
 * `playedBar.startTick + beat.playbackStart` — the same one line the importer
 * uses, and for the same reason (`W4-FINDINGS.md` §2). Reading
 * `absolutePlaybackStart` instead would put every note of a repeated song in
 * the wrong bar.
 *
 * **A repeat is drawn once.** Two played bars can share one printed bar, so
 * two played ticks can land on the same group. That is not a bug to fix: the
 * page has one bar on it and a note lit on the second time round is lit where
 * the player is looking. The first tick to claim a group keeps it, so the map
 * is stable whichever way the pass went.
 */
import type { ScoreSchedule, SongScore } from "../../songs/types";

/**
 * As much of alphaTab's `Beat` as this needs. Structural on purpose — a type
 * import from `@coderline/alphatab` here would put the whole renderer in the
 * main bundle the moment a test or a sibling imported this file.
 */
export type EngravedBeat = {
  /** alphaTab's own id, and the group class is `b` and this. */
  id: number;
  /** Ticks from the start of the beat's own printed bar. */
  playbackStart: number;
  isRest: boolean;
  notes: { length: number };
};

export type EngravedVoice = { beats: readonly EngravedBeat[] };
export type EngravedBar = { voices: readonly EngravedVoice[] };

/** The class alphaTab wraps a beat's glyphs in. `BeatContainerGlyph.getGroupId`. */
export function beatGroupClass(beatId: number): string {
  return `b${beatId}`;
}

/**
 * Every played tick that has something engraved on it, and the group it is
 * drawn in.
 *
 * Built once per score and per engraving rather than per beat of the pass:
 * walking a two-hundred-bar staff sixty times a minute is the sort of thing
 * that turns a feature into a freeze.
 *
 * A voice later in the bar never takes a tick from an earlier one, so a chord
 * written across two voices lights the voice the player is reading.
 */
export function groupClassByTick(
  score: SongScore,
  bars: readonly (EngravedBar | undefined)[],
): Map<number, string> {
  const byTick = new Map<number, string>();
  for (const bar of score.bars) {
    const printed = bars[bar.printedBar];
    if (!printed) continue;
    for (const voice of printed.voices) {
      for (const beat of voice.beats) {
        if (beat.isRest || beat.notes.length === 0) continue;
        const tick = bar.startTick + beat.playbackStart;
        if (!byTick.has(tick)) byTick.set(tick, beatGroupClass(beat.id));
      }
    }
  }
  return byTick;
}

/**
 * The played tick each expected onset falls on.
 *
 * An onset is the notes that share a tick (`BRIEF.md`), so the first note it
 * names is enough — they all have the same one. An onset naming a note the
 * score does not have is skipped rather than guessed at.
 */
export function tickByOnset(score: SongScore, schedule: ScoreSchedule): Map<number, number> {
  const out = new Map<number, number>();
  for (const onset of schedule.onsets) {
    const noteId = onset.noteIds[0];
    if (noteId === undefined) continue;
    const note = score.notes[noteId];
    if (!note) continue;
    out.set(onset.id, note.tick);
  }
  return out;
}

/**
 * The group each lit onset should be painted in.
 *
 * Returned as a plain list rather than applied here, so the DOM half stays in
 * `TabStage` and this half stays testable. An onset with no engraved beat —
 * a schedule built against a different track, a note the engraver dropped —
 * simply is not in the list, which is the same rule the rest of this wave
 * keeps: a reference that does not resolve draws nothing.
 */
export function lightTargets<Mark>(
  lights: ReadonlyMap<number, Mark>,
  ticks: ReadonlyMap<number, number>,
  classes: ReadonlyMap<number, string>,
): { onsetId: number; className: string; mark: Mark }[] {
  const out: { onsetId: number; className: string; mark: Mark }[] = [];
  for (const [onsetId, mark] of lights) {
    const tick = ticks.get(onsetId);
    if (tick === undefined) continue;
    const className = classes.get(tick);
    if (className === undefined) continue;
    out.push({ onsetId, className, mark });
  }
  return out;
}
