// Settings saved by versions up to 0.2.1 use German keys (ADR 0004). This maps them to the current keys,
// so existing installations keep their folder, processor, routine, repo and open jobs.
// Pure function without Obsidian, tested in tests/migrate.test.ts.

import type { Job, JobErrorKey } from "./types";
import type { Settings } from "./settings";

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

function renameKeys(o: Record<string, unknown>, keys: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    const neu = keys[k] ?? k;
    // A current key wins over an old one, should both be present.
    if (neu !== k && neu in o) continue;
    out[neu] = v;
  }
  return out;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Remembered cover addresses: only plain http(s) addresses under note paths, nothing else survives. */
export function cleanCoverUrls(x: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isObject(x)) return out;
  for (const [path, url] of Object.entries(x))
    if (typeof url === "string" && /^https?:\/\//i.test(url)) out[path] = url;
  return out;
}

/** Saved settings in any version to the current shape (renamed keys, defaults for older installations). */
export function migrateSettings(raw: unknown): Partial<Settings> {
  if (!isObject(raw)) return {};
  const s = renameKeys(raw, SETTINGS_KEYS);
  if (Array.isArray(s.jobs)) s.jobs = s.jobs.filter(isObject).map((j) => legacyError(renameKeys(j, JOB_KEYS)));
  if ("coverUrls" in s) s.coverUrls = cleanCoverUrls(s.coverUrls);
  // Installations from before the note format setting keep writing German notes (issue #1).
  if (!("noteFormat" in s)) s.noteFormat = "de";
  return s;
}
