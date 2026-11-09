/**
 * The honesty lint: words the app may not say.
 *
 * Technique is taught in words, so "use a downstroke" and "mute with your palm"
 * are fine; the sin is claiming the app can tell. So most patterns need a
 * speaker in the sentence: the app, the coach, the first person. Coach lines are
 * written in the first person and get the speaker-free set as well.
 */

export type BannedClaim = { name: string; pattern: RegExp; coachOnly?: boolean };

const SPEAKER = String.raw`(?:\bI\b|\bI'll\b|\bI'm\b|\bwe\b|\byames\b|\bthe app\b|\bthis app\b|\bthe coach\b|\bcoach\b)`;
const SENSE = String.raw`(?:see|sees|saw|seeing|watch|watches|watching|notice|notices|hear|hears|heard|hearing|detect|detects|detected|detecting|tell|tells|spot|spots|check|checks|checking|grade|grades|grading|measure|measures|measuring|score|scores|scoring|track|tracks|know|knows)`;
const UNMEASURABLE = String.raw`(?:pick(?:ing)? direction|pick stroke|pick angle|downstroke|upstroke|down-stroke|up-stroke|stroke direction|your pick\b|mut(?:e|es|ed|ing)\b|posture|tension|your hands?\b|your fingers?\b|your wrist|your thumb|your palm|which hand|which finger|fingering|grip|relax(?:ed|ing)?\b|sound(?:s|ing)? emotional|your feel\b|your tone\b)`;

/** "I can't see your hands" is the honest sentence, not the banned one. */
const NOT_NEGATED = String.raw`(?![^.?!]{0,40}(?:can't|cannot|can not|do not|don't|does not|doesn't|won't|will not|never|\bnot\b|\bno\b))`;

export const BANNED_CLAIMS: readonly BannedClaim[] = [
  {
    name: "claims to sense something it cannot",
    pattern: new RegExp(`${SPEAKER}${NOT_NEGATED}[^.?!]{0,50}\\b${SENSE}\\b[^.?!]{0,50}${UNMEASURABLE}`, "i"),
  },
  {
    name: "claims a camera",
    pattern: new RegExp(`${SPEAKER}[^.?!]{0,40}\\b(?:sees?|watch(?:es)?|looks? at|looking at)\\s+you\\b`, "i"),
  },
  {
    name: "states detection accuracy as proven",
    pattern:
      /\b(?:accurately|reliably|precisely|perfectly|flawlessly)\s+(?:detect|detects|hear|hears|grade|grades|measure|measures|track|tracks|score|scores)\b|(?<!not )(?<!not been )(?<!never been )\b(?:proven|guaranteed|lab-tested|scientifically)\b/i,
  },
  {
    name: "claims emotion or feel is measured",
    pattern: /\b(?:feel score|emotion score|soul score|sounds? emotional|measures? (?:your )?(?:feel|emotion|soul))\b/i,
  },
  {
    name: "claims a review that has not happened",
    pattern:
      /\b(?:teacher[- ]approved|teacher[- ]reviewed|reviewed by (?:a )?(?:teacher|guitarist|professional)|approved by (?:a )?(?:teacher|guitarist)|tested by (?:real )?guitarists|tested on (?:a )?real guitar|played by (?:a )?real guitarist)\b/i,
  },
  {
    name: "coach speaks about what it sees or feels in the body",
    coachOnly: true,
    pattern:
      /\b(?:your (?:pick|hand|hands|fingers?|wrist|thumb|palm|arm|shoulder|forearm)\s+(?:is|are|was|were|looks?|seems?|moved|moves|tensed?|tightens?))\b|\bI (?:can )?(?:see|saw|watched|noticed your)\b/i,
  },
];

export function bannedClaimsIn(text: string, isCoach: boolean): BannedClaim[] {
  return BANNED_CLAIMS.filter((claim) => (!claim.coachOnly || isCoach) && claim.pattern.test(text));
}
