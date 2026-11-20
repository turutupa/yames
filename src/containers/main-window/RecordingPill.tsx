/**
 * Shown while a recording session is on (card #109): that it is recording,
 * how much, and the one manual input of a session, "felt off", which flags
 * the current or last Take. A tap target here; the M key on a keyboard.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { captureNow, formatBytes, markFeltOff, MARK_KEY, onCapture } from "../../settings/recordingSession";

/** A key press that is the mark: M alone, not typed into a field, not held. */
export function isMarkKey(e: KeyboardEvent): boolean {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return false;
  if (e.key.toLowerCase() !== MARK_KEY) return false;
  const el = e.target as HTMLElement | null;
  const tag = el?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return false;
  return true;
}

export function RecordingPill() {
  const { t } = useTranslation();
  const [status, setStatus] = useState(captureNow);
  const [marked, setMarked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => onCapture(setStatus), []);
  const mark = () => {
    void markFeltOff().then((ok) => {
      if (!ok) return;
      setMarked(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMarked(false), 1500);
    });
  };
  const markRef = useRef(mark);
  markRef.current = mark;
  useEffect(() => {
    if (!status.active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isMarkKey(e)) return;
      e.preventDefault();
      markRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status.active]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!status.active) return null;
  return (
    <div
      className={`recording-pill${status.warn || status.stopped ? " warn" : ""}`}
      role="status"
      data-testid="recording-pill"
      title={status.dir ?? ""}
    >
      <span className="recording-pill-dot" aria-hidden />
      <span>
        {status.stopped
          ? t("settings.recordingSession.pillStopped")
          : t("settings.recordingSession.pill", { takes: status.takes, size: formatBytes(status.bytes) })}
      </span>
      <button className={`recording-pill-mark${marked ? " marked" : ""}`} onClick={mark} data-testid="recording-pill-mark">
        {marked ? t("settings.recordingSession.marked") : t("settings.recordingSession.mark")}
      </button>
    </div>
  );
}
