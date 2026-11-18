/**
 * Progress: only what was measured, and it says so.
 *
 * A top row of three numbers anyone reads at a glance (minutes played, Sessions,
 * the streak), then one card per Path: its clean tempos as a sparkline and the
 * Exercises played on it, each with its own evenness trend (UX audit PROG-1).
 * Single series everywhere, so no legends: the heading names each one. The
 * rows are the table view of the same numbers.
 *
 * "Export my practice data" lives in Settings › Support (PROG-4).
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PathTakeRow } from "../../ipc";
import type { PathDoc } from "../../paths/format";
import { barLengthTicks } from "../../paths/format";
import { calendarDaysBetween, currentStepOf, factsOf, sessionKeyOf } from "../../session/progress";
import { findExercise } from "../../session/packs";
import { CLEAN_TEMPO_MIN_BARS } from "../../session/grade";
import type { SessionRun } from "./hooks/useSessionRun";
import { useNeck3d } from "./hooks/useNeck";
import { rise } from "./TodayView";
import "../../styles/session.css";

type Point = { at: number; bpm: number };

type Series = {
  exerciseId: string;
  title: string;
  /** Clean tempo as it rose, oldest first. */
  clean: Point[];
  /** Evenness per heard Take, oldest first. */
  evenness: number[];
  takes: number;
  lastAt: number;
};

type PathGroup = {
  path: PathDoc;
  exercises: Series[];
  /** The Path's top clean tempo each time it rose, oldest first, whichever Exercise set it. */
  clean: Point[];
  takes: number;
  lastAt: number;
};

/** Does this Take count for a clean tempo: eight bars in a row that held. */
function countsClean(take: PathTakeRow): boolean {
  return factsOf(take).measures?.pass?.countsForCleanTempo ?? take.bars >= CLEAN_TEMPO_MIN_BARS;
}

export function groupsFrom(takes: readonly PathTakeRow[], paths: readonly PathDoc[]): PathGroup[] {
  const byPath = new Map<string, Map<string, PathTakeRow[]>>();
  for (const take of [...takes].reverse()) {
    const ex = byPath.get(take.pathId) ?? new Map<string, PathTakeRow[]>();
    const list = ex.get(take.exerciseId) ?? [];
    list.push(take);
    ex.set(take.exerciseId, list);
    byPath.set(take.pathId, ex);
  }
  const out: PathGroup[] = [];
  for (const [pathId, exercises] of byPath) {
    const path = paths.find((p) => p.id === pathId);
    if (!path) continue;
    const series: Series[] = [];
    const pathClean: Point[] = [];
    for (const [exerciseId, list] of exercises) {
      const found = findExercise(path, exerciseId);
      const clean: Point[] = [];
      const evenness: number[] = [];
      for (const take of list) {
        const measured = factsOf(take).measures?.evenness;
        if (take.caught && typeof measured === "number") evenness.push(measured);
        const best = clean[clean.length - 1]?.bpm ?? 0;
        if (take.passed && countsClean(take) && take.bpm > best) {
          clean.push({ at: take.startedAt, bpm: take.bpm });
          pathClean.push({ at: take.startedAt, bpm: take.bpm });
        }
      }
      series.push({
        exerciseId,
        title: found?.exercise.title ?? exerciseId,
        clean,
        evenness,
        takes: list.length,
        lastAt: list[list.length - 1].startedAt,
      });
    }
    series.sort((a, b) => b.lastAt - a.lastAt);
    pathClean.sort((a, b) => a.at - b.at);
    // The Path's top clean tempo as it rose: a new point only when an Exercise
    // beats the best so far, so the line never drops because the next one
    // played was a slower Exercise.
    const rising: Point[] = [];
    for (const p of pathClean) if (p.bpm > (rising[rising.length - 1]?.bpm ?? 0)) rising.push(p);
    out.push({
      path,
      exercises: series,
      clean: rising,
      takes: series.reduce((n, s) => n + s.takes, 0),
      lastAt: Math.max(...series.map((s) => s.lastAt)),
    });
  }
  return out.sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * The top row. Minutes are the Takes' own length, from their bars and tempo,
 * so a warm-up or a pause is not counted: played, not "spent in the app".
 */
export function totalsFrom(takes: readonly PathTakeRow[], paths: readonly PathDoc[], now = Date.now()) {
  let seconds = 0;
  for (const take of takes) {
    const path = paths.find((p) => p.id === take.pathId);
    const meter = (path && findExercise(path, take.exerciseId)?.exercise.meter) ?? { numerator: 4, denominator: 4 };
    if (take.bpm > 0) seconds += (take.bars * (barLengthTicks(meter) / 960) * 60) / take.bpm;
  }
  const sessions = new Set(takes.map(sessionKeyOf)).size;
  // Days back from today with a Take on them; a streak still counts until a
  // whole day has gone by without one.
  const days = new Set(takes.map((t) => calendarDaysBetween(t.startedAt, now)));
  const start = days.has(0) ? 0 : days.has(1) ? 1 : -1;
  let streak = 0;
  if (start >= 0) while (days.has(start + streak)) streak += 1;
  return { minutes: Math.round(seconds / 60), seconds, sessions, streak };
}

/** A value's trend in a row. Decorative beside the number it sits next to; each point says its value on hover. */
function Spark({
  values,
  label,
  width = 120,
  height = 34,
  titles,
}: {
  values: readonly number[];
  label: string;
  width?: number;
  height?: number;
  titles?: readonly string[];
}) {
  if (values.length < 2) return <span className="session-spark-none" style={{ width }} />;
  const W = width;
  const H = height;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const x = (i: number) => 5 + (i * (W - 12)) / (values.length - 1);
  const y = (v: number) => 5 + ((hi - v) * (H - 10)) / (hi - lo || 1);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const end = values.length - 1;
  return (
    <svg className="session-spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label}>
      <title>{label}</title>
      <path d={d} fill="none" />
      <circle cx={x(end)} cy={y(values[end])} r="4" />
      {titles &&
        values.map((v, i) => (
          <circle key={i} className="session-spark-hit" cx={x(i)} cy={y(v)} r="9">
            <title>{titles[i]}</title>
          </circle>
        ))}
    </svg>
  );
}

function Stat({ value, label, i, testId }: { value: string; label: string; i: number; testId: string }) {
  return (
    <div className="session-stat-tile session-glass session-rise" style={rise(i)} data-testid={testId}>
      <span className="session-num">{value}</span>
      <span className="session-stat-label">{label}</span>
    </div>
  );
}

function PathCard({ group, session, i }: { group: PathGroup; session: SessionRun; i: number }) {
  const { t, i18n } = useTranslation();
  const { path } = group;
  const current = currentStepOf(session.progress, path);
  const top = group.clean.length ? Math.max(...group.clean.map((p) => p.bpm)) : null;
  const date = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" });
  return (
    <section className="session-prog-path session-glass session-rise" style={rise(i)} data-testid={`progress-path-${path.id}`}>
      <header className="session-prog-head">
        <div className="session-exercise-text">
          <h2 className="session-prog-title">{path.title}</h2>
          <div className="session-quiet">
            {t("session.paths.onStep", { n: current.order, title: current.title })}
          </div>
        </div>
        <Spark
          values={group.clean.map((p) => p.bpm)}
          titles={group.clean.map((p) => `${p.bpm} BPM · ${date.format(p.at)}`)}
          width={132}
          height={40}
          label={t("session.progress.pathSparkLabel", { title: path.title })}
        />
        <div className="session-progress-value" data-none={top === null ? "" : undefined}>
          {top === null ? "–" : top}
          <small>{top === null ? t("session.progress.noCleanShort") : t("session.progress.topClean")}</small>
        </div>
      </header>
      <ul className="session-prog-rows" role="list">
        {group.exercises.map((s) => {
          const last = s.evenness[s.evenness.length - 1];
          const clean = s.clean[s.clean.length - 1]?.bpm;
          return (
            <li className="session-skill" key={s.exerciseId} data-testid={`progress-exercise-${s.exerciseId}`}>
              <div className="session-exercise-text">
                <div className="session-skill-name">{s.title}</div>
                <div className="session-quiet">
                  {clean === undefined
                    ? t("session.paths.playedNoClean", { count: s.takes })
                    : t("session.paths.playedClean", { count: s.takes, bpm: clean })}
                </div>
              </div>
              <Spark values={s.evenness} label={t("session.progress.sparkLabel", { title: s.title })} />
              {last === undefined ? (
                <div className="session-progress-value" data-none="">
                  <small>{t("session.progress.notGraded")}</small>
                </div>
              ) : (
                <div className="session-progress-value">
                  {`${Math.round(last * 100)}%`}
                  <small>{t("session.metric.even")}</small>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Nothing played yet: what will be here, and the one way to get it there (PROG-2). */
function EmptyProgress({ onStart }: { onStart?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="session-prog-empty session-glass session-rise" data-testid="progress-empty">
      <svg className="session-prog-empty-art" viewBox="0 0 220 64" aria-hidden="true">
        <path d="M6 54 H54 V42 H102 V30 H150 V18 H214" />
        <circle cx="214" cy="18" r="5" />
      </svg>
      <h2 className="session-h2">{t("session.progress.emptyTitle")}</h2>
      <p className="session-why">{t("session.progress.emptyBody")}</p>
      {onStart && (
        <button className="session-big" data-size="mid" onClick={onStart} data-testid="progress-start">
          {t("session.progress.emptyStart")}
        </button>
      )}
    </div>
  );
}

export function ProgressView({ session, onStart }: { session: SessionRun; onStart?: () => void }) {
  const { t } = useTranslation();
  const neck3d = useNeck3d();
  const takes = session.progress.takes;
  const groups = useMemo(() => groupsFrom(takes, session.paths), [takes, session.paths]);
  const totals = useMemo(() => totalsFrom(takes, session.paths), [takes, session.paths]);
  const minutes = totals.seconds > 0 && totals.minutes < 1 ? "<1" : String(totals.minutes);

  return (
    <div className="session-page session-progress-page" data-testid="progress" data-neck3d={neck3d}>
      <div className="session-rise">
        <h1 className="session-h1">{t("session.progress.title")}</h1>
        <div className="session-why">{t("session.progress.intro")}</div>
      </div>
      {groups.length === 0 ? (
        <EmptyProgress onStart={onStart} />
      ) : (
        <>
          <div className="session-stat-row" data-testid="progress-totals">
            <Stat i={1} value={minutes} label={t("session.progress.statMinutes")} testId="progress-minutes" />
            <Stat i={2} value={String(totals.sessions)} label={t("session.progress.statSessions")} testId="progress-sessions" />
            <Stat i={3} value={String(totals.streak)} label={t("session.progress.statStreak")} testId="progress-streak" />
          </div>
          <div className="session-prog-paths">
            {groups.map((g, i) => (
              <PathCard key={g.path.id} group={g} session={session} i={i + 4} />
            ))}
          </div>
          <p className="session-footnote">{t("session.progress.cleanMeans")}</p>
        </>
      )}
    </div>
  );
}
