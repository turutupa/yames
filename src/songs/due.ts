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
 * ## It lives in the practice store now
 *
 * It was four keys in `settings.json`, and the note here at the time said
 * that was where it belonged **until there was a schema** — a due item is a
 * thing the player should be able to read, correct and delete, and that is a
 * screen and a table, not a field. Migration three is that table
 * (`score_due`), so this file goes through `saveDue` / `listDue` / `clearDue`
 * and the first read moves across whatever the old key still holds.
 *
 * The move is **one-time and idempotent**, and it follows `db.rs`'s own rule
 * for the JSON history import: it only READS the old key, leaves it exactly
 * where it is so a downgraded build still finds its promises, and writes a
 * marker beside it saying the move happened. Without the marker, clearing a
 * promise and then restarting would bring it back from the file it was
 * cleared out of — which is the one failure a reminder must never have.
 *
 * ## A build whose Rust half is older
 *
 * The three commands are the newest thing in the app, and a binary without
 * them rejects all of them. That is not an error to report to a player: the
 * whole file falls back to the old `settings.json` path, the library's mark
 * goes on working, and nothing is moved (the marker is only written by a
 * move that succeeded). Same rule the rest of this wave keeps.
 *
 * ## Days, not timestamps
 *
 * `srs.rs`'s own unit: whole days on one axis, in the player's own timezone.
 * "Due today" is a question about a calendar, and an item due at 09:00 that
 * somebody picks up at 08:45 is due.
 */
import { clearDue, listDue, saveDue, storeLoad, storeSave } from "../ipc";
import type { ScoreDue } from "../ipc";

/** Where the promises used to live in `settings.json`. Read, never written. */
export const SONG_DUE_KEY = "songs.due";

/** The marker that says the move off that key has happened. */
export const SONG_DUE_MOVED_KEY = "songs.dueMovedToStore";

/**
 * And where a promise's SPEED is kept, which is beside it rather than in it.
 *
 * Opening a passage the coach asked you to come back to has to open it at
 * the speed the promise was made at — coming back to a run at full tempo
 * when the promise was made at seventy per cent is being handed a different
 * exercise. `score_due` has no column for it (`db.rs`, migration three), and
 * adding one is a schema change in a file this task does not own, so the
 * number lives in `settings.json` under its own key, keyed by the passage.
 *
 * A few bytes per promise, written and read only here, and the moment the
 * table grows the column this key and the four functions that touch it go.
 */
export const SONG_DUE_TEMPO_KEY = "songs.dueTempo";

/** One passage of one song, and the day to look at it again. */
export type SongDue = {
  scoreId: string;
  /** Played-bar indices, inclusive — the numbering the transport takes. */
  startBar: number;
  endBar: number;
  /** Days since the Unix epoch, in local time. */
  dueDay: number;
  /** Why the coach asked, as the finding's own kind. */
  reason?: string;
  /**
   * The speed the promise was made at, 50–100, when one was recorded.
   *
   * Absent on every promise made before this existed, and on one whose
   * settings file could not be read. The stage then opens the passage at
   * whatever speed the song was left at, which is the honest fallback.
   */
  tempoPercent?: number;
};

/** One passage, as the tempo map keys it. */
function passageKey(scoreId: string, startBar: number, endBar: number): string {
  return `${scoreId}|${String(startBar)}|${String(endBar)}`;
}

/** Every promise's speed, mistrusting the file it came out of. */
async function readTempos(): Promise<Record<string, number>> {
  const stored = await storeLoad<Record<string, unknown>>(SONG_DUE_TEMPO_KEY).catch(
    () => undefined,
  );
  if (!stored || typeof stored !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(stored)) {
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[key] = Math.min(100, Math.max(50, Math.round(value)));
  }
  return out;
}

/** Remember one, or forget it when the promise itself is forgotten. */
async function writeTempo(key: string, percent: number | null): Promise<void> {
  const all = await readTempos();
  if (percent === null) {
    if (!(key in all)) return;
    delete all[key];
  } else {
    all[key] = Math.min(100, Math.max(50, Math.round(percent)));
  }
  await storeSave(SONG_DUE_TEMPO_KEY, all).catch(() => undefined);
}

/** The speeds put back on the promises they belong to. */
async function withTempos(items: SongDue[]): Promise<SongDue[]> {
  if (items.length === 0) return items;
  const tempos = await readTempos();
  return items.map((item) => {
    const percent = tempos[passageKey(item.scoreId, item.startBar, item.endBar)];
    return percent === undefined ? item : { ...item, tempoPercent: percent };
  });
}

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

function fromRow(row: ScoreDue): SongDue {
  return {
    scoreId: row.scoreId,
    startBar: row.rangeStartBar,
    endBar: row.rangeEndBar,
    dueDay: row.dueDay,
    ...(row.reason === undefined ? {} : { reason: row.reason }),
  };
}

function toRow(due: SongDue): ScoreDue {
  return {
    scoreId: due.scoreId,
    rangeStartBar: due.startBar,
    rangeEndBar: due.endBar,
    dueDay: due.dueDay,
    ...(due.reason === undefined ? {} : { reason: due.reason }),
  };
}

/**
 * Whatever the old key still holds, onto the store, once.
 *
 * Every row is its own call so that one that will not land — a promise about
 * a song since deleted, which the table's foreign key refuses — does not take
 * the rest of them with it. The marker is written only when the whole pass
 * got through, so a half-finished move is retried rather than forgotten.
 */
async function moveFromSettings(): Promise<void> {
  const already = await storeLoad<boolean>(SONG_DUE_MOVED_KEY).catch(() => undefined);
  if (already === true) return;
  const stored = await storeLoad<unknown[]>(SONG_DUE_KEY).catch(() => undefined);
  if (Array.isArray(stored)) {
    for (const row of stored) {
      if (!isSongDue(row)) continue;
      // Swallowed per row, and only safe because the caller has already had
      // an answer out of the store: what is being tolerated here is one row
      // the table refuses — a promise about a song since deleted — and not a
      // store that is not there. Marking the move done against a store that
      // never answered would lose every promise on the day of the upgrade.
      await saveDue(toRow(row)).catch(() => undefined);
    }
  }
  // The old array is left exactly where it is: a downgraded build still finds
  // its promises, and nothing here has ever deleted a user's data.
  await storeSave(SONG_DUE_MOVED_KEY, true).catch(() => undefined);
}

/**
 * Has the store answered at all?
 *
 * Asked once per session and remembered, because the answer cannot change
 * without the app being restarted: either this binary has the commands or it
 * does not. `null` while the first question is still out.
 */
let storeBacked: boolean | null = null;
/** The move, started once and awaited by everything that follows it. */
let moving: Promise<void> | null = null;

/** Tests only — a fresh session's worth of forgetting. */
export function __resetDueBackingForTests(): void {
  storeBacked = null;
  moving = null;
}

/**
 * The store's rows, or `null` on a build that has no such commands.
 *
 * The read is the probe, deliberately the same call: a binary that can list
 * promises can write them, and asking twice would leave a window in which
 * this file believed two different things. The move runs behind the first
 * answer and the list is taken again after it, because a list taken before
 * the move would be short by everything the old key still holds.
 */
async function storeRows(): Promise<ScoreDue[] | null> {
  if (storeBacked === false) return null;
  const ask = async () => {
    const rows = await listDue();
    if (!Array.isArray(rows)) throw new Error("the store did not answer with a list");
    return rows;
  };
  try {
    let rows = await ask();
    storeBacked = true;
    if (moving === null) {
      moving = moveFromSettings();
      await moving;
      rows = await ask();
    } else {
      await moving;
    }
    return rows;
  } catch {
    storeBacked = false;
    return null;
  }
}

/** Every promise on file, oldest due first, each at the speed it was made at. */
export async function listSongDue(): Promise<SongDue[]> {
  const rows = await storeRows();
  if (rows) return withTempos(rows.map(fromRow).sort((a, b) => a.dueDay - b.dueDay));
  return withTempos(await legacyList());
}

/**
 * The passage of this song that has fallen due, or null.
 *
 * The soonest-due first, so the one a player is handed when they open the
 * song is the one that has been waiting longest. A promise for tomorrow is
 * not a promise for today, and opening a song must not quietly start looping
 * four bars of it because of something the coach said on Thursday.
 */
export function songDueNow(
  items: readonly SongDue[],
  scoreId: string,
  today: number = dayOf(),
): SongDue | null {
  for (const item of items) {
    if (item.scoreId === scoreId && item.dueDay <= today) return item;
  }
  return null;
}

/**
 * Write one down.
 *
 * One promise per passage: pressing the button twice on the same bars moves
 * the date rather than growing a list nobody asked for. A passage is "the
 * same" when the song and both bar numbers match — a promise about bars 17–24
 * is not a promise about bars 17–20, and the coach made each of them about
 * something it had actually judged. The table's primary key is that rule, so
 * the store keeps it rather than this file remembering to.
 */
export async function promiseToComeBack(item: SongDue): Promise<SongDue[]> {
  // Beside the promise, whichever half of the file it lands in.
  if (item.tempoPercent !== undefined) {
    await writeTempo(passageKey(item.scoreId, item.startBar, item.endBar), item.tempoPercent);
  }
  if ((await storeRows()) !== null) {
    try {
      await saveDue(toRow(item));
      return listSongDue();
    } catch {
      storeBacked = false;
    }
  }
  const rest = (await legacyList()).filter((d) => !samePassage(d, item));
  const all = [...rest, item].sort((a, b) => a.dueDay - b.dueDay);
  await storeSave(SONG_DUE_KEY, all).catch(() => undefined);
  return all;
}

/** Forget one — the player played it, or does not want the reminder. */
export async function clearSongDue(
  scoreId: string,
  startBar: number,
  endBar: number,
): Promise<SongDue[]> {
  await writeTempo(passageKey(scoreId, startBar, endBar), null);
  if ((await storeRows()) !== null) {
    try {
      await clearDue(scoreId, startBar, endBar);
      return listSongDue();
    } catch {
      storeBacked = false;
    }
  }
  const all = (await legacyList()).filter(
    (d) => !samePassage(d, { scoreId, startBar, endBar, dueDay: 0 }),
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

// --- the old home, still readable ------------------------------------------

async function legacyList(): Promise<SongDue[]> {
  const stored = await storeLoad<unknown[]>(SONG_DUE_KEY).catch(() => undefined);
  if (!Array.isArray(stored)) return [];
  return stored.filter(isSongDue).sort((a, b) => a.dueDay - b.dueDay);
}

function samePassage(a: SongDue, b: SongDue): boolean {
  return a.scoreId === b.scoreId && a.startBar === b.startBar && a.endBar === b.endBar;
}

/**
 * A value read off a file a person can edit.
 *
 * Everything in `settings.json` is hand-editable and everything in it has
 * been hand-edited at least once. A row that is not a row is dropped rather
 * than drawn as a mark on a song nobody promised anything about — and rather
 * than moved into the store, where it would be wrong for ever.
 */
function isSongDue(value: unknown): value is SongDue {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.scoreId === "string" &&
    v.scoreId.length > 0 &&
    Number.isInteger(v.startBar) &&
    Number.isInteger(v.endBar) &&
    Number.isFinite(v.dueDay as number)
  );
}
