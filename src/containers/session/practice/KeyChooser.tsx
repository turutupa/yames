/**
 * "Key: B♭ ▾" beside a key-moved Exercise's title on its ready screen (card
 * #93). Quiet on purpose: a word and the key, the chevron the only sign it
 * opens. Any of the Exercise's keys, or a new key each time (the one due
 * next, as Today rotates them). The choice is kept for the Exercise until it is
 * changed (`useSessionRun` `chooseKey`).
 *
 * A native select, unseen over the key it shows: the keyboard, a screen
 * reader and a phone's own picker all come with it.
 */
import { useTranslation } from "react-i18next";
import type { KeyChoice } from "../../../session/variants";
import { keySymbol } from "../../../session/variants";

const IN_TURN = "turn";

export function KeyChooser({
  choices,
  seed,
  chosen,
  onChoose,
}: {
  choices: readonly KeyChoice[];
  /** The variant on the stage. */
  seed: number | null;
  /** The player chose it, rather than it being the next in turn. */
  chosen: boolean;
  onChoose: (seed: number | null) => void;
}) {
  const { t } = useTranslation();
  if (choices.length < 2 || seed === null) return null;
  return (
    <label className="session-keychoice" data-testid="session-keychoice" data-chosen={chosen ? "" : undefined}>
      <span className="session-keychoice-word">{t("session.run.key")}</span>
      <span className="session-keychoice-field">
        {/* What shows: the key on now. The select lies over it, unseen, so it
            is as wide as the key, not as its longest option. */}
        <span className="session-keychoice-value" aria-hidden="true">
          {keySymbol(choices.find((c) => c.seed === seed)?.key ?? "")}
        </span>
        <select
          value={String(seed)}
          onChange={(e) => onChoose(e.target.value === IN_TURN ? null : Number(e.target.value))}
          data-testid="session-keychoice-select"
        >
          {choices.map((c) => (
            <option key={c.seed} value={String(c.seed)}>
              {keySymbol(c.key)}
            </option>
          ))}
          <option value={IN_TURN}>{t("session.run.keyInTurn")}</option>
        </select>
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          <path d="M2 3.5 L5 6.5 L8 3.5" />
        </svg>
      </span>
    </label>
  );
}
