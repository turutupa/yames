/**
 * The coach panel's state and the conversation, out of `useSession` (leg
 * c2a1). `useSession` is the tools' coach (Start, the feed, History); the
 * panel that shows it, and the question box that used to sit in its feed,
 * are the app's, and they live here for the app run.
 *
 * Mounted once, by `MainWindow` (`src/test/parity/doors.test.ts`): it
 * registers the one answerer the store calls.
 */
import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { coachGenerate } from "../../ipc";
import { getCoachModelSnapshot } from "../../hooks/coachLoader";
import { IS_MOBILE } from "../../platform";
import { askPrompt } from "./askContext";
import {
  appendAskTurn,
  askTurnId,
  closeAsk,
  dropDeferredAsk,
  getAskState,
  openAsk,
  openDeferredAsk,
  registerAskSender,
  setAskSection,
  setAskTakeGate,
  toggleAsk,
  updateAskTurn,
  useAskState,
  type AskRequest,
  type AskSection,
} from "./askStore";

/**
 * Answer one typed question, honestly.
 *
 * A phone has no model, and a computer with the selector on Off (or a model
 * still loading) has none ready: the app says so in one line and fakes no
 * answer. With a model ready the question goes to it exactly as the old chat
 * sent it (`coach_generate`, kind `chat`, its timeout and the Rust side's
 * formatting); an empty or failed answer is said to be one.
 */
export async function answerAsk(question: string, t: TFunction, contextText: () => string): Promise<void> {
  const q = question.trim();
  if (!q) return;
  const before = getAskState().turns;
  appendAskTurn({ id: askTurnId(), kind: "user", text: q });
  if (IS_MOBILE) {
    appendAskTurn({ id: askTurnId(), kind: "app", text: t("ask.reply.phone") });
    return;
  }
  const model = getCoachModelSnapshot().state;
  if (model !== "ready") {
    const key = model === "loading" || model === "waiting" ? "ask.reply.gettingReady" : "ask.reply.noModel";
    appendAskTurn({ id: askTurnId(), kind: "app", text: t(key) });
    return;
  }
  const id = askTurnId();
  appendAskTurn({ id, kind: "coach", text: "", pending: true });
  let answer = "";
  try {
    answer = (await coachGenerate("chat", askPrompt(contextText(), before, q)))?.trim() ?? "";
  } catch {
    answer = "";
  }
  updateAskTurn(
    id,
    answer ? { id, kind: "coach", text: answer } : { id, kind: "app", text: t("ask.reply.nothing") },
  );
}

export type CoachPanel = {
  open: boolean;
  section: AskSection;
  deferred: boolean;
  toggle: (request?: AskRequest) => void;
  show: (request?: AskRequest) => void;
  close: () => void;
  setSection: (section: AskSection) => void;
};

/**
 * The panel, for the host. `contextText` is called when a question is sent
 * (never in a render): the context the model reads, `contextForModel`'s text.
 */
export function useCoachPanel({ contextText }: { contextText: () => string }): CoachPanel {
  const { t } = useTranslation();
  const { open, section, deferred } = useAskState();
  const latest = useRef(contextText);
  latest.current = contextText;
  useEffect(
    () => registerAskSender((question) => void answerAsk(question, t, () => latest.current())),
    [t],
  );
  const close = useCallback(() => closeAsk(), []);
  return { open, section, deferred, toggle: toggleAsk, show: openAsk, close, setSection: setAskSection };
}

/**
 * The drawer in a Session (DESIGN 3.3, 3.4).
 *
 * - Nothing of Ask exists while a Take runs: the store will not open, and a
 *   panel that was open closes as the Take starts (Start take closes it).
 * - The Ask key pressed during a Take opens the panel on the result.
 * - It closes on anything that sounds (Hear it, a timed step starting, a
 *   loop): the click starting while it is open.
 * - A timed step (warm-up, jam, finisher) pauses when Ask opens over it; an
 *   Exercise step's clock keeps running.
 */
export function useAskSessionRules({
  inSession,
  takeRunning,
  timedRunning,
  pauseTimed,
  sounding,
  open,
  deferred,
}: {
  inSession: boolean;
  /** A Take's count-in, the Take, or the result being worked out. */
  takeRunning: boolean;
  /** A timed step is playing and not paused. */
  timedRunning: boolean;
  pauseTimed: () => void;
  /** The engine is playing (the click, a demo). */
  sounding: boolean;
  open: boolean;
  deferred: boolean;
}): void {
  const gate = useRef(false);
  gate.current = inSession && takeRunning;
  useEffect(() => {
    setAskTakeGate(() => gate.current);
    return () => setAskTakeGate(() => false);
  }, []);

  // A Take starts: the drawer goes.
  useEffect(() => {
    if (inSession && takeRunning && open) closeAsk({ restoreFocus: false });
  }, [inSession, takeRunning, open]);

  // The Take is over: a deferred open happens now. Off the Session it is forgotten.
  useEffect(() => {
    if (!deferred) return;
    if (!inSession) dropDeferredAsk();
    else if (!takeRunning) openDeferredAsk();
  }, [deferred, inSession, takeRunning]);

  // Opened over a running timed step: the step pauses.
  const wasOpen = useRef(open);
  const latestPause = useRef({ timedRunning, pauseTimed });
  latestPause.current = { timedRunning, pauseTimed };
  useEffect(() => {
    if (open && !wasOpen.current && inSession && latestPause.current.timedRunning) latestPause.current.pauseTimed();
    wasOpen.current = open;
  }, [open, inSession]);

  // Something starts sounding in the Session while it is open: it closes.
  const wasSounding = useRef(sounding);
  useEffect(() => {
    if (sounding && !wasSounding.current && inSession && open) closeAsk({ restoreFocus: false });
    wasSounding.current = sounding;
  }, [sounding, inSession, open]);
}
