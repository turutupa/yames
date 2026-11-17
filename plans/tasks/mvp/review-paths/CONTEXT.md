# Yames: context for the Paths review

Yames is a desktop + Android guitar practice coach. The player says how many minutes they have (5/10/15/20), the
coach builds a Session of exercises from their Learning Paths, plays a backing (click, or a simple band), listens to
the guitar (mic or audio interface), grades each Take, and tracks a "clean tempo" per exercise (the highest tempo at
which a Take passes its bar over 8+ bars). Positioning: a technique coach with measured progress for intermediate
players, not a song game. Melodics is the reference for how practice should feel. Repetition is fine and expected
(muscle memory); content may follow what established courses teach.

## What the app can grade today (plain code, no AI)
- Timing evenness (spread of onsets vs the grid), notes heard (share of written notes detected), extra notes,
  accent placement (louder on written accents), evenness holding to the end of a long Take.
- Right notes (pitch of each picked note vs the written note), only when notes are >= 75 ms apart and the tone isn't
  ringing too much; otherwise "not checked" (and the result says so). Sweeps mostly read "not checked".
- Legato notes (hammer-ons, pull-offs) are "soft": if the detector misses them they cost nothing (quiet by nature);
  so legato technique itself (evenness of legato, volume consistency) is only weakly graded today.
- NOT graded today: landing on chord tones / target notes over changes, scale membership, bends (pitch reached),
  vibrato, rests kept, palm-mute quality, pick direction (can't be heard), chords/strumming quality.
- Self-checked exercises exist (the player ticks "done", with checklist questions), and practice-only ones.

## Owner's goals for testing
1. Two obvious kinds of learner must be served from day one: MECHANICS (a "shredder" path: alternate picking,
   economy picking, legato, sweeps, anything shred) and THEORY learnt through exercises (a blues player, a classic rock
   player).
2. About 3 base Paths for testing, even if not complete.
3. "Play now" for 20 minutes should feed exercises from ALL Paths the player has subscribed to, so they advance on all
   of them daily with one click. Today the planner mixes at most two Paths (a focus Path and one other).

Files: CURRENT_CONTENT.md (the three drafts, every exercise with its pass bars). The pack format and pipeline are in
/home/dgx-personal/projects/yames-revamp/plans/PATHS_PIPELINE.md and src/paths/format.ts; review notes from an earlier
agent pass in plans/paths/REVIEW_NOTES.md.
