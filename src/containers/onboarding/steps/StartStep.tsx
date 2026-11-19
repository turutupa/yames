/**
 * Where do you start? — the first Path and its Level (owner, 2026-11-18: "make
 * sure the setup wizard stays relevant with the latest changes of the app").
 *
 * Levels decide where a Path starts now, and Today plans from the Paths the
 * player follows, so these two answers are what the first Session is built
 * from. The step writes them through `startPath`, the same subscribe and Level
 * logic the Path page runs (`useSessionRun`), so Today and the Path page show
 * the choice the moment the wizard closes.
 *
 * Selection is never navigation (`types.ts`): a card or a Level only stages
 * the choice; the commit runs on Next. Skip writes nothing, which leaves the
 * defaults a player who never opened the wizard gets: Rhythm Foundations, from
 * its first Level (`playerPaths`, `FIRST_PATH_ID`), the same Path the step
 * stages with no answer.
 *
 * What is staged on a first run: one optional question, "What do you want most right now?", and the curriculum map's
 * answer to it (`startRecommendation.ts`), Rhythm Foundations with no answer.
 * A recommendation can be two Paths; Next starts both, the first at the
 * Level shown. Any Path under it can be picked instead.
 *
 * A re-run starts on the Path the player follows (the first of them) at the
 * Level they chose, and Next with nothing changed writes nothing, so a player
 * who walked past this step keeps the Step they were on.
 */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { PathDoc } from "../../../paths/format";
import { FIRST_PATH_ID, isRunnable } from "../../../session/packs";
import { chosenLevelOf, isSubscribed, levelEntryStep } from "../../../session/progress";
import type { PlayerProgress } from "../../../session/progress";
import { SUBSCRIPTION_CAP } from "../../../session/rotation";
import { pathTracks } from "../../../session/tracks";
import { levelsOf } from "../../../session/variants";
import { levelSubtitle } from "../../session/PathsView";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";
import { START_GOALS, recommendStart } from "./startRecommendation";
import type { StartGoal } from "./startRecommendation";
import "../../../styles/onboarding-learning.css";

/**
 * The Paths a player can start, in the Paths screen's order: Foundations, How
 * harmony works, Technique, Styles, each in the curriculum map's order
 * (`pathTracks`). The wizard and the screen it leads to read the same way.
 */
export function startablePaths(paths: readonly PathDoc[]): PathDoc[] {
  return pathTracks(paths.filter((p) => isRunnable(p.id))).flatMap((track) => track.paths);
}

export type StartChoice = { pathId: string; levelId: string | null };

/** The Level a Path starts at for this player: the one chosen, else its first. */
export function levelFor(path: PathDoc, progress: PlayerProgress): string | null {
  return chosenLevelOf(progress, path)?.id ?? levelsOf(path)[0]?.id ?? null;
}

/**
 * What the step shows before the player touches it: the first Path they
 * follow, at its Level; on a first run, the Path everybody starts on.
 */
export function defaultStart(
  paths: readonly PathDoc[],
  progress: PlayerProgress,
  /** The Path this run already started (`OnboardingContext.startPathId`), first if still followed. */
  startedNow?: string,
): StartChoice | null {
  const offered = startablePaths(paths);
  if (offered.length === 0) return null;
  const ids = progress.states.filter((s) => isSubscribed(progress, s.pathId)).map((s) => s.pathId);
  if (startedNow && ids.includes(startedNow)) ids.unshift(startedNow);
  const followed = ids.map((id) => offered.find((p) => p.id === id)).find((p): p is PathDoc => !!p);
  const path = followed ?? offered.find((p) => p.id === FIRST_PATH_ID) ?? offered[0];
  return { pathId: path.id, levelId: levelFor(path, progress) };
}

/** The Paths this step will start, the first at `levelId`, and why (when it is a recommendation). */
export type StartPlan = { pathIds: string[]; levelId: string | null; whyKey: string | null };

/**
 * What the step stages: a Path the player picked; else the answer's
 * recommendation; else, on a re-run, the Path they follow; else the map's one
 * start (`recommendStart`).
 */
export function stagedStart(
  paths: readonly PathDoc[],
  progress: PlayerProgress,
  opts: { goal: StartGoal | null; pickedPathId: string | null; levelId: string | null; startedNow?: string },
): StartPlan | null {
  const offered = startablePaths(paths);
  const levelOf = (id: string) => {
    const p = offered.find((x) => x.id === id);
    return p ? levelFor(p, progress) : null;
  };
  const plan = (pathIds: string[], whyKey: string | null): StartPlan => ({
    pathIds,
    levelId: opts.levelId ?? levelOf(pathIds[0]),
    whyKey,
  });
  if (opts.pickedPathId && offered.some((p) => p.id === opts.pickedPathId)) return plan([opts.pickedPathId], null);
  if (opts.goal) {
    const rec = recommendStart(opts.goal, offered);
    return rec ? plan(rec.pathIds, rec.whyKey) : null;
  }
  const follows = progress.states.some((s) => isSubscribed(progress, s.pathId) && offered.some((p) => p.id === s.pathId));
  if (follows) {
    const back = defaultStart(paths, progress, opts.startedNow);
    return back ? { pathIds: [back.pathId], levelId: opts.levelId ?? back.levelId, whyKey: null } : null;
  }
  const rec = recommendStart(null, offered);
  return rec ? plan(rec.pathIds, rec.whyKey) : null;
}

export function StartStep(_props: WizardStepProps) {
  const { t, i18n } = useTranslation();
  const { learning, setStepCommit, setNextEnabled, setMachineContext, machineContext } = useWizardEnv();
  const { paths, progress, startPath } = learning;
  const offered = useMemo(() => startablePaths(paths), [paths]);

  // Nothing staged by hand until the player picks: the default follows the
  // store as it loads, so a re-run whose progress arrives a moment late still
  // starts on their Path. A Back to this step finds what was answered.
  const [goal, setGoal] = useState<StartGoal | null>(machineContext.startGoal ?? null);
  const [pickedPathId, setPickedPathId] = useState<string | null>(null);
  const [levelId, setLevelId] = useState<string | null>(null);
  const startedNow = machineContext.startPathId;
  const staged = useMemo(
    () => stagedStart(paths, progress, { goal, pickedPathId, levelId, startedNow }),
    [paths, progress, goal, pickedPathId, levelId, startedNow],
  );
  const chosen = useMemo(
    () => (staged?.pathIds ?? []).map((id) => offered.find((p) => p.id === id)).filter((p): p is PathDoc => !!p),
    [staged, offered],
  );
  const path = chosen[0] ?? null;
  const levels = path ? levelsOf(path) : [];
  const level = levels.find((l) => l.id === staged?.levelId) ?? levels[0] ?? null;

  const following = progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
  const fresh = chosen.filter((p) => !isSubscribed(progress, p.id));
  const refused = fresh.length > 0 && following + fresh.length > SUBSCRIPTION_CAP;
  // Already followed at this Level: nothing to write, and writing would move
  // the player back to the Level's first open Step.
  const unchanged =
    !!path && isSubscribed(progress, path.id) && chosenLevelOf(progress, path)?.id === (level?.id ?? undefined);

  useEffect(() => {
    setNextEnabled(!refused);
    setStepCommit(
      path && !refused
        ? () => {
            if (!unchanged) startPath(path, level?.id ?? null);
            // The second of a recommendation, at its own first Level.
            for (const other of chosen.slice(1)) {
              if (!isSubscribed(progress, other.id)) startPath(other, levelFor(other, progress));
            }
            setMachineContext({
              startPathId: path.id,
              startPathIds: chosen.map((p) => p.id),
              startGoal: goal ?? undefined,
            });
          }
        : null,
    );
  }, [path, chosen, level, refused, unchanged, goal, progress, startPath, setNextEnabled, setStepCommit, setMachineContext]);

  const entry = path && level ? levelEntryStep(progress, path, level) : null;
  const names = joinTitles(chosen.map((p) => p.title), i18n.language);

  return (
    <div className="onboarding-step onboarding-start" data-testid="onboarding-start">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.start.title")}
      </h2>
      <p className="onboarding-step-subtitle">
        {t(progress.takes.length > 0 ? "onboarding.start.subtitleNext" : "onboarding.start.subtitle")}
      </p>

      {offered.length === 0 ? (
        <p className="onboarding-start-loading" role="status">
          {t("onboarding.start.loading")}
        </p>
      ) : (
        <>
          <div className="onboarding-start-group">
            <h3 className="onboarding-choice-heading" id="onboarding-start-goal">
              {t("onboarding.start.goalQuestion")}{" "}
              <span className="onboarding-start-optional">{t("onboarding.start.goalOptional")}</span>
            </h3>
            <div className="onboarding-start-goals" role="group" aria-labelledby="onboarding-start-goal">
              {START_GOALS.map((g) => {
                const on = g === goal;
                return (
                  <button
                    key={g}
                    type="button"
                    className={`onboarding-start-goal${on ? " selected" : ""}`}
                    aria-pressed={on}
                    data-goal={g}
                    // Again on the chosen answer: no answer.
                    onClick={() => {
                      setGoal(on ? null : g);
                      setPickedPathId(null);
                      setLevelId(null);
                    }}
                  >
                    {t(`onboarding.start.goals.${g}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="onboarding-start-group">
            <h3 className="onboarding-choice-heading" id="onboarding-start-paths">
              {t("onboarding.start.pathHeading")}
            </h3>
            <div className="onboarding-start-paths" role="group" aria-labelledby="onboarding-start-paths">
              {offered.map((p) => {
                const on = chosen.some((c) => c.id === p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`onboarding-start-path${on ? " selected" : ""}`}
                    aria-pressed={on}
                    data-path={p.id}
                    title={p.goal}
                    onClick={() => {
                      setPickedPathId(p.id);
                      setLevelId(null);
                    }}
                  >
                    <span className="onboarding-start-path-title">{p.title}</span>
                  </button>
                );
              })}
            </div>
            {path && (
              <p className="onboarding-start-why" data-testid="onboarding-start-why">
                <b>{names}</b>
                {" · "}
                {staged?.whyKey ? t(staged.whyKey) : path.goal}
              </p>
            )}
          </div>

          {path && level && (
            <div className="onboarding-start-group">
              <h3 className="onboarding-choice-heading" id="onboarding-start-level">
                {chosen.length > 1
                  ? t("onboarding.start.levelFor", { path: path.title })
                  : t("session.paths.level")}
              </h3>
              <div className="onboarding-start-levels" role="group" aria-labelledby="onboarding-start-level">
                {levels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`onboarding-start-level${l.id === level.id ? " selected" : ""}`}
                    aria-pressed={l.id === level.id}
                    data-level={l.id}
                    onClick={() => {
                      // The Paths staged stay staged: only the Level changes.
                      setLevelId(l.id);
                    }}
                  >
                    {t(`session.paths.levelName.${l.id}`)}
                  </button>
                ))}
              </div>
              <p className="onboarding-start-about" data-testid="onboarding-start-about">
                <span className="onboarding-start-about-who">{levelSubtitle(level)}</span>
                {entry && (
                  <span className="onboarding-start-about-at">
                    {t("session.paths.levelStartsAt", { n: entry.order, title: entry.title })}
                  </span>
                )}
              </p>
            </div>
          )}

          {refused && (
            <p className="onboarding-start-cap" role="alert" data-testid="onboarding-start-cap">
              {t("session.paths.subscribeCap", { cap: SUBSCRIPTION_CAP })}
            </p>
          )}
        </>
      )}
    </div>
  );
}

type ListFormatCtor = new (locale?: string, options?: { type?: "conjunction" }) => { format(list: string[]): string };

/** "Rhythm Foundations and Know the Neck", the way this language joins a list (as in `JamView`). */
export function joinTitles(titles: string[], language: string): string {
  const ListFormat = (Intl as unknown as { ListFormat?: ListFormatCtor }).ListFormat;
  if (!ListFormat) return titles.join(", ");
  try {
    return new ListFormat(language, { type: "conjunction" }).format(titles);
  } catch {
    return titles.join(", ");
  }
}
