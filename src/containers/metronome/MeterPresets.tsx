import { useTranslation } from "react-i18next";
import { METER_PRESETS, METER_VARIANTS } from "../../constants/metronome";
import { setBeatGroups, notifySettingsChange, setFreeMode } from "../../ipc";

interface MeterPresetsProps {
  beatGroups: number[];
  freeMode: boolean;
}

export function MeterPresets({ beatGroups, freeMode }: MeterPresetsProps) {
  const { t } = useTranslation();
  const activeKey = JSON.stringify(beatGroups);

  // Find which preset label is active (exact match OR a known variant of it)
  const activePreset = freeMode ? undefined : METER_PRESETS.find(p => {
    if (JSON.stringify(p.groups) === activeKey) return true;
    const variants = METER_VARIANTS[p.label];
    return variants?.some(v => JSON.stringify(v) === activeKey);
  });

  const variants = activePreset ? METER_VARIANTS[activePreset.label] : null;

  async function handleSelect(groups: number[]) {
    if (freeMode) await setFreeMode(false);
    await setBeatGroups(groups);
    await notifySettingsChange();
  }

  return (
    <div className="meter-presets">
      <div className="time-sig-row">
        <span className="row-side-label">Meter</span>
        <button
          key="free"
          className={`time-sig-btn view-stagger-item ${freeMode ? "active" : ""}`}
          style={{ animationDelay: "150ms" }}
          onClick={async () => {
            const total = Math.max(1, beatGroups.reduce((a, b) => a + b, 0));
            await setFreeMode(true);
            await setBeatGroups([total]);
            await notifySettingsChange();
          }}
        >
          {t("metronome.free")}
        </button>
        {METER_PRESETS.map((preset, i) => {
          const isActive = activePreset?.label === preset.label;
          return (
            <button
              key={preset.label}
              className={`time-sig-btn view-stagger-item ${isActive ? "active" : ""}`}
              style={{ animationDelay: `${150 + i * 30}ms` }}
              onClick={() => handleSelect(preset.groups)}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {variants && !freeMode && (
        <div className="meter-variant-row">
          <span className="meter-variant-label">grouping</span>
          {variants.map(v => {
            const key = JSON.stringify(v);
            const isActive = key === activeKey;
            return (
              <button
                key={key}
                className={`meter-variant-chip ${isActive ? "active" : ""}`}
                onClick={() => handleSelect(v)}
              >
                {v.join(" + ")}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
