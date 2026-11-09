/**
 * Which songs have already had their notes read (W36 item 2).
 *
 * The importer sometimes has something to say about a file: a tempo that
 * slides where Yames steps, a bar holding more than its meter allows, a part
 * too many to sound. It was a bulleted banner above the music, permanently,
 * for the life of the song — a row of the window spent saying the same
 * sentence on the four hundredth time you opened the piece.
 *
 * So it is said ONCE, quietly, the first time the song is opened, and after
 * that it lives behind a small mark beside the title. Which means remembering
 * that it has been said, and remembering it the way the app remembers
 * everything else small: one key, one list of song ids.
 *
 * Shaped after `stageView.ts` down to the serialised write, and for the same
 * reason — two songs opened in quick succession would otherwise race, and the
 * loser's id would be dropped from the list.
 */
import { storeLoad, storeSave } from "../ipc";

/** Where it is kept. One key, one list. */
const SEEN_KEY = "songsNotesSeen";

/**
 * How many ids are remembered.
 *
 * A player's library is tens of songs, not thousands, and the oldest id
 * falling off means at worst that one toast is shown a second time years
 * later. A list that grew without limit would be a setting file that grew
 * without limit, which is the other way to get this wrong.
 */
const KEEP = 200;

/** Whatever is in the store, read as a list of ids and never as a throw. */
export function readNotesSeen(stored: unknown): string[] {
  if (!Array.isArray(stored)) return [];
  return stored.filter((id): id is string => typeof id === "string").slice(-KEEP);
}

export async function loadNotesSeen(): Promise<string[]> {
  return readNotesSeen(await storeLoad<unknown>(SEEN_KEY));
}

/** The list with one id on the end, and nothing added twice. */
export function withSeen(seen: string[], id: string): string[] {
  if (seen.includes(id)) return seen;
  return [...seen, id].slice(-KEEP);
}

/** Write it down, one at a time — see the header. */
let writing: Promise<unknown> = Promise.resolve();

export function saveNotesSeen(seen: string[]): Promise<void> {
  const apply = () => storeSave(SEEN_KEY, seen);
  const next = writing.then(apply, apply);
  writing = next;
  return next;
}
