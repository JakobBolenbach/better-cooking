// Suche über alle Rezepte: MiniSearch (BM25+, Präfix, Tippfehler) mit deutscher Normalisierung
// und Teilwort-Treffern für zusammengesetzte Wörter ("mehl" findet "Dinkelmehl").
// Der Index liegt nur im Speicher und wird bei Änderungen pro Rezept aktualisiert (schnell auch bei Hunderten Rezepten).
import MiniSearch from "minisearch";
import type { Rezept } from "./types";

/** Klein, ß → ss, Umlaute und Akzente auf den Grundbuchstaben, ae/oe/ue wie ä/ö/ü. */
export function normalisiere(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u");
}

const WORT = /[\p{L}\p{N}]+/gu;

/** Beim Indexieren: jedes Wort, bei langen Wörtern zusätzlich ihre Endungen ab 4 Zeichen (Teilwörter). */
export function zerlegeIndex(text: string): string[] {
  const out: string[] = [];
  for (const w of normalisiere(text).match(WORT) ?? []) {
    out.push(w);
    if (w.length >= 7) for (let i = 1; i <= w.length - 4; i++) out.push(w.slice(i));
  }
  return out;
}

export function zerlegeSuche(text: string): string[] {
  return normalisiere(text).match(WORT) ?? [];
}

export type Feld = "titel" | "kategorie" | "zutaten" | "autor" | "beschreibung" | "schritte" | "tipps" | "notizen";
export const FELDNAMEN: Record<Feld, string> = {
  titel: "Titel",
  kategorie: "Kategorie",
  zutaten: "Zutaten",
  autor: "Autor",
  beschreibung: "Beschreibung",
  schritte: "Schritte",
  tipps: "Tipps",
  notizen: "Notizen",
};
const FELDER = Object.keys(FELDNAMEN) as Feld[];
const BOOST: Record<Feld, number> = {
  titel: 5,
  kategorie: 3,
  zutaten: 2.5,
  autor: 1.5,
  beschreibung: 1,
  schritte: 0.6,
  tipps: 0.6,
  notizen: 0.6,
};

interface Dokument extends Record<Feld, string> {
  id: string;
}

const alsDokument = (r: Rezept): Dokument => ({
  id: r.pfad,
  titel: r.titel,
  kategorie: r.kategorie ?? "",
  zutaten: r.zutaten.flatMap((g) => [g.titel ?? "", ...g.zutaten]).join("\n"),
  autor: r.autor ?? "",
  beschreibung: r.beschreibung ?? "",
  schritte: r.schritte.map((s) => `${s.titel ?? ""} ${s.text}`).join("\n"),
  tipps: r.tipps.join("\n"),
  notizen: [...r.notizen, ...r.versuche.flatMap((v) => v.zeilen)].join("\n"),
});

export interface Treffer {
  pfad: string;
  score: number;
  /** In welchen Feldern etwas gefunden wurde, nach Gewicht sortiert. */
  felder: Feld[];
  /** true, wenn nicht alle Suchwörter passten (Rückfall auf ODER). */
  ungefaehr: boolean;
}

export class Rezeptsuche {
  private ms = new MiniSearch<Dokument>({
    fields: FELDER,
    idField: "id",
    tokenize: zerlegeIndex,
    processTerm: (t) => t,
    searchOptions: {
      tokenize: zerlegeSuche,
      processTerm: (t) => t,
      boost: BOOST,
      prefix: true,
      fuzzy: (t) => (t.length >= 5 ? 0.2 : false),
      weights: { fuzzy: 0.45, prefix: 0.6 },
      combineWith: "AND",
    },
  });
  private stand = new Map<string, number>();

  /** Index an den aktuellen Bestand angleichen: nur geänderte, neue und gelöschte Rezepte anfassen. */
  abgleichen(rezepte: Rezept[]) {
    const da = new Set(rezepte.map((r) => r.pfad));
    for (const pfad of [...this.stand.keys()]) {
      if (!da.has(pfad)) {
        this.ms.discard(pfad);
        this.stand.delete(pfad);
      }
    }
    for (const r of rezepte) {
      const st = this.stand.get(r.pfad);
      if (st === r.geaendert) continue;
      if (st !== undefined) this.ms.discard(r.pfad);
      this.ms.add(alsDokument(r));
      this.stand.set(r.pfad, r.geaendert);
    }
  }

  suche(anfrage: string): Treffer[] {
    const q = anfrage.trim();
    if (!q) return [];
    let roh = this.ms.search(q);
    let ungefaehr = false;
    if (!roh.length && zerlegeSuche(q).length > 1) {
      roh = this.ms.search(q, { combineWith: "OR" });
      ungefaehr = true;
    }
    return roh.map((r) => {
      const felder = new Set<Feld>();
      for (const fs of Object.values(r.match)) for (const f of fs) felder.add(f as Feld);
      return {
        pfad: String(r.id),
        score: r.score,
        felder: FELDER.filter((f) => felder.has(f)),
        ungefaehr,
      };
    });
  }

  /** Vorschläge zum Vervollständigen (z. B. "dink" → "dinkelmehl"). */
  vorschlaege(anfrage: string, max = 5): string[] {
    if (!anfrage.trim()) return [];
    return this.ms
      .autoSuggest(anfrage, { fuzzy: 0.2 })
      .slice(0, max)
      .map((s) => s.suggestion);
  }
}
