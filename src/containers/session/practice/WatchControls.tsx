/**
 * Watch and Sound, the same two buttons under every view's picture (the Neck's
 * foot row, and the row under the Tab and the Runway): acceptance 5, P1-1.
 * What they do is `useWatch`'s; this only draws them.
 */
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { WatchControl } from "./useWatch";
import { subscribeWatchKeyLabel, watchKeyLabel } from "./watchBus";
import { useFitRow } from "../hooks/useFitOneLine";

export function WatchControls({ watch, compact = false }: { watch: WatchControl; compact?: boolean }) {
  const { t } = useTranslation();
  const watchKey = useSyncExternalStore(subscribeWatchKeyLabel, watchKeyLabel, watchKeyLabel);
  if (!watch.canWatch) return null;
  const { showing, soundOn, hasSound } = watch;
  const full = t(showing ? "session.practice.watchStop" : watch.again ? "session.practice.watchAgain" : "session.practice.watch");
  // In a phone's footer the row is shared with Slower and Faster, and "Watch
  // again" pushed them onto a second line at 390 px. There the word stays
  // "Watch" and the icon turns into a replay; the whole name is still what a
  // screen reader hears.
  const again = compact && !showing && watch.again;
  const word = again ? t("session.practice.watch") : full;
  return (
    <>
      <button
        type="button"
        className="practice-watch"
        data-testid="practice-watch"
        aria-pressed={showing}
        aria-label={compact ? full : undefined}
        data-sound={hasSound && soundOn ? "" : undefined}
        data-again={again ? "" : undefined}
        onClick={watch.toggle}
        title={t(hasSound && soundOn ? "session.practice.watchSoundTitle" : "session.practice.watchTitle")}
      >
        {again ? (
          <svg className="practice-watch-replay" viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
            <path d="M1 4 V10 H7" />
            <path d="M3.51 15 a9 9 0 1 0 2.13 -9.36 L1 10" />
          </svg>
        ) : (
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
            {showing ? <rect x="1.5" y="1.5" width="7" height="7" rx="1" /> : <path d="M2 1 L9 5 L2 9 Z" />}
          </svg>
        )}
        <span className="practice-watch-word">{word}</span>
        {watchKey && <kbd>{watchKey}</kbd>}
      </button>
      {hasSound && (
        <button
          type="button"
          className="practice-sound"
          data-testid="practice-sound"
          aria-pressed={soundOn}
          aria-label={t("session.practice.sound")}
          onClick={watch.toggleSound}
          title={t("session.practice.soundTitle")}
        >
          <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
            <path d="M1.5 4.5 H4 L7 2 V10 L4 7.5 H1.5 Z" />
            {soundOn ? (
              <path d="M8.6 4.2 Q9.8 6 8.6 7.8 M9.9 3 Q11.8 6 9.9 9" fill="none" strokeWidth="1.1" />
            ) : (
              <path d="M8.5 4.3 L11 7.7 M11 4.3 L8.5 7.7" fill="none" strokeWidth="1.1" />
            )}
          </svg>
          {/* The word wherever the row has room; where a phone's row has none
              the switch says on or off by itself (filled, or a muted speaker
              in an empty ring) and by `aria-pressed` (acceptance 5, P2-7). */}
          <span className="practice-sound-word">{t("session.practice.sound")}</span>
        </button>
      )}
    </>
  );
}

/** The row under the Tab and the Runway's pictures: the same buttons the Neck has in its foot. */
export function WatchRow({ watch }: { watch: WatchControl }) {
  if (!watch.canWatch) return null;
  return (
    <div className="practice-watchrow" data-testid="practice-watchrow">
      <WatchControls watch={watch} />
    </div>
  );
}

/**
 * The same two buttons in a phone's sticky footer, on one row with what else
 * the footer carries (Slower and Faster). One row at 360 px and up: Watch
 * keeps its short name, and gives up the word for its icon when the language
 * or the theme's face runs wide (`useFitRow`).
 */
export function WatchFooterRow({ watch, children }: { watch: WatchControl; children?: ReactNode }) {
  const { i18n } = useTranslation();
  // The element, not a ref object: the row is unmounted while Watch is not
  // available, and a row mounted again must be fitted again (`useFitRow`).
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  useFitRow(row, `${i18n.language}|${watch.showing}|${watch.again}|${watch.hasSound}`);
  if (!watch.canWatch) return null;
  return (
    <div className="practice-watchrow" data-place="footer" data-testid="practice-watchrow" ref={setRow}>
      <WatchControls watch={watch} compact />
      {children}
    </div>
  );
}
