// Weekly meal plan (issue #11): one Markdown note with a heading per day and a link per planned recipe,
// readable and editable without the plugin:
//
//   ## 2026-11-30 · Montag
//   - [[Linsensuppe]] · 4 Portionen
//
// The ISO date first keeps the days sortable and readable in any language. Only day headings and their
// list lines are added; everything else stays as the user wrote it.
// Pure functions without Obsidian, tested in tests/mealPlan.test.ts.

import { language, locale, type Lang } from "./i18n";
import { servingsUnitText } from "./servingsWords";
import { readResult } from "./quantities";
import { hangingEnd } from "./hanging";

export interface PlanEntry {
  /** Link target of the recipe note (file name without .md). */
  target: string;
  /** Planned servings, if noted. */
  servings?: number;
}

export interface PlanDay {
  date: string;
  entries: PlanEntry[];
}

export const DAY = /^##\s+(\d{4}-\d{2}-\d{2})\b/;
export const ENTRY = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\](.*)$/;

/** ISO dates of `count` days starting at `start` (YYYY-MM-DD). */
export function days(start: string, count = 7): string[] {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

/** The date `n` days after (or before, negative) `iso`. */
export const addDays = (iso: string, n: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

/** The weekday in the interface language, or in the language of a note for a heading written into it. */
export function weekday(iso: string, lang: Lang = language()): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(lang), { weekday: "long", timeZone: "UTC" });
}

/** "30 Nov" / "30. Nov." for headings of the week view. */
export function shortDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export const dayHeading = (iso: string, lang: Lang) => `## ${iso} · ${weekday(iso, lang)}`;

/** An entry line; a generic servings word ("Portionen") is written in the language of the note. */
export function entryLine(target: string, servings: number | undefined, unit: string | undefined, lang: Lang): string {
  return `- [[${target}]]${servings ? ` · ${servings}${unit ? ` ${servingsUnitText(unit, servings, lang)}` : ""}` : ""}`;
}

/** One entry line of the plan note with where it is: its day, its exact text and which of the identical lines of that day it is. */
export interface PlanRow {
  date: string;
  /** The line as in the note. With `date` and `nth` it identifies the entry in an edit and in the page. */
  raw: string;
  /** Which of the identical lines `raw` under this day (in all its sections) this is, 0 for the first. */
  nth: number;
  /** Link target of the recipe note: file name without .md, a folder in front of it if the link has one. */
  target: string;
  servings?: number;
  /** The lines hanging below the entry (indented deeper), as written. */
  hanging: string[];
}

export const HEADING = /^#{1,2}\s/;
export const lineList = (text: string): string[] => text.split(/\r?\n/);
export const rowKey = (r: { date: string; raw: string; nth: number }): string => `${r.date}:${r.nth}:${r.raw}`;

/** All entry lines under day headings, in the order of the note. */
export function readPlanRows(text: string): PlanRow[] {
  const lines = lineList(text);
  const rows: PlanRow[] = [];
  const seen = new Map<string, number>();
  let date: string | undefined;
  lines.forEach((raw, n) => {
    const d = DAY.exec(raw);
    if (d) {
      date = d[1];
      return;
    }
    if (HEADING.test(raw)) {
      date = undefined;
      return;
    }
    const e = date && ENTRY.exec(raw);
    if (!date || !e) return;
    const id = `${date}\n${raw}`;
    const nth = seen.get(id) ?? 0;
    seen.set(id, nth + 1);
    const servings = readResult(e[2].replace(/^\s*[·:,-]\s*/, ""))?.count;
    rows.push({
      date,
      raw,
      nth,
      target: e[1].trim(),
      ...(servings ? { servings } : {}),
      hanging: lines.slice(
        n + 1,
        hangingEnd(lines, n, (l) => ENTRY.test(l)),
      ),
    });
  });
  return rows;
}

/** The plan by day (a day with two headings counts once). */
export function readPlan(text: string): PlanDay[] {
  const out: PlanDay[] = [];
  for (const r of readPlanRows(text)) {
    let day = out.find((d) => d.date === r.date);
    if (!day) out.push((day = { date: r.date, entries: [] }));
    day.entries.push({ target: r.target, ...(r.servings ? { servings: r.servings } : {}) });
  }
  return out;
}

/** Adds a recipe to a day; the day's heading is created in date order if missing. */
export function addToPlan(text: string, date: string, line: string, title: string, lang: Lang): string {
  const lines = text ? text.replace(/\r\n/g, "\n").replace(/\n+$/, "").split("\n") : [`# ${title}`];
  const at = lines.findIndex((l) => DAY.exec(l)?.[1] === date);
  if (at >= 0) {
    let end = at + 1;
    while (end < lines.length && !/^#{1,2}\s/.test(lines[end])) end++;
    // After the day's last non-empty line.
    let last = end - 1;
    while (last > at && !lines[last].trim()) last--;
    lines.splice(last + 1, 0, line);
    return `${lines.join("\n")}\n`;
  }
  const next = lines.findIndex((l) => {
    const d = DAY.exec(l)?.[1];
    return !!d && d > date;
  });
  const block = [dayHeading(date, lang), line, ""];
  if (next >= 0) lines.splice(next, 0, ...block);
  else {
    if (lines[lines.length - 1].trim()) lines.push("");
    lines.push(...block);
  }
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

/** Entries planned from `start` for `count` days. */
export function plannedFrom(plan: PlanDay[], start: string, count = 7): PlanEntry[] {
  const want = new Set(days(start, count));
  return plan.filter((d) => want.has(d.date)).flatMap((d) => d.entries);
}

/** One all-day calendar event per planned recipe (iCalendar, RFC 5545) for an optional calendar import. */
export function planIcs(plan: PlanDay[], stamp: string): string {
  const esc = (s: string) => s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const events = plan.flatMap((d) =>
    d.entries.map((e, i) => {
      const day = d.date.replace(/-/g, "");
      const next = days(d.date, 2)[1].replace(/-/g, "");
      return [
        "BEGIN:VEVENT",
        `UID:${day}-${i}-${encodeURIComponent(e.target).slice(0, 60)}@better-cooking`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${day}`,
        `DTEND;VALUE=DATE:${next}`,
        `SUMMARY:${esc(e.target)}`,
        "END:VEVENT",
      ].join("\r\n");
    }),
  );
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Better Cooking//Meal plan//EN",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
