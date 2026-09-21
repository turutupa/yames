/**
 * The band that came with the file, on the stage.
 *
 * `JAM_UX_DECISIONS.md` A13 is the rule: what you change while playing lives
 * where you can reach it with a guitar on. Turning a guitar down because the
 * file's rhythm part is loud, or muting the drums to hear your own line under
 * them, is exactly that — so these are here beside the bar range and not
 * behind a sheet.
 *
 * ## A row, not a column (2026-09-20, W18)
 *
 * It was four stacked mixer rows, and stacked is what put it 28 px below the
 * bottom of a 900 px window — a control A13 says lives on the stage that you
 * could not reach while playing without scrolling. So each player is one short
 * row now, and the players sit side by side: an icon, a fader, a mute. The
 * name goes when the stage is too narrow to keep it (a container query, so it
 * is the STAGE's width that decides, not the window's — the rail and the coach
 * dock both take from it), and the icon and the fader's own `aria-label` carry
 * the name for anyone who cannot see the picture.
 *
 * ## It does not fold any more (W28, after W29)
 *
 * It used to fold into a chip of its own with the faders in a popover off it,
 * because it was a row of the strip and a narrow stage had no room for one.
 * W29 took the whole band off the strip and put it behind "More", so it is
 * already one press away — and a popover inside a popover is two presses to
 * reach a fader, and a second thing to place inside a window that is only
 * 480 px wide. Both went. The lanes are a column inside the panel, and the
 * panel is what scrolls when a file has a lot of parts.
 *
 * ## One row per TRACK, and the part you are learning is one of them (W28)
 *
 * It used to be the click and Jam's three rows, because those were the only
 * three things a song could play. Now every track in the file sounds, so
 * every track in the file has a row — a file with two guitars has two guitar
 * faders — and the part the player opened the file to learn is the first of
 * them, marked "my part", on by default a few dB under the rest.
 *
 * Two things follow from a band being the file's rather than one you built,
 * and they are why this is shaped after Jam's `BandLanes` without being it:
 *
 * - **There is no "is this player in the band" switch.** A Guitar Pro file
 *   says what is in it. What a player can do is mute a row, or solo one.
 * - **There can be a lot of rows.** So the strip scrolls sideways inside
 *   itself rather than growing, and takes no more of the stage than the band
 *   ever did. Below `FOLD_AT` it folds into one chip with the whole band in a
 *   popover, exactly as it did before.
 */
import { useTranslation } from "react-i18next";
import { SONG_MIX_MAX } from "../../songs/types";
import { gainOf } from "../../songs/songEngine";
import type { SongLane, SongMixSetting } from "../../songs/songEngine";
import type { SongBackingTrack, SongRole } from "../../songs/types";

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

/** Everything else the file has: a guitar, which is what most of them are. */
function StringsIcon() {
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
      <path d="M13.5 10.5 20 4" />
      <path d="M17.6 6.4 19 3l2 2-3.4 1.4" />
      <circle cx="9.5" cy="14.5" r="5.5" />
      <circle cx="9.5" cy="14.5" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** The part the player is learning. A person, not an instrument. */
function MyPartIcon() {
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
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20c0-3.6 3.2-5.6 7.2-5.6s7.2 2 7.2 5.6" />
    </svg>
  );
}

function roleIcon(role: SongRole) {
  if (role === "drums") return <DrumsIcon />;
  if (role === "bass") return <BassIcon />;
  if (role === "keys") return <KeysIcon />;
  return <StringsIcon />;
}

/** One row of the strip: the click, or a track of the file. */
type Row = {
  lane: SongLane;
  name: string;
  icon: React.ReactNode;
  /** Only a track can be soloed, so only a track carries an index. */
  track: number | null;
};

export interface SongBandProps {
  setting: SongMixSetting;
  /** Every track of the file, in the file's own order. Never the click. */
  tracks: SongBackingTrack[];
  onGain: (lane: SongLane, value: number) => void;
  onMute: (lane: SongLane, muted: boolean) => void;
  onSolo: (track: number, soloed: boolean) => void;
}

export function SongBand({ setting, tracks, onGain, onMute, onSolo }: SongBandProps) {
  const { t } = useTranslation();

  const muted = new Set(setting.muted);
  const soloed = new Set(setting.soloed);
  // The click is always there: a song with no band at all still has one
  // fader, and it is the one that decides whether you are playing to a
  // metronome or to nothing. The part being learned comes next, because it is
  // the one row the player is certain to want.
  const rows: Row[] = [
    { lane: "click", name: t("songs.band.click"), icon: <ClickIcon />, track: null },
    ...tracks
      .map((track, index) => ({ track, index }))
      .sort((a, b) => Number(b.track.guide) - Number(a.track.guide))
      .map(({ track, index }) => ({
        lane: index as SongLane,
        // The file's own name for the part, and only "my part" when the file
        // did not bother to name it — a player who called a track "Rhythm"
        // should see "Rhythm".
        name: track.guide ? track.name || t("songs.band.myPart") : track.name,
        icon: track.guide ? <MyPartIcon /> : roleIcon(track.role),
        track: index,
      })),
  ];
  const anySolo = soloed.size > 0;

  return (
    <div className="songs-band" role="group" aria-label={t("songs.band.label")}>
      {rows.map((row) => {
        const rowOff = muted.has(row.lane);
        const rowSolo = row.track !== null && soloed.has(row.track);
        // A track nobody soloed, while somebody else is soloed, is not muted
        // — it is standing down — and it reads as faint for the same reason
        // a muted one does: it is not making a sound.
        const quiet = rowOff || (anySolo && row.track !== null && !rowSolo);
        const { name } = row;
        return (
          <div className="songs-band-lane" key={String(row.lane)} data-off={quiet ? "" : undefined}>
            {/* `title` rather than a tooltip component: below the width the
                name is dropped at, this is the only thing that can still be
                asked "which one is this?" with a mouse. */}
            <span className="songs-band-name" title={name}>
              {row.icon}
              <span className="songs-band-name-text">{name}</span>
            </span>
            <input
              type="range"
              className="songs-band-fader"
              min={0}
              max={SONG_MIX_MAX}
              step={0.05}
              value={gainOf(setting, row.lane)}
              aria-label={t("songs.band.levelFor", { lane: name })}
              onChange={(e) => onGain(row.lane, Number(e.target.value))}
            />
            {/* The number stays, narrow as the row is: Jam's lanes show it
                and a musician who learned that row should not find this one
                answering a different question. */}
            <span className="songs-band-volume-value">
              {Math.round(gainOf(setting, row.lane) * 100)}
            </span>
            {row.track !== null && (
              <button
                type="button"
                /* `aria-pressed` and not `role="switch"`: a switch is a state
                   you leave something in — which is what the mute beside it
                   is — and a solo is a button you hold a passage down with
                   and let go of. Screen readers say "pressed"/"not pressed"
                   rather than "on"/"off", which is the right word for it. */
                aria-pressed={rowSolo}
                className={`songs-band-solo ${rowSolo ? "on" : ""}`}
                onClick={() => onSolo(row.track!, !rowSolo)}
                title={t("songs.band.soloFor", { lane: name })}
              >
                <span aria-hidden="true">{t("songs.band.soloShort")}</span>
                <span className="sr-only">{t("songs.band.soloFor", { lane: name })}</span>
              </button>
            )}
            <button
              type="button"
              role="switch"
              aria-checked={!rowOff}
              /* `transport-switch` is shell.css and so is on every screen;
                 `jam-switch` is not — jam.css is only loaded by the Jam
                 tab — so the one line it carries is ours. */
              className={`transport-switch songs-band-switch ${rowOff ? "" : "on"}`}
              onClick={() => onMute(row.lane, !rowOff)}
            >
              <span className="transport-switch-track" aria-hidden="true" />
              <span className="sr-only">{t("songs.band.muteFor", { lane: name })}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
