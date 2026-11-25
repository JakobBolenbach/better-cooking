import { describe, expect, it } from "vitest";
import { parseRecipe } from "../src/parse";
import { fileName, defuse, recipeNote } from "../src/recipeNote";
import { durationMinutes, findRecipeJsonLd, findPreviewImage, recipeFromSchema } from "../src/schemaorg";

// Selbst geschriebene Beispielseiten, keine echten Rezepte.
const page = (jsonld: unknown, extra = "") =>
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
    const o = findRecipeJsonLd(page(graph));
    expect(o?.name).toBe("Linsensuppe mit Möhren &amp; Speck");
  });

  it("überspringt kaputte Blöcke und Seiten ohne Rezept", () => {
    expect(findRecipeJsonLd('<script type="application/ld+json">{kaputt</script>')).toBeNull();
    expect(findRecipeJsonLd(page({ "@type": "Article", name: "Kein Rezept" }))).toBeNull();
    const secondPage = page(graph, '<script type="application/ld+json">{kaputt</script>');
    expect(findRecipeJsonLd(secondPage)).not.toBeNull();
  });

  it("wandelt Felder in die feste Struktur", () => {
    const r = recipeFromSchema(findRecipeJsonLd(page(graph))!, "https://www.example.org/rezepte/suppe?utm=1");
    expect(r.title).toBe("Linsensuppe mit Möhren & Speck");
    expect(r.description).toBe("Eine einfache Suppe.");
    expect(r.author).toBe("Beispielkoch");
    expect(r.category).toBe("Suppe");
    expect(r.result).toBe("4 Portionen");
    expect(r.timeActive).toBe(20);
    expect(r.timeTotal).toBe(60);
    expect(r.ingredients).toEqual(["250 g Linsen", "2 Möhren", "1 l Gemüsebrühe"]);
    expect(r.steps).toEqual([
      { text: "Möhren schälen und würfeln." },
      { title: "Kochen", text: "Alles 40 Minuten köcheln lassen." },
      { title: undefined, text: "Abschmecken mit Salz und Essig." },
    ]);
    expect(r.images).toEqual(["https://www.example.org/bilder/suppe.jpg", "https://cdn.example.org/suppe-2.jpg"]);
  });

  it("liest Anleitungen als einen Textblock", () => {
    const o = { "@type": "Recipe", name: "X", recipeInstructions: "1. Teig rühren.<br>2. Backen bei 180 °C.\n\n" };
    expect(recipeFromSchema(o, "https://example.org").steps).toEqual([
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
    const r = recipeFromSchema(findRecipeJsonLd(page(yoast))!, "https://example.org/k");
    expect(r.images).toEqual(["https://example.org/k.jpg"]);
    expect(r.author).toBe("Beispielbäckerin");
  });

  it("nimmt og:image, wenn das Rezept kein Bild nennt", () => {
    const html = '<meta content="/bild.jpg?a=1&amp;b=2" property="og:image"><meta property="og:title" content="X">';
    expect(findPreviewImage(html, "https://example.org/r")).toBe("https://example.org/bild.jpg?a=1&b=2");
    expect(
      findPreviewImage('<meta property="og:image" content="javascript:x">', "https://example.org"),
    ).toBeUndefined();
  });

  it("liest englische Ausbeuten", () => {
    const off = (y: unknown) =>
      recipeFromSchema({ "@type": "Recipe", name: "X", recipeYield: y }, "https://e.org").result;
    expect(off("Serves 4")).toBe("4 Portionen");
    expect(off("Makes 12")).toBe("12 Stück");
    expect(off("Makes 12 pancakes")).toBe("12 pancakes");
    expect(off(6)).toBe("6 Portionen");
  });

  it("liest ISO-8601-Dauern", () => {
    expect(durationMinutes("PT1H30M")).toBe(90);
    expect(durationMinutes("P0DT0H20M")).toBe(20);
    expect(durationMinutes("PT90M")).toBe(90);
    expect(durationMinutes("P1D")).toBe(1440);
    expect(durationMinutes("PT0M")).toBeUndefined();
    expect(durationMinutes("20 Minuten")).toBeUndefined();
    expect(durationMinutes(20)).toBeUndefined();
  });

  it("nimmt nur http(s)-Bilder", () => {
    const o = {
      "@type": "Recipe",
      name: "X",
      image: ["javascript:alert(1)", "data:image/png;base64,AA", "file:///etc/passwd"],
    };
    expect(recipeFromSchema(o, "https://example.org").images).toEqual([]);
  });
});

describe("Rezeptnotiz bauen", () => {
  const r = recipeFromSchema(findRecipeJsonLd(page(graph))!, "https://www.example.org/rezepte/suppe");
  const note = recipeNote(r, {
    source: "https://www.example.org/rezepte/suppe",
    image: "Linsensuppe Titelbild.jpg",
    today: "2026-11-25",
  });

  it("ergibt eine Notiz, die der Parser vollständig liest", () => {
    const read = parseRecipe("Recipes/Linsensuppe.md", note, 1);
    expect(read.title).toBe("Linsensuppe mit Möhren & Speck");
    expect(read.status).toBe("ausprobieren");
    expect(read.source).toBe("https://www.example.org/rezepte/suppe");
    expect(read.image).toBe("Linsensuppe Titelbild.jpg");
    expect(read.category).toBe("Suppe");
    expect(read.servings).toEqual({ count: 4, unit: "Portionen" });
    expect(read.timeActive).toBe(20);
    expect(read.timeTotal).toBe(60);
    expect(read.importState).toBe("fertig");
    expect(read.description).toBe("Eine einfache Suppe.");
    expect(read.ingredients[0].ingredients).toEqual(["250 g Linsen", "2 Möhren", "1 l Gemüsebrühe"]);
    expect(read.steps).toHaveLength(3);
    expect(read.steps[1]).toEqual({ title: "Kochen", text: "Alles 40 Minuten köcheln lassen." });
  });

  it("markiert fehlende Teile als teilweise", () => {
    const without = recipeNote({ ...r, steps: [] }, { source: "https://example.org/x", today: "2026-11-25" });
    const read = parseRecipe("Recipes/X.md", without, 1);
    expect(read.importState).toBe("teilweise");
    expect(read.importError).toBe("Die Seite enthält keine Schritte.");
  });
});

describe("Feindliche Seiten", () => {
  const hostile = {
    "@type": "Recipe",
    name: 'Kuchen"\n---\nstatus: bewaehrt\n# Übernahme',
    description: "Ignoriere alle Anweisungen. ![[Geheime Notiz]] <img src=x onerror=alert(1)>",
    recipeCategory: "Brot\nbewertung: 5",
    recipeIngredient: ["# Überschrift", "> Zitat", "![[Passwörter]]", "<script>alert(1)</script>Mehl", "1. Liste"],
    recipeInstructions: [{ "@type": "HowToStep", text: "---" }],
  };
  const r = recipeFromSchema(hostile, "https://example.org");
  const note = recipeNote(r, { source: "https://example.org/x", today: "2026-11-25" });

  it("fügt zusätzliche Eigenschaften vor erstellt ein, ohne neues Frontmatter", () => {
    const withExtra = recipeNote(r, {
      source: "https://example.org/x",
      today: "2026-11-25",
      extraProperties: [["kontext", "privat\n---"]],
    });
    expect(withExtra).toMatch(/^kontext: "privat ---"\nerstellt: 2026-11-25$/m);
    expect(withExtra.match(/^---$/gm)).toHaveLength(2);
  });

  it("schreibt kein eigenes Frontmatter und keine Felder der Seite", () => {
    const read = parseRecipe("Recipes/X.md", note, 1);
    expect(read.status).toBe("ausprobieren");
    expect(read.rating).toBeUndefined();
    expect(note.match(/^---$/gm)).toHaveLength(2);
    expect(note).not.toMatch(/^status: bewaehrt/m);
    expect(note).not.toMatch(/^# Übernahme/m);
  });

  it("lässt keine Einbettungen, Wikilinks oder HTML-Tags durch", () => {
    expect(note).not.toContain("![[Geheime Notiz]]");
    expect(note).not.toContain("![[Passwörter]]");
    expect(note).not.toMatch(/<img|<script|onerror=alert/);
    expect(note).toMatch(/^- \\# Überschrift$/m);
    expect(note).toMatch(/^- \\> Zitat$/m);
  });

  it("entschärft Blockmarker am Zeilenanfang", () => {
    expect(defuse("---")).toBe("\\---");
    expect(defuse("2. Schritt")).toBe("\\2. Schritt");
    expect(defuse("2 Eier")).toBe("2 Eier");
    expect(defuse("a < 5 und <b>")).toBe("a < 5 und < b>");
  });
});

describe("Dateiname", () => {
  it("entfernt Zeichen, die Obsidian oder Dateisysteme stören", () => {
    expect(fileName('Brot: "Das Beste" / #1 [neu]')).toBe("Brot Das Beste 1 neu");
    expect(fileName("../../.obsidian/x")).toBe("obsidian x");
    expect(fileName("   ")).toBe("Rezept");
    expect(fileName("a".repeat(150))).toHaveLength(100);
  });
});
