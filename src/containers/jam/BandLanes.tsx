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

interface Lane {
  id: "drums" | "bass";
  on: boolean;
  /** "Shuffle · Room kit", "roots and fifths" — what this player is doing. */
  detail: string;
  /** The bass's note names for this bar; empty for the drums. */
  notes?: string[];
}

interface BandLanesProps {
  lanes: Lane[];
  onToggle: (id: "drums" | "bass") => void;
  /** What the band is doing on the bar being played. */
  bandState: JamBandState;
  isPlaying: boolean;
  /** The instrument you play, translated — the "you" lane's caption. */
  youLabel: string;
  /** Whether the mic is listening, so the "you" lane says something true. */
  listening: boolean;
}

/**
 * The band, one row per player, and you at the bottom.
 *
 * The rows exist to answer two questions without a menu: who is playing, and
 * what are they playing right now. So the drums row names the groove and the
 * kit, the bass row shows the notes of THIS bar — which is the only readout on
 * the screen that tells a bass-curious guitarist what the line under them
 * actually is — and the "you" row says what the app thinks you are holding.
 *
 * Volume per lane is not here. A mute is: it is the toggle that decides
 * whether the player is in the band at all, and it is the one that has to
 * survive a save (JAM_MODE §3.1 — a bass player's band has no bass in it, and
 * that is a fact about the jam, not about this session's mix).
 */
export function BandLanes({
  lanes,
  onToggle,
  bandState,
  isPlaying,
  youLabel,
  listening,
}: BandLanesProps) {
  const { t } = useTranslation();

  /** What a lane is doing right now — silent, on hats, or playing. */
  function liveState(id: "drums" | "bass"): string | null {
    if (!isPlaying || bandState === "full") return null;
    if (bandState === "silent") return t("jam.band.out");
    return id === "drums" ? t("jam.band.hatsOnly") : t("jam.band.out");
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
              {lane.id === "drums" ? <DrumsIcon /> : <BassIcon />}
              {t(`jam.band.${lane.id}`)}
            </span>
            <span className="jam-band-detail">{lane.detail}</span>
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
