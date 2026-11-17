/**
 * "Export my practice data": everything the learning side keeps, as one JSON
 * file a tester can attach to their feedback (`plans/tasks/mvp/CONTENT.md`,
 * "Measuring whether it helps").
 *
 * Built from what is already stored, nothing else: the Takes with their facts
 * (the planner's reason and role for each, the benchmark tags, the answers to
 * "was this grade fair?"), the clean tempos, where each Path stands, and the
 * plan Today would make right now with its reasons. No audio, no names, no
 * account: the file holds tempos, verdicts and the numbers behind them.
 */
import type { PathDoc } from "../paths/format";
import { factsOf, isSubscribed } from "./progress";
import type { PlayerProgress } from "./progress";
import { PLAN_MINUTES, planSession } from "./planner";
import type { SessionPlan } from "./planner";
import { isRunnable, loadAllPacks } from "./packs";
import {
  exportPracticeData,
  listExerciseCeilings,
  listPathStates,
  listPathTakes,
  storeLoad,
} from "../ipc";

/** Bump when a reader of the file would need to know. */
export const PRACTICE_EXPORT_VERSION = 1;

export type PracticeExport = ReturnType<typeof buildPracticeExport>;

export function buildPracticeExport(input: {
  progress: PlayerProgress;
  paths: readonly PathDoc[];
  plan: SessionPlan | null;
  appVersion: string;
  now: number;
}) {
  const { progress, paths, plan, appVersion, now } = input;
  const facts = progress.takes.map((t) => ({ id: t.id, ...factsOf(t) }));
  return {
    kind: "yames-practice-data",
    version: PRACTICE_EXPORT_VERSION,
    appVersion,
    exportedAt: new Date(now).toISOString(),
    paths: progress.states.map((state) => ({
      ...state,
      title: paths.find((p) => p.id === state.pathId)?.title ?? state.pathId,
      subscribed: isSubscribed(progress, state.pathId),
    })),
    ceilings: progress.ceilings,
    takes: progress.takes,
    benchmarks: facts
      .filter((f) => f.benchmark)
      .map((f) => ({ takeId: f.id, ...f.benchmark, verdict: f.verdict ?? null })),
    fairness: facts
      .filter((f) => f.fair)
      .map((f) => ({ takeId: f.id, fair: f.fair, verdict: f.verdict ?? null })),
    plannerReasons: facts
      .filter((f) => f.reason)
      .map((f) => ({ takeId: f.id, role: f.role ?? null, reason: f.reason })),
    todayPlan: plan
      ? {
          minutes: plan.minutes,
          mood: plan.mood,
          focusPathId: plan.focusPathId ?? null,
          steps: plan.steps.map((s) => ({
            kind: s.kind,
            id: s.id,
            minutes: s.minutes,
            ...("pathId" in s && s.pathId ? { pathId: s.pathId } : {}),
            ...("exerciseId" in s && s.exerciseId ? { exerciseId: s.exerciseId } : {}),
            ...("role" in s ? { role: s.role } : {}),
            why: s.why,
            ...("context" in s && s.context ? { context: s.context } : {}),
          })),
          skipped: plan.skipped ?? [],
        }
      : null,
  };
}

/** The file name the save dialog suggests. */
export function exportFileName(now: number): string {
  return `yames-practice-${new Date(now).toISOString().slice(0, 10)}.json`;
}

/**
 * Read what the store keeps, build the export, and ask where to save it.
 *
 * Its own reads rather than a screen's state, so Settings > Support and Progress
 * export the same thing. Resolves with the path, or null when they cancel.
 */
export async function exportPracticeFile(appVersion: string): Promise<string | null> {
  const [states, takes, ceilings, unsubscribed, minutes, paths] = await Promise.all([
    listPathStates().catch(() => []),
    listPathTakes(2000).catch(() => []),
    listExerciseCeilings().catch(() => []),
    storeLoad<string[]>("session.unsubscribed").catch(() => undefined),
    storeLoad<number>("session.minutes").catch(() => undefined),
    loadAllPacks().catch(() => [] as PathDoc[]),
  ]);
  const progress: PlayerProgress = {
    states,
    takes,
    ceilings,
    unsubscribed: Array.isArray(unsubscribed) ? unsubscribed : [],
  };
  const now = Date.now();
  const mine = states
    .filter((s) => isSubscribed(progress, s.pathId) && isRunnable(s.pathId))
    .map((s) => paths.find((p) => p.id === s.pathId))
    .filter((p): p is PathDoc => !!p);
  const chosen = PLAN_MINUTES.find((m) => m === minutes) ?? 10;
  const plan = mine.length > 0 ? planSession({ minutes: chosen, now, paths: mine, progress }) : null;
  const data = buildPracticeExport({ progress, paths, plan, appVersion, now });
  return exportPracticeData(exportFileName(now), JSON.stringify(data, null, 2));
}
