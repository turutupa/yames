/**
 * W6 — Hear it work (ONBOARDING_PLAN §3 W6, success criterion "no fake
 * feedback anywhere").
 *
 * Four beats of count-in, eight beats the user plays along to, and then
 * whatever actually happened. Everything on this screen is real:
 *
 *   - the take runs through the app's own evaluation path
 *     (`setListening` → `start_evaluation`), which is the only path whose
 *     analyzer learns and writes back the per-(instrument, device)
 *     calibration seed. A mock stream here would leave the cache empty and
 *     the user's first real session would pay the warmup cost again;
 *   - the dots are `beat-feedback` events, one per beat, coloured by the same
 *     `FEEDBACK_COLORS` the metronome screen uses;
 *   - the sentence comes from `coachGenerate` with the standard mini-report
 *     context. With no model downloaded that is the Rust phrase bank, which is
 *     real coaching prose — the step never needs an LLM;
 *   - and if nothing was heard, it says so. There is no branch in this file
 *     that invents a score.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import DriftMeter from "../../../components/DriftMeter";
import { accuracyPct } from "../../../coach/reportStats";
import { formatMiniReport, formatMiniReportContext } from "../../../coach/miniReport";
import { ScoreRing } from "../../drill/evaluation";
import { FEEDBACK_COLORS } from "../../../hooks/useEvaluation";
import {
  clearSession,
  closeOpenSegment,
  coachGenerate,
  getSessionReport,
} from "../../../ipc";
import type { BeatFeedback, SessionReport } from "../../../types";
import { useWizardEnv } from "../WizardContext";
import type { WizardStepProps } from "./types";

/** Beats of count-in before the take. The click is already at 80 BPM (W0). */
export const COUNT_IN_BEATS = 4;
/** Beats the user plays along to. */
export const TAKE_BEATS = 8;
/** The tempo the wizard's preview click runs at (`SOFT_CLICK_BPM`). */
const TAKE_BPM = 80;
/** The take is a plain four-beat bar; the wizard never changes the meter. */
const TAKE_TIME_SIGNATURE = 4;

type Phase = "idle" | "countin" | "listening" | "scoring" | "result" | "nothing";

/** A dot counts as heard only when an onset was actually matched to the beat. */
function isHeard(fb: BeatFeedback): boolean {
  return fb.classification !== "miss" && fb.classification !== "skipped";
}

/**
 * One sentence, not a paragraph. The template bank and the LLM both sometimes
 * answer with two or three; W6 has room for one and the coach card is where
 * the full report belongs.
 */
export function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/);
  return (match ? match[0] : trimmed).trim();
}

export function HearItWorkStep({ onBack, isActive }: WizardStepProps) {
  const { t } = useTranslation();
  const { evaluation, instrument, beatTick, startSoftClick } = useWizardEnv();

  const [phase, setPhase] = useState<Phase>("idle");
  const [dots, setDots] = useState<BeatFeedback[]>([]);
  const [report, setReport] = useState<SessionReport | null>(null);
  const [line, setLine] = useState<string | null>(null);

  // The env object is rebuilt on every spectrum event, so its callbacks are
  // read through latest-value refs and never appear in an effect's deps —
  // otherwise the take would restart itself several times a second.
  const setListeningRef = useRef(evaluation.setListening);
  setListeningRef.current = evaluation.setListening;

  // The click has to be running for there to be beats to play along to.
  // Idempotent — W0 normally started it long before this step.
  useEffect(() => {
    if (isActive) startSoftClick();
  }, [isActive, startSoftClick]);

  // Never leave the input open behind us, however the step is left (Next,
  // Back, Skip, or the whole wizard closing mid-take).
  useEffect(() => () => setListeningRef.current(false), []);

  // --- Collecting the dots -------------------------------------------------
  // `lastFeedback` is one event per beat at 80 BPM (750 ms apart), so reading
  // the latest one per render loses nothing. Only beats inside the take count:
  // the count-in exists precisely so the user's first fumbled bar is not part
  // of the result.
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  const { lastFeedback } = evaluation;
  useEffect(() => {
    if (!lastFeedback) return;
    if (phaseRef.current !== "listening") return;
    setDots((prev) => (prev.length >= TAKE_BEATS ? prev : [...prev, lastFeedback]));
  }, [lastFeedback]);

  // --- The take ------------------------------------------------------------
  const startTickRef = useRef(0);
  const finishingRef = useRef(false);
  // `finish` reads the dots collected so far; a ref keeps them out of its deps
  // so the beat effect below never re-runs against a stale closure.
  const dotsRef = useRef(dots);
  dotsRef.current = dots;

  const start = useCallback(() => {
    setDots([]);
    setReport(null);
    setLine(null);
    finishingRef.current = false;
    startTickRef.current = beatTick;
    setPhase("countin");
    setListeningRef.current(true);
  }, [beatTick]);

  const finish = useCallback(async () => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setPhase("scoring");
    let taken: SessionReport | null = null;
    try {
      // Close the open segment first: `get_session_report` only returns the
      // scored formula result once the analyzer has pushed the segment.
      await closeOpenSegment();
      taken = await getSessionReport();
    } catch {
      // A backend that cannot answer is a "heard nothing", never a made-up
      // score — the branch below treats a null report exactly that way.
    }
    setListeningRef.current(false);
    setReport(taken);

    const heardAny = dotsRef.current.some(isHeard);
    if (!heardAny || !taken || taken.hitsCount === 0) {
      setPhase("nothing");
      return;
    }

    // The template path is the default: `coach_generate` answers from the Rust
    // phrase bank when no model is loaded, so this needs no download. If it
    // fails or times out, fall back to the metrics line — still measured, still
    // true, just less friendly.
    let sentence = formatMiniReport(taken);
    try {
      const context = formatMiniReportContext(
        TAKE_BPM,
        TAKE_TIME_SIGNATURE,
        accuracyPct(taken),
        taken,
        t(`instrument.${instrument}`),
      );
      const generated = await coachGenerate(context);
      if (generated.trim()) sentence = firstSentence(generated);
    } catch {
      /* keep the metrics line */
    }
    setLine(sentence);
    setPhase("result");
  }, [instrument, t]);

  // Beats drive the phases. `beatTick` counts main beats only (the shell
  // filters subdivisions), so the arithmetic is in beats, not events.
  useEffect(() => {
    const elapsed = beatTick - startTickRef.current;
    if (phase === "countin" && elapsed >= COUNT_IN_BEATS) {
      startTickRef.current = beatTick;
      setPhase("listening");
      // Clear here, not at the button: the count-in beats are scored like any
      // other and would otherwise land in the report as eight silent misses.
      void clearSession();
      return;
    }
    if (phase === "listening" && elapsed >= TAKE_BEATS) {
      void finish();
    }
  }, [beatTick, phase, finish]);

  const elapsed = beatTick - startTickRef.current;
  const countdown = Math.max(0, COUNT_IN_BEATS - elapsed);
  const beatsDone = phase === "listening" ? Math.min(TAKE_BEATS, elapsed) : 0;
  const running = phase === "countin" || phase === "listening";

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.hearItWork.title")}
      </h2>
      <p className="onboarding-step-subtitle">{t("onboarding.hearItWork.subtitle")}</p>

      {/* The dots: eight slots, filled as the beats are scored. Empty slots
          are empty, not grey "misses" — nothing has happened there yet. */}
      <div
        className="onboarding-hiw-dots"
        role="group"
        aria-label={t("onboarding.hearItWork.dotsLabel")}
        data-testid="hiw-dots"
      >
        {Array.from({ length: TAKE_BEATS }, (_, i) => {
          const fb = dots[i];
          const color = fb
            ? FEEDBACK_COLORS[fb.classification as keyof typeof FEEDBACK_COLORS] ??
              FEEDBACK_COLORS.miss
            : undefined;
          return (
            <span
              key={i}
              className={`onboarding-hiw-dot${fb ? " filled" : ""}`}
              data-testid={`hiw-dot-${i}`}
              data-classification={fb?.classification ?? "pending"}
              style={color ? { backgroundColor: color } : undefined}
            />
          );
        })}
      </div>

      <DriftMeter
        lastFeedback={evaluation.lastFeedback}
        avgDeviation={evaluation.avgDeviation}
        visible={running || phase === "result"}
      />

      <div className="onboarding-hiw-stage" data-testid="hiw-stage" data-phase={phase}>
        {phase === "idle" && (
          <>
            <p className="onboarding-hiw-hint">{t("onboarding.hearItWork.ready")}</p>
            <button
              type="button"
              className="onboarding-btn onboarding-btn-primary"
              onClick={start}
              data-testid="hiw-start"
            >
              {t("onboarding.hearItWork.start")}
            </button>
          </>
        )}

        {phase === "countin" && (
          <p className="onboarding-hiw-count" role="status" data-testid="hiw-countin">
            {/* `beats`, not `count`: `count` is i18next's plural selector and
                would demand per-language plural keys for a bare number. */}
            {t("onboarding.hearItWork.countIn", { beats: countdown })}
          </p>
        )}

        {phase === "listening" && (
          <p className="onboarding-hiw-count" role="status" data-testid="hiw-listening">
            {t("onboarding.hearItWork.playing", {
              beat: Math.min(TAKE_BEATS, beatsDone + 1),
              total: TAKE_BEATS,
            })}
          </p>
        )}

        {phase === "scoring" && (
          <p className="onboarding-hiw-hint" role="status">
            {t("onboarding.hearItWork.scoring")}
          </p>
        )}

        {phase === "result" && report && (
          <div className="onboarding-hiw-result" data-testid="hiw-result">
            <ScoreRing score={report.score} size={72} strokeWidth={6} />
            <p className="onboarding-hiw-line">{line}</p>
          </div>
        )}

        {phase === "nothing" && (
          <div className="onboarding-hiw-nothing" data-testid="hiw-nothing">
            <p className="onboarding-hiw-line">{t("onboarding.hearItWork.nothing")}</p>
            <div className="onboarding-hiw-actions">
              <button
                type="button"
                className="onboarding-btn onboarding-btn-primary"
                onClick={onBack}
                data-testid="hiw-back-to-input"
              >
                {t("onboarding.hearItWork.backToInput")}
              </button>
              <button
                type="button"
                className="onboarding-btn onboarding-btn-ghost"
                onClick={start}
                data-testid="hiw-retry"
              >
                {t("onboarding.hearItWork.again")}
              </button>
            </div>
          </div>
        )}

        {phase === "result" && (
          <button
            type="button"
            className="onboarding-btn onboarding-btn-ghost onboarding-hiw-again"
            onClick={start}
            data-testid="hiw-again"
          >
            {t("onboarding.hearItWork.again")}
          </button>
        )}
      </div>
    </div>
  );
}
