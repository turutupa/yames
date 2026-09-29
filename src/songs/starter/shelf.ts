/**
 * Putting the starter shelf in the library, once.
 *
 * `plans/SONGS.md` S0.9. Seven short pieces ship with the app so that Songs
 * is never an empty screen with a paragraph on it. They go in through **the
 * same importer as any file a player brings in** — there is no second path
 * into the library, no second idea of what a score is, and a bug in the
 * importer breaks the shelf the same way it breaks a real song, which is
 * exactly what we want.
 *
 * ## Idempotent twice over
 *
 * 1. A flag in `settings.json` says the seeding has run, and it is written
 *    only after the store has been told about every piece. A crash halfway
 *    leaves the flag unset and the next launch tries again.
 * 2. Every piece's id is a hash of its bytes and its track
 *    (`import.ts`'s `songId`), so even a flag lost to a corrupt settings file
 *    cannot produce a second copy of anything: the store's `save_score` is an
 *    upsert on that id.
 *
 * ## Deleting one is remembered
 *
 * The flag is the memory, and it is enough. "Seeded" is a fact about this
 * installation, not about what is currently in the library — so a player who
 * deletes the blues lick has deleted it, and it does not come back on the
 * next launch. That is also why the flag is not "the shelf is present".
 *
 * ## Why the pieces are loaded lazily
 *
 * `./pieces` is ten kilobytes of alphaTex and `../import` is alphaTab, which
 * is 0.27 MB gzipped. Both are wanted exactly once in the life of an
 * installation. `SongsView` and `useSongsSession` split the importer the same
 * way and for the same reason.
 */
import { storeLoad, storeSave } from "../../ipc";
import { newSongRecord } from "../library";
import type { SongRecord } from "../library";

/** The `settings.json` key. */
export const STARTER_KEY = "songsStarterShelf";

export type StarterState = {
  /** The seeding has run. Never unset; deleting a piece is not "unseeded". */
  seeded: boolean;
  /**
   * The ids the seeding produced, so the library can mark them without
   * having to parse seven files (or load alphaTab) to find out which they
   * are. A record of what was put there, not of what is still there.
   */
  ids: string[];
};

export const NO_STARTER_STATE: StarterState = { seeded: false, ids: [] };

/** Read it back, mistrusting all of it — `settings.json` is a file a person
 *  can edit and an older build wrote. */
export function readStarterState(stored: unknown): StarterState {
  const raw = (stored ?? {}) as Partial<StarterState>;
  return {
    // Only an explicit `true`: anything else means "we have not looked", and
    // looking again costs one store read and produces nothing new.
    seeded: raw.seeded === true,
    ids: Array.isArray(raw.ids) ? raw.ids.filter((id): id is string => typeof id === "string") : [],
  };
}

/**
 * Seed the shelf if it has never been seeded, and say what to add.
 *
 * Returns the records to put at the FRONT of the library, or `[]` when there
 * is nothing to do — which is every launch but the first. The caller commits
 * them, because the caller is what owns the list.
 *
 * Never throws. A shelf that cannot be built is a mode that opens empty,
 * which is a smaller failure than a mode that will not open; the flag is
 * left unset so the next launch tries again.
 */
export async function seedStarterShelf(): Promise<SongRecord[]> {
  let state: StarterState;
  try {
    state = readStarterState(await storeLoad<unknown>(STARTER_KEY));
  } catch {
    // No store, no seeding. Writing the flag would be worse.
    return [];
  }
  if (state.seeded) return [];

  try {
    const [{ importSong }, { STARTER_SHELF }] = await Promise.all([
      import("../import"),
      import("./pieces"),
    ]);
    const records: SongRecord[] = [];
    // Oldest first, and `addSong` prepends, so the last piece in the list
    // ends up at the top of the library. `pieces.ts` says which that is and
    // why.
    for (const piece of STARTER_SHELF) {
      const bytes = new TextEncoder().encode(piece.tex);
      const { score } = importSong(bytes, piece.fileName, piece.trackIndex);
      records.push(newSongRecord(score, bytes));
    }
    return records;
  } catch (err) {
    console.warn("[yames] the starter shelf could not be built", err);
    return [];
  }
}

/**
 * The seeding worked: remember that, and which ids it made.
 *
 * Called by whoever committed the records, AFTER the commit — the flag means
 * "these are in the store", and writing it before they were would lose the
 * shelf to a disk that filled up between the two.
 */
export async function markStarterSeeded(records: SongRecord[]): Promise<void> {
  const state: StarterState = { seeded: true, ids: records.map((r) => r.id) };
  await storeSave(STARTER_KEY, state);
}

/** The ids the shelf was seeded with, for marking them in the library. */
export async function starterIds(): Promise<ReadonlySet<string>> {
  try {
    return new Set(readStarterState(await storeLoad<unknown>(STARTER_KEY)).ids);
  } catch {
    return new Set();
  }
}
