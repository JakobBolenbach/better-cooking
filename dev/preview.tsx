// Vorschau ohne Obsidian: Beispielrezepte aus tests/fixtures (oder REZEPTE_ORDNER) plus Beispielrezepte ohne Bild.
// Parameter: ?theme=dunkel&rezept=<Name>&kochen=1&import=1&suche=…&versuch=1&leer=1&auftrag=1
import { h, render } from "preact";
import fixture from "./fixture.json";
import { parseRecipe, insertAttempt } from "../src/parse";
import type { Job, ColorMode, RecipeView, Status } from "../src/types";
import { App } from "../src/ui/App";

const q = new URLSearchParams(location.search);
const root = document.getElementById("root")!;
const imageUrl = (n?: string) =>
  n && (fixture.images as string[]).includes(n) ? `${fixture.imagesUrl}/${encodeURIComponent(n)}` : undefined;
const examples = [
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
const exampleText = ([title, cat, status, time, rating, ingr, res]: (typeof examples)[number]) => `---
typ: rezept
status: ${status}
kategorie: ${cat}
ergebnis: ${res}
zeit_gesamt: ${time}
bewertung: ${rating || ""}
erstellt: 2026-11-0${(title.length % 9) + 1}
---
# ${title}

Beispielrezept nur für die Vorschau.

## Zutaten
- ${ingr}

## Schritte
1. **Vorbereiten:** Alles bereitstellen, 10 Min. ziehen lassen.
2. **Kochen:** Bei mittlerer Hitze 20 Minuten köcheln.
`;

let texts = new Map<string, string>(fixture.recipes.map((r) => [r.path, r.text]));
if (!q.has("leer")) examples.forEach((b) => texts.set(`Recipes/${b[0]}.md`, exampleText(b)));
else texts = new Map();
let mode: ColorMode = q.get("theme") === "dunkel" ? "dunkel" : "hell";
let jobs: Job[] = q.has("auftrag")
  ? [
      {
        id: "rz-1",
        input: "https://www.instagram.com/reel/ABC123/",
        kind: "instagram",
        key: "instagram:ABC123",
        since: Date.now() - 60_000,
        processor: "claude",
        session: "https://claude.ai/code/session_x",
      },
      {
        id: "rz-3",
        input: "https://vm.tiktok.com/ZGdXwHH9k/",
        kind: "tiktok",
        key: "tiktok:ZGdXwHH9k",
        since: Date.now() - 11 * 60_000,
        processor: "claude",
        session: "https://claude.ai/code/session_y",
      },
      {
        id: "rz-2",
        input: "https://www.chefkoch.de/rezepte/1/test.html",
        kind: "webseite",
        key: "chefkoch.de/rezepte/1/test.html",
        since: Date.now() - 30 * 60_000,
        processor: "github",
        error: "Nach 20 Minuten kein Rezept angekommen. Warum, steht im Lauf; sonst Sync prüfen.",
      },
    ]
  : [];

function views(): RecipeView[] {
  return [...texts.entries()].map(([path, text], i) => {
    const r = parseRecipe(path, text, 1000 + i);
    return {
      ...r,
      imageSrc: imageUrl(r.image),
      imageSrcs: r.images.map(imageUrl).filter((x): x is string => !!x),
      timelineSvg: r.timeline ? (fixture.svg as Record<string, string>)[r.timeline] : undefined,
    };
  });
}
const fm = (path: string, key: string, value: string | number | null) => {
  const t = texts.get(path)!;
  const re = new RegExp(`^${key}:.*$`, "m");
  const line = `${key}: ${value ?? ""}`;
  texts.set(path, re.test(t) ? t.replace(re, line) : t.replace(/^---\n/, `---\n${line}\n`));
  renderPreview();
};
const start = (() => {
  const name = q.get("rezept");
  const path = name ? [...texts.keys()].find((p) => p.includes(name)) : undefined;
  return {
    recipe: path,
    cooking: q.has("kochen"),
    importRecipe: q.has("import"),
    search: q.get("suche") ?? undefined,
    attempt: q.has("versuch"),
    view: q.has("ansicht"),
  };
})();
function renderPreview() {
  const theme = mode === "dunkel" ? "dunkel" : "hell";
  root.setAttribute("data-rz-theme", theme);
  render(
    h(App, {
      recipes: views(),
      theme,
      mode: mode,
      jobs: jobs,
      processor: q.has("ohneverarbeiter") ? null : "claude",
      folder: "Recipes",
      start,
      onList: () => {},
      onMode: (m: ColorMode) => {
        mode = m;
        renderPreview();
      },
      onOpenNote: (p: string) => console.log("öffnen", p),
      onStatus: (p: string, s: Status) => fm(p, "status", s),
      onRating: (p: string, n: number | null) => fm(p, "bewertung", n),
      onMade: (p: string) => fm(p, "zuletzt_gemacht", "2026-11-24"),
      onAttempt: async (p: string, v: { date: string; modified: string; result: string; rating?: number }) => {
        texts.set(p, insertAttempt(texts.get(p)!, v));
        renderPreview();
        return true;
      },
      onImport: async (e: string) => {
        jobs = [...jobs, { id: "rz-x", input: e, kind: "webseite", since: Date.now(), processor: "claude" }];
        renderPreview();
        return { ok: true };
      },
      onJobGone: (id: string) => {
        jobs = jobs.filter((a) => a.id !== id);
        renderPreview();
      },
      onRetry: async (id: string) => {
        await new Promise((r) => setTimeout(r, 300));
        jobs = jobs.map((a) => (a.id === id ? { ...a, id: id + "n", since: Date.now(), error: undefined } : a));
        renderPreview();
        return { ok: true };
      },
      onHint: (t: string) => console.log("Hinweis", t),
      onKeepAwake: async () => true,
    }),
    root,
  );
}
renderPreview();
