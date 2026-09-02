import { useRef, useEffect, useCallback } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { FeedMessage, SessionSegment } from "../../../types";
import {
  appendCoachUtterance,
  appendSegmentEnd,
  formatForLLM,
  type Narrative,
} from "../../../coach/narrative";
import { coachGenerate, getSessionReport, clearSession, closeOpenSegment } from "../../../ipc";
import {
  accuracyPct,
  accuracyRatio,
  rescoreReport,
  scoredBeats,
} from "../../../coach/reportStats";
import { createSessionToken } from "../../../coach/sessionGuard";
import { coachDebug } from "../../../coach/debug";
import { DEFAULT_MODE_CATALOG, PRO_MODE_CATALOG, TEMPLATE_CATALOG } from "../../../coach/templateCatalog";
import { pickTemplate, createShuffleState } from "../../../coach/templates";
import {
  buildChipsForMiniReport,
  formatMiniReport,
  formatMiniReportContext,
  isSegmentReportable,
  MIN_SEGMENT_BEATS_FOR_REPORT,
  MIN_SEGMENT_HITS_FOR_REPORT,
  MIN_SEGMENT_HIT_RATE_FOR_REPORT,
  shortPocketNote,
} from "../../../coach/miniReport";

export function useSegmentCoach(params: {
  // Reactive values — the useEffect deps arrays mirror these exactly
  isPlaying: boolean;
  active: boolean;
  timeSignature: number;
  instrumentLabel: string;
  coachVerbosity: "less" | "default" | "more";
  coachMode: "default" | "pro";
  // Refs shared with endSession / startSession (owned by useSession)
  segmentReportsRef: MutableRefObject<SessionSegment[]>;
  segmentStartRef: MutableRefObject<number>;
  prevSessionBestRef: MutableRefObject<number | undefined>;
  narrativeRef: MutableRefObject<Narrative | null>;
  sessionIdRef: MutableRefObject<number>;
  activeRef: MutableRefObject<boolean>;
  playBpmRef: MutableRefObject<number>;
  beatsInSegmentRef: MutableRefObject<number>;
  // State setters
  setMessages: Dispatch<SetStateAction<FeedMessage[]>>;
  setPlayMode: Dispatch<SetStateAction<"structured" | "noodling" | undefined>>;
}) {
  const {
    isPlaying,
    active,
    timeSignature,
    instrumentLabel,
    coachVerbosity,
    coachMode,
    segmentReportsRef,
    segmentStartRef,
    prevSessionBestRef,
    narrativeRef,
    sessionIdRef,
    activeRef,
    playBpmRef,
    beatsInSegmentRef,
    setMessages,
    setPlayMode,
  } = params;

  // ── Falling/rising-edge detector ─────────────────────────────────────
  // Tracks whether the user was playing on the previous effect run so
  // both the rising edge (segment start) and falling edge (mini-report)
  // can be detected without reading React state inside the async path.
  const wasPlayingRef = useRef(false);
  // Gates the muddy-hits tip to once per segment.
  const muddy_hitsFiredRef = useRef<boolean>(false);
  // Isolated shuffle-bag for muddy_hits variant dedup.
  const muddy_hitsShuffleRef = useRef(createShuffleState());
  // Gates the IC/GA diagnostic tip to once per session (not per segment).
  // Reset only in reset() — NOT on the rising edge.
  const icGaTipFiredRef = useRef<boolean>(false);
  // Isolated shuffle-bag for IC/GA scenario variant dedup.
  const icGaShuffleRef = useRef(createShuffleState());
  // Gates the accent coaching tip to once per session (not per segment).
  // Reset only in reset() — NOT on the rising edge.
  const accentTipFiredRef = useRef<boolean>(false);
  // Isolated shuffle-bag for accent scenario variant dedup.
  const accentShuffleRef = useRef(createShuffleState());

  // ── Rising edge: capture segment start time ───────────────────────────
  // Runs when isPlaying transitions false→true. Sets segmentStartRef and
  // resets beatsInSegmentRef so the first-4-beats TTS suppression rule
  // starts fresh. `wasPlayingRef` check is the edge detector — without
  // it this fires on every render when isPlaying is already true.
  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      segmentStartRef.current = Date.now();
      // New playback start = new segment for the first-4-beats rule.
      beatsInSegmentRef.current = 0;
      // Reset the muddy-hits gate so it can fire again in the new segment.
      muddy_hitsFiredRef.current = false;
    }
  }, [isPlaying, segmentStartRef, beatsInSegmentRef]);

  // ── Falling edge: auto mini-report ────────────────────────────────────
  // When playback stops during an active session, fetch the Rust segment
  // report, score it, optionally rephrase via LLM, and push to the feed.
  //
  // ORDERING INVARIANT: clearSession() MUST fire before await coachGenerate().
  // Moving it after would let the user's next exercise accumulate into the
  // same Rust accumulator and wipe out those beats when clearSession fires
  // post-rephrase — the "2 exercises, only 1 mini-report" bug (2026-05-16).
  useEffect(() => {
    if (wasPlayingRef.current && !isPlaying && activeRef.current) {
      const segmentBpm = playBpmRef.current;
      const segmentDurationMs = Date.now() - segmentStartRef.current;
      // Under 10 s → Signal A (BPM change) or accidental stop.
      // Flush the Rust accumulator so stale data doesn't bleed into the
      // next exercise, but skip the mini-report entirely.
      if (segmentDurationMs < 10_000) {
        clearSession();
      } else {
      const token = createSessionToken(sessionIdRef, activeRef);
      // Force-close the open segment before fetching the report so the
      // IC/GA formula is used (not the legacy fallback that fires when
      // no closed segment exists). `closeOpenSegment()` sets an AtomicBool
      // that the Rust loop picks up within 5ms; 100ms gives generous margin
      // before we read. Safe if no session is running (no-op).
      closeOpenSegment()
        .catch(() => {})
        .then(() => new Promise<void>((resolve) => setTimeout(resolve, 100)))
        .then(() => getSessionReport())
        .then(async (raw) => {
        // `rescoreReport` uses the Rust IC/GA score when `onsetEfficiency`
        // is present (set for closed segments) and falls back to the legacy
        // formula otherwise. After closeOpenSegment() the segment is always
        // closed, so the Rust score is always used here.
        const report = raw ? rescoreReport(raw) : raw;
        // Discard if a new session started OR the session ended while
        // `getSessionReport` was in-flight — would otherwise land a
        // stale segment summary in the next session's feed.
        if (token.isStaleOrInactive()) {
          coachDebug("mini-report.discard-pre-llm", { capturedAt: token.capturedAt, current: sessionIdRef.current, active: activeRef.current });
          return;
        }
        const reportable = report ? isSegmentReportable(report) : false;
        if (report) {
          const scored = scoredBeats(report);
          const rate = accuracyRatio(report);
          coachDebug("mini-report.check", {
            scoredBeats: scored,
            hits: report.hitsCount,
            misses: report.missCount,
            hitRate: +rate.toFixed(2),
            score: report.score,
            reportable,
            gates: {
              beats: `${scored}>=${MIN_SEGMENT_BEATS_FOR_REPORT}? ${scored >= MIN_SEGMENT_BEATS_FOR_REPORT}`,
              hits: `${report.hitsCount}>=${MIN_SEGMENT_HITS_FOR_REPORT}? ${report.hitsCount >= MIN_SEGMENT_HITS_FOR_REPORT}`,
              rate: `${scored > 0 ? rate.toFixed(2) : "n/a"}>=${MIN_SEGMENT_HIT_RATE_FOR_REPORT}? ${rate >= MIN_SEGMENT_HIT_RATE_FOR_REPORT}`,
            },
          });
        } else {
          coachDebug("mini-report.no-report-from-backend");
        }
        if (report && reportable) {
          // Step 5 — prefer the server-computed playMode (Rust derives it
          // from onset_efficiency at segment close). Fall back to JS
          // derivation so old saved sessions and short warmup bursts still
          // resolve rather than leaving the UI undefined.
          const derivedPlayMode: "structured" | "noodling" =
            report.onsetEfficiency !== undefined
              ? report.onsetEfficiency >= 0.45
                ? "structured"
                : "noodling"
              : "structured";
          setPlayMode(report.playMode ?? derivedPlayMode);

          // Muddy-hits tip: player lands every beat but the signal is soft
          // (confidence-weighted completeness low, raw coverage high).
          if (
            !muddy_hitsFiredRef.current &&
            coachVerbosity !== "less" &&
            report.hitCompleteness !== undefined &&
            report.hitCompleteness < 0.70 &&
            accuracyRatio(report) >= 0.85
          ) {
            muddy_hitsFiredRef.current = true;
            const tipText = pickTemplate(TEMPLATE_CATALOG, muddy_hitsShuffleRef.current, {
              vocab: instrumentLabel as any,
              scenario: "muddy_hits",
              severity: "neutral",
            }, coachMode === "default" ? DEFAULT_MODE_CATALOG : PRO_MODE_CATALOG);
            if (tipText) {
              const tipMsg: FeedMessage = {
                id: crypto.randomUUID(),
                type: "coach-tip",
                timestamp: Date.now(),
                content: tipText,
              };
              setMessages((prev) => [...prev, tipMsg]);
              if (narrativeRef.current) {
                narrativeRef.current = appendCoachUtterance(narrativeRef.current, tipText);
              }
            }
          }

          // IC/GA narrative tip — fires at most once per session.
          // Requires COMP_SCORES_1: intervalConsistency and gridAlignment present.
          if (
            !icGaTipFiredRef.current &&
            coachVerbosity !== "less" &&
            report.intervalConsistency !== undefined &&
            report.gridAlignment !== undefined
          ) {
            const ic = report.intervalConsistency;
            const ga = report.gridAlignment;
            let icGaScenario: string | null = null;
            if (ic >= 0.80 && ga >= 0.80) {
              icGaScenario = "ic_both_locked";
            } else if (ic >= 0.75 && ga < 0.70) {
              icGaScenario = "ic_placement_drift";
            } else if (ic < 0.70 && ga >= 0.75) {
              icGaScenario = "ic_spacing_drift";
            }
            if (icGaScenario) {
              icGaTipFiredRef.current = true;
              const tipText = pickTemplate(TEMPLATE_CATALOG, icGaShuffleRef.current, {
                vocab: instrumentLabel as any,
                scenario: icGaScenario,
                severity: "neutral",
              }, coachMode === "default" ? DEFAULT_MODE_CATALOG : PRO_MODE_CATALOG);
              if (tipText) {
                const tipMsg: FeedMessage = {
                  id: crypto.randomUUID(),
                  type: "coach-tip",
                  timestamp: Date.now(),
                  content: tipText,
                };
                setMessages((prev) => [...prev, tipMsg]);
                if (narrativeRef.current) {
                  narrativeRef.current = appendCoachUtterance(narrativeRef.current, tipText);
                }
              }
            }
          }

          // Accent coaching tip — fires at most once per session.
          // Requires ACCENT_2: downbeatAmpAvg, upbeatAmpAvg, subdivisionAmpAvg, ampStdDev present.
          if (
            !accentTipFiredRef.current &&
            coachVerbosity !== "less" &&
            report.playMode !== "noodling"
          ) {
            // Determine negative scenario with priority: weak_downbeats > flat_dynamics > subdivisions_too_loud
            let accentNegScenario: string | null = null;
            if (
              report.downbeatAmpAvg !== undefined &&
              report.upbeatAmpAvg !== undefined &&
              report.downbeatAmpAvg < report.upbeatAmpAvg * 0.9
            ) {
              accentNegScenario = "weak_downbeats";
            } else if (
              report.ampStdDev !== undefined &&
              report.ampStdDev < 0.03
            ) {
              accentNegScenario = "flat_dynamics";
            } else if (
              report.subdivisionAmpAvg !== undefined &&
              report.downbeatAmpAvg !== undefined &&
              report.subdivisionAmpAvg > report.downbeatAmpAvg * 0.9
            ) {
              accentNegScenario = "subdivisions_too_loud";
            }

            // Check good_accents independently (positive reinforcement)
            const accentGoodFires =
              report.downbeatAmpAvg !== undefined &&
              report.upbeatAmpAvg !== undefined &&
              report.downbeatAmpAvg > report.upbeatAmpAvg * 1.2;

            if (accentNegScenario) {
              accentTipFiredRef.current = true;
              const tipText = pickTemplate(TEMPLATE_CATALOG, accentShuffleRef.current, {
                vocab: instrumentLabel as any,
                scenario: accentNegScenario,
                severity: "neutral",
              }, coachMode === "default" ? DEFAULT_MODE_CATALOG : PRO_MODE_CATALOG);
              if (tipText) {
                const tipMsg: FeedMessage = {
                  id: crypto.randomUUID(),
                  type: "coach-tip",
                  timestamp: Date.now(),
                  content: tipText,
                };
                setMessages((prev) => [...prev, tipMsg]);
                if (narrativeRef.current) {
                  narrativeRef.current = appendCoachUtterance(narrativeRef.current, tipText);
                }
              }
            }

            if (accentGoodFires) {
              const tipText = pickTemplate(TEMPLATE_CATALOG, accentShuffleRef.current, {
                vocab: instrumentLabel as any,
                scenario: "good_accents",
                severity: "neutral",
              }, coachMode === "default" ? DEFAULT_MODE_CATALOG : PRO_MODE_CATALOG);
              if (tipText) {
                const tipMsg: FeedMessage = {
                  id: crypto.randomUUID(),
                  type: "coach-tip",
                  timestamp: Date.now(),
                  content: tipText,
                };
                setMessages((prev) => [...prev, tipMsg]);
                if (narrativeRef.current) {
                  narrativeRef.current = appendCoachUtterance(narrativeRef.current, tipText);
                }
              }
            }
          }

          const now = Date.now();
          segmentReportsRef.current.push({ report, bpm: segmentBpm, timeSignature, startTime: segmentStartRef.current, endTime: now });
          // Reset the segment-start clock so the NEXT segment's startTime
          // in the timeline is measured from NOW, not from the session origin.
          segmentStartRef.current = now;

          // Clear the Rust accumulator IMMEDIATELY — before the
          // potentially multi-second LLM rephrase. If we wait until
          // after `await coachGenerate(...)`, and the user starts a
          // new exercise during the rephrase window, the next
          // exercise's beats accumulate INTO the same accumulator and
          // are wiped out when `clearSession()` finally fires. The
          // second exercise's eventual `getSessionReport()` then
          // either returns null (empty) or fails `isSegmentReportable`
          // (too few scored beats), so no second mini-report ever
          // emits. Captured + fixed 2026-05-16 — see "2 exercises,
          // only 1 mini-report" report. Fire-and-forget is fine: the
          // local `report` reference is the source of truth for the
          // rest of this block.
          clearSession();

          // C1: log the segment-end into the narrative *before* coach
          // generation so the LLM can see the segment summary in context.
          if (narrativeRef.current) {
            narrativeRef.current = appendSegmentEnd(
              narrativeRef.current,
              { score: report.score, bpm: segmentBpm, note: shortPocketNote(report) },
              now,
            );
          }

          // Generate coach comment (LLM or template-based).
          // Accuracy uses SCORED beats (hits + misses) as the denominator
          // — not totalBeats — so a session that started before the user
          // picked up the instrument doesn't get a misleading "12%
          // accuracy". See `src/coach/reportStats.ts`.
          const accuracy = accuracyPct(report);
          // Deliberately NOT gated on `coachLoadedRef`. `coach_generate`
          // is well-defined in both modes: with a model it paraphrases,
          // without one it returns the Rust phrase-bank mini-report,
          // which is real coaching prose. The local `formatMiniReport`
          // fallback is only a metrics line ("Score 72 · 85% hits ·
          // avg ±8.1ms"), so gating here would silently downgrade every
          // template-mode user from prose to numbers.
          let comment = formatMiniReport(report);
          try {
            const context = formatMiniReportContext(
              segmentBpm,
              timeSignature,
              accuracy,
              report,
              instrumentLabel,
              narrativeRef.current ? formatForLLM(narrativeRef.current) : undefined,
              derivedPlayMode,
              coachMode,
            );
            // Only replace the local metrics line when the model (or the
            // Rust phrase bank behind it) actually produced prose. The
            // assignment used to be unconditional, so an all-reasoning
            // generation that `strip_think` reduced to "" replaced a
            // perfectly good mini-report with a blank card.
            const generated = (await coachGenerate("report", context))?.trim();
            if (generated) comment = generated;
          } catch (err) {
            // Fall back to the metrics line — but log so we can diagnose
            // "the LLM stopped paraphrasing" instead of guessing.
            coachDebug("mini-report.llm-error", String(err));
          }

          // Post-LLM staleness recheck — the rephrase at `coachGenerate`
          // can take 200–2000 ms, and during that window the user might
          // start a new session (sid bump) OR end the current one
          // (activeRef flip). Both must be dropped — see
          // src/coach/sessionGuard.ts for the unified predicate.
          if (token.isStaleOrInactive()) {
            coachDebug("mini-report.discard-post-llm", { capturedAt: token.capturedAt, current: sessionIdRef.current, active: activeRef.current });
            return;
          }

          // Phase 5 — pick suggestion chips for the user to tap.
          // The selector is deterministic given the context, so two
          // identical-looking sessions show different chips because
          // of recency tracking (chips shown last session are
          // down-weighted by 0.7×). See `src/coach/chips.ts`.
          const chips = buildChipsForMiniReport({
            report,
            bpm: segmentBpm,
            timeSignature,
            segments: segmentReportsRef.current,
            previousSessionScore: prevSessionBestRef.current,
          });

          // The mini-report carries ONLY the coach's commentary on the
          // segment (score circle + text). The follow-up question chips
          // ride on a separate `chip-prompt` message right after it so
          // the input affordance is visually distinct from the coach's
          // content — see the `chip-prompt` rationale on
          // `FeedMessageType` in `src/types.ts`. `now` is already
          // bound above (at the segmentReportsRef push) so we reuse
          // it here for a stable shared timestamp.
          const reportTs = Date.now();
          const reportMsg: FeedMessage = {
            id: crypto.randomUUID(),
            type: "mini-report",
            timestamp: reportTs,
            content: comment,
            report,
            meta: { bpm: segmentBpm, timeSignature },
          };
          // Only emit a chip-prompt if the selector returned anything
          // substantive. The Escape chip ("Ask something else…") was
          // retired in v0.9 (the coach card pins a chat input to the
          // bottom — the chip duplicated that affordance), so the
          // selector now returns 0–3 substantive chips. An empty
          // chip list means nothing to suggest — don't ship an empty
          // bubble. See `selectChips` in `src/coach/chips.ts`.
          const chipMsg: FeedMessage | null = chips.length > 0
            ? {
                id: crypto.randomUUID(),
                type: "chip-prompt",
                // +1 ms so the chip-prompt always sorts AFTER the
                // mini-report when a consumer orders by timestamp.
                timestamp: reportTs + 1,
                content: "",
                chips,
              }
            : null;
          setMessages((prev) =>
            chipMsg ? [...prev, reportMsg, chipMsg] : [...prev, reportMsg],
          );
          if (narrativeRef.current) {
            narrativeRef.current = appendCoachUtterance(
              narrativeRef.current,
              comment,
            );
          }
          // NOTE: `clearSession()` was called above, BEFORE the LLM
          // rephrase, to keep the Rust accumulator from devouring the
          // next exercise's data while this one's rephrase was in
          // flight. See the rationale block at the call site.
        }
      });
      } // end else (segment ≥ 10 s)
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying, active, timeSignature, instrumentLabel,
    playBpmRef, sessionIdRef, activeRef, segmentReportsRef, segmentStartRef,
    prevSessionBestRef, narrativeRef, setMessages, setPlayMode]);

  /**
   * Reset the falling-edge detector. Call from startSession (and endSession)
   * to prevent a stale mini-report from the previous session firing.
   */
  const reset = useCallback(() => {
    wasPlayingRef.current = false;
    muddy_hitsFiredRef.current = false;
    icGaTipFiredRef.current = false;
    accentTipFiredRef.current = false;
  }, []);

  return { reset };
}
