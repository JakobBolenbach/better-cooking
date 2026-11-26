// Builds a note in the fixed format (docs/recipe-format.md) and a safe file name from imported recipe data.
// Pure functions without Obsidian, tested in tests/schemaorg.test.ts.
// The data comes from a third-party page: every line is defused so that it appears as text only
// (no embeds, links to notes, headings or frontmatter from the page).
import type { SchemaRecipe } from "./schemaorg";
import { extraPropertyLines } from "./extraProperties";
import { DEFAULT_FORMAT, NOTE_WORDS, importValue, statusValue, type NoteFormat, type NoteLang } from "./noteFormat";

export interface NoteOptions {
  /** Address of the page without tracking (from detectSource); none for pasted text. */
  source?: string;
  /** Link target of the saved cover image, e.g. "Brot Titelbild.jpg"; undefined without an image. */
  image?: string;
  /** Today's date as YYYY-MM-DD. */
  today: string;
  /** Extra properties from the settings (readExtraProperties), inserted before `created`. */
  extraProperties?: [string, string][];
  /** Field names and language of the note (setting "Note format"); German by default. */
  format?: NoteFormat;
  /** For a translation (issue #10): link target of the original note and the language of this one. */
  translationOf?: string;
  language?: string;
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
    // No Markdown links (they could point to obsidian:// or javascript:) and no inline code (Dataview queries).
    .replace(/\]\(/g, "]\\(")
    .replace(/`/g, "\\`")
    // Addresses that trigger actions (obsidian://, javascript: …) stay text, even where Obsidian would link them.
    .replace(/\b(obsidian|javascript|vbscript|data|file):/gi, "$1\u200b:")
    // No "<" right before a letter (HTML tag) or "%" (Templater command).
    .replace(/<(?=[a-z!/?%])/gi, "< ")
    .trim();
  // At the start of a line these characters would begin a heading, quote, list, table or code.
  if (/^([#>|`~*+=-]|\d+[.)]\s)/.test(t)) t = `\\${t}`;
  return t;
}

/** Quoted value for YAML (JSON strings are valid YAML). */
const yaml = (s: string) => JSON.stringify(s.replace(/[\r\n]+/g, " "));

function durationText(min: number, lang: NoteLang): string {
  const [mi, hr] = lang === "de" ? ["Min.", "Std."] : ["min", "h"];
  if (min < 60) return `${min} ${mi}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} ${hr} ${m} ${mi}` : `${h} ${hr}`;
}

const ATTEMPTS_HINT: Record<NoteLang, string> = {
  de: "> Neueste oben: `### TT.MM.JJJJ`, was geändert, Ergebnis, Bewertung 1 bis 5.",
  en: "> Newest first: `### DD.MM.YYYY`, what changed, result, rating 1 to 5.",
};

/** "fertig" if ingredients and steps are present; "teilweise" if one of them is missing. */
export function importState(r: SchemaRecipe): "fertig" | "teilweise" {
  return r.ingredients.length && r.steps.length ? "fertig" : "teilweise";
}

export function recipeNote(r: SchemaRecipe, o: NoteOptions): string {
  const f = o.format ?? DEFAULT_FORMAT;
  const k = f.fields;
  const w = NOTE_WORDS[f.lang];
  const state = importState(r);
  const missing = [!r.ingredients.length && w.ingredients, !r.steps.length && w.steps]
    .filter(Boolean)
    .join(` ${w.and} `);
  const fm = [
    "---",
    `${k.type}: ${w.type}`,
    `${k.status}: ${statusValue(f, "ausprobieren")}`,
    ...(o.translationOf ? [`${k.translationOf}: ${yaml(`[[${o.translationOf}]]`)}`] : []),
    ...(o.language ? [`${k.language}: ${yaml(o.language)}`] : []),
    `${k.category}: ${r.category ? yaml(r.category) : ""}`,
    `${k.source}: ${o.source ? yaml(o.source) : ""}`,
    `${k.image}: ${o.image ? yaml(`[[${o.image}]]`) : ""}`,
    `${k.author}: ${r.author ? yaml(r.author) : ""}`,
    `${k.yield}: ${r.result ? yaml(r.result) : ""}`,
    `${k.timeActive}: ${r.timeActive ?? ""}`,
    `${k.timeTotal}: ${r.timeTotal ?? ""}`,
    `${k.rating}:`,
    `${k.lastMade}:`,
    `${k.importState}: ${importValue(f, state)}`,
    `${k.importError}: ${state === "teilweise" ? yaml(w.missing.replace("{what}", missing)) : ""}`,
    ...extraPropertyLines(o.extraProperties ?? []),
    `${k.created}: ${o.today}`,
    `${k.updated}: ${o.today}`,
    "---",
  ];
  const header = [`# ${defuse(r.title).replace(/^\\/, "")}`, ""];
  if (o.image) header.push(`![[${o.image}]]`, "");
  if (r.description) header.push(defuse(r.description), "");
  const keyFacts = [
    r.result && `**${w.yield}:** ${defuse(r.result)}`,
    r.timeActive && `**${w.active}:** ${w.about} ${durationText(r.timeActive, f.lang)}`,
    r.timeTotal && `**${w.total}:** ${w.about} ${durationText(r.timeTotal, f.lang)}`,
  ].filter(Boolean);
  if (keyFacts.length) header.push(keyFacts.join(" · "), "");
  if (o.source) {
    let host = o.source;
    try {
      host = new URL(o.source).hostname.replace(/^www\./, "");
    } catch {
      /* address stays */
    }
    header.push(
      `${w.source}: [${defuse(host)}](${o.source.replace(/[()<>\s]/g, (c) => encodeURIComponent(c))})${r.author ? `, ${defuse(r.author)}` : ""}`,
      "",
    );
  }

  const parts = [
    ...fm,
    ...header,
    `## ${w.ingredients}`,
    ...(r.ingredientGroups?.length
      ? r.ingredientGroups.flatMap((g, i) => [
          ...(g.title ? [...(i ? [""] : []), `**${defuse(g.title).replace(/\*/g, "")}**`] : []),
          ...g.ingredients.map((z) => `- ${defuse(z)}`),
        ])
      : r.ingredients.length
        ? r.ingredients.map((z) => `- ${defuse(z)}`)
        : ["- "]),
    "",
    `## ${w.steps}`,
    ...(r.steps.length
      ? r.steps.map((s, i) => {
          const title = s.title ? `**${defuse(s.title).replace(/\*/g, "").replace(/:$/, "")}:** ` : "";
          return `${i + 1}. ${title}${defuse(s.text)}`;
        })
      : ["1. "]),
    "",
    ...(r.tips?.length ? [`## ${w.tips}`, ...r.tips.map((t) => `- ${defuse(t)}`), ""] : []),
    `## ${w.attempts}`,
    ATTEMPTS_HINT[f.lang],
    "",
    `## ${w.notes}`,
    "- ",
    "",
  ];
  return parts.join("\n");
}
