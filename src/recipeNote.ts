// Baut aus importierten Rezeptdaten eine Notiz im festen Format (docs/recipe-format.md) und einen sicheren Dateinamen.
// Reine Funktionen ohne Obsidian, getestet in tests/schemaorg.test.ts.
// Die Daten stammen von einer fremden Seite: Jede Zeile wird so entschärft, dass sie nur als Text erscheint
// (keine Einbettungen, Links auf Notizen, Überschriften oder Frontmatter aus der Seite).
import type { SchemaRecipe } from "./schemaorg";
import { extraPropertyLines } from "./extraProperties";

export interface NoteOptions {
  /** Adresse der Seite ohne Tracking (aus erkenneQuelle). */
  source: string;
  /** Linkziel des gespeicherten Titelbilds, z. B. "Brot Titelbild.jpg"; ohne Bild undefined. */
  image?: string;
  /** Heutiges Datum als YYYY-MM-DD. */
  today: string;
  /** Zusätzliche Eigenschaften aus den Einstellungen (zusatzLesen), vor `erstellt` eingefügt. */
  extraProperties?: [string, string][];
}

/** Dateiname ohne Endung: keine Zeichen, die Obsidian oder ein Dateisystem stören, höchstens 100 Zeichen. */
export function fileName(title: string): string {
  const n = title
    .replace(/[\\/:*?"<>|#^[\]{}\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .slice(0, 100)
    .trim();
  return n || "Rezept";
}

/** Text aus der Seite als harmlose Markdown-Zeile: keine Einbettungen, Wikilinks, HTML oder Blockmarker am Anfang. */
export function defuse(s: string): string {
  let t = s
    .replace(/[\r\n]+/g, " ")
    .replace(/\[\[/g, "[​[")
    .replace(/\]\]/g, "]​]")
    // Kein "<" direkt vor einem Buchstaben: sonst könnte Obsidian ein HTML-Tag daraus machen.
    .replace(/<(?=[a-z!/?])/gi, "< ")
    .trim();
  // Am Zeilenanfang würden diese Zeichen eine Überschrift, ein Zitat, eine Liste, eine Tabelle oder Code beginnen.
  if (/^([#>|`~*+=-]|\d+[.)]\s)/.test(t)) t = `\\${t}`;
  return t;
}

/** Wert für YAML in Anführungszeichen (JSON-Strings sind gültiges YAML). */
const yaml = (s: string) => JSON.stringify(s.replace(/[\r\n]+/g, " "));

function durationText(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** "fertig", wenn Zutaten und Schritte da sind; "teilweise", wenn eins davon fehlt. */
export function importState(r: SchemaRecipe): "fertig" | "teilweise" {
  return r.ingredients.length && r.steps.length ? "fertig" : "teilweise";
}

export function recipeNote(r: SchemaRecipe, o: NoteOptions): string {
  const state = importState(r);
  const missing = [!r.ingredients.length && "Zutaten", !r.steps.length && "Schritte"].filter(Boolean).join(" und ");
  const fm = [
    "---",
    "typ: rezept",
    "status: ausprobieren",
    `kategorie: ${r.category ? yaml(r.category) : ""}`,
    `quelle: ${yaml(o.source)}`,
    `bild: ${o.image ? yaml(`[[${o.image}]]`) : ""}`,
    `autor: ${r.author ? yaml(r.author) : ""}`,
    `ergebnis: ${r.result ? yaml(r.result) : ""}`,
    `zeit_aktiv: ${r.timeActive ?? ""}`,
    `zeit_gesamt: ${r.timeTotal ?? ""}`,
    "bewertung:",
    "zuletzt_gemacht:",
    `import: ${state}`,
    `import_fehler: ${state === "teilweise" ? yaml(`Die Seite enthält keine ${missing}.`) : ""}`,
    ...extraPropertyLines(o.extraProperties ?? []),
    `erstellt: ${o.today}`,
    `aktualisiert: ${o.today}`,
    "---",
  ];
  const header = [`# ${defuse(r.title).replace(/^\\/, "")}`, ""];
  if (o.image) header.push(`![[${o.image}]]`, "");
  if (r.description) header.push(defuse(r.description), "");
  const keyFacts = [
    r.result && `**Ergebnis:** ${defuse(r.result)}`,
    r.timeActive && `**Aktiv:** ca. ${durationText(r.timeActive)}`,
    r.timeTotal && `**Gesamt:** ca. ${durationText(r.timeTotal)}`,
  ].filter(Boolean);
  if (keyFacts.length) header.push(keyFacts.join(" · "), "");
  let host = o.source;
  try {
    host = new URL(o.source).hostname.replace(/^www\./, "");
  } catch {
    /* Adresse bleibt */
  }
  header.push(
    `Quelle: [${defuse(host)}](${o.source.replace(/[()<>\s]/g, (c) => encodeURIComponent(c))})${r.author ? `, ${defuse(r.author)}` : ""}`,
    "",
  );

  const parts = [
    ...fm,
    ...header,
    "## Zutaten",
    ...(r.ingredients.length ? r.ingredients.map((z) => `- ${defuse(z)}`) : ["- "]),
    "",
    "## Schritte",
    ...(r.steps.length
      ? r.steps.map((s, i) => {
          const title = s.title ? `**${defuse(s.title).replace(/\*/g, "").replace(/:$/, "")}:** ` : "";
          return `${i + 1}. ${title}${defuse(s.text)}`;
        })
      : ["1. "]),
    "",
    "## Versuche",
    "> Neueste oben: `### TT.MM.JJJJ`, was geändert, Ergebnis, Bewertung 1 bis 5.",
    "",
    "## Notizen",
    "- ",
    "",
  ];
  return parts.join("\n");
}
