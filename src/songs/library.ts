/**
 * The song library — the list, and where it is kept.
 *
 * Deliberately one small interface with one implementation behind it, and
 * this is the move that shape was built for: songs were in `songs.json`
 * beside the settings, they are now rows in W2's practice store
 * (`plans/tasks/songs/W2-STORE.md`), and nothing outside this file changed.
 *
 * A song is three things, and only one of them is the score:
 *
 *   the score          `scores.json`, the `SongScore` of the wave's contract
 *   the player's name  `scores.display_name` — renaming a song in the
 *                      library must not rewrite the title on the page
 *   the file's bytes   `scores.source_b64` — `SONGS.md` A2: alphaTab
 *                      engraves the tab from the source, and a score knows
 *                      every note's tick and fret but not how the page was
 *                      laid out
 *
 * The last two are columns rather than extra keys inside the score, because
 * that column is a `SongScore` and `src-tauri/src/score.rs` is the contract
 * for what one is (migration v2).
 *
 * So: nothing outside here may call the store's song commands directly.
 */
import {
  deleteScore,
  getScore,
  getScoreSource,
  listScores,
  listSongs,
  markSongsMovedToStore,
  saveScore,
  saveSongs,
  songsMovedToStore,
} from "../ipc";
import type { SongScore } from "./types";

/** A song in the library: the score, and what the player calls it. */
export type SongRecord = {
  id: string;
  /** The player's name for it. Starts as the file's title; renameable. */
  name: string;
  /** Milliseconds, for "newest first" and for nothing else. */
  addedAt: number;
  score: SongScore;
  /**
   * The file itself, base64.
   *
   * `SONGS.md` A2: the tab is drawn from the source, so the bytes have to
   * outlive the import — a `SongScore` knows every note's tick and fret but
   * not how the page was engraved, and re-drawing from it would lose the
   * standard notation, the chord names and the layout the player recognises.
   *
   * Base64 rather than bytes because it crosses the IPC boundary and lands in
   * a text column. Empty for a song imported before the bytes were kept, and
   * for one whose row lost them: `TabStage` draws nothing rather than
   * guessing at an engraving.
   */
  sourceBase64: string;
};

/** Store-safe bytes. Chunked: `String.fromCharCode(...bytes)` on a megabyte
 * of Guitar Pro overflows the argument limit and throws. */
export function encodeSource(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function decodeSource(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface SongLibrary {
  list(): Promise<SongRecord[]>;
  save(records: SongRecord[]): Promise<void>;
}

/**
 * Fold anything still in `songs.json` into the practice store, once.
 *
 * Idempotent twice over, the way `db.rs` does the history import: a flag in
 * `songs.json` says whether the move has run, and every write is a
 * `saveScore` on the song's own id, so a flag lost to a crash mid-move
 * cannot produce a second copy of anything.
 *
 * Order matters and is the whole of the safety. Every song is written to the
 * store and read back before `songs.json` is emptied; if any of that throws,
 * the file is left exactly as it was and the flag is not set, so the next
 * launch tries again with nothing lost. The file itself is never deleted —
 * only its songs are taken out.
 */
async function moveFromJsonOnce(): Promise<void> {
  if (await songsMovedToStore()) return;
  const songs = await listSongs();
  if (Array.isArray(songs) && songs.length > 0) {
    for (const record of songs) {
      if (!record?.score?.id) continue;
      await saveScore(record.score, {
        name: record.name,
        sourceBase64: record.sourceBase64,
        importedAt: record.addedAt,
      });
    }
    // Read back before emptying. "Confirmed" has to mean the store answers
    // with them, not that the writes returned.
    const stored = new Set((await listScores()).map((s) => s.id));
    const missing = songs.filter((r) => r?.score?.id && !stored.has(r.score.id));
    if (missing.length > 0) {
      throw new Error(`${missing.length} songs did not reach the practice store`);
    }
    await saveSongs([]);
  }
  // Set even when there was nothing to move: "we looked" is the fact worth
  // recording, and without it every launch would re-read the old file.
  await markSongsMovedToStore();
}

/** One store row, back as the record the mode works in. */
async function toRecord(summary: {
  id: string;
  title: string;
  importedAt: number;
  name?: string;
}): Promise<SongRecord | null> {
  const [score, source] = await Promise.all([
    getScore(summary.id),
    getScoreSource(summary.id),
  ]);
  // A row whose score will not come back is skipped rather than fatal: one
  // unreadable song must not empty the whole library.
  if (!score) return null;
  return {
    id: summary.id,
    name: summary.name ?? score.title ?? summary.title,
    addedAt: summary.importedAt,
    score,
    sourceBase64: source ?? "",
  };
}

/**
 * Songs in the practice store, newest import first.
 *
 * `list` returns `[]` for both "never imported anything" and "deleted them
 * all" — unlike jams, which seed a starter set and so have to tell those two
 * apart. The app ships no songs (`SONGS.md` S0.4), so there is nothing to
 * seed and nothing to distinguish.
 *
 * `save` takes the whole list because that is the interface the mode was
 * built against, and turns it into the rows that changed: a song that is new
 * or renamed is written, a song that is no longer in the list is deleted.
 * The store has no "replace the library" and should not — deleting a song
 * takes every attempt at it with it, and that has to be something the user
 * asked for rather than a side effect of an array being shorter.
 */
export const songLibrary: SongLibrary = {
  async list() {
    await moveFromJsonOnce();
    const summaries = await listScores();
    if (!Array.isArray(summaries)) return [];
    const records = await Promise.all(summaries.map(toRecord));
    return records.filter((r): r is SongRecord => r !== null);
  },

  async save(records) {
    const before = await listScores();
    const known = new Map((Array.isArray(before) ? before : []).map((s) => [s.id, s]));
    for (const record of records) {
      const current = known.get(record.id);
      known.delete(record.id);
      // A song that is already there under the same name and date is the
      // common case — every commit writes the whole list, and rewriting a
      // few hundred kilobytes of score per keystroke of a rename would be
      // the one thing moving out of `songs.json` was meant to stop.
      if (current && (current.name ?? current.title) === record.name && current.importedAt === record.addedAt) {
        continue;
      }
      await saveScore(record.score, {
        name: record.name,
        sourceBase64: record.sourceBase64 || undefined,
        importedAt: record.addedAt,
      });
    }
    for (const id of known.keys()) await deleteScore(id);
  },
};

/** A record for a freshly imported score. */
export function newSongRecord(score: SongScore, source: Uint8Array): SongRecord {
  return {
    id: score.id,
    name: score.title || score.source.fileName,
    addedAt: Date.now(),
    score,
    sourceBase64: encodeSource(source),
  };
}

/**
 * Add a song, replacing the one it duplicates.
 *
 * The id is a hash of the file's bytes and the chosen track, so importing the
 * same file twice means the player did it on purpose — a second copy in the
 * list would only be confusing, and losing the name they gave the first one
 * would be worse. The name survives; everything else is taken again.
 */
export function addSong(records: SongRecord[], incoming: SongRecord): SongRecord[] {
  const existing = records.find((r) => r.id === incoming.id);
  const merged = existing ? { ...incoming, name: existing.name, addedAt: existing.addedAt } : incoming;
  return [merged, ...records.filter((r) => r.id !== incoming.id)];
}

export function renameSong(records: SongRecord[], id: string, name: string): SongRecord[] {
  const trimmed = name.trim();
  if (!trimmed) return records;
  return records.map((r) => (r.id === id ? { ...r, name: trimmed } : r));
}

export function deleteSong(records: SongRecord[], id: string): SongRecord[] {
  return records.filter((r) => r.id !== id);
}
