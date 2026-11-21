/**
 * "My exercises" on the Paths screen (DESIGN 13, mock 17): the player's custom
 * Exercises, each built again from its recipe, with Play and Remove.
 *
 * Not shown at all while the list is empty. Remove is the player's own control,
 * with an Undo beside the list until the next Remove or until the screen is
 * left; nothing else removes one (the coach never does). A recipe this build
 * cannot make any more stays, says so, and can still be removed.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { Exercise, PathDoc } from "../../paths/format";
import { CUSTOM_PATH_ID, customPathDoc } from "../../paths/custom";
import type { CustomSummary } from "../../paths/custom";
import { tempoRange } from "../../session/coachWords";
import { cleanTempoOf, takesOf } from "../../session/progress";
import { removeMyExercise, restoreMyExercise, updateMyExercises, useMyExercises } from "../../session/myExercises";
import type { MyExercise, RemovedMyExercise } from "../../session/myExercises";
import { buildMyExercises, keyOf, myExerciseLine } from "../../session/myExerciseBuild";
import type { SessionRun } from "./hooks/useSessionRun";

/**
 * The one-Step document a custom Exercise is played from, in the language on
 * screen: the generator's placeholder English replaced by the row's own line.
 */
export function playableDoc(t: TFunction, exercise: Exercise, summary: CustomSummary): PathDoc {
  const line = myExerciseLine(t, summary);
  const howTo = t("session.myExercises.howTo");
  const doc = customPathDoc({ ...exercise, title: line, purpose: line, howTo: [howTo], coachLine: howTo });
  const title = t("session.myExercises.title");
  return { ...doc, title, steps: doc.steps.map((s) => ({ ...s, title })) };
}

/** The section itself. Loaded lazily by `MyExercisesSection`, with the generator behind it. */
export default function MyExercisesList({ session, style }: { session: SessionRun; style?: React.CSSProperties }) {
  const { t } = useTranslation();
  const list = useMyExercises();
  const rows = useMemo(() => buildMyExercises(list), [list]);
  const [removed, setRemoved] = useState<RemovedMyExercise | null>(null);
  /** Why the last press changed nothing, said under the list (`session.myExercises.<notice>`). */
  const [notice, setNotice] = useState<null | "notSaved" | "undoFull" | "undoAlready">(null);
  if (list.length === 0 && !removed && !notice) return null;

  // Both go through the store's one writer: it waits for the load and refuses
  // (and the player is told) when the stored list could not be read.
  const remove = async (entry: MyExercise) => {
    const got: { removed: RemovedMyExercise | null } = { removed: null };
    const result = await updateMyExercises((now) => {
      const r = removeMyExercise(now, entry);
      got.removed = r.removed;
      return r.removed ? r.list : null;
    });
    if (result === "saved" && got.removed) {
      setRemoved(got.removed);
      setNotice(null);
    } else if (result !== "unchanged") setNotice("notSaved");
  };
  const undo = async () => {
    if (!removed) return;
    const got: { refused: null | "already" | "full" } = { refused: null };
    const result = await updateMyExercises((now) => {
      const r = restoreMyExercise(now, removed, keyOf);
      got.refused = r.refused;
      return r.refused ? null : r.list;
    });
    const refused = got.refused;
    if (result === "saved") {
      setRemoved(null);
      setNotice(null);
    } else if (refused === "already") {
      // The same notes are on the list again: nothing to undo, and no second row.
      setRemoved(null);
      setNotice("undoAlready");
    } else if (refused === "full") setNotice("undoFull"); // the Undo stays: remove another, then press it
    else setNotice("notSaved"); // the Undo stays
  };

  return (
    <section
      className="session-pathgroup session-myex-group"
      data-testid="my-exercises"
      aria-labelledby="my-exercises-name"
    >
      <div className="session-pathgroup-head session-rise" style={style}>
        <h2 className="session-pathgroup-name" id="my-exercises-name">
          {t("session.myExercises.title")}
        </h2>
        <span className="session-why">{t("session.myExercises.intro")}</span>
      </div>
      <div className="session-myex-list">
        {rows.map(({ entry, built }, index) => {
          const key = keyOf(entry) ?? `broken-${index}`;
          if (!built.ok) {
            return (
              <div className="session-myex session-glass" key={key} data-testid="my-exercise" data-broken="">
                <div className="session-myex-text">
                  <div className="session-quiet">{t("session.myExercises.cantBuild")}</div>
                </div>
                <div className="session-myex-actions">
                  <button
                    type="button"
                    className="session-secondary session-myex-remove"
                    onClick={() => void remove(entry)}
                    data-testid="my-exercise-remove"
                  >
                    {t("session.myExercises.remove")}
                  </button>
                </div>
              </div>
            );
          }
          const { exercise, summary } = built;
          const line = myExerciseLine(t, summary);
          const range = tempoRange(exercise);
          const played = takesOf(session.progress, CUSTOM_PATH_ID, exercise.id).length;
          const clean = cleanTempoOf(session.progress, CUSTOM_PATH_ID, exercise.id);
          return (
            <div className="session-myex session-glass" key={key} data-testid="my-exercise" data-id={exercise.id}>
              <div className="session-myex-text">
                <div className="session-plan-title">{line}</div>
                {range && (
                  <div className="session-quiet session-exercise-tempo">
                    {[
                      range.subdivision ? t(`session.subdivision.${range.subdivision}`) : null,
                      range.to === null
                        ? t("session.paths.tempoFrom", { from: range.from })
                        : t("session.paths.tempoRange", { from: range.from, to: range.to }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                )}
                {played > 0 && (
                  <div className="session-quiet">
                    <b>
                      {clean === null
                        ? t("session.paths.playedNoClean", { count: played })
                        : t("session.paths.playedClean", { count: played, bpm: clean })}
                    </b>
                  </div>
                )}
              </div>
              <div className="session-myex-actions">
                <button
                  type="button"
                  className="session-secondary"
                  onClick={() => {
                    const doc = playableDoc(t, exercise, summary);
                    session.actions.playExercise(doc, doc.steps[0], doc.steps[0].exercises[0]);
                  }}
                  data-testid="my-exercise-play"
                >
                  {t("session.paths.playThis")}
                </button>
                <button
                  type="button"
                  className="session-link session-myex-remove"
                  onClick={() => void remove(entry)}
                  aria-label={t("session.myExercises.removeLabel", { what: line })}
                  data-testid="my-exercise-remove"
                >
                  {t("session.myExercises.remove")}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {(removed || notice) && (
        <div className="session-myex-undo" role="status">
          <span className="session-quiet" data-testid="my-exercise-notice">
            {t(notice ? `session.myExercises.${notice}` : "session.myExercises.removed")}
          </span>
          {removed && (
            <button type="button" className="session-link" onClick={() => void undo()} data-testid="my-exercise-undo">
              {t("session.myExercises.undo")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
