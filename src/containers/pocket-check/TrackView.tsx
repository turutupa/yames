import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  getCalibrationOffset,
  onBeat,
  setCalibrationOffset,
  setBpm,
  setSubdivision,
  setPlaying,
  storeLoad,
  storeSave,
  togglePlayback,
} from "../../ipc";
import { listen } from "@tauri-apps/api/event";
import "../../styles/track-view.css";
import type { AppState, BeatEvent, Subdivision } from "../../types";
import {
  loadHistory,
  saveHistory,
  getOffsetRating,
  getRandomPhrase,
} from "./trackTypes";
import type {
  Rating,
  TapResult,
  SessionState,
  PerBeatDatum,
  GameResult,
  GameMode,
  ChordSequence,
  RhythmPattern,
} from "./trackTypes";
import { CHORD_SEQUENCES, RHYTHM_PATTERNS } from "./presets";
import { useCuedSession } from "./hooks/useCuedSession";
import { TrackIdleView } from "./TrackIdleView";
import { TrackCalibrationDoneView } from "./TrackCalibrationDoneView";
import { TrackHistoryView } from "./TrackHistoryView";
import { TrackResultsView } from "./TrackResultsView";
import { TrackCalibratingView } from "./TrackCalibratingView";
import { TrackPlayingView } from "./TrackPlayingView";

interface TrackViewProps {
  state: AppState;
  currentBeat: BeatEvent | null;
  evaluationEnabled?: boolean;
}

export interface TrackViewHandle {
  spaceAction: () => void;
}

export const TrackView = forwardRef<TrackViewHandle, TrackViewProps>(function TrackView({ state, evaluationEnabled }, ref) {
  const [session, setSession] = useState<SessionState>("idle");
  const [taps, setTaps] = useState<TapResult[]>([]);
  const [beatCount, setBeatCount] = useState(0);
  const [savedOffset, setSavedOffset] = useState<number | null>(null);
  const [history, setHistory] = useState<GameResult[]>([]);
  const [viewingResult, setViewingResult] = useState<GameResult | null>(null);
  const [gameBpm, setGameBpm] = useState(80);
  const [gameMode, setGameMode] = useState<GameMode>("free");
  const [selectedSequence, setSelectedSequence] = useState<ChordSequence | null>(CHORD_SEQUENCES[0]);
  const [selectedPattern, setSelectedPattern] = useState<RhythmPattern | null>(RHYTHM_PATTERNS[0]);
  const beatTimestamps = useRef<number[]>([]);
  const firstBeatTime = useRef<number>(0);
  const bpmAtStart = useRef<number>(120);
  const gameModeRef = useRef<GameMode>("free");
  const sequenceNameRef = useRef<string | undefined>(undefined);
  const patternNameRef = useRef<string | undefined>(undefined);
  const gameSubdivisionRef = useRef<number>(1);
  const hasSavedRef = useRef(false);
  const warmupBeats = 4;
  const scoredBeats = 32;
  const maxBeats = warmupBeats + scoredBeats;
  const calibrationBeats = 8;

  // Load saved calibration on mount
  useEffect(() => {
    getCalibrationOffset().then((v) => setSavedOffset(v));
  }, []);

  // Load persisted mode/preset selection on mount
  useEffect(() => {
    storeLoad<{ mode: GameMode; sequenceName?: string; patternName?: string; gameBpm?: number }>("pocketCheckMode").then((saved) => {
      if (!saved) return;
      if (saved.mode) setGameMode(saved.mode);
      if (saved.gameBpm) setGameBpm(saved.gameBpm);
      if (saved.sequenceName) {
        const seq = CHORD_SEQUENCES.find((s) => s.name === saved.sequenceName) ?? null;
        if (seq) setSelectedSequence(seq);
      }
      if (saved.patternName) {
        const pat = RHYTHM_PATTERNS.find((p) => p.name === saved.patternName) ?? null;
        if (pat) setSelectedPattern(pat);
      }
    });
  }, []);

  // Persist mode/preset on change
  useEffect(() => {
    storeSave("pocketCheckMode", {
      mode: gameMode,
      sequenceName: selectedSequence?.name,
      patternName: selectedPattern?.name,
      gameBpm,
    });
  }, [gameMode, selectedSequence, selectedPattern, gameBpm]);

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
  }, [session]);

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

  const {
    currentCue,
    chordIndex,
    subBeatTimestamps,
    subBeatCount,
    gameSubdivision,
    expectedTaps,
  } = useCuedSession({
    session,
    beatCount,
    bpm: gameBpm,
    gameMode,
    selectedSequence,
    selectedPattern,
  });

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

    // Rhythm mode: match against sub-beat timestamps for tighter windowing
    if (session === "playing" && gameModeRef.current === "rhythm") {
      const subBeats = subBeatTimestamps.current;
      if (subBeats.length === 0) return;
      const subBeatWindowMs = (60000 / bpmAtStart.current / gameSubdivisionRef.current) * 0.5;
      let closestSubBeatIdx = subBeats.length - 1;
      let closestDist = Math.abs(now - subBeats[closestSubBeatIdx]);
      for (let i = subBeats.length - 2; i >= Math.max(0, subBeats.length - (gameSubdivisionRef.current * 3 + 1)); i--) {
        const dist = Math.abs(now - subBeats[i]);
        if (dist < closestDist) {
          closestDist = dist;
          closestSubBeatIdx = i;
        }
      }
      if (closestDist > subBeatWindowMs) return; // outside tolerance
      if (Math.floor(closestSubBeatIdx / gameSubdivisionRef.current) < warmupBeats) return; // warmup guard
      const minOffset = now - subBeats[closestSubBeatIdx];
      const rating = getOffsetRating(Math.abs(minOffset));
      setTaps((prev) => [...prev, { offsetMs: minOffset, timestamp: now, rating }]);
      return;
    }

    // Beat mode (free + chords): match against beat timestamps
    const beats = beatTimestamps.current;
    if (beats.length === 0) return;

    let minOffset = Infinity;
    for (let i = beats.length - 1; i >= Math.max(0, beats.length - 3); i--) {
      const offset = now - beats[i];
      if (Math.abs(offset) < Math.abs(minOffset)) {
        minOffset = offset;
      }
    }

    const beatIntervalMs = 60000 / bpmAtStart.current;
    const lastBeat = beats[beats.length - 1];
    const nextBeatEst = lastBeat + beatIntervalMs;
    const nextOffset = now - nextBeatEst;
    if (Math.abs(nextOffset) < Math.abs(minOffset)) {
      minOffset = nextOffset;
    }

    const rating = getOffsetRating(Math.abs(minOffset));
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
  }, [session, subBeatTimestamps]);

  // When evaluation is enabled, listen for instrument onset events as taps
  useEffect(() => {
    if (!evaluationEnabled) return;
    if (session !== "playing" && session !== "calibrating") return;

    let cancelled = false;
    const promise = listen<{ tsNs: number; amplitude: number; centroid: number }>(
      "onset-detected",
      () => {
        if (!cancelled) handleTap();
      },
    );

    return () => {
      cancelled = true;
      promise.then((unlisten) => unlisten());
    };
  }, [evaluationEnabled, session, handleTap]);

  const catchPhraseRef = useRef("");

  const startSession = () => {
    setViewingResult(null);
    setTaps([]);
    setBeatCount(0);
    beatTimestamps.current = [];
    firstBeatTime.current = 0;
    bpmAtStart.current = gameBpm;
    gameModeRef.current = gameMode;
    sequenceNameRef.current = gameMode === "chords" ? selectedSequence?.name : undefined;
    patternNameRef.current = gameMode === "rhythm" ? selectedPattern?.name : undefined;
    gameSubdivisionRef.current = gameSubdivision;
    catchPhraseRef.current = "";
    setBpm(gameBpm);
    setSubdivision(gameSubdivision as Subdivision);
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

  // Spacebar → start session when idle/results/history, stop when playing/calibrating
  useImperativeHandle(ref, () => ({
    spaceAction() {
      if (session === "idle" || session === "results" || session === "history" || session === "calibration-done") {
        startSession();
      } else if (session === "playing" || session === "calibrating") {
        stopSession();
      }
    },
  }), [session]);

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
      ? Math.round((validTaps.length / expectedTaps) * 100)
      : 0;
  const overallRating: Rating = (() => {
    if (validTaps.length === 0) return "miss";
    const missCount = Math.max(0, expectedTaps - calibratedTaps.length);
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
    const beatIntervalMs = 60000 / bpmAtStart.current;
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
        mode: gameModeRef.current,
        sequenceName: sequenceNameRef.current,
        patternName: patternNameRef.current,
        gameSubdivision: gameSubdivisionRef.current,
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
      <TrackIdleView
        evaluationEnabled={evaluationEnabled}
        scoredBeats={scoredBeats}
        savedOffset={savedOffset}
        hasHistory={history.length > 0}
        session={session}
        gameMode={gameMode}
        gameBpm={gameBpm}
        selectedSequence={selectedSequence}
        selectedPattern={selectedPattern}
        onModeChange={setGameMode}
        onBpmChange={setGameBpm}
        onSequenceChange={setSelectedSequence}
        onPatternChange={setSelectedPattern}
        onStart={startSession}
        onCalibrate={startCalibration}
        onShowHistory={() => setSession("history")}
      />
    );
  }

  // --- CALIBRATION DONE ---
  if (session === "calibration-done") {
    return (
      <TrackCalibrationDoneView
        savedOffset={savedOffset}
        onDone={() => setSession("idle")}
      />
    );
  }

  // --- CALIBRATING ---
  if (session === "calibrating") {
    return (
      <TrackCalibratingView
        beatCount={beatCount}
        calibrationBeats={calibrationBeats}
        taps={taps}
        onTap={handleTap}
        onStop={stopSession}
      />
    );
  }

  if (session === "results") {
    // Use viewingResult data if viewing from history, otherwise use live computed data
    const r = viewingResult;
    return (
      <TrackResultsView
        hasHistory={history.length > 0}
        displayRating={r ? r.overallRating : overallRating}
        displayBreakdown={r ? r.breakdown : breakdown}
        displayPerBeat={r ? r.perBeatData : perBeatData}
        displayTaps={r ? r.calibratedTaps : calibratedTaps}
        displayBpm={r ? r.bpm : bpmAtStart.current}
        viewingResult={r}
        liveMode={gameModeRef.current}
        liveSequenceName={sequenceNameRef.current}
        livePatternName={patternNameRef.current}
        onShowHistory={() => setSession("history")}
        onCalibrate={startCalibration}
        onStartSession={startSession}
      />
    );
  }

  // --- HISTORY ---
  if (session === "history") {
    return (
      <TrackHistoryView
        history={history}
        onBack={() => {
          setViewingResult(history[0] || null);
          setSession("results");
        }}
        onPick={(game) => {
          setViewingResult(game);
          setSession("results");
        }}
        onClearAll={() => {
          setHistory([]);
          saveHistory([]);
          setSession("idle");
        }}
        onStartSession={startSession}
      />
    );
  }

  // --- PLAYING ---
  return (
    <TrackPlayingView
      beatCount={beatCount}
      warmupBeats={warmupBeats}
      scoredBeats={scoredBeats}
      expectedTaps={expectedTaps}
      taps={taps}
      beatTimestamps={beatTimestamps.current}
      bpm={bpmAtStart.current}
      offset={offset}
      evaluationEnabled={evaluationEnabled}
      gameMode={gameMode}
      currentCue={currentCue}
      chordIndex={chordIndex}
      subBeatCount={subBeatCount}
      gameSubdivision={gameSubdivision}
      onTap={handleTap}
      onStop={stopSession}
    />
  );
});
