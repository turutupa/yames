import { backendLabel } from "../../coach/brainTiers";
import type { CoachCapabilities } from "../../ipc";

/**
 * Maps coach capabilities + on-disk model presence to the i18n key (and
 * interpolation params) for the Brain status line.
 *
 * Pulled out as a pure function so the mapping is unit-testable without
 * mounting the settings tree — this is the one place in the app that
 * decides whether we tell the user they have an AI brain, and it must
 * never say "active" for a build that cannot run one. Principle 4 of
 * the roadmap: "The UI never claims a capability the build does not
 * have."
 */

export type CoachStatusLabel = {
  key: string;
  params?: Record<string, string>;
  /**
   * `ok` — a real model is generating.
   * `warn` — weights are on disk but genuinely unusable (a legacy family
   *   the engine refuses; a wasted download).
   * `info` — expected, non-actionable states (template build, nothing
   *   downloaded yet, ready-but-not-loaded, warming up).
   */
  tone: "ok" | "warn" | "info";
};

export function coachStatusLabel(
  caps: CoachCapabilities | null,
  brainDownloaded: boolean,
): CoachStatusLabel | null {
  // Capabilities not fetched yet — render nothing rather than guessing.
  // A flash of "Template coach" on a machine that has a working brain
  // is exactly the kind of dishonest status this task removes.
  if (!caps) return null;

  // Checked first and independently of `brainDownloaded`: when the
  // build has no LLM at all, whether the user downloaded weights is
  // irrelevant to what they will get.
  if (!caps.llmCompiled) {
    return { key: "settings.coach.statusTemplateBuild", tone: "info" };
  }

  // A load is in flight. Neither "active" nor "not loaded" is true yet,
  // and the session that triggered it is already running on templates.
  if (caps.loading) {
    return { key: "settings.coach.statusWarmingUp", tone: "info" };
  }

  if (caps.modelResident) {
    return {
      key: "settings.coach.statusActive",
      params: {
        // From GGUF metadata ("Qwen3 4B"), not the file name on disk.
        model: caps.modelName ?? "model",
        backend: backendLabel(caps.backend),
      },
      tone: "ok",
    };
  }

  if (brainDownloaded) {
    // Weights that this build refuses to load — a pre-Qwen3 family — is
    // the one genuinely actionable case, and "Update brain" sits right
    // below this line.
    if (caps.brainUpdateRecommended) {
      return { key: "settings.coach.statusLegacyWeights", tone: "warn" };
    }
    // Otherwise this is the normal resting state, not a fault: the model
    // is deliberately not resident until a session needs it, so the copy
    // says so and the tone is neutral.
    return { key: "settings.coach.statusReadyNotLoaded", tone: "info" };
  }

  return { key: "settings.coach.statusNoModel", tone: "info" };
}
