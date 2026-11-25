// Baut aus importierten Rezeptdaten eine Notiz im festen Format (docs/recipe-format.md) und einen sicheren Dateinamen.
// Reine Funktionen ohne Obsidian, getestet in tests/schemaorg.test.ts.
// Die Daten stammen von einer fremden Seite: Jede Zeile wird so entschärft, dass sie nur als Text erscheint
// (keine Einbettungen, Links auf Notizen, Überschriften oder Frontmatter aus der Seite).
import type { SchemaRezept } from "./schemaorg";
import { zusatzZeilen } from "./zusatz";

export interface NotizOptionen {
  /** Adresse der Seite ohne Tracking (aus erkenneQuelle). */
  quelle: string;
  /** Linkziel des gespeicherten Titelbilds, z. B. "Brot Titelbild.jpg"; ohne Bild undefined. */
  bild?: string;
  /** Heutiges Datum als YYYY-MM-DD. */
  heute: string;
  /** Zusätzliche Eigenschaften aus den Einstellungen (zusatzLesen), vor `erstellt` eingefügt. */
  zusatz?: [string, string][];
}

/** Dateiname ohne Endung: keine Zeichen, die Obsidian oder ein Dateisystem stören, höchstens 100 Zeichen. */
export function dateiname(titel: string): string {
  const n = titel
    .replace(/[\\/:*?"<>|#^[\]{}\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .slice(0, 100)
    .trim();
  return n || "Rezept";
}

/** Text aus der Seite als harmlose Markdown-Zeile: keine Einbettungen, Wikilinks, HTML oder Blockmarker am Anfang. */
export function entschaerfe(s: string): string {
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

function dauerText(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** "fertig", wenn Zutaten und Schritte da sind; "teilweise", wenn eins davon fehlt. */
export function importStand(r: SchemaRezept): "fertig" | "teilweise" {
  return r.zutaten.length && r.schritte.length ? "fertig" : "teilweise";
}

export function rezeptNotiz(r: SchemaRezept, o: NotizOptionen): string {
  const stand = importStand(r);
  const fehlt = [!r.zutaten.length && "Zutaten", !r.schritte.length && "Schritte"].filter(Boolean).join(" und ");
  const fm = [
    "---",
    "typ: rezept",
    "status: ausprobieren",
    `kategorie: ${r.kategorie ? yaml(r.kategorie) : ""}`,
    `quelle: ${yaml(o.quelle)}`,
    `bild: ${o.bild ? yaml(`[[${o.bild}]]`) : ""}`,
    `autor: ${r.autor ? yaml(r.autor) : ""}`,
    `ergebnis: ${r.ergebnis ? yaml(r.ergebnis) : ""}`,
    `zeit_aktiv: ${r.zeitAktiv ?? ""}`,
    `zeit_gesamt: ${r.zeitGesamt ?? ""}`,
    "bewertung:",
    "zuletzt_gemacht:",
    `import: ${stand}`,
    `import_fehler: ${stand === "teilweise" ? yaml(`Die Seite enthält keine ${fehlt}.`) : ""}`,
    ...zusatzZeilen(o.zusatz ?? []),
    `erstellt: ${o.heute}`,
    `aktualisiert: ${o.heute}`,
    "---",
  ];
  const kopf = [`# ${entschaerfe(r.titel).replace(/^\\/, "")}`, ""];
  if (o.bild) kopf.push(`![[${o.bild}]]`, "");
  if (r.beschreibung) kopf.push(entschaerfe(r.beschreibung), "");
  const eckdaten = [
    r.ergebnis && `**Ergebnis:** ${entschaerfe(r.ergebnis)}`,
    r.zeitAktiv && `**Aktiv:** ca. ${dauerText(r.zeitAktiv)}`,
    r.zeitGesamt && `**Gesamt:** ca. ${dauerText(r.zeitGesamt)}`,
  ].filter(Boolean);
  if (eckdaten.length) kopf.push(eckdaten.join(" · "), "");
  let host = o.quelle;
  try {
    host = new URL(o.quelle).hostname.replace(/^www\./, "");
  } catch {
    /* Adresse bleibt */
  }
  kopf.push(
    `Quelle: [${entschaerfe(host)}](${o.quelle.replace(/[()<>\s]/g, (c) => encodeURIComponent(c))})${r.autor ? `, ${entschaerfe(r.autor)}` : ""}`,
    "",
  );

  const teile = [
    ...fm,
    ...kopf,
    "## Zutaten",
    ...(r.zutaten.length ? r.zutaten.map((z) => `- ${entschaerfe(z)}`) : ["- "]),
    "",
    "## Schritte",
    ...(r.schritte.length
      ? r.schritte.map((s, i) => {
          const titel = s.titel ? `**${entschaerfe(s.titel).replace(/\*/g, "").replace(/:$/, "")}:** ` : "";
          return `${i + 1}. ${titel}${entschaerfe(s.text)}`;
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
  return teile.join("\n");
}
