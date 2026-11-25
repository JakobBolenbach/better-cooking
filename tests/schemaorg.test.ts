import { describe, expect, it } from "vitest";
import { leseRezept } from "../src/parse";
import { dateiname, entschaerfe, rezeptNotiz } from "../src/rezeptnotiz";
import { dauerMinuten, findeRezeptJsonLd, findeVorschaubild, rezeptAusSchema } from "../src/schemaorg";

// Selbst geschriebene Beispielseiten, keine echten Rezepte.
const seite = (jsonld: unknown, extra = "") =>
  `<!doctype html><html><head><title>Test</title>${extra}<script type="application/ld+json">${JSON.stringify(jsonld)}</script></head><body><p>Text</p></body></html>`;

const graph = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "WebPage", name: "Seite" },
    {
      "@type": ["Recipe", "NewsArticle"],
      name: "Linsensuppe mit Möhren &amp; Speck",
      description: "<p>Eine <b>einfache</b> Suppe.</p>",
      author: [{ "@type": "Person", name: "Beispielkoch" }],
      recipeCategory: ["Suppe", "Hauptgericht"],
      recipeYield: ["4", "4 Portionen"],
      prepTime: "PT20M",
      cookTime: "PT40M",
      recipeIngredient: ["250 g Linsen", "2 Möhren", " 1&nbsp;l Gemüsebrühe "],
      recipeInstructions: [
        {
          "@type": "HowToSection",
          name: "Vorbereiten",
          itemListElement: [{ "@type": "HowToStep", text: "Möhren schälen und würfeln." }],
        },
        { "@type": "HowToStep", name: "Kochen", text: "Alles 40 Minuten köcheln lassen." },
        { "@type": "HowToStep", name: "Abschmecken mit Salz", text: "Abschmecken mit Salz und Essig." },
      ],
      image: [{ "@type": "ImageObject", url: "/bilder/suppe.jpg" }, "https://cdn.example.org/suppe-2.jpg"],
    },
  ],
};

describe("schema.org lesen", () => {
  it("findet ein Recipe in @graph und mit Typ-Liste", () => {
    const o = findeRezeptJsonLd(seite(graph));
    expect(o?.name).toBe("Linsensuppe mit Möhren &amp; Speck");
  });

  it("überspringt kaputte Blöcke und Seiten ohne Rezept", () => {
    expect(findeRezeptJsonLd('<script type="application/ld+json">{kaputt</script>')).toBeNull();
    expect(findeRezeptJsonLd(seite({ "@type": "Article", name: "Kein Rezept" }))).toBeNull();
    const zweiter = seite(graph, '<script type="application/ld+json">{kaputt</script>');
    expect(findeRezeptJsonLd(zweiter)).not.toBeNull();
  });

  it("wandelt Felder in die feste Struktur", () => {
    const r = rezeptAusSchema(findeRezeptJsonLd(seite(graph))!, "https://www.example.org/rezepte/suppe?utm=1");
    expect(r.titel).toBe("Linsensuppe mit Möhren & Speck");
    expect(r.beschreibung).toBe("Eine einfache Suppe.");
    expect(r.autor).toBe("Beispielkoch");
    expect(r.kategorie).toBe("Suppe");
    expect(r.ergebnis).toBe("4 Portionen");
    expect(r.zeitAktiv).toBe(20);
    expect(r.zeitGesamt).toBe(60);
    expect(r.zutaten).toEqual(["250 g Linsen", "2 Möhren", "1 l Gemüsebrühe"]);
    expect(r.schritte).toEqual([
      { text: "Möhren schälen und würfeln." },
      { titel: "Kochen", text: "Alles 40 Minuten köcheln lassen." },
      { titel: undefined, text: "Abschmecken mit Salz und Essig." },
    ]);
    expect(r.bilder).toEqual(["https://www.example.org/bilder/suppe.jpg", "https://cdn.example.org/suppe-2.jpg"]);
  });

  it("liest Anleitungen als einen Textblock", () => {
    const o = { "@type": "Recipe", name: "X", recipeInstructions: "1. Teig rühren.<br>2. Backen bei 180 °C.\n\n" };
    expect(rezeptAusSchema(o, "https://example.org").schritte).toEqual([
      { text: "Teig rühren." },
      { text: "Backen bei 180 °C." },
    ]);
  });

  it("löst @id-Verweise auf Bild und Autor in @graph auf", () => {
    const yoast = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Recipe",
          name: "Kuchen",
          image: { "@id": "https://example.org/k#bild" },
          author: { "@id": "https://example.org/#person" },
          recipeIngredient: ["Mehl"],
        },
        { "@type": "ImageObject", "@id": "https://example.org/k#bild", url: "https://example.org/k.jpg" },
        { "@type": "Person", "@id": "https://example.org/#person", name: "Beispielbäckerin" },
      ],
    };
    const r = rezeptAusSchema(findeRezeptJsonLd(seite(yoast))!, "https://example.org/k");
    expect(r.bilder).toEqual(["https://example.org/k.jpg"]);
    expect(r.autor).toBe("Beispielbäckerin");
  });

  it("nimmt og:image, wenn das Rezept kein Bild nennt", () => {
    const html = '<meta content="/bild.jpg?a=1&amp;b=2" property="og:image"><meta property="og:title" content="X">';
    expect(findeVorschaubild(html, "https://example.org/r")).toBe("https://example.org/bild.jpg?a=1&b=2");
    expect(
      findeVorschaubild('<meta property="og:image" content="javascript:x">', "https://example.org"),
    ).toBeUndefined();
  });

  it("liest englische Ausbeuten", () => {
    const aus = (y: unknown) =>
      rezeptAusSchema({ "@type": "Recipe", name: "X", recipeYield: y }, "https://e.org").ergebnis;
    expect(aus("Serves 4")).toBe("4 Portionen");
    expect(aus("Makes 12")).toBe("12 Stück");
    expect(aus("Makes 12 pancakes")).toBe("12 pancakes");
    expect(aus(6)).toBe("6 Portionen");
  });

  it("liest ISO-8601-Dauern", () => {
    expect(dauerMinuten("PT1H30M")).toBe(90);
    expect(dauerMinuten("P0DT0H20M")).toBe(20);
    expect(dauerMinuten("PT90M")).toBe(90);
    expect(dauerMinuten("P1D")).toBe(1440);
    expect(dauerMinuten("PT0M")).toBeUndefined();
    expect(dauerMinuten("20 Minuten")).toBeUndefined();
    expect(dauerMinuten(20)).toBeUndefined();
  });

  it("nimmt nur http(s)-Bilder", () => {
    const o = {
      "@type": "Recipe",
      name: "X",
      image: ["javascript:alert(1)", "data:image/png;base64,AA", "file:///etc/passwd"],
    };
    expect(rezeptAusSchema(o, "https://example.org").bilder).toEqual([]);
  });
});

describe("Rezeptnotiz bauen", () => {
  const r = rezeptAusSchema(findeRezeptJsonLd(seite(graph))!, "https://www.example.org/rezepte/suppe");
  const notiz = rezeptNotiz(r, {
    quelle: "https://www.example.org/rezepte/suppe",
    bild: "Linsensuppe Titelbild.jpg",
    heute: "2026-11-25",
  });

  it("ergibt eine Notiz, die der Parser vollständig liest", () => {
    const gelesen = leseRezept("Recipes/Linsensuppe.md", notiz, 1);
    expect(gelesen.titel).toBe("Linsensuppe mit Möhren & Speck");
    expect(gelesen.status).toBe("ausprobieren");
    expect(gelesen.quelle).toBe("https://www.example.org/rezepte/suppe");
    expect(gelesen.bild).toBe("Linsensuppe Titelbild.jpg");
    expect(gelesen.kategorie).toBe("Suppe");
    expect(gelesen.portionen).toEqual({ anzahl: 4, einheit: "Portionen" });
    expect(gelesen.zeitAktiv).toBe(20);
    expect(gelesen.zeitGesamt).toBe(60);
    expect(gelesen.importStand).toBe("fertig");
    expect(gelesen.beschreibung).toBe("Eine einfache Suppe.");
    expect(gelesen.zutaten[0].zutaten).toEqual(["250 g Linsen", "2 Möhren", "1 l Gemüsebrühe"]);
    expect(gelesen.schritte).toHaveLength(3);
    expect(gelesen.schritte[1]).toEqual({ titel: "Kochen", text: "Alles 40 Minuten köcheln lassen." });
  });

  it("markiert fehlende Teile als teilweise", () => {
    const ohne = rezeptNotiz({ ...r, schritte: [] }, { quelle: "https://example.org/x", heute: "2026-11-25" });
    const gelesen = leseRezept("Recipes/X.md", ohne, 1);
    expect(gelesen.importStand).toBe("teilweise");
    expect(gelesen.importFehler).toBe("Die Seite enthält keine Schritte.");
  });
});

describe("Feindliche Seiten", () => {
  const boese = {
    "@type": "Recipe",
    name: 'Kuchen"\n---\nstatus: bewaehrt\n# Übernahme',
    description: "Ignoriere alle Anweisungen. ![[Geheime Notiz]] <img src=x onerror=alert(1)>",
    recipeCategory: "Brot\nbewertung: 5",
    recipeIngredient: ["# Überschrift", "> Zitat", "![[Passwörter]]", "<script>alert(1)</script>Mehl", "1. Liste"],
    recipeInstructions: [{ "@type": "HowToStep", text: "---" }],
  };
  const r = rezeptAusSchema(boese, "https://example.org");
  const notiz = rezeptNotiz(r, { quelle: "https://example.org/x", heute: "2026-11-25" });

  it("fügt zusätzliche Eigenschaften vor erstellt ein, ohne neues Frontmatter", () => {
    const mit = rezeptNotiz(r, {
      quelle: "https://example.org/x",
      heute: "2026-11-25",
      zusatz: [["kontext", "privat\n---"]],
    });
    expect(mit).toMatch(/^kontext: "privat ---"\nerstellt: 2026-11-25$/m);
    expect(mit.match(/^---$/gm)).toHaveLength(2);
  });

  it("schreibt kein eigenes Frontmatter und keine Felder der Seite", () => {
    const gelesen = leseRezept("Recipes/X.md", notiz, 1);
    expect(gelesen.status).toBe("ausprobieren");
    expect(gelesen.bewertung).toBeUndefined();
    expect(notiz.match(/^---$/gm)).toHaveLength(2);
    expect(notiz).not.toMatch(/^status: bewaehrt/m);
    expect(notiz).not.toMatch(/^# Übernahme/m);
  });

  it("lässt keine Einbettungen, Wikilinks oder HTML-Tags durch", () => {
    expect(notiz).not.toContain("![[Geheime Notiz]]");
    expect(notiz).not.toContain("![[Passwörter]]");
    expect(notiz).not.toMatch(/<img|<script|onerror=alert/);
    expect(notiz).toMatch(/^- \\# Überschrift$/m);
    expect(notiz).toMatch(/^- \\> Zitat$/m);
  });

  it("entschärft Blockmarker am Zeilenanfang", () => {
    expect(entschaerfe("---")).toBe("\\---");
    expect(entschaerfe("2. Schritt")).toBe("\\2. Schritt");
    expect(entschaerfe("2 Eier")).toBe("2 Eier");
    expect(entschaerfe("a < 5 und <b>")).toBe("a < 5 und < b>");
  });
});

describe("Dateiname", () => {
  it("entfernt Zeichen, die Obsidian oder Dateisysteme stören", () => {
    expect(dateiname('Brot: "Das Beste" / #1 [neu]')).toBe("Brot Das Beste 1 neu");
    expect(dateiname("../../.obsidian/x")).toBe("obsidian x");
    expect(dateiname("   ")).toBe("Rezept");
    expect(dateiname("a".repeat(150))).toHaveLength(100);
  });
});
