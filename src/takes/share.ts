/**
 * Where a clip might go next — and the app's part in it, which is none.
 *
 * The owner's ask on "Save as a video" (W25): after a save, the player gets
 * the file's folder and a few links straight to the places they would put it.
 * What this file is NOT is an integration. There is no API call, no token, no
 * account and no upload: each link opens the site's own upload page in the
 * player's own browser, through the same `open_url` the "find a tab" link
 * already uses (`plans/SONGS.md` S0.9 — Yames does not reach into other
 * people's services), and the player drags the file they just saved into it.
 *
 * That distinction is the whole design. An app that posts on your behalf
 * needs your password; an app that opens a tab needs nothing, works the day
 * a site changes its API, and cannot fail in a way that loses your clip.
 *
 * The names are not translated: they are the names of the places.
 */

/** Which way up a place wants a clip, where it has a preference worth saying. */
export type ShapePreference = "wide" | "tall" | "either";

export type SharePlace = {
  /** What it is called. Not a locale key: it is a proper noun. */
  name: string;
  /** The site's own upload page, opened in the player's browser. */
  url: string;
  prefers: ShapePreference;
};

/**
 * The four the owner named, in the order a musician would think of them.
 *
 * Each URL is the site's UPLOAD page rather than its home page, because a
 * link that lands somebody on a feed has not saved them anything. Where a
 * site has no stable web upload URL — Instagram posts through the same page
 * it browses on — the page that does have the control is used.
 */
export const SHARE_PLACES: readonly SharePlace[] = [
  { name: "Instagram", url: "https://www.instagram.com/", prefers: "tall" },
  { name: "TikTok", url: "https://www.tiktok.com/upload", prefers: "tall" },
  { name: "YouTube", url: "https://www.youtube.com/upload", prefers: "either" },
  { name: "X", url: "https://x.com/compose/post", prefers: "wide" },
];

/**
 * Which places want this shape, as a short list beside the shape's chip.
 *
 * A few words or nothing: the point is to save somebody a decision, and a
 * paragraph about aspect ratios beside a two-word button is not that. A place
 * that takes either is on neither list — saying "and also everywhere else"
 * about every choice tells a reader nothing.
 */
export function placesFor(shape: "wide" | "tall"): string {
  return SHARE_PLACES.filter((place) => place.prefers === shape)
    .map((place) => place.name)
    .join(", ");
}
