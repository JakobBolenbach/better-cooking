import { afterEach, describe, expect, it } from "vitest";
import { language, localizeNumbers, resolveLanguage, resolveNoteLang, setLanguage, tr } from "../src/i18n";
import { formatQuantity, scaleLine, scaledResult, readResult, servingsText } from "../src/quantities";
import { servingsUnitText } from "../src/servingsWords";
import { amountText, itemLine, itemFromLine } from "../src/shopping";
import { dayHeading, entryLine, weekday } from "../src/mealPlan";
import { servingsRaw } from "../src/planEdit";
import { migrateSettings } from "../src/migrate";
import { readShoppingRows } from "../src/shoppingEdit";
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
    expect(r("für 4 Personen")).toBe("4 people");
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
    expect(dayHeading("2026-11-30")).toBe("## 2026-11-30 · Monday");
    expect(weekday("2026-11-30", "de")).toBe("Montag");
    expect(entryLine("Zopf", 4, "Portionen", "en")).toBe("- [[Zopf]] · 4 servings");
    expect(entryLine("Zopf", 4, "servings", "de")).toBe("- [[Zopf]] · 4 Portionen");
    expect(entryLine("Zopf", 1, "Zopf", "en")).toBe("- [[Zopf]] · 1 Zopf");
    expect(servingsRaw("- [[Zopf]] · 4 Portionen", 1.5, "de")).toBe("- [[Zopf]] · 1 ½ Portionen");
  });
});

describe("strings", () => {
  it("the new texts exist in both languages", () => {
    setLanguage("de");
    expect(tr("setLanguage")).toBe("Sprache");
    expect(language()).toBe("de");
  });

  it("no hard-coded visible text in the components (JSX text and label attributes go through tr)", () => {
    const dir = new URL("../src/ui/", import.meta.url);
    const found: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".tsx") && n !== "icons.tsx")) {
      const s = readFileSync(new URL(f, dir), "utf8");
      for (const m of s.matchAll(/(?:aria-label|title|placeholder|alt)="([^"{]*\p{L}{2}[^"{]*)"/gu))
        found.push(`${f}: ${m[0]}`);
      for (const m of s.matchAll(/<[A-Za-z][\w.]*(?:\s[^<>]*?)?>([^<>{}=;`()]*\p{L}{2}[^<>{}=;`()]*)(?=<|\{)/gu))
        if (m[1].trim()) found.push(`${f}: ${m[1].trim()}`);
    }
    expect(found).toEqual([]);
  });
});
