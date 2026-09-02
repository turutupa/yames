/**
 * The wizard shell (O1) — full-window overlay, one step at a time.
 *
 * The shell owns chrome and keyboard only: progress dots, the Back/Skip/Next
 * footer, the focus trap, ←/→ navigation and Esc semantics (on W0 Esc is
 * "Just give me the click", everywhere else it skips the step). Which steps
 * exist and what they render is the registry's business
 * (`steps/index.ts` + `steps/types.ts`), so O2–O5 never edit this file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { BeatEvent } from "../../types";
import {
  isWizardOpen,
  type OnboardingContext,
  type OnboardingEvent,
  type OnboardingState,
  type StepId,
} from "./onboardingMachine";
import { ONBOARDING_STEPS } from "./steps";
import type { WizardStepDef } from "./steps/types";
import { WizardEnvProvider, type WizardEnv } from "./WizardContext";
import "../../styles/onboarding.css";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export type OnboardingWizardProps = {
  state: OnboardingState;
  dispatch: (event: OnboardingEvent) => void;
  /** Overridable for tests; defaults to the registry. */
  steps?: WizardStepDef[];

  appVersion: string;
  instrument: string;
  instrumentChosen: boolean;
  onInstrumentChange: (id: string) => void;
  soundType: string;
  themeId: string;
  coachTier: string;
  inputDeviceName?: string | null;
  hasFootswitch?: boolean;
  alwaysOnTop: boolean;
  onAlwaysOnTopChange: (value: boolean) => void;

  /** 80 BPM / volume 0.35 preview click, implemented in MainWindow. */
  startSoftClick: () => void;
  /** Stops it and restores the user's previous BPM + volume. */
  stopSoftClick: () => void;
  softClickPlaying: boolean;
  /** Engine beat, for the W0 logo pulse. */
  currentBeat?: BeatEvent | null;

  /** Called once when the wizard closes, with how it ended. */
  onFinish: (outcome: "completed" | "skipped" | "closed") => void;
  /** Wired by O6; the W7 tour button stays hidden until then. */
  onRequestTour?: () => void;
  /** `viewTransitions !== "off"` — reduced motion is honoured on top of this. */
  animate?: boolean;
};

export function OnboardingWizard({
  state,
  dispatch,
  steps = ONBOARDING_STEPS,
  appVersion,
  instrument,
  instrumentChosen,
  onInstrumentChange,
  soundType,
  themeId,
  coachTier,
  inputDeviceName,
  hasFootswitch = false,
  alwaysOnTop,
  onAlwaysOnTopChange,
  startSoftClick,
  stopSoftClick,
  softClickPlaying,
  currentBeat,
  onFinish,
  onRequestTour,
  animate = true,
}: OnboardingWizardProps) {
  const { t } = useTranslation();
  const open = isWizardOpen(state);
  const cardRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const finishedRef = useRef(false);

  const current = state.stepId;
  const def = useMemo(
    () => steps.find((s) => s.id === current) ?? null,
    [steps, current],
  );

  // Steps that count for the progress dots: enabled, minus W0.
  const dotted = useMemo(
    () =>
      steps.filter(
        (s) =>
          !s.hideInProgress &&
          (s.isEnabled ? s.isEnabled(state.context) : true),
      ),
    [steps, state.context],
  );
  const dotIndex = dotted.findIndex((s) => s.id === current);
  // Every step a JUMP can actually reach on this run (W7 summary rows).
  const availableSteps = useMemo(
    () =>
      steps
        .filter((s) => (s.isEnabled ? s.isEnabled(state.context) : true))
        .map((s) => s.id),
    [steps, state.context],
  );
  const isWelcome = state.status === "welcome";
  // Back on the first step returns to W0 (never a dead end), so it is never
  // disabled — the ← key does the same thing.
  const isLastStep = dotIndex === dotted.length - 1;

  // --- Selection is not navigation -----------------------------------------
  // House rule (owner, 2026-09-02): choosing something inside a step only
  // selects it. Advancing is always the user's separate, deliberate act via
  // Next (or Enter). A step stages its choice, tells the shell whether Next
  // is allowed yet, and hands over a commit callback the shell runs *before*
  // it advances — so a misclick costs nothing and Skip never persists.
  const commitRef = useRef<(() => void) | null>(null);
  const [nextEnabled, setNextEnabled] = useState(true);
  // Reset both when the visible step changes. Done during render (not in an
  // effect) because child effects run before the parent's would, and an
  // effect here would wipe the registration the new step just made.
  const stepRef = useRef(current);
  if (stepRef.current !== current) {
    stepRef.current = current;
    commitRef.current = null;
    if (!nextEnabled) setNextEnabled(true);
  }
  const setStepCommit = useCallback((fn: (() => void) | null) => {
    commitRef.current = fn;
  }, []);

  // --- Navigation helpers passed to steps ---------------------------------
  const onNext = useCallback(() => {
    // Persist the step's result first, then move.
    commitRef.current?.();
    dispatch({ type: "NEXT" });
  }, [dispatch]);
  const onBack = useCallback(() => dispatch({ type: "BACK" }), [dispatch]);
  const onSkip = useCallback(() => dispatch({ type: "SKIP_STEP" }), [dispatch]);
  const skipAll = useCallback(() => dispatch({ type: "SKIP_ALL" }), [dispatch]);
  const startSetup = useCallback(
    () => dispatch({ type: "START_SETUP" }),
    [dispatch],
  );
  const finish = useCallback(() => dispatch({ type: "CLOSE" }), [dispatch]);
  const jumpTo = useCallback(
    (stepId: StepId) => dispatch({ type: "JUMP", stepId }),
    [dispatch],
  );
  const setMachineContext = useCallback(
    (patch: Partial<OnboardingContext>) => dispatch({ type: "SET_CONTEXT", patch }),
    [dispatch],
  );

  // --- Outcome hand-off ----------------------------------------------------
  // One call per run: the shell tells MainWindow how the wizard ended so it
  // can restore audio, apply defaults and land on the metronome.
  useEffect(() => {
    if (state.status !== "done") {
      finishedRef.current = false;
      return;
    }
    if (finishedRef.current) return;
    finishedRef.current = true;
    onFinish(state.outcome ?? "closed");
  }, [state.status, state.outcome, onFinish]);

  // --- Focus: trap inside the card, restore on close -----------------------
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    // Focus the first control of the step that just became visible.
    const card = cardRef.current;
    if (!card) return;
    const first = card.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? card).focus({ preventScroll: true });
  }, [open, current]);

  // --- Keyboard ------------------------------------------------------------
  // Capture phase on `document`: the wizard both handles its own keys and
  // stops app hotkeys (Space = play, etc.) from firing behind the overlay.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

      if (e.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const items = Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE));
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (!card.contains(active)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
          return;
        }
        if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        }
        return;
      }

      if (typing) return;

      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        // W0: Esc is "Just give me the click", not "skip this screen".
        if (isWelcome) skipAll();
        else onSkip();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        e.stopPropagation();
        if (!isWelcome && nextEnabled) onNext();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (!isWelcome) onBack();
        return;
      }
      // Enter is the footer's default action: it advances, exactly like the
      // Next button. Space still activates whatever has focus, so a card is
      // selected with Space or a click and never by pressing Enter over it.
      // Enter on a footer button (Back / Skip) keeps that button's meaning.
      if (e.key === "Enter" && !isWelcome) {
        const onFooterButton = !!target?.closest?.(".onboarding-footer button");
        if (!onFooterButton) {
          e.preventDefault();
          e.stopPropagation();
          if (nextEnabled) onNext();
          return;
        }
        return;
      }
      // Everything else stays inside the overlay: no app hotkeys behind it.
      if (e.key === " " || e.key === "Enter") return;
      e.stopPropagation();
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [open, isWelcome, nextEnabled, skipAll, onSkip, onNext, onBack]);

  // --- Step environment ----------------------------------------------------
  // Count main beats only (subdivision 0) so the W0 mark pulses in tempo
  // rather than on every sixteenth.
  const [beatTick, setBeatTick] = useState(0);
  useEffect(() => {
    if (currentBeat && currentBeat.subdivision === 0) setBeatTick((n) => n + 1);
  }, [currentBeat]);
  const env: WizardEnv = useMemo(
    () => ({
      appVersion,
      instrument,
      instrumentChosen,
      setInstrument: onInstrumentChange,
      soundType,
      themeId,
      coachTier,
      inputDeviceName,
      hasFootswitch,
      alwaysOnTop,
      setAlwaysOnTop: onAlwaysOnTopChange,
      startSoftClick,
      stopSoftClick,
      softClickPlaying,
      beatTick,
      machineContext: state.context,
      availableSteps,
      setStepCommit,
      setNextEnabled,
      jumpTo,
      skipAll,
      startSetup,
      finish,
      onRequestTour,
      setMachineContext,
    }),
    [
      appVersion,
      instrument,
      instrumentChosen,
      onInstrumentChange,
      soundType,
      themeId,
      coachTier,
      inputDeviceName,
      hasFootswitch,
      alwaysOnTop,
      onAlwaysOnTopChange,
      startSoftClick,
      stopSoftClick,
      softClickPlaying,
      beatTick,
      state.context,
      availableSteps,
      setStepCommit,
      setNextEnabled,
      jumpTo,
      skipAll,
      startSetup,
      finish,
      onRequestTour,
      setMachineContext,
    ],
  );

  if (!open || !def) return null;
  const StepComponent = def.Component;

  return (
    <WizardEnvProvider value={env}>
    <div
      className={`onboarding-overlay${animate ? "" : " no-motion"}`}
      data-testid="onboarding-overlay"
    >
      <div
        ref={cardRef}
        className="onboarding-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        data-step={current ?? undefined}
        tabIndex={-1}
      >
        {!isWelcome && dotted.length > 1 && (
          <div
            className="onboarding-progress"
            role="group"
            aria-label={t("onboarding.progress", {
              current: dotIndex + 1,
              total: dotted.length,
            })}
          >
            {dotted.map((s, i) => (
              <span
                key={s.id}
                className={`onboarding-dot${i === dotIndex ? " active" : ""}${
                  i < dotIndex ? " done" : ""
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
        )}

        <div className="onboarding-body">
          <StepComponent
            onNext={onNext}
            onBack={onBack}
            onSkip={onSkip}
            isActive
          />
        </div>

        {!isWelcome && (
          <div className="onboarding-footer">
            <button
              type="button"
              className="onboarding-btn onboarding-btn-ghost"
              onClick={onBack}
            >
              {t("onboarding.back")}
            </button>
            {/* The last step (W7) carries its own primary action, so the
                footer only offers Back there. */}
            {!isLastStep && (
              <>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-ghost onboarding-skip"
                  onClick={onSkip}
                >
                  {t("onboarding.skip")}
                </button>
                <button
                  type="button"
                  className="onboarding-btn onboarding-btn-primary"
                  onClick={onNext}
                  disabled={!nextEnabled}
                >
                  {t("onboarding.next")}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
    </WizardEnvProvider>
  );
}
