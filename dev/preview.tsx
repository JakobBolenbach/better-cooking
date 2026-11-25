// Vorschau ohne Obsidian: Beispielrezepte aus tests/fixtures (oder REZEPTE_ORDNER) plus Beispielrezepte ohne Bild.
// Parameter: ?theme=dunkel&rezept=<Name>&kochen=1&import=1&suche=…&versuch=1&leer=1&auftrag=1
import { h, render } from "preact";
import fixture from "./fixture.json";
import { leseRezept, versuchEinfuegen } from "../src/parse";
import type { Auftrag, DesignModus, RezeptAnsicht, Status } from "../src/types";
import { App } from "../src/ui/App";

const q = new URLSearchParams(location.search);
const root = document.getElementById("root")!;
const bildUrl = (n?: string) =>
  n && (fixture.bilder as string[]).includes(n) ? `${fixture.bilderUrl}/${encodeURIComponent(n)}` : undefined;
const beispiele = [
  [
    "Schnelle Tomatensoße",
    "Hauptgericht",
    "bewaehrt",
    35,
    4,
    "800 g Tomaten aus der Dose\n- 2 Zehen Knoblauch\n- 3 EL Olivenöl\n- 1 TL Salz",
    "4 Portionen",
  ],
  [
    "Hefezopf",
    "Kuchen",
    "ausprobieren",
    180,
    0,
    "500 g Weizenmehl Type 550\n- 1 Würfel Hefe\n- 250 ml Milch\n- 80 g Butter\n- 2 Eier",
    "1 Zopf",
  ],
  [
    "Linsen-Dal",
    "Hauptgericht",
    "bewaehrt",
    40,
    5,
    "250 g rote Linsen\n- 400 ml Kokosmilch\n- 1 EL Currypulver",
    "für 4 Personen",
  ],
  [
    "Overnight Oats",
    "Frühstück",
    "ausprobieren",
    10,
    0,
    "50 g Haferflocken\n- 150 ml Milch\n- 1 TL Honig",
    "1 Portion",
  ],
] as const;
const beispielText = ([titel, kat, status, zeit, bew, zut, erg]: (typeof beispiele)[number]) => `---
typ: rezept
status: ${status}
kategorie: ${kat}
ergebnis: ${erg}
zeit_gesamt: ${zeit}
bewertung: ${bew || ""}
erstellt: 2026-11-0${(titel.length % 9) + 1}
---
# ${titel}

Beispielrezept nur für die Vorschau.

## Zutaten
- ${zut}

## Schritte
1. **Vorbereiten:** Alles bereitstellen, 10 Min. ziehen lassen.
2. **Kochen:** Bei mittlerer Hitze 20 Minuten köcheln.
`;

let texte = new Map<string, string>(fixture.rezepte.map((r) => [r.pfad, r.text]));
if (!q.has("leer")) beispiele.forEach((b) => texte.set(`Recipes/${b[0]}.md`, beispielText(b)));
else texte = new Map();
let modus: DesignModus = q.get("theme") === "dunkel" ? "dunkel" : "hell";
let auftraege: Auftrag[] = q.has("auftrag")
  ? [
      {
        id: "rz-1",
        eingabe: "https://www.instagram.com/reel/ABC123/",
        art: "instagram",
        schluessel: "instagram:ABC123",
        seit: Date.now() - 60_000,
        weg: "claude",
        sitzung: "https://claude.ai/code/session_x",
      },
      {
        id: "rz-3",
        eingabe: "https://vm.tiktok.com/ZGdXwHH9k/",
        art: "tiktok",
        schluessel: "tiktok:ZGdXwHH9k",
        seit: Date.now() - 11 * 60_000,
        weg: "claude",
        sitzung: "https://claude.ai/code/session_y",
      },
      {
        id: "rz-2",
        eingabe: "https://www.chefkoch.de/rezepte/1/test.html",
        art: "webseite",
        schluessel: "chefkoch.de/rezepte/1/test.html",
        seit: Date.now() - 30 * 60_000,
        weg: "github",
        fehler: "Nach 20 Minuten kein Rezept angekommen. Warum, steht im Lauf; sonst Sync prüfen.",
      },
    ]
  : [];

function ansichten(): RezeptAnsicht[] {
  return [...texte.entries()].map(([pfad, text], i) => {
    const r = leseRezept(pfad, text, 1000 + i);
    return {
      ...r,
      bildSrc: bildUrl(r.bild),
      bilderSrc: r.bilder.map(bildUrl).filter((x): x is string => !!x),
      ablaufSvg: r.ablauf ? (fixture.svg as Record<string, string>)[r.ablauf] : undefined,
    };
  });
}
const fm = (pfad: string, key: string, wert: string | number | null) => {
  const t = texte.get(pfad)!;
  const re = new RegExp(`^${key}:.*$`, "m");
  const zeile = `${key}: ${wert ?? ""}`;
  texte.set(pfad, re.test(t) ? t.replace(re, zeile) : t.replace(/^---\n/, `---\n${zeile}\n`));
  zeichnen();
};
const start = (() => {
  const name = q.get("rezept");
  const pfad = name ? [...texte.keys()].find((p) => p.includes(name)) : undefined;
  return {
    rezept: pfad,
    kochen: q.has("kochen"),
    importieren: q.has("import"),
    suche: q.get("suche") ?? undefined,
    versuch: q.has("versuch"),
    ansicht: q.has("ansicht"),
  };
})();
function zeichnen() {
  const theme = modus === "dunkel" ? "dunkel" : "hell";
  root.setAttribute("data-rz-theme", theme);
  render(
    h(App, {
      rezepte: ansichten(),
      theme,
      modus,
      auftraege,
      verarbeiter: q.has("ohneverarbeiter") ? null : "claude",
      ordner: "Recipes",
      start,
      onListe: () => {},
      onModus: (m: DesignModus) => {
        modus = m;
        zeichnen();
      },
      onOeffnen: (p: string) => console.log("öffnen", p),
      onStatus: (p: string, s: Status) => fm(p, "status", s),
      onBewertung: (p: string, n: number | null) => fm(p, "bewertung", n),
      onGemacht: (p: string) => fm(p, "zuletzt_gemacht", "2026-11-24"),
      onVersuch: async (p: string, v: { datum: string; geaendert: string; ergebnis: string; bewertung?: number }) => {
        texte.set(p, versuchEinfuegen(texte.get(p)!, v));
        zeichnen();
        return true;
      },
      onImport: async (e: string) => {
        auftraege = [...auftraege, { id: "rz-x", eingabe: e, art: "webseite", seit: Date.now(), weg: "claude" }];
        zeichnen();
        return { ok: true };
      },
      onAuftragWeg: (id: string) => {
        auftraege = auftraege.filter((a) => a.id !== id);
        zeichnen();
      },
      onNochmal: async (id: string) => {
        await new Promise((r) => setTimeout(r, 300));
        auftraege = auftraege.map((a) =>
          a.id === id ? { ...a, id: id + "n", seit: Date.now(), fehler: undefined } : a,
        );
        zeichnen();
        return { ok: true };
      },
      onHinweis: (t: string) => console.log("Hinweis", t),
      onWachHalten: async () => true,
    }),
    root,
  );
}
zeichnen();
