/**
 * Progress: only what was measured, and it says so.
 *
 * One headline chart, clean tempo over time for the Exercise most recently moved,
 * and one row per Exercise played with its own trend. A single series each, so no
 * legend: the heading names it. The rows are the table view of the same numbers.
 */
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { PathTakeRow } from "../../ipc";
import { factsOf } from "../../session/progress";
import { findExercise } from "../../session/packs";
import { CLEAN_TEMPO_MIN_BARS } from "../../session/grade";
import type { SessionRun } from "./hooks/useSessionRun";
import "../../styles/session.css";

type Series = {
  exerciseId: string;
  title: string;
  /** Clean tempo as it rose, oldest first. */
  clean: Array<{ at: number; bpm: number }>;
  /** Evenness per heard Take, oldest first. */
  evenness: number[];
  takes: number;
};

function seriesFrom(session: SessionRun): Series[] {
  const byExercise = new Map<string, PathTakeRow[]>();
  for (const take of [...session.progress.takes].reverse()) {
    const list = byExercise.get(take.exerciseId) ?? [];
    list.push(take);
    byExercise.set(take.exerciseId, list);
  }
  const out: Series[] = [];
  for (const [exerciseId, takes] of byExercise) {
    const path = session.paths.find((p) => p.id === takes[0].pathId);
    const found = path ? findExercise(path, exerciseId) : null;
    const clean: Series["clean"] = [];
    const evenness: number[] = [];
    for (const take of takes) {
      const measured = factsOf(take).measures?.evenness;
      if (take.caught && typeof measured === "number") evenness.push(measured);
      const best = clean[clean.length - 1]?.bpm ?? 0;
      if (take.passed && take.bars >= CLEAN_TEMPO_MIN_BARS && take.bpm > best) {
        clean.push({ at: take.startedAt, bpm: take.bpm });
      }
    }
    out.push({
      exerciseId,
      title: found?.exercise.title ?? exerciseId,
      clean,
      evenness,
      takes: takes.length,
    });
  }
  return out;
}

/** A value's trend in a row. Decorative beside the number it sits next to. */
function Spark({ values, label }: { values: readonly number[]; label: string }) {
  if (values.length < 2) return <span className="session-spark-none" />;
  const W = 120;
  const H = 34;
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
    </svg>
  );
}

/** Clean tempo only ever steps up, so it is drawn as steps, on one axis. */
function CleanChart({ series, label }: { series: Series; label: string }) {
  const { i18n } = useTranslation();
  const points = series.clean;
  const W = 520;
  const H = 200;
  const left = 36;
  const bottom = 22;
  const top = 12;
  const right = 14;
  const lo = Math.min(...points.map((p) => p.bpm)) - 10;
  const hi = Math.max(...points.map((p) => p.bpm)) + 10;
  const first = points[0].at;
  const last = Math.max(points[points.length - 1].at, first + 1);
  const x = (at: number) => left + ((at - first) / (last - first)) * (W - left - right);
  const y = (bpm: number) => top + ((hi - bpm) / (hi - lo)) * (H - top - bottom);
  let d = `M${x(points[0].at).toFixed(1)} ${y(points[0].bpm).toFixed(1)}`;
  for (let i = 1; i < points.length; i += 1) {
    d += `H${x(points[i].at).toFixed(1)}V${y(points[i].bpm).toFixed(1)}`;
  }
  const date = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" });
  return (
    <svg className="session-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {[lo, hi].map((v) => (
        <g key={v}>
          <line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className="session-chart-grid" />
          <text x={left - 6} y={y(v) + 4} textAnchor="end" className="session-chart-axis">
            {v}
          </text>
        </g>
      ))}
      <text x={left} y={H - 5} className="session-chart-axis">
        {date.format(first)}
      </text>
      <text x={W - right} y={H - 5} textAnchor="end" className="session-chart-axis">
        {date.format(last)}
      </text>
      <path d={d} className="session-chart-line" fill="none" />
      {points.map((p) => (
        <g key={p.at}>
          <circle cx={x(p.at)} cy={y(p.bpm)} r="4" className="session-chart-dot" />
          {/* A bigger target than the mark, carrying the value on hover. */}
          <circle cx={x(p.at)} cy={y(p.bpm)} r="12" fill="transparent">
            <title>{`${p.bpm} BPM · ${date.format(p.at)}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}

export function ProgressView({ session }: { session: SessionRun }) {
  const { t } = useTranslation();
  const series = useMemo(() => seriesFrom(session), [session.progress, session.paths]); // eslint-disable-line react-hooks/exhaustive-deps

  // The one that moved last gets the chart.
  const headline = useMemo(() => {
    let best: Series | null = null;
    for (const s of series) {
      const at = s.clean[s.clean.length - 1]?.at ?? -1;
      if (at >= 0 && (!best || at > (best.clean[best.clean.length - 1]?.at ?? -1))) best = s;
    }
    return best;
  }, [series]);

  return (
    <div className="session-page session-progress" data-testid="progress">
      <div>
        <h2 className="session-h2">{t("session.progress.title")}</h2>
        <div className="session-why">{t("session.progress.intro")}</div>
      </div>
      {series.length === 0 ? (
        <div className="session-card" data-testid="progress-empty">
          <div className="session-why">{t("session.progress.empty")}</div>
        </div>
      ) : (
        <div className="session-split">
          <div className="session-col">
            <div className="session-kick">{t("session.progress.cleanTempo")}</div>
            {headline ? (
              <>
                <div className="session-moved">
                  <span className="session-h1">
                    {headline.clean[headline.clean.length - 1].bpm}
                  </span>
                  <span className="session-quiet">
                    {t("session.progress.bpmOn", { title: headline.title })}
                  </span>
                </div>
                {headline.clean.length > 1 && (
                  <CleanChart
                    series={headline}
                    label={t("session.progress.chartLabel", { title: headline.title })}
                  />
                )}
                <div className="session-why">{t("session.progress.cleanMeans")}</div>
              </>
            ) : (
              <div className="session-why">{t("session.progress.noClean")}</div>
            )}
          </div>
          <div className="session-col">
            <div className="session-kick">{t("session.progress.exercises")}</div>
            {series.map((s) => {
              const last = s.evenness[s.evenness.length - 1];
              const clean = s.clean[s.clean.length - 1]?.bpm;
              return (
                <div className="session-progress-row" key={s.exerciseId}>
                  <div className="session-exercise-text">
                    <div className="session-plan-title">{s.title}</div>
                    <div className="session-quiet">
                      {clean === undefined
                        ? t("session.paths.playedNoClean", { count: s.takes })
                        : t("session.paths.playedClean", { count: s.takes, bpm: clean })}
                    </div>
                  </div>
                  <Spark
                    values={s.evenness}
                    label={t("session.progress.sparkLabel", { title: s.title })}
                  />
                  <div className="session-progress-value">
                    {last === undefined ? "–" : `${Math.round(last * 100)}%`}
                    <small>{t("session.metric.even")}</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
