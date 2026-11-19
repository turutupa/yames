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
 * defaults a player who never opened the wizard gets: Shred, from its first
 * Level (`playerPaths`, `FIRST_PATH_ID`).
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
import { levelsOf } from "../../../session/variants";
import { levelSubtitle } from "../../session/PathsView";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";
import "../../../styles/onboarding-learning.css";

/** The order the step offers the Paths in: the one everybody starts on first. */
export const START_PATH_ORDER = [
  FIRST_PATH_ID,
  "blues-pentatonics",
  "classic-rock",
  "alternate-picking",
  "sweep-picking",
  "rhythm-foundations",
  "legato",
  "metal-rhythm",
  "know-the-neck",
];

/** The Paths a player can start, in the step's order (unknown runnable ones last). */
export function startablePaths(paths: readonly PathDoc[]): PathDoc[] {
  const rank = (id: string) => {
    const i = START_PATH_ORDER.indexOf(id);
    return i < 0 ? START_PATH_ORDER.length : i;
  };
  return paths.filter((p) => isRunnable(p.id)).sort((a, b) => rank(a.id) - rank(b.id));
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

export function StartStep(_props: WizardStepProps) {
  const { t } = useTranslation();
  const { learning, setStepCommit, setNextEnabled, setMachineContext, machineContext } = useWizardEnv();
  const { paths, progress, startPath } = learning;
  const offered = useMemo(() => startablePaths(paths), [paths]);

  // Null until the player picks: the default follows the store as it loads,
  // so a re-run whose progress arrives a moment late still starts on their Path.
  const [picked, setPicked] = useState<StartChoice | null>(null);
  const startedNow = machineContext.startPathId;
  const fallback = useMemo(() => defaultStart(paths, progress, startedNow), [paths, progress, startedNow]);
  const choice = picked ?? fallback;
  const path = choice ? offered.find((p) => p.id === choice.pathId) ?? null : null;
  const levels = path ? levelsOf(path) : [];
  const level = levels.find((l) => l.id === choice?.levelId) ?? levels[0] ?? null;

  const following = progress.states.filter((s) => isSubscribed(progress, s.pathId)).length;
  const refused = !!path && !isSubscribed(progress, path.id) && following >= SUBSCRIPTION_CAP;
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
            setMachineContext({ startPathId: path.id });
          }
        : null,
    );
  }, [path, level, refused, unchanged, startPath, setNextEnabled, setStepCommit, setMachineContext]);

  const entry = path && level ? levelEntryStep(progress, path, level) : null;

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
            <h3 className="onboarding-choice-heading" id="onboarding-start-paths">
              {t("onboarding.start.pathHeading")}
            </h3>
            <div className="onboarding-start-paths" role="group" aria-labelledby="onboarding-start-paths">
              {offered.map((p) => {
                const on = p.id === path?.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`onboarding-start-path${on ? " selected" : ""}`}
                    aria-pressed={on}
                    data-path={p.id}
                    onClick={() => setPicked({ pathId: p.id, levelId: levelFor(p, progress) })}
                  >
                    <span className="onboarding-start-path-title">{p.title}</span>
                    <span className="onboarding-start-path-goal">{p.goal}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {path && level && (
            <div className="onboarding-start-group">
              <h3 className="onboarding-choice-heading" id="onboarding-start-level">
                {t("session.paths.level")}
              </h3>
              <div className="onboarding-start-levels" role="group" aria-labelledby="onboarding-start-level">
                {levels.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`onboarding-start-level${l.id === level.id ? " selected" : ""}`}
                    aria-pressed={l.id === level.id}
                    data-level={l.id}
                    onClick={() => setPicked({ pathId: path.id, levelId: l.id })}
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
