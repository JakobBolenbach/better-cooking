// Liest schema.org-Rezeptdaten (JSON-LD) aus dem HTML einer Rezeptseite, ohne KI und ohne fremden Dienst.
// Reine Funktionen ohne Obsidian und ohne DOM, getestet in tests/schemaorg.test.ts.
// Die Seite ist nicht vertrauenswürdig (SECURITY.md): Werte sind nur Daten, Texte werden von HTML befreit,
// und alles bleibt in der festen Struktur von SchemaRezept.

export interface SchemaRezept {
  titel: string;
  beschreibung?: string;
  autor?: string;
  kategorie?: string;
  /** Ausbeute wie auf der Seite, z. B. "4 Portionen" oder "1 Kuchen". */
  ergebnis?: string;
  /** Minuten Arbeitszeit (prepTime). */
  zeitAktiv?: number;
  /** Minuten insgesamt (totalTime, sonst prepTime + cookTime). */
  zeitGesamt?: number;
  zutaten: string[];
  schritte: { titel?: string; text: string }[];
  /** Absolute http(s)-Adressen der Bilder, das erste ist das Titelbild. */
  bilder: string[];
}

type Json = unknown;
type Objekt = Record<string, Json>;

const istObjekt = (x: Json): x is Objekt => typeof x === "object" && x !== null && !Array.isArray(x);
const alsListe = (x: Json): Json[] => (Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]);

/** Findet das erste Recipe-Objekt in den JSON-LD-Blöcken der Seite; null, wenn es keins gibt. */
export function findeRezeptJsonLd(html: string): Objekt | null {
  const block = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (let m = block.exec(html); m; m = block.exec(html)) {
    let daten: Json;
    try {
      daten = JSON.parse(m[1].trim().replace(/^<!--|-->$/g, ""));
    } catch {
      continue;
    }
    const r = sucheRezept(daten, 0);
    if (r) return verweiseAufloesen(r, idVerzeichnis(daten));
  }
  return null;
}

/** Alle Objekte mit "@id" im Block (WordPress/Yoast verweist aus dem Rezept auf Bild und Autor in @graph). */
function idVerzeichnis(x: Json, v = new Map<string, Objekt>(), tiefe = 0): Map<string, Objekt> {
  if (tiefe > 6) return v;
  if (Array.isArray(x)) x.forEach((e) => idVerzeichnis(e, v, tiefe + 1));
  else if (istObjekt(x)) {
    if (typeof x["@id"] === "string" && Object.keys(x).length > 1 && !v.has(x["@id"])) v.set(x["@id"], x);
    for (const k of Object.keys(x)) if (k !== "@id") idVerzeichnis(x[k], v, tiefe + 1);
  }
  return v;
}

/** Ersetzt reine Verweise ({"@id": …}) in den Feldern des Rezepts durch das Objekt, eine Ebene tief. */
function verweiseAufloesen(r: Objekt, v: Map<string, Objekt>): Objekt {
  const ersetze = (x: Json): Json => {
    if (Array.isArray(x)) return x.map(ersetze);
    if (istObjekt(x) && typeof x["@id"] === "string" && Object.keys(x).length === 1) return v.get(x["@id"]) ?? x;
    return x;
  };
  const aus: Objekt = {};
  for (const [k, wert] of Object.entries(r)) aus[k] = ersetze(wert);
  return aus;
}

/** Vorschaubild der Seite (og:image), wenn das Rezept selbst keins nennt. */
export function findeVorschaubild(html: string, seite: string): string | undefined {
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/(property|name)\s*=\s*["']?(og:image|og:image:url|twitter:image)["'\s>]/i.test(tag)) continue;
    const inhalt = /content\s*=\s*("([^"]*)"|'([^']*)')/i.exec(tag);
    const roh = inhalt?.[2] ?? inhalt?.[3];
    if (!roh) continue;
    const url = bilder(entitaeten(roh), seite)[0];
    if (url) return url;
  }
  return undefined;
}

function istRezeptTyp(o: Objekt): boolean {
  return alsListe(o["@type"]).some((t) => typeof t === "string" && /(^|[/:])Recipe$/i.test(t));
}

function sucheRezept(x: Json, tiefe: number): Objekt | null {
  if (tiefe > 6) return null;
  if (Array.isArray(x)) {
    for (const e of x) {
      const r = sucheRezept(e, tiefe + 1);
      if (r) return r;
    }
    return null;
  }
  if (!istObjekt(x)) return null;
  if (istRezeptTyp(x)) return x;
  for (const k of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const r = sucheRezept(x[k], tiefe + 1);
    if (r) return r;
  }
  return null;
}

/** Wandelt ein Recipe-Objekt in die feste Struktur; `seite` ist die Adresse der Seite (für relative Bildpfade). */
export function rezeptAusSchema(o: Objekt, seite: string): SchemaRezept {
  const prep = dauerMinuten(o.prepTime);
  const cook = dauerMinuten(o.cookTime);
  const total = dauerMinuten(o.totalTime) ?? (prep !== undefined && cook !== undefined ? prep + cook : undefined);
  return {
    titel: einzeilig(text(o.name)) || "Rezept",
    beschreibung: einzeilig(text(o.description)) || undefined,
    autor: namen(o.author),
    kategorie:
      einzeilig(
        alsListe(o.recipeCategory)
          .map((k) => text(k))
          .filter(Boolean)[0] ?? "",
      ) || undefined,
    ergebnis: ausbeute(o.recipeYield ?? o.yield),
    zeitAktiv: prep,
    zeitGesamt: total,
    zutaten: alsListe(o.recipeIngredient ?? o.ingredients)
      .map((z) => einzeilig(text(z)))
      .filter(Boolean),
    schritte: schritte(o.recipeInstructions),
    bilder: bilder(o.image, seite),
  };
}

/** ISO-8601-Dauer (PT1H30M, P0DT0H20M, PT90M) in Minuten; undefined, wenn nicht lesbar oder 0. */
export function dauerMinuten(x: Json): number | undefined {
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

function ausbeute(x: Json): string | undefined {
  const werte = alsListe(x)
    .map((v) => (typeof v === "number" ? String(v) : einzeilig(text(v))))
    .filter(Boolean);
  // Oft steht dieselbe Angabe zweimal da ("4", "4 Portionen"): die mit Wort nehmen.
  const mitWort = werte.find((v) => /\d/.test(v) && /\p{L}/u.test(v));
  let wert = mitWort ?? werte[0];
  if (!wert) return undefined;
  // Englische Angaben in die Form bringen, die der Portionenrechner liest ("Serves 4" → "4 Portionen").
  const en = /^(serves|servings?|yields?|makes)[:\s]+(\d+(?:[.,]\d+)?)\s*(.*)$/i.exec(wert);
  if (en) wert = `${en[2]} ${en[3] || (/^makes/i.test(en[1]) ? "Stück" : "Portionen")}`.trim();
  return /^\d+(?:[.,]\d+)?$/.test(wert) ? `${wert} Portionen` : wert;
}

function namen(x: Json): string | undefined {
  const n = alsListe(x)
    .map((a) => (istObjekt(a) ? text(a.name) : text(a)))
    .map(einzeilig)
    .filter(Boolean);
  return n.length ? n.join(", ") : undefined;
}

function schritte(x: Json): { titel?: string; text: string }[] {
  const aus: { titel?: string; text: string }[] = [];
  const nimm = (s: Json, tiefe: number) => {
    if (tiefe > 4) return;
    if (typeof s === "string") {
      // Ein Textblock: an Zeilen teilen, eigene Nummern am Zeilenanfang entfernen (die Liste nummeriert neu).
      for (const zeile of text(s, true).split(/\n+/)) {
        const z = einzeilig(zeile).replace(/^\d{1,2}[.)]\s+/, "");
        if (z) aus.push({ text: z });
      }
      return;
    }
    if (Array.isArray(s)) return s.forEach((e) => nimm(e, tiefe + 1));
    if (!istObjekt(s)) return;
    if (alsListe(s["@type"]).includes("HowToSection") || s.itemListElement !== undefined)
      return nimm(s.itemListElement, tiefe + 1);
    const t = einzeilig(text(s.text ?? s.description ?? ""));
    const n = einzeilig(text(s.name ?? ""));
    if (!t && !n) return;
    // Viele Seiten setzen name = text oder name = Anfang von text: dann kein eigener Titel.
    const titel = n && t && !t.startsWith(n.replace(/[.…]+$/, "")) && n.length <= 60 ? n : undefined;
    aus.push({ titel, text: t || n });
  };
  nimm(x, 0);
  return aus;
}

function bilder(x: Json, seite: string): string[] {
  const urls: string[] = [];
  for (const b of alsListe(x)) {
    const roh = typeof b === "string" ? b : istObjekt(b) ? (b.url ?? b.contentUrl) : undefined;
    if (typeof roh !== "string") continue;
    try {
      const u = new URL(roh.trim(), seite);
      if ((u.protocol === "https:" || u.protocol === "http:") && !urls.includes(u.href)) urls.push(u.href);
    } catch {
      /* keine gültige Adresse */
    }
  }
  return urls;
}

// ---------------------------------------------------------------- Text

const ENTITAETEN: Record<string, string> = {
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

function entitaeten(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (ganz, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return ENTITAETEN[e] ?? ganz;
  });
}

const OHNE_TAGS = (s: string) => s.replace(/<[^>]*>/g, " ");

/** Text aus einem JSON-Wert: HTML-Tags weg, Entitäten aufgelöst (auch doppelt kodierte). */
function text(x: Json, zeilenBehalten = false): string {
  if (typeof x === "number") return String(x);
  if (typeof x !== "string") return "";
  let s = x.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, "\n");
  s = OHNE_TAGS(entitaeten(OHNE_TAGS(s)));
  if (!zeilenBehalten) s = s.replace(/\s+/g, " ");
  return s;
}

function einzeilig(s: string): string {
  return s
    .replace(/[\p{Cc}\p{Cf}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
