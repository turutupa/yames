/**
 * Brain-tier presentation. The *rules* are not here.
 *
 * Both gates this file used to own moved into Rust
 * (`models::recommendations`), and for the same reason in each case: the
 * frontend was second-guessing facts only the backend can see.
 *
 *  - **Family / migration.** `CURRENT_BRAIN_FAMILY` was declared here
 *    *and* in `models.rs`, so a model-generation bump had to be made in
 *    two places or the "Update brain" affordance would quietly stop
 *    firing. Rust now answers `brainUpdateRecommended` directly.
 *
 *  - **RAM gates.** The Studio floor was a literal 16 GiB compared
 *    against reported RAM — a number no real 16 GB Windows or Linux
 *    machine produces, because firmware and integrated-GPU reservations
 *    come off the top before the OS answers (~15.7–15.9 GiB). Real
 *    machines that run Qwen3-8B fine were locked out of it. Rust holds
 *    the floors, slack included, and answers `studioRecommended` /
 *    `standardRecommended`. A failed platform query still reads as
 *    "unknown" there, never as "too small".
 *
 * What is left is presentation: turning a status the backend computed
 * into the strings and booleans the components render.
 */

/** The subset of `ModelStatus`/`CoachCapabilities` the gates need. */
type TierGates = {
  studioRecommended: boolean;
  standardRecommended: boolean;
  brainUpdateRecommended: boolean;
} | null;

/**
 * True when a brain is installed but belongs to a superseded family, so
 * Settings should offer "Update brain" instead of pretending all is well.
 *
 * Defaults to `false` while the status is still loading: offering an
 * update we have not confirmed is needed is worse than offering it a
 * moment later.
 */
export function needsBrainUpdate(status: TierGates): boolean {
  return status?.brainUpdateRecommended ?? false;
}

/**
 * Whether the Studio tier may be offered on this machine.
 *
 * Defaults to `true` while the status is still loading, matching the
 * backend's own "unknown never means too small" rule — a false "your
 * machine is too small" is a worse failure than the alternative.
 */
export function studioAvailable(status: TierGates): boolean {
  return status?.studioRecommended ?? true;
}

/** Same question for the Standard tier. */
export function standardAvailable(status: TierGates): boolean {
  return status?.standardRecommended ?? true;
}

/**
 * i18n key for a tier's user-facing name.
 *
 * The `full` tier id is frozen — it is persisted in the settings store
 * and written to `models/brain/tier` on disk, so renaming it would
 * strand every existing install; only the label moved to "Studio". That
 * mismatch is exactly the kind of thing that gets re-derived slightly
 * differently at each display site, so it is derived once here.
 */
export function brainTierLabelKey(tier: string | null | undefined): string {
  switch (tier) {
    case "full":
      return "settings.coach.brainStudio";
    case "standard":
      return "settings.coach.brainStandard";
    default:
      return "common.off";
  }
}

/**
 * Display name for the llama.cpp backend. Rust reports the compile-time
 * feature in lower case (`vulkan`); the status line reads "Qwen3 4B on
 * Vulkan", not "on vulkan".
 */
export function backendLabel(backend: string): string {
  switch (backend) {
    case "metal":
      return "Metal";
    case "vulkan":
      return "Vulkan";
    case "cpu":
      return "CPU";
    default:
      return backend;
  }
}
