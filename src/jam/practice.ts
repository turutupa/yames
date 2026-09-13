/**
 * Jam — the practice windows, worked out ahead of the bar line.
 *
 * Drop-out bars and trading fours (plans/JAM_MODE.md §4.4) are the two tools
 * that only make sense over a band. The engine decides what the band does on
 * each bar from its own form counter, so the change lands exactly on the bar
 * line; this module is the same rule in TypeScript, so the timeline can draw
 * the silence before it arrives and the transport can say "your four" while
 * you still have a bar to get ready.
 *
 * The one thing to know: **the windows are phase-locked to the chorus.** The
 * first drop-out of every chorus falls in the same place as the first
 * drop-out of the one before it, and trading starts over on the downbeat of
 * bar 1. A window that drifted against the form would be unusable — you would
 * never learn where the silence is, and over a 12-bar blues it would land on
 * a different chord every time round. So the pattern is read off `formBar`,
 * and `chorus` only tells you which trip round the form you are on.
 *
 * The facts this encodes, from the brief: with `everyBars` 8 and `bars` 2
 * over a 12-bar form, absolute bars 8–9 and 20–21 are silent and nothing
 * before 8 is; trading 4 and 4 over a 12-bar form puts absolute bars 4–7 on
 * hats and brings the band back in full at 12.
 */

import type { JamBandState, JamPracticeConfig, JamPracticeSettings } from "./types";

/** Where a bar sits in the whole jam, counting from 0 at the first downbeat. */
export function absoluteBarIndex(a: {
  formBar: number;
  chorus: number;
  formBars: number;
}): number {
  return (Math.max(1, a.chorus) - 1) * a.formBars + a.formBar;
}

/**
 * The engine's config for the practice tools, or `null` when every tool is
 * off. `0` means off in `JamPracticeSettings`, on both halves of each pair:
 * dropping out for zero bars is not dropping out.
 *
 * `tradeBars` is one number because trading is symmetric — the band plays
 * four, you play four. It becomes both sides of `trade`.
 */
export function practiceConfigFrom(settings: JamPracticeSettings): JamPracticeConfig | null {
  const dropOut =
    settings.dropOutEvery > 0 && settings.dropOutBars > 0
      ? { everyBars: Math.trunc(settings.dropOutEvery), bars: Math.trunc(settings.dropOutBars) }
      : null;
  const trade =
    settings.tradeBars > 0
      ? { bandBars: Math.trunc(settings.tradeBars), youBars: Math.trunc(settings.tradeBars) }
      : null;
  if (!dropOut && !trade) return null;
  return { dropOut, trade };
}

/**
 * What the band does on one bar of the form.
 *
 * Drop-out: a window of `bars` bars opens at every multiple of `everyBars`
 * within the chorus, counting from bar 0 — but never at bar 0 itself, so the
 * first silence of a chorus arrives at bar `everyBars` and the band always
 * gets to state the form first.
 *
 * Trading: from bar 0, `bandBars` bars of the full band, then `youBars` bars
 * where the drums drop to hats and the bass steps out, repeating.
 *
 * Drop-out wins where both apply: silence is the stronger instruction, and it
 * is the one that produces the honest score (§4.4 — nothing bleeds into the
 * mic during it).
 */
export function bandStateForBar(a: {
  formBar: number;
  chorus: number;
  formBars: number;
  practice: JamPracticeConfig | null | undefined;
}): JamBandState {
  const practice = a.practice;
  if (!practice) return "full";

  const formBars = Math.max(1, Math.trunc(a.formBars));
  // Phase-locked to the chorus: take the absolute bar the brief defines, then
  // ask where it sits in the form. For a `formBar` already inside the chorus
  // the two are the same number, and a caller that hands over an absolute bar
  // by mistake still lands where it expects.
  const absolute = absoluteBarIndex({ formBar: Math.trunc(a.formBar), chorus: a.chorus, formBars });
  const bar = ((absolute % formBars) + formBars) % formBars;

  const dropOut = practice.dropOut;
  if (dropOut && dropOut.everyBars > 0 && dropOut.bars > 0) {
    const phase = bar % dropOut.everyBars;
    if (bar >= dropOut.everyBars && phase < dropOut.bars) return "silent";
  }

  const trade = practice.trade;
  if (trade && trade.bandBars > 0 && trade.youBars > 0) {
    const cycle = trade.bandBars + trade.youBars;
    if (bar % cycle >= trade.bandBars) return "hatsOnly";
  }

  return "full";
}

/** One state per bar of a chorus, in order, for the form timeline to draw. */
export function bandStatesForChorus(a: {
  chorus: number;
  formBars: number;
  practice: JamPracticeConfig | null | undefined;
}): JamBandState[] {
  const formBars = Math.max(1, Math.trunc(a.formBars));
  const out: JamBandState[] = [];
  for (let formBar = 0; formBar < formBars; formBar += 1) {
    out.push(bandStateForBar({ formBar, chorus: a.chorus, formBars, practice: a.practice }));
  }
  return out;
}
