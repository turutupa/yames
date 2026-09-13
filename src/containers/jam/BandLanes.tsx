import { useTranslation } from "react-i18next";
import type { JamBandState } from "../../jam/types";

/** The drum kit on a lane row. */
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

function MicIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 12a6.5 6.5 0 0 0 13 0" />
      <line x1="12" y1="18.5" x2="12" y2="21" />
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

export type BandLaneId = "drums" | "bass" | "keys";

interface Lane {
  id: BandLaneId;
  on: boolean;
  /** "Shuffle · Room kit", "roots and fifths" — what this player is doing. */
  detail: string;
  /** The bass's note names for this bar; empty for the drums. */
  notes?: string[];
  /** This lane's gain, 0..1.5. */
  volume: number;
  /**
   * A control that belongs to this player and nobody else — the keys row's
   * comping style. Drawn between the detail and the notes, where the row has
   * room and where it reads as "and this is how".
   */
  extra?: React.ReactNode;
}

interface BandLanesProps {
  lanes: Lane[];
  onToggle: (id: BandLaneId) => void;
  /** Per-lane volume, 0..1.5. The mix, as opposed to the mute. */
  onVolume: (id: BandLaneId, volume: number) => void;
  /** What the band is doing on the bar being played. */
  bandState: JamBandState;
  isPlaying: boolean;
  /** The instrument you play, translated — the "you" lane's caption. */
  youLabel: string;
  /** Whether the mic is listening, so the "you" lane says something true. */
  listening: boolean;
}

/** The loudest a lane goes. The contract's own ceiling for a gain. */
const MAX_GAIN = 1.5;

/**
 * The band, one row per player, and you at the bottom.
 *
 * The rows exist to answer two questions without a menu: who is playing, and
 * what are they playing right now. So the drums row names the groove and the
 * kit, the bass row shows the notes of THIS bar — which is the only readout on
 * the screen that tells a bass-curious guitarist what the line under them
 * actually is — and the "you" row says what the app thinks you are holding.
 *
 * Volume and mute are both here now, and they are different things. The
 * TOGGLE decides whether the player is in the band at all, and it survives a
 * save because it is a fact about the jam (JAM_MODE §3.1 — a bass player's
 * band has no bass in it). The SLIDER is how loud that player is, which is a
 * fact about the room you are in: a drummer through the same speakers as a
 * bass is a different balance from a drummer in headphones, and turning the
 * kit down is not the same as sending it home.
 */
export function BandLanes({
  lanes,
  onToggle,
  onVolume,
  bandState,
  isPlaying,
  youLabel,
  listening,
}: BandLanesProps) {
  const { t } = useTranslation();

  /** What a lane is doing right now — silent, on hats, or playing. */
  function liveState(id: BandLaneId): string | null {
    if (!isPlaying || bandState === "full") return null;
    if (bandState === "silent") return t("jam.band.out");
    // Only the drummer keeps the hats through a trade; everyone else is out.
    return id === "drums" ? t("jam.band.hatsOnly") : t("jam.band.out");
  }

  function laneIcon(id: BandLaneId) {
    if (id === "drums") return <DrumsIcon />;
    if (id === "bass") return <BassIcon />;
    return <KeysIcon />;
  }

  return (
    <section className="jam-band" aria-label={t("jam.band.label")}>
      <div className="jam-band-head">
        <span className="stage-label">{t("jam.band.label")}</span>
        <span className="jam-band-lead">{t("jam.band.lead")}</span>
      </div>

      {lanes.map((lane) => {
        const live = lane.on ? liveState(lane.id) : null;
        return (
          <div className="jam-band-lane" key={lane.id} data-off={lane.on ? undefined : ""}>
            <span className="jam-band-name">
              {laneIcon(lane.id)}
              {t(`jam.band.${lane.id}`)}
            </span>
            <span className="jam-band-detail">{lane.detail}</span>
            {lane.extra ? <span className="jam-band-extra">{lane.extra}</span> : null}
            <span className="jam-band-live">
              {live ? (
                <span className="jam-band-state">{live}</span>
              ) : lane.notes && lane.notes.length > 0 ? (
                lane.notes.map((note, i) => (
                  <span className="jam-band-note" key={i} data-rest={note ? undefined : ""}>
                    {note}
                  </span>
                ))
              ) : null}
            </span>
            {/* The mix. Disabled with the player, because turning up somebody
                who is not in the band is a control that does nothing, and a
                slider that does nothing is worse than no slider. */}
            {/* A div, not a label: the input carries its own `aria-label`, and
                a label element wrapping it as well would announce the lane
                twice. */}
            <div className="jam-band-volume">
              <input
                type="range"
                min={0}
                max={MAX_GAIN}
                step={0.05}
                value={lane.volume}
                disabled={!lane.on}
                aria-label={t("jam.mix.forLane", { lane: t(`jam.band.${lane.id}`) })}
                onChange={(e) => onVolume(lane.id, Number(e.target.value))}
              />
              <span className="jam-band-volume-value">{Math.round(lane.volume * 100)}</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={lane.on}
              className={`transport-switch jam-switch ${lane.on ? "on" : ""}`}
              onClick={() => onToggle(lane.id)}
            >
              <span className="transport-switch-track" aria-hidden="true" />
              <span className="sr-only">{t(`jam.band.${lane.id}`)}</span>
            </button>
          </div>
        );
      })}

      <div className="jam-band-lane jam-band-you">
        <span className="jam-band-name">
          <MicIcon />
          {t("jam.band.you")}
        </span>
        <span className="jam-band-detail">{youLabel}</span>
        <span className="jam-band-live">
          <span className="jam-band-hint">{t("jam.band.youHint")}</span>
        </span>
        <span className="jam-band-input" data-on={listening ? "" : undefined}>
          {listening ? t("jam.band.inputOn") : t("jam.band.inputOff")}
        </span>
      </div>
    </section>
  );
}
