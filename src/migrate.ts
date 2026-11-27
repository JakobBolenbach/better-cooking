// Settings saved by versions up to 0.2.1 use German keys (ADR 0004). This maps them to the current keys,
// so existing installations keep their folder, processor, routine, repo and open jobs.
// Pure function without Obsidian, tested in tests/migrate.test.ts.

import type { Job, JobErrorKey } from "./types";
import type { Settings } from "./settings";
import type { ListRecipes, RecipeRecord } from "./listRecipes";
import { isSafeKey, hasOwn } from "./ownKeys";
import { LANGUAGE_SETTINGS, NOTE_LANG_SETTINGS, type LanguageSetting, type NoteLangSetting } from "./i18n";

const SETTINGS_KEYS: Record<string, keyof Settings> = {
  ordner: "folder",
  modus: "mode",
  beimStartOeffnen: "openOnStartup",
  liste: "list",
  weg: "processor",
  lokalZuerst: "readWebsitesLocally",
  zusatz: "extraProperties",
  auftraege: "jobs",
};

const JOB_KEYS: Record<string, keyof Job> = {
  eingabe: "input",
  art: "kind",
  schluessel: "key",
  seit: "since",
  weg: "processor",
  sitzung: "session",
  fehler: "error",
};

/**
 * Texts of known errors as earlier versions stored them (0.2.1 German, 0.3 to 0.5 English or German).
 * They become an error key, so they are shown in the interface language.
 */
const LEGACY_ERRORS: [RegExp, JobErrorKey][] = [
  [/^Nach \d+ Minuten kein Rezept angekommen\. Warum, steht im Lauf; sonst Sync prüfen\.$/, "noRecipeArrived"],
  [/^No recipe arrived after \d+ minutes\. The run shows why; otherwise check the sync\.$/, "noRecipeArrived"],
];

function legacyError(job: Record<string, unknown>): Record<string, unknown> {
  const key =
    typeof job.error === "string" ? LEGACY_ERRORS.find(([re]) => re.test(job.error as string))?.[1] : undefined;
  if (!key) return job;
  const { error: _text, ...rest } = job;
  return { ...rest, errorKey: key };
}

/** `retryOf` of a job as `{ job: string, note?: string }[]`; anything else (a foreign or damaged data.json) is dropped. */
function cleanRetryOf(job: Record<string, unknown>): Record<string, unknown> {
  if (!("retryOf" in job)) return job;
  const { retryOf, ...rest } = job;
  const ok = (Array.isArray(retryOf) ? retryOf : []).flatMap((o: unknown) =>
    isObject(o) && typeof o.job === "string" && o.job
      ? [{ job: o.job, ...(typeof o.note === "string" && o.note ? { note: o.note } : {}) }]
      : [],
  );
  return ok.length ? { ...rest, retryOf: ok } : rest;
}

function renameKeys(o: Record<string, unknown>, keys: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!isSafeKey(k)) continue;
    const neu = keys[k] ?? k;
    // A current key wins over an old one, should both be present.
    if (neu !== k && hasOwn(o, neu)) continue;
    out[neu] = v;
  }
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Remembered cover addresses: only plain http(s) addresses under note paths, nothing else survives. */
export function cleanCoverUrls(x: unknown): Record<string, string> {
  if (!isObject(x)) return {};
  return Object.fromEntries(
    Object.entries(x).filter(([path, url]) => isSafeKey(path) && typeof url === "string" && /^https?:\/\//i.test(url)),
  ) as Record<string, string>;
}

/** Remembered adds of recipes to lists: only well-formed records survive. */
export function cleanListRecipes(x: unknown): ListRecipes {
  if (!isObject(x)) return {};
  const lists = Object.entries(x).flatMap(([list, records]) => {
    if (!isSafeKey(list) || !isObject(records)) return [];
    const kept = Object.entries(records).flatMap(([path, rec]): [string, RecipeRecord][] => {
      if (!isSafeKey(path) || !isObject(rec) || !Array.isArray(rec.parts) || typeof rec.title !== "string") return [];
      const parts = rec.parts.filter(isObject).flatMap((p) =>
        typeof p.factor === "number" && p.factor > 0 && Array.isArray(p.skipped) && typeof p.sig === "string"
          ? [
              {
                factor: p.factor,
                skipped: p.skipped.filter((k): k is string => typeof k === "string"),
                sig: p.sig,
                ...(typeof p.count === "number" && p.count >= 1 ? { count: Math.floor(p.count) } : {}),
              },
            ]
          : [],
      );
      const at = typeof rec.at === "number" ? rec.at : 0;
      return parts.length
        ? [[path, { parts, title: rec.title, at, ...(rec.unsure === true ? { unsure: true } : {}) }]]
        : [];
    });
    return kept.length ? [[list, Object.fromEntries(kept)] as const] : [];
  });
  return Object.fromEntries(lists);
}

/** Saved settings in any version to the current shape (renamed keys, defaults for older installations). */
export function migrateSettings(raw: unknown): Partial<Settings> {
  if (!isObject(raw)) return {};
  const s = renameKeys(raw, SETTINGS_KEYS);
  if (Array.isArray(s.jobs))
    s.jobs = s.jobs.filter(isObject).map((j) => cleanRetryOf(legacyError(renameKeys(j, JOB_KEYS))));
  if ("coverUrls" in s) s.coverUrls = cleanCoverUrls(s.coverUrls);
  if ("listRecipes" in s) s.listRecipes = cleanListRecipes(s.listRecipes);
  // Installations from before the note format setting keep writing German notes (issue #1).
  if (!("noteFormat" in s)) s.noteFormat = "de";
  // Stored values stay (de, en); a value that is not a choice falls back to the default ("like the interface").
  if (!NOTE_LANG_SETTINGS.includes(s.noteFormat as NoteLangSetting)) delete s.noteFormat;
  if (!LANGUAGE_SETTINGS.includes(s.language as LanguageSetting)) delete s.language;
  return s;
}
