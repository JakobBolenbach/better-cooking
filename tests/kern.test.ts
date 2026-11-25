import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { leseFrontmatter, leseRezept, versuchEinfuegen } from "../src/parse";
import { formatMenge, leseErgebnis, leseZahl, naechstePortion, skaliereZeile, zutatName } from "../src/mengen";
import { findeZeiten, uhr, zutatenImSchritt } from "../src/kochen";
import { erkenneQuelle, findeDublette, schluesselVon } from "../src/quelle";
import { normalisiere, Rezeptsuche, zerlegeIndex } from "../src/suche";

const lies = (f: string) => readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8");
const sauerteig = leseRezept("Recipes/Sauerteig-Bauernbrot ohne Hefe.md", lies("sauerteig.md"), 1);
const broetchen = leseRezept("Recipes/Dinkel-Sonntagsbrötchen.md", lies("broetchen.md"), 2);
const text = (teile: { text: string }[]) => teile.map((t) => t.text).join("");

describe("Parser", () => {
  it("erkennt leeres Frontmatter", () => {
    const { fm, rumpf } = leseFrontmatter("---\n---\n# Titel\n\nText\n\n---\n\nNach der Linie");
    expect(fm).toEqual({});
    expect(rumpf.startsWith("# Titel")).toBe(true);
  });

  it("liest Frontmatter und Abschnitte", () => {
    expect(sauerteig.titel).toBe("Sauerteig-Bauernbrot ohne Hefe");
    expect(sauerteig.status).toBe("ausprobieren");
    expect(sauerteig.kategorie).toBe("Brot");
    expect(sauerteig.zeitGesamt).toBe(780);
    expect(sauerteig.bild).toBe("Sauerteig-Bauernbrot ohne Hefe Titelbild.webp");
    expect(sauerteig.ablauf).toBe("Sauerteig-Bauernbrot ohne Hefe Ablauf.svg");
    expect(sauerteig.bilder).toEqual(["Sauerteig-Bauernbrot ohne Hefe Bild 1.webp"]);
    expect(sauerteig.zutaten).toHaveLength(2);
    expect(sauerteig.zutaten[0].zutaten[0]).toBe("400 g Weizenmehl Type 405");
    expect(sauerteig.zutaten[1].titel).toBe("Ausstattung");
    expect(sauerteig.schritte).toHaveLength(9);
    expect(sauerteig.schritte[0].titel).toBe("Kneten (7 bis 10 Min.)");
    expect(sauerteig.schritte[0].text).toMatch(/^Beide Mehle/);
    expect(sauerteig.tipps.length).toBeGreaterThan(5);
    expect(sauerteig.notizen).toEqual([]);
    expect(sauerteig.beschreibung).toMatch(/^Einfaches Weizen-Roggen-Mischbrot/);
  });
  it("liest Portionen aus dem Ergebnis", () => {
    expect(broetchen.portionen).toEqual({ anzahl: 9, einheit: "Brötchen" });
    expect(sauerteig.portionen).toEqual({ anzahl: 1, einheit: "großes Brot" });
    expect(leseErgebnis("für 4 Personen")).toEqual({ anzahl: 4, einheit: "Personen" });
    expect(leseErgebnis("Ein Blech")).toBeUndefined();
  });
  it("fügt einen Versuch oben ein", () => {
    const neu = versuchEinfuegen(lies("broetchen.md"), {
      datum: "24.11.2026",
      geaendert: "60 Min. Gare",
      ergebnis: "fluffig",
      bewertung: 4,
    });
    const r = leseRezept("x.md", neu);
    expect(r.versuche[0]).toEqual({
      datum: "24.11.2026",
      zeilen: ["Geändert: 60 Min. Gare", "Ergebnis: fluffig", "Bewertung: 4/5"],
    });
    const zweit = leseRezept("x.md", versuchEinfuegen(neu, { datum: "25.11.2026" }));
    expect(zweit.versuche.map((v) => v.datum)).toEqual(["25.11.2026", "24.11.2026"]);
    expect(neu).toMatch(/> Neueste oben.*\n\n### 24\.11\.2026/);
  });
});

describe("Mengen", () => {
  it("liest Zahlen", () => {
    expect(leseZahl("½")).toBe(0.5);
    expect(leseZahl("1 ½")).toBe(1.5);
    expect(leseZahl("1,5")).toBe(1.5);
    expect(leseZahl("3/4")).toBe(0.75);
  });
  it("formatiert sinnvoll", () => {
    expect(formatMenge(444.4, "g")).toBe("445");
    expect(formatMenge(13.3, "g")).toBe("13");
    expect(formatMenge(2.66, "g")).toBe("2,5");
    expect(formatMenge(0.75, "TL")).toBe("¾");
    expect(formatMenge(1.5, "EL")).toBe("1 ½");
    expect(formatMenge(2)).toBe("2");
    expect(formatMenge(1340, "ml")).toBe("1340");
  });
  it("skaliert Zeilen und lässt Type-Angaben stehen", () => {
    expect(text(skaliereZeile("400 g Weizenmehl Type 405", 2))).toBe("800 g Weizenmehl Type 405");
    expect(text(skaliereZeile("12 g Salz (10 bis 15 g nach Geschmack)", 2))).toBe(
      "24 g Salz (20 bis 30 g nach Geschmack)",
    );
    expect(text(skaliereZeile("½ TL Zucker", 3))).toBe("1 ½ TL Zucker");
    expect(text(skaliereZeile("2 Eier", 1.5))).toBe("3 Eier");
    expect(text(skaliereZeile("340 ml Wasser, lauwarm (grobe Angabe, ggf. 10 bis 20 ml mehr)", 0.5))).toBe(
      "170 ml Wasser, lauwarm (grobe Angabe, ggf. 5 bis 10 ml mehr)",
    );
    expect(text(skaliereZeile("Dutch Oven mit Deckel", 2))).toBe("Dutch Oven mit Deckel");
    expect(skaliereZeile("400 g Mehl", 1)[0]).toEqual({ text: "400 g", menge: true });
    // Größen mitten in der Zeile bleiben, Längen am Anfang (Stück Ingwer) werden umgerechnet.
    expect(text(skaliereZeile("Springform (26 cm), gefettet", 2))).toBe("Springform (26 cm), gefettet");
    expect(text(skaliereZeile("2 cm Ingwer", 2))).toBe("4 cm Ingwer");
  });
  it("Portionen-Schritte und Zutatennamen", () => {
    expect(naechstePortion(9, 1, 9)).toBe(10);
    expect(naechstePortion(1, -1, 1)).toBe(0.5);
    expect(naechstePortion(0.5, -1, 1)).toBe(0.5);
    expect(zutatName("400 g Weizenmehl Type 405")).toBe("Weizenmehl Type 405");
    expect(zutatName("340 ml Wasser, lauwarm (grobe Angabe)")).toBe("Wasser");
    expect(zutatName("½ TL Zucker")).toBe("Zucker");
  });
});

describe("Kochen", () => {
  it("findet Zeiten", () => {
    const z = findeZeiten("Abgedeckt 5 bis 6 Std. gehen lassen, dann 10 Min. backen und ca. 20 Minuten ruhen.");
    expect(z.map((x) => [x.sekunden, x.bisSekunden])).toEqual([
      [18000, 21600],
      [600, undefined],
      [1200, undefined],
    ]);
    expect(findeZeiten("Type 405 Mehl")).toEqual([]);
    expect(uhr(3909)).toBe("1:05:09");
    expect(uhr(247)).toBe("4:07");
  });
  it("erkennt Zutaten im Schritt", () => {
    const s = sauerteig.schritte[0].text;
    const treffer = zutatenImSchritt(s, sauerteig.zutaten)
      .filter((t) => t.gruppe === 0)
      .map((t) => t.index);
    expect(treffer).toEqual([0, 1, 2, 3, 4]);
    const b = zutatenImSchritt(broetchen.schritte[0].text, broetchen.zutaten).map((t) => t.index);
    expect(b).toEqual([0, 1, 2, 3]);
  });
});

describe("Quelle", () => {
  it("erkennt Plattformen und normiert", () => {
    const ig = erkenneQuelle("https://www.instagram.com/reel/BcExample01/?bqrl=MXBudGYzYmFqNWNwZg==");
    expect(ig.art).toBe("instagram");
    expect(ig.schluessel).toBe("instagram:BcExample01");
    expect(erkenneQuelle("https://www.instagram.com/p/BcExample01/").schluessel).toBe("instagram:BcExample01");
    const web = erkenneQuelle("https://example.org/rezepte/sauerteig-bauernbrot.html#ref=412115");
    expect(web.art).toBe("webseite");
    expect(web.url).toBe("https://example.org/rezepte/sauerteig-bauernbrot.html");
    expect(erkenneQuelle("https://youtu.be/abc123?si=x").schluessel).toBe("youtube:abc123");
    expect(erkenneQuelle("https://www.youtube.com/watch?v=abc123&t=10").schluessel).toBe("youtube:abc123");
    expect(erkenneQuelle("500 g Mehl\n300 ml Wasser").art).toBe("text");
    expect(erkenneQuelle("  ").art).toBe("leer");
    expect(erkenneQuelle("chefkoch.de/rezepte/123/brot.html?utm_source=x").schluessel).toBe(
      "chefkoch.de/rezepte/123/brot.html",
    );
  });
  it("findet Dubletten", () => {
    const alle = [sauerteig, broetchen];
    expect(findeDublette(erkenneQuelle("https://instagram.com/reel/BcExample01"), alle)?.name).toBe(
      "Dinkel-Sonntagsbrötchen",
    );
    expect(
      findeDublette(erkenneQuelle("https://example.org/rezepte/sauerteig-bauernbrot.html?utm_source=ig"), alle)?.name,
    ).toBe("Sauerteig-Bauernbrot ohne Hefe");
    expect(findeDublette(erkenneQuelle("https://example.org/anderes"), alle)).toBeUndefined();
    expect(schluesselVon("kein link")).toBeUndefined();
  });
});

describe("Suche", () => {
  const s = new Rezeptsuche();
  s.abgleichen([sauerteig, broetchen]);
  const namen = (q: string) => s.suche(q).map((t) => t.pfad.split("/").pop()!.replace(".md", ""));
  it("normalisiert deutsch", () => {
    expect(normalisiere("Brötchen Größe")).toBe("brotchen grosse");
    expect(normalisiere("Broetchen")).toBe("brotchen");
    expect(zerlegeIndex("Dinkelmehl")).toContain("mehl");
  });
  it("findet über Titel, Teilwörter, Tippfehler und mehrere Wörter", () => {
    expect(namen("brötchen")[0]).toBe("Dinkel-Sonntagsbrötchen");
    expect(namen("broetchen")[0]).toBe("Dinkel-Sonntagsbrötchen");
    expect(namen("sauerteg")[0]).toBe("Sauerteig-Bauernbrot ohne Hefe");
    expect(namen("roggen")).toEqual(["Sauerteig-Bauernbrot ohne Hefe"]);
    expect(namen("mehl").sort()).toEqual(["Dinkel-Sonntagsbrötchen", "Sauerteig-Bauernbrot ohne Hefe"]);
    expect(namen("dinkel olivenöl")).toEqual(["Dinkel-Sonntagsbrötchen"]);
    expect(namen("dutch")).toEqual(["Sauerteig-Bauernbrot ohne Hefe"]);
    expect(s.suche("roggen")[0].felder).toContain("zutaten");
  });
  it("fällt auf ODER zurück und hält den Index aktuell", () => {
    const t = s.suche("roggen olivenöl");
    expect(t.length).toBe(2);
    expect(t[0].ungefaehr).toBe(true);
    s.abgleichen([broetchen]);
    expect(namen("roggen")).toEqual([]);
    s.abgleichen([sauerteig, broetchen]);
    expect(namen("roggen")).toEqual(["Sauerteig-Bauernbrot ohne Hefe"]);
  });
});

describe("Englische Abschnittsnamen", () => {
  const englisch = `---
status: bewaehrt
---
# Tomato soup

![[Tomato soup cover.webp]]

A quick soup for two. Self-written example.

**Yield:** 2 bowls · **Active:** 10 min

Source: [example.org](https://example.org/soup)

## Timeline
![[Tomato soup timeline.svg]]

## Ingredients
- 500 g tomatoes
- 1 onion

**Equipment**
- Blender

## Instructions
1. **Sweat (5 min):** Cook the onion gently.
2. Add tomatoes and simmer.

## Tips
- Add basil.

## Images
![[Tomato soup photo.webp]]

## Attempts
### 01.11.2026
- Result: good

## Notes
- Freezes well.
`;
  const r = leseRezept("Recipes/Tomato soup.md", englisch, 1);

  it("liest alle Abschnitte", () => {
    expect(r.beschreibung).toBe("A quick soup for two. Self-written example.");
    expect(r.ablauf).toBe("Tomato soup timeline.svg");
    expect(r.zutaten).toEqual([
      { zutaten: ["500 g tomatoes", "1 onion"] },
      { titel: "Equipment", zutaten: ["Blender"] },
    ]);
    expect(r.schritte).toEqual([
      { titel: "Sweat (5 min)", text: "Cook the onion gently." },
      { text: "Add tomatoes and simmer." },
    ]);
    expect(r.tipps).toEqual(["Add basil."]);
    expect(r.bilder).toEqual(["Tomato soup photo.webp"]);
    expect(r.versuche).toEqual([{ datum: "01.11.2026", zeilen: ["Result: good"] }]);
    expect(r.notizen).toEqual(["Freezes well."]);
  });

  it("fügt Versuche unter ## Attempts ein", () => {
    const neu = versuchEinfuegen(englisch, { datum: "25.11.2026", ergebnis: "even better" });
    expect(neu).not.toMatch(/## Versuche/);
    expect(leseRezept("Recipes/Tomato soup.md", neu, 1).versuche[0].datum).toBe("25.11.2026");
  });
});
