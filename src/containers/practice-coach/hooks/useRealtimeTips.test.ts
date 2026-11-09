/**
 * The cross-session pace line — ROADMAP 1.7, P1-DSP-3.
 *
 * `useRealtimeTips` is the coach's side channel: three tips that fire
 * from the beat callback when the gatekeeper returned no event of its
 * own. The pace line is the one with a memory — it reads the BPM band
 * this preset has stalled in out of saved history, and when the player
 * sits back down in that band for the fourth time it suggests dropping
 * back and building up rather than hammering the same wall again.
 *
 * The detection half of that path has had tests since C3
 * (`presetAwareness.test.ts`). The half that decides whether the line is
 * SAID had none, which is the half a player experiences: the four-
 * attempt floor, the band match, and the once-per-session rule are all
 * that stand between a useful observation and a nag.
 *
 * Four is also the seam with `preset_ceiling_hit`, added in the same
 * roadmap item — up to three attempts the gatekeeper makes the
 * observation and this stays quiet. Those two must never both fire for
 * one band, and the test named for it here is the one that would notice
 * if the constant ever moved on only one side.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { createRef } from "react";
import type { MutableRefObject } from "react";

import { useRealtimeTips } from "./useRealtimeTips";
import { PRESET_CEILING_MAX_SESSIONS } from "../../../coach/gatekeeper";
import { createShuffleState } from "../../../coach/templates";
import type { BeatFeedback, FeedMessage, SavedSession, SessionReport } from "../../../types";

const T0 = 1_715_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function makeReport(score: number): SessionReport {
  return {
    totalBeats: 240,
    hitsCount: 216,
    missCount: 24,
    skippedBeats: 0,
    perfectCount: 200,
    goodCount: 16,
    okCount: 0,
    meanDeviationMs: 0,
    stdDeviationMs: 5,
    meanAbsDeviationMs: 4,
    meanIntervalErrorMs: 3,
    grade: "C",
    score,
    deviations: [],
    dynamicsStd: 0.1,
    meanAmplitude: 0.5,
    tempoStabilityMs: 3,
    longestStreak: 16,
    comment: "",
    insights: [],
    gridCorrelation: 0.9,
  };
}

function session(daysAgo: number, score: number, bpm: number): SavedSession {
  return {
    id: `s-${daysAgo}-${bpm}`,
    timestamp: T0 - daysAgo * DAY,
    bpm,
    timeSignature: 4,
    report: makeReport(score),
    presetId: "wall",
  };
}

/**
 * `n` sessions in the 130s, every one of them under the 70 that
 * `presetAwareness` calls a ceiling. Spread across the band so the
 * bucketing is doing real work.
 */
function stalledSessions(n: number): SavedSession[] {
  const bpms = [132, 135, 138, 131, 134, 137];
  return Array.from({ length: n }, (_, i) =>
    session(n - i, 58 + (i % 5), bpms[i % bpms.length]),
  );
}

function ref<T>(value: T): MutableRefObject<T> {
  const r = createRef<T>() as MutableRefObject<T>;
  r.current = value;
  return r;
}

function setup(bpm: number) {
  const messages: FeedMessage[] = [];
  const spoken: string[] = [];
  const params = {
    shuffleStateRef: ref(createShuffleState()),
    vocabRef: ref("electric-guitar" as const),
    narrativeRef: ref(null),
    speakAndRevealRef: ref((_id: string, text: string) => {
      spoken.push(text);
    }),
    setMessages: ((update: FeedMessage[] | ((p: FeedMessage[]) => FeedMessage[])) => {
      const next = typeof update === "function" ? update(messages) : update;
      messages.splice(0, messages.length, ...next);
    }) as never,
    playBpmRef: ref(bpm),
    realtimeWindowRef: ref([] as BeatFeedback[]),
  };
  const hook = renderHook(() => useRealtimeTips(params));
  return { hook, messages, spoken, params };
}

/** One pass of the no-event tip check, well past any warmup. */
function tick(
  hook: ReturnType<typeof setup>["hook"],
  opts: Partial<{ coachVerbosity: "less" | "default" | "more" }> = {},
) {
  act(() => {
    hook.result.current.checkNoEventTips({
      now: T0 + 120_000,
      startedAt: T0,
      coachVerbosity: opts.coachVerbosity ?? "default",
      voiceMode: "silent",
    });
  });
}

beforeEach(() => {
  vi.stubGlobal("crypto", { randomUUID: () => Math.random().toString(36).slice(2) });
});

describe("the pace line", () => {
  it("speaks up on the fourth session in a band that keeps stalling", () => {
    const { hook, messages } = setup(134);
    act(() => hook.result.current.seed("wall", "The Wall", stalledSessions(4)));
    tick(hook);
    expect(messages).toHaveLength(1);
    // It has to carry the tempo to drop back to, or it is just a
    // complaint. One band below the ceiling, per `seed`.
    expect(messages[0].content).toContain("120");
    expect(messages[0].content).not.toMatch(/\{[a-zA-Z]+\}/);
  });

  it("stays quiet at three attempts, where the gatekeeper is speaking instead", () => {
    // `preset_ceiling_hit` covers 1–3 attempts and this covers 4 and up.
    // Written against the shared constant so moving it on one side
    // without the other fails here rather than in front of a player,
    // who would hear the same fact twice or not at all.
    const { hook, messages } = setup(134);
    act(() =>
      hook.result.current.seed("wall", "The Wall", stalledSessions(PRESET_CEILING_MAX_SESSIONS)),
    );
    tick(hook);
    expect(messages).toHaveLength(0);
  });

  it("stays quiet at a tempo outside the band", () => {
    const { hook, messages } = setup(112);
    act(() => hook.result.current.seed("wall", "The Wall", stalledSessions(6)));
    tick(hook);
    expect(messages).toHaveLength(0);
  });

  it("stays quiet when there is no history to read", () => {
    const { hook, messages } = setup(134);
    act(() => hook.result.current.seed("wall", "The Wall", []));
    tick(hook);
    expect(messages).toHaveLength(0);
  });

  it("says it once, however long the session runs", () => {
    const { hook, messages } = setup(134);
    act(() => hook.result.current.seed("wall", "The Wall", stalledSessions(6)));
    tick(hook);
    tick(hook);
    tick(hook);
    expect(messages).toHaveLength(1);
  });

  it("re-arms for the next session", () => {
    const { hook, messages } = setup(134);
    act(() => hook.result.current.seed("wall", "The Wall", stalledSessions(6)));
    tick(hook);
    act(() => hook.result.current.seed("wall", "The Wall", stalledSessions(6)));
    tick(hook);
    expect(messages).toHaveLength(2);
  });

  it("is silent when the player asked the coach to say less", () => {
    const { hook, messages } = setup(134);
    act(() => hook.result.current.seed("wall", "The Wall", stalledSessions(6)));
    tick(hook, { coachVerbosity: "less" });
    expect(messages).toHaveLength(0);
  });
});
