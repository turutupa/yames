import { useCallback, useEffect, useRef, useState } from "react";
import {
  getCalibrationOffset,
  onBeat,
  setCalibrationOffset,
  setPlaying,
  togglePlayback,
  storeSave,
  storeLoad,
} from "../ipc";
import "../styles/track-view.css";
import type { AppState, BeatEvent } from "../types";

interface TrackViewProps {
  state: AppState;
  currentBeat: BeatEvent | null;
}

type TapResult = {
  offsetMs: number; // negative = early, positive = late
  timestamp: number;
  rating: Rating;
};

type Rating = "metronomic" | "tight" | "solid" | "loose" | "miss";

type SessionState =
  | "idle"
  | "calibrating"
  | "playing"
  | "calibration-done"
  | "results"
  | "history";

type PerBeatDatum = { beat: number; offsetMs: number | null; rating: Rating };

type GameResult = {
  id: string;
  date: string;
  bpm: number;
  scoredBeats: number;
  overallRating: Rating;
  catchPhrase: string;
  breakdown: Record<Rating, number>;
  avgOffset: number;
  avgAbs: number;
  stdDev: number;
  hitRate: number;
  perBeatData: PerBeatDatum[];
  calibratedTaps: TapResult[];
};

const MAX_HISTORY = 50;

async function loadHistory(): Promise<GameResult[]> {
  try {
    const h = await storeLoad<GameResult[]>("tapitHistory");
    return h ?? [];
  } catch {
    return [];
  }
}

function saveHistory(history: GameResult[]) {
  storeSave("tapitHistory", history.slice(0, MAX_HISTORY));
}

function getOffsetRating(absMs: number): Rating {
  if (absMs <= 15) return "metronomic";
  if (absMs <= 30) return "tight";
  if (absMs <= 50) return "solid";
  if (absMs <= 80) return "loose";
  return "miss";
}

const RATING_LABELS: Record<Rating, string> = {
  metronomic: "Metronomic",
  tight: "Tight",
  solid: "Solid",
  loose: "Loose",
  miss: "Miss",
};

const RATING_COLORS: Record<Rating, string> = {
  metronomic: "#10b981",
  tight: "#06b6d4",
  solid: "#f59e0b",
  loose: "#ff6b6b",
  miss: "#6b7280",
};

const CATCH_PHRASES: Record<Rating, string[]> = {
  metronomic: [
    "You ARE the metronome.",
    "Machine-level precision.",
    "Are you even human?",
    "Flawless rhythm.",
    "Tick-tock perfection.",
  ],
  tight: [
    "Locked in the pocket.",
    "Studio-ready timing.",
    "Drummer approved.",
    "Right on the money.",
    "Groovy and precise.",
  ],
  solid: [
    "Holding it down.",
    "Good foundation.",
    "Keep grinding!",
    "Getting there.",
    "Respectable rhythm.",
  ],
  loose: [
    "Feeling a bit wobbly.",
    "Room to tighten up.",
    "The groove is... creative.",
    "Keep practicing!",
    "Almost there.",
  ],
  miss: [
    "Were you even trying?",
    "The beat was lonely.",
    "Ghost notes only.",
    "Rhythm is optional, apparently.",
    "Let's pretend this didn't happen.",
  ],
};

function getRandomPhrase(rating: Rating): string {
  const phrases = CATCH_PHRASES[rating];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

export function TrackView({ state }: TrackViewProps) {
  const [session, setSession] = useState<SessionState>("idle");
  const [taps, setTaps] = useState<TapResult[]>([]);
  const [beatCount, setBeatCount] = useState(0);
  const [savedOffset, setSavedOffset] = useState<number | null>(null);
  const [history, setHistory] = useState<GameResult[]>([]);
  const [viewingResult, setViewingResult] = useState<GameResult | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const beatTimestamps = useRef<number[]>([]);
  const firstBeatTime = useRef<number>(0);
  const bpmAtStart = useRef<number>(120);
  const hasSavedRef = useRef(false);
  const warmupBeats = 4;
  const scoredBeats = 32;
  const maxBeats = warmupBeats + scoredBeats;
  const calibrationBeats = 8;
  const isWarmup = session === "playing" && beatCount < warmupBeats;

  // Load saved calibration on mount
  useEffect(() => {
    getCalibrationOffset().then((v) => setSavedOffset(v));
  }, []);

  // On mount, load history and show last result if available
  useEffect(() => {
    loadHistory().then((h) => {
      setHistory(h);
      if (h.length > 0) {
        setViewingResult(h[0]);
        setSession("results");
      }
    });
  }, []);

  // Stop playback when component unmounts (tab change)
  useEffect(() => {
    return () => {
      if (session === "playing" || session === "calibrating") {
        setPlaying(false);
      }
    };
  }, [session]);

  // Record beat timestamps using hybrid approach
  useEffect(() => {
    if (session !== "playing" && session !== "calibrating") return;
    const unlisten = onBeat((b: BeatEvent) => {
      if (b.subdivision === 0) {
        const now = performance.now();
        const beats = beatTimestamps.current;
        if (beats.length === 0) {
          firstBeatTime.current = now;
          bpmAtStart.current = state.bpm;
          beats.push(now);
        } else {
          const beatIntervalMs = 60000 / bpmAtStart.current;
          const beatIndex = beats.length;
          const computed = firstBeatTime.current + beatIndex * beatIntervalMs;
          const blended = computed * 0.7 + now * 0.3;
          beats.push(blended);
        }
        setBeatCount((c) => c + 1);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [session, state.bpm]);

  // Auto-finish calibration
  useEffect(() => {
    if (session === "calibrating" && beatCount >= calibrationBeats) {
      setPlaying(false);
      // Compute median offset from calibration taps
      if (taps.length >= 2) {
        const sorted = [...taps].map((t) => t.offsetMs).sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        const median =
          sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
        setSavedOffset(median);
        setCalibrationOffset(median);
      }
      setSession("calibration-done");
    }
  }, [beatCount, session, taps]);

  // Auto-finish playing — delay so user can tap the last beat
  useEffect(() => {
    if (session === "playing" && beatCount >= maxBeats) {
      const timer = setTimeout(
        () => {
          setSession("results");
          setPlaying(false);
        },
        (60000 / bpmAtStart.current) * 0.75,
      );
      return () => clearTimeout(timer);
    }
  }, [beatCount, session]);

  const handleTap = useCallback(() => {
    if (session !== "playing" && session !== "calibrating") return;
    const now = performance.now();
    const beats = beatTimestamps.current;
    if (beats.length === 0) return;

    let minOffset = Infinity;
    for (let i = beats.length - 1; i >= Math.max(0, beats.length - 3); i--) {
      const offset = now - beats[i];
      if (Math.abs(offset) < Math.abs(minOffset)) {
        minOffset = offset;
      }
    }

    const beatIntervalMs = 60000 / state.bpm;
    const lastBeat = beats[beats.length - 1];
    const nextBeatEst = lastBeat + beatIntervalMs;
    const nextOffset = now - nextBeatEst;
    if (Math.abs(nextOffset) < Math.abs(minOffset)) {
      minOffset = nextOffset;
    }

    const rating = getOffsetRating(Math.abs(minOffset));
    // For playing session: find which beat this tap is closest to, skip if it's a warmup beat
    if (session === "playing") {
      let closestBeatIdx = beats.length - 1;
      let closestDist = Math.abs(now - beats[closestBeatIdx]);
      for (let i = beats.length - 2; i >= Math.max(0, beats.length - 3); i--) {
        const dist = Math.abs(now - beats[i]);
        if (dist < closestDist) {
          closestDist = dist;
          closestBeatIdx = i;
        }
      }
      // Also check next estimated beat
      const nextBeatIdx = beats.length;
      const nextDist = Math.abs(now - nextBeatEst);
      if (nextDist < closestDist) {
        closestBeatIdx = nextBeatIdx;
      }
      if (closestBeatIdx < warmupBeats) return; // warmup beat, ignore
    }
    setTaps((prev) => [
      ...prev,
      { offsetMs: minOffset, timestamp: now, rating },
    ]);
  }, [session, state.bpm]);

  const catchPhraseRef = useRef("");

  const startSession = () => {
    setViewingResult(null);
    setTaps([]);
    setBeatCount(0);
    beatTimestamps.current = [];
    firstBeatTime.current = 0;
    bpmAtStart.current = state.bpm;
    catchPhraseRef.current = "";
    setSession("playing");
    if (!state.isPlaying) togglePlayback();
  };

  const startCalibration = () => {
    setViewingResult(null);
    setTaps([]);
    setBeatCount(0);
    beatTimestamps.current = [];
    firstBeatTime.current = 0;
    bpmAtStart.current = state.bpm;
    setSession("calibrating");
    if (!state.isPlaying) togglePlayback();
  };

  const stopSession = () => {
    setPlaying(false);
    setTaps([]);
    setBeatCount(0);
    beatTimestamps.current = [];
    // Go back to last result if exists, otherwise idle
    loadHistory().then((h) => {
      if (h.length > 0) {
        setViewingResult(h[0]);
        setSession("results");
      } else {
        setSession("idle");
      }
    });
  };

  // Spacebar → start session when idle, results, or history
  // (handled by MainWindow's unified dispatcher via "play" hotkey)

  // Apply saved calibration to scored taps
  const offset = savedOffset ?? 0;
  const calibratedTaps = taps.map((t) => ({
    ...t,
    offsetMs: t.offsetMs - offset,
    rating: getOffsetRating(Math.abs(t.offsetMs - offset)),
  }));
  const validTaps = calibratedTaps.filter((t) => t.rating !== "miss");
  const avgOffset =
    validTaps.length > 0
      ? validTaps.reduce((sum, t) => sum + t.offsetMs, 0) / validTaps.length
      : 0;
  const absOffsets = validTaps.map((t) => Math.abs(t.offsetMs));
  const avgAbs =
    absOffsets.length > 0
      ? absOffsets.reduce((a, b) => a + b, 0) / absOffsets.length
      : 0;
  const stdDev =
    validTaps.length > 1
      ? Math.sqrt(
          validTaps.reduce((sum, t) => sum + (t.offsetMs - avgOffset) ** 2, 0) /
            (validTaps.length - 1),
        )
      : 0;
  const scoredBeatCount = Math.max(0, beatCount - warmupBeats);
  const hitRate =
    scoredBeatCount > 0 && session === "results"
      ? Math.round((validTaps.length / scoredBeats) * 100)
      : 0;
  const overallRating: Rating = (() => {
    if (validTaps.length === 0) return "miss";
    const missCount = Math.max(0, scoredBeats - calibratedTaps.length);
    const totalBeats = validTaps.length + missCount;
    const adjustedAvg =
      (avgAbs * validTaps.length + missCount * 100) / Math.max(totalBeats, 1);
    return getOffsetRating(adjustedAvg);
  })();

  if (session === "results" && !catchPhraseRef.current) {
    catchPhraseRef.current = getRandomPhrase(overallRating);
  }
  if (session !== "results") {
    catchPhraseRef.current = "";
  }

  const breakdown = calibratedTaps.reduce(
    (acc, t) => {
      acc[t.rating] = (acc[t.rating] || 0) + 1;
      return acc;
    },
    {} as Record<Rating, number>,
  );

  // --- RESULTS DATA (must be before any early returns to satisfy hooks rules) ---
  const perBeatData: PerBeatDatum[] = (() => {
    if (session !== "results") return [];
    if (viewingResult) return viewingResult.perBeatData;
    const beats = beatTimestamps.current;
    const beatIntervalMs = 60000 / state.bpm;
    const data: PerBeatDatum[] = [];
    for (let b = warmupBeats; b < beats.length; b++) {
      const beatTime = beats[b];
      let bestTap: (typeof calibratedTaps)[number] | null = null;
      let bestDist = Infinity;
      for (const tap of calibratedTaps) {
        const dist = Math.abs(tap.timestamp - beatTime);
        if (dist < bestDist && dist < beatIntervalMs * 0.5) {
          bestDist = dist;
          bestTap = tap;
        }
      }
      if (bestTap) {
        data.push({
          beat: b + 1,
          offsetMs: bestTap.offsetMs,
          rating: bestTap.rating,
        });
      } else {
        data.push({ beat: b + 1, offsetMs: null, rating: "miss" });
      }
    }
    return data;
  })();

  // Save fresh results to history
  useEffect(() => {
    if (
      session === "results" &&
      !viewingResult &&
      perBeatData.length > 0 &&
      !hasSavedRef.current
    ) {
      hasSavedRef.current = true;
      const result: GameResult = {
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
        bpm: bpmAtStart.current,
        scoredBeats,
        overallRating,
        catchPhrase: catchPhraseRef.current,
        breakdown: {
          ...breakdown,
          metronomic: breakdown.metronomic || 0,
          tight: breakdown.tight || 0,
          solid: breakdown.solid || 0,
          loose: breakdown.loose || 0,
          miss: breakdown.miss || 0,
        },
        avgOffset,
        avgAbs,
        stdDev,
        hitRate,
        perBeatData,
        calibratedTaps,
      };
      const updated = [result, ...history];
      setHistory(updated);
      saveHistory(updated);
      setViewingResult(result);
    }
  }, [session, viewingResult, perBeatData.length]);

  // Reset save guard when starting a new game
  useEffect(() => {
    if (session === "playing") {
      hasSavedRef.current = false;
    }
  }, [session]);

  // --- IDLE ---
  if (session === "idle") {
    return (
      <div className="track-view">
        <div className="track-intro">
          <div className="track-intro-icon">🎯</div>
          <h3>Rhythm Accuracy</h3>
          <p>
            Tap along with the metronome for {scoredBeats} beats. Click{" "}
            the target to log each beat.
          </p>
          {savedOffset !== null ? (
            <p className="track-config-hint">
              Calibrated: {savedOffset >= 0 ? "+" : ""}
              {savedOffset.toFixed(1)}ms offset
            </p>
          ) : (
            <p className="track-config-hint">
              Calibrate first for best accuracy on your system.
            </p>
          )}
          <div className="track-ratings-legend">
            {(
              ["metronomic", "tight", "solid", "loose", "miss"] as Rating[]
            ).map((r) => (
              <span key={r} className="track-legend-item">
                <span
                  className="track-legend-dot"
                  style={{ background: RATING_COLORS[r] }}
                />
                {RATING_LABELS[r]}
              </span>
            ))}
          </div>
        </div>
        <button className="play-btn full-width" onClick={startSession}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4 2.5a.5.5 0 0 1 .77-.42l9 5.5a.5.5 0 0 1 0 .84l-9 5.5A.5.5 0 0 1 4 13.5z" />
          </svg>
          Start
        </button>
        <div className="track-secondary-actions">
          <button
            className="play-btn full-width secondary"
            onClick={startCalibration}
          >
            Calibrate
          </button>
          <button
            className="play-btn full-width secondary"
            onClick={() => setSession("history")}
            disabled={history.length === 0}
          >
            History
          </button>
        </div>
      </div>
    );
  }

  // --- CALIBRATION DONE ---
  if (session === "calibration-done") {
    return (
      <div className="track-view">
        <div className="track-intro">
          <div className="track-intro-icon">✅</div>
          <h3>Calibrated!</h3>
          <p>
            Your system offset:{" "}
            <strong>
              {savedOffset !== null
                ? `${savedOffset >= 0 ? "+" : ""}${savedOffset.toFixed(1)}ms`
                : "0ms"}
            </strong>
          </p>
          <p className="track-config-hint">
            This accounts for audio output latency and input lag on your system.
            You can recalibrate anytime.
          </p>
        </div>
        <button
          className="play-btn full-width"
          onClick={() => setSession("idle")}
        >
          Done
        </button>
      </div>
    );
  }

  // --- CALIBRATING ---
  if (session === "calibrating") {
    const calProgress = beatCount / calibrationBeats;
    return (
      <div
        className="track-view track-playing"
        onMouseDown={handleTap}
        onTouchStart={(e) => {
          e.preventDefault();
          handleTap();
        }}
      >
        <div className="track-live-header">
          <span className="track-live-beats warmup">
            Calibrating {beatCount}/{calibrationBeats}
          </span>
          <span className="track-live-taps">{taps.length} taps</span>
        </div>

        <div className="track-progress-ring">
          <svg viewBox="0 0 100 100" className="track-ring-svg">
            <circle cx="50" cy="50" r="42" className="track-ring-bg" />
            <circle
              cx="50"
              cy="50"
              r="42"
              className="track-ring-warmup"
              style={{ strokeDashoffset: `${264 * (1 - calProgress)}` }}
            />
          </svg>
          <div className="track-ring-center">
            <span className="track-ring-label warmup">TAP</span>
            {taps.length > 0 && (
              <span
                className="track-last-offset"
                style={{ color: "var(--text-muted)" }}
              >
                {taps[taps.length - 1].offsetMs >= 0 ? "+" : ""}
                {taps[taps.length - 1].offsetMs.toFixed(0)}ms
              </span>
            )}
          </div>
        </div>

        <div className="track-live-hint">
          Tap naturally along with the clicks
        </div>

        <button
          className="play-btn full-width playing"
          onMouseDown={(e) => {
            e.stopPropagation();
            stopSession();
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <rect x="2" y="2" width="12" height="12" rx="1.5" />
          </svg>
          Cancel
        </button>
      </div>
    );
  }

  if (session === "results") {
    // Use viewingResult data if viewing from history, otherwise use live computed data
    const r = viewingResult;
    const displayRating = r ? r.overallRating : overallRating;
    const displayBreakdown = r ? r.breakdown : breakdown;
    const displayPerBeat = r ? r.perBeatData : perBeatData;
    const displayTaps = r ? r.calibratedTaps : calibratedTaps;
    const displayBpm = r ? r.bpm : bpmAtStart.current;

    const smoothed = displayPerBeat.map((_d, i) => {
      const window = 5;
      const half = Math.floor(window / 2);
      let sum = 0,
        count = 0;
      for (
        let j = Math.max(0, i - half);
        j <= Math.min(displayPerBeat.length - 1, i + half);
        j++
      ) {
        if (displayPerBeat[j].offsetMs !== null) {
          sum += displayPerBeat[j].offsetMs!;
          count++;
        }
      }
      return count > 0 ? sum / count : null;
    });

    return (
      <div className="track-view track-results-view">
        <div className="track-results-toolbar">
          {history.length > 0 && (
            <button
              className="track-toolbar-btn"
              onClick={() => setSession("history")}
              data-tooltip="History"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="14" width="4" height="7" rx="1"/>
                <rect x="10" y="8" width="4" height="13" rx="1"/>
                <rect x="16" y="3" width="4" height="18" rx="1"/>
              </svg>
            </button>
          )}
          <button
            className="track-toolbar-btn"
            onClick={startCalibration}
            data-tooltip="Calibrate"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="4" y1="8" x2="20" y2="8"/>
              <line x1="4" y1="16" x2="20" y2="16"/>
              <circle cx="9" cy="8" r="2.5" fill="currentColor"/>
              <circle cx="15" cy="16" r="2.5" fill="currentColor"/>
            </svg>
          </button>
        </div>
        <div className="track-results">
          <div className="track-result-header">
            <div className="track-result-rating-wrap">
              <span className="track-result-prefix">Your timing was</span>
              <span
                className="track-result-rating"
                style={{ color: RATING_COLORS[displayRating] }}
              >
                {RATING_LABELS[displayRating]}
              </span>
            </div>
            <div className="track-result-meta">
              {displayBpm} BPM · {r ? new Date(r.date).toLocaleDateString() : new Date().toLocaleDateString()}
            </div>
          </div>

          {/* Rating breakdown bars */}
          <div className="track-breakdown">
            {(
              ["metronomic", "tight", "solid", "loose", "miss"] as Rating[]
            ).map((rating) => (
              <div key={rating} className="track-breakdown-row">
                <span
                  className="track-breakdown-dot"
                  style={{ background: RATING_COLORS[rating] }}
                />
                <span className="track-breakdown-label">
                  {RATING_LABELS[rating]}
                </span>
                <span className="track-breakdown-count">
                  {displayBreakdown[rating] || 0}
                </span>
                <div className="track-breakdown-bar">
                  <div
                    className="track-breakdown-fill"
                    style={{
                      width: `${displayTaps.length > 0 ? ((displayBreakdown[rating] || 0) / displayTaps.length) * 100 : 0}%`,
                      background: RATING_COLORS[rating],
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Accuracy graph */}
          <div className="track-accuracy-graph">
            <div className="track-graph-y-labels">
              <span>Early</span>
              <span>0ms</span>
              <span>Late</span>
            </div>
            <svg
              viewBox={`0 0 ${Math.max(displayPerBeat.length, 1) * 20} 120`}
              preserveAspectRatio="none"
              className="track-graph-svg"
            >
              <line
                x1="0"
                y1="60"
                x2={displayPerBeat.length * 20}
                y2="60"
                stroke="var(--graph-grid)"
                strokeWidth="1"
              />
              {(() => {
                const points = displayPerBeat
                  .map((d, i) =>
                    d.offsetMs !== null
                      ? {
                          x: i * 20 + 10,
                          y:
                            60 -
                            (Math.max(-80, Math.min(80, d.offsetMs)) / 80) * 55,
                        }
                      : null,
                  )
                  .filter(Boolean) as { x: number; y: number }[];
                if (points.length < 2) return null;
                const pathD = points
                  .map((p, i) => {
                    if (i === 0) return `M ${p.x} ${p.y}`;
                    const prev = points[i - 1];
                    const cpx1 = prev.x + (p.x - prev.x) * 0.4;
                    const cpx2 = p.x - (p.x - prev.x) * 0.4;
                    return `C ${cpx1} ${prev.y} ${cpx2} ${p.y} ${p.x} ${p.y}`;
                  })
                  .join(" ");
                return (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="var(--graph-line)"
                    strokeWidth="2"
                  />
                );
              })()}
              {(() => {
                const points = smoothed
                  .map((val, i) =>
                    val !== null
                      ? {
                          x: i * 20 + 10,
                          y: 60 - (Math.max(-80, Math.min(80, val)) / 80) * 55,
                        }
                      : null,
                  )
                  .filter(Boolean) as { x: number; y: number }[];
                if (points.length < 2) return null;
                const pathD = points
                  .map((p, i) => {
                    if (i === 0) return `M ${p.x} ${p.y}`;
                    const prev = points[i - 1];
                    const cpx1 = prev.x + (p.x - prev.x) * 0.4;
                    const cpx2 = p.x - (p.x - prev.x) * 0.4;
                    return `C ${cpx1} ${prev.y} ${cpx2} ${p.y} ${p.x} ${p.y}`;
                  })
                  .join(" ");
                return (
                  <path
                    d={pathD}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth="2.5"
                  />
                );
              })()}
              {displayPerBeat.map((d, i) => {
                const x = i * 20 + 10;
                if (d.offsetMs === null) {
                  return (
                    <g key={i}>
                      <line
                        x1={x - 4}
                        y1="56"
                        x2={x + 4}
                        y2="64"
                        stroke="#ff4444"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <line
                        x1={x + 4}
                        y1="56"
                        x2={x - 4}
                        y2="64"
                        stroke="#ff4444"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </g>
                  );
                }
                return null;
              })}
              {displayPerBeat.map((d, i) => {
                if (d.offsetMs === null) return null;
                const x = i * 20 + 10;
                const y =
                  60 - (Math.max(-80, Math.min(80, d.offsetMs)) / 80) * 55;
                return (
                  <circle
                    key={`dot-${i}`}
                    cx={x}
                    cy={y}
                    r="3"
                    fill={RATING_COLORS[d.rating]}
                    opacity="0.35"
                  />
                );
              })}
            </svg>
          </div>

          {/* Scatter plot */}
          <div className="track-scatter">
            <div className="track-scatter-zero" />
            {displayTaps.map((t, i) => (
              <div
                key={i}
                className="track-scatter-dot"
                style={{
                  left: `${Math.min(100, Math.max(0, ((t.offsetMs + 80) / 160) * 100))}%`,
                  top: `${(i / Math.max(displayTaps.length - 1, 1)) * 100}%`,
                  background: RATING_COLORS[t.rating],
                }}
              />
            ))}
            <span className="track-scatter-label-left">−80ms</span>
            <span className="track-scatter-label-right">+80ms</span>
          </div>
        </div>

        <button className="play-btn full-width track-floating-cta" onClick={startSession}>
          Try Again
        </button>
      </div>
    );
  }

  // --- HISTORY ---
  if (session === "history") {
    return (
      <div className="track-view track-history-view">
        <div className="track-history-header">
          <button
            className="track-history-back"
            onClick={() => {
              setViewingResult(history[0] || null);
              setSession("results");
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0"
              />
            </svg>
          </button>
          <h3>History</h3>
          <button
            className="track-toolbar-btn track-history-delete"
            data-tooltip="Clear all"
            onClick={() => setShowClearConfirm(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
            </svg>
          </button>
        </div>
        <div className="track-history-list">
          {history.map((game) => (
            <button
              key={game.id}
              className="track-history-item"
              onClick={() => {
                setViewingResult(game);
                setSession("results");
              }}
            >
              <span
                className="track-history-rating"
                style={{ color: RATING_COLORS[game.overallRating] }}
              >
                {RATING_LABELS[game.overallRating]}
              </span>
              <span className="track-history-detail">
                {game.bpm} BPM · {game.hitRate}% hits
              </span>
              <span className="track-history-date">
                {new Date(game.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </button>
          ))}
        </div>
        <button className="play-btn full-width track-floating-cta" onClick={startSession}>
          Try Again
        </button>
        {showClearConfirm && (
          <div className="keybinding-overlay" onClick={() => setShowClearConfirm(false)}>
            <div className="keybinding-capture" onClick={(e) => e.stopPropagation()}>
              <div className="keybinding-capture-title">Clear History</div>
              <p className="about-text" style={{ textAlign: "center", marginBottom: 0 }}>
                Delete all {history.length} saved games? This cannot be undone.
              </p>
              <div className="keybinding-capture-actions">
                <button
                  className="keybinding-btn-remove"
                  onClick={() => {
                    setHistory([]);
                    saveHistory([]);
                    setShowClearConfirm(false);
                    setSession("idle");
                  }}
                >
                  Delete All
                </button>
                <button
                  className="keybinding-btn-reset"
                  onClick={() => setShowClearConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // --- PLAYING ---
  const scoredProgress = Math.max(0, beatCount - warmupBeats) / scoredBeats;
  const warmupProgress = Math.min(beatCount / warmupBeats, 1);
  return (
    <div
      className="track-view track-playing"
      onMouseDown={handleTap}
      onTouchStart={(e) => {
        e.preventDefault();
        handleTap();
      }}
    >
      <div className="track-live-header">
        {isWarmup ? (
          <span className="track-live-beats warmup">
            Warm-up {beatCount}/{warmupBeats}
          </span>
        ) : (
          <span className="track-live-beats">
            {Math.max(0, beatCount - warmupBeats)}/{scoredBeats}
          </span>
        )}
        <span className="track-live-taps">{taps.length} taps</span>
      </div>

      <div className="track-progress-ring">
        <svg viewBox="0 0 100 100" className="track-ring-svg">
          <circle cx="50" cy="50" r="42" className="track-ring-bg" />
          {isWarmup ? (
            <circle
              cx="50"
              cy="50"
              r="42"
              className="track-ring-warmup"
              style={{ strokeDashoffset: `${264 * (1 - warmupProgress)}` }}
            />
          ) : (
            <circle
              cx="50"
              cy="50"
              r="42"
              className="track-ring-fill"
              style={{ strokeDashoffset: `${264 * (1 - scoredProgress)}` }}
            />
          )}
        </svg>
        <div className="track-ring-center">
          {isWarmup ? (
            <span className="track-ring-label warmup">GET READY</span>
          ) : (
            <span className="track-ring-label">TAP</span>
          )}
          {!isWarmup &&
            taps.length > 0 &&
            (() => {
              const lastCal = taps[taps.length - 1].offsetMs - offset;
              const lastRating = getOffsetRating(Math.abs(lastCal));
              return (
                <span
                  className="track-last-offset"
                  style={{ color: RATING_COLORS[lastRating] }}
                >
                  {lastCal >= 0 ? "+" : ""}
                  {lastCal.toFixed(0)}ms
                </span>
              );
            })()}
        </div>
      </div>

      <div className="track-live-dots">
        {(() => {
          const beatIntervalMs = 60000 / bpmAtStart.current;
          const beats = beatTimestamps.current;
          const items: {
            type: "hit" | "miss" | "warmup";
            rating?: Rating;
            color?: string;
          }[] = [];
          for (let b = 0; b < beats.length; b++) {
            const beatTime = beats[b];
            if (b < warmupBeats) {
              items.push({ type: "warmup" });
              continue;
            }
            let matched = false;
            for (const tap of taps) {
              if (Math.abs(tap.timestamp - beatTime) < beatIntervalMs * 0.5) {
                const calOffset = tap.offsetMs - offset;
                const calRating = getOffsetRating(Math.abs(calOffset));
                items.push({
                  type: "hit",
                  rating: calRating,
                  color: RATING_COLORS[calRating],
                });
                matched = true;
                break;
              }
            }
            if (!matched) {
              // Don't mark the most recent beat as miss yet — user still has time to tap
              if (b === beats.length - 1) {
                items.push({ type: "warmup" }); // show as neutral/pending dot
              } else {
                items.push({ type: "miss" });
              }
            }
          }
          return items
            .slice(-16)
            .map((item, i) => (
              <span
                key={i}
                className={`track-live-dot ${item.type === "miss" ? "miss" : ""} ${item.type === "warmup" ? "warmup" : ""}`}
                style={
                  item.type === "hit" ? { background: item.color } : undefined
                }
              />
            ));
        })()}
      </div>

      <div className="track-live-hint">
        Click the target to tap along
      </div>

      <button
        className="play-btn full-width playing"
        onMouseDown={(e) => {
          e.stopPropagation();
          stopSession();
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <rect x="2" y="2" width="12" height="12" rx="1.5" />
        </svg>
        Stop
      </button>
    </div>
  );
}
