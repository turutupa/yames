/**
 * "Find a tab for this song" — and the promise underneath it.
 *
 * `plans/SONGS.md` S0.9, and the hard rule of the whole of W19: **no tab site
 * is embedded, scraped or called from inside Yames, by any route.** Those
 * sites host mostly unlicensed transcriptions, and an app that fetches them
 * stops being a bystander and starts being a party to it.
 *
 * So this is not a search. It is a URL, handed to the player's own default
 * browser through `open_url` — the same path the Support and About screens
 * use for a link. Yames makes no request, reads no response, and names no
 * site: it opens an ORDINARY WEB SEARCH, on a general-purpose search engine,
 * for the words the player typed and nothing else. What comes back is
 * between them and their browser, exactly as it would be if they had typed
 * it themselves. All Yames has removed is the typing.
 *
 * `tabSearchUrl` is here rather than inside the component because a promise
 * like that is worth a test — `findTab.test.ts` checks that no tab site's
 * name can appear in what this builds, and that nothing but the words
 * crosses.
 */

/**
 * The search engine the link opens.
 *
 * DuckDuckGo, for one reason that is not about search quality: it is the
 * engine that does not build a profile out of the query. The app's own
 * promise is "nothing you play ever leaves your computer"
 * (`WEBSITE_DECISIONS.md`), and while a song title a player typed is a long
 * way from that, sending it somewhere that will not tie it to them is the
 * version of this feature that is consistent with the rest of the app.
 *
 * It is a general-purpose search engine and not a music site. That is the
 * whole point: Yames names no tab site, and the results page is whatever the
 * web says it is.
 */
const SEARCH = "https://duckduckgo.com/";

/**
 * The words added to what the player typed.
 *
 * "guitar pro tab" rather than a site name, because it is what a guitarist
 * would type and because it biases the results towards the file format Yames
 * can actually open — which is a better result for the player AND keeps this
 * function free of anybody's brand.
 */
export const TAB_SEARCH_TERMS = "guitar pro tab";

/** The longest query that will be sent. A title, not an essay. */
export const MAX_QUERY = 120;

/**
 * An ordinary web search for a tab, or `null` when there is nothing to search
 * for.
 *
 * `null` and not an empty search: opening the player's browser on a blank
 * results page because they pressed a link with an empty box is worse than
 * the link doing nothing.
 */
export function tabSearchUrl(typed: string): string | null {
  const words = typed.replace(/\s+/gu, " ").trim().slice(0, MAX_QUERY);
  if (!words) return null;
  const url = new URL(SEARCH);
  // `URLSearchParams` and not string concatenation: a title with an
  // ampersand, a hash or a plus in it is a title, not three parameters.
  url.searchParams.set("q", `${words} ${TAB_SEARCH_TERMS}`);
  return url.toString();
}
