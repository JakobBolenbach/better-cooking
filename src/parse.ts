// Liest eine Rezeptnotiz (fester Aufbau aus dem Skill rezept) in das Datenmodell.
// Reine Funktionen ohne Obsidian, deshalb mit Vitest testbar.
import { leseErgebnis } from "./mengen";
import type { Rezept, Schritt, Status, Versuch, Zutatengruppe } from "./types";

type Fm = Record<string, string | string[]>;

/** Kleines Frontmatter-Lesen: `key: wert`, Listen mit `  - x`, Anführungszeichen. Reicht für die Rezeptfelder. */
export function leseFrontmatter(text: string): { fm: Fm; rumpf: string } {
  const t = text.replace(/\r\n/g, "\n");
  if (!t.startsWith("---\n")) return { fm: {}, rumpf: t };
  // Ab Index 3 suchen, damit auch leeres Frontmatter ("---\n---") erkannt wird.
  const ende = t.indexOf("\n---", 3);
  if (ende < 0) return { fm: {}, rumpf: t };
  const fm: Fm = {};
  let liste: string | null = null;
  for (const zeile of t.slice(4, ende).split("\n")) {
    const li = /^\s*-\s+(.*)$/.exec(zeile);
    if (li && liste) {
      (fm[liste] as string[]).push(entquote(li[1]));
      continue;
    }
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(zeile);
    if (!m) continue;
    const wert = m[2].trim();
    if (wert === "") {
      fm[m[1]] = [];
      liste = m[1];
    } else if (wert.startsWith("[") && wert.endsWith("]") && !wert.startsWith("[[")) {
      fm[m[1]] = wert
        .slice(1, -1)
        .split(",")
        .map((s) => entquote(s.trim()))
        .filter(Boolean);
      liste = null;
    } else {
      fm[m[1]] = entquote(wert);
      liste = null;
    }
  }
  return { fm, rumpf: t.slice(ende + 4).replace(/^\n+/, "") };
}

function entquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return t;
}

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const zahl = (v: string | string[] | undefined) => {
  const s = str(v);
  if (!s) return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Linkziel aus `![[Ziel]]`, `[[Ziel]]` oder `![[Ziel|Breite]]`. */
export const linkZiel = (s: string | undefined) => {
  if (!s) return undefined;
  const m = /\[\[([^\]|#]+)(?:[#|][^\]]*)?\]\]/.exec(s);
  return m ? m[1].trim() : undefined;
};

const STATUS: Status[] = ["ausprobieren", "bewaehrt", "verworfen"];

/**
 * Englische Abschnittsnamen und gängige Varianten, auf den deutschen Schlüssel abgebildet (docs/recipe-format.md).
 * Notizen dürfen beide Sprachen mischen; geschrieben wird weiter mit den deutschen Namen.
 */
const ABSCHNITT_ALIAS: Record<string, string> = {
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
export const abschnittSchluessel = (ueberschrift: string) => {
  const k = ueberschrift.trim().toLowerCase();
  return ABSCHNITT_ALIAS[k] ?? k;
};

/** Abschnitte nach `## Überschrift` (Schlüssel über abschnittSchluessel). */
function abschnitte(rumpf: string): { kopf: string[]; teile: Map<string, string[]> } {
  const kopf: string[] = [];
  const teile = new Map<string, string[]>();
  let aktuell: string[] = kopf;
  for (const zeile of rumpf.split("\n")) {
    const h = /^##\s+(.+?)\s*$/.exec(zeile);
    if (h && !zeile.startsWith("###")) {
      aktuell = [];
      const schluessel = abschnittSchluessel(h[1]);
      // Gibt es denselben Abschnitt zweimal (z. B. "Zutaten" und "Ingredients"), zählt der erste.
      if (!teile.has(schluessel)) teile.set(schluessel, aktuell);
      continue;
    }
    aktuell.push(zeile);
  }
  return { kopf, teile };
}

const nichtLeer = (s: string) => s.replace(/^[-*]\s*/, "").trim() !== "";
const ohneHinweis = (z: string) => !z.trim().startsWith(">");

function aufzaehlung(zeilen: string[] | undefined): string[] {
  if (!zeilen) return [];
  const out: string[] = [];
  for (const z of zeilen.filter(ohneHinweis)) {
    const m = /^\s*[-*]\s+(?:\[[ xX/-]\]\s+)?(.*)$/.exec(z);
    if (m) {
      if (m[1].trim()) out.push(m[1].trim());
    } else if (z.trim() && out.length && /^\s{2,}/.test(z)) {
      out[out.length - 1] += " " + z.trim();
    }
  }
  return out;
}

function zutaten(zeilen: string[] | undefined): Zutatengruppe[] {
  if (!zeilen) return [];
  const gruppen: Zutatengruppe[] = [];
  let g: Zutatengruppe = { zutaten: [] };
  for (const z of zeilen.filter(ohneHinweis)) {
    const titel = /^\s*\*\*(.+?)\*\*\s*:?\s*$/.exec(z) ?? /^\s*###\s+(.+)$/.exec(z);
    if (titel) {
      if (g.zutaten.length || g.titel) gruppen.push(g);
      g = { titel: titel[1].replace(/:$/, "").trim(), zutaten: [] };
      continue;
    }
    const m = /^\s*[-*]\s+(?:\[[ xX/-]\]\s+)?(.*)$/.exec(z);
    if (m && m[1].trim()) g.zutaten.push(m[1].trim());
  }
  if (g.zutaten.length || g.titel) gruppen.push(g);
  return gruppen.filter((x) => x.zutaten.length);
}

function schritte(zeilen: string[] | undefined): Schritt[] {
  if (!zeilen) return [];
  const out: Schritt[] = [];
  for (const z of zeilen.filter(ohneHinweis)) {
    const m = /^\s*\d+[.)]\s+(.*)$/.exec(z);
    if (m) {
      const t = m[1].trim();
      const fett = /^\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(t);
      if (fett) out.push({ titel: fett[1].replace(/:$/, "").trim(), text: fett[2].trim() });
      else out.push({ text: t });
    } else if (z.trim() && out.length && !/^#/.test(z.trim()) && !/^!\[\[/.test(z.trim())) {
      out[out.length - 1].text += " " + z.trim();
    }
  }
  return out;
}

function versuche(zeilen: string[] | undefined): Versuch[] {
  if (!zeilen) return [];
  const out: Versuch[] = [];
  for (const z of zeilen.filter(ohneHinweis)) {
    const h = /^###\s+(.+)$/.exec(z.trim());
    if (h) {
      out.push({ datum: h[1].trim(), zeilen: [] });
      continue;
    }
    const m = /^\s*[-*]\s+(.*)$/.exec(z);
    if (m && m[1].trim() && out.length) out[out.length - 1].zeilen.push(m[1].trim());
  }
  return out.filter((v) => v.zeilen.length || v.datum);
}

function embeds(zeilen: string[] | undefined): string[] {
  if (!zeilen) return [];
  return zeilen.map((z) => (/^\s*!\[\[/.test(z) ? linkZiel(z) : undefined)).filter((x): x is string => !!x);
}

export function leseRezept(pfad: string, text: string, geaendert = 0): Rezept {
  const { fm, rumpf } = leseFrontmatter(text);
  const { kopf, teile } = abschnitte(rumpf);
  const name = pfad.split("/").pop()!.replace(/\.md$/i, "");
  const h1 = kopf.find((z) => /^#\s+/.test(z));
  const titel = h1 ? h1.replace(/^#\s+/, "").trim() : name;

  // Beschreibung: erster Absatz im Kopf, der kein Bild, keine Eckdaten- oder Quellenzeile und kein Hinweis ist.
  const absatz: string[] = [];
  for (const z of kopf) {
    const t = z.trim();
    if (!t) {
      if (absatz.length) break;
      continue;
    }
    if (
      /^#\s/.test(t) ||
      /^!\[\[/.test(t) ||
      /^>/.test(t) ||
      /^\*\*(Ergebnis|Aktiv|Gesamt|Yield|Servings|Active|Total)/.test(t) ||
      /^(Quelle|Source):/i.test(t)
    ) {
      if (absatz.length) break;
      continue;
    }
    absatz.push(t);
  }

  const kopfBild = embeds(kopf).find((b) => !/\.svg$/i.test(b));
  const status = str(fm.status) as Status | undefined;
  const ablauf = embeds(teile.get("ablauf")).find((b) => /\.svg$/i.test(b));
  const ergebnis = str(fm.ergebnis);
  const portionenZahl = zahl(fm.portionen);
  const ausErgebnis = leseErgebnis(ergebnis);
  return {
    pfad,
    name,
    titel,
    status: status && STATUS.includes(status) ? status : "ausprobieren",
    kategorie: str(fm.kategorie),
    quelle: str(fm.quelle),
    autor: str(fm.autor),
    ergebnis,
    portionen: portionenZahl ? { anzahl: portionenZahl, einheit: ausErgebnis?.einheit ?? "Portionen" } : ausErgebnis,
    zeitAktiv: zahl(fm.zeit_aktiv),
    zeitGesamt: zahl(fm.zeit_gesamt),
    bewertung: zahl(fm.bewertung),
    zuletztGemacht: str(fm.zuletzt_gemacht),
    importStand: str(fm.import),
    importFehler: str(fm.import_fehler),
    auftrag: str(fm.auftrag),
    erstellt: str(fm.erstellt),
    bild: linkZiel(str(fm.bild)) ?? kopfBild,
    ablauf,
    bilder: [...embeds(teile.get("bilder")), ...embeds(teile.get("bilder aus dem import"))],
    beschreibung: absatz.length ? absatz.join(" ") : undefined,
    zutaten: zutaten(teile.get("zutaten")),
    schritte: schritte(teile.get("schritte")),
    tipps: aufzaehlung(teile.get("tipps")).filter(nichtLeer),
    versuche: versuche(teile.get("versuche")),
    notizen: aufzaehlung(teile.get("notizen")).filter(nichtLeer),
    geaendert,
  };
}

/** Datum „heute“ als YYYY-MM-DD bzw. TT.MM.JJJJ in Europe/Berlin (Gerätezeit). */
export function heuteIso(d = new Date()): string {
  const z = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const isoZuDe = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};

/**
 * Neuen Versuch oben unter `## Versuche` einfügen (nach einem einleitenden Hinweis `> …`).
 * Fehlt der Abschnitt, wird er vor `## Notizen` bzw. am Ende angelegt.
 */
export function versuchEinfuegen(
  text: string,
  v: { datum: string; geaendert?: string; ergebnis?: string; bewertung?: number },
): string {
  const block = [`### ${v.datum}`];
  if (v.geaendert?.trim()) block.push(`- Geändert: ${einzeilig(v.geaendert)}`);
  if (v.ergebnis?.trim()) block.push(`- Ergebnis: ${einzeilig(v.ergebnis)}`);
  if (v.bewertung) block.push(`- Bewertung: ${v.bewertung}/5`);
  if (block.length === 1) block.push("- Gemacht");
  const zeilen = text.replace(/\r\n/g, "\n").split("\n");
  const start = zeilen.findIndex((z) => /^##\s+(Versuche|Attempts)\s*$/i.test(z));
  if (start < 0) {
    const notizen = zeilen.findIndex((z) => /^##\s+(Notizen|Notes)\s*$/i.test(z));
    const neu = ["## Versuche", ...block, ""];
    if (notizen >= 0) zeilen.splice(notizen, 0, ...neu);
    else zeilen.push("", ...neu);
    return zeilen.join("\n");
  }
  let i = start + 1;
  while (i < zeilen.length && (zeilen[i].trim() === "" || zeilen[i].trim().startsWith(">"))) i++;
  // Einfügestelle: nach Hinweis und Leerzeilen, vor dem ersten bisherigen Versuch bzw. dem nächsten Abschnitt.
  zeilen.splice(i, 0, ...block, "");
  // Genau eine Leerzeile zwischen Hinweis und neuem Block.
  if (zeilen[i - 1]?.trim() !== "") zeilen.splice(i, 0, "");
  return zeilen.join("\n");
}

const einzeilig = (s: string) => s.replace(/\s*\n\s*/g, " ").trim();
