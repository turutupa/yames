/**
 * Ask's state: whether the one coach panel is open, which of its sections is
 * showing, and the conversation (DESIGN 3.2, 3.3, 5.1).
 *
 * Module state, not component state, for three reasons. The conversation
 * lives for the app run and must survive the panel being closed, the screen
 * changing and the panel's shape changing (dock, drawer, sheet). Anything in
 * the app may open Ask (the rail, the phone's header, the Session bar, a key,
 * a "?" chip on a coach note) without a prop being threaded down to it:
 * `askCoach` below is that one function. And `useSession` (the tools' coach)
 * opens the panel when the player presses its Start, which it used to do
 * with a `cardOpen` state of its own.
 *
 * Nothing here talks to the model. The host (`useCoachPanel`) registers the
 * function that answers a question; this file only keeps the turns.
 */
import { useSyncExternalStore } from "react";

/** "ask": the conversation. "tools": the tools' coach (Start, Feed, History) until c2a2. */
export type AskSection = "ask" | "tools";

export type AskTurn =
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
};

/** The function a coach line, note or chip is given as its `onAsk`. */
export type AskHandler = (request?: AskRequest) => void;

export type AskState = {
  open: boolean;
  section: AskSection;
  turns: readonly AskTurn[];
  /** The Ask key was pressed during a Take: the panel opens on the result. */
  deferred: boolean;
  /** Bumped when the text box should take focus. */
  focusSeq: number;
  /** The screen the last turn or divider was written on, for the next divider. */
  screenKey: string | null;
};

const INITIAL: AskState = {
  open: false,
  section: "ask",
  turns: [],
  deferred: false,
  focusSeq: 0,
  screenKey: null,
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
    section: "ask",
    deferred: false,
    focusSeq: request.focus ? state.focusSeq + 1 : state.focusSeq,
  });
  if (request.question?.trim()) sender?.(request.question.trim());
}

/** For a coach line, note or chip (`onAsk`): open Ask, the caret in its box. */
export const askCoach: AskHandler = (request) => openAsk({ focus: true, ...request });

/** Close Ask; focus goes back to what opened it, when it is still there. */
export function closeAsk(options: { restoreFocus?: boolean } = {}): void {
  if (!state.open && !state.deferred) return;
  set({ open: false, deferred: false });
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

/** The tools' coach was started by the player's own press: show its section. */
export function showToolsCoach(): void {
  if (!state.open) returnFocus = activeElement();
  set({ open: true, section: "tools", deferred: false });
}

export function setAskSection(section: AskSection): void {
  if (state.section !== section) set({ section });
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
  set({ turns: state.turns.map((t) => (t.id === id ? next : t)) });
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
  nextId = 0;
  for (const l of [...listeners]) l();
}
