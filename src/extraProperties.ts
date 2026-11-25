// Extra properties for notes the plugin creates itself (setting "Zusätzliche Eigenschaften").
// Pure functions without Obsidian, tested in tests/extraProperties.test.ts.

import { tr } from "./i18n";
import { DEFAULT_FORMAT, ownFieldNames } from "./noteFormat";

export interface ExtraPropertiesResult {
  /** Valid pairs in input order, each name at most once (the first one wins). */
  properties: [string, string][];
  /** Readable hints about lines that were skipped. */
  hints: string[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * Reads lines "name: value". Empty lines and lines starting with # do not count.
 * `own`: fields recipeNote writes itself (German, English and own names); the setting must not override them.
 */
export function readExtraProperties(text: string, own = ownFieldNames(DEFAULT_FORMAT)): ExtraPropertiesResult {
  const properties: [string, string][] = [];
  const hints: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf(":");
    const name = (i < 0 ? line : line.slice(0, i)).trim();
    const value = i < 0 ? "" : line.slice(i + 1).trim();
    if (!NAME.test(name)) {
      hints.push(tr("extraInvalidName", { name: name.slice(0, 40) }));
      continue;
    }
    if (own.includes(name)) {
      hints.push(tr("extraOwnField", { name }));
      continue;
    }
    if (seen.has(name)) {
      hints.push(tr("extraDuplicate", { name }));
      continue;
    }
    seen.add(name);
    properties.push([name, value]);
  }
  return { properties, hints };
}

/** Frontmatter lines; values are always quoted, so the setting cannot inject YAML. */
export function extraPropertyLines(properties: [string, string][]): string[] {
  return properties.map(([n, w]) => (w ? `${n}: ${JSON.stringify(w.replace(/[\r\n]+/g, " "))}` : `${n}:`));
}

/** Read recipe websites in the plugin or hand them to the processor: without a processor, always read them here. */
export function readPageLocally(readWebsitesLocally: boolean, hasProcessor: boolean): boolean {
  return readWebsitesLocally || !hasProcessor;
}
