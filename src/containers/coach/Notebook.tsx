/**
 * The Notebook: Ask's second tab (DESIGN 6.7, mocks 10 and 17; leg c4a2).
 *
 * Two lists and an empty state: "What I've noticed" (the tendencies of
 * `notebookFrom`, each with its evidence line and a Leave out) and "What
 * you're working toward" (the goal, set and edited through `set_goal`, so the
 * receipt and its Undo are the runner's).
 *
 * Built on demand: the stored Takes are read once, when the tab opens
 * (`readNotebookSource`), and the book is computed from them and the coach's
 * stored keys, again only when one of those keys changes (a press). Never per
 * beat, and never during a Take: Ask is not mounted then.
 *
 * Nothing is stored without a press. Leave out stores a suppression (with an
 * Undo for a few seconds); it deletes nothing, and every Take stays. The goal
 * question is asked as an offer with "Not now" (counted in `coach.cards`),
 * never in a Session. "A card was shown" is not stored.
 *
 * The read side fails closed: a key still loading shows nothing it governs
 * ("a moment"), and a key that could not be read says so, shows no line and
 * never asks the goal question.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { notebookFrom, type Notebook as Book } from "../../coach/notebook";
import {
  coachKeyStates,
  coachPressSettled,
  coachStored,
  coachStoredLoaded,
  GOAL_MAX_CHARS,
  loadCoachStored,
  saveCardDismissed,
  saveSuppressed,
  saveUnsuppressed,
  subscribeCoachStored,
  type CoachMapKey,
  type Written,
} from "../../coach/store";
import { playedOf, type NoticedLine } from "../../coach/tendencies";
import { IS_MOBILE } from "../../platform";
import { readNotebookSource, useAskState, type NotebookSource } from "./askStore";
import { onePress, pressProposal, runAskCall } from "./askTools";
import { AskToolTurn } from "./AskToolTurn";

/** How long Leave out's Undo is offered (DESIGN 6.6: "a few seconds"). */
export const LEAVE_OUT_UNDO_MS = 10_000;

/** The goal question's four starters (DESIGN 6.7): a press puts the words in the box. */
const GOAL_STARTERS = ["song", "tempo", "style", "justPlaying"] as const;

const NO_SOURCE: NotebookSource = { rows: [], paths: [], sessionStartedAt: null };

/** "11 Nov" in the locale's own order and month name. */
function dayOf(ms: number, lang: string): string {
  try {
    return new Intl.DateTimeFormat(lang, { day: "numeric", month: "short" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}

/** The input read once at the tab's open: in a Session, only Takes stored before it began. */
function sourceAtOpen(): NotebookSource {
  const source = readNotebookSource() ?? NO_SOURCE;
  const since = source.sessionStartedAt;
  return since === null ? source : { ...source, rows: source.rows.filter((r) => r.startedAt < since) };
}

/** A press's outcome, as a line the panel can say (null: nothing to say). */
type Said = "notRead" | "notSaved" | null;

/** Follow a press on a map key to its end: "notSaved" when it holds for this run only. */
function follow(written: Written, key: CoachMapKey, onEnd: (said: Said) => void): Said {
  if (written === "notRead") return "notRead";
  if (written === "saved" || written === "queued") {
    void coachPressSettled(key).then((end) => {
      if (end === "notSaved") onEnd("notSaved");
    });
  }
  return null;
}

export function Notebook() {
  const { t, i18n } = useTranslation();
  const stored = useSyncExternalStore(subscribeCoachStored, coachStored, coachStored);
  const states = useSyncExternalStore(subscribeCoachStored, coachKeyStates, coachKeyStates);
  // Read once, when the tab opens: the Takes and the clock do not move under it.
  const [source] = useState(sourceAtOpen);
  const [now] = useState(() => Date.now());
  const inSession = source.sessionStartedAt !== null;

  useEffect(() => {
    if (!coachStoredLoaded()) void loadCoachStored().catch(() => {});
  }, []);

  const book: Book = useMemo(
    () => notebookFrom(source.rows, stored, states, now, source.paths),
    [source, stored, states, now],
  );
  // The Takes `tooFewTakes` counts (what Progress counts), for "Takes so far".
  const played = useMemo(() => playedOf(source.rows).length, [source]);

  return (
    <div className="ask-thread nb" data-testid="notebook" role="tabpanel" aria-label={t("notebook.ui.tabNotebook")}>
      {inSession && (
        <p className="nb-note" data-testid="nb-session-note">
          {t("notebook.ui.sessionNote")}
        </p>
      )}
      <Noticed book={book} lang={i18n.language} played={played} />
      <Goal book={book} lang={i18n.language} offer={book.askGoal && !inSession} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// What I've noticed
// ---------------------------------------------------------------------------

type LeftOut = { line: NoticedLine; until: number };

function Noticed({ book, lang, played }: { book: Book; lang: string; played: number }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState<LeftOut | null>(null);
  const [said, setSaid] = useState<Said>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);

  // The Undo goes after a few seconds: one timer per press, never per beat.
  useEffect(() => {
    if (!left) return;
    const id = window.setTimeout(() => {
      if (mounted.current) setLeft((cur) => (cur === left ? null : cur));
    }, Math.max(0, left.until - Date.now()));
    return () => window.clearTimeout(id);
  }, [left]);

  const leaveOut = (line: NoticedLine) => {
    const pressedAt = Date.now();
    const written = saveSuppressed(line.id, pressedAt);
    const first = follow(written, "suppressed", (end) => {
      if (mounted.current) setSaid(end);
    });
    if (first === "notRead") {
      setSaid("notRead");
      return;
    }
    setSaid(null);
    setLeft({ line, until: pressedAt + LEAVE_OUT_UNDO_MS });
  };

  const undo = () => {
    if (!left) return;
    saveUnsuppressed(left.line.id);
    setLeft(null);
  };

  const state = book.noticedState;
  let body: React.ReactNode;
  if (state === "loading") {
    body = <p className="nb-empty" data-testid="nb-noticed-loading">{t("notebook.ui.loading")}</p>;
  } else if (state === "unreadable") {
    body = <p className="nb-empty" data-testid="nb-noticed-unreadable">{t("notebook.ui.noticedUnreadable")}</p>;
  } else if (book.noticed.length === 0) {
    body = book.tooFewTakes ? (
      <p className="nb-empty" data-testid="nb-too-few">
        {t("notebook.ui.tooFewTakes", { count: played })}
      </p>
    ) : (
      <p className="nb-empty" data-testid="nb-nothing-yet">
        {t("notebook.ui.nothingYet", { count: book.takesRead })}
      </p>
    );
  } else {
    body = (
      <>
        <ul className="nb-list" data-testid="nb-noticed">
          {book.noticed.map((line) => (
            <li key={line.id} className="nb-item" data-line={line.id}>
              <p className="nb-text">{t(line.key, line.values)}</p>
              <small className="nb-evidence">
                {t(line.evidence.key, {
                  ...line.evidence.values,
                  from: dayOf(line.from, lang),
                  to: dayOf(line.to, lang),
                })}
              </small>
              <button
                type="button"
                className="nb-leave"
                aria-label={t("notebook.ui.leaveOut")}
                title={t("notebook.ui.leaveOut")}
                data-testid="nb-leave-out"
                onClick={onePress(() => leaveOut(line))}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="M6 7l1 13h10l1-13" />
                </svg>
                {IS_MOBILE && <span className="nb-leave-label">{t("notebook.ui.leaveOut")}</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="nb-empty">{t("notebook.ui.leaveOutHint")}</p>
      </>
    );
  }

  return (
    <section className="nb-section" aria-labelledby="nb-noticed-h">
      <h3 className="nb-h" id="nb-noticed-h">
        {t("notebook.ui.noticedTitle")}
      </h3>
      {left && (
        <p className="nb-status" role="status" data-testid="nb-left-out">
          <span>{t("notebook.ui.leftOut")}</span>
          <button type="button" className="nb-quiet" onClick={onePress(undo)} data-testid="nb-undo">
            {t("notebook.ui.undo")}
          </button>
        </p>
      )}
      {said && (
        <p className="nb-status" role="status" data-testid={`nb-said-${said}`}>
          {t(said === "notRead" ? "notebook.ui.leftOutNotRead" : "notebook.ui.notSaved")}
        </p>
      )}
      {body}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What you're working toward
// ---------------------------------------------------------------------------

function Goal({ book, lang, offer }: { book: Book; lang: string; offer: boolean }) {
  const { t } = useTranslation();
  const { turns } = useAskState();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [turnId, setTurnId] = useState<string | null>(null);
  const [notNow, setNotNow] = useState<"done" | Said>(null);
  const mounted = useRef(true);
  useEffect(() => () => void (mounted.current = false), []);
  const inputRef = useRef<HTMLInputElement>(null);

  const turn = turnId ? turns.find((x) => x.id === turnId) : undefined;

  const startEdit = () => {
    setDraft(book.goal?.text ?? "");
    setEditing(true);
    setTurnId(null);
  };
  useEffect(() => {
    if (editing) inputRef.current?.focus({ preventScroll: true });
  }, [editing]);

  // Save is the press: the runner proposes set_goal and the same press confirms
  // it, so the receipt and its Undo are the runner's (written in the thread too).
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const id = runAskCall({ tool: "set_goal", args: { text } }, "");
    pressProposal(id);
    setTurnId(id);
    setEditing(false);
  };

  const dismiss = () => {
    const written = saveCardDismissed("goal", Date.now());
    const first = follow(written, "cards", (end) => {
      if (mounted.current) setNotNow(end);
    });
    setNotNow(first ?? "done");
  };

  const state = book.goalState;
  let body: React.ReactNode;
  if (state === "loading") {
    body = <p className="nb-empty" data-testid="nb-goal-loading">{t("notebook.ui.loading")}</p>;
  } else if (state === "unreadable") {
    body = <p className="nb-empty" data-testid="nb-goal-unreadable">{t("notebook.ui.goalUnreadable")}</p>;
  } else if (editing || (offer && notNow === null && !turn)) {
    const asking = !editing;
    body = (
      <form className="nb-goal-form" onSubmit={save} data-testid={asking ? "nb-goal-offer" : "nb-goal-edit"}>
        {asking && <p className="nb-question">{t("notebook.ui.goalQuestion")}</p>}
        <p className="nb-empty">{t("notebook.ui.goalHint")}</p>
        {asking && (
          <div className="nb-starters">
            {GOAL_STARTERS.map((s) => (
              <button
                key={s}
                type="button"
                className="ask-chip"
                data-starter={s}
                onClick={() => {
                  // A starter the player finishes in their own words ("just playing" is whole).
                  const words = t(`notebook.ui.goalStarter.${s}`);
                  setDraft(s === "justPlaying" ? words : `${words} `);
                  inputRef.current?.focus({ preventScroll: true });
                }}
              >
                {t(`notebook.ui.goalChoice.${s}`)}
              </button>
            ))}
          </div>
        )}
        <input
          ref={inputRef}
          className="nb-input"
          value={draft}
          maxLength={GOAL_MAX_CHARS}
          aria-label={t("notebook.ui.goalInputLabel")}
          placeholder={t("notebook.ui.goalInputLabel")}
          onChange={(e) => setDraft(e.target.value)}
          data-testid="nb-goal-input"
        />
        <div className="nb-actions">
          <button type="submit" className="ask-tool-btn" disabled={!draft.trim()} data-testid="nb-goal-save">
            {t("notebook.ui.goalSave")}
          </button>
          {asking ? (
            <button type="button" className="nb-quiet" onClick={onePress(dismiss)} data-testid="nb-goal-not-now">
              {t("notebook.ui.notNow")}
            </button>
          ) : (
            <button type="button" className="nb-quiet" onClick={() => setEditing(false)} data-testid="nb-goal-cancel">
              {t("notebook.ui.goalCancel")}
            </button>
          )}
        </div>
      </form>
    );
  } else if (book.goal) {
    body = (
      <ul className="nb-list">
        <li className="nb-item" data-testid="nb-goal">
          <p className="nb-text">
            <q>{book.goal.text}</q>
          </p>
          <small className="nb-evidence">
            {book.goal.at !== null ? t("notebook.ui.goalSaid", { date: dayOf(book.goal.at, lang) }) : t("notebook.ui.goalSaidUndated")}
          </small>
          <button type="button" className="nb-leave nb-edit" onClick={startEdit} data-testid="nb-goal-edit-button">
            {t("notebook.ui.goalEdit")}
          </button>
        </li>
      </ul>
    );
  } else {
    body = (
      <div className="nb-goal-none">
        <p className="nb-empty" data-testid="nb-goal-none">
          {t("notebook.ui.goalNone")}
        </p>
        <button type="button" className="nb-quiet" onClick={startEdit} data-testid="nb-goal-add">
          {t("notebook.ui.goalAdd")}
        </button>
      </div>
    );
  }

  return (
    <section className="nb-section" aria-labelledby="nb-goal-h">
      <h3 className="nb-h" id="nb-goal-h">
        {t("notebook.ui.goalTitle")}
      </h3>
      {body}
      {notNow && (
        <p className="nb-status" role="status" data-testid={`nb-not-now-${notNow}`}>
          {t(notNow === "done" ? "notebook.ui.notNowDone" : notNow === "notRead" ? "notebook.ui.notNowNotRead" : "notebook.ui.notSaved")}
        </p>
      )}
      {turn && turn.kind === "tool" && (
        <div className="nb-receipt" data-testid="nb-goal-receipt">
          <AskToolTurn id={turn.id} body={turn.body} />
        </div>
      )}
    </section>
  );
}
