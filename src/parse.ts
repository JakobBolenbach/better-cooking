// Liest eine Rezeptnotiz (fester Aufbau aus dem Skill rezept) in das Datenmodell.
// Reine Funktionen ohne Obsidian, deshalb mit Vitest testbar.
import { readResult } from "./quantities";
import type { Recipe, Step, Status, Attempt, IngredientGroup } from "./types";

type Fm = Record<string, string | string[]>;

/** Kleines Frontmatter-Lesen: `key: wert`, Listen mit `  - x`, Anführungszeichen. Reicht für die Rezeptfelder. */
export function readFrontmatter(text: string): { fm: Fm; bodyText: string } {
  const t = text.replace(/\r\n/g, "\n");
  if (!t.startsWith("---\n")) return { fm: {}, bodyText: t };
  // Ab Index 3 suchen, damit auch leeres Frontmatter ("---\n---") erkannt wird.
  const end = t.indexOf("\n---", 3);
  if (end < 0) return { fm: {}, bodyText: t };
  const fm: Fm = {};
  let list: string | null = null;
  for (const line of t.slice(4, end).split("\n")) {
    const li = /^\s*-\s+(.*)$/.exec(line);
    if (li && list) {
      (fm[list] as string[]).push(unquote(li[1]));
      continue;
    }
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (!m) continue;
    const value = m[2].trim();
    if (value === "") {
      fm[m[1]] = [];
      list = m[1];
    } else if (value.startsWith("[") && value.endsWith("]") && !value.startsWith("[[")) {
      fm[m[1]] = value
        .slice(1, -1)
        .split(",")
        .map((s) => unquote(s.trim()))
        .filter(Boolean);
      list = null;
    } else {
      fm[m[1]] = unquote(value);
      list = null;
    }
  }
  return { fm, bodyText: t.slice(end + 4).replace(/^\n+/, "") };
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return t;
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const number = (v: string | string[] | undefined) => {
  const s = str(v);
  if (!s) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Linkziel aus `![[Ziel]]`, `[[Ziel]]` oder `![[Ziel|Breite]]`. */
export const linkTarget = (s: string | undefined) => {
  if (!s) return undefined;
  const m = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/.exec(s);
  return m ? m[1].trim() : undefined;
};

const STATUS: Status[] = ["ausprobieren", "bewaehrt", "verworfen"];

/**
 * Englische Abschnittsnamen und gängige Varianten, auf den deutschen Schlüssel abgebildet (docs/recipe-format.md).
 * Notizen dürfen beide Sprachen mischen; geschrieben wird weiter mit den deutschen Namen.
 */
const SECTION_ALIASES: Record<string, string> = {
  ingredients: "zutaten",
  steps: "schritte",
  instructions: "schritte",
  directions: "schritte",
  method: "schritte",
  zubereitung: "schritte",
  tips: "tipps",
  notes: "notizen",
  attempts: "versuche",
  images: "bilder",
  photos: "bilder",
  timeline: "ablauf",
};

/** Schlüssel eines Abschnitts: klein geschrieben, englische Namen auf die deutschen abgebildet. */
export const sectionKey = (heading: string) => {
  const k = heading.trim().toLowerCase();
  return SECTION_ALIASES[k] ?? k;
};

/** Abschnitte nach `## Überschrift` (Schlüssel über abschnittSchluessel). */
function sections(bodyText: string): { header: string[]; parts: Map<string, string[]> } {
  const header: string[] = [];
  const parts = new Map<string, string[]>();
  let current: string[] = header;
  for (const line of bodyText.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(line);
    if (h && !line.startsWith("###")) {
      current = [];
      const key = sectionKey(h[1]);
      // Gibt es denselben Abschnitt zweimal (z. B. "Zutaten" und "Ingredients"), zählt der erste.
      if (!parts.has(key)) parts.set(key, current);
      continue;
    }
    current.push(line);
  }
  return { header, parts };
}

const notEmpty = (s: string) => s.replace(/^[-*]\s*/, "").trim() !== "";
const withoutHint = (z: string) => !z.trim().startsWith(">");

function bulletList(lines: string[] | undefined): string[] {
  if (!lines) return [];
  const out: string[] = [];
  for (const z of lines.filter(withoutHint)) {
    const m = /^\s*[-*]\s+(?:\[[ xX/-]\]\s+)?(.*)$/.exec(z);
    if (m) {
      if (m[1].trim()) out.push(m[1].trim());
    } else if (z.trim() && out.length && /^\s{2,}/.test(z)) {
      out[out.length - 1] += " " + z.trim();
    }
  }
  return out;
}

function ingredients(lines: string[] | undefined): IngredientGroup[] {
  if (!lines) return [];
  const groups: IngredientGroup[] = [];
  let g: IngredientGroup = { ingredients: [] };
  for (const z of lines.filter(withoutHint)) {
    const title = /^\s*\*\*(.+?)\*\*\s*:?\s*$/.exec(z) ?? /^\s*###\s+(.+)$/.exec(z);
    if (title) {
      if (g.ingredients.length || g.title) groups.push(g);
      g = { title: title[1].replace(/:$/, "").trim(), ingredients: [] };
      continue;
    }
    const m = /^\s*[-*]\s+(?:\[[ xX/-]\]\s+)?(.*)$/.exec(z);
    if (m && m[1].trim()) g.ingredients.push(m[1].trim());
  }
  if (g.ingredients.length || g.title) groups.push(g);
  return groups.filter((x) => x.ingredients.length);
}

function steps(lines: string[] | undefined): Step[] {
  if (!lines) return [];
  const out: Step[] = [];
  for (const z of lines.filter(withoutHint)) {
    const m = /^\s*\d+[.)]\s+(.*)$/.exec(z);
    if (m) {
      const t = m[1].trim();
      const bold = /^\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(t);
      if (bold) out.push({ title: bold[1].replace(/:$/, "").trim(), text: bold[2].trim() });
      else out.push({ text: t });
    } else if (z.trim() && out.length && !/^#/.test(z.trim()) && !/^!\[\[/.test(z.trim())) {
      out[out.length - 1].text += " " + z.trim();
    }
  }
  return out;
}

function attempts(lines: string[] | undefined): Attempt[] {
  if (!lines) return [];
  const out: Attempt[] = [];
  for (const z of lines.filter(withoutHint)) {
    const h = /^###\s+(.+)$/.exec(z.trim());
    if (h) {
      out.push({ date: h[1].trim(), lines: [] });
      continue;
    }
    const m = /^\s*[-*]\s+(.*)$/.exec(z);
    if (m && m[1].trim() && out.length) out[out.length - 1].lines.push(m[1].trim());
  }
  return out.filter((v) => v.lines.length || v.date);
}

function embeds(lines: string[] | undefined): string[] {
  if (!lines) return [];
  return lines.map((z) => (/^\s*!\[\[/.test(z) ? linkTarget(z) : undefined)).filter((x): x is string => !!x);
}

export function parseRecipe(path: string, text: string, modified = 0): Recipe {
  const { fm, bodyText } = readFrontmatter(text);
  const { header, parts } = sections(bodyText);
  const name = path.split("/").pop()!.replace(/\.md$/i, "");
  const h1 = header.find((z) => /^#\s+/.test(z));
  const title = h1 ? h1.replace(/^#\s+/, "").trim() : name;

  // Beschreibung: erster Absatz im Kopf, der kein Bild, keine Eckdaten- oder Quellenzeile und kein Hinweis ist.
  const paragraph: string[] = [];
  for (const z of header) {
    const t = z.trim();
    if (!t) {
      if (paragraph.length) break;
      continue;
    }
    if (
      /^#\s/.test(t) ||
      /^!\[\[/.test(t) ||
      /^>/.test(t) ||
      /^\*\*(Ergebnis|Aktiv|Gesamt|Yield|Servings|Active|Total)/.test(t) ||
      /^(Quelle|Source):/i.test(t)
    ) {
      if (paragraph.length) break;
      continue;
    }
    paragraph.push(t);
  }

  const headerImage = embeds(header).find((b) => !/\.svg$/i.test(b));
  const status = str(fm.status) as Status | undefined;
  const timeline = embeds(parts.get("ablauf")).find((b) => /\.svg$/i.test(b));
  const result = str(fm.ergebnis);
  const servingsNumber = number(fm.portionen);
  const fromResult = readResult(result);
  return {
    path,
    name,
    title,
    status: status && STATUS.includes(status) ? status : "ausprobieren",
    category: str(fm.kategorie),
    source: str(fm.quelle),
    author: str(fm.autor),
    result,
    servings: servingsNumber ? { count: servingsNumber, unit: fromResult?.unit ?? "Portionen" } : fromResult,
    timeActive: number(fm.zeit_aktiv),
    timeTotal: number(fm.zeit_gesamt),
    rating: number(fm.bewertung),
    lastMade: str(fm.zuletzt_gemacht),
    importState: str(fm.import),
    importError: str(fm.import_fehler),
    job: str(fm.auftrag),
    created: str(fm.erstellt),
    image: linkTarget(str(fm.bild)) ?? headerImage,
    timeline,
    images: [...embeds(parts.get("bilder")), ...embeds(parts.get("bilder aus dem import"))],
    description: paragraph.length ? paragraph.join(" ") : undefined,
    ingredients: ingredients(parts.get("zutaten")),
    steps: steps(parts.get("schritte")),
    tips: bulletList(parts.get("tipps")).filter(notEmpty),
    attempts: attempts(parts.get("versuche")),
    notes: bulletList(parts.get("notizen")).filter(notEmpty),
    modified,
  };
}

/** Datum „heute“ als YYYY-MM-DD bzw. TT.MM.JJJJ in Europe/Berlin (Gerätezeit). */
export function todayIso(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const isoToGerman = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

/**
 * Neuen Versuch oben unter `## Versuche` einfügen (nach einem einleitenden Hinweis `> …`).
 * Fehlt der Abschnitt, wird er vor `## Notizen` bzw. am Ende angelegt.
 */
export function insertAttempt(
  text: string,
  v: { date: string; modified?: string; result?: string; rating?: number },
): string {
  const block = [`### ${v.date}`];
  if (v.modified?.trim()) block.push(`- Geändert: ${singleLine(v.modified)}`);
  if (v.result?.trim()) block.push(`- Ergebnis: ${singleLine(v.result)}`);
  if (v.rating) block.push(`- Bewertung: ${v.rating}/5`);
  if (block.length === 1) block.push("- Gemacht");
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const start = lines.findIndex((z) => /^##\s+(Versuche|Attempts)\s*$/i.test(z));
  if (start < 0) {
    const notes = lines.findIndex((z) => /^##\s+(Notizen|Notes)\s*$/i.test(z));
    const fresh = ["## Versuche", ...block, ""];
    if (notes >= 0) lines.splice(notes, 0, ...fresh);
    else lines.push("", ...fresh);
    return lines.join("\n");
  }
  let i = start + 1;
  while (i < lines.length && (lines[i].trim() === "" || lines[i].trim().startsWith(">"))) i++;
  // Einfügestelle: nach Hinweis und Leerzeilen, vor dem ersten bisherigen Versuch bzw. dem nächsten Abschnitt.
  lines.splice(i, 0, ...block, "");
  // Genau eine Leerzeile zwischen Hinweis und neuem Block.
  if (lines[i - 1]?.trim() !== "") lines.splice(i, 0, "");
  return lines.join("\n");
}

const singleLine = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
