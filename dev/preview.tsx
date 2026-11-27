// Preview without Obsidian: example recipes from tests/fixtures (or REZEPTE_ORDNER) plus examples without an image.
// "Fetch again" mock: keinedaten=1 (page without recipe data, AI button).
// URL parameters: ?lang=en&notizen=de&theme=dunkel&palette=obsidian&rezept=<Name>&kochen=1&import=1&suche=…&versuch=1&leer=1&ordnerfehlt=1&auftrag=1
// Obsidian mobile: ?mobil=1 (header, navigation bar over the view), &sicher=47,34,0,0 (safe areas top, bottom, left, right),
// ?einkauf=1 opens the shopping list page with an example list (einkauf=leer: empty list), ?plan=1 the meal plan page (plan=leer: empty plan).
// &tastatur=1 (on-screen keyboard while a text field has focus); ?statusleiste=1 (status bar of the desktop).
import { h, render } from "preact";
import fixture from "./fixture.json";
import { parseRecipe, insertAttempt, todayIso } from "../src/parse";
import type { Job, ColorMode, RecipeView, Status } from "../src/types";
import { App } from "../src/ui/App";
import { setLanguage } from "../src/i18n";
import { applyInsets } from "../src/insets";
import { processorStatus } from "../src/processor";
import { planRefetch } from "../src/refetch";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import type { SchemaRecipe } from "../src/schemaorg";
import { applyShoppingEdit, type ShoppingEdit } from "../src/shoppingEdit";
import { contributionsOf, recordAdds } from "../src/listRecipes";
import { applyPlanEdit, type PlanEdit } from "../src/planEdit";
import { addToPlan, dayHeading, days, entryLine } from "../src/mealPlan";

// Obsidian's globals for popout windows; in the browser preview there is only one window.
Object.assign(window, { activeDocument: document, activeWindow: window });

const q = new URLSearchParams(location.search);
const proc = q.get("proc");
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
    "500 g Dinkelmehl Type 630\n- 1 Würfel Hefe\n- 250 ml Milch\n- 80 g Butter\n- 2 Eier",
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

// lang=en shows the English interface, notizen=de|en the language of the example notes (recipes, list, plan; default: like lang),
// so lang=en&notizen=de is an English interface over German notes. English notes use tests/fixtures/en, German ones add short examples.
const english = (q.get("notizen") ?? q.get("lang")) === "en" && fixture.recipesEn?.length > 0;
const noteLang = english ? "en" : "de";
let texts = new Map<string, string>((english ? fixture.recipesEn : fixture.recipes).map((r) => [r.path, r.text]));
if (q.has("leer")) texts = new Map();
else if (!english) examples.forEach((b) => texts.set(`Recipes/${b[0]}.md`, exampleText(b)));
// The shopping list note of the preview: the page changes it with the same function the plugin uses.
let shopping = q.get("einkauf") === "leer" ? "" : english ? fixture.shoppingEn : fixture.shopping;
// How the example recipes were added to the example list (amount per recipe, #68): recipes on the list get a record,
// two of them for twice the servings, so the shared lines of the example list add up.
const demoFactor: Record<string, number> = { "Overnight Oats": 2, "Red Lentil Soup": 2 };
const listRecipes = () =>
  recordAdds(
    {},
    "list",
    views()
      .filter((r) => shopping.includes(`· ${r.title}`) || shopping.includes(`, ${r.title}`))
      .map((recipe) => ({ recipe, factor: demoFactor[recipe.title] ?? 1, skipped: [] })),
    0,
  ).list;
// The meal plan note of the preview: day headings "+n" in the example file mean n days from today.
let plan = (q.get("plan") === "leer" ? "" : english ? fixture.planEn : fixture.plan).replace(
  /^## \+(\d+)$/gm,
  (_m, n: string) => dayHeading(days(todayIso(), 7)[Number(n)], noteLang),
);
let mode: ColorMode = q.get("theme") === "dunkel" ? "dunkel" : "hell";
/** What the pretend page gives for a recipe: its own data plus one ingredient and one step. */
function mockPage(path: string): SchemaRecipe {
  const r = parseRecipe(path, texts.get(path)!);
  return {
    title: r.title,
    description: r.description,
    result: r.result,
    timeActive: r.timeActive,
    timeTotal: r.timeTotal,
    ingredients: [...r.ingredients.flatMap((g) => g.ingredients), "1 Prise Salz"],
    steps: [...r.steps, { title: "Servieren", text: "Mit Puderzucker bestäuben." }],
    images: [],
  };
}

let jobs: Job[] = q.has("auftrag")
  ? [
      {
        id: "rz-1",
        input: "https://www.instagram.com/reel/ABC123/",
        kind: "instagram",
        key: "instagram:ABC123",
        since: Date.now() - 4 * 60_000,
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
        errorKey: "noRecipeArrived",
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
    page: q.has("einkauf") ? ("shopping" as const) : q.has("plan") ? ("plan" as const) : undefined,
  };
})();
let tapHintSeen = false;
// A language change at run time can be tried in the console: setPreviewLanguage("en").
Object.assign(window, {
  setPreviewLanguage: (code: string) => {
    setLanguage(code);
    renderPreview();
  },
});

function renderPreview() {
  const theme = mode === "dunkel" ? "dunkel" : "hell";
  root.setAttribute("data-rz-theme", theme);
  // ?palette=obsidian: the colors of the (imitated) Obsidian theme; it follows light or dark like the real view does.
  if (q.get("palette") === "obsidian") {
    root.setAttribute("data-rz-palette", "obsidian");
    document.body.classList.toggle("theme-dark", theme === "dunkel");
  }
  render(
    h(App, {
      recipes: views(),
      theme,
      palette: q.get("palette") === "obsidian" ? "obsidian" : "kitchen",
      mode: mode,
      jobs: jobs,
      // ?proc=none (chosen "None"), ?proc=ai-nokey (own AI chosen without key, Claude set up), ?ohneverarbeiter (nothing set up)
      processor: q.has("ohneverarbeiter") || proc === "none" || proc === "ai-nokey" ? null : "claude",
      status: processorStatus(proc === "none" ? "none" : proc === "ai-nokey" ? "ai" : "auto", {
        claude: proc === "ai-nokey",
        github: false,
        ai: false,
      }),
      folder: "Recipes",
      folderMissing: q.has("ordnerfehlt"),
      start,
      shopping,
      listRecipes: contributionsOf(listRecipes(), views()),
      onShoppingEdit: (e: ShoppingEdit) => {
        const before = shopping;
        shopping = applyShoppingEdit(shopping, e, english ? "Shopping list" : "Einkaufsliste", [], noteLang);
        renderPreview();
        return Promise.resolve(shopping !== before);
      },
      onOpenShoppingNote: () => console.log("öffnen Einkaufsliste"),
      onOpenPlanNote: () => console.log("öffnen Wochenplan"),
      plan,
      onPlanEdit: (e: PlanEdit) => {
        const before = plan;
        plan = applyPlanEdit(plan, e, english ? "Meal plan" : "Wochenplan", noteLang);
        renderPreview();
        return Promise.resolve(plan !== before);
      },
      onPlanShopping: (start: string) => console.log("Woche auf die Einkaufsliste", start),
      onPlanExport: () => console.log("Kalenderdatei"),
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
      onPlan: (p: string, date: string, factor: number) => {
        const r = views().find((v) => v.path === p);
        const count = r?.servings && Math.round(r.servings.count * factor * 100) / 100;
        plan = addToPlan(
          plan,
          date,
          entryLine(r?.name ?? p, count, r?.servings?.unit || undefined, noteLang),
          english ? "Meal plan" : "Wochenplan",
          noteLang,
        );
        renderPreview();
      },
      onShop: (p: string, factor: number, skip: string[]) => console.log("einkaufen", p, factor, skip),
      onAttempt: async (p: string, v: { date: string; modified: string; result: string; rating?: number }) => {
        texts.set(p, insertAttempt(texts.get(p)!, v));
        renderPreview();
        return true;
      },
      // "Fetch again" without a network: the "page" has one more ingredient and one more step; the merge is the real one.
      refetch: {
        cancel: () => undefined,
        preview: async (path: string, useAi?: boolean) => {
          // ?keinedaten=1: the pretend page has no recipe data, so the dialog offers the AI button.
          if (q.has("keinedaten") && !useAi)
            return { ok: false as const, message: "Die Seite enthält keine Rezeptdaten.", canUseAi: true };
          await new Promise((r) => setTimeout(r, 400));
          const plan = planRefetch(path, texts.get(path)!, mockPage(path), {
            format: DEFAULT_FORMAT,
            today: todayIso(),
          });
          return { ok: true as const, changes: plan.changes, via: "page" as const };
        },
        apply: async (path: string) => {
          const plan = planRefetch(path, texts.get(path)!, mockPage(path), {
            format: DEFAULT_FORMAT,
            today: todayIso(),
          });
          texts.set(path, plan.text);
          renderPreview();
          return { ok: true };
        },
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
        jobs = jobs.map((a) =>
          a.id === id ? { ...a, id: id + "n", since: Date.now(), error: undefined, errorKey: undefined } : a,
        );
        renderPreview();
        return { ok: true };
      },
      onSyncNow: () => {
        console.log("Sync");
        return true;
      },
      onHint: (t: string) => console.log("Hinweis", t),
      onKeepAwake: async () => true,
      tapHintSeen,
      onTapHintSeen: () => {
        tapHintSeen = true;
      },
    }),
    root,
  );
}
renderPreview();

// ?mobil=1: what Obsidian mobile puts around the view; ?statusleiste=1: the status bar of the desktop. Measured with the
// same code as the plugin (src/insets.ts).
if (q.has("mobil") || q.has("statusleiste")) {
  const [top, bottom, left, right] = (q.get("sicher") ?? "47,34,0,0").split(",").map((n) => Number(n) || 0);
  const mobile = q.has("mobil");
  if (mobile) {
    document.body.classList.add("mobil-nachbau");
    for (const [k, v] of Object.entries({ top, bottom, left, right }))
      document.body.style.setProperty(`--sim-${k}`, `${v}px`);
  }
  const frame = document.getElementById("mobil")!;
  render(
    h(
      "div",
      null,
      mobile && h("div", { class: "view-header" }, "Better Cooking"),
      mobile &&
        h(
          "div",
          { class: "mobile-navbar" },
          ["Zurück", "Vor", "Neu", "Suche", "Menü"].map((t) => h("span", null, t)),
        ),
      mobile && h("div", { class: "sim-sicher" }),
      q.has("statusleiste") && h("div", { class: "status-bar" }, "Status bar"),
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
      safe: mobile ? { bottom, left, right } : { bottom: 0, left: 0, right: 0 },
      visual: { top: 0, height: window.innerHeight - (typing() ? keys.offsetHeight : 0) },
    });
  };
  window.setInterval(measure, 150);
  window.addEventListener("resize", measure);
  measure();
}
