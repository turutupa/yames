/**
 * Ask's empty state and its plain statement say only what can answer there
 * (leg c2cc; review of c2cb, M2, M3, L10).
 */
import { describe, expect, it } from "vitest";
import en from "../../locales/en/help.json";
import enAsk from "../../locales/en/ask.json";
import { askEmptyKey, askNothingKey, type AskWhere } from "./askEmpty";

const at = (o: Partial<AskWhere>): AskWhere => ({ mobile: false, model: "off", english: true, canRunModel: true, ...o });

function words(key: string): string {
  const [ns, ...rest] = key.split(".");
  let v: unknown = ns === "help" ? en : enAsk;
  for (const part of [ns, ...rest]) v = (v as Record<string, unknown> | undefined)?.[part];
  return v as string;
}

describe("askEmptyKey", () => {
  it("in English: the app's own answers on a phone, with no model, while one loads and beside a ready one", () => {
    expect(askEmptyKey(at({ mobile: true }))).toBe("help.ui.empty.phone");
    expect(askEmptyKey(at({}))).toBe("help.ui.empty.local");
    expect(askEmptyKey(at({ model: "loading" }))).toBe("ask.empty.loading");
    expect(askEmptyKey(at({ model: "waiting" }))).toBe("ask.empty.loading");
    expect(askEmptyKey(at({ model: "ready" }))).toBe("ask.empty.model");
  });

  it("outside English, typed text is searched in the Paths only, and the chips are offered for the rest", () => {
    expect(askEmptyKey(at({ english: false }))).toBe("help.ui.empty.search");
    expect(askEmptyKey(at({ english: false, mobile: true }))).toBe("help.ui.empty.search");
    expect(askEmptyKey(at({ english: false, model: "loading" }))).toBe("help.ui.empty.searchLoading");
    expect(askEmptyKey(at({ english: false, model: "ready" }))).toBe("help.ui.empty.searchModel");
  });

  it("the English loading and model lines say the app answers now, and the model adds general advice", () => {
    expect(words("ask.empty.loading")).not.toMatch(/once it is, you can ask/i);
    expect(words("ask.empty.loading")).toMatch(/general advice/);
    expect(words("ask.empty.model")).toMatch(/what it measured/);
    for (const k of ["help.ui.empty.search", "help.ui.empty.searchLoading", "help.ui.empty.searchModel"]) {
      expect(words(k), k).toMatch(/searches your Paths/);
      expect(words(k), k).not.toMatch(/answers from your Takes/);
    }
  });
});

describe("askNothingKey", () => {
  it("offers a model only on a computer whose build can run one", () => {
    expect(askNothingKey(at({}))).toBe("help.ui.reply.local");
    expect(askNothingKey(at({ canRunModel: false }))).toBe("help.ui.reply.phone");
    expect(askNothingKey(at({ mobile: true }))).toBe("help.ui.reply.phone");
    expect(askNothingKey(at({ model: "loading" }))).toBe("ask.reply.gettingReady");
    expect(words("help.ui.reply.phone")).not.toMatch(/model/);
  });

  it("outside English it names the Paths alone, the only thing a typed question was checked against", () => {
    expect(askNothingKey(at({ english: false }))).toBe("help.ui.reply.searchLocal");
    expect(askNothingKey(at({ english: false, canRunModel: false }))).toBe("help.ui.reply.search");
    expect(askNothingKey(at({ english: false, mobile: true }))).toBe("help.ui.reply.search");
    expect(words("help.ui.reply.search")).not.toMatch(/Takes|help/);
  });
});
