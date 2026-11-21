/**
 * Settings → Coach → Notebook (DESIGN 6.7; leg c6a, judgement call 27): the
 * lines the player left out (`coach.suppressed`), each with the day it was left
 * out and "Bring back", and the goal with its Edit, as the Notebook edits it.
 *
 * Nothing here is deleted and nothing is written without a press. Bring back
 * goes through the store's own door (`saveUnsuppressed`), one press, with an
 * Undo for a few seconds that puts the line back as it was, its day unchanged
 * (`saveSuppressed` with that day). A line left out comes back by itself after
 * thirty days (`isSuppressed`); the group says so.
 *
 * Read once when Settings opens: the stored Takes name each line (the same
 * `tendencies` the Notebook reads), and are not read again while it shows.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { notebookFrom } from "../../coach/notebook";
import {
  coachKeyStates,
  coachPressSettled,
  coachStored,
  coachStoredLoaded,
  isSuppressed,
  loadCoachStored,
  saveSuppressed,
  saveUnsuppressed,
  subscribeCoachStored,
  type Written,
} from "../../coach/store";
import { tendencies, type NoticedLine } from "../../coach/tendencies";
import { readNotebookSource, type NotebookSource } from "../coach/askStore";
import { onePress } from "../coach/askTools";
// `dayOf` never throws (review c6a H1): one formatter for both Notebooks.
import { dayOf, Goal, LEAVE_OUT_UNDO_MS } from "../coach/Notebook";
import { CoachGroup } from "./CoachGroup";
import "../../styles/ask.css";

const NO_SOURCE: NotebookSource = { rows: [], paths: [], sessionStartedAt: null };

/** A line just brought back: its row stays, with an Undo, for a few seconds. */
type Back = { at: number; until: number };

export function CoachNotebookGroup() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const stored = useSyncExternalStore(subscribeCoachStored, coachStored, coachStored);
  const states = useSyncExternalStore(subscribeCoachStored, coachKeyStates, coachKeyStates);
  const [source] = useState(() => readNotebookSource() ?? NO_SOURCE);
  const [now] = useState(() => Date.now());
  const [back, setBack] = useState<Readonly<Record<string, Back>>>({});
  const [notSaved, setNotSaved] = useState<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    if (!coachStoredLoaded()) void loadCoachStored().catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  // Every line the Takes make, left out or not: what names a left-out id.
  const lines = useMemo(() => {
    const byId = new Map<string, NoticedLine>();
    for (const line of tendencies(source.rows, now, { paths: source.paths })) byId.set(line.id, line);
    return byId;
  }, [source, now]);
  // The goal, as the Notebook reads it (the question is never asked here).
  const book = useMemo(() => notebookFrom(source.rows, stored, states, now, source.paths), [source, stored, states, now]);

  // One timer for the soonest Undo to go; expiry writes nothing.
  const soonest = Object.values(back).reduce<number | null>((m, b) => (m === null || b.until < m ? b.until : m), null);
  useEffect(() => {
    if (soonest === null) return;
    const id = window.setTimeout(() => {
      if (!mounted.current) return;
      const at = Date.now();
      setBack((cur) => Object.fromEntries(Object.entries(cur).filter(([, b]) => b.until > at)));
    }, Math.max(0, soonest - Date.now()));
    return () => window.clearTimeout(id);
  }, [soonest]);

  const follow = (written: Written, id: string) => {
    if (written === "saved" || written === "queued") {
      void coachPressSettled("suppressed").then((end) => {
        if (mounted.current && end === "notSaved") setNotSaved(id);
      });
    }
  };

  const bringBack = (id: string, at: number) => {
    setNotSaved(null);
    const written = saveUnsuppressed(id);
    if (written === "notRead") return;
    follow(written, id);
    setBack((cur) => ({ ...cur, [id]: { at, until: Date.now() + LEAVE_OUT_UNDO_MS } }));
  };

  // Undo: left out again, on the day it was first left out.
  const undo = (id: string) => {
    const was = back[id];
    if (!was) return;
    setNotSaved(null);
    follow(saveSuppressed(id, was.at), id);
    setBack((cur) => {
      const next = { ...cur };
      delete next[id];
      return next;
    });
  };

  const state = states.suppressed;
  // Only entries with a real time get "Bring back" (review c6a H1): one this
  // build cannot read (loaded as Infinity) has no day to show, and bringing it
  // back would not reach the disk (`mapForDisk` keeps it as stored). It is
  // named in one plain line, with no button, and left as it is.
  const entries = Object.entries(stored.suppressed);
  const unreadable = entries.filter(([, at]) => !Number.isFinite(at)).length;
  const leftOut = entries
    .filter(([id, at]) => Number.isFinite(at) && isSuppressed(stored.suppressed, id, now) && !back[id])
    .map(([id, at]) => ({ id, at, back: false }));
  const shown = [...leftOut, ...Object.entries(back).map(([id, b]) => ({ id, at: b.at, back: true }))].sort(
    (a, b) => b.at - a.at || a.id.localeCompare(b.id),
  );

  let body: React.ReactNode;
  if (state === "loading") {
    body = <p className="nb-empty">{t("notebook.ui.loading")}</p>;
  } else if (state === "unreadable") {
    body = <p className="nb-empty" data-testid="coach-nb-unreadable">{t("notebook.ui.noticedUnreadable")}</p>;
  } else if (shown.length === 0) {
    body =
      unreadable > 0 ? null : (
        <p className="nb-empty" data-testid="coach-nb-empty">{t("settings.coach.notebook.empty")}</p>
      );
  } else {
    body = (
      <ul className="nb-list" data-testid="coach-nb-left-out">
        {shown.map(({ id, at, back: isBack }) => {
          const line = lines.get(id);
          return isBack ? (
            <li key={id} className="nb-item nb-item-left" data-line={id} data-testid="coach-nb-back">
              <p className="nb-status nb-left-text" role="status">
                {t("settings.coach.notebook.broughtBack")}
              </p>
              <button type="button" className="nb-leave" onClick={onePress(() => undo(id))} data-testid="coach-nb-undo">
                {t("notebook.ui.undo")}
              </button>
            </li>
          ) : (
            <li key={id} className="nb-item" data-line={id}>
              <p className="nb-text">{line ? t(line.key, line.values) : t("settings.coach.notebook.lineGone")}</p>
              <small className="nb-evidence">{t("settings.coach.notebook.leftOutOn", { date: dayOf(at, lang) })}</small>
              <button
                type="button"
                className="nb-leave"
                onClick={onePress(() => bringBack(id, at))}
                data-testid="coach-nb-bring-back"
              >
                {t("settings.coach.notebook.bringBack")}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <CoachGroup id="notebook">
      <div className="coach-notebook-group" data-testid="coach-notebook-group">
        <section className="nb-section" aria-labelledby="coach-nb-left-h">
          <h4 className="nb-h" id="coach-nb-left-h">
            {t("settings.coach.notebook.leftOutTitle")}
          </h4>
          {body}
          {state !== "loading" && state !== "unreadable" && unreadable > 0 && (
            <p className="nb-empty" data-testid="coach-nb-unreadable-entries">
              {t("settings.coach.notebook.unreadableEntries")}
            </p>
          )}
          {notSaved && (
            <p className="nb-status" role="status" data-testid="coach-nb-not-saved">
              {t("notebook.ui.notSaved")}
            </p>
          )}
          <p className="nb-empty">{t("settings.coach.notebook.comesBack")}</p>
        </section>
        <Goal book={book} lang={lang} offer={false} />
      </div>
    </CoachGroup>
  );
}
