import { METER_PRESETS } from "../../constants/metronome";
import { setBeatGroups, notifySettingsChange } from "../../ipc";

interface MeterPresetsProps {
  beatGroups: number[];
}

export function MeterPresets({ beatGroups }: MeterPresetsProps) {
  const activeKey = JSON.stringify(beatGroups);

  async function handleSelect(groups: number[]) {
    await setBeatGroups(groups);
    await notifySettingsChange();
  }

  return (
    <div className="time-sig-row">
      <span className="row-side-label">Meter</span>
      {METER_PRESETS.map((preset, i) => {
        const isActive = JSON.stringify(preset.groups) === activeKey;
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
  );
}
