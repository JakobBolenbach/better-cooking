// Extra properties for notes the plugin creates itself (setting "Zusätzliche Eigenschaften").
// Pure functions without Obsidian, tested in tests/extraProperties.test.ts.

import { tr } from "./i18n";

/** Fields that recipeNote writes itself; the setting must not override them. */
export const OWN_FIELDS = [
  "typ",
  "status",
  "kategorie",
  "quelle",
  "bild",
  "autor",
  "ergebnis",
  "zeit_aktiv",
  "zeit_gesamt",
  "bewertung",
  "zuletzt_gemacht",
  "import",
  "import_fehler",
  "erstellt",
  "aktualisiert",
] as const;

export interface ExtraPropertiesResult {
  /** Valid pairs in input order, each name at most once (the first one wins). */
  properties: [string, string][];
  /** Readable hints about lines that were skipped. */
  hints: string[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Reads lines "name: value". Empty lines and lines starting with # do not count. */
export function readExtraProperties(text: string): ExtraPropertiesResult {
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
    if ((OWN_FIELDS as readonly string[]).includes(name)) {
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
