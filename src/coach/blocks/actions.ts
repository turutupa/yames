/**
 * What the button does.
 *
 * Every block that offers a fix offers it through one callback (A5: "the fix
 * is always an action"; U4.3: the coach never acts on its own). This is the
 * other end of that callback — the small map from an action to the thing the
 * app already does.
 *
 * Three of the six work today, because they are settings the app already
 * has: the click's subdivision goes through the same `setSubdivision` the
 * hotkeys and the header chip use, and loading a preset or a jam goes
 * through whatever the window hands in, which is the same `handleLoadPreset`
 * and `loadJam` the library rows call.
 *
 * Three do not: `loopBars` and `ramp` want the Songs transport, and
 * `comeBack` wants the notebook (C1). They are here and they are typed, and
 * a host that can do them passes a handler; a host that cannot gets
 * `"notWiredYet"` back rather than a silent nothing, so a button that does
 * nothing can be found rather than reported by the owner.
 *
 * This is the only file under `blocks/` that touches the app's IPC. The
 * catalogue, the validation, the resolution and the renderer are all free of
 * it, which is what lets them be used from a test, a script or the gallery.
 */

import { useCallback } from "react";
import { setSubdivision } from "../../ipc";
import type { Subdivision } from "../../types";
import type { CoachAction } from "./types";

type OfKind<K extends CoachAction["kind"]> = Extract<CoachAction, { kind: K }>;

export type CoachActionHost = {
  /** Set the metronome up the way a saved preset says. */
  loadPreset?: (presetId: string) => void;
  /** Put a jam on the stage. */
  loadJam?: (jamId: string) => void;
  /**
   * Change the click. Left out, it goes straight to the engine, which is
   * what every other door to this setting does.
   */
  setClickSubdivision?: (subdivision: Subdivision) => void;
  /** The Songs transport. */
  loopBars?: (action: OfKind<"loopBars">) => void;
  /** The drill. */
  ramp?: (action: OfKind<"ramp">) => void;
  /** The notebook. */
  comeBack?: (action: OfKind<"comeBack">) => void;
};

/** Whether the press did anything, and if not, why not. */
export type CoachActionOutcome = "done" | "notWiredYet";

export function runCoachAction(action: CoachAction, host: CoachActionHost = {}): CoachActionOutcome {
  switch (action.kind) {
    case "clickSubdivision": {
      const subdivision = action.subdivision as Subdivision;
      if (host.setClickSubdivision) host.setClickSubdivision(subdivision);
      else void setSubdivision(subdivision);
      return "done";
    }

    case "loadPreset":
      if (!host.loadPreset) return "notWiredYet";
      host.loadPreset(action.preset);
      return "done";

    case "loadJam":
      if (!host.loadJam) return "notWiredYet";
      host.loadJam(action.jam);
      return "done";

    case "loopBars":
      if (!host.loopBars) return "notWiredYet";
      host.loopBars(action);
      return "done";

    case "ramp":
      if (!host.ramp) return "notWiredYet";
      host.ramp(action);
      return "done";

    case "comeBack":
      if (!host.comeBack) return "notWiredYet";
      host.comeBack(action);
      return "done";
  }
}

/**
 * The `onAction` a renderer takes, held steady across renders.
 *
 * `host` is read through a ref-free closure on purpose: the object is built
 * inline by every caller that has ever written one, and a dependency on it
 * would rebuild the callback on every render of the coach card.
 */
export function useCoachAction(host: CoachActionHost): (action: CoachAction) => void {
  const {
    loadPreset,
    loadJam,
    setClickSubdivision,
    loopBars,
    ramp,
    comeBack,
  } = host;
  return useCallback(
    (action: CoachAction) => {
      runCoachAction(action, { loadPreset, loadJam, setClickSubdivision, loopBars, ramp, comeBack });
    },
    [loadPreset, loadJam, setClickSubdivision, loopBars, ramp, comeBack],
  );
}
