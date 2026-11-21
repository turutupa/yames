/**
 * C5 — Seeded Template Catalog, in the player's language.
 *
 * The strings live in `src/locales/<lang>/toolTips.json` (leg c5c3); this
 * module only picks the active language's catalogue. Until c5c3 they were
 * TypeScript constants here; `scripts/tool-tips-extract.ts` moved them
 * byte for byte, and `templateCatalog.data.test.ts` holds English to them.
 *
 * What ships:
 *   - The `generic` vocabulary covers every gatekeeper scenario at
 *     all three severities, so the system always has a fallback.
 *   - All five instrument vocabularies (`drums`, `electric-guitar`,
 *     `acoustic-guitar`, `bass`, `piano`) cover the highest-frequency
 *     scenarios with instrument-specific overrides.
 *   - Remaining scenarios (`low_confidence`, `boundary_signal_a`,
 *     `boundary_signal_b`) fall through to the `generic` catalog,
 *     which is intentional — those scenarios are about the
 *     metronome/signal layer, not the instrument, so a single
 *     consistent voice across instruments is the right call.
 *
 * The vocabulary rule holds in every language: drums never says
 * "downstroke", guitar never says "ghost note on snare"; the generic
 * catalogue names no instrument's technique.
 *
 * Authoring guidance (from the plan's "voice rules"):
 *   - Coach voice, not chatbot voice.
 *   - Specific metrics, not generic encouragement.
 *   - Instrument-appropriate vocabulary baked in at authoring time.
 *   - Severity-graded: encouragement vs. neutral observation vs.
 *     technical correction. Same observation, different tone.
 *
 * Language. The three exported catalogues are live: every read of a
 * vocabulary returns the catalogue of `i18n.language` at that moment, so
 * importers keep passing `TEMPLATE_CATALOG` to `pickTemplate` and the line
 * follows the language the player picked. Placeholders are the catalogue's
 * own `{name}`, filled by `fillTemplate`, not by i18next.
 *
 * A locale may be translated a section at a time (most-seen first:
 * generic and the two mode overlays, then the guitars and bass, then drums
 * and piano). A section not translated yet carries English's text in the
 * locale's file (so every locale has the same keys) and is named in
 * `toolTipsPending.json`; it is never shown. A pending instrument is simply
 * absent, so `pickTemplate`'s own fallback answers from that locale's
 * `generic`; a pending `generic` makes the whole locale answer in English; a
 * pending mode overlay or `words` falls back to English's.
 */

import i18n from "i18next";
import type { ScenarioCatalog, TemplateCatalog, Vocabulary } from "./templates";
import pendingFile from "./toolTipsPending.json";

/** One locale's `toolTips.json`. */
export interface ToolTipsFile {
  toolTips: {
    catalog: TemplateCatalog;
    defaultMode: TemplateCatalog;
    proMode: TemplateCatalog;
    words: ToolTipWords;
  };
}

/** The values code puts into `{direction}`, `{correctionDirection}`, `{change}`. */
export interface ToolTipWords {
  direction: { before: string; after: string };
  correctionDirection: { earlier: string; later: string };
  change: Record<
    | "bpmUp"
    | "bpmDown"
    | "presetCleared"
    | "preset"
    | "timeSig"
    | "grouping"
    | "instrument"
    | "other"
    | "separator",
    string
  >;
}

/** A section of a locale's file, as `toolTipsPending.json` names it. */
export type ToolTipSection = Vocabulary | "defaultMode" | "proMode" | "words";

const FILES: Record<string, ToolTipsFile> = {};
for (const [p, mod] of Object.entries(
  import.meta.glob("../locales/*/toolTips.json", { eager: true, import: "default" }),
)) {
  const lang = p.match(/locales\/([^/]+)\/toolTips\.json$/)?.[1];
  if (lang) FILES[lang] = mod as ToolTipsFile;
}

const PENDING = pendingFile as Record<string, string[]>;

const EN = FILES.en.toolTips;

/** The vocabularies, in the English file's order. */
const VOCABS = Object.keys(EN.catalog) as Vocabulary[];

interface Resolved {
  catalog: TemplateCatalog;
  defaultMode: TemplateCatalog;
  proMode: TemplateCatalog;
  words: ToolTipWords;
  lang: string;
}

const resolved = new Map<string, Resolved>();

/** The catalogue a language shows, pending sections taken out. */
export function toolTipsFor(lang: string | undefined): Resolved {
  const key = lang && FILES[lang] ? lang : "en";
  const hit = resolved.get(key);
  if (hit) return hit;
  const file = FILES[key].toolTips;
  const pending = new Set(key === "en" ? [] : (PENDING[key] ?? []));
  let out: Resolved;
  if (pending.has("generic")) {
    // Nothing of its own to fall back to: the whole locale speaks English.
    out = { ...EN, lang: "en" };
  } else {
    const catalog: TemplateCatalog = {};
    for (const v of VOCABS) if (!pending.has(v)) catalog[v] = file.catalog[v];
    out = {
      catalog,
      defaultMode: pending.has("defaultMode") ? EN.defaultMode : file.defaultMode,
      proMode: pending.has("proMode") ? EN.proMode : file.proMode,
      words: pending.has("words") ? EN.words : file.words,
      lang: key,
    };
  }
  resolved.set(key, out);
  return out;
}

const active = (): Resolved => toolTipsFor(i18n.language);

/**
 * The language the tips are written in right now: "en" when the player's
 * language has no catalogue of its own yet. The model only rephrases English
 * (owner decision 3, "model prose English first"); in any other language the
 * template ships as written.
 */
export function toolTipsLanguage(): string {
  return active().lang;
}

/** The words that fill `{direction}`, `{correctionDirection}`, `{change}` now. */
export function toolTipWords(): ToolTipWords {
  return active().words;
}

/**
 * The gatekeeper writes `direction` and `correctionDirection` as English
 * tokens ("before"/"after", "earlier"/"later"); this swaps them for the
 * active language's words. Everything else passes through untouched.
 */
export function localizeTipContext<T extends Record<string, string | number | boolean>>(
  context: T,
): T {
  const words = toolTipWords();
  const out: Record<string, string | number | boolean> = { ...context };
  const d = context.direction;
  if (d === "before" || d === "after") out.direction = words.direction[d];
  const c = context.correctionDirection;
  if (c === "earlier" || c === "later") out.correctionDirection = words.correctionDirection[c];
  return out as T;
}

/** A catalogue whose every vocabulary is read from the active language. */
function live(pick: (r: Resolved) => TemplateCatalog, vocabs: Vocabulary[]): TemplateCatalog {
  const out: TemplateCatalog = {};
  for (const v of vocabs) {
    Object.defineProperty(out, v, {
      enumerable: true,
      get: (): ScenarioCatalog | undefined => pick(active())[v],
    });
  }
  return out;
}

export const TEMPLATE_CATALOG: TemplateCatalog = live((r) => r.catalog, VOCABS);

/**
 * Default-mode overlay catalog. Variants here are checked FIRST when the
 * caller passes this catalog as the `modeCatalog` argument to
 * `pickTemplate`. They override (or introduce) the phrasing for scenarios
 * that are specific to the "default" (musical-feel) scoring mode. The main
 * TEMPLATE_CATALOG remains the fallback for any scenario / severity not
 * covered here. All entries use the `generic` vocabulary and `neutral`
 * severity so they apply regardless of instrument and tone.
 */
export const DEFAULT_MODE_CATALOG: TemplateCatalog = live((r) => r.defaultMode, ["generic"]);

/** Pro mode catalog — mode-aware overrides for PRO_MODE. */
export const PRO_MODE_CATALOG: TemplateCatalog = live((r) => r.proMode, ["generic"]);
