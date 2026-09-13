import { useTranslation } from "react-i18next";
import { VIBES, applyVibe } from "../../jam/vibesContract";
import type { Vibe, VibePatch } from "../../jam/vibesContract";
import type { Jam } from "../../jam/types";

interface VibePickerProps {
  /** The jam being set up — for which tile is lit and which of yours to list. */
  jam: Jam;
  /** Every saved jam, so a vibe can start from one of yours (A9). */
  jams: readonly Jam[];
  onApply: (patch: VibePatch) => void;
  /** Load one of your own saved jams of this vibe. */
  onLoadOwn: (jam: Jam) => void;
}

/**
 * Eight tiles, and the variations of whichever one is picked.
 *
 * This is the thirty-second rule made real (JAM_UX_DECISIONS A2). Before it,
 * a rock drummer meant knowing to set five controls — groove, feel, intensity,
 * kit, form — and the first starter jam was a shuffle at 92, so the first
 * impression was bluesy whatever you meant. One tap now sets the drummer, the
 * kit, the voices, the tempo and the key together, and every control below is
 * a refinement of it.
 *
 * The second row (A9) is depth for a player who lives in one family: Rock is
 * six different drummers, each a groove, a kit, a feel and a loudness
 * together, and none of them is an extra control. "One of yours" is the same
 * row's last chip — a variation you tuned and saved is a way of playing rock
 * exactly as classic and punk are.
 */
export function VibePicker({ jam, jams, onApply, onLoadOwn }: VibePickerProps) {
  const { t } = useTranslation();

  const picked: Vibe | null = VIBES.find((v) => v.id === jam.vibe) ?? null;

  /** Your saved jams of the picked vibe, newest first. Excludes this one. */
  const yours = picked
    ? jams.filter((j) => j.vibe === picked.id && j.id !== jam.id).slice().reverse()
    : [];

  /** "8ths · Tight · 120" — what the tile promises, in three words. */
  const tileLine = (vibe: Vibe) =>
    [
      t(`jam.groove.${vibe.grooveId}`, { defaultValue: vibe.grooveId }),
      t(`jam.kit.${vibe.kit}`, { defaultValue: vibe.kit }),
      String(vibe.bpm),
    ].join(" · ");

  return (
    <>
      {/* The stub state. VIBES is empty until the vibe data lands, and eight
          tiles that do nothing would be worse than a sentence saying so. */}
      {VIBES.length === 0 ? (
        <p className="jam-sheet-note">{t("jam.vibe.unavailable")}</p>
      ) : (
        <div className="jam-vibes" role="group" aria-label={t("jam.vibe.label")}>
          {VIBES.map((vibe) => {
            const on = jam.vibe === vibe.id;
            return (
              <button
                key={vibe.id}
                type="button"
                className={`sub-row-btn jam-card jam-vibe${on ? " active" : ""}`}
                aria-pressed={on}
                onClick={() => onApply(applyVibe(jam, vibe))}
              >
                <span className="jam-card-title">
                  {t(`jam.vibe.${vibe.id}`, { defaultValue: vibe.id })}
                </span>
                <span className="jam-card-hint">
                  {on && vibe.variations.length > 0
                    ? t("jam.variation.count", { count: vibe.variations.length })
                    : tileLine(vibe)}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {picked && picked.variations.length > 0 && (
        <div className="jam-variations-block">
          <div className="jam-sheet-group-head">
            <span className="stage-label">
              {t("jam.variation.label", {
                vibe: t(`jam.vibe.${picked.id}`, { defaultValue: picked.id }),
              })}
            </span>
            <span className="jam-sheet-lead">{t("jam.variation.lead")}</span>
          </div>
          <div className="jam-variations" role="group" aria-label={t("jam.variation.aria")}>
            {picked.variations.map((variation) => {
              const on = jam.variation === variation.id;
              return (
                <button
                  key={variation.id}
                  type="button"
                  className={`jam-chip${on ? " active" : ""}`}
                  aria-pressed={on}
                  onClick={() => onApply(applyVibe(jam, picked, variation.id))}
                >
                  {t(`jam.variation.${variation.id}`, { defaultValue: variation.id })}
                </button>
              );
            })}

            {/* "One of yours". A jam you tuned and saved is a way of playing
                this vibe, so it belongs in this row and nowhere else — but it
                LOADS a jam rather than patching this one, because that is what
                it is: your jam, not a variation of the one on the stage. */}
            <span className="jam-chip-group">
              <span className="jam-chip-group-label">{t("jam.variation.yours")}</span>
              {yours.length === 0 ? (
                <span className="jam-chip-empty">{t("jam.variation.yoursEmpty")}</span>
              ) : (
                yours.map((own) => (
                  <button
                    key={own.id}
                    type="button"
                    className="jam-chip jam-chip-own"
                    onClick={() => onLoadOwn(own)}
                  >
                    {own.name}
                  </button>
                ))
              )}
            </span>
          </div>
        </div>
      )}
    </>
  );
}
