/**
 * Wizard lifecycle: first-run detection, persistence, and the "Finish setup"
 * chip. All state lives in the pure machine; this hook only decides when to
 * open it and what to write to the store.
 *
 * Store keys (onboarding README):
 *   onboarding.version      number   schema version completed or skipped
 *   onboarding.completedAt  ISO      when W7 was reached
 *   onboarding.skipped      string[] step ids skipped
 *   onboarding.chipDismissed number  times the chip was dismissed (hide at 2)
 *
 * First-run detection, the three cases:
 *   1. no instrument, no version → full wizard from W0
 *   2. instrument set, no version → existing user: no wizard, version stamped
 *      (and completedAt, so the chip never appears for them); the tour offer
 *      is left to O6 via `migratedExistingUser`
 *   3. version set → normal launch
 */
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { storeLoad, storeSave } from "../../ipc";
import {
  INITIAL_ONBOARDING_STATE,
  isWizardOpen,
  onboardingReducer,
  type OnboardingEvent,
  type OnboardingState,
  type StepGate,
  type StepId,
} from "./onboardingMachine";
import { ONBOARDING_STEPS, stepGates } from "./steps";
import type { WizardStepDef } from "./steps/types";

/** Wizard schema version this build writes (ONBOARDING_PLAN: 1). */
export const ONBOARDING_VERSION = 1;
/** The chip stops offering itself after this many dismissals. */
export const CHIP_DISMISS_LIMIT = 2;

export type UseOnboardingResult = {
  state: OnboardingState;
  dispatch: (event: OnboardingEvent) => void;
  /** Open at W0 (Settings → "Run setup again"). */
  open: () => void;
  /** Open directly at a step (the chip opens at W1). */
  openAt: (stepId: StepId) => void;
  /** Close without completing. */
  close: () => void;
  /** True while the overlay should be on screen. */
  isOpen: boolean;
  chipVisible: boolean;
  dismissChip: () => void;
  /** Case 2 above — O6 hangs the one-time tour offer off this. */
  migratedExistingUser: boolean;
  /** Store has been read; nothing should render wizard-dependent UI before. */
  hydrated: boolean;
};

export function useOnboarding(
  steps: WizardStepDef[] = ONBOARDING_STEPS,
): UseOnboardingResult {
  // The gate list changes only if the registry does; keep it stable so the
  // reducer identity stays stable across renders.
  const gatesRef = useRef<StepGate[]>(stepGates(steps));
  const [state, rawDispatch] = useReducer(
    (s: OnboardingState, e: OnboardingEvent) =>
      onboardingReducer(s, e, gatesRef.current),
    INITIAL_ONBOARDING_STATE,
  );
  const [hydrated, setHydrated] = useState(false);
  const [chipVisible, setChipVisible] = useState(false);
  const [migratedExistingUser, setMigratedExistingUser] = useState(false);
  const dismissCountRef = useRef(0);
  const persistedRef = useRef(false);

  const dispatch = useCallback((event: OnboardingEvent) => rawDispatch(event), []);

  // --- First-run detection -------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [version, instrument, completedAt, dismissed] = await Promise.all([
        storeLoad<number>("onboarding.version"),
        storeLoad<string>("instrument"),
        storeLoad<string>("onboarding.completedAt"),
        storeLoad<number>("onboarding.chipDismissed"),
      ]);
      if (cancelled) return;
      dismissCountRef.current = dismissed ?? 0;

      if (version == null && !instrument) {
        // Case 1 — true first run.
        rawDispatch({ type: "START_SETUP" });
      } else if (version == null && instrument) {
        // Case 2 — existing user. Stamp the schema so they never see the
        // wizard, and stamp completedAt so the chip never offers itself.
        await storeSave("onboarding.version", ONBOARDING_VERSION);
        await storeSave("onboarding.completedAt", new Date().toISOString());
        if (cancelled) return;
        setMigratedExistingUser(true);
      } else if (!completedAt && dismissCountRef.current < CHIP_DISMISS_LIMIT) {
        // Case 3 — normal launch, but setup was skipped at some point.
        setChipVisible(true);
      }
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Persistence ---------------------------------------------------------
  useEffect(() => {
    if (state.status !== "done") {
      persistedRef.current = false;
      return;
    }
    if (persistedRef.current) return;
    persistedRef.current = true;
    const completed = state.context.visited.includes("ready");
    (async () => {
      await storeSave("onboarding.version", ONBOARDING_VERSION);
      await storeSave("onboarding.skipped", state.context.skipped);
      if (completed) {
        await storeSave("onboarding.completedAt", new Date().toISOString());
      }
    })();
    // The chip exists for exactly this case: setup was offered and skipped.
    setChipVisible(!completed && dismissCountRef.current < CHIP_DISMISS_LIMIT);
  }, [state.status, state.context]);

  const open = useCallback(() => {
    setChipVisible(false);
    rawDispatch({ type: "START_SETUP" });
  }, []);

  const openAt = useCallback((stepId: StepId) => {
    setChipVisible(false);
    rawDispatch({ type: "JUMP", stepId });
  }, []);

  const close = useCallback(() => rawDispatch({ type: "CLOSE" }), []);

  const dismissChip = useCallback(() => {
    dismissCountRef.current += 1;
    setChipVisible(false);
    storeSave("onboarding.chipDismissed", dismissCountRef.current).catch(() => {});
  }, []);

  const isOpen = isWizardOpen(state);

  return {
    state,
    dispatch,
    open,
    openAt,
    close,
    isOpen,
    chipVisible: chipVisible && !isOpen,
    dismissChip,
    migratedExistingUser,
    hydrated,
  };
}
