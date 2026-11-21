import { describe, expect, it } from "vitest";
import type { PathDoc } from "../../paths/format";
import type { PlayerProgress } from "../../session/progress";
import {
  answerSearchFor,
  buildSearchIndex,
  fold,
  searchIndexFor,
  searchPathIds,
  searchPaths,
  stem,
  tokenize,
} from "./search";

type Ex = { id: string; title?: string; purpose: string; howTo: string[]; variants?: Array<{ id: string; purpose?: string; howTo?: string[] }> };
type St = { id: string; order: number; title: string; why: string; payoff: string; howTo: string[]; exercises: Ex[] };

function pack(id: string, steps: St[]): PathDoc {
  return {
    id,
    title: id,
    steps: steps.map((s) => ({
      ...s,
      goal: "",
      prerequisites: [],
      difficulty: 1,
      exercises: s.exercises.map((e) => ({
        ...e,
        title: e.title ?? e.id,
        grading: "graded",
        tempo: { rungs: [], passAtBpm: 100 },
        ...(e.variants
          ? { variation: { dimensions: [], pooled: [], notPooled: [], variants: e.variants.map((v) => ({ label: v.id, params: {}, ...v })) } }
          : {}),
      })),
    })),
  } as unknown as PathDoc;
}

const LEGATO = pack("legato", [
  {
    id: "first-pulls",
    order: 2,
    title: "Pull-offs",
    why: "A pull-off is a small pluck with the fretting finger: pull the string down and off, «don't just lift».",
    payoff: "Pull-offs that sound as loud as the picked note.",
    howTo: ["Pull the string sideways as you let go, so it sounds."],
    exercises: [
      {
        id: "pull-each-finger",
        purpose: "Each finger pulls off to the open string.",
        howTo: ["Pick the fretted note, then pull off to the open string."],
        variants: [{ id: "key=E", howTo: ["In E: pull off from the second fret to the open low E."] }],
      },
    ],
  },
]);

const METAL = pack("metal-rhythm", [
  {
    id: "power-chords",
    order: 3,
    title: "Power chords",
    why: "A power chord is a root and a fifth, no third: it stays clear under distortion.",
    payoff: "Two-note chords that sound big.",
    howTo: ["Mute the strings you do not play with the side of the fretting finger."],
    exercises: [{ id: "chord-stops", purpose: "Power chords on the beat, then a stop.", howTo: ["Let each chord ring to the next beat."] }],
  },
]);

const PATHS = [LEGATO, METAL];

const progress = (over: Partial<PlayerProgress>): PlayerProgress => ({ states: [], takes: [], ceilings: [], ...over });

describe("tokens", () => {
  it("folds German umlauts both ways they are typed", () => {
    expect(fold("Übung für Wechselschlag", "de")).toBe(fold("Uebung fuer wechselschlag", "de"));
  });

  it("drops accents where players type without them, and keeps kana and Cyrillic marks", () => {
    expect(fold("Qué acórdes", "es")).toBe("que acordes");
    expect(fold("NASIL ÇALIŞIRIM", "tr")).toBe("nasil calisirim");
    expect(fold("ещё", "ru")).toBe("еще");
    expect(fold("йод", "ru")).toBe("йод");
    expect(fold("ギター", "ja")).toBe("ギター");
    expect(fold("ｷﾞﾀｰ", "ja")).toBe("ギター");
  });

  it("cuts ja, zh and ko into character bigrams, stop words out first", () => {
    expect(tokenize("パワーコードって何", "ja")).toEqual(["パワ", "ワー", "ーコ", "コー", "ード", "何"]);
    expect(tokenize("强力和弦", "zh-CN")).toEqual(["强力", "力和", "和弦"]);
    expect(tokenize("파워 코드는", "ko")).toEqual(["파워", "코드", "드는"]);
    // A document also holds each Han character alone, so a one-character question word finds it.
    expect(tokenize("和弦", "zh-CN", true)).toEqual(["和弦", "和", "弦"]);
  });

  it("stems English lightly and cuts the inflected languages to six letters", () => {
    expect(["pull-offs", "picking", "tapping", "strings", "string", "speed"].flatMap((w) => tokenize(w, "en"))).toEqual([
      "pull",
      "off",
      "pick",
      "tap",
      "string",
      "string",
      "speed",
    ]);
    expect(stem("akkorden", "de")).toBe("akkord");
    expect(stem("аккордов", "ru")).toBe("аккорд");
  });

  it("drops stop words and single letters, keeps numbers", () => {
    expect(tokenize("How do I play a 12 bar blues?", "en")).toEqual(["play", "12", "bar", "blue"]);
  });
});

describe("searchPaths", () => {
  const index = buildSearchIndex(PATHS, "en");

  it("finds the Step a question is about, and quotes one of its passages", () => {
    // Two Steps make tiny idfs, so the floor (set on the sixteen real Paths) is off here.
    const [hit] = searchPaths("my pull-offs are too quiet", index, { floor: null });
    expect(hit).toMatchObject({ pathId: "legato", stepId: "first-pulls" });
    expect(searchPaths("what is a power chord", index, { floor: null })[0]).toMatchObject({
      pathId: "metal-rhythm",
      stepId: "power-chords",
    });
  });

  it("answers none to a question about something else", () => {
    expect(searchPaths("what's the weather like tomorrow", index)).toEqual([]);
    expect(searchPaths("how do I", index)).toEqual([]);
    expect(searchPaths("", index)).toEqual([]);
  });

  it("returns at most one passage a Step, at most five", () => {
    const hits = searchPaths("pull off string chord", index, { floor: null });
    expect(new Set(hits.map((h) => `${h.pathId}/${h.stepId}`)).size).toBe(hits.length);
    expect(hits.length).toBeLessThanOrEqual(5);
  });

  it("only searches the Paths it is given", () => {
    expect(searchPaths("power chord", index, { pathIds: new Set(["legato"]), floor: null })).toEqual([]);
    expect(searchPaths("power chord", index, { pathIds: new Set(["metal-rhythm"]), floor: null })).toHaveLength(1);
  });

  it("quotes the variant played where it has its own words, and never another variant's", () => {
    const q = "pull off from the second fret to the open low E";
    const plain = searchPaths(q, index, { floor: null });
    expect(plain.some((h) => h.variantId)).toBe(false);
    const played = searchPaths(q, index, { played: { exerciseId: "pull-each-finger", variantId: "key=E" }, floor: null });
    expect(played[0]).toMatchObject({ variantId: "key=E", field: "howTo", text: "In E: pull off from the second fret to the open low E." });
  });
});

describe("searchPathIds: the player's Paths", () => {
  it("is every Path (null) for a player with none", () => {
    expect(searchPathIds(PATHS, progress({}))).toBeNull();
    expect(searchPathIds(PATHS, null)).toBeNull();
  });

  it("is the Paths followed plus the ones with a passed Step", () => {
    const started = progress({ states: [{ pathId: "legato", startedAt: 1, updatedAt: 1 }] });
    expect(searchPathIds(PATHS, started)).toEqual(new Set(["legato"]));
    const passedOnly = progress({ ceilings: [{ exerciseKey: "metal-rhythm/chord-stops", cleanBpm: 120, lastPracticed: 1 }] });
    expect(searchPathIds(PATHS, passedOnly)).toEqual(new Set(["metal-rhythm"]));
    const left = progress({ states: [{ pathId: "legato", startedAt: 1, updatedAt: 1 }], unsubscribed: ["legato"] });
    expect(searchPathIds(PATHS, left)).toBeNull();
  });
});

describe("answerSearchFor", () => {
  it("is null with no packs loaded, an empty question, or nothing near", () => {
    expect(answerSearchFor("pull-offs", { language: "en", paths: null })).toBeNull();
    expect(answerSearchFor("  ", { language: "en", paths: PATHS })).toBeNull();
    expect(answerSearchFor("tell me a joke", { language: "en", paths: PATHS })).toBeNull();
  });

  it("builds an index once per packs and language, and anew for new packs", () => {
    const a = searchIndexFor(PATHS, "en");
    expect(searchIndexFor(PATHS, "en")).toBe(a);
    expect(searchIndexFor(PATHS, "de")).not.toBe(a);
    expect(searchIndexFor([...PATHS], "en")).not.toBe(a);
  });
});
