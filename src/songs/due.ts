/**
 * "Come back to this" — the one action that is a promise rather than a setting.
 *
 * `COACH_UX.md` A5 says every correction resolves to something the app can set
 * up in one tap, and the fourth of those is "come back to this tomorrow".
 * `findings.rs` decides WHEN, out of `srs.rs`'s ladder: two days after
 * something improved, three after a clean pass at full tempo. This file only
 * writes the promise down and reads it back, so the library can put a quiet
 * mark on the song.
 *
 * ## Where it lives, and why it is not in SQLite
 *
 * The practice store has an `exercise_ceilings` table with a `next_review_due`
 * column on it, which is where this belongs the day the notebook (`COACH_UX`
 * C1) is built: a due item is a thing the player should be able to read,
 * correct and delete, and that is a screen and a schema, not a field. Tonight
 * it is four keys in `settings.json`, through the same door the jam library
 * and the song library used before W2 moved them — no migration, no Rust, and
 * nothing to unpick when the notebook arrives.
 *
 * ## Days, not timestamps
 *
 * `srs.rs`'s own unit: whole days on one axis, in the player's own timezone.
 * "Due today" is a question about a calendar, and an item due at 09:00 that
 * somebody picks up at 08:45 is due.
 */
import { storeLoad, storeSave } from "../ipc";

/** Where the promises live in `settings.json`. */
export const SONG_DUE_KEY = "songs.due";

/** One passage of one song, and the day to look at it again. */
export type SongDue = {
  scoreId: string;
  /** Played-bar indices, inclusive — the numbering the transport takes. */
  startBar: number;
  endBar: number;
  /** Days since the Unix epoch, in local time. */
  dueDay: number;
  /** When the promise was made, as a day on the same axis. */
  madeOn: number;
};

/**
 * Today, as a day number.
 *
 * Local midnight, not UTC: a player in Auckland practising at 09:00 is on a
 * different day from one in Vancouver practising at the same instant, and it
 * is their calendar the promise is about. `Date.getTime()` minus the timezone
 * offset is the whole of the arithmetic.
 */
export function dayOf(when: Date = new Date()): number {
  const local = when.getTime() - when.getTimezoneOffset() * 60_000;
  return Math.floor(local / 86_400_000);
}

/** Every promise on file, oldest due first. */
export async function listSongDue(): Promise<SongDue[]> {
  const stored = await storeLoad<SongDue[]>(SONG_DUE_KEY).catch(() => undefined);
  if (!Array.isArray(stored)) return [];
  return stored.filter(isSongDue).sort((a, b) => a.dueDay - b.dueDay);
}

/**
 * Write one down.
 *
 * One promise per passage: pressing the button twice on the same bars moves
 * the date rather than growing a list nobody asked for. A passage is "the
 * same" when the song and both bar numbers match — a promise about bars 17–24
 * is not a promise about bars 17–20, and the coach made each of them about
 * something it had actually judged.
 */
export async function promiseToComeBack(
  item: Omit<SongDue, "madeOn"> & { madeOn?: number },
): Promise<SongDue[]> {
  const today = item.madeOn ?? dayOf();
  const next: SongDue = { ...item, madeOn: today };
  const rest = (await listSongDue()).filter((d) => !samePassage(d, next));
  const all = [...rest, next].sort((a, b) => a.dueDay - b.dueDay);
  await storeSave(SONG_DUE_KEY, all).catch(() => undefined);
  return all;
}

/** Forget one — the player played it, or does not want the reminder. */
export async function clearSongDue(scoreId: string, startBar: number, endBar: number): Promise<SongDue[]> {
  const all = (await listSongDue()).filter(
    (d) => !samePassage(d, { scoreId, startBar, endBar, dueDay: 0, madeOn: 0 }),
  );
  await storeSave(SONG_DUE_KEY, all).catch(() => undefined);
  return all;
}

/** The songs with something due today or overdue — what the library marks. */
export function songsDueOn(items: readonly SongDue[], today: number = dayOf()): Set<string> {
  const out = new Set<string>();
  for (const item of items) if (item.dueDay <= today) out.add(item.scoreId);
  return out;
}

function samePassage(a: SongDue, b: SongDue): boolean {
  return a.scoreId === b.scoreId && a.startBar === b.startBar && a.endBar === b.endBar;
}

/**
 * A value read off a file a person can edit.
 *
 * Everything in `settings.json` is hand-editable and everything in it has
 * been hand-edited at least once. A row that is not a row is dropped rather
 * than drawn as a mark on a song nobody promised anything about.
 */
function isSongDue(value: unknown): value is SongDue {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.scoreId === "string" &&
    v.scoreId.length > 0 &&
    Number.isInteger(v.startBar) &&
    Number.isInteger(v.endBar) &&
    Number.isFinite(v.dueDay as number) &&
    Number.isFinite(v.madeOn as number)
  );
}
