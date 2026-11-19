/**
 * Watch and Sound, the same two buttons under every view's picture (the Neck's
 * foot row, and the row under the Tab and the Runway): acceptance 5, P1-1.
 * What they do is `useWatch`'s; this only draws them.
 */
import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { WatchControl } from "./useWatch";
import { subscribeWatchKeyLabel, watchKeyLabel } from "./watchBus";

export function WatchControls({ watch }: { watch: WatchControl }) {
  const { t } = useTranslation();
  const watchKey = useSyncExternalStore(subscribeWatchKeyLabel, watchKeyLabel, watchKeyLabel);
  if (!watch.canWatch) return null;
  const { showing, soundOn, hasSound } = watch;
  return (
    <>
      <button
        type="button"
        className="practice-watch"
        data-testid="practice-watch"
        aria-pressed={showing}
        data-sound={hasSound && soundOn ? "" : undefined}
        onClick={watch.toggle}
        title={t(hasSound && soundOn ? "session.practice.watchSoundTitle" : "session.practice.watchTitle")}
      >
        <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true">
          {showing ? <rect x="1.5" y="1.5" width="7" height="7" rx="1" /> : <path d="M2 1 L9 5 L2 9 Z" />}
        </svg>
        {t(showing ? "session.practice.watchStop" : watch.again ? "session.practice.watchAgain" : "session.practice.watch")}
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
