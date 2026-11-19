/**
 * "Paths:" on Today, under the minutes (owner, 2026-11-18): the daily mix, or
 * one subscribed Path for a focused day. A segmented row like the minutes when
 * there are three choices or fewer, a menu when there are more. Choosing
 * rebuilds the plan (`focus.ts`).
 */
import { useTranslation } from "react-i18next";
import type { PathDoc } from "../../paths/format";
import { MIX } from "../../session/focus";
import type { TodayFocus } from "../../session/focus";

/** The most choices the segmented row holds; past it, a menu. */
export const FOCUS_SEGMENTS = 3;

export function TodayFocusPicker({
  paths,
  focus,
  onChange,
}: {
  /** The player's subscribed Paths, in their order. */
  paths: readonly PathDoc[];
  focus: TodayFocus;
  onChange: (next: TodayFocus) => void;
}) {
  const { t } = useTranslation();
  const options = [
    { id: MIX, label: t("session.today.focus.mix") },
    ...paths.map((p) => ({ id: p.id, label: p.title })),
  ];
  const labelId = "session-focus-label";
  return (
    <div className="session-today-focus" data-testid="today-focus" data-tour="today-start">
      <div className="session-today-seg-label" id={labelId}>
        {t("session.today.focus.label")}
      </div>
      {options.length <= FOCUS_SEGMENTS ? (
        <div className="session-seg" role="group" aria-labelledby={labelId} data-focus="">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              className={o.id === focus ? "on" : ""}
              aria-pressed={o.id === focus}
              onClick={() => onChange(o.id)}
              data-testid={`today-focus-${o.id}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <span className="session-focus-select">
          <select
            aria-labelledby={labelId}
            value={focus}
            onChange={(e) => onChange(e.target.value)}
            data-testid="today-focus-select"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </span>
      )}
    </div>
  );
}
