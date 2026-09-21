import { useTranslation } from "react-i18next";

interface NowBlockProps {
  /** The chord under your hands right now, spelled for the key you read in. */
  chord: string;
  /** The next chord that is different from this one, and how far off it is. */
  next: { name: string; inBars: number } | null;
  /** Up to three, best first, already named and rooted ("A mixolydian"). */
  scales: string[];
  /**
   * The way through to the chord sheet, shown only where there is a neck to
   * show — guitar and bass. `open` is whether that sheet is down, so the
   * chevron points the way it is about to go.
   */
  fretboardOpen: boolean;
  onToggleFretboard: (() => void) | null;
}

/**
 * The chord you are on, as the largest thing on the screen.
 *
 * JAM_MODE §4.3 asks for exactly this and no more: the chord now, the next one
 * beside it, and the scales that fit. Everything else the harmony modules can
 * work out — every chord of the key, every shape of every chord — is a row
 * further down or behind a tap, because a player mid-chorus can read one thing
 * and this is the one.
 *
 * The "in N bars" is deliberately counted to the next chord that is DIFFERENT.
 * Over a twelve-bar blues bars 1 to 4 are all the I, and "A7 in 1 bar" four
 * times running tells you nothing; "D7 in 4 bars" is the sentence a player
 * actually holds in their head.
 */
export function NowBlock({
  chord,
  next,
  scales,
  fretboardOpen,
  onToggleFretboard,
}: NowBlockProps) {
  const { t } = useTranslation();

  return (
    <div className="jam-now">
      <div className="jam-now-chord">
        <span className="stage-label">{t("jam.now.label")}</span>
        <span className="jam-now-name" role="status" aria-label={t("jam.now.aria", { chord })}>
          {chord}
        </span>
      </div>
      <div className="jam-now-side">
        {next && (
          <span className="jam-now-next">
            {next.inBars <= 0
              ? t("jam.now.nextNow", { chord: next.name })
              : t("jam.now.next", { chord: next.name, count: next.inBars })}
          </span>
        )}
        {scales.length > 0 && (
          <span className="jam-now-scales">{scales.join(" · ")}</span>
        )}
        {onToggleFretboard && (
          <button
            type="button"
            className="jam-now-fretboard"
            aria-expanded={fretboardOpen}
            onClick={onToggleFretboard}
          >
            {t("jam.fretboard.label")}
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              data-open={fretboardOpen ? "" : undefined}
            >
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
