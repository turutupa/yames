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
import {
  myExercisesNow,
  removeMyExercise,
  restoreMyExercise,
  saveMyExercises,
  useMyExercises,
} from "../../session/myExercises";
import type { MyExercise } from "../../session/myExercises";
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
  const [removed, setRemoved] = useState<{ entry: MyExercise; index: number } | null>(null);
  if (list.length === 0 && !removed) return null;

  const remove = (index: number) => {
    const out = removeMyExercise(myExercisesNow(), index);
    if (!out.removed) return;
    saveMyExercises(out.list);
    setRemoved(out.removed);
  };
  const undo = () => {
    if (!removed) return;
    saveMyExercises(restoreMyExercise(myExercisesNow(), removed));
    setRemoved(null);
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
                    onClick={() => remove(index)}
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
                  onClick={() => remove(index)}
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
      {removed && (
        <div className="session-myex-undo" role="status">
          <span className="session-quiet">{t("session.myExercises.removed")}</span>
          <button type="button" className="session-link" onClick={undo} data-testid="my-exercise-undo">
            {t("session.myExercises.undo")}
          </button>
        </div>
      )}
    </section>
  );
}
