/**
 * Typed English to the Path, plan, theory and term cards (leg c2b2a). Read
 * beside `match.ts`'s Take cards, after the command router: a match here and
 * one there is two shapes, so no card (`matchCard`).
 *
 * Each pattern names its object: "how do I play this" is the Exercise's
 * how-to, "how do I play F" is not; "what's next" is the plan, "what's the
 * next position" is not. Theory reads the chord from the text as typed (the
 * normalised text has lost "#"), and an unknown chord still reaches the card,
 * which says "I don't know that chord".
 *
 * Pure: no React, no store, no i18n.
 */
import { ROOT_NAMES } from "../blocks/spec";
import { chordSuffix, parseChordName } from "../../jam/harmony";
import type { CardCall } from "./match";
import { UNKNOWN_SUFFIX } from "./pathCards";

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  five: 5,
  ten: 10,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  sixty: 60,
};

const THIS = "(this|it|this exercise|this one|the exercise)";

/** "What is this for?", "what's the point of this exercise?" */
const PURPOSE = new RegExp(
  `^(what is|what are) ${THIS} for$|^what is the (point|purpose|aim|goal) of ${THIS}$|^what (does|is) ${THIS} (teach|train|for|working on|work on)( me)?$`,
);
/** "How do I play this?" (an object named: never "how do I play F"). */
const HOW = new RegExp(`^how (do|should|can|am) i (supposed to )?(play|do) ${THIS}$|^how does ${THIS} go$|^how is ${THIS} played$`);
/** "What should I try?" */
const TRY = /^what (should|could|do|can) i try( next| now| on the next take| next time)?$|^what is the (cue|tip)( for this( exercise)?)?$|^(any|got any|give me a) (tips?|cues?)( for this( exercise)?)?$/;

/** "Why this?" — the plan's reason. */
const PLAN_WHY = /^why (this|this one|this exercise|this part)( now| today)?$|^why am i (doing|playing) this( now| today| exercise)?$|^why is this (in|on) (my |the |today s )?(plan|session)$/;
/** "Why this tempo?" */
const PLAN_TEMPO = /^why (this|that|the|such a) (tempo|speed|bpm)$|^why (this|so) (slow|fast)$|^why (is it|am i|are we) (at|on) \d+( bpm)?$|^why \d+ bpm$|^why (is|was) (the|this) tempo (so )?(slow|fast|low|high|\d+( bpm)?)$/;
/** "What's next?" — the plan's next part (never the next position, Step or Path). */
const PLAN_NEXT = /^what (is|comes|do we do|do i do|happens) next$|^what is after this( exercise| part)?$|^what is the next (part|exercise|one)$/;
/** "Can I skip ahead?" — Test out. */
const PLAN_SKIP = /^(can|could|may) i (skip ahead|skip this step|test out( of this step)?|skip to the next step)$|^how (do|can) i (skip ahead|test out( of this step)?)$/;
/** "I have 5 minutes." */
const PLAN_MINUTES = /^i (only )?(have|have got|got) (only )?(\d+|five|ten|fifteen|twenty|thirty|forty|sixty) min(ute)?s?( today| now| left)?$|^(can|could) (we|i) do (only )?(\d+|five|ten|fifteen|twenty|thirty|forty|sixty) min(ute)?s?( today)?$/;
/** "When does this come back?" — the review schedule. */
const PLAN_RETURN = /^when (does|will) (this|it|this exercise) come back$|^when (do|will) i (see|play|get|review) (this|it|this exercise) again$|^when is (this|it|this exercise) (due|reviewed|due for review)( again)?$/;

/** "What notes are in F7?", "spell Am7", "notes of Cmaj7". The chord is read off the raw text. */
const CHORD_NOTES = /^(what|which) notes (are )?(in|of|make up) (an? |the )?(chord )?[a-g]\S*( \S+)?( chord)?$|^spell (an? |the )?(chord )?[a-g]\S*( \S+)?( chord)?$|^(what are the )?notes (in|of) (an? |the )?(chord )?[a-g]\S*( \S+)?( chord)?$/;
const CHORD_NOTES_RAW = /(?:\bin|\bof|\bup|^spell)\s+(?:an?\s+|the\s+)?(?:chord\s+)?([A-Ga-g][#b♯♭]?[^\s?.,!]*)(?:\s+chord)?\s*[?.!]*\s*$/i;
/** "What fits over F?", "what scale goes over Am7?" */
const SCALE_FITS = /^what (scales? )?(fits?|works?|goes?|go|sounds? good|can i play|should i play|do i play|to play) over (an? |the )?(chord )?[a-g]\S*( \S+)?( chord)?$|^what scales? (fits?|works?|goes?|go|can i use|should i use) (over|with) (an? |the )?(chord )?[a-g]\S*( \S+)?( chord)?$/;
const SCALE_FITS_RAW = /\b(?:over|with)\s+(?:an?\s+|the\s+)?(?:chord\s+)?([A-Ga-g][#b♯♭]?[^\s?.,!]*)(?:\s+chord)?\s*[?.!]*\s*$/i;
const CHORD_SHAPE = /^[A-Ga-g][#b♯♭]?(?:$|m|M|maj|min|dim|aug|sus|add|\d|\+|-|°|ø|\/|\()/;
/** "This chord", "it": a chord the app would have to guess. */
const NOT_A_CHORD = /^(this|that|it|these|those|them|chord|chords|one|scale|key)$/i;

/** "What does 85% even mean?", "what does the evenness pass mark mean?" */
const PASS_MARK_MS =
  /^what (does|do|is) (a |an |the )?(\d+)( percent)?( even| evenness| timing| timing evenness)?( even)? (mean|stand for)$|^what (does|do) (the )?(evenness|timing evenness)( pass mark| score| number| percentage)? (mean|stand for)$|^what is (timing )?evenness$|^how (is|do you measure) (timing )?evenness( measured| worked out)?$/;
/** "What is a clean tempo?" */
const CLEAN_TEMPO =
  /^what (is|does) (a |the |my )?clean tempo( mean)?$|^what (do you|does the app) (mean by|call) (a )?clean tempo$|^how (is|do you work out|do i get) (a |the |my )?clean tempo( worked out| calculated| measured| earned)?$/;

function numberOf(word: string): number | null {
  if (/^\d+$/.test(word)) return Number(word);
  return NUMBER_WORDS[word] ?? null;
}

/**
 * The chord's two closed arguments: its root as written, and the app's own
 * suffix for its quality (`chordSuffix`), or `unknown` when the app does not
 * read the chord. A root the app does not name ("E#") is no card.
 */
function chordArgs(chord: string): { root: string; suffix: string } | null {
  const s = chord.replace(/♯/g, "#").replace(/♭/g, "b");
  const m = /^([A-Ga-g])([#b]?)(.*)$/.exec(s);
  if (!m) return null;
  const root = m[1].toUpperCase() + m[2];
  if (!ROOT_NAMES.includes(root)) return null;
  // A slash chord ("D/F#"): the card's two arguments cannot carry the bass,
  // and "D is D F# A" answers a chord that was not asked (review c2b2a L5).
  // No card; "6/9" is a chord's own name, not a bass.
  if (m[3].includes("/") && m[3].trim() !== "6/9") return null;
  const parsed = parseChordName(root + m[3]);
  return { root, suffix: parsed ? chordSuffix(parsed.quality) : UNKNOWN_SUFFIX };
}

function chordFrom(raw: string, re: RegExp): string | null {
  const m = re.exec(raw.trim());
  if (!m) return null;
  const chord = m[1];
  // A lone lower-case "a" is the article ("what notes are in a chord").
  if (NOT_A_CHORD.test(chord) || chord.length > 16 || chord === "a") return null;
  // A chord symbol goes on from its root with a quality, a number or nothing:
  // "blues", "deep" or "every" are words, not a B, a D or an E chord.
  return CHORD_SHAPE.test(chord) ? chord : null;
}

/**
 * The card a typed question asks of these shapes, or null. `s` is the text
 * `normalizeQuestion` made (lower case, contractions out); `raw` the text as
 * typed (for a chord's "#").
 */
export function matchPathCard(s: string, raw: string): CardCall[] {
  const q = s.replace(/\?/g, "").trim();
  const found: CardCall[] = [];
  if (PURPOSE.test(q)) found.push({ tool: "exercise_purpose", args: {} });
  if (HOW.test(q)) found.push({ tool: "exercise_how", args: {} });
  if (TRY.test(q)) found.push({ tool: "exercise_try", args: {} });
  if (PLAN_WHY.test(q)) found.push({ tool: "plan_why", args: {} });
  if (PLAN_TEMPO.test(q)) found.push({ tool: "plan_tempo", args: {} });
  if (PLAN_NEXT.test(q)) found.push({ tool: "plan_next", args: {} });
  if (PLAN_SKIP.test(q)) found.push({ tool: "plan_skip", args: {} });
  const minutes = PLAN_MINUTES.exec(q);
  if (minutes) {
    const word = q.match(/(\d+|five|ten|fifteen|twenty|thirty|forty|sixty) min/)?.[1];
    const n = word ? numberOf(word) : null;
    if (n !== null) found.push({ tool: "plan_minutes", args: { minutes: n } });
  }
  if (PLAN_RETURN.test(q)) found.push({ tool: "plan_return", args: {} });
  if (CHORD_NOTES.test(q)) {
    const chord = chordFrom(raw, CHORD_NOTES_RAW);
    const args = chord ? chordArgs(chord) : null;
    if (args) found.push({ tool: "chord_notes", args });
  }
  if (SCALE_FITS.test(q)) {
    const chord = chordFrom(raw, SCALE_FITS_RAW);
    const args = chord ? chordArgs(chord) : null;
    if (args) found.push({ tool: "scale_fits", args });
  }
  const mark = PASS_MARK_MS.exec(q);
  if (mark) {
    const value = q.match(/\b(\d+)\b/)?.[1];
    const n = value ? Number(value) : null;
    // A number is a pass mark only when it was typed as a percentage: the
    // normalised text has lost "%", and "what does 85 mean" may be the tempo
    // or any number on screen (review c2b2a M1).
    const percent = n === null || /\d\s*(%|percent\b|per cent\b)/i.test(raw);
    if (percent && (n === null || (n >= 1 && n <= 100))) found.push({ tool: "pass_mark_ms", args: n === null ? {} : { value: n } });
  }
  if (CLEAN_TEMPO.test(q)) found.push({ tool: "clean_tempo", args: {} });
  return found;
}
