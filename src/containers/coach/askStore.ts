/**
 * Ask's state: whether the one coach panel is open, which of its sections is
 * showing, and the conversation (DESIGN 3.2, 3.3, 5.1).
 *
 * Module state, not component state, for three reasons. The conversation
 * lives for the app run and must survive the panel being closed, the screen
 * changing and the panel's shape changing (dock, drawer, sheet). Anything in
 * the app may open Ask (the rail, the phone's header, the Session bar, a key,
 * a "?" chip on a coach note) without a prop being threaded down to it:
 * `askCoach` below is that one function. Since leg c2a2 Ask is only Ask: the
 * tools' coach (Listen, its line and its note) opens no panel, and its old
 * History is on Progress → Tool runs.
 *
 * Nothing here talks to the model. The host (`useCoachPanel`) registers the
 * function that answers a question; this file only keeps the turns.
 */
import { useSyncExternalStore } from "react";
import type { PathTakeRow } from "../../ipc";
import type { PathDoc } from "../../paths/format";
import type { ToolBody } from "./askTools";
import type { CardBody } from "./askCards";

export type AskTurn =
  /** What a tool did, would do, could not do, or will not do (leg t1b1, `askTools.ts`). */
  | { id: string; kind: "tool"; body: ToolBody }
  /** A fact card the app wrote from what it measured (leg c2b1a, `askCards.ts`). */
  | { id: string; kind: "card"; card: CardBody }
  | { id: string; kind: "user"; text: string }
  /** The model's words. `pending` while it is still writing them. */
  | { id: string; kind: "coach"; text: string; pending?: boolean }
  /** The app saying something true about Ask itself (no model, nothing came back). */
  | { id: string; kind: "app"; text: string }
  /** "Now looking at: Progress": the screen changed mid-conversation. */
  | { id: string; kind: "divider"; text: string };

/** What an entry point opens Ask with. */
export type AskRequest = {
  /** Asked at once, as if typed. */
  question?: string;
  /** Focus goes back here when the panel closes. Defaults to what had focus. */
  from?: Element | null;
  /** Put the caret in the text box (a keyboard or a question opened it). */
  focus?: boolean;
  /**
   * What the question is about: the coach's sentence that was tapped, or a
   * bar of the strip ("Bar 5 slipped"). Shown in the panel and given to the
   * model with the next question; cleared by any open without one.
   */
  about?: string;
  /** Which tab it opens on (leg c4a2). Any open without one opens on Ask. */
  tab?: AskTab;
};

/** Ask's two tabs (DESIGN 6.7, mock 10): the conversation, and the Notebook. */
export type AskTab = "ask" | "notebook";

/** The function a coach line, note or chip is given as its `onAsk`. */
export type AskHandler = (request?: AskRequest) => void;

export type AskState = {
  open: boolean;
  turns: readonly AskTurn[];
  /** The Ask key was pressed during a Take: the panel opens on the result. */
  deferred: boolean;
  /**
   * An open asked for the caret in the text box, and the panel has not taken
   * it yet. Consumed once (`consumeAskFocus`): an open that did not ask for
   * focus (the deferred open after a Take, `C`) never takes it, so Space and
   * Enter keep driving the Session.
   */
  focusPending: boolean;
  /** What the player opened Ask about (`AskRequest.about`), or null. */
  about: string | null;
  /** The screen the last turn or divider was written on, for the next divider. */
  screenKey: string | null;
  /** The tab showing (leg c4a2). A question, a caret or an "about" always opens on Ask. */
  tab: AskTab;
};

const INITIAL: AskState = {
  open: false,
  turns: [],
  deferred: false,
  focusPending: false,
  about: null,
  screenKey: null,
  tab: "ask",
};

let state: AskState = INITIAL;
const listeners = new Set<() => void>();
let returnFocus: Element | null = null;
let sender: ((question: string) => void) | null = null;
/** Whether a Take is running now: the host says (`setAskTakeGate`). */
let takeRunning: () => boolean = () => false;
let nextId = 0;

function set(patch: Partial<AskState>) {
  state = { ...state, ...patch };
  for (const l of [...listeners]) l();
}

export function getAskState(): AskState {
  return state;
}

export function subscribeAsk(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The panel's state in a component. Re-renders only when it changes. */
export function useAskState(): AskState {
  return useSyncExternalStore(subscribeAsk, getAskState, getAskState);
}

export function askTurnId(): string {
  nextId += 1;
  return `ask-${nextId}`;
}

/**
 * Open Ask. During a Take nothing opens: the request is remembered and the
 * panel opens on the result (DESIGN 3.4), and the question, if any, is
 * dropped rather than answered over the playing.
 */
export function openAsk(request: AskRequest = {}): void {
  if (takeRunning()) {
    if (!state.deferred) set({ deferred: true });
    return;
  }
  if (!state.open) {
    const from = request.from === undefined ? activeElement() : request.from;
    // Focus that is already inside the panel is not where to come back to.
    returnFocus = from && !(from instanceof Element && from.closest("[data-ask-panel]")) ? from : null;
  }
  set({
    open: true,
    deferred: false,
    focusPending: request.focus === true,
    about: request.about?.trim() || null,
    tab: request.tab ?? "ask",
  });
  if (request.question?.trim()) sender?.(request.question.trim());
}

/** The tab strip's press (leg c4a2). Writes nothing anywhere but this module. */
export function setAskTab(tab: AskTab): void {
  if (state.tab !== tab) set({ tab });
}

/**
 * What the Notebook is built from (leg c4a2), read once when its tab opens:
 * the stored Takes, the Paths (for an Exercise's notes and title), and, in a
 * Session, when it began (DESIGN 6.6: nothing proactive in a Session, and the
 * Notebook says nothing new about the Takes of the Session under it).
 */
export type NotebookSource = {
  rows: readonly PathTakeRow[];
  paths: readonly PathDoc[];
  /** The Session's start (ms) while one is open, else null. */
  sessionStartedAt: number | null;
};

/**
 * A question typed and not sent, kept while the Notebook's tab shows (c4a2b,
 * L4): the Ask tab's box unmounts there and reads it back when it returns.
 * Memory only, never stored, and no listener hears it (no render per key).
 */
let keptDraft = "";

export function askDraft(): string {
  return keptDraft;
}

export function keepAskDraft(text: string): void {
  keptDraft = text;
}

let notebookSource: (() => NotebookSource) | null = null;

/** The host (`useAskHost`) says where the Takes are; read at the tab's open, never per beat. */
export function registerNotebookSource(fn: (() => NotebookSource) | null): () => void {
  notebookSource = fn;
  return () => {
    if (notebookSource === fn) notebookSource = null;
  };
}

/** The Notebook's input now, or null without a host. */
export function readNotebookSource(): NotebookSource | null {
  return notebookSource ? notebookSource() : null;
}

/** For a coach line, note or chip (`onAsk`): open Ask, the caret in its box. */
export const askCoach: AskHandler = (request) => openAsk({ focus: true, ...request });

/** Close Ask; focus goes back to what opened it, when it is still there. */
export function closeAsk(options: { restoreFocus?: boolean } = {}): void {
  if (!state.open && !state.deferred) return;
  set({ open: false, deferred: false, focusPending: false, about: null });
  const target = returnFocus;
  returnFocus = null;
  if (options.restoreFocus !== false && target instanceof HTMLElement && target.isConnected) {
    target.focus({ preventScroll: true });
  }
}

export function toggleAsk(request: AskRequest = {}): void {
  if (state.open) closeAsk();
  else openAsk(request);
}

/** The panel took (or could not take) the focus it was asked for. */
export function consumeAskFocus(): void {
  if (state.focusPending) set({ focusPending: false });
}

/** The host says whether a Take is running; the store asks before opening. */
export function setAskTakeGate(running: () => boolean): void {
  takeRunning = running;
}

/** A deferred open, once the Take is over: open it now. */
export function openDeferredAsk(): void {
  if (!state.deferred || takeRunning()) return;
  set({ deferred: false });
  openAsk();
}

/** Forget a deferred open (the Session ended before its result). */
export function dropDeferredAsk(): void {
  if (state.deferred) set({ deferred: false });
}

/** The host's answerer. One at a time; the last registration wins. */
export function registerAskSender(fn: ((question: string) => void) | null): () => void {
  sender = fn;
  return () => {
    if (sender === fn) sender = null;
  };
}

/** Ask the registered answerer, as the text box does. */
export function sendAsk(question: string): void {
  if (question.trim()) sender?.(question.trim());
}

export function appendAskTurn(turn: AskTurn, screenKey?: string | null): void {
  set({ turns: [...state.turns, turn], ...(screenKey !== undefined ? { screenKey } : {}) });
}

export function updateAskTurn(id: string, next: AskTurn): void {
  if (!state.turns.some((t) => t.id === id)) return;
  set({ turns: state.turns.map((t) => (t.id === id ? next : t)) });
}

/**
 * What to write: a whole turn, or a change applied to the turn as it is when
 * it is written (so a held change does not undo what happened to the turn
 * while it was held; review t1b1 N3). The change returns null to leave it be.
 */
export type AskTurnChange = AskTurn | ((current: AskTurn) => AskTurn | null);

function applyAskTurn(id: string, next: AskTurnChange): void {
  if (typeof next !== "function") {
    updateAskTurn(id, next);
    return;
  }
  const current = state.turns.find((t) => t.id === id);
  if (!current) return;
  const out = next(current);
  if (out) updateAskTurn(id, out);
}

/** Answers that came back while a Take ran, applied when it ends. */
let held: Array<{ id: string; next: AskTurnChange }> = [];

/**
 * An answer arriving: applied now, or, while a Take runs, held until it ends.
 * Nothing of Ask commits during a Take (a store change re-renders the window).
 * A held answer whose turn is gone by then (the conversation was cleared) is
 * dropped. The generation itself still runs to its end: cancelling it is the
 * next model leg's (`cancel_generation`, leg c3a).
 */
export function settleAskTurn(id: string, next: AskTurnChange): void {
  if (takeRunning()) {
    held.push({ id, next });
    return;
  }
  applyAskTurn(id, next);
}

/** The Take is over: apply what was held during it. */
export function releaseHeldAsk(): void {
  if (held.length === 0 || takeRunning()) return;
  const pending = held;
  held = [];
  for (const { id, next } of pending) applyAskTurn(id, next);
}

/**
 * The screen the panel is looking at now. A conversation that was written on
 * another screen gets a divider first ("Now looking at: Progress").
 */
export function noteAskScreen(key: string, dividerText: string): void {
  if (state.screenKey === key) return;
  if (state.turns.length > 0 && state.screenKey !== null) {
    appendAskTurn({ id: askTurnId(), kind: "divider", text: dividerText }, key);
  } else {
    set({ screenKey: key });
  }
}

function activeElement(): Element | null {
  return typeof document === "undefined" ? null : document.activeElement;
}

/** Tests only. */
export function __resetAskStoreForTests(): void {
  state = INITIAL;
  returnFocus = null;
  sender = null;
  takeRunning = () => false;
  held = [];
  nextId = 0;
  notebookSource = null;
  keptDraft = "";
  for (const l of [...listeners]) l();
}
