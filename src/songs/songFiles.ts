/**
 * The library lists SONGS. A song is a file.
 *
 * `import.ts`'s `songId` hashes the file's bytes **and** the track index, so
 * the guitar part and the bass part of one file are two rows in the store —
 * two scores, two sets of attempts, two sets of takes, two sets of promises.
 * That is right and it stays (W29): a take belongs to the part it was played
 * on. What was wrong is that it reached the sidebar. The owner imported one
 * tab on his Mac and got two rows: *"on the left side it's for songs, and then
 * when in a song, in the stage area i should be able to select the
 * instrument"*.
 *
 * So this module is the one place that knows a file can wear more than one
 * record. Nothing here writes, nothing here deletes, and no record is changed
 * by being grouped: it takes the list the library gives back and says which
 * rows are the same piece of music.
 *
 * ## What identifies a file
 *
 * The bytes — but without re-reading them. `songId` ends with two steps that
 * mix the track index into a hash of the bytes and nothing else:
 *
 *     a = imul(a_file ^ trackIndex, 0x01000193)
 *     b = imul(b_file ^ trackIndex, 0x811c9dc5)
 *
 * Both multipliers are odd, so both are invertible modulo 2^32, and the track
 * index is on the record already. The file's own hash therefore comes back out
 * of the id exactly, with no bytes read, no base64 decoded and nothing new
 * stored — which matters because the alternative was hashing every megabyte of
 * Guitar Pro in the library on every launch, and because a key kept in a
 * column would have had to be back-filled for songs imported before today.
 *
 * `songFiles.test.ts` pins the two inverses against `songId` itself, so the
 * day somebody changes the hash the test says so rather than the library
 * quietly splitting back into one row per part.
 */
import type { SongRecord } from "./library";

/** `0x01000193 * 0x359c449b ≡ 1 (mod 2^32)`. */
const UNMIX_A = 0x359c449b;
/** `0x811c9dc5 * 0xbd90d90d ≡ 1 (mod 2^32)`. */
const UNMIX_B = 0xbd90d90d;

const hex32 = (n: number) => (n >>> 0).toString(16).padStart(8, "0");

/**
 * Which file a song's record came out of.
 *
 * Every part of one file answers with the same string; two different files
 * answer with different ones as reliably as `songId` itself does, because it
 * is `songId`'s own hash of the bytes.
 *
 * An id that is not the sixteen hex characters `songId` makes is returned
 * unchanged, so a row from somewhere unexpected becomes a file of its own
 * rather than joining somebody else's.
 */
export function fileKeyOf(id: string, trackIndex: number): string {
  if (!/^[0-9a-f]{16}$/.test(id)) return id;
  const a = parseInt(id.slice(0, 8), 16);
  const b = parseInt(id.slice(8, 16), 16);
  const track = trackIndex | 0;
  return hex32((Math.imul(a, UNMIX_A) >>> 0) ^ track) + hex32((Math.imul(b, UNMIX_B) >>> 0) ^ track);
}

/** The same question asked of a record. */
export function fileKeyOfRecord(record: SongRecord): string {
  return fileKeyOf(record.id, record.score.source.trackIndex);
}

/**
 * The name W29 would have given this record, taken back off.
 *
 * `switchTrack` used to file the second part of a file as `<song> · <part>`,
 * because two rows under one name would have been worse than two rows under
 * two. With one row per file there is nothing to tell apart, and the part is
 * a fact of the record rather than of its name.
 *
 * Only the exact suffix W29 appends — a space, a middle dot, a space and this
 * record's OWN track name — is removed, so a player who really did call
 * something "Étude · Lead" keeps it.
 */
export function nameWithoutPart(record: SongRecord): string {
  const suffix = ` · ${record.score.source.trackName}`;
  if (!record.score.source.trackName || !record.name.endsWith(suffix)) return record.name;
  const base = record.name.slice(0, -suffix.length).trim();
  // "· Lead" on its own leaves nothing to call the song. Keep what is there.
  return base || record.name;
}

/**
 * The migration, and it is the whole of it.
 *
 * Idempotent because it is a shape test rather than a flag: a name with no
 * part on the end comes back unchanged, so running it twice does what running
 * it once did. Nothing is deleted, nothing is merged, no id moves — the two
 * records of a file stay two records, with their attempts, their takes and
 * their promises exactly where they were. Only what the library CALLS them
 * changes, and only where W29 had written the part into the name.
 *
 * The same array is returned when there is nothing to do, so a caller can ask
 * "did anything change" by identity and write only when it did.
 */
export function migrateSongNames(records: SongRecord[]): SongRecord[] {
  let changed = false;
  const next = records.map((record) => {
    const name = nameWithoutPart(record);
    if (name === record.name) return record;
    changed = true;
    return { ...record, name };
  });
  return changed ? next : records;
}

/** One row of the library: a file, and every part of it that has a record. */
export type LibrarySong = {
  /** `fileKeyOf` — stable, and the same for every part. */
  key: string;
  /** What the row says. The name of the part that arrived first. */
  name: string;
  /** Under it, small, and only when the file has one. */
  artist: string;
  /** Every part, in the order the library listed them. */
  parts: SongRecord[];
  /**
   * The part opening the row opens: the one most recently open.
   *
   * `library.ts` fills `openedAt` from the store's `last_opened_at`, falling
   * back to the import date, so "the part I had open last time, else the part
   * I chose at import" needs nothing written down anywhere — the store has
   * been counting since migration four.
   */
  openId: string;
  /** When the file arrived — the earliest of its parts. */
  addedAt: number;
};

/**
 * The library, one entry per file, in the order the records came in.
 *
 * That order is the store's: most recently opened first, falling back to when
 * the file arrived (`library.ts`). A file takes the place of whichever of its
 * parts was listed highest, so opening the bass part and coming back tomorrow
 * finds the song where it expects to be rather than where its guitar part
 * happened to sit.
 */
export function groupByFile(records: SongRecord[]): LibrarySong[] {
  const byKey = new Map<string, LibrarySong>();
  for (const record of records) {
    const key = fileKeyOfRecord(record);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        name: record.name,
        artist: record.score.artist ?? "",
        parts: [record],
        openId: record.id,
        addedAt: record.addedAt,
      });
      continue;
    }
    existing.parts.push(record);
    // The name is the first-imported part's: that record is the song as the
    // player filed it, and the other is the part they went looking for later.
    if (record.addedAt < existing.addedAt) existing.name = record.name;
    existing.addedAt = Math.min(existing.addedAt, record.addedAt);
    if (!existing.artist) existing.artist = record.score.artist ?? "";
    const open = existing.parts.find((p) => p.id === existing.openId);
    if (openedAt(record) > openedAt(open)) existing.openId = record.id;
  }
  return [...byKey.values()];
}

function openedAt(record: SongRecord | undefined): number {
  return record?.openedAt ?? record?.addedAt ?? 0;
}

/** The file a record belongs to, or null. */
export function fileOf(files: LibrarySong[], songId: string | null): LibrarySong | null {
  if (!songId) return null;
  return files.find((f) => f.parts.some((p) => p.id === songId)) ?? null;
}

/**
 * Which part a click on the row opens.
 *
 * A promise the coach made wins over where you left off: the mark on the row
 * is the coach asking for something (`COACH_UX.md` C2), and it is a promise
 * about a passage of ONE part. Opening the row has to arrive there, not at
 * whichever part happened to be open last.
 */
export function partToOpen(file: LibrarySong, due?: ReadonlySet<string>): string {
  const promised = due && file.parts.find((p) => due.has(p.id));
  return promised ? promised.id : file.openId;
}

/** Search matches what the row shows: the song's name and its artist. */
export function matchesQuery(file: LibrarySong, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return file.name.toLowerCase().includes(q) || file.artist.toLowerCase().includes(q);
}
