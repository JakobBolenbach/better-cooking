import { afterEach, describe, expect, it } from "vitest";
import { language, localizeNumbers, resolveLanguage, resolveNoteLang, setLanguage, tr } from "../src/i18n";
import { formatQuantity, scaleLine, scaledResult, readNumber, readResult, servingsText } from "../src/quantities";
import { servingsUnitText } from "../src/servingsWords";
import { amountText, itemLine, itemFromLine } from "../src/shopping";
import { dayHeading, entryLine, weekday } from "../src/mealPlan";
import { servingsRaw } from "../src/planEdit";
import { migrateSettings } from "../src/migrate";
import { readShoppingRows } from "../src/shoppingEdit";
import { recipeHtml, recipeText } from "../src/share";
import { readdirSync, readFileSync } from "node:fs";

afterEach(() => setLanguage("en"));
const text = (parts: { text: string }[]) => parts.map((p) => p.text).join("");

describe("language setting (#77)", () => {
  it("resolves the interface language and the language of new notes", () => {
    expect(resolveLanguage("auto", "de-AT")).toBe("de");
    expect(resolveLanguage("auto", "fr")).toBe("en");
    expect(resolveLanguage("en", "de")).toBe("en");
    expect(resolveNoteLang("ui", "de")).toBe("de");
    expect(resolveNoteLang("en", "de")).toBe("en");
  });

  it("migration keeps a stored note format and defaults the language", () => {
    expect(migrateSettings({ noteFormat: "en" }).noteFormat).toBe("en");
    expect(migrateSettings({ folder: "R" }).noteFormat).toBe("de");
    expect(migrateSettings({ noteFormat: "xx", language: "fr" })).toEqual({});
    expect(migrateSettings({ language: "de" }).language).toBe("de");
  });
});

describe("generic servings words follow the interface language", () => {
  it("translates Portion(en), Person(en), serving(s), people", () => {
    setLanguage("en");
    expect(servingsText({ count: 4, unit: "Portionen" })).toBe("4 servings");
    expect(servingsText({ count: 1, unit: "Portion" })).toBe("1 serving");
    expect(servingsText({ count: 4, unit: "Personen" })).toBe("4 people");
    expect(servingsText({ count: 1, unit: "Person" })).toBe("1 person");
    expect(servingsText({ count: 4, unit: "", countTo: 6 })).toBe("4 to 6 servings");
    setLanguage("de");
    expect(servingsText({ count: 4, unit: "servings" })).toBe("4 Portionen");
    expect(servingsText({ count: 1, unit: "serving" })).toBe("1 Portion");
    expect(servingsText({ count: 4, unit: "people" })).toBe("4 Personen");
  });

  it("keeps units that belong to the recipe", () => {
    setLanguage("en");
    expect(servingsText({ count: 1, unit: "Zopf" })).toBe("1 Zopf");
    expect(servingsUnitText("Brötchen", 9)).toBe("Brötchen");
  });

  it("the yield text is translated at the original amount too", () => {
    setLanguage("en");
    const r = (s: string) => scaledResult(s, readResult(s), 1);
    expect(r("4 Portionen")).toBe("4 servings");
    expect(r("für 4 Personen")).toBe("für 4 Personen");
    expect(scaledResult("für 4 Personen", readResult("für 4 Personen"), 1.5)).toBe("6 Personen");
    expect(r("4 Personen")).toBe("4 people");
    expect(r("Ergibt ca. 12 Stück")).toBe("Ergibt ca. 12 Stück");
    expect(r("9 Brötchen")).toBe("9 Brötchen");
  });
});

describe("numbers follow the interface language in the display", () => {
  it("decimal separator", () => {
    setLanguage("en");
    expect(formatQuantity(1.5, "l")).toBe("1.5");
    expect(text(scaleLine("1,5 l Gemüsebrühe", 1))).toBe("1.5 l Gemüsebrühe");
    expect(text(scaleLine("1.5 l Gemüsebrühe", 2))).toBe("3 l Gemüsebrühe");
    expect(text(scaleLine("0,75 l Milch", 2))).toBe("1.5 l Milch");
    expect(text(scaleLine("2 bis 3 Zehen Knoblauch", 1))).toBe("2 to 3 Zehen Knoblauch");
    setLanguage("de");
    expect(formatQuantity(1.5, "l")).toBe("1,5");
    expect(text(scaleLine("1.5 l Gemüsebrühe", 1))).toBe("1,5 l Gemüsebrühe");
    expect(localizeNumbers("1.5 l und 2,25 kg und 405")).toBe("1,5 l und 2,25 kg und 405");
  });

  it("the shopping page shows the amount in the interface language, the note keeps its own", () => {
    setLanguage("en");
    const note = "- [ ] 1,5 l Milch\n";
    expect(readShoppingRows(note)[0].amount).toBe("1.5 l");
    expect(itemLine(itemFromLine("1.5 l Milch", undefined), "de")).toBe("- [ ] 1,5 l Milch");
    expect(itemLine(itemFromLine("1,5 l Milch", undefined), "en")).toBe("- [ ] 1.5 l Milch");
    expect(amountText(1500, "ml", "en")).toBe("1.5 l");
  });
});

describe("what is written into notes follows the note language", () => {
  it("weekday in the heading and servings word in the entry", () => {
    setLanguage("en");
    expect(dayHeading("2026-11-30", "de")).toBe("## 2026-11-30 · Montag");
    expect(dayHeading("2026-11-30", "en")).toBe("## 2026-11-30 · Monday");
    expect(weekday("2026-11-30", "de")).toBe("Montag");
    expect(entryLine("Zopf", 4, "Portionen", "en")).toBe("- [[Zopf]] · 4 servings");
    expect(entryLine("Zopf", 4, "servings", "de")).toBe("- [[Zopf]] · 4 Portionen");
    expect(entryLine("Zopf", 1, "Zopf", "en")).toBe("- [[Zopf]] · 1 Zopf");
    expect(servingsRaw("- [[Zopf]] · 4 Portionen", 1.5)).toBe("- [[Zopf]] · 1 ½ Portionen");
  });
});

describe("strings", () => {
  it("the new texts exist in both languages", () => {
    setLanguage("de");
    expect(tr("setLanguage")).toBe("Sprache");
    expect(language()).toBe("de");
  });

  it("no hard-coded visible text in src/ui and no literal text in notices and settings (pragmatic scan)", () => {
    const found: string[] = [];
    const scan = (dirUrl: URL, files: string[], jsx: boolean) => {
      for (const f of files) {
        const s = readFileSync(new URL(f, dirUrl), "utf8");
        const mark = (re: RegExp) => {
          for (const m of s.matchAll(re)) found.push(`${f}: ${m[0].replace(/\s+/g, " ").slice(0, 60)}`);
        };
        mark(/(?:aria-label|title|placeholder|alt)="[^"{]*\p{L}{2}[^"{]*"/gu);
        mark(/\b(?:setName|setDesc|setButtonText|setTooltip|setPlaceholder)\(\s*["'`](?!https?:|trig_|\$\{)/g);
        mark(/new Notice\(\s*["'`][^"'`]*\p{L}/gu);
        mark(/createEl\([^)]*text:\s*["'`]\p{L}/gu);
        if (jsx)
          for (const m of s.matchAll(/<[A-Za-z][\w.]*(?:\s[^<>]*?)?>([^<>{}=;`()]*\p{L}{2}[^<>{}=;`()]*)(?=<|\{)/gu))
            if (m[1].trim()) found.push(`${f}: ${m[1].trim()}`);
      }
    };
    const ui = new URL("../src/ui/", import.meta.url);
    scan(
      ui,
      readdirSync(ui).filter((n) => /\.tsx?$/.test(n) && n !== "icons.tsx"),
      true,
    );
    const src = new URL("../src/", import.meta.url);
    scan(
      src,
      readdirSync(src).filter((n) => n.endsWith(".ts") && n !== "development.ts"),
      false,
    );
    expect(found).toEqual([]);
  });
});

describe("ambiguous numbers (#77)", () => {
  it("1.000 and 1,500 are never rewritten for display", () => {
    expect(localizeNumbers("1.000 g Mehl, 1,5 l Milch, 12.500 g", "en")).toBe("1.000 g Mehl, 1.5 l Milch, 12.500 g");
    expect(localizeNumbers("1,500 g, 1.25 l", "de")).toBe("1,500 g, 1,25 l");
  });

  it("with three decimals the unit decides: grams, millilitres and no unit are thousands, others decimals", () => {
    for (const lang of ["de", "en"] as const) {
      setLanguage(lang);
      expect(readNumber("1.000", "g")).toBe(1000);
      expect(readNumber("1,000", "g")).toBe(1000);
      expect(readNumber("1.500", "ml")).toBe(1500);
      expect(readNumber("1,500", "mg")).toBe(1500);
      expect(readNumber("1.000")).toBe(1000);
      expect(readNumber("1,500", "kg")).toBe(1.5);
      expect(readNumber("1.500", "l")).toBe(1.5);
      expect(readNumber("1,5", "l")).toBe(1.5);
      expect(readNumber("1.5", "l")).toBe(1.5);
      expect(readNumber("0,250", "TL")).toBe(0.25);
    }
  });

  it("a leading zero is never a thousands group", () => {
    expect(readNumber("0,125", "g")).toBe(0.125);
    expect(readNumber("0.250", "ml")).toBe(0.25);
    setLanguage("en");
    expect(localizeNumbers("0,125 g, 0.250 ml")).toBe("0.125 g, 0.250 ml");
    expect(text(scaleLine("0,125 g Safran", 2))).toBe("0.3 g Safran");
  });

  it("an ambiguous number that is a decimal by its unit is shown as one", () => {
    setLanguage("en");
    expect(text(scaleLine("1,500 kg Mehl", 1))).toBe("1.5 kg Mehl");
    expect(text(scaleLine("1.500 l Wasser", 1))).toBe("1.5 l Wasser");
    expect(text(scaleLine("1,500 g Mehl", 1))).toBe("1,500 g Mehl");
    setLanguage("de");
    expect(text(scaleLine("1.500 kg Mehl", 1))).toBe("1,5 kg Mehl");
  });

  it("scaling and the shopping list read the same", () => {
    setLanguage("en");
    expect(text(scaleLine("1.000 g Mehl", 1))).toBe("1.000 g Mehl");
    expect(text(scaleLine("1.000 g Mehl", 2))).toBe("2000 g Mehl");
    expect(text(scaleLine("1,000 g flour", 0.5))).toBe("500 g flour");
    expect(text(scaleLine("1,500 l Wasser", 2))).toBe("3 l Wasser");
    expect(itemLine(itemFromLine("1.000 g Mehl", "A"), "de")).toBe("- [ ] 1 kg Mehl · A");
    expect(itemLine(itemFromLine("1,000 g flour", "A"), "en")).toBe("- [ ] 1 kg flour · A");
    expect(itemLine(itemFromLine("1.500 ml Milch", "A"), "en")).toBe("- [ ] 1.5 l Milch · A");
    expect(itemLine(itemFromLine("1,5 l Milch", "A"), "en")).toBe("- [ ] 1.5 l Milch · A");
    expect(itemLine(itemFromLine("1.5 l Milch", "A"), "de")).toBe("- [ ] 1,5 l Milch · A");
  });
});

describe("pieces and the yield", () => {
  it("Stück and pieces follow the interface language, introductory words stay", () => {
    setLanguage("en");
    expect(servingsText({ count: 12, unit: "Stück" })).toBe("12 pieces");
    const r = (s: string, f: number) => scaledResult(s, readResult(s), f);
    expect(r("Ergibt ca. 12 Stück", 1.5)).toBe("Ergibt ca. 18 Stück");
    setLanguage("de");
    expect(servingsText({ count: 12, unit: "pieces" })).toBe("12 Stück");
  });
});

describe("share and print", () => {
  it("amounts are formatted in the interface language also at the original amount", () => {
    const r = {
      title: "T",
      description: "",
      servings: { count: 4, unit: "Portionen" },
      ingredients: [{ title: "", ingredients: ["1,5 l Milch"] }],
      steps: [],
      tips: [],
      source: "",
    } as never;
    setLanguage("en");
    expect(recipeText(r, 1)).toContain("(4 servings)");
    expect(recipeText(r, 1)).toContain("- 1.5 l Milch");
    expect(recipeHtml(r, 1)).toContain('<html lang="en">');
    setLanguage("de");
    expect(recipeText(r, 1)).toContain("- 1,5 l Milch");
  });
});
