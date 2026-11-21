/**
 * The coach's four stored keys (DESIGN 9.5), each with a typed reader and
 * writer, in the settings store (`settings.json`), never in SQLite.
 *
 * | Key | Holds | Default (missing, null or malformed) |
 * |---|---|---|
 * | `coach.suggestions` | `"on"` \| `"asked"` | `"on"` |
 * | `coach.cards` | per card kind: last shown, times dismissed, last dismissed | `{}` |
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
 * confirm, Leave out, Hide / Not now, Settings' row) or a rule DESIGN 6.6
 * names (a card shown is counted when it is shown). A stored `null`, a value
 * from a future build or a hand-edited file reads as the default and never
 * throws, so a player who never opens the coach sees no change at all.
 *
 * The readers the tool host calls are synchronous (a confirm is), so the
 * values are kept in memory after one load (`loadCoachStored`); until that
 * load has finished `coachStoredLoaded()` is false and the host answers
 * "not yet" rather than propose over a goal it has not read.
 */
import { storeLoad, storeSave } from "../ipc";

export type Suggestions = "on" | "asked";

/** One proactive card kind's record (DESIGN 6.6). Times are ms since the epoch. */
export type CardRecord = {
  /** When it was last shown; null: never. */
  lastShown: number | null;
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

/** One card record, or null when it is not one (dropped, not repaired). */
function readCard(raw: unknown): CardRecord | null {
  if (!isRecord(raw)) return null;
  const lastShown = raw.lastShown === null || raw.lastShown === undefined ? null : raw.lastShown;
  const lastDismissed = raw.lastDismissed === null || raw.lastDismissed === undefined ? null : raw.lastDismissed;
  const dismissed = raw.dismissed === undefined ? 0 : raw.dismissed;
  if (lastShown !== null && !isTime(lastShown)) return null;
  if (lastDismissed !== null && !isTime(lastDismissed)) return null;
  if (typeof dismissed !== "number" || !Number.isInteger(dismissed) || dismissed < 0) return null;
  return { lastShown, dismissed, lastDismissed };
}

export function readCards(raw: unknown): CoachCards {
  if (!isRecord(raw)) return COACH_STORED_DEFAULTS.cards;
  const out: Record<string, CardRecord> = {};
  for (const [kind, value] of Object.entries(raw)) {
    const card = readCard(value);
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

export function readSuppressed(raw: unknown): Suppressed {
  if (!isRecord(raw)) return COACH_STORED_DEFAULTS.suppressed;
  const out: Record<string, number> = {};
  for (const [id, at] of Object.entries(raw)) if (id.length > 0 && isTime(at)) out[id] = at;
  return out;
}

// ---------------------------------------------------------------------------
// The rules of DESIGN 6.6 and 6.7, pure
// ---------------------------------------------------------------------------

export function cardOf(cards: CoachCards, kind: string): CardRecord {
  return cards[kind] ?? { lastShown: null, dismissed: 0, lastDismissed: null };
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

export function withCardShown(cards: CoachCards, kind: string, now: number): CoachCards {
  return { ...cards, [kind]: { ...cardOf(cards, kind), lastShown: now } };
}

export function withCardDismissed(cards: CoachCards, kind: string, now: number): CoachCards {
  const card = cardOf(cards, kind);
  return { ...cards, [kind]: { ...card, dismissed: card.dismissed + 1, lastDismissed: now } };
}

/** The player asked for this kind: the dismissals stop counting against it. */
export function withCardAsked(cards: CoachCards, kind: string): CoachCards {
  const card = cardOf(cards, kind);
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

/** Leave-out's Undo: the line is back at once. */
export function withoutSuppressed(suppressed: Suppressed, id: string): Suppressed {
  const out = { ...suppressed };
  delete out[id];
  return out;
}

// ---------------------------------------------------------------------------
// The values in memory, the load, the writers
// ---------------------------------------------------------------------------

let stored: CoachStored = COACH_STORED_DEFAULTS;
let loaded = false;
let loading: Promise<CoachStored> | null = null;
const listeners = new Set<() => void>();
const writtenEarly = new Set<keyof CoachStored>();
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

/** Hear every change (for `useSyncExternalStore`); returns the unsubscribe. */
export function subscribeCoachStored(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Read the four keys once (later calls share the first). A key that cannot be
 * read is its default. Writes nothing. Every key is named as a literal at its
 * `storeLoad` / `storeSave`, so the parity manifest's scan finds it.
 */
export function loadCoachStored(): Promise<CoachStored> {
  const generation = resets;
  loading ??= Promise.all([
    storeLoad<unknown>("coach.suggestions").then(readSuggestions, () => readSuggestions(undefined)),
    storeLoad<unknown>("coach.cards").then(readCards, () => readCards(undefined)),
    storeLoad<unknown>("coach.goal").then(readGoal, () => readGoal(undefined)),
    storeLoad<unknown>("coach.suppressed").then(readSuppressed, () => readSuppressed(undefined)),
  ]).then(([suggestions, cards, goal, suppressed]) => {
    if (generation !== resets) return stored; // a test reset since: this read is stale
    // A key written before the load finished holds the newer value: keep it.
    const read: CoachStored = { suggestions, cards, goal, suppressed };
    const next = { ...read };
    for (const key of writtenEarly) (next as Record<keyof CoachStored, unknown>)[key] = stored[key];
    writtenEarly.clear();
    loaded = true;
    set(next);
    return stored;
  });
  return loading;
}

/** A failed write is logged; the value in memory stays what the player chose for this run. */
const notSaved = (key: string) => (err: unknown) => console.error(`[coach.store] ${key} not saved`, err);

/** Settings → Coach's row and `set_setting`'s confirm. */
export function saveSuggestions(value: Suggestions): void {
  set({ ...stored, suggestions: value }, "suggestions");
  void storeSave("coach.suggestions", value).catch(notSaved("coach.suggestions"));
}

/** `set_goal`'s confirm (and its undo). `text` is trimmed and held to 200 characters. */
export function saveGoal(text: string, now: number): CoachGoal | null {
  const goal = readGoal({ text, at: now });
  if (!goal) return null;
  set({ ...stored, goal }, "goal");
  void storeSave("coach.goal", goal).catch(notSaved("coach.goal"));
  return goal;
}

function saveCards(cards: CoachCards): void {
  set({ ...stored, cards }, "cards");
  void storeSave("coach.cards", cards).catch(notSaved("coach.cards"));
}

/** A card was shown (DESIGN 6.6 counts it). */
export function saveCardShown(kind: string, now: number): void {
  saveCards(withCardShown(stored.cards, kind, now));
}

/** "Hide" on a report, "Not now" on an offer. */
export function saveCardDismissed(kind: string, now: number): void {
  saveCards(withCardDismissed(stored.cards, kind, now));
}

/** The player asked for a card of this kind. Writes only when there were dismissals to clear. */
export function saveCardAsked(kind: string): void {
  const card = cardOf(stored.cards, kind);
  if (card.dismissed === 0 && card.lastDismissed === null) return;
  saveCards(withCardAsked(stored.cards, kind));
}

function saveSuppressedList(suppressed: Suppressed): void {
  set({ ...stored, suppressed }, "suppressed");
  void storeSave("coach.suppressed", suppressed).catch(notSaved("coach.suppressed"));
}

/** "Leave out" on a noticed line. Not a delete: every Take stays. */
export function saveSuppressed(id: string, now: number): void {
  saveSuppressedList(withSuppressed(stored.suppressed, id, now));
}

/** Leave-out's Undo. */
export function saveUnsuppressed(id: string): void {
  if (!(id in stored.suppressed)) return;
  saveSuppressedList(withoutSuppressed(stored.suppressed, id));
}

/** Tests only: forget what was loaded. */
export function resetCoachStored(): void {
  resets += 1;
  stored = COACH_STORED_DEFAULTS;
  loaded = false;
  loading = null;
  listeners.clear();
  writtenEarly.clear();
}
