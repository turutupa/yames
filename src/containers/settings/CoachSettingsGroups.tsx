/**
 * Settings → Coach's groups (DESIGN 8; leg c6a): the section's head, the
 * heading each group carries, the Answers group's line about the model's
 * languages, and the phone's section (Answers as the selector's rows,
 * Suggestions and Notebook).
 *
 * Nothing here is proactive (DESIGN 6.6): no card, no hint that pushes a
 * setting. Every row keeps its own behaviour; this file only says where it sits.
 */
import { useTranslation } from "react-i18next";
import { brainTierLabelKey } from "../../coach/brainTiers";
import { gbText } from "../../coach/brainDisk";
import { modelLangs } from "../../coach/ask/model";
import { useCoachModel } from "../../hooks/useCoachModel";
import type { CoachModelRow, CoachModelRowState } from "../../hooks/coachLoader";
import { rowStateText } from "../main-window/CoachModelSelector";
import type { BrainTier, ModelTier } from "../../types";
import { CoachSuggestionsRow } from "./CoachSuggestionsRow";
import { CoachReminderRow } from "./CoachReminderRow";
import { CoachNotebookGroup } from "./CoachNotebookGroup";
import { CoachGroup } from "./CoachGroup";

/** The section's head: its title and the Beta badge (COA-121). */
export function CoachSectionHead() {
  const { t } = useTranslation();
  return (
    <>
      {/* EXPERIMENTAL badge: signals to users that the coach is a labs
          feature and that behaviour may shift between builds. The flask
          icon mirrors the "labs" visual language people already know
          from Chrome/Firefox/etc., and the amber palette keeps it
          tonally distinct from the accent-pink active toggle state so
          the badge actually reads as a callout rather than chrome. */}
      <div className="settings-section-title">
        <h2>{t("settings.coach.title")}</h2>
        <span
          className="experimental-badge"
          title={t("settings.coach.betaHint")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2" />
            <path d="M8.5 2h7" />
            <path d="M7 16h10" />
          </svg>
          {t("settings.coach.beta")}
        </span>
      </div>
    </>
  );
}

/** A language code as the reader's own language names it ("es" → "Spanish"). */
function languageName(code: string, lang: string): string {
  try {
    return new Intl.DisplayNames([lang], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

function listOf(names: readonly string[], lang: string): string {
  // `Intl.ListFormat` is in every webview Yames ships in; the project's TS lib predates it.
  const ListFormat = (Intl as unknown as {
    ListFormat?: new (lang: string, o: { style: string; type: string }) => { format(xs: readonly string[]): string };
  }).ListFormat;
  try {
    if (ListFormat) return new ListFormat(lang, { style: "long", type: "conjunction" }).format(names);
    return names.join(", ");
  } catch {
    return names.join(", ");
  }
}

/**
 * A chosen model this device can answer with: on disk, not failed, and a build
 * that can run one (a phone or a no-LLM build reads "not on this device").
 * Loading and waiting count: the model is there and on its way.
 */
const USABLE_ROW_STATES: ReadonlySet<CoachModelRowState> = new Set(["ready", "loading", "waiting", "onDisk"]);

export function modelUsable(row: Pick<CoachModelRow, "state"> | null | undefined): boolean {
  return !!row && USABLE_ROW_STATES.has(row.state);
}

/**
 * What the Answers group says about free wording, true today: the languages
 * the chosen model answers in its own words (`MODEL_LANGS`, leg c3b2a), only
 * when that model is usable on this device (`usable`, review c6a L1), or,
 * with none switched on (this build), no model chosen, or one not downloaded,
 * failed or not runnable here, that the coach answers from the player's Takes
 * and Paths. Never an empty list, never a promise.
 */
export function answersLine(
  tier: BrainTier,
  lang: string,
  usable: boolean,
  langs: Readonly<Record<ModelTier, readonly string[]>> = modelLangs(),
): { key: string; params?: Record<string, string> } {
  const on = tier === "off" || !usable ? [] : langs[tier] ?? [];
  if (on.length === 0) return { key: "settings.coach.answersRuleMade" };
  return {
    key: "settings.coach.answersLangs",
    params: { langs: listOf(on.map((c) => languageName(c, lang)), lang) },
  };
}

export function CoachAnswersLine({ tier }: { tier: BrainTier }) {
  const { t, i18n } = useTranslation();
  const snap = useCoachModel();
  const line = answersLine(tier, i18n.language, modelUsable(snap.rows.find((r) => r.tier === tier)));
  return (
    <p className="setting-hint coach-answers-line" data-testid="coach-answers-line">
      {t(line.key, line.params)}
    </p>
  );
}

/** Suggestions: On / Only when I ask (c4a2), then the practice reminder (rem2). */
export function CoachSuggestionsGroup() {
  return (
    <CoachGroup id="suggestions">
      {/* Suggestions: On / Only when I ask (DESIGN 6.6; leg c4a2). */}
      <CoachSuggestionsRow />
      {/* Practice reminder: in the app only, Today mentions it (leg rem2). */}
      <CoachReminderRow />
    </CoachGroup>
  );
}

/**
 * On a phone the models are not part of the app: the selector's rows, each
 * saying "not on this device" as ms1 left them. Nothing to press, no download.
 */
function PhoneAnswers() {
  const { t, i18n } = useTranslation();
  const lng = i18n.language;
  const snap = useCoachModel();
  return (
    <CoachGroup id="answers">
      <ul className="coach-tier-list" data-testid="coach-phone-tiers">
        {snap.rows.map((row) => (
          <li key={row.tier} className="coach-tier-item" data-tier={row.tier} data-state={row.state}>
            <span className="setting-hint coach-tier-name">
              {t("coachModel.entry", { tier: t(brainTierLabelKey(row.tier)), model: row.name, size: gbText(row.sizeBytes, lng) })}
            </span>
            <span className="setting-hint coach-tier-state">{rowStateText(row, t, null, lng)}</span>
          </li>
        ))}
      </ul>
      <CoachAnswersLine tier="off" />
    </CoachGroup>
  );
}

/**
 * Settings → Coach on a phone (judgement call 28): Answers, Suggestions and
 * Notebook. Voice and In the tools are not part of the phone app (DESIGN 8).
 */
export function CoachSettingsPhone() {
  return (
    <section className="settings-section" id="settings-coach" data-shape="phone">
      <CoachSectionHead />
      <PhoneAnswers />
      <CoachSuggestionsGroup />
      <CoachNotebookGroup />
    </section>
  );
}
