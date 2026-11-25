// Zusätzliche Eigenschaften für Notizen, die das Plugin selbst anlegt (Einstellung "Zusätzliche Eigenschaften").
// Reine Funktionen ohne Obsidian, getestet in tests/zusatz.test.ts.

/** Felder, die rezeptNotiz selbst schreibt; die Einstellung darf sie nicht überschreiben. */
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
  /** Gültige Paare in der Reihenfolge der Eingabe, jeder Name höchstens einmal (der erste gilt). */
  properties: [string, string][];
  /** Lesbare Hinweise zu Zeilen, die übergangen wurden. */
  hints: string[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Liest Zeilen "name: wert". Leere Zeilen und Zeilen mit # am Anfang zählen nicht. */
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
      hints.push(`„${name.slice(0, 40)}“ ist kein gültiger Name (Buchstaben, Ziffern, _ und -).`);
      continue;
    }
    if ((OWN_FIELDS as readonly string[]).includes(name)) {
      hints.push(`„${name}“ schreibt Better Cooking selbst.`);
      continue;
    }
    if (seen.has(name)) {
      hints.push(`„${name}“ steht mehrfach da, die erste Zeile gilt.`);
      continue;
    }
    seen.add(name);
    properties.push([name, value]);
  }
  return { properties, hints };
}

/** Frontmatter-Zeilen; Werte immer in Anführungszeichen, damit kein YAML aus der Einstellung entsteht. */
export function extraPropertyLines(properties: [string, string][]): string[] {
  return properties.map(([n, w]) => (w ? `${n}: ${JSON.stringify(w.replace(/[\r\n]+/g, " "))}` : `${n}:`));
}

/** Rezeptseiten im Plugin lesen oder an den Verarbeiter geben: ohne Verarbeiter immer selbst lesen. */
export function readPageLocally(readWebsitesLocally: boolean, hasProcessor: boolean): boolean {
  return readWebsitesLocally || !hasProcessor;
}
