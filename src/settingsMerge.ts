// Merging the settings in memory with data.json after another device (sync, Git) changed the file (issue #90).
// Pure functions without Obsidian, tested in tests/settingsMerge.test.ts.
import type { Job } from "./types";
import { DEFAULTS, type Settings } from "./settings";
import { migrateSettings } from "./migrate";

/** What this device removed since it loaded the file; without it a removal cannot be told from "never had it". */
export interface Removed {
  jobs: Set<string>;
  /** Note paths whose cover address was removed. */
  covers: Set<string>;
}

export const emptyRemoved = (): Removed => ({ jobs: new Set(), covers: new Set() });

/** Notes what a change of the settings removed (and forgets removals of what is there again). Changes `removed`. */
export function trackRemoved(removed: Removed, before: Settings, after: Settings): void {
  const jobIds = new Set(after.jobs.map((j) => j.id));
  for (const j of before.jobs) if (!jobIds.has(j.id)) removed.jobs.add(j.id);
  for (const id of jobIds) removed.jobs.delete(id);
  for (const p of Object.keys(before.coverUrls)) if (!(p in after.coverUrls)) removed.covers.add(p);
  for (const p of Object.keys(after.coverUrls)) removed.covers.delete(p);
}

/**
 * The settings after data.json changed on disk. `external` is the file as read, migrated and with defaults.
 * - Plain settings: the file wins (it is newer).
 * - `jobs`: union by ID. The file's version of a job wins; a job that only exists here stays (it is new here, or the
 *   other device never saw it); a job from the file that this device removed does not come back. A job removed on the
 *   other device but still here stays until this device removes it too (no tombstones in the file).
 * - `coverUrls`: union by note path; the file wins for a path in both; paths removed here do not come back.
 * - `cookingTapHintSeen`: seen on any device counts as seen.
 */
export function mergeExternalSettings(local: Settings, external: Settings, removed: Removed): Settings {
  const fromFile = external.jobs.filter((j) => !removed.jobs.has(j.id));
  const fileIds = new Set(external.jobs.map((j) => j.id));
  const jobs: Job[] = [...fromFile, ...local.jobs.filter((j) => !fileIds.has(j.id))];
  const coverUrls: Record<string, string> = { ...local.coverUrls };
  for (const [path, url] of Object.entries(external.coverUrls)) if (!removed.covers.has(path)) coverUrls[path] = url;
  return {
    ...external,
    jobs,
    coverUrls,
    cookingTapHintSeen: local.cookingTapHintSeen || external.cookingTapHintSeen,
  };
}

/** Same value whatever the order of the keys. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.entries(v)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, x]) => `${JSON.stringify(k)}:${stable(x)}`)
      .join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

/** Keys of the settings whose value differs. Empty: nothing to do (also for the file this device wrote itself). */
export function changedKeys(a: Settings, b: Settings): (keyof Settings)[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Settings>;
  return [...keys].filter((k) => stable(a[k]) !== stable(b[k]));
}

/**
 * Everything `onExternalSettingsChange` decides: `raw` is data.json as read. `changed`: keys whose value differs from
 * the settings in memory; `behind`: the file lacks something this device has (it should be written back).
 */
export function applyExternal(local: Settings, raw: unknown, removed: Removed) {
  const external: Settings = { ...DEFAULTS, ...migrateSettings(raw) };
  const settings = mergeExternalSettings(local, external, removed);
  return { settings, changed: changedKeys(local, settings), behind: changedKeys(external, settings).length > 0 };
}
