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
import { getAskState, readNotebookSource, useAskState, type NotebookSource } from "./askStore";
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

/** A line just left out: its row says so, with its own Undo, for a few seconds (c4a2b, L5). */
type LeftOut = { line: NoticedLine; until: number; height: number | null };

/** True while mounted, set in the effect's body so StrictMode's second run sets it back (c4a2b, L1). */
function useMounted() {
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  return mounted;
}

function Noticed({ book, lang, played }: { book: Book; lang: string; played: number }) {
  const { t } = useTranslation();
  // Each line left out keeps its own row and Undo; a second Leave out does not take the first's.
  const [left, setLeft] = useState<Readonly<Record<string, LeftOut>>>({});
  // What a press on a line ended in, by the line: said under that line's row.
  const [said, setSaid] = useState<Readonly<Record<string, Said>>>({});
  const mounted = useMounted();
  const rows = useRef(new Map<string, HTMLLIElement>());
  // Each line's place in the list as first shown, so a row left out (or brought back) keeps it.
  const order = useRef(new Map<string, number>());
  for (const line of book.noticed) if (!order.current.has(line.id)) order.current.set(line.id, order.current.size);

  const sayOf = (id: string, what: Said) => setSaid((cur) => ({ ...cur, [id]: what }));

  // Each Undo goes after a few seconds: one timer per press, never per beat. Expiry writes nothing.
  const soonest = Object.values(left).reduce<number | null>((m, l) => (m === null || l.until < m ? l.until : m), null);
  useEffect(() => {
    if (soonest === null) return;
    const id = window.setTimeout(() => {
      if (!mounted.current) return;
      const at = Date.now();
      setLeft((cur) => {
        const kept = Object.fromEntries(Object.entries(cur).filter(([, l]) => l.until > at));
        return Object.keys(kept).length === Object.keys(cur).length ? cur : kept;
      });
    }, Math.max(0, soonest - Date.now()));
    return () => window.clearTimeout(id);
  }, [soonest, mounted]);

  const leaveOut = (line: NoticedLine) => {
    const pressedAt = Date.now();
    // One read of the row's height at the press, so the Undo's row holds the line's place.
    const height = rows.current.get(line.id)?.getBoundingClientRect().height || null;
    const written = saveSuppressed(line.id, pressedAt);
    const first = follow(written, "suppressed", (end) => {
      if (mounted.current) sayOf(line.id, end);
    });
    sayOf(line.id, first);
    if (first === "notRead") return;
    setLeft((cur) => ({ ...cur, [line.id]: { line, until: pressedAt + LEAVE_OUT_UNDO_MS, height } }));
  };

  // Undo: the line is back at once; a save that does not land says so (c4a2b, L2).
  const undo = (id: string) => {
    if (!left[id]) return;
    const written = saveUnsuppressed(id);
    const first = follow(written, "suppressed", (end) => {
      if (mounted.current) sayOf(id, end);
    });
    sayOf(id, first);
    setLeft((cur) => {
      const next = { ...cur };
      delete next[id];
      return next;
    });
  };

  // The lines in their first-shown order, a row left out in its own place.
  const shown: Array<{ line: NoticedLine; left: LeftOut | null }> = [
    ...book.noticed.filter((l) => !left[l.id]).map((line) => ({ line, left: null })),
    ...Object.values(left).map((l) => ({ line: l.line, left: l })),
  ].sort((a, b) => (order.current.get(a.line.id) ?? 0) - (order.current.get(b.line.id) ?? 0));
  const shownIds = new Set(shown.map((s) => s.line.id));
  // A press's outcome whose row has gone (its Undo expired): said after the list, where nothing moves.
  const orphans = Object.entries(said).filter(([id, s]) => s !== null && !shownIds.has(id));

  const saidLine = (id: string, s: Said) =>
    s && (
      <p className="nb-status nb-said" role="status" data-testid={`nb-said-${s}`} data-said-for={id}>
        {t(s === "notRead" ? "notebook.ui.leftOutNotRead" : "notebook.ui.notSaved")}
      </p>
    );

  const state = book.noticedState;
  let body: React.ReactNode;
  if (state === "loading") {
    body = <p className="nb-empty" data-testid="nb-noticed-loading">{t("notebook.ui.loading")}</p>;
  } else if (state === "unreadable") {
    body = <p className="nb-empty" data-testid="nb-noticed-unreadable">{t("notebook.ui.noticedUnreadable")}</p>;
  } else if (shown.length === 0) {
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
          {shown.map(({ line, left: gone }) =>
            gone ? (
              // Where the line was, the same height: the Undo sits where Leave out was pressed.
              <li
                key={line.id}
                className="nb-item nb-item-left"
                data-line={line.id}
                data-testid="nb-left-out"
                style={gone.height ? { minHeight: gone.height } : undefined}
              >
                <p className="nb-status nb-left-text" role="status">
                  {t("notebook.ui.leftOut")}
                </p>
                <button type="button" className="nb-leave" onClick={onePress(() => undo(line.id))} data-testid="nb-undo">
                  {t("notebook.ui.undo")}
                </button>
                {saidLine(line.id, said[line.id] ?? null)}
              </li>
            ) : (
              <li
                key={line.id}
                className="nb-item"
                data-line={line.id}
                ref={(el) => {
                  if (el) rows.current.set(line.id, el);
                  else rows.current.delete(line.id);
                }}
              >
                <p className="nb-text">{t(line.key, line.values)}</p>
                <small className="nb-evidence">
                  {t(line.evidence.key, {
                    ...line.evidence.values,
                    from: dayOf(line.from, lang),
                    to: dayOf(line.to, lang),
                  })}
                </small>
                {/* Words, not a bin: nothing is deleted, every Take stays and the line returns in 30 days. */}
                <button type="button" className="nb-leave" data-testid="nb-leave-out" onClick={onePress(() => leaveOut(line))}>
                  {t("notebook.ui.leaveOut")}
                </button>
                {saidLine(line.id, said[line.id] ?? null)}
              </li>
            ),
          )}
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
      {body}
      {orphans.map(([id, s]) => (
        <div key={id}>{saidLine(id, s)}</div>
      ))}
    </section>
  );
}

// ---------------------------------------------------------------------------
// What you're working toward
// ---------------------------------------------------------------------------

/** Also Settings → Coach's Notebook group (leg c6a), with `offer` false: the goal and its Edit, never the question. */
export function Goal({ book, lang, offer }: { book: Book; lang: string; offer: boolean }) {
  const { t } = useTranslation();
  const { turns } = useAskState();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [turnId, setTurnId] = useState<string | null>(null);
  const [notNow, setNotNow] = useState<"done" | Said>(null);
  // The goal's save did not land (c4a2b, L2): said beside the receipt, which then cannot read as "saved".
  const [goalNotSaved, setGoalNotSaved] = useState(false);
  const mounted = useMounted();
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
    setGoalNotSaved(false);
    // Only a goal the runner set has a save to follow (its receipt); a refusal wrote nothing.
    const done = getAskState().turns.find((x) => x.id === id);
    if (done?.kind === "tool" && done.body.kind === "receipt") {
      void coachPressSettled("goal").then((end) => {
        if (mounted.current && end === "notSaved") setGoalNotSaved(true);
      });
    }
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
          {goalNotSaved && turn.body.kind === "receipt" && (
            <p className="nb-status" role="status" data-testid="nb-goal-not-saved">
              {t("notebook.ui.notSaved")}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
