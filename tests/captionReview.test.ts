// Second round of #116: one-line enumerations, notes in ingredient lists, title yields, hashtags, numbering, wording.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareCaption } from "../src/caption";
import { recipeFromText } from "../src/textRecipe";
import { recipeNote } from "../src/recipeNote";
import { detectSource } from "../src/source";

const saved: unknown[] = [];
vi.mock("../src/localImport", async (orig) => ({
  ...(await orig<typeof import("../src/localImport")>()),
  saveRecipe: vi.fn(async (_a: unknown, _f: unknown, r: { title: string }, o: unknown) => {
    saved.push(o);
    return { status: "gespeichert", path: "x.md", title: r.title, state: "fertig" };
  }),
  loadPage: vi.fn(async () => ({ html: "<html></html>" })),
}));
vi.mock("../src/socialPage", () => ({
  parseSocialPage: () => ({ text: "Reis\nZutaten:\n200 g Reis\nZubereitung:\n1. Kochen." }),
}));
vi.mock("obsidian", () => ({
  requestUrl: vi.fn(async () => ({
    status: 200,
    json: {
      choices: [
        { message: { content: '{"name":"Reis","recipeIngredient":["200 g Reis"],"recipeInstructions":["Kochen."]}' } },
      ],
    },
  })),
}));

const title = (t: string) => recipeFromText(`${t}\n\nZutaten:\n- 200 g Mehl`);

describe("one-line enumerations (#116)", () => {
  const soup =
    "Linsensuppe Zutaten: 200 g rote Linsen, 1 Zwiebel, 500 ml Brühe Zubereitung: 1. Zwiebel anschwitzen. 2. Linsen und Brühe zugeben und 15 Min. kochen.";

  it("splits the numbers of a one-line caption into steps", () => {
    const r = recipeFromText(soup, { caption: true });
    expect(r?.steps.map((s) => s.text)).toEqual([
      "Zwiebel anschwitzen.",
      "Linsen und Brühe zugeben und 15 Min. kochen.",
    ]);
  });

  it("splits a numbered line of pasted text only at the numbers that count on", () => {
    const r = recipeFromText("Zutaten:\n- 1 Ei\n\nZubereitung:\n1. Backen am 3. Tag. 2. Servieren.");
    expect(r?.steps.map((s) => s.text)).toEqual(["Backen am 3. Tag.", "Servieren."]);
  });
});

describe("ingredient notes in one-line captions (#116)", () => {
  it("does not let a note in the middle of the ingredients swallow the following lines", () => {
    const de = "Zutaten:\n1 Dose Kichererbsen. Abspülen.\n200 g Feta\n2 EL Öl\nZubereitung:\n1. Alles mischen.";
    expect(recipeFromText(de, { caption: true })?.ingredients).toEqual([
      "1 Dose Kichererbsen. Abspülen.",
      "200 g Feta",
      "2 EL Öl",
    ]);
    const en = "Ingredients:\n1 can chickpeas. Drain and rinse.\n200 g feta\n2 tbsp oil\nSteps:\n1. Mix everything.";
    expect(recipeFromText(en, { caption: true })?.ingredients).toEqual([
      "1 can chickpeas. Drain and rinse.",
      "200 g feta",
      "2 tbsp oil",
    ]);
    expect(recipeFromText(en, { caption: true })?.steps).toHaveLength(1);
  });

  it.each([
    [
      "Pfannkuchen Zutaten: 200 g Mehl, 2 Eier, Salz und Pfeffer nach Belieben, Öl zum Anbraten. Teig rühren. Ausbacken.",
      ["200 g Mehl", "2 Eier", "Salz und Pfeffer nach Belieben", "Öl zum Anbraten"],
    ],
    [
      "Pancakes Ingredients: 200 g flour, 2 eggs, brown sugar to taste, cream cheese for the frosting. Mix the batter. Fry it.",
      ["200 g flour", "2 eggs", "brown sugar to taste", "cream cheese for the frosting"],
    ],
    [
      "Bowl Zutaten: 1 Dose Mais, Petersilie zum Bestreuen. 2 EL Öl erhitzen. Mais zugeben.",
      ["1 Dose Mais", "Petersilie zum Bestreuen", "2 EL Öl erhitzen"],
    ],
  ])("keeps ingredient notes as ingredients: %s", (text, ingredients) => {
    const r = recipeFromText(text, { caption: true });
    expect(r?.ingredients.slice(0, ingredients.length)).toEqual(ingredients);
    expect(r?.steps.length).toBeGreaterThan(0);
  });

  it("keeps the other parts of a list when one part has a verb", () => {
    const r = recipeFromText("Zutaten: 2 Eier, 100 g Zucker, Eier trennen, 1 Prise Salz", { caption: true });
    expect(r?.ingredients).toEqual(["2 Eier", "100 g Zucker", "Eier trennen", "1 Prise Salz"]);
  });
});

describe("yield in the title (#116)", () => {
  it.each([
    ["Schnelle Tomatensuppe für 2 Personen", "Schnelle Tomatensuppe", "2 Personen"],
    ["Lemon rice (for 4)", "Lemon rice", "4"],
    ["Grundteig für 12 Muffins", "Grundteig für 12 Muffins", "12 Muffins"],
    ["Teig für 2 Pizzen", "Teig für 2 Pizzen", "2 Pizzen"],
    ["Pasta für 2 in 15 Minuten", "Pasta für 2 in 15 Minuten", undefined],
    ["Meal Prep für 5 Tage", "Meal Prep für 5 Tage", undefined],
    ["Müsli for 2 weeks", "Müsli for 2 weeks", undefined],
    ["Suppe für 4", "Suppe", "4"],
  ])("%j", (line, expectedTitle, result) => {
    const r = title(line);
    expect(r?.title).toBe(expectedTitle);
    expect(r?.result).toBe(result);
  });

  it("takes only the start of a very long first line and stays fast", () => {
    const start = Date.now();
    const r = recipeFromText(`${"Suppe ".repeat(3000)}für 4\n- 1 Ei`);
    expect(Date.now() - start).toBeLessThan(500);
    expect(r?.title.length).toBeLessThanOrEqual(120);
  });

  it("removes emoji but keeps flags", () => {
    expect(title("Pasta 🍝 🇮🇹")?.title).toBe("Pasta 🇮🇹");
  });
});

describe("trailing hashtags, second look (#116)", () => {
  const recipe = "Reis\n\nZutaten:\n- 300 g Reis\n\nZubereitung:\n1. Reis 12 Min. kochen.";
  it("skips mentions and closing quotes at the end", () => {
    expect(prepareCaption(`${recipe}\nGuten Appetit #reis #lecker @kochfan`).caption).toBe(true);
    expect(prepareCaption(`${recipe}\nGuten Appetit #reis #lecker”`).caption).toBe(true);
  });
  it("does not make a note with a tags line a caption", () => {
    expect(prepareCaption(`${recipe}\nTags: #rezept #vegan`).caption).toBe(false);
    expect(prepareCaption(`${recipe}\nSchlagwörter: #rezept #vegan`).caption).toBe(false);
  });
});

describe("one numbering pattern (#116)", () => {
  it("treats (1) like 1. and leaves 1.5 and 1.Reis alone", () => {
    const r = recipeFromText("Zutaten:\n- 1 Ei\n\nZubereitung:\n(1) Ei aufschlagen.\n(2) Braten.");
    expect(r?.steps.map((s) => s.text)).toEqual(["Ei aufschlagen.", "Braten."]);
    expect(recipeFromText("Brot\n1.5 EL Öl\n1.Reis kochen\nTeig kneten und backen.")?.ingredients).toEqual([
      "1.5 EL Öl",
    ]);
  });
});

describe("author-numbered steps and sentences (#116)", () => {
  const steps = (body: string) => recipeFromText(`Zutaten:\n- 1 Ei\n\nZubereitung:\n${body}`)?.steps.map((s) => s.text);
  it("keeps one or two sentences together, however many actions they hold", () => {
    expect(steps("1. Mehl sieben und dann Eier zugeben, kneten und ruhen lassen.")).toHaveLength(1);
    expect(steps("1. Mehl sieben. Eier zugeben.")).toHaveLength(1);
  });
  it("splits at sentence ends from three sentences on", () => {
    expect(steps("1. Mehl sieben. Eier zugeben. Kuchen backen.")).toEqual([
      "Mehl sieben.",
      "Eier zugeben.",
      "Kuchen backen.",
    ]);
  });
});

describe("wording and the AI path (#116)", () => {
  beforeEach(() => (saved.length = 0));
  const soup = { title: "Suppe", ingredients: ["1 Ei"], steps: [], images: [] };
  const note = (lang: "de" | "en") =>
    recipeNote(soup, {
      today: "2026-11-27",
      fromText: true,
      format: lang === "en" ? undefined : undefined,
    });

  it("names missing steps in German for text", () => {
    expect(note("de")).toContain("Der Text enthält keine Schritte.");
  });

  it("marks pasted text for the own AI as text, a page as a page", async () => {
    const { importWithAi } = await import("../src/aiImport");
    const ai = { provider: "openai" as const, endpoint: "http://localhost:1/v1", model: "m" };
    const format = { lang: "de" as const, fields: {} } as never;
    await importWithAi({} as never, "R", ai, null, { text: "Reis 200 g" }, [], format);
    await importWithAi({} as never, "R", ai, null, { url: "https://a.example/r", html: "<p>Reis</p>" }, [], format);
    expect(saved.map((o) => (o as { fromText?: boolean }).fromText)).toEqual([true, false]);
  });

  it("marks the caption of a post as text", async () => {
    const { importSocial } = await import("../src/socialImport");
    const e = detectSource("https://www.instagram.com/p/ABC123/");
    const r = await importSocial(
      {
        app: {} as never,
        folder: "R",
        format: { lang: "de", fields: {} } as never,
        extraProperties: [],
        recipes: [],
        followLinks: false,
        fallback: false,
      },
      e,
    );
    expect(r.ok).toBe(true);
    expect((saved.at(-1) as { fromText?: boolean }).fromText).toBe(true);
  });
});
