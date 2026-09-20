import type { BeatEvent } from "../../types";
import { PulseEffect } from "./effects/PulseEffect";
import { GravityEffect } from "./effects/GravityEffect";
import { RadarEffect } from "./effects/RadarEffect";
import { CosmosEffect } from "./effects/CosmosEffect";
import { WarpEffect } from "./effects/WarpEffect";
import { RainEffect } from "./effects/RainEffect";

export type ZenStyle = "focus" | "pulse" | "gravity" | "radar" | "cosmos" | "warp" | "rain";

interface ZenEffectsProps {
  style: ZenStyle;
  currentBeat: BeatEvent | null;
  isPlaying: boolean;
  activeTab: "beat" | "drill" | "jam";
  beatsPerMeasure: number;
}

/**
 * Router that picks the right zen-mode canvas effect based on `style`.
 * Each effect lives in its own file under `./effects/` so the heavy
 * per-frame logic stays isolated — see those files for animation details.
 * Returning null for "focus" intentionally renders no overlay.
 */
export function ZenEffects({ style, currentBeat, isPlaying, activeTab, beatsPerMeasure }: ZenEffectsProps) {
  if (style === "focus") return null;
  if (style === "pulse") return <PulseEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
  if (style === "gravity") return <GravityEffect currentBeat={currentBeat} isPlaying={isPlaying} activeTab={activeTab} />;
  if (style === "radar") return <RadarEffect currentBeat={currentBeat} isPlaying={isPlaying} activeTab={activeTab} beatsPerMeasure={beatsPerMeasure} />;
  if (style === "cosmos") return <CosmosEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
  if (style === "warp") return <WarpEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
  if (style === "rain") return <RainEffect currentBeat={currentBeat} isPlaying={isPlaying} />;
  return null;
}
