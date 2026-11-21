/**
 * Typed English to the Path, plan, theory and term cards (leg c2b2a), through
 * `matchCard` (both tables): every pattern with the near-misses that must not
 * match. A wrong card is worse than no card.
 */
import { describe, expect, it } from "vitest";
import { matchCard } from "./match";

const matches: Array<[string, string, Record<string, unknown>]> = [
  ["What is this for?", "exercise_purpose", {}],
  ["what's this exercise for", "exercise_purpose", {}],
  ["What is the point of this?", "exercise_purpose", {}],
  ["How do I play this?", "exercise_how", {}],
  ["how should i play this exercise", "exercise_how", {}],
  ["How does this go?", "exercise_how", {}],
  ["What should I try?", "exercise_try", {}],
  ["what should i try next time", "exercise_try", {}],
  ["Any tips?", "exercise_try", {}],
  ["Why this?", "plan_why", {}],
  ["Why am I doing this today?", "plan_why", {}],
  ["Why this tempo?", "plan_tempo", {}],
  ["why so slow?", "plan_tempo", {}],
  ["Why 80 BPM?", "plan_tempo", {}],
  ["What's next?", "plan_next", {}],
  ["What comes next?", "plan_next", {}],
  ["what is the next exercise", "plan_next", {}],
  ["Can I skip ahead?", "plan_skip", {}],
  ["can i test out of this step", "plan_skip", {}],
  ["I have 5 minutes", "plan_minutes", { minutes: 5 }],
  ["I only have ten minutes today", "plan_minutes", { minutes: 10 }],
  ["can we do 15 minutes", "plan_minutes", { minutes: 15 }],
  ["When does this come back?", "plan_return", {}],
  ["when will I see this again", "plan_return", {}],
  ["What notes are in F7?", "chord_notes", { root: "F", suffix: "7" }],
  ["what notes are in a F#m7 chord?", "chord_notes", { root: "F#", suffix: "m7" }],
  ["spell Bbmaj7", "chord_notes", { root: "Bb", suffix: "maj7" }],
  ["What notes are in f7?", "chord_notes", { root: "F", suffix: "7" }],
  ["What fits over F?", "scale_fits", { root: "F", suffix: "" }],
  ["what scale goes over Am7", "scale_fits", { root: "A", suffix: "m7" }],
  ["What scales work with G7?", "scale_fits", { root: "G", suffix: "7" }],
  ["What can I play over an Eb?", "scale_fits", { root: "Eb", suffix: "" }],
  ["what notes are in A?", "chord_notes", { root: "A", suffix: "" }],
  ["what notes are in F7zz?", "chord_notes", { root: "F", suffix: "unknown" }],
  ["What does 85% even mean?", "pass_mark_ms", { value: 85 }],
  ["what does 85 percent mean", "pass_mark_ms", { value: 85 }],
  ["What does the evenness pass mark mean?", "pass_mark_ms", {}],
  ["what is timing evenness", "pass_mark_ms", {}],
  ["What is a clean tempo?", "clean_tempo", {}],
  ["what's my clean tempo", "clean_tempo", {}],
  ["How is the clean tempo worked out?", "clean_tempo", {}],
];

describe("matches", () => {
  it.each(matches)("%s -> %s", (text, tool, args) => {
    expect(matchCard(text)).toEqual({ tool, args });
  });
});

/** Near-misses: the question is about something else, or names no object the card reads. */
const nearMisses: string[] = [
  // The Exercise's words: never a general question.
  "What is a pentatonic for?",
  "how do I play F",
  "how do I play faster",
  "how do I play the blues",
  "how do i hold the pick",
  "what is this button for",
  "what should I try for dinner",
  "what should I practise tomorrow",
  // The plan: never the next position, Step or Path; never the app.
  "what's the next position",
  "what is the next step",
  "what's next for the app",
  "why this scale?",
  "why this chord",
  "why this app",
  "why is the click so loud",
  "why this tempo on take 3?",
  "can I skip the count-in",
  "can I skip this song",
  "skip ahead",
  "I have 5 minutes of fame",
  "I have 5 strings",
  "when does the jam come back",
  "when does the band come back in",
  // Theory: a chord the app would have to guess, or a word that only starts with a letter.
  "what notes are in this chord",
  "what notes are in a chord",
  "what goes over the bridge",
  "what scale goes over the blues",
  "what fits over everything",
  "what goes over A minor",
  "what notes did I miss",
  "which notes did I get wrong",
  // Terms: a number about something else, the "even" of the sentence about a Take.
  "what does BPM mean",
  "what does 85% of my takes mean",
  "is a clean tempo good",
  "what is a tempo",
  "what does clean mean",
];

describe("near-misses", () => {
  it.each(nearMisses)("%s -> no card", (text) => {
    expect(matchCard(text)).toBeNull();
  });
});

describe("the Take cards still match as they did", () => {
  it.each([
    ["Where did it slip?", "where_slipped"],
    ["How far is the pass mark?", "pass_mark_distance"],
    ["What is the score made of?", "score_made_of"],
    ["Am I improving?", "improving"],
  ])("%s -> %s", (text, tool) => {
    expect(matchCard(text)?.tool).toBe(tool);
  });
});
