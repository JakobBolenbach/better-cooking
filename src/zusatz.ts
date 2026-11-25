// Zusätzliche Eigenschaften für Notizen, die das Plugin selbst anlegt (Einstellung "Zusätzliche Eigenschaften").
// Reine Funktionen ohne Obsidian, getestet in tests/zusatz.test.ts.

/** Felder, die rezeptNotiz selbst schreibt; die Einstellung darf sie nicht überschreiben. */
export const EIGENE_FELDER = [
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

export interface ZusatzErgebnis {
  /** Gültige Paare in der Reihenfolge der Eingabe, jeder Name höchstens einmal (der erste gilt). */
  eigenschaften: [string, string][];
  /** Lesbare Hinweise zu Zeilen, die übergangen wurden. */
  hinweise: string[];
}

const NAME = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/** Liest Zeilen "name: wert". Leere Zeilen und Zeilen mit # am Anfang zählen nicht. */
export function zusatzLesen(text: string): ZusatzErgebnis {
  const eigenschaften: [string, string][] = [];
  const hinweise: string[] = [];
  const gesehen = new Set<string>();
  for (const roh of text.split(/\r?\n/)) {
    const zeile = roh.trim();
    if (!zeile || zeile.startsWith("#")) continue;
    const i = zeile.indexOf(":");
    const name = (i < 0 ? zeile : zeile.slice(0, i)).trim();
    const wert = i < 0 ? "" : zeile.slice(i + 1).trim();
    if (!NAME.test(name)) {
      hinweise.push(`„${name.slice(0, 40)}“ ist kein gültiger Name (Buchstaben, Ziffern, _ und -).`);
      continue;
    }
    if ((EIGENE_FELDER as readonly string[]).includes(name)) {
      hinweise.push(`„${name}“ schreibt Better Cooking selbst.`);
      continue;
    }
    if (gesehen.has(name)) {
      hinweise.push(`„${name}“ steht mehrfach da, die erste Zeile gilt.`);
      continue;
    }
    gesehen.add(name);
    eigenschaften.push([name, wert]);
  }
  return { eigenschaften, hinweise };
}

/** Frontmatter-Zeilen; Werte immer in Anführungszeichen, damit kein YAML aus der Einstellung entsteht. */
export function zusatzZeilen(eigenschaften: [string, string][]): string[] {
  return eigenschaften.map(([n, w]) => (w ? `${n}: ${JSON.stringify(w.replace(/[\r\n]+/g, " "))}` : `${n}:`));
}

/** Rezeptseiten im Plugin lesen oder an den Verarbeiter geben: ohne Verarbeiter immer selbst lesen. */
export function seiteSelbstLesen(lokalZuerst: boolean, verarbeiterDa: boolean): boolean {
  return lokalZuerst || !verarbeiterDa;
}
