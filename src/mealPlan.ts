// Weekly meal plan (issue #11): one Markdown note with a heading per day and a link per planned recipe,
// readable and editable without the plugin:
//
//   ## 2026-11-30 · Montag
//   - [[Linsensuppe]] · 4 Portionen
//
// The ISO date first keeps the days sortable and readable in any language. Only day headings and their
// list lines are added; everything else stays as the user wrote it.
// Pure functions without Obsidian, tested in tests/mealPlan.test.ts.

import { locale } from "./i18n";
import { readResult } from "./quantities";

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

const DAY = /^##\s+(\d{4}-\d{2}-\d{2})\b/;
const ENTRY = /^\s*[-*]\s+(?:\[[ xX]\]\s+)?\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\](.*)$/;

/** ISO dates of `count` days starting at `start` (YYYY-MM-DD). */
export function days(start: string, count = 7): string[] {
  const [y, m, d] = start.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
}

export function weekday(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale(), { weekday: "long", timeZone: "UTC" });
}

export const dayHeading = (iso: string) => `## ${iso} · ${weekday(iso)}`;

export function entryLine(target: string, servings?: number, unit?: string): string {
  return `- [[${target}]]${servings ? ` · ${servings}${unit ? ` ${unit}` : ""}` : ""}`;
}

export function readPlan(text: string): PlanDay[] {
  const out: PlanDay[] = [];
  let day: PlanDay | undefined;
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const d = DAY.exec(line);
    if (d) {
      day = { date: d[1], entries: [] };
      out.push(day);
      continue;
    }
    if (/^#{1,2}\s/.test(line)) {
      day = undefined;
      continue;
    }
    const e = day && ENTRY.exec(line);
    if (day && e) {
      const servings = readResult(e[2].replace(/^\s*[·:,-]\s*/, ""))?.count;
      day.entries.push({ target: e[1].trim(), ...(servings ? { servings } : {}) });
    }
  }
  return out;
}

/** Adds a recipe to a day; the day's heading is created in date order if missing. */
export function addToPlan(text: string, date: string, line: string, title: string): string {
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
  const block = [dayHeading(date), line, ""];
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
