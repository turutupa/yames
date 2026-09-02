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
   * `warn` — weights are on disk but unusable (wasted download).
   * `info` — expected, non-actionable states (template build, nothing
   *   downloaded yet).
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

  if (caps.modelResident) {
    return {
      key: "settings.coach.statusActive",
      params: {
        model: caps.modelName ?? "model",
        backend: caps.backend,
      },
      tone: "ok",
    };
  }

  if (brainDownloaded) {
    return { key: "settings.coach.statusNotLoaded", tone: "warn" };
  }

  return { key: "settings.coach.statusNoModel", tone: "info" };
}
