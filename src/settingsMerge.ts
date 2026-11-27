// Merging the settings in memory with data.json after another device (sync, Git) changed the file (issue #90).
// Three-way merge with the last state of the file this device read or wrote as the base. Pure functions without
// Obsidian, tested in tests/settingsMerge.test.ts.
import { DEFAULTS, type Settings } from "./settings";
import { migrateSettings } from "./migrate";
import { safeKey } from "./safeKey";
import { buildListRecipes } from "./listRecipes";

/** Same value whatever the order of the keys; `undefined` fields count as missing (JSON roundtrip). */
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

export const same = (a: unknown, b: unknown) => stable(a) === stable(b);

/** One value: changed only here since the base: this device wins; otherwise (also changed on both sides) the file. */
function pick<T>(base: T | undefined, local: T | undefined, file: T | undefined): T | undefined {
  return !same(local, base) && same(file, base) ? local : file;
}

/**
 * A collection of items with an ID (jobs by `id`, cover addresses by note path), file order first, then what is new here.
 * - in the base but not in the file: removed elsewhere, falls away here too;
 * - in the base but not here: removed here, stays away (the file still has it until it is written);
 * - new here since the base: stays; new in the file: comes in;
 * - in both: like `pick` (changed only here: here; otherwise the file).
 */
function mergeItems<T>(base: Map<string, T>, local: Map<string, T>, file: Map<string, T>): [string, T][] {
  const out: [string, T][] = [];
  for (const [id, f] of file) {
    if (!local.has(id)) {
      if (!base.has(id)) out.push([id, f]);
    } else out.push([id, pick(base.get(id), local.get(id), f) as T]);
  }
  for (const [id, l] of local) if (!file.has(id) && !base.has(id)) out.push([id, l]);
  return out;
}

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((i) => [i.id, i]));

/**
 * The settings after data.json changed on disk (`file`: as read, migrated, with defaults), against `base`, the state
 * of the file this device last read or wrote.
 * - Plain settings: changed only here since the base: here (and written back); changed in the file, or on both sides:
 *   the file (the other device saved later).
 * - `jobs` by ID, `coverUrls` by note path and `listRecipes` by list and recipe note path: see `mergeItems`.
 * - `cookingTapHintSeen` and `timerPhoneHintSeen`: seen on any device counts as seen.
 */
export function merge3(base: Settings, local: Settings, file: Settings): Settings {
  const out: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(file)]) as Set<keyof Settings>;
  for (const k of keys) if (safeKey(k)) out[k] = pick(base[k], local[k], file[k]);
  out.jobs = mergeItems(byId(base.jobs), byId(local.jobs), byId(file.jobs)).map(([, j]) => j);
  out.coverUrls = Object.fromEntries(
    mergeItems(
      new Map(Object.entries(base.coverUrls)),
      new Map(Object.entries(local.coverUrls)),
      new Map(Object.entries(file.coverUrls)),
    ),
  );
  // Recipes on lists by list and recipe note, like the cover addresses.
  const flat = (x: Settings["listRecipes"]) =>
    new Map(
      Object.entries(x).flatMap(([list, rs]) => Object.entries(rs).map(([r, v]) => [`${list}\n${r}`, v] as const)),
    );
  out.listRecipes = buildListRecipes(
    mergeItems(flat(base.listRecipes), flat(local.listRecipes), flat(file.listRecipes)).map(([id, v]) => {
      const [list, recipe] = id.split("\n");
      return [list, [[recipe, v]]];
    }),
  );
  out.cookingTapHintSeen = local.cookingTapHintSeen || file.cookingTapHintSeen;
  out.timerPhoneHintSeen = local.timerPhoneHintSeen || file.timerPhoneHintSeen;
  return out as unknown as Settings;
}

/** Keys of the settings whose value differs. Empty: nothing to do (also for the file this device wrote itself). */
export function changedKeys(a: Settings, b: Settings): (keyof Settings)[] {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof Settings>;
  return [...keys].filter((k) => !same(a[k], b[k]));
}

/**
 * Everything `onExternalSettingsChange` decides; `raw` is data.json as read. Null: nothing to do (no usable file:
 * missing, empty, not an object). `changed`: keys whose value differs from the settings in memory; `behind`: the
 * result differs from the file, so it should be written back.
 */
export function applyExternal(base: Settings, local: Settings, raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !Object.keys(raw).length) return null;
  const file: Settings = { ...DEFAULTS, ...migrateSettings(raw) };
  const settings = merge3(base, local, file);
  return { settings, changed: changedKeys(local, settings), behind: changedKeys(file, settings).length > 0 };
}
