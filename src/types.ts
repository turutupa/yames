export type Subdivision = 1 | 2 | 3 | 4 | 5 | 6;
export type WidgetMode = "compact" | "comfortable";
export type Corner = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type SpeedRamp = {
  startBpm: number;
  targetBpm: number;
  increment: number;
  decrement: number;
  barsPerStep: number;
  beatsPerBar: number;
  mode: "linear" | "zigzag";
  cyclic: boolean;
  active: boolean;
  currentStep: number;
  currentBpm: number;
  direction: "up" | "down";
  barsInStep: number;
  completed: boolean;
};

export type AppState = {
  bpm: number;
  isPlaying: boolean;
  subdivision: Subdivision;
  mode: WidgetMode;
  corner: Corner;
  alwaysOnTop: boolean;
  accentColor: string;
  theme: string;
  volume: number;
  soundType: string;
  timeSignature: number;
  speedRamp: SpeedRamp;
};

export type BeatEvent = {
  beat: number;
  subdivision: number;
  isDownbeat: boolean;
};
