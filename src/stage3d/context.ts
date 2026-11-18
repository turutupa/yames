/** The context the provider fills, and the stage used when none is mounted. Kept apart from api.ts so the provider can import it without a cycle. */
import { createContext } from "react";
import type { NeckStage } from "./api";

/** Every call is accepted and does nothing. */
export const NOOP_STAGE: NeckStage = Object.freeze({
  setView() {},
  setNotes() {},
  pluck() {},
  sweep() {},
  setTakeRunning() {},
  project: () => null,
  is3d: false,
});

export const NeckStageContext = createContext<NeckStage>(NOOP_STAGE);
