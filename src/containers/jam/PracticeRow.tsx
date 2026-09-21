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
  /**
   * The chord names down the timeline, and the switch that draws them.
   *
   * It sits in this row because it is a practice tool in exactly the sense
   * the other three are: drop-out bars, trading and the tempo trainer all
   * take support away on purpose, and so does playing a blues with the
   * changes hidden to find out whether you know where the four lands.
   *
   * Recording had this place and gave it up: it was here AND in the setup
   * drawer, and the drawer's copy sits directly above the list of what it has
   * recorded, which is the right side of the app for the one switch in this
   * row that makes a file.
   */
  chords?: boolean;
  onChords?: (next: boolean) => void;
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
export function PracticeRow({ value, onChange, chords, onChords }: PracticeRowProps) {
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

      {/* Each of the four says what it does when you rest on it. Four verbs
          with no explanation is four things to try rather than four things to
          choose — the owner: "these options are not clear what they do". */}
      <div
        className="jam-practice-chip"
        data-on={dropOutOn ? "" : undefined}
        data-explain={t("jam.practice.dropOutExplain")}
      >
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

      <div
        className="jam-practice-chip"
        data-on={tradeOn ? "" : undefined}
        data-explain={t("jam.practice.tradeExplain")}
      >
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

      <div
        className="jam-practice-chip"
        data-on={tempoOn ? "" : undefined}
        data-explain={t("jam.practice.tempoExplain")}
      >
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

      {/* The chord names, last in the row.
          
          Recording used to be here, and it was in the setup drawer as well —
          directly above the list of what it had recorded, which is where it
          belongs: it is the one switch in this row that makes a FILE, and the
          file is in the drawer. The owner: "should we put it in the main
          screen instead of Record the take? ... maybe we can swap them".

          The chord names earn the place recording gave up, because they are
          the same KIND of thing as the three beside them. Drop-out bars,
          Trade and the tempo trainer all take support away on purpose; so
          does playing a blues with the changes hidden, to find out whether
          you know where the four lands. */}
      {onChords && (
        <div
          className="jam-practice-chip"
          data-on={chords ? "" : undefined}
          data-explain-from="right"
          data-explain={t("jam.practice.chordsExplain")}
        >
          <button
            type="button"
            className="jam-practice-text"
            onClick={() => onChords(!chords)}
          >
            {t("jam.chords.names")}
          </button>
          <button
            type="button"
            role="switch"
            aria-checked={!!chords}
            aria-label={t("jam.chords.names")}
            className={`transport-switch jam-switch ${chords ? "on" : ""}`}
            onClick={() => onChords(!chords)}
          >
            <span className="transport-switch-track" aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
