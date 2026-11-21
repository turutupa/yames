/**
 * W4 — Practice coach opt-in (ONBOARDING_PLAN §3 W4, decisions 3 and 5).
 *
 * One question since leg c6a (DESIGN 8): "Should the coach also answer in
 * its own words?" Three choices, all of them honest:
 *   Off                   — no download: the line, the note, the tools and
 *                           answers from the player's Takes and Paths.
 *   Standard brain        — Qwen3-4B, the floor tier.
 *   Studio brain          — Qwen3-8B, greyed below 16 GB with the reason.
 *
 * Every fact on this screen comes from the machine, not from marketing:
 * `getCoachCapabilities()` (T03) says whether this build can run a model at
 * all, `getSystemMemoryMb()` (T04) gives the RAM the gates are made of, and
 * `get_model_status` says what is already downloaded. The rules that turn
 * those into a recommendation live in `coachRecommendation.ts`.
 *
 * Selection is never navigation (`types.ts`): clicking a card only stages it.
 * The commit the shell runs on Next persists `coachBrainTier`, records the
 * choice in the machine context (so W5/W6 can gate themselves) and hands the
 * download to the app's own `useCoachDownload` — which keeps running while
 * the wizard moves on, with a thin bar in the shell's footer.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCoachCapabilities } from "../../../ipc.desktop";
import type { BrainTier, ModelTier } from "../../../types";
import { tierOnDisk, tiersOnDisk } from "../../../coach/brainDisk";
import { useWizardEnv } from "../WizardContext";
import {
  memoryGb,
  recommendCoachTier,
  standardDisabledReason,
  studioDisabledReason,
  type CoachFacts,
} from "./coachRecommendation";
import type { WizardStepProps } from "./types";

type Option = {
  tier: BrainTier;
  titleKey: string;
  descKey: string;
  disabledReason: string | null;
};

export function CoachStep(_props: WizardStepProps) {
  const { t } = useTranslation();
  const { coach, machineContext, setMachineContext, setStepCommit, setNextEnabled } =
    useWizardEnv();

  // T03: what this *build* can do. Kept separate from `modelStatus`, which
  // only knows what is on disk. A failed query is treated as "no LLM": the
  // wizard would rather under-promise than recommend a 2.5 GB download to a
  // binary that cannot open it.
  const [llmCompiled, setLlmCompiled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    getCoachCapabilities()
      .then((caps) => {
        if (!cancelled) setLlmCompiled(!!caps?.llmCompiled);
      })
      .catch(() => {
        if (!cancelled) setLlmCompiled(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Both tiers may be on disk side by side (leg ms2): the first one there is
  // the one to recommend keeping.
  const installedTier: ModelTier | null = tiersOnDisk(coach.modelStatus)[0] ?? null;

  // The tier gates come from Rust with the model status; reading them from
  // the same place Settings does means the two cannot disagree about what
  // this machine can run.
  const status = coach.modelStatus;
  const facts: CoachFacts | null = useMemo(() => {
    if (llmCompiled === null) return null;
    return {
      llmCompiled,
      systemMemoryMb: coach.systemMemoryMb,
      gates: status
        ? {
            studioRecommended: status.studioRecommended,
            standardRecommended: status.standardRecommended,
            brainUpdateRecommended: status.brainUpdateRecommended,
          }
        : null,
      installedTier,
    };
  }, [llmCompiled, coach.systemMemoryMb, status, installedTier]);

  const recommendation = useMemo(
    () => (facts ? recommendCoachTier(facts) : null),
    [facts],
  );

  // Staged choice. Nothing is preselected until the facts are in — a card
  // highlighted before we know the machine would be a guess, and the user
  // might act on it. Re-entering the step (W7's summary row) restores what
  // the previous visit decided instead of re-recommending.
  const [staged, setStaged] = useState<BrainTier | undefined>(
    () => machineContext.coachTier,
  );
  useEffect(() => {
    if (recommendation) setStaged((s) => s ?? recommendation.tier);
  }, [recommendation]);

  // "Try the listening feature anyway" left this step (leg c6a, judgement
  // call 29): it asked for an input and eight beats, a microphone push in the
  // coach's step. W5 runs before this step on every run, so it has no other
  // home; `tryListening` is recorded false.

  const gb = memoryGb(coach.systemMemoryMb);
  const options: Option[] = facts
    ? [
        {
          tier: "off",
          titleKey: "onboarding.coach.off.title",
          descKey: "onboarding.coach.off.desc",
          disabledReason: null,
        },
        {
          tier: "standard",
          titleKey: "onboarding.coach.standard.title",
          descKey: "onboarding.coach.standard.desc",
          disabledReason: standardDisabledReason(facts),
        },
        {
          tier: "full",
          titleKey: "onboarding.coach.studio.title",
          descKey: "onboarding.coach.studio.desc",
          disabledReason: studioDisabledReason(facts),
        },
      ]
    : [];

  // --- The commit ----------------------------------------------------------
  // Runs once, on Next, and never on Skip or Back (the shell guarantees it).
  // Three effects, in the order that keeps the app truthful if any of them
  // throws: record the intent, persist the tier, then start the bytes moving.
  const { setBrainTier, startDownload, downloading, modelStatus } = coach;
  const commit = useCallback(() => {
    if (!staged) return;
    setMachineContext({
      coachTier: staged,
      tryListening: false,
    });
    setBrainTier(staged);
    if (staged === "off") return;
    // Nothing to fetch when this tier's weights *and* the voices are already
    // here — Settings makes the same call (`CoachSettingsSection`), and a
    // second download of 2.5 GB the user already has is not a kindness.
    //
    // `brainUpdateRecommended` is part of "already here": matching only the
    // tier let a pre-Qwen3 install of the same tier short-circuit the
    // wizard, so a legacy brain survived onboarding and then answered every
    // prompt with visible ChatML artifacts.
    const here = tierOnDisk(modelStatus, staged);
    const complete = !!here && !here.updateRecommended && !!modelStatus?.voiceReady;
    if (complete || downloading) return;
    startDownload(staged);
  }, [
    staged,
    setMachineContext,
    setBrainTier,
    startDownload,
    downloading,
    modelStatus,
  ]);

  useEffect(() => {
    setNextEnabled(staged !== undefined);
    setStepCommit(staged !== undefined ? commit : null);
  }, [staged, commit, setNextEnabled, setStepCommit]);

  const pending = staged !== undefined && staged !== "off" && !downloading;
  const stagedHere = staged !== undefined && staged !== "off" ? tierOnDisk(modelStatus, staged) : null;
  const alreadyHere = !!stagedHere && !stagedHere.updateRecommended;

  return (
    <div className="onboarding-step">
      <h2 className="onboarding-step-title" id="onboarding-title">
        {t("onboarding.coach.title")}
      </h2>
      {/* One question (DESIGN 8; leg c6a): what the coach does, the question,
          what works without a model, then the privacy line — one block so the
          step's 12px rhythm does not spread short paragraphs over half the
          card at the 480x780 minimum window. */}
      <div className="onboarding-coach-intro">
        <p className="onboarding-step-subtitle">{t("onboarding.coach.what1")}</p>
        <p className="onboarding-coach-question" data-testid="coach-question">{t("onboarding.coach.question")}</p>
        <p className="onboarding-step-subtitle">{t("onboarding.coach.withoutModel")}</p>
        <p className="onboarding-coach-privacy">{t("onboarding.coach.privacy")}</p>
      </div>

      <div className="onboarding-cards" data-testid="coach-tiers">
        {options.map((option) => {
          const selected = staged === option.tier;
          const recommended = recommendation?.tier === option.tier;
          const disabled = option.disabledReason !== null;
          return (
            <button
              key={option.tier}
              type="button"
              className={`onboarding-coach-card${selected ? " selected" : ""}`}
              data-testid={`coach-tier-${option.tier}`}
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => setStaged(option.tier)}
            >
              <span className="onboarding-coach-card-head">
                <span className="onboarding-coach-card-title">{t(option.titleKey)}</span>
                {recommended && (
                  <span className="onboarding-coach-badge">
                    {t("onboarding.coach.recommended")}
                  </span>
                )}
              </span>
              <span className="onboarding-coach-card-desc">{t(option.descKey)}</span>
              {disabled && (
                <span className="onboarding-coach-card-reason">
                  {t(option.disabledReason!, { gb: gb ?? 0 })}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Why the recommendation is what it is. Only shown when there is
          something to explain — a plain "Standard on a capable machine" needs
          no defence, but "we are not recommending the AI" always does. */}
      {recommendation?.reasonKey && (
        <p className="onboarding-coach-reason" data-testid="coach-recommendation-reason">
          {t(recommendation.reasonKey, { gb: gb ?? 0 })}
        </p>
      )}

      {pending && !alreadyHere && (
        <p className="onboarding-coach-note">{t("onboarding.coach.downloadNote")}</p>
      )}
      {alreadyHere && (
        <p className="onboarding-coach-note">{t("onboarding.coach.reasonInstalled")}</p>
      )}
    </div>
  );
}
