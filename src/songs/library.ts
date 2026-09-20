/**
 * The song library — the list, and where it is kept.
 *
 * Deliberately one small interface with one implementation behind it. W2 is
 * building a SQLite store for history and attempts (`plans/tasks/songs/
 * W2-STORE.md`), and songs belong there in the end: a score is a few hundred
 * kilobytes of JSON and the settings store is one file that is rewritten
 * whole on every save. Until that lands, songs sit beside presets, setlists
 * and jams in `settings.json`, and moving them is replacing `storeLibrary`
 * with a `sqliteLibrary` — this file, and nothing else.
 *
 * So: nothing outside here may call `listSongs` / `saveSongs` directly.
 */
import { listSongs, saveSongs } from "../ipc";
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
   * Base64 because a store is JSON. It is the reason songs have a store file
   * of their own (`ipc.ts`), and one of the reasons W2's SQLite store is
   * where this belongs in the end.
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
 * Songs in `settings.json`, beside the jams.
 *
 * `list` returns `[]` for both "never imported anything" and "deleted them
 * all" — unlike jams, which seed a starter set and so have to tell those two
 * apart. The app ships no songs (`SONGS.md` S0.4), so there is nothing to
 * seed and nothing to distinguish.
 */
export const storeLibrary: SongLibrary = {
  async list() {
    const songs = await listSongs();
    return Array.isArray(songs) ? songs : [];
  },
  async save(records) {
    await saveSongs(records);
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
