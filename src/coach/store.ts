/**
 * The coach's four stored keys (DESIGN 9.5), each with a typed reader and
 * writer, in the settings store (`settings.json`), never in SQLite.
 *
 * | Key | Holds | Default (missing, null or malformed) |
 * |---|---|---|
 * | `coach.suggestions` | `"on"` \| `"asked"` | `"on"` |
 * | `coach.cards` | per card kind: times dismissed, last dismissed | `{}` |
 * | `coach.goal` | `{ text, at }`: one sentence (at most 200 characters) and its date | `null` (no goal) |
 * | `coach.suppressed` | noticed-line id → the date it was left out | `{}` |
 *
 * Why here and not beside `CoachSettingsSection.tsx`: that section writes its
 * keys inline (`storeSave("coachMode", …)`) and reads none of them; they are
 * read where they are used (MainWindow, the loader). These four are read by
 * the tool host, the Notebook (c4a2) and the card budget (c4b2), so they get
 * one module that owns their shape.
 *
 * Nothing here writes on its own: no migration, no default written at load,
 * no clean-up at start. Every writer is called from a player's press (a tool's
 * confirm, Leave out, Hide / Not now, Settings' row) and nothing else: the
 * coach stores nothing the player did not press (c4a1b: "a card was shown" is
 * not stored; it lives in memory, c4b2's, unless the owner says otherwise).
 * A stored `null`, a value from a future build or a hand-edited file reads as
 * the default and never throws, so a player who never opens the coach sees no
 * change at all. A dismissal or left-out date in the future (a clock moved
 * back, a hand edit) reads as the moment it was read; the file is not
 * rewritten for it, only by the next press on that key.
 *
 * The readers the tool host calls are synchronous (a confirm is), so the
 * values are kept in memory after one load (`loadCoachStored`); until that
 * load has finished `coachStoredLoaded()` is false and the host answers
 * "not yet" rather than propose over a goal it has not read. A key whose read
 * failed is "unknown", not its default, for anything that would replace it
 * (`coachStoredUnread`).
 *
 * The two map keys (`coach.cards`, `coach.suppressed`) are written whole, so
 * a press on them before the load has finished is queued, shown in memory at
 * once, and replayed onto what the load reads; only then is the map saved.
 * A write never starts from the empty default and overwrites the disk.
 */
import { storeLoad, storeSave } from "../ipc";

export type Suggestions = "on" | "asked";

/** One proactive card kind's record (DESIGN 6.6). Times are ms since the epoch. */
export type CardRecord = {
  /** "Hide" / "Not now" presses since it was last asked for. */
  dismissed: number;
  /** When it was last dismissed; null: never. */
  lastDismissed: number | null;
};

/**
 * The card kinds DESIGN 6.6 orders (milestone, then the weekly look-back, then
 * the plateau question) and the goal question (c4a2). A kind outside this list
 * read from the store is kept as it is (a later build's card), never dropped.
 */
export const CARD_KINDS = ["milestone", "weekly", "plateau", "goal"] as const;
export type CardKind = (typeof CARD_KINDS)[number];

export type CoachCards = Readonly<Record<string, CardRecord>>;

export type CoachGoal = {
  /** The player's own words, trimmed, 1 to `GOAL_MAX_CHARS` characters. */
  text: string;
  /** When it was set; null when an older value carried no date. */
  at: number | null;
};

/** Noticed-line id → when it was left out. */
export type Suppressed = Readonly<Record<string, number>>;

export type CoachStored = {
  suggestions: Suggestions;
  cards: CoachCards;
  goal: CoachGoal | null;
  suppressed: Suppressed;
};

/** As `set_goal` takes it (`tools/settings.ts` `MAX_GOAL`). */
export const GOAL_MAX_CHARS = 200;
/** DESIGN 6.6: the same card kind does not return for seven days after a dismissal. */
export const CARD_QUIET_DAYS = 7;
/** DESIGN 6.6: after two dismissals, not until asked. */
export const CARD_DISMISSALS_TO_STOP = 2;
/** DESIGN 6.7: a line left out stays out for thirty days. */
export const SUPPRESS_DAYS = 30;

const DAY_MS = 86_400_000;

export const COACH_STORED_DEFAULTS: CoachStored = Object.freeze({
  suggestions: "on",
  cards: Object.freeze({}),
  goal: null,
  suppressed: Object.freeze({}),
}) as CoachStored;

// ---------------------------------------------------------------------------
// Readers: anything in, a valid value out, never a throw
// ---------------------------------------------------------------------------

const isTime = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function readSuggestions(raw: unknown): Suggestions {
  return raw === "asked" ? "asked" : "on";
}

/** One card record, or null when it is not one (dropped, not repaired). A date after `now` reads as `now`. */
function readCard(raw: unknown, now: number): CardRecord | null {
  if (!isRecord(raw)) return null;
  const lastDismissed = raw.lastDismissed === null || raw.lastDismissed === undefined ? null : raw.lastDismissed;
  const dismissed = raw.dismissed === undefined ? 0 : raw.dismissed;
  if (lastDismissed !== null && !isTime(lastDismissed)) return null;
  if (typeof dismissed !== "number" || !Number.isInteger(dismissed) || dismissed < 0) return null;
  // An older record's `lastShown` (c4a1, never released) is not read: nothing stores it now.
  return { dismissed, lastDismissed: lastDismissed === null ? null : Math.min(lastDismissed, now) };
}

/** `now`: when it is read. A dismissal dated after it reads as `now` (not rewritten). */
export function readCards(raw: unknown, now: number): CoachCards {
  if (!isRecord(raw)) return COACH_STORED_DEFAULTS.cards;
  const out: Record<string, CardRecord> = {};
  for (const [kind, value] of Object.entries(raw)) {
    const card = readCard(value, now);
    if (card) out[kind] = card;
  }
  return out;
}

export function readGoal(raw: unknown): CoachGoal | null {
  if (!isRecord(raw) || typeof raw.text !== "string") return null;
  const text = raw.text.trim();
  if (text.length === 0 || text.length > GOAL_MAX_CHARS) return null;
  return { text, at: isTime(raw.at) ? raw.at : null };
}

/** `now`: when it is read. A line left out after it reads as left out `now` (not rewritten). */
export function readSuppressed(raw: unknown, now: number): Suppressed {
  if (!isRecord(raw)) return COACH_STORED_DEFAULTS.suppressed;
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(raw)) if (id.length > 0 && isTime(at)) out[id] = Math.min(at, now);
  return out;
}

// ---------------------------------------------------------------------------
// The rules of DESIGN 6.6 and 6.7, pure
// ---------------------------------------------------------------------------

export function cardOf(cards: CoachCards, kind: string): CardRecord {
  return cards[kind] ?? { dismissed: 0, lastDismissed: null };
}

/**
 * May a proactive card of this kind be shown now? No when the player chose
 * "Only when I ask"; no after two dismissals (until asked: `withCardAsked`);
 * no within seven days of the last dismissal. "One card per app open" is the
 * caller's (c4b2): this answers for one kind.
 */
export function cardMayShow(stored: Pick<CoachStored, "suggestions" | "cards">, kind: string, now: number): boolean {
  if (stored.suggestions === "asked") return false;
  const card = cardOf(stored.cards, kind);
  if (card.dismissed >= CARD_DISMISSALS_TO_STOP) return false;
  if (card.lastDismissed !== null && now - card.lastDismissed < CARD_QUIET_DAYS * DAY_MS) return false;
  return true;
}

export function withCardDismissed(cards: CoachCards, kind: string, now: number): CoachCards {
  const card = cardOf(cards, kind);
  return { ...cards, [kind]: { ...card, dismissed: card.dismissed + 1, lastDismissed: now } };
}

/** The player asked for this kind: the dismissals stop counting against it. The same object when there were none. */
export function withCardAsked(cards: CoachCards, kind: string): CoachCards {
  const card = cardOf(cards, kind);
  if (card.dismissed === 0 && card.lastDismissed === null) return cards;
  return { ...cards, [kind]: { ...card, dismissed: 0, lastDismissed: null } };
}

/** Is this noticed line left out now? Thirty days after it was, it may return. */
export function isSuppressed(suppressed: Suppressed, id: string, now: number): boolean {
  const at = suppressed[id];
  return at !== undefined && now - at < SUPPRESS_DAYS * DAY_MS;
}

/** The ids still within their thirty days, so the stored list does not grow forever. */
function stillSuppressed(suppressed: Suppressed, now: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(suppressed)) if (isSuppressed(suppressed, id, now)) out[id] = at;
  return out;
}

export function withSuppressed(suppressed: Suppressed, id: string, now: number): Suppressed {
  return { ...stillSuppressed(suppressed, now), [id]: now };
}

/** Leave-out's Undo: the line is back at once. The same object when it was not left out. */
export function withoutSuppressed(suppressed: Suppressed, id: string): Suppressed {
  if (!Object.prototype.hasOwnProperty.call(suppressed, id)) return suppressed;
  const out = { ...suppressed };
  delete out[id];
  return out;
}

// ---------------------------------------------------------------------------
// The values in memory, the load, the writers
// ---------------------------------------------------------------------------

/** The two keys written as a whole map: a write before the load is queued and replayed. */
type MapKey = "cards" | "suppressed";
type Queued =
  | { key: "cards"; op: (cards: CoachCards) => CoachCards }
  | { key: "suppressed"; op: (suppressed: Suppressed) => Suppressed };

/**
 * What a writer did with the press, for the caller to say so:
 * - `"saved"`: in memory, and sent to the store;
 * - `"queued"`: made before the keys were read: in memory now, replayed onto
 *   what the load reads and saved then;
 * - `"unchanged"`: there was nothing to change (nothing written);
 * - `"notRead"`: the key could not be read this run, so a write would replace
 *   what is on disk unseen: nothing changed, nothing written.
 */
export type Written = "saved" | "queued" | "unchanged" | "notRead";

let stored: CoachStored = COACH_STORED_DEFAULTS;
let loaded = false;
let loading: Promise<CoachStored> | null = null;
const listeners = new Set<() => void>();
/** Scalar keys (`suggestions`) written before the load finished: the press wins over what is read. */
const writtenEarly = new Set<keyof CoachStored>();
/** Map writes made before the load finished, in order. */
const queued: Queued[] = [];
/** Keys whose read failed this run: "unknown", not their default, for anything that would replace them. */
const unread = new Set<keyof CoachStored>();
/** The goal the last `saveGoal` replaced, so its undo brings back its own date (c4a1b, L4). */
let replacedGoal: CoachGoal | null = null;
let resets = 0;

function set(next: CoachStored, written?: keyof CoachStored): void {
  if (written && !loaded) writtenEarly.add(written);
  stored = next;
  for (const listener of listeners) {
    try {
      listener();
    } catch (err) {
      console.error("[coach.store] listener failed", err);
    }
  }
}

/** The four values now (the defaults until the load has finished). */
export function coachStored(): CoachStored {
  return stored;
}

export function coachStoredLoaded(): boolean {
  return loaded;
}

/** Did this key's read fail this run? Then its value in memory is the default, not what is on disk. */
export function coachStoredUnread(key: keyof CoachStored): boolean {
  return unread.has(key);
}

/** Is the stored goal known (read, and read without a failure)? Only then may anything replace it. */
export function coachGoalKnown(): boolean {
  return loaded && !unread.has("goal");
}

/** Hear every change (for `useSyncExternalStore`); returns the unsubscribe. */
export function subscribeCoachStored(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Read the four keys once (later calls share the first). A key that cannot be
 * read is its default in memory and is marked unread (`coachStoredUnread`).
 * Writes nothing of its own: only a map press queued before it finished is
 * saved, replayed onto what was read. Every key is named as a literal at its
 * `storeLoad` / `storeSave`, so the parity manifest's scan finds it.
 */
export function loadCoachStored(): Promise<CoachStored> {
  const generation = resets;
  const failed: Array<keyof CoachStored> = [];
  const failedAs = <T>(key: keyof CoachStored, fallback: T) => () => {
    failed.push(key);
    return fallback;
  };
  loading ??= Promise.all([
    storeLoad<unknown>("coach.suggestions").then(readSuggestions, failedAs("suggestions", readSuggestions(undefined))),
    storeLoad<unknown>("coach.cards").then((raw) => readCards(raw, Date.now()), failedAs("cards", COACH_STORED_DEFAULTS.cards)),
    storeLoad<unknown>("coach.goal").then(readGoal, failedAs("goal", readGoal(undefined))),
    storeLoad<unknown>("coach.suppressed").then(
      (raw) => readSuppressed(raw, Date.now()),
      failedAs("suppressed", COACH_STORED_DEFAULTS.suppressed),
    ),
  ]).then(([suggestions, cards, goal, suppressed]) => {
    if (generation !== resets) return stored; // a test reset since: this read is stale
    const next: CoachStored = { suggestions, cards, goal, suppressed };
    // A scalar written before the load finished holds the player's newer value: keep it.
    for (const key of writtenEarly) (next as Record<keyof CoachStored, unknown>)[key] = stored[key];
    for (const key of failed) if (!writtenEarly.has(key)) unread.add(key);
    writtenEarly.clear();
    // A map press made before the load: replayed, in order, onto what was read.
    const replayed = new Set<MapKey>();
    for (const q of queued.splice(0)) {
      if (q.key === "cards") {
        const v = q.op(next.cards);
        if (v !== next.cards) replayed.add("cards");
        next.cards = v;
      } else {
        const v = q.op(next.suppressed);
        if (v !== next.suppressed) replayed.add("suppressed");
        next.suppressed = v;
      }
    }
    loaded = true;
    set(next);
    for (const key of replayed) {
      // Unread: the press holds for this run, and the disk keeps what it had.
      if (unread.has(key)) console.error(`[coach.store] coach.${key} could not be read: an early press is not saved`);
      else persistMap(key);
    }
    return stored;
  });
  return loading;
}

/** A failed write is logged; the value in memory stays what the player chose for this run. */
const notSaved = (key: string) => (err: unknown) => console.error(`[coach.store] ${key} not saved`, err);

/** Settings → Coach's row and `set_setting`'s confirm. The whole value: once chosen, it is known. */
export function saveSuggestions(value: Suggestions): void {
  set({ ...stored, suggestions: value }, "suggestions");
  unread.delete("suggestions");
  void storeSave("coach.suggestions", value).catch(notSaved("coach.suggestions"));
}

/**
 * `set_goal`'s confirm (and its undo). `text` is trimmed and held to 200
 * characters. Null, and nothing written, when it is not a goal or when the
 * stored goal is not known (`coachGoalKnown`: not read yet, or its read
 * failed): a goal nobody has seen is never replaced. The text of the goal the
 * last call replaced comes back with its own date (the undo; L4).
 */
export function saveGoal(text: string, now: number): CoachGoal | null {
  if (!coachGoalKnown()) return null;
  const back = replacedGoal !== null && replacedGoal.text === text.trim() ? replacedGoal : null;
  const goal = readGoal({ text, at: back ? back.at : now });
  if (!goal) return null;
  replacedGoal = stored.goal;
  set({ ...stored, goal }, "goal");
  void storeSave("coach.goal", goal).catch(notSaved("coach.goal"));
  return goal;
}

function persistMap(key: MapKey): void {
  if (key === "cards") void storeSave("coach.cards", stored.cards).catch(notSaved("coach.cards"));
  else void storeSave("coach.suppressed", stored.suppressed).catch(notSaved("coach.suppressed"));
}

/** One press on a map key: never from the empty default over the disk (M1). */
function writeMap(q: Queued): Written {
  if (!loaded) {
    // Shown at once; replayed onto what the load reads, and saved then.
    queued.push(q);
    if (q.key === "cards") set({ ...stored, cards: q.op(stored.cards) });
    else set({ ...stored, suppressed: q.op(stored.suppressed) });
    void loadCoachStored().catch(() => {});
    return "queued";
  }
  if (unread.has(q.key)) return "notRead";
  if (q.key === "cards") {
    const cards = q.op(stored.cards);
    if (cards === stored.cards) return "unchanged";
    set({ ...stored, cards });
  } else {
    const suppressed = q.op(stored.suppressed);
    if (suppressed === stored.suppressed) return "unchanged";
    set({ ...stored, suppressed });
  }
  persistMap(q.key);
  return "saved";
}

/** "Hide" on a report, "Not now" on an offer. */
export function saveCardDismissed(kind: string, now: number): Written {
  return writeMap({ key: "cards", op: (cards) => withCardDismissed(cards, kind, now) });
}

/** The player asked for a card of this kind. Writes only when there were dismissals to clear. */
export function saveCardAsked(kind: string): Written {
  return writeMap({ key: "cards", op: (cards) => withCardAsked(cards, kind) });
}

/** "Leave out" on a noticed line. Not a delete: every Take stays. */
export function saveSuppressed(id: string, now: number): Written {
  return writeMap({ key: "suppressed", op: (suppressed) => withSuppressed(suppressed, id, now) });
}

/** Leave-out's Undo. Writes only when the line was left out. */
export function saveUnsuppressed(id: string): Written {
  return writeMap({ key: "suppressed", op: (suppressed) => withoutSuppressed(suppressed, id) });
}

/** Tests only: forget what was loaded. */
export function resetCoachStored(): void {
  resets += 1;
  stored = COACH_STORED_DEFAULTS;
  loaded = false;
  loading = null;
  listeners.clear();
  writtenEarly.clear();
  queued.length = 0;
  unread.clear();
  replacedGoal = null;
}
