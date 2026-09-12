import { useTranslation } from "react-i18next";
import type { JamPracticeSettings } from "../../jam/types";

/** No tool on. What an absent `practice` field means, written out. */
export const NO_PRACTICE: JamPracticeSettings = {
  dropOutEvery: 0,
  dropOutBars: 0,
  tradeBars: 0,
  tempoStep: 0,
  tempoEveryChoruses: 0,
};

/** The drop-out choices, in the order the board lists them. */
const DROP_OUT_EVERY = [0, 4, 8, 16];
const DROP_OUT_BARS = [1, 2];
const TRADE_BARS = [0, 2, 4, 8];
const TEMPO_STEPS = [0, 2, 4];
const TEMPO_EVERY = [1, 2];

interface PracticeRowProps {
  value: JamPracticeSettings;
  onChange: (next: JamPracticeSettings) => void;
}

/**
 * Drop-outs, trading and the tempo trainer, as three switches with a choice
 * inside each.
 *
 * These are the tools that only make sense over a band (JAM_MODE §4.4), and
 * they are the reason the mode is worth having for a drummer at all. Each is
 * one switch, because the answer is almost always yes or no and the number is
 * a preference you set once; the number is on the same control rather than
 * behind it, because a player who is about to be dropped for two bars wants to
 * read "every 8, for 2" without opening anything.
 *
 * Off is `0` on both halves of a pair, so a switch turned off keeps the number
 * it had and turning it back on does not ask again.
 */
export function PracticeRow({ value, onChange }: PracticeRowProps) {
  const { t } = useTranslation();

  const dropOutOn = value.dropOutEvery > 0 && value.dropOutBars > 0;
  const tradeOn = value.tradeBars > 0;
  const tempoOn = value.tempoStep > 0 && value.tempoEveryChoruses > 0;

  /** Walk to the next option in a list, wrapping. Used by every chip. */
  function step(list: number[], from: number): number {
    const at = list.indexOf(from);
    return list[(at + 1 + list.length) % list.length];
  }

  return (
    <section className="jam-practice" aria-label={t("jam.practice.label")}>
      <span className="stage-label">{t("jam.practice.label")}</span>

      <div className="jam-practice-chip" data-on={dropOutOn ? "" : undefined}>
        <button
          type="button"
          className="jam-practice-text"
          onClick={() =>
            onChange({
              ...value,
              dropOutEvery: step(DROP_OUT_EVERY, value.dropOutEvery),
              dropOutBars: value.dropOutBars || 1,
            })
          }
        >
          {dropOutOn
            ? t("jam.practice.dropOutEvery", {
                count: value.dropOutEvery,
                bars: value.dropOutBars,
              })
            : t("jam.practice.dropOut")}
        </button>
        {dropOutOn && (
          <button
            type="button"
            className="jam-practice-step"
            aria-label={t("jam.practice.dropOutBarsLabel")}
            onClick={() => onChange({ ...value, dropOutBars: step(DROP_OUT_BARS, value.dropOutBars) })}
          >
            {t("jam.practice.forBars", { count: value.dropOutBars })}
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={dropOutOn}
          aria-label={t("jam.practice.dropOut")}
          className={`transport-switch jam-switch ${dropOutOn ? "on" : ""}`}
          onClick={() =>
            onChange({
              ...value,
              dropOutEvery: dropOutOn ? 0 : value.dropOutEvery || 8,
              dropOutBars: value.dropOutBars || 2,
            })
          }
        >
          <span className="transport-switch-track" aria-hidden="true" />
        </button>
      </div>

      <div className="jam-practice-chip" data-on={tradeOn ? "" : undefined}>
        <button
          type="button"
          className="jam-practice-text"
          onClick={() => onChange({ ...value, tradeBars: step(TRADE_BARS, value.tradeBars) })}
        >
          {tradeOn ? t("jam.practice.tradeN", { count: value.tradeBars }) : t("jam.practice.trade")}
        </button>
        <button
          type="button"
          role="switch"
          aria-checked={tradeOn}
          aria-label={t("jam.practice.trade")}
          className={`transport-switch jam-switch ${tradeOn ? "on" : ""}`}
          onClick={() => onChange({ ...value, tradeBars: tradeOn ? 0 : 4 })}
        >
          <span className="transport-switch-track" aria-hidden="true" />
        </button>
      </div>

      <div className="jam-practice-chip" data-on={tempoOn ? "" : undefined}>
        <button
          type="button"
          className="jam-practice-text"
          onClick={() =>
            onChange({
              ...value,
              tempoStep: step(TEMPO_STEPS, value.tempoStep),
              tempoEveryChoruses: value.tempoEveryChoruses || 2,
            })
          }
        >
          {tempoOn
            ? t("jam.practice.tempoUp", {
                step: value.tempoStep,
                count: value.tempoEveryChoruses,
              })
            : t("jam.practice.tempo")}
        </button>
        {tempoOn && (
          <button
            type="button"
            className="jam-practice-step"
            aria-label={t("jam.practice.tempoEveryLabel")}
            onClick={() =>
              onChange({
                ...value,
                tempoEveryChoruses: step(TEMPO_EVERY, value.tempoEveryChoruses),
              })
            }
          >
            {t("jam.practice.everyChoruses", { count: value.tempoEveryChoruses })}
          </button>
        )}
        <button
          type="button"
          role="switch"
          aria-checked={tempoOn}
          aria-label={t("jam.practice.tempo")}
          className={`transport-switch jam-switch ${tempoOn ? "on" : ""}`}
          onClick={() =>
            onChange({
              ...value,
              tempoStep: tempoOn ? 0 : value.tempoStep || 4,
              tempoEveryChoruses: value.tempoEveryChoruses || 2,
            })
          }
        >
          <span className="transport-switch-track" aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
