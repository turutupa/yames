/**
 * W2's theme preview: what a theme does to the learning side (owner,
 * 2026-11-18: themes drive the whole learning screen now).
 *
 * A small Today card over the practice neck, both in the previewed theme. The
 * card is real markup wearing the theme's own tokens inline, so its colours
 * and faces are the theme's while the wizard around it keeps its fixed
 * palette. The neck is the real `FallbackNeck` — the flat graphic neck the
 * practice screen draws when it has no WebGL, which is the same design —
 * handed the palette `neckTheme.ts` derives from the same tokens.
 */
import { useMemo } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { FallbackNeck } from "../../../stage3d/FallbackNeck";
import type { NeckNote, NeckView } from "../../../stage3d/api";
import { paletteFrom } from "../../../stage3d/neckTheme";
import { getThemeById } from "../../../themes";
import { stepTitle } from "../../session/TodayView";
import type { SessionPlan } from "../../../session/planner";

/** Box 1 of A minor pentatonic, mid-Take: one played, NOW, NEXT, the rest of the shape. */
const NOTES: NeckNote[] = [
  { string: 6, fret: 5, kind: "tone" },
  { string: 6, fret: 8, kind: "tone" },
  { string: 5, fret: 5, kind: "now" },
  { string: 5, fret: 7, kind: "next" },
  { string: 4, fret: 5, kind: "box" },
  { string: 4, fret: 7, kind: "box" },
  { string: 3, fret: 5, kind: "box" },
  { string: 3, fret: 7, kind: "box" },
  { string: 2, fret: 5, kind: "box" },
  { string: 2, fret: 8, kind: "box" },
  { string: 1, fret: 5, kind: "box" },
  { string: 1, fret: 8, kind: "box" },
];
const VIEW: NeckView = { kind: "zoom", from: 3, to: 10, flat: true };

/** Rows for the card when there is no plan to borrow (outside the app, or still loading). */
const SAMPLE_ROLES = ["warmUp", "new", "review"] as const;

export function ThemePreview({ themeId, plan }: { themeId: string; plan: SessionPlan | null }) {
  const { t } = useTranslation();
  const theme = getThemeById(themeId);
  const palette = useMemo(
    () => paletteFrom((name) => theme.vars[name] ?? "", theme.group === "light"),
    [theme],
  );
  const rows = useMemo(() => {
    const steps = plan?.steps.slice(0, 3) ?? [];
    if (steps.length > 0) {
      return steps.map((s) => ({ title: stepTitle(s, t), minutes: s.minutes }));
    }
    return SAMPLE_ROLES.map((role, i) => ({
      title: t(`session.today.role.${role}`),
      minutes: [2, 4, 4][i],
    }));
  }, [plan, t]);

  return (
    <div
      className="onboarding-theme-preview"
      style={theme.vars as CSSProperties}
      data-theme-preview={theme.id}
      data-testid="onboarding-theme-preview"
      aria-hidden="true"
    >
      <div className="onboarding-theme-preview-today">
        <span className="onboarding-theme-preview-kick">{t("session.today.title")}</span>
        {rows.map((row, i) => (
          <div key={i} className="onboarding-theme-preview-row" data-first={i === 0 ? "" : undefined}>
            <span className="onboarding-theme-preview-dot">{i + 1}</span>
            <span>{row.title}</span>
            <span className="onboarding-theme-preview-min">{t("session.today.minutes", { minutes: row.minutes })}</span>
          </div>
        ))}
      </div>
      <div className="onboarding-theme-preview-neck">
        <FallbackNeck view={VIEW} notes={NOTES} pluck={null} palette={palette} />
      </div>
    </div>
  );
}

