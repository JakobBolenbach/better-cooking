// Preview without Obsidian: example recipes from tests/fixtures (or REZEPTE_ORDNER) plus examples without an image.
// URL parameters: ?lang=en&theme=dunkel&rezept=<Name>&kochen=1&import=1&suche=…&versuch=1&leer=1&auftrag=1
// Obsidian mobile: ?mobil=1 (header, navigation bar over the view, safe areas), &sicher=47,34 (notch, home indicator),
// &tastatur=1 (on-screen keyboard while a text field has focus).
import { h, render } from "preact";
import fixture from "./fixture.json";
import { parseRecipe, insertAttempt, todayIso } from "../src/parse";
import type { Job, ColorMode, RecipeView, Status } from "../src/types";
import { App } from "../src/ui/App";
import { setLanguage } from "../src/i18n";
import { applyInsets } from "../src/insets";

// Obsidian's globals for popout windows; in the browser preview there is only one window.
Object.assign(window, { activeDocument: document, activeWindow: window });

const q = new URLSearchParams(location.search);
// Language like Obsidian would set it; the preview defaults to German (?lang=en for English).
setLanguage(q.get("lang") ?? "de");
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

// lang=en shows the English example recipes (tests/fixtures/en), otherwise the German ones plus short examples.
const english = q.get("lang") === "en" && fixture.recipesEn?.length > 0;
let texts = new Map<string, string>((english ? fixture.recipesEn : fixture.recipes).map((r) => [r.path, r.text]));
if (q.has("leer")) texts = new Map();
else if (!english) examples.forEach((b) => texts.set(`Recipes/${b[0]}.md`, exampleText(b)));
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
const madeBefore = new Map<string, string>();
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
      onMade: (p: string) => {
        madeBefore.set(p, /^zuletzt_gemacht:\s*(.*)$/m.exec(texts.get(p)!)?.[1] ?? "");
        fm(p, "zuletzt_gemacht", todayIso());
      },
      onUndoMade: (p: string) => fm(p, "zuletzt_gemacht", madeBefore.get(p) ?? null),
      canPrint: true,
      canTranslate: true,
      // No AI in the preview: copy the recipe as a "translation" so the language switch can be tried.
      onTranslate: (path: string, language: string) => {
        const name = path.replace(/^.*\//, "").replace(/\.md$/, "");
        const copy = `Recipes/${name} (${language}).md`;
        texts.set(
          copy,
          texts.get(path)!.replace(/^---\n/, `---\nuebersetzung_von: "[[${name}]]"\nsprache: "${language}"\n`),
        );
        renderPreview();
        return Promise.resolve({ ok: true, path: copy });
      },
      onPlan: (p: string, date: string, factor: number) => console.log("planen", p, date, factor),
      onShop: (p: string, factor: number, skip: string[]) => console.log("einkaufen", p, factor, skip),
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

// ?mobil=1: what Obsidian mobile puts around the view, measured with the same code as the plugin (src/insets.ts).
if (q.has("mobil")) {
  const [top, bottom] = (q.get("sicher") ?? "47,34").split(",").map((n) => Number(n) || 0);
  document.body.classList.add("mobil-nachbau");
  document.body.style.setProperty("--sim-top", `${top}px`);
  document.body.style.setProperty("--sim-bottom", `${bottom}px`);
  const frame = document.getElementById("mobil")!;
  render(
    h(
      "div",
      null,
      h("div", { class: "view-header" }, "Better Cooking"),
      h(
        "div",
        { class: "mobile-navbar" },
        ["Zurück", "Vor", "Neu", "Suche", "Menü"].map((t) => h("span", null, t)),
      ),
      h("div", { class: "sim-sicher" }),
      h("div", { class: "sim-tastatur" }, "Tastatur"),
    ),
    frame,
  );
  const keys = frame.querySelector<HTMLElement>(".sim-tastatur")!;
  const typing = () => {
    const a = document.activeElement;
    return (
      q.has("tastatur") &&
      !!a &&
      (a.tagName === "TEXTAREA" || (a.tagName === "INPUT" && (a as HTMLInputElement).type !== "checkbox"))
    );
  };
  const measure = () => {
    keys.style.display = typing() ? "grid" : "none";
    applyInsets(root, {
      safe: bottom,
      visual: { top: 0, height: window.innerHeight - (typing() ? keys.offsetHeight : 0) },
    });
  };
  window.setInterval(measure, 150);
  window.addEventListener("resize", measure);
  measure();
}
