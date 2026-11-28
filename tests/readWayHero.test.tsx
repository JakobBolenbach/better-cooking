// @vitest-environment jsdom
// The line on the recipe page that says how the recipe was read (ADR 0008).
import { afterEach, describe, expect, it } from "vitest";
import { h, render } from "preact";
import { RecipeHero } from "../src/ui/recipeHero";
import { setLanguage } from "../src/i18n";
import type { RecipeView } from "../src/types";

afterEach(() => setLanguage("en"));

const base: RecipeView = {
  path: "R/A.md",
  name: "A",
  title: "A",
  status: "ausprobieren",
  images: [],
  ingredients: [],
  steps: [],
  tips: [],
  attempts: [],
  notes: [],
  mtime: 0,
  imageSrcs: [],
} as unknown as RecipeView;

const shown = (r: Partial<RecipeView>) => {
  const box = document.createElement("div");
  render(h(RecipeHero, { r: { ...base, ...r }, faktor: 1, onOpen: () => undefined }), box);
  return box.querySelector(".rz-weg")?.textContent;
};

describe("way of reading on the recipe page", () => {
  it("says it in the interface language", () => {
    expect(shown({ importVia: "page" })).toBe("Read without AI (recipe data of the page)");
    expect(shown({ importVia: "rules" })).toBe("Read without AI (recognised from the text)");
    expect(shown({ importVia: "ai" })).toBe("Read with your AI");
    setLanguage("de");
    expect(shown({ importVia: "page" })).toBe("Gelesen ohne KI (Rezeptdaten der Seite)");
    expect(shown({ importVia: "ai" })).toBe("Gelesen mit deiner KI");
    expect(shown({ job: "rz-abc" })).toBe("Gelesen von Claude oder GitHub");
  });

  it("says a translation by the own AI is translated", () => {
    expect(shown({ importVia: "ai", translationOf: "Original" })).toBe("Translated with your AI");
    setLanguage("de");
    expect(shown({ importVia: "ai", translationOf: "Original" })).toBe("Übersetzt mit deiner KI");
    expect(shown({ importVia: "page", translationOf: "Original" })).toBe("Gelesen ohne KI (Rezeptdaten der Seite)");
  });

  it("shows nothing for a note of the plugin that got a job ID later", () => {
    expect(shown({ job: "rz-abc", importHash: '"v1;title:1k2j"' })).toBeUndefined();
  });

  it("shows nothing for older notes without the field and without a job", () => {
    expect(shown({})).toBeUndefined();
  });

  it("shows it for a note without a source or author as well", () => {
    expect(shown({ importVia: "rules", source: undefined, author: undefined })).toBe(
      "Read without AI (recognised from the text)",
    );
  });
});
