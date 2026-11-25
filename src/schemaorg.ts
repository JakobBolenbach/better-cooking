// Liest schema.org-Rezeptdaten (JSON-LD) aus dem HTML einer Rezeptseite, ohne KI und ohne fremden Dienst.
// Reine Funktionen ohne Obsidian und ohne DOM, getestet in tests/schemaorg.test.ts.
// Die Seite ist nicht vertrauenswürdig (SECURITY.md): Werte sind nur Daten, Texte werden von HTML befreit,
// und alles bleibt in der festen Struktur von SchemaRezept.

export interface SchemaRecipe {
  title: string;
  description?: string;
  author?: string;
  category?: string;
  /** Ausbeute wie auf der Seite, z. B. "4 Portionen" oder "1 Kuchen". */
  result?: string;
  /** Minuten Arbeitszeit (prepTime). */
  timeActive?: number;
  /** Minuten insgesamt (totalTime, sonst prepTime + cookTime). */
  timeTotal?: number;
  ingredients: string[];
  steps: { title?: string; text: string }[];
  /** Absolute http(s)-Adressen der Bilder, das erste ist das Titelbild. */
  images: string[];
}

type Json = unknown;
type Obj = Record<string, Json>;

const isObject = (x: Json): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const asList = (x: Json): Json[] => (Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]);

/** Findet das erste Recipe-Objekt in den JSON-LD-Blöcken der Seite; null, wenn es keins gibt. */
export function findRecipeJsonLd(html: string): Obj | null {
  const block = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (let m = block.exec(html); m; m = block.exec(html)) {
    let data: Json;
    try {
      data = JSON.parse(m[1].trim().replace(/^<!--|-->$/g, ""));
    } catch {
      continue;
    }
    const r = searchRecipes(data, 0);
    if (r) return resolveLinks(r, idIndex(data));
  }
  return null;
}

/** Alle Objekte mit "@id" im Block (WordPress/Yoast verweist aus dem Rezept auf Bild und Autor in @graph). */
function idIndex(x: Json, v = new Map<string, Obj>(), depth = 0): Map<string, Obj> {
  if (depth > 6) return v;
  if (Array.isArray(x)) x.forEach((e) => idIndex(e, v, depth + 1));
  else if (isObject(x)) {
    if (typeof x["@id"] === "string" && Object.keys(x).length > 1 && !v.has(x["@id"])) v.set(x["@id"], x);
    for (const k of Object.keys(x)) if (k !== "@id") idIndex(x[k], v, depth + 1);
  }
  return v;
}

/** Ersetzt reine Verweise ({"@id": …}) in den Feldern des Rezepts durch das Objekt, eine Ebene tief. */
function resolveLinks(r: Obj, v: Map<string, Obj>): Obj {
  const replace = (x: Json): Json => {
    if (Array.isArray(x)) return x.map(replace);
    if (isObject(x) && typeof x["@id"] === "string" && Object.keys(x).length === 1) return v.get(x["@id"]) ?? x;
    return x;
  };
  const off: Obj = {};
  for (const [k, value] of Object.entries(r)) off[k] = replace(value);
  return off;
}

/** Vorschaubild der Seite (og:image), wenn das Rezept selbst keins nennt. */
export function findPreviewImage(html: string, page: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(property|name)\s*=\s*["']?(og:image|og:image:url|twitter:image)["'\s>]/i.test(tag)) continue;
    const content = /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const raw = content?.[2] ?? content?.[3];
    if (!raw) continue;
    const url = images(entities(raw), page)[0];
    if (url) return url;
  }
  return undefined;
}

function isRecipeType(o: Obj): boolean {
  return asList(o["@type"]).some((t) => typeof t === "string" && /(^|[/:])Recipe$/i.test(t));
}

function searchRecipes(x: Json, depth: number): Obj | null {
  if (depth > 6) return null;
  if (Array.isArray(x)) {
    for (const e of x) {
      const r = searchRecipes(e, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isObject(x)) return null;
  if (isRecipeType(x)) return x;
  for (const k of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const r = searchRecipes(x[k], depth + 1);
    if (r) return r;
  }
  return null;
}

/** Wandelt ein Recipe-Objekt in die feste Struktur; `seite` ist die Adresse der Seite (für relative Bildpfade). */
export function recipeFromSchema(o: Obj, page: string): SchemaRecipe {
  const prep = durationMinutes(o.prepTime);
  const cook = durationMinutes(o.cookTime);
  const total = durationMinutes(o.totalTime) ?? (prep !== undefined && cook !== undefined ? prep + cook : undefined);
  return {
    title: singleLine(text(o.name)) || "Rezept",
    description: singleLine(text(o.description)) || undefined,
    author: names(o.author),
    category:
      singleLine(
        asList(o.recipeCategory)
          .map((k) => text(k))
          .filter(Boolean)[0] ?? "",
      ) || undefined,
    result: yieldText(o.recipeYield ?? o.yield),
    timeActive: prep,
    timeTotal: total,
    ingredients: asList(o.recipeIngredient ?? o.ingredients)
      .map((z) => singleLine(text(z)))
      .filter(Boolean),
    steps: steps(o.recipeInstructions),
    images: images(o.image, page),
  };
}

/** ISO-8601-Dauer (PT1H30M, P0DT0H20M, PT90M) in Minuten; undefined, wenn nicht lesbar oder 0. */
export function durationMinutes(x: Json): number | undefined {
  if (typeof x !== "string") return undefined;
  const m =
    /^P(?:(\d+(?:[.,]\d+)?)D)?(?:T(?:(\d+(?:[.,]\d+)?)H)?(?:(\d+(?:[.,]\d+)?)M)?(?:(\d+(?:[.,]\d+)?)S)?)?$/i.exec(
      x.trim(),
    );
  if (!m) return undefined;
  const z = (s?: string) => (s ? Number(s.replace(",", ".")) : 0);
  const min = Math.round(z(m[1]) * 1440 + z(m[2]) * 60 + z(m[3]) + z(m[4]) / 60);
  return min > 0 ? min : undefined;
}

function yieldText(x: Json): string | undefined {
  const values = asList(x)
    .map((v) => (typeof v === "number" ? String(v) : singleLine(text(v))))
    .filter(Boolean);
  // Oft steht dieselbe Angabe zweimal da ("4", "4 Portionen"): die mit Wort nehmen.
  const withWord = values.find((v) => /\d/.test(v) && /\p{L}/u.test(v));
  let value = withWord ?? values[0];
  if (!value) return undefined;
  // Englische Angaben in die Form bringen, die der Portionenrechner liest ("Serves 4" → "4 Portionen").
  const en = /^(serves|servings?|yields?|makes)[:\s]+(\d+(?:[.,]\d+)?)\s*(.*)$/i.exec(value);
  if (en) value = `${en[2]} ${en[3] || (/^makes/i.test(en[1]) ? "Stück" : "Portionen")}`.trim();
  return /^\d+(?:[.,]\d+)?$/.test(value) ? `${value} Portionen` : value;
}

function names(x: Json): string | undefined {
  const n = asList(x)
    .map((a) => (isObject(a) ? text(a.name) : text(a)))
    .map(singleLine)
    .filter(Boolean);
  return n.length ? n.join(", ") : undefined;
}

function steps(x: Json): { title?: string; text: string }[] {
  const off: { title?: string; text: string }[] = [];
  const take = (s: Json, depth: number) => {
    if (depth > 4) return;
    if (typeof s === "string") {
      // Ein Textblock: an Zeilen teilen, eigene Nummern am Zeilenanfang entfernen (die Liste nummeriert neu).
      for (const line of text(s, true).split(/\n+/)) {
        const z = singleLine(line).replace(/^\d{1,2}[.)]\s+/, "");
        if (z) off.push({ text: z });
      }
      return;
    }
    if (Array.isArray(s)) return s.forEach((e) => take(e, depth + 1));
    if (!isObject(s)) return;
    if (asList(s["@type"]).includes("HowToSection") || s.itemListElement !== undefined)
      return take(s.itemListElement, depth + 1);
    const t = singleLine(text(s.text ?? s.description ?? ""));
    const n = singleLine(text(s.name ?? ""));
    if (!t && !n) return;
    // Viele Seiten setzen name = text oder name = Anfang von text: dann kein eigener Titel.
    const title = n && t && !t.startsWith(n.replace(/[.…]+$/, "")) && n.length <= 60 ? n : undefined;
    off.push({ title, text: t || n });
  };
  take(x, 0);
  return off;
}

function images(x: Json, page: string): string[] {
  const urls: string[] = [];
  for (const b of asList(x)) {
    const raw = typeof b === "string" ? b : isObject(b) ? (b.url ?? b.contentUrl) : undefined;
    if (typeof raw !== "string") continue;
    try {
      const u = new URL(raw.trim(), page);
      if ((u.protocol === "https:" || u.protocol === "http:") && !urls.includes(u.href)) urls.push(u.href);
    } catch {
      /* keine gültige Adresse */
    }
  }
  return urls;
}

// ---------------------------------------------------------------- Text

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  auml: "ä",
  ouml: "ö",
  uuml: "ü",
  Auml: "Ä",
  Ouml: "Ö",
  Uuml: "Ü",
  szlig: "ß",
  eacute: "é",
  egrave: "è",
  agrave: "à",
  ccedil: "ç",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  deg: "°",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  laquo: "«",
  raquo: "»",
  bdquo: "„",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  sbquo: "‚",
  times: "×",
  middot: "·",
  shy: "",
};

function entities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (whole, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITIES[e] ?? whole;
  });
}

const WITHOUT_TAGS = (s: string) => s.replace(/<[^>]*>/g, " ");

/** Text aus einem JSON-Wert: HTML-Tags weg, Entitäten aufgelöst (auch doppelt kodierte). */
function text(x: Json, keepLines = false): string {
  if (typeof x === "number") return String(x);
  if (typeof x !== "string") return "";
  let s = x.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n");
  s = WITHOUT_TAGS(entities(WITHOUT_TAGS(s)));
  if (!keepLines) s = s.replace(/\s+/g, " ");
  return s;
}

function singleLine(s: string): string {
  return s
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
