/**
 * The proactive card of this app run, shared by the places that show it:
 * Progress (the card itself) and the rail and the phone's tab bar (the dot).
 *
 * `useCompanionWatch` runs once, in MainWindow, beside the Session's own
 * hook: when the stored Takes, the Paths, grading or the coach's keys change
 * (never per beat: none of them changes during a Take), it works out what is
 * on offer (the weekly look-back, the plateau question; milestones are
 * c4b3's) and asks the one-card budget (`cardBudget.ts`) which one this run
 * shows. Everything is kept in memory: nothing here writes to the store.
 *
 * The dot (DESIGN 6.6): the look-back, or a plateau question, is waiting on
 * Progress. No count, no notification. Gone once Progress has shown the card
 * this run (`markCompanionSeen`); being seen is not stored (c4a1b), so it can
 * return on the next app open until the player hides the card.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { PathDoc } from "../paths/format";
import type { PlayerProgress } from "../session/progress";
import { cardForThisRun, type CardOffer } from "./cardBudget";
import { plateausNow, type Plateau } from "./nudges";
import { coachKeyStates, coachStored, loadCoachStored, subscribeCoachStored } from "./store";
import { lookBack, type LookBack } from "./weekly";
import type { Weekday } from "../session/totals";

export type CompanionState = {
  /** The card this run shows, or null. */
  card: CardOffer | null;
  /** The look-back as the watch computed it (no long view: milestones need Progress's read). */
  look: LookBack | null;
  /** The newest plateau now, graded only. */
  plateau: Plateau | null;
  /** Progress has shown the card this run. */
  seen: boolean;
};

const EMPTY: CompanionState = Object.freeze({ card: null, look: null, plateau: null, seen: false });
let state: CompanionState = EMPTY;
const listeners = new Set<() => void>();
/** Plateau episodes answered this run (memory only). */
const answered = new Set<string>();

function publish(next: CompanionState): void {
  if (next.card === state.card && next.look === state.look && next.plateau === state.plateau && next.seen === state.seen) return;
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function companionState(): CompanionState {
  return state;
}

export function useCompanion(): CompanionState {
  return useSyncExternalStore(subscribe, companionState);
}

/** The dot on the Progress entry: a card waits there and Progress has not shown it this run. */
export function useProgressDot(): boolean {
  const s = useCompanion();
  return s.card !== null && !s.seen;
}

export function markCompanionSeen(): void {
  if (state.card && !state.seen) publish({ ...state, seen: true });
}

/** A plateau question was answered (any of its three buttons): not asked again this run. */
export function answerPlateau(key: string): void {
  answered.add(key);
}

export function plateauAnswered(key: string): boolean {
  return answered.has(key);
}

/** The offers and the card, pure (the watch's body, for tests). */
export function companionFor(
  progress: PlayerProgress,
  paths: readonly PathDoc[],
  graded: boolean,
  weekStart: Weekday,
  now: number,
): { look: LookBack | null; plateau: Plateau | null; offers: CardOffer[] } {
  const look = lookBack({ progress, paths, spans: null, now, weekStart, graded, goal: coachStored().goal });
  const plateau = plateausNow(progress, paths, now, graded).find((p) => !answered.has(p.key)) ?? null;
  const offers: CardOffer[] = [];
  if (look) offers.push({ kind: "weekly", key: `weekly@${look.start}` });
  if (plateau) offers.push({ kind: "plateau", key: plateau.key });
  return { look, plateau, offers };
}

/**
 * MainWindow's `blocked` (c4b2's review, L8): the Session's view, any phase of
 * a run but "idle" (a count-in, a Take, the recap: the shell's `holdNudges`
 * rule), or the wizard. Whatever the view, nothing recomputes while a run is on.
 */
export function companionBlocked(at: { inSession: boolean; phase: string; wizardOpen: boolean }): boolean {
  return at.inSession || at.phase !== "idle" || at.wizardOpen;
}

/**
 * MainWindow's one call. `blocked`: a Session runs, or the wizard is open:
 * nothing proactive is offered then (DESIGN 6.6), and nothing is spent.
 */
export function useCompanionWatch(
  progress: PlayerProgress,
  paths: readonly PathDoc[],
  graded: boolean,
  weekStart: Weekday,
  blocked: boolean,
): void {
  const stored = useSyncExternalStore(subscribeCoachStored, coachStored);
  const states = useSyncExternalStore(subscribeCoachStored, coachKeyStates);
  useEffect(() => {
    void loadCoachStored().catch(() => {});
  }, []);
  useEffect(() => {
    if (blocked) return;
    const now = Date.now();
    const { look, plateau, offers } = companionFor(progress, paths, graded, weekStart, now);
    const card = cardForThisRun(offers, stored, states, now);
    const same = card !== null && state.card !== null && card.kind === state.card.kind && card.key === state.card.key;
    publish({ card: same ? state.card : card, look, plateau, seen: same ? state.seen : false });
  }, [progress, paths, graded, weekStart, blocked, stored, states]);
}

/** Tests only. */
export function resetCompanion(): void {
  state = EMPTY;
  answered.clear();
  listeners.clear();
}
