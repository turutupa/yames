/**
 * The coach's `load_preset`, past the unsaved-work gate (MainWindow): re-read
 * the store at the press, apply the preset, and only then say how it went
 * (review t1b1 N2: "Loaded" was said as soon as the re-read found it, before
 * the six setters had answered, and whether or not they took).
 *
 * `applied` hears exactly once: true when every step was applied; false when
 * the preset was gone or the store could not be read (nothing applied);
 * "failed" when applying it threw or a step failed that the app can see.
 */
import type { Preset } from "../../types";

export type PresetApplied = boolean | "failed";

export function loadPresetAfterReRead(
  presetId: string,
  list: () => Promise<readonly Preset[]>,
  apply: (preset: Preset) => Promise<boolean>,
  applied?: (ok: PresetApplied) => void,
): Promise<void> {
  let told = false;
  const tell = (ok: PresetApplied) => {
    if (told) return;
    told = true;
    applied?.(ok);
  };
  return list()
    .then(
      async (presets) => {
        const fresh = presets.find((p) => p.id === presetId);
        if (!fresh) return tell(false);
        let ok = false;
        try {
          ok = await apply(fresh);
        } catch {
          ok = false;
        }
        tell(ok ? true : "failed");
      },
      () => tell(false),
    )
    .catch(() => tell("failed"));
}
