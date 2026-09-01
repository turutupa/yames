import type { TFunction } from "i18next";
import type { SavedSession } from "../../types";

/**
 * Date/time formatting + day-grouping helpers shared between the CoachCard
 * sub-components (FeedMessageItem, HistoryList, SessionDetail). Pulled out
 * to keep the visual components lean and to make these pure functions easy
 * to test in isolation.
 */

export function formatTime(timestamp: number, lang: string): string {
  return new Date(timestamp).toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(timestamp: number, t: TFunction, lang: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));
  const time = formatTime(timestamp, lang);

  if (diffDays === 0) return `${t("coachCard.today")} ${time}`;
  if (diffDays === 1) return `${t("coachCard.yesterday")} ${time}`;
  if (diffDays < 7) return `${date.toLocaleDateString(lang, { weekday: "short" })} ${time}`;
  return date.toLocaleDateString(lang, { month: "short", day: "numeric" });
}

export function getDayGroup(timestamp: number, t: TFunction, lang: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dateDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - dateDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return t("coachCard.today");
  if (diffDays === 1) return t("coachCard.yesterday");
  if (diffDays < 7) return date.toLocaleDateString(lang, { weekday: "long" });
  return date.toLocaleDateString(lang, { month: "short", day: "numeric" });
}

export function groupByDay(
  sessions: SavedSession[],
  t: TFunction,
  lang: string,
): { label: string; sessions: SavedSession[] }[] {
  const groups: { label: string; sessions: SavedSession[] }[] = [];
  let currentLabel = "";
  for (const session of sessions) {
    const label = getDayGroup(session.timestamp, t, lang);
    if (label !== currentLabel) {
      groups.push({ label, sessions: [session] });
      currentLabel = label;
    } else {
      groups[groups.length - 1].sessions.push(session);
    }
  }
  return groups;
}

export function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
