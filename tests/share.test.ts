import { beforeEach, describe, expect, it } from "vitest";
import { recipeHtml, recipeText } from "../src/share";
import { setLanguage } from "../src/i18n";

beforeEach(() => setLanguage("en"));

const r = {
  title: "Pancakes",
  description: "Thin & golden.",
  servings: { count: 4, unit: "" },
  source: "https://example.org/p?a=1&b=2",
  author: "Test Kitchen",
  timeTotal: 30,
  ingredients: [{ ingredients: ["250 g flour", "2 eggs"] }, { title: "Equipment", ingredients: ["1 pan (24 cm)"] }],
  steps: [{ title: "Mix", text: "Whisk for 2 minutes." }, { text: "Fry <thin>." }],
  tips: ["Serve warm."],
};

describe("recipeText", () => {
  it("writes a message with scaled quantities", () => {
    expect(recipeText(r, 2)).toBe(
      [
        "PANCAKES",
        "",
        "Thin & golden.",
        "",
        "Ingredients (8 servings)",
        "- 500 g flour",
        "- 4 eggs",
        "Equipment:",
        "- 1 pan (24 cm)",
        "",
        "Method",
        "1. Mix: Whisk for 2 minutes.",
        "2. Fry <thin>.",
        "",
        "Tips",
        "- Serve warm.",
        "",
        "Source: https://example.org/p?a=1&b=2",
      ].join("\n"),
    );
  });

  it("leaves out what the recipe does not have", () => {
    const t = recipeText({ ...r, description: undefined, servings: undefined, source: "x", tips: [], steps: [] });
    expect(t).toBe("PANCAKES\n\nIngredients\n- 250 g flour\n- 2 eggs\nEquipment:\n- 1 pan (24 cm)");
  });
});

describe("recipeHtml", () => {
  it("escapes all text and links only an http(s) source", () => {
    const h = recipeHtml({ ...r, title: "<script>alert(1)</script>" }, 1);
    expect(h).not.toContain("<script>");
    expect(h).toContain("&lt;script&gt;");
    expect(h).toContain("Fry &lt;thin&gt;.");
    expect(h).toContain('<a href="https://example.org/p?a=1&amp;b=2">');
    expect(recipeHtml({ ...r, source: "javascript:alert(1)" })).not.toContain("<a ");
  });

  it("embeds only data: images", () => {
    expect(recipeHtml(r, 1, "data:image/png;base64,AAAA")).toContain('<img src="data:image/png;base64,AAAA"');
    expect(recipeHtml(r, 1, "https://tracker.example/x.png")).not.toContain("<img");
  });
});
