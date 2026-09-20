/**
 * The band that came with the file, on the stage.
 *
 * `JAM_UX_DECISIONS.md` A13 is the rule: what you change while playing lives
 * where you can reach it with a guitar on. Turning the drums down because the
 * file's kit is loud, or muting the bass to hear your own line under it, is
 * exactly that — so these are here beside the bar range and not behind a
 * sheet. The count-in sits with them because it is the other thing you set in
 * the same breath ("give me a bar, then bars 17 to 24, slowly").
 *
 * Shaped after Jam's `BandLanes`, deliberately: it is the same gesture on the
 * same kind of row, and a musician who has learned one should not have to
 * learn the other. Two things differ, and both follow from a song's band
 * being the FILE's rather than one you built:
 *
 * - **Only the rows the file has.** A file with no bass track has no bass
 *   fader. A control for a player who is not there is a control that does
 *   nothing, and Jam's switch — "is this player in the band at all" — is not
 *   a question anybody can answer about a Guitar Pro file.
 * - **The click is one of the rows.** Over a song the click is a part you
 *   balance against the band rather than the thing the band plays to, and it
 *   arrives at 0.45 for that reason (`song.rs`).
 */
import { useTranslation } from "react-i18next";
import { MAX_COUNT_IN_BARS, SONG_MIX_MAX } from "../../songs/types";
import type { SongLane, SongMixSetting } from "../../songs/songEngine";
import type { SongRole } from "../../songs/types";

/** The metronome's own beater, for the click's row. */
function ClickIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 3h6l4 18H5z" />
      <line x1="7" y1="14" x2="17" y2="14" />
      <line x1="12" y1="20" x2="15" y2="6" />
    </svg>
  );
}

function DrumsIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <ellipse cx="12" cy="8" rx="8" ry="3.2" />
      <path d="M4 8v8c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2V8" />
      <line x1="8" y1="10.6" x2="8" y2="18.6" />
      <line x1="16" y1="10.6" x2="16" y2="18.6" />
    </svg>
  );
}

function BassIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 12c0-2 2-4 4-4h10c2 0 4 2 4 4s-2 4-4 4H7c-2 0-4-2-4-4z" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}

function KeysIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="6" width="19" height="12" rx="1.6" />
      <line x1="8.8" y1="6" x2="8.8" y2="18" />
      <line x1="15.2" y1="6" x2="15.2" y2="18" />
      <rect x="6.6" y="6" width="2.6" height="6.6" fill="currentColor" stroke="none" />
      <rect x="13" y="6" width="2.6" height="6.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function laneIcon(lane: SongLane) {
  if (lane === "click") return <ClickIcon />;
  if (lane === "drums") return <DrumsIcon />;
  if (lane === "bass") return <BassIcon />;
  return <KeysIcon />;
}

export interface SongBandProps {
  setting: SongMixSetting;
  /** The band's rows this file has, in playing order. Never the click. */
  lanes: SongRole[];
  onGain: (lane: SongLane, value: number) => void;
  onMute: (lane: SongLane, muted: boolean) => void;
}

export function SongBand({ setting, lanes, onGain, onMute }: SongBandProps) {
  const { t } = useTranslation();
  const muted = new Set(setting.muted);
  // The click is always there: a song with no band at all still has one
  // fader, and it is the one that decides whether you are playing to a
  // metronome or to nothing.
  const rows: SongLane[] = ["click", ...lanes];

  return (
    <div className="songs-control songs-control-band">
      <span className="songs-control-label">{t("songs.band.label")}</span>
      <div className="songs-band">
        {rows.map((lane) => {
          const off = muted.has(lane);
          return (
            <div className="songs-band-lane" key={lane} data-off={off ? "" : undefined}>
              <span className="songs-band-name">
                {laneIcon(lane)}
                {t(`songs.band.${lane}`)}
              </span>
              {/* A div and not a label: the input carries its own
                  `aria-label`, and a label around it would say the lane
                  twice to a screen reader. */}
              <div className="songs-band-volume">
                <input
                  type="range"
                  min={0}
                  max={SONG_MIX_MAX}
                  step={0.05}
                  value={setting.mix[lane]}
                  aria-label={t("songs.band.levelFor", { lane: t(`songs.band.${lane}`) })}
                  onChange={(e) => onGain(lane, Number(e.target.value))}
                />
                <span className="songs-band-volume-value">
                  {Math.round(setting.mix[lane] * 100)}
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={!off}
                /* `transport-switch` is shell.css and so is on every screen;
                   `jam-switch` is not — jam.css is only loaded by the Jam
                   tab — so the one line it carries is ours. */
                className={`transport-switch songs-band-switch ${off ? "" : "on"}`}
                onClick={() => onMute(lane, !off)}
              >
                <span className="transport-switch-track" aria-hidden="true" />
                <span className="sr-only">
                  {t("songs.band.muteFor", { lane: t(`songs.band.${lane}`) })}
                </span>
              </button>
            </div>
          );
        })}
      </div>
      <p className="songs-control-note">{t("songs.band.note")}</p>
    </div>
  );
}

/**
 * Bars of counting before the first time through.
 *
 * Beside the bar range rather than with the band, because it is about when
 * the piece starts rather than about how loud anybody is — and because "a bar
 * in, then bars 17 to 24" is one sentence a person says to themselves.
 *
 * It is spent on the first pass only, however many times round the loop goes:
 * a count before every repetition would be four bars of waiting in every
 * thirty seconds of practice.
 */
export function SongCountIn({
  bars,
  onChange,
}: {
  bars: number;
  onChange: (bars: number) => void;
}) {
  const { t } = useTranslation();
  const choices = Array.from({ length: MAX_COUNT_IN_BARS + 1 }, (_, i) => i);
  return (
    <div className="songs-control songs-control-countin">
      <span className="songs-control-label">{t("songs.countIn.label")}</span>
      <div className="songs-countin-chips">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            className="songs-chip"
            data-active={bars === choice ? "" : undefined}
            aria-pressed={bars === choice}
            onClick={() => onChange(choice)}
          >
            {choice === 0 ? t("songs.countIn.none") : t("songs.countIn.bars", { count: choice })}
          </button>
        ))}
      </div>
      <p className="songs-control-note">{t("songs.countIn.note")}</p>
    </div>
  );
}
