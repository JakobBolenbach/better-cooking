// Settings saved by versions up to 0.2.1 use German keys (ADR 0004). This maps them to the current keys,
// so existing installations keep their folder, processor, routine, repo and open jobs.
// Pure function without Obsidian, tested in tests/migrate.test.ts.

import type { Job } from "./types";
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

/** Saved settings in any version to the current shape (renamed keys, defaults for older installations). */
export function migrateSettings(raw: unknown): Partial<Settings> {
  if (!isObject(raw)) return {};
  const s = renameKeys(raw, SETTINGS_KEYS);
  if (Array.isArray(s.jobs)) s.jobs = s.jobs.filter(isObject).map((j) => renameKeys(j, JOB_KEYS));
  // Installations from before the note format setting keep writing German notes (issue #1).
  if (!("noteFormat" in s)) s.noteFormat = "de";
  return s;
}
