import { useTranslation } from "react-i18next";
import { SHARP_NAMES, TRANSPOSITION_OPTIONS, keyName, noteName } from "../../jam/harmony";
import type { Key, KeyMode, TranspositionOption } from "../../jam/harmony";

/** The four kits W3 synthesised. `room` is the one that shipped first. */
export const JAM_KITS = ["room", "tight", "brushes", "electronic"] as const;

const KEY_MODES: KeyMode[] = ["major", "minor", "blues"];

interface JamSetupProps {
  jamKey: Key;
  onKey: (key: Key) => void;
  kit: string;
  onKit: (kit: string) => void;
  transposition: TranspositionOption;
  onTransposition: (option: TranspositionOption) => void;
  chords: boolean;
  onChords: (on: boolean) => void;
}

/**
 * What the jam is in, and what it sounds like: key, kit, and the part you read.
 *
 * Everything here is a card you can tap with a plectrum in your hand
 * (JAM_MODE §3.4). The key is two rows rather than a dropdown because twelve
 * roots and three modes is a shape a player recognises, and a dropdown of
 * thirty-six is not; the kit is four cards with a line each, because the
 * difference between "room" and "tight" is a sentence and not a word.
 *
 * The roots are written sharp here, and only here. A key picker has no key to
 * spell itself in yet — that is what you are choosing — so it uses the one
 * naming that is complete, and from the moment you pick, everything else on
 * the screen spells from the key's own signature.
 */
export function JamSetup({
  jamKey,
  onKey,
  kit,
  onKit,
  transposition,
  onTransposition,
  chords,
  onChords,
}: JamSetupProps) {
  const { t } = useTranslation();

  return (
    <section className="jam-setup" aria-label={t("jam.setup.label")}>
      <div className="jam-setup-block">
        <span className="stage-label">
          {t("jam.key.label")}
          <span className="jam-setup-value">{keyName(jamKey)}</span>
        </span>
        <div className="jam-keys" role="group" aria-label={t("jam.key.label")}>
          {SHARP_NAMES.map((name, root) => (
            <button
              key={name}
              type="button"
              className={`jam-key${jamKey.root === root ? " active" : ""}`}
              aria-pressed={jamKey.root === root}
              onClick={() => onKey({ ...jamKey, root })}
            >
              {noteName(root, "sharp")}
            </button>
          ))}
        </div>
        <div className="accent-control jam-segmented" role="group" aria-label={t("jam.key.mode")}>
          <div className="accent-options">
            {KEY_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                className={`accent-option${jamKey.mode === mode ? " active" : ""}`}
                aria-pressed={jamKey.mode === mode}
                onClick={() => onKey({ ...jamKey, mode })}
              >
                {t(`jam.key.${mode}`)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="jam-setup-block">
        <span className="stage-label">{t("jam.kit.label")}</span>
        <div className="jam-cards jam-cards-kit">
          {JAM_KITS.map((id) => (
            <button
              key={id}
              type="button"
              className={`sub-row-btn jam-card jam-card-form${kit === id ? " active" : ""}`}
              aria-pressed={kit === id}
              onClick={() => onKit(id)}
            >
              <span className="jam-card-title">{t(`jam.kit.${id}`)}</span>
              <span className="jam-card-hint">{t(`jam.kit.${id}Hint`)}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="jam-setup-block jam-setup-row">
        <div
          className="accent-control jam-segmented"
          role="group"
          aria-label={t("jam.transposition.label")}
        >
          <span className="stage-label accent-label">{t("jam.transposition.label")}</span>
          <div className="accent-options">
            {TRANSPOSITION_OPTIONS.map((option: TranspositionOption) => (
              <button
                key={option}
                type="button"
                className={`accent-option${transposition === option ? " active" : ""}`}
                aria-pressed={transposition === option}
                onClick={() => onTransposition(option)}
              >
                {t(`jam.transposition.${option}`)}
              </button>
            ))}
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={chords}
          className={`transport-switch jam-switch ${chords ? "on" : ""}`}
          title={t("jam.chords.hint")}
          onClick={() => onChords(!chords)}
        >
          <span className="transport-switch-track" aria-hidden="true" />
          {t("jam.chords.label")}
        </button>
      </div>
    </section>
  );
}
