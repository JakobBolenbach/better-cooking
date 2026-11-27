// Builds a note in the fixed format (docs/recipe-format.md) and a safe file name from imported recipe data.
// Pure functions without Obsidian, tested in tests/schemaorg.test.ts.
// The data comes from a third-party page: every line is defused so that it appears as text only
// (no embeds, links to notes, headings or frontmatter from the page).
import { hostOf } from "./source";
import { cleanTitle, escapeStart, unescapeLead } from "./lineEscape";
import type { SchemaRecipe } from "./schemaorg";
import { extraPropertyLines } from "./extraProperties";
import { fingerprints, formatHash } from "./fingerprint";
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
  /** The recipe comes from pasted text or a caption, not from a page: the hint about missing parts says "text". */
  fromText?: boolean;
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
    .replace(/\s*[\r\n\t\u2028\u2029]+\s*/g, " ")
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
  return escapeStart(t);
}

/** Quoted value for YAML (JSON strings are valid YAML). */
export const yaml = (s: string) => JSON.stringify(s.replace(/[\r\n]+/g, " "));

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
  return r.ingredients.length && r.steps.length && !r.truncated?.length ? "fertig" : "teilweise";
}

/** Title or group name for a bold prefix: defused like text, without the protective backslash, `*` and colon. */
const boldTitle = (s: string) => cleanTitle(unescapeLead(defuse(s)));

/** The line under the description: yield and times; undefined if there are none. */
export function keyFactsLine(
  r: { result?: string; timeActive?: number; timeTotal?: number },
  lang: NoteLang,
): string | undefined {
  const w = NOTE_WORDS[lang];
  const facts = [
    r.result && `**${w.yield}:** ${defuse(r.result)}`,
    r.timeActive && `**${w.active}:** ${w.about} ${durationText(r.timeActive, lang)}`,
    r.timeTotal && `**${w.total}:** ${w.about} ${durationText(r.timeTotal, lang)}`,
  ].filter(Boolean);
  return facts.length ? facts.join(" · ") : undefined;
}

/** The line formats of the list sections; `recipeNote` and the recipe editor (src/sectionDiff.ts) write them alike. */
export const bulletLine = (text: string) => `- ${text}`;
export const groupLine = (title: string) => `**${title}**`;
export const stepLine = (n: number, step: { title?: string; text: string }) =>
  `${n}. ${step.title ? `**${step.title}:** ` : ""}${step.text}`;

export function recipeNote(r: SchemaRecipe, o: NoteOptions): string {
  const f = o.format ?? DEFAULT_FORMAT;
  const k = f.fields;
  const w = NOTE_WORDS[f.lang];
  const state = importState(r);
  const missing = [!r.ingredients.length && w.ingredients, !r.steps.length && w.steps]
    .filter(Boolean)
    .join(` ${w.and} `);
  const cut = (r.truncated ?? []).map((p) => w[p]).join(", ");
  const reason = missing
    ? (o.fromText ? w.missingText : w.missing).replace("{what}", f.lang === "en" ? missing.toLowerCase() : missing)
    : w.cut.replace("{what}", cut);
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
    `${k.importError}: ${state === "teilweise" ? yaml(reason) : ""}`,
    ...extraPropertyLines(o.extraProperties ?? []),
    `${k.created}: ${o.today}`,
    `${k.updated}: ${o.today}`,
    "---",
  ];
  const header = [`# ${defuse(r.title).replace(/^\\/, "")}`, ""];
  if (o.image) header.push(`![[${o.image}]]`, "");
  if (r.description) header.push(defuse(r.description), "");
  const keyFacts = keyFactsLine(r, f.lang);
  if (keyFacts) header.push(keyFacts, "");
  if (o.source) {
    const host = hostOf(o.source, o.source);
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
          ...(g.title ? [...(i ? [""] : []), groupLine(boldTitle(g.title))] : []),
          ...g.ingredients.map((z) => bulletLine(defuse(z))),
        ])
      : r.ingredients.length
        ? r.ingredients.map((z) => bulletLine(defuse(z)))
        : ["- "]),
    "",
    `## ${w.steps}`,
    ...(r.steps.length
      ? r.steps.map((s, i) => stepLine(i + 1, { title: s.title && boldTitle(s.title), text: defuse(s.text) }))
      : ["1. "]),
    "",
    ...(r.tips?.length ? [`## ${w.tips}`, ...r.tips.map((t) => bulletLine(defuse(t))), ""] : []),
    `## ${w.attempts}`,
    ATTEMPTS_HINT[f.lang],
    "",
    `## ${w.notes}`,
    "- ",
    "",
  ];
  // The fingerprint of the note as it is written (ADR 0006), read back like every later reading of it.
  const hashes = fingerprints(parts.join("\n"), f.fields);
  const at = parts.findIndex((l) => l.startsWith(`${k.importError}:`));
  if (at > 0) parts.splice(at + 1, 0, `${k.importHash}: ${formatHash(hashes)}`);
  return parts.join("\n");
}
