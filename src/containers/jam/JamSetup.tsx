import { useTranslation } from "react-i18next";
import { SHARP_NAMES, TRANSPOSITION_OPTIONS, keyName, noteName } from "../../jam/harmony";
import type { Key, KeyMode, TranspositionOption } from "../../jam/harmony";
import { METER_PRESETS } from "../../constants/metronome";
import { meterKey } from "../../utils/meter";
import type { JamCountInSound } from "../../jam/types";

/** The four kits W3 synthesised. `room` is the one that shipped first. */
export const JAM_KITS = ["room", "tight", "brushes", "electronic"] as const;

const KEY_MODES: KeyMode[] = ["major", "minor", "blues"];

/**
 * The resolutions a jam can run at, as the engine's `Subdivision` values.
 *
 * The same five `JamEngineConfig.ticksPerBeat` allows, and the same five the
 * groove editor names — quarters, eighths, triplets, sixteenths, sextuplets.
 * The labels are the editor's own keys, because a subdivision is a
 * subdivision and two screens naming it differently is two chances to be
 * wrong.
 */
export const JAM_TICKS: readonly (1 | 2 | 3 | 4 | 6)[] = [1, 2, 3, 4, 6];

/** What the count-in plays. The beep is the drill's; the sticks are the drummer's. */
export const COUNT_IN_SOUNDS: readonly JamCountInSound[] = ["beep", "sticks"];

export type JamMeterChoice = { beatGroups: number[]; ticksPerBeat: 1 | 2 | 3 | 4 | 6 };

interface JamSetupProps {
  jamKey: Key;
  onKey: (key: Key) => void;
  kit: string;
  onKit: (kit: string) => void;
  transposition: TranspositionOption;
  onTransposition: (option: TranspositionOption) => void;
  chords: boolean;
  onChords: (on: boolean) => void;
  /** The meter the jam is set to, or null when it follows the groove's own. */
  meter: JamMeterChoice | null;
  /** The groove's own meter, for the default card and the mismatch sentence. */
  grooveMeter: { beatsPerBar: number; ticksPerBeat: number };
  /** What the groove is called, for the sentence that says it does not fit. */
  grooveName: string;
  /** False when the chosen meter means the drummer plays the rule instead. */
  grooveFits: boolean;
  onMeter: (meter: JamMeterChoice | null) => void;
  countInSound: JamCountInSound;
  onCountInSound: (sound: JamCountInSound) => void;
  cues: boolean;
  onCues: (on: boolean) => void;
  /** Whether a voice is installed, so the cues caption can say something true. */
  voiceReady: boolean;
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
  meter,
  grooveMeter,
  grooveName,
  grooveFits,
  onMeter,
  countInSound,
  onCountInSound,
  cues,
  onCues,
  voiceReady,
}: JamSetupProps) {
  const { t } = useTranslation();

  /** The ticks the meter runs at — the jam's, or the groove's when it has none. */
  const ticks = meter?.ticksPerBeat ?? (grooveMeter.ticksPerBeat as 1 | 2 | 3 | 4 | 6);
  const activeGroups = meter ? meterKey(meter.beatGroups) : null;

  /**
   * Picking a meter preset.
   *
   * The ticks come along unchanged, because the two halves are separate
   * decisions: 7/8 in eighths and 7/8 in sixteenths are both 7/8, and a
   * player changing the meter has said nothing about the resolution.
   */
  const pickGroups = (groups: number[]) => onMeter({ beatGroups: [...groups], ticksPerBeat: ticks });

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

      {/* The meter, given to the jam rather than borrowed from the groove.
          A groove declares the meter it was WRITTEN for — a bossa is
          sixteenths in four, a waltz is three — and until now that was the
          only meter a jam could be in. Choosing one here is choosing the bar;
          the drummer follows, playing the written groove where it fits and
          the rule where it does not (JAM_MODE §4.1). */}
      <div className="jam-setup-block">
        <span className="stage-label">
          {t("jam.meter.label")}
          <span className="jam-setup-value">
            {meter ? meter.beatGroups.join(" + ") : t("jam.meter.grooves")}
          </span>
        </span>
        <div className="jam-meters" role="group" aria-label={t("jam.meter.label")}>
          {/* The groove's own, first and default: most jams want the meter
              the groove was written in, and it must be one tap back. */}
          <button
            type="button"
            className={`jam-meter${meter === null ? " active" : ""}`}
            aria-pressed={meter === null}
            onClick={() => onMeter(null)}
          >
            {t("jam.meter.grooves")}
          </button>
          {METER_PRESETS.map((preset) => {
            const on = activeGroups === meterKey(preset.groups);
            return (
              <button
                key={preset.label}
                type="button"
                className={`jam-meter${on ? " active" : ""}`}
                aria-pressed={on}
                onClick={() => pickGroups(preset.groups)}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div
          className="accent-control jam-segmented"
          role="group"
          aria-label={t("jam.meter.ticks")}
        >
          <span className="stage-label accent-label">{t("jam.meter.ticks")}</span>
          <div className="accent-options">
            {JAM_TICKS.map((value) => {
              const on = ticks === value;
              return (
                <button
                  key={value}
                  type="button"
                  className={`accent-option${on ? " active" : ""}`}
                  aria-pressed={on}
                  onClick={() =>
                    onMeter({
                      // Changing only the resolution keeps the bar you are in;
                      // with no meter of its own that is the groove's bar,
                      // written down so the jam now owns both halves.
                      beatGroups: meter ? [...meter.beatGroups] : [grooveMeter.beatsPerBar],
                      ticksPerBeat: value,
                    })
                  }
                >
                  {t(`jam.editor.subdivision.${value}`)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Said plainly, on the screen, rather than left to be noticed by ear.
            The groove card above still looks selected — and it is, it is just
            not what is playing — so this is the only place that can say why
            the drummer sounds like that. */}
        {!grooveFits && (
          <p className="jam-meter-note">
            {t("jam.meter.doesNotFit", {
              groove: grooveName,
              meter: meter ? meter.beatGroups.join("+") : "",
            })}
          </p>
        )}
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

      <div className="jam-setup-block jam-setup-row">
        {/* What the count-in plays. The beep is the drill's and cuts through
            anything; the sticks are the drummer counting the band in on the
            rim, which is what actually happens in a room. */}
        <div
          className="accent-control jam-segmented"
          role="group"
          aria-label={t("jam.countInSound.label")}
        >
          <span className="stage-label accent-label">{t("jam.countInSound.label")}</span>
          <div className="accent-options">
            {COUNT_IN_SOUNDS.map((sound) => (
              <button
                key={sound}
                type="button"
                className={`accent-option${countInSound === sound ? " active" : ""}`}
                aria-pressed={countInSound === sound}
                onClick={() => onCountInSound(sound)}
              >
                {t(`jam.countInSound.${sound}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="jam-cues">
          <button
            type="button"
            role="switch"
            aria-checked={cues}
            className={`transport-switch jam-switch ${cues ? "on" : ""}`}
            onClick={() => onCues(!cues)}
          >
            <span className="transport-switch-track" aria-hidden="true" />
            {t("jam.cues.label")}
          </button>
          {/* Two captions, because there are two true things to say and which
              one applies is not the user's fault. With a voice installed this
              says what will be spoken; without one it says where a voice
              comes from — rather than leaving a switch that does nothing and
              never explains itself. */}
          <span className="jam-cues-hint">
            {voiceReady ? t("jam.cues.hint") : t("jam.cues.noVoice")}
          </span>
        </div>
      </div>
    </section>
  );
}
