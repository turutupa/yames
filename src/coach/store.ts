/**
 * The coach's five stored keys (DESIGN 9.5), each with a typed reader and
 * writer, in the settings store (`settings.json`), never in SQLite.
 *
 * | Key | Holds | Default (missing, null or malformed) |
 * |---|---|---|
 * | `coach.suggestions` | `"on"` \| `"asked"` | `"on"` |
 * | `coach.cards` | per card kind: times dismissed, last dismissed | `{}` |
 * | `coach.goal` | `{ text, at }`: one sentence (at most 200 characters) and its date | `null` (no goal) |
 * | `coach.suppressed` | noticed-line id → the date it was left out | `{}` |
 * | `coach.reminder` | `{ on, time: "HH:MM", days: 0..6 (0 = Sunday), since }` (leg rem2) | off, 18:00, every day |
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
 * A stored `null` (or no value) reads as the default and never throws, so a
 * player who never opens the coach sees no change at all. A value that is
 * there but is not one this build reads (a later build's shape, a hand edit)
 * is never silently replaced (c4a1c, F6): a whole value of the wrong shape
 * makes the key "unreadable", like a failed read; a map entry the reader drops
 * and a kept card record's unknown fields are written back as they were; a
 * goal a press replaces comes back exactly as it was stored on its Undo. A
 * dismissal or left-out date in the future (a clock moved back, a hand edit)
 * reads as the moment it was read; the file is not rewritten for it, and a
 * press on another entry writes it back exactly as it was (c4a2b, L6). A map
 * entry this build cannot read fails closed (its card dismissed until asked,
 * its line left out) and is written back as it was; an entry whose thirty
 * days are over is ignored when read and never removed by a press.
 *
 * The readers the tool host calls are synchronous (a confirm is), so the
 * values are kept in memory after one load (`loadCoachStored`); until that
 * load has finished `coachStoredLoaded()` is false and the host answers
 * "not yet" rather than propose over a goal it has not read. A key whose read
 * failed is "unknown", not its default, for anything that would replace it
 * (`coachStoredUnread`), and for anything that would show what it governs
 * (`coachKeyStates`, c4a1c F1): until a key is "read", `cardMayShow` says no
 * and the Notebook shows no noticed line and no goal.
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
 * with a valid record is read and kept like the others (a later build's card).
 * What is really kept on a write (c4a1c, F6): every entry of the stored map
 * that the reader dropped, as it was, and every unknown field of a kept
 * record; a press changes only the fields it changes (`dismissed`,
 * `lastDismissed`) of the one kind it is on.
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

/**
 * The practice reminder (leg rem2; OWNER-UPDATES 2026-11-20: in the app only,
 * Today mentions it). No notification, nothing in the background.
 */
export type CoachReminder = {
  on: boolean;
  /** Local time, "HH:MM", 24-hour. */
  time: string;
  /** Local weekdays, 0 = Sunday; sorted, no repeats. */
  days: readonly number[];
  /**
   * When the press that turned it on was made (ms); null when off or when an
   * older value carried no date. Only the quiet rule reads it: a reminder day
   * before the player turned the reminder on is never counted as ignored.
   */
  since: number | null;
};

export type CoachStored = {
  suggestions: Suggestions;
  cards: CoachCards;
  goal: CoachGoal | null;
  suppressed: Suppressed;
  reminder: CoachReminder;
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

/** Off; what the first On fills in (judgement call 22): 18:00, all seven days. */
export const REMINDER_OFF: CoachReminder = Object.freeze({
  on: false,
  time: "18:00",
  days: Object.freeze([0, 1, 2, 3, 4, 5, 6]),
  since: null,
}) as CoachReminder;

export const COACH_STORED_DEFAULTS: CoachStored = Object.freeze({
  suggestions: "on",
  cards: Object.freeze({}),
  goal: null,
  suppressed: Object.freeze({}),
  reminder: REMINDER_OFF,
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

const REMINDER_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * The reminder as stored, or null when what is there is not one this build
 * reads (a wrong type in any of `on`, `time`, `days`; a day outside 0..6).
 * `since` is optional: missing, null or not a time reads as null. Repeated
 * days are read once, in order.
 */
export function readReminderStrict(raw: unknown): CoachReminder | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.on !== "boolean") return null;
  if (typeof raw.time !== "string" || !REMINDER_TIME.test(raw.time)) return null;
  if (!Array.isArray(raw.days)) return null;
  const days = new Set<number>();
  for (const d of raw.days) {
    if (typeof d !== "number" || !Number.isInteger(d) || d < 0 || d > 6) return null;
    days.add(d);
  }
  return {
    on: raw.on,
    time: raw.time,
    days: [...days].sort((a, b) => a - b),
    since: isTime(raw.since) ? raw.since : null,
  };
}

/** Anything in, a reminder out: missing or malformed reads as off, never a throw. */
export function readReminder(raw: unknown): CoachReminder {
  return readReminderStrict(raw) ?? REMINDER_OFF;
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
 *
 * Fails closed (c4a1c, F1): no while `coach.suggestions` or `coach.cards` is
 * not read yet or could not be read (`states`, from `coachKeyStates()`), since
 * either may hold "Only when I ask" or two dismissals.
 */
export function cardMayShow(
  stored: Pick<CoachStored, "suggestions" | "cards">,
  kind: string,
  now: number,
  states: Pick<CoachKeyStates, "suggestions" | "cards">,
): boolean {
  if (states.suggestions !== "read" || states.cards !== "read") return false;
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

/**
 * Leave out. Only the pressed line changes: an entry whose thirty days are
 * over stays on disk and is simply not read as left out (`isSuppressed`), so
 * nothing the player did not press is removed (c4a2b, L6).
 */
export function withSuppressed(suppressed: Suppressed, id: string, now: number): Suppressed {
  return { ...suppressed, [id]: now };
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
export type CoachMapKey = "cards" | "suppressed";
type MapKey = CoachMapKey;
type Queued =
  | { key: "cards"; op: (cards: CoachCards) => CoachCards }
  | { key: "suppressed"; op: (suppressed: Suppressed) => Suppressed; leaveOut?: string };

/**
 * Where one key stands this run (c4a1c, F1), for the screens to word:
 * - `"loading"`: the load has not finished: its value is not known yet;
 * - `"read"`: what is in memory is what was stored (plus this run's presses);
 * - `"unreadable"`: its read failed, or what is stored is not a value this
 *   build reads: unknown for the rest of the run.
 */
export type CoachKeyState = "loading" | "read" | "unreadable";
export type CoachKeyStates = Readonly<Record<keyof CoachStored, CoachKeyState>>;

/**
 * What a writer did with the press, for the caller to say so:
 * - `"saved"`: in memory, and sent to the store;
 * - `"queued"`: made before the keys were read: in memory now, replayed onto
 *   what the load reads and saved then. `coachPressSettled(key)` says how it
 *   ended: `"notSaved"` when the key could not be read (the press holds for
 *   this run only) or the save failed (c4a1c, F4);
 * - `"unchanged"`: there was nothing to change (nothing written);
 * - `"notRead"`: the key could not be read this run, so a write would replace
 *   what is on disk unseen: nothing changed, nothing written.
 */
export type Written = "saved" | "queued" | "unchanged" | "notRead";

/** A key whose `storeLoad` failed, told apart from a key with nothing stored. */
const UNREAD: unique symbol = Symbol("unread");
let stored: CoachStored = COACH_STORED_DEFAULTS;
let loaded = false;
let loading: Promise<CoachStored> | null = null;
const listeners = new Set<() => void>();
/** Scalar keys (`suggestions`) written before the load finished: the press wins over what is read. */
const writtenEarly = new Set<keyof CoachStored>();
/** Map writes made before the load finished, in order. */
const queued: Queued[] = [];
/**
 * Keys whose read failed this run, or whose stored value is not one this
 * build reads: "unknown", not their default, for anything that would replace
 * them or show what they govern.
 */
const unread = new Set<keyof CoachStored>();
/**
 * Every goal a `saveGoal` replaced this run, by its text, as it was stored
 * (the raw value: its own date, and any field this build does not know), so
 * an Undo, or two in a row, brings each one back exactly (c4a1b L4, c4a1c F2
 * and F6). In memory only: nothing new is persisted.
 */
const replacedGoals = new Map<string, unknown>();
/** The goal's value as it is on disk now (the raw value read, then each one saved). */
let goalOnDisk: unknown = undefined;
/** The map keys as read (records only; `{}` otherwise), and which of their entries the reader kept (F6). */
const mapOnDisk: Record<MapKey, Record<string, unknown>> = { cards: {}, suppressed: {} };
const keptAtLoad: Record<MapKey, Set<string>> = { cards: new Set(), suppressed: new Set() };
/**
 * Each map entry as it was put in memory at the load (c4a2b, L6). An entry
 * whose value in memory is still this one was pressed by nobody, so it goes
 * back to disk exactly as it was read: a date in the future is not rewritten
 * clamped, an entry this build cannot read is not rewritten as "closed".
 */
const atLoad: Record<MapKey, Record<string, unknown>> = { cards: {}, suppressed: {} };
/**
 * What an entry this build cannot read stands for in memory (c4a2b, L6): it
 * fails CLOSED, as a whole key does. A card record read as dismissed until
 * asked, a noticed line read as left out. Never written: `mapForDisk` puts the
 * stored entry back as it was.
 */
const CLOSED_CARD: CardRecord = Object.freeze({ dismissed: CARD_DISMISSALS_TO_STOP, lastDismissed: null });
const CLOSED_SUPPRESSED = Number.POSITIVE_INFINITY;
/** The keys whose last press `coachPressSettled` follows: the two maps, the goal, Suggestions (c4a2b, L2) and the reminder. */
export type CoachSettledKey = CoachMapKey | "goal" | "suggestions" | "reminder";
/** The reminder's value as it is on disk now (the raw value read, then each one saved): its unknown fields survive a press. */
let reminderOnDisk: unknown = undefined;
/** Keys holding a press that is not on disk (unread at the load, or a failed save): F4. */
const unsaved = new Set<CoachSettledKey>();
/** The last save of each key, for `coachPressSettled`. */
const lastSave: Partial<Record<CoachSettledKey, Promise<void>>> = {};
let resets = 0;

const ALL_LOADING: CoachKeyStates = Object.freeze({
  suggestions: "loading",
  cards: "loading",
  goal: "loading",
  suppressed: "loading",
  reminder: "loading",
});
let keyStates: CoachKeyStates = ALL_LOADING;

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

/**
 * Each key's state now (c4a1c, F1): the same object until one changes, so it
 * can be a `useSyncExternalStore` snapshot beside `coachStored()`.
 */
export function coachKeyStates(): CoachKeyStates {
  const of = (key: keyof CoachStored): CoachKeyState => (!loaded ? "loading" : unread.has(key) ? "unreadable" : "read");
  const next = {
    suggestions: of("suggestions"),
    cards: of("cards"),
    goal: of("goal"),
    suppressed: of("suppressed"),
    reminder: of("reminder"),
  };
  const same = (Object.keys(next) as Array<keyof CoachStored>).every((key) => next[key] === keyStates[key]);
  if (!same) keyStates = Object.freeze(next);
  return keyStates;
}

/**
 * How the presses on a map key ended (c4a1c, F4), for a caller that was told
 * `"queued"`: once the load has finished and the key's last save has landed,
 * `"saved"` when what is on disk is what the player pressed, `"notSaved"` when
 * a press holds in memory only (the key could not be read, or its save failed).
 */
export function coachPressSettled(key: CoachSettledKey): Promise<"saved" | "notSaved"> {
  return loadCoachStored()
    .then(() => lastSave[key])
    .then(() => (unsaved.has(key) ? "notSaved" : "saved"));
}

/** Hear every change (for `useSyncExternalStore`); returns the unsubscribe. */
export function subscribeCoachStored(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Read the five keys once (later calls share the first). A key that cannot be
 * read is its default in memory and is marked unread (`coachStoredUnread`).
 * Writes nothing of its own: only a map press queued before it finished is
 * saved, replayed onto what was read. Every key is named as a literal at its
 * `storeLoad` / `storeSave`, so the parity manifest's scan finds it.
 */
export function loadCoachStored(): Promise<CoachStored> {
  const generation = resets;
  const failed: Array<keyof CoachStored> = [];
  const failedAs = (key: keyof CoachStored) => (): typeof UNREAD => {
    failed.push(key);
    return UNREAD;
  };
  loading ??= Promise.all([
    storeLoad<unknown>("coach.suggestions").catch(failedAs("suggestions")),
    storeLoad<unknown>("coach.cards").catch(failedAs("cards")),
    storeLoad<unknown>("coach.goal").catch(failedAs("goal")),
    storeLoad<unknown>("coach.suppressed").catch(failedAs("suppressed")),
    storeLoad<unknown>("coach.reminder").catch(failedAs("reminder")),
  ]).then(([rawSuggestions, rawCards, rawGoal, rawSuppressed, rawReminder]) => {
    if (generation !== resets) return stored; // a test reset since: this read is stale
    const now = Date.now();
    const raw = (v: unknown): unknown => (v === UNREAD ? undefined : v);
    // F6: there, but not a value this build reads: unknown, like a failed read, never replaced.
    const present = (v: unknown) => v !== UNREAD && v !== undefined && v !== null;
    if (present(rawSuggestions) && rawSuggestions !== "on" && rawSuggestions !== "asked") failed.push("suggestions");
    if (present(rawCards) && !isRecord(rawCards)) failed.push("cards");
    if (present(rawGoal) && readGoal(rawGoal) === null) failed.push("goal");
    if (present(rawSuppressed) && !isRecord(rawSuppressed)) failed.push("suppressed");
    if (present(rawReminder) && readReminderStrict(rawReminder) === null) failed.push("reminder");
    const next: CoachStored = {
      suggestions: readSuggestions(raw(rawSuggestions)),
      cards: readCards(raw(rawCards), now),
      goal: readGoal(raw(rawGoal)),
      suppressed: readSuppressed(raw(rawSuppressed), now),
      reminder: readReminder(raw(rawReminder)),
    };
    goalOnDisk = raw(rawGoal);
    reminderOnDisk = raw(rawReminder);
    mapOnDisk.cards = isRecord(rawCards) ? rawCards : {};
    mapOnDisk.suppressed = isRecord(rawSuppressed) ? rawSuppressed : {};
    keptAtLoad.cards = new Set(Object.keys(next.cards));
    keptAtLoad.suppressed = new Set(Object.keys(next.suppressed));
    // L6: an entry the reader dropped fails closed in memory (dismissed until asked, left out).
    const cardsIn: Record<string, CardRecord> = { ...next.cards };
    for (const id of Object.keys(mapOnDisk.cards)) if (!keptAtLoad.cards.has(id)) cardsIn[id] = CLOSED_CARD;
    const suppressedIn: Record<string, number> = { ...next.suppressed };
    for (const id of Object.keys(mapOnDisk.suppressed)) if (!keptAtLoad.suppressed.has(id)) suppressedIn[id] = CLOSED_SUPPRESSED;
    next.cards = cardsIn;
    next.suppressed = suppressedIn;
    atLoad.cards = { ...cardsIn };
    atLoad.suppressed = { ...suppressedIn };
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
      // Unread: the press holds for this run, and the disk keeps what it had (`coachPressSettled`: notSaved).
      if (unread.has(key)) {
        unsaved.add(key);
        console.error(`[coach.store] coach.${key} could not be read: an early press is not saved`);
      } else persistMap(key);
    }
    return stored;
  });
  return loading;
}

/** A failed write is logged; the value in memory stays what the player chose for this run. */
const notSaved = (key: string) => (err: unknown) => console.error(`[coach.store] ${key} not saved`, err);

/**
 * Follow one save of a scalar key (c4a2b, L2): a failure marks the key
 * "notSaved" for `coachPressSettled`, so the screen that made the press can
 * say the choice holds for this run only; the next save that lands clears it.
 */
function followSave(key: "goal" | "suggestions" | "reminder", saving: Promise<void>): void {
  lastSave[key] = saving.then(
    () => {
      unsaved.delete(key);
    },
    (err: unknown) => {
      unsaved.add(key);
      notSaved(`coach.${key}`)(err);
    },
  );
}

/** Settings → Coach's row and `set_setting`'s confirm. The whole value: once chosen, it is known. */
export function saveSuggestions(value: Suggestions): void {
  unread.delete("suggestions"); // before `set`, so a listener reads the key as known
  set({ ...stored, suggestions: value }, "suggestions");
  followSave("suggestions", storeSave("coach.suggestions", value));
}

/**
 * `set_goal`'s confirm (and its undo). `text` is trimmed and held to 200
 * characters. Null, and nothing written, when it is not a goal or when the
 * stored goal is not known (`coachGoalKnown`: not read yet, or its read
 * failed, or what is stored is not a goal this build reads): a goal nobody
 * has seen is never replaced. The text of any goal a call replaced this run
 * comes back exactly as it was stored, its own date included, but only on an
 * Undo (`restore`: the runner's undo of a receipt, c4a1b L4, c4a1c F2 and F6).
 * The same words typed again are a new press, dated `now` (c4a2b, L3): "You
 * said · date" is the day the player last said it.
 */
export function saveGoal(text: string, now: number, options: { restore?: boolean } = {}): CoachGoal | null {
  if (!coachGoalKnown()) return null;
  const trimmed = text.trim();
  const back = options.restore && replacedGoals.has(trimmed) ? replacedGoals.get(trimmed) : undefined;
  const goal = back !== undefined ? readGoal(back) : readGoal({ text, at: now });
  if (!goal) return null;
  // What goes to disk: the stored value as it was when it comes back, else the new goal.
  const value = back !== undefined ? back : goal;
  if (stored.goal !== null) replacedGoals.set(stored.goal.text, goalOnDisk);
  goalOnDisk = value;
  set({ ...stored, goal }, "goal");
  followSave("goal", storeSave("coach.goal", value));
  return goal;
}

/** What Settings → Coach's reminder row chooses: the whole reminder but its date. */
export type ReminderChoice = Pick<CoachReminder, "on" | "time" | "days">;

/**
 * Settings → Coach's reminder row, and nothing else (no tool, no card, no
 * clean-up ever calls it: the coach never switches the reminder on or off).
 * The row's own press is the whole value the player sees, so, as with
 * Suggestions, it is allowed over a value that could not be read; any field of
 * the stored object this build does not know is written back as it was.
 * Refused (null, nothing written) before the load has finished: the row's
 * controls wait for it, since turning it on keeps the stored time and days.
 * `since` is `now` when this press turns it on, kept while it stays on, null
 * when it goes off. Null too when the choice is not a reminder (a bad time or
 * day) or changes nothing.
 */
export function saveReminder(choice: ReminderChoice, now: number): CoachReminder | null {
  if (!loaded) return null;
  const was = stored.reminder;
  const known = !unread.has("reminder");
  const since = !choice.on ? null : known && was.on && was.since !== null ? was.since : now;
  const next = readReminderStrict({ on: choice.on, time: choice.time, days: [...choice.days], since });
  if (!next) return null;
  const same =
    known &&
    next.on === was.on &&
    next.time === was.time &&
    next.since === was.since &&
    next.days.length === was.days.length &&
    next.days.every((d, i) => d === was.days[i]);
  if (same) return null;
  const value: Record<string, unknown> = { ...(isRecord(reminderOnDisk) ? reminderOnDisk : {}), ...next, days: [...next.days] };
  reminderOnDisk = value;
  unread.delete("reminder"); // before `set`, so a listener reads the key as known
  set({ ...stored, reminder: next }, "reminder");
  followSave("reminder", storeSave("coach.reminder", value));
  return next;
}

/**
 * The map as it goes to disk (F6): the entries the reader dropped at the load,
 * as they were; then every entry in memory, a card record over its stored
 * record's own fields, so a field this build does not know survives a press.
 */
function mapForDisk(key: MapKey): Record<string, unknown> {
  const onDisk = mapOnDisk[key];
  const out: Record<string, unknown> = {};
  for (const [id, value] of Object.entries(onDisk)) if (!keptAtLoad[key].has(id)) out[id] = value;
  const now = key === "cards" ? stored.cards : stored.suppressed;
  const loadedAs = atLoad[key];
  for (const [id, value] of Object.entries(now)) {
    const was = onDisk[id];
    // Nobody pressed it since the load (L6): back exactly as it was read.
    if (Object.prototype.hasOwnProperty.call(loadedAs, id) && loadedAs[id] === value) {
      if (Object.prototype.hasOwnProperty.call(onDisk, id)) out[id] = was;
      continue;
    }
    out[id] = key === "cards" && isRecord(was) ? { ...was, ...(value as CardRecord) } : value;
  }
  return out;
}

function persistMap(key: MapKey): void {
  const value = mapForDisk(key);
  const saving = key === "cards" ? storeSave("coach.cards", value) : storeSave("coach.suppressed", value);
  lastSave[key] = saving.then(
    () => {
      unsaved.delete(key);
    },
    (err: unknown) => {
      unsaved.add(key);
      notSaved(`coach.${key}`)(err);
    },
  );
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
  return writeMap({ key: "suppressed", op: (suppressed) => withSuppressed(suppressed, id, now), leaveOut: id });
}

/**
 * Leave-out's Undo. Writes only when the line was left out. Before the load
 * (c4a1c, F3) it cancels this run's queued Leave out of that line and queues
 * nothing: the entry on disk, which nobody has seen yet, stays exactly as it
 * was. With no such press queued it does nothing ("unchanged").
 */
export function saveUnsuppressed(id: string): Written {
  if (!loaded) {
    const mine = (q: Queued) => q.key === "suppressed" && q.leaveOut === id;
    if (!queued.some(mine)) return "unchanged";
    for (let i = queued.length - 1; i >= 0; i -= 1) if (mine(queued[i])) queued.splice(i, 1);
    set({ ...stored, suppressed: withoutSuppressed(stored.suppressed, id) });
    return "queued";
  }
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
  replacedGoals.clear();
  goalOnDisk = undefined;
  reminderOnDisk = undefined;
  mapOnDisk.cards = {};
  mapOnDisk.suppressed = {};
  keptAtLoad.cards = new Set();
  keptAtLoad.suppressed = new Set();
  atLoad.cards = {};
  atLoad.suppressed = {};
  unsaved.clear();
  delete lastSave.cards;
  delete lastSave.suppressed;
  delete lastSave.goal;
  delete lastSave.suggestions;
  delete lastSave.reminder;
  keyStates = ALL_LOADING;
}
