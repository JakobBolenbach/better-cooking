// Builds a note in the fixed format (docs/recipe-format.md) and a safe file name from imported recipe data.
// Pure functions without Obsidian, tested in tests/schemaorg.test.ts.
// The data comes from a third-party page: every line is defused so that it appears as text only
// (no embeds, links to notes, headings or frontmatter from the page).
import type { SchemaRecipe } from "./schemaorg";
import { extraPropertyLines } from "./extraProperties";

export interface NoteOptions {
  /** Address of the page without tracking (from detectSource). */
  source: string;
  /** Link target of the saved cover image, e.g. "Brot Titelbild.jpg"; undefined without an image. */
  image?: string;
  /** Today's date as YYYY-MM-DD. */
  today: string;
  /** Extra properties from the settings (readExtraProperties), inserted before `erstellt`. */
  extraProperties?: [string, string][];
}

/** File name without extension: no characters that bother Obsidian or a file system, at most 100 characters. */
export function fileName(title: string): string {
  const n = title
    .replace(/[\\/:*?"<>|#^[\]{}\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .slice(0, 100)
    .trim();
  return n || "Rezept";
}

/** Text from the page as a harmless Markdown line: no embeds, wikilinks, HTML or block markers at the start. */
export function defuse(s: string): string {
  let t = s
    .replace(/[\r\n]+/g, " ")
    .replace(/\[\[/g, "[​[")
    .replace(/\]\]/g, "]​]")
    // No "<" right before a letter: Obsidian could otherwise turn it into an HTML tag.
    .replace(/<(?=[a-z!/?])/gi, "< ")
    .trim();
  // At the start of a line these characters would begin a heading, quote, list, table or code.
  if (/^([#>|`~*+=-]|\d+[.)]\s)/.test(t)) t = `\\${t}`;
  return t;
}

/** Quoted value for YAML (JSON strings are valid YAML). */
const yaml = (s: string) => JSON.stringify(s.replace(/[\r\n]+/g, " "));

function durationText(min: number): string {
  if (min < 60) return `${min} Min.`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
}

/** "fertig" if ingredients and steps are present; "teilweise" if one of them is missing. */
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
