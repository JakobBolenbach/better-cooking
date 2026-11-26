// UI language: English by default, German when Obsidian runs in German (issue #2).
// Strings live in src/strings/ (one file per language), not in the components. Pure module without Obsidian; main.ts sets the language on load.
// Translations are looked up when text is shown, never at import time, so module constants hold keys, not text.

import { de, type Key } from "./strings/de";
import { en } from "./strings/en";

export type Lang = "en" | "de";

export type { Key };

const STRINGS: Record<Lang, Record<Key, string>> = { de, en };
let current: Lang = "en";

/** Obsidian language code (e.g. "de", "en", "de-AT") to a supported language; unknown → English. */
export function toLang(code: string | null | undefined): Lang {
  return (code ?? "").toLowerCase().startsWith("de") ? "de" : "en";
}

export function setLanguage(code: string | null | undefined): void {
  current = toLang(code);
}

export function language(): Lang {
  return current;
}

/** Text for a key in the current language; `{name}` placeholders are filled from vars. */
export function tr(key: Key, vars?: Record<string, string | number>): string {
  const s = STRINGS[current][key] ?? de[key] ?? key;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Locale for dates and times in the UI. */
export function locale(): string {
  return current === "de" ? "de-DE" : "en-GB";
}

/** Date YYYY-MM-DD for display, e.g. "24.11.2026" or "24 Nov 2026"; other input as it is. */
export function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  if (current === "de") return `${m[3]}.${m[2]}.${m[1]}`;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
