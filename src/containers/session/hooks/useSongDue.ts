/**
 * The Songs passage due longest ago, for Today's line (c5a2, judgement call 18).
 *
 * Read once when Today mounts, from the store only: `listDue()` (the passages
 * and their days), then, only when one is due, `listScores()` (which songs are
 * still in the library, and the name the player gave each) and `getScore()` for
 * the one chosen (its printed bar numbers). Read-only: nothing is written,
 * moved or cleared here; a build without the commands answers nothing and the
 * line says nothing about Songs.
 */
import { useEffect, useState } from "react";
import { getScore, listDue, listScores } from "../../../ipc";
import { duePassagesOn, printedPassage } from "../../../coach/songDue";
import type { DuePassage } from "../../../coach/songDue";
import { dayOf } from "../../../songs/due";

/** The passage, or null: none due today or earlier, every due song deleted, or no store. */
export async function readSongDue(today: number = dayOf()): Promise<DuePassage | null> {
  const rows = await listDue().catch(() => null);
  if (!Array.isArray(rows) || !rows.some((row) => row.dueDay <= today)) return null;
  const library = await listScores().catch(() => null);
  if (!Array.isArray(library)) return null;
  const byId = new Map(library.map((summary) => [summary.id, summary]));
  for (const row of duePassagesOn(rows, new Set(byId.keys()), today)) {
    const score = await getScore(row.scoreId).catch(() => null);
    const summary = byId.get(row.scoreId);
    // A song since deleted (or one whose score will not come back) is skipped.
    if (!score || !summary) continue;
    // A passage that runs past the score as it is now (the song re-imported
    // shorter): `printedBarNumber` would make up a bar number for it. Skipped.
    if (Math.max(row.rangeStartBar, row.rangeEndBar) >= score.bars.length) continue;
    return { song: summary.name ?? score.title ?? summary.title, ...printedPassage(score, row.rangeStartBar, row.rangeEndBar) };
  }
  return null;
}

export function useSongDue(): DuePassage | null {
  const [due, setDue] = useState<DuePassage | null>(null);
  useEffect(() => {
    let alive = true;
    void readSongDue()
      .then((found) => {
        if (alive) setDue(found);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return due;
}
