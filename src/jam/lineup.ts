/**
 * Jam — who is in the band.
 *
 * The rule that makes Jam work for everyone is plans/JAM_MODE.md §3.1: **the
 * band never plays your instrument.** Onboarding already asked what you play,
 * so nobody has to answer it twice — a bass player gets drums, a drummer gets
 * bass and keys, a guitarist gets drums and bass. Nothing to configure, and
 * the one line you would have muted anyway is never there to mute.
 *
 * §5 is the table this encodes, instrument by instrument. Keys are a third
 * release (§4.3), so the only player who gets them today is the drummer, who
 * would otherwise have nothing but a bass line to play against.
 */

import type { InstrumentId } from "../types";

/** What the band plays, and which chair you are sitting in. */
export type JamLineup = {
  drums: boolean;
  bass: boolean;
  keys: boolean;
  you: "guitar" | "bass" | "drums" | "keys" | "other";
};

/**
 * A `Record`, not a switch, so adding an instrument to `InstrumentId` fails
 * the compile here instead of quietly giving that player a band that doubles
 * them.
 */
const LINEUPS: Record<InstrumentId, JamLineup> = {
  // No drums: you are the drummer. Bass and keys so there is harmony and a
  // pulse to lock to — §5 makes drop-out and trading the core for drummers,
  // and those need something left playing to come back from.
  drums: { drums: false, bass: true, keys: true, you: "drums" },
  // No bass: §5 measures a bass player's "kick lock", so the kick has to be
  // audible and unclouded.
  bass: { drums: true, bass: false, keys: false, you: "bass" },
  // No keys: a piano player gets drums and bass, the classic trio minus you.
  piano: { drums: true, bass: true, keys: false, you: "keys" },
  "electric-guitar": { drums: true, bass: true, keys: false, you: "guitar" },
  "acoustic-guitar": { drums: true, bass: true, keys: false, you: "guitar" },
  // Horns, strings, voice, anything else: a rhythm section behind you.
  other: { drums: true, bass: true, keys: false, you: "other" },
};

/**
 * The band for a player of `instrument`.
 *
 * Takes a plain string, not an `InstrumentId`: the instrument comes out of
 * the store, where a build older or newer than this one may have written
 * something this build has never heard of. That is not a reason to have no
 * band — an unknown instrument gets the rhythm section, which is the answer
 * for everyone the list does not name anyway.
 */
export function lineupFor(instrument: InstrumentId | string): JamLineup {
  return { ...(LINEUPS[instrument as InstrumentId] ?? LINEUPS.other) };
}

/**
 * Who a BRAND NEW jam starts with: the drummer, and nobody else.
 *
 * Not `lineupFor` (JAM_UX_DECISIONS B1). The first session's verdict was that
 * a guitarist's jam opened with a bass player already under everything, and
 * "drums alone" was one toggle away that nobody would find. So the rule the
 * mode is built on — the band never plays your instrument — still governs
 * what is OFFERED, and this governs what is ON: a drummer gets a bass player,
 * because a drummer with drums alone has nothing to play against, and
 * everyone else gets the drummer they came for. Bass and keys are one tap
 * each in the band row.
 *
 * A jam already on the record keeps whatever it says; this is only the answer
 * for a jam that does not exist yet.
 */
export function startingBand(instrument: InstrumentId | string): {
  drums: boolean;
  bass: boolean;
  keys: boolean;
} {
  const you = lineupFor(instrument).you;
  return you === "drums"
    ? { drums: false, bass: true, keys: false }
    : { drums: true, bass: false, keys: false };
}

/**
 * The band as a list of locale keys, in the order they are named on stage:
 * drums, bass, keys. The UI translates each and joins them — "drums · bass".
 * An empty list means the band has nobody in it, which the UI says in its own
 * words rather than by printing nothing.
 */
export function bandDescription(lineup: JamLineup): string[] {
  const keys: string[] = [];
  if (lineup.drums) keys.push("jam.band.drums");
  if (lineup.bass) keys.push("jam.band.bass");
  if (lineup.keys) keys.push("jam.band.keys");
  return keys;
}

/**
 * The vibe **Jam now** hands a player of `instrument` (JAM_KILLER §2 A4).
 *
 * One tap has to pick a style, and the honest way to pick one is to ask what
 * the player is holding. The table is the plan's, and it is deliberately
 * short: this is the answer for somebody who has not chosen yet, and every
 * one of them is one tile away from being changed.
 *
 * The chair rather than the instrument, so the two guitars answer the same
 * way and so a chair added to `JamLineup` fails the compile here instead of
 * quietly falling through to rock.
 */
const VIBE_FOR_CHAIR: Record<JamLineup["you"], string> = {
  guitar: "rock",
  bass: "funk",
  keys: "jazz",
  // The one player the band's drummer sits out for, so this is the vibe of
  // the bass and keys they are given — rock, the plainest thing to play over.
  drums: "rock",
  other: "rock",
};

/**
 * A plain string, for the same reason `lineupFor` takes one: the instrument
 * comes out of the store, where a build other than this one may have written
 * a chair this build has never heard of. A singer is exactly that — the
 * instrument list has no seat for a voice yet, and on the day it does this
 * hands them pop rather than the fallback.
 */
export function vibeForInstrument(instrument: InstrumentId | string): string {
  if (/^(?:voice|vocal|vocals|sing|singer|singing)$/i.test(String(instrument))) return "pop";
  return VIBE_FOR_CHAIR[lineupFor(instrument).you];
}
