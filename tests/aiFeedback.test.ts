// Feedback through the own AI (issue #120): the AI is asked even for a page with recipe data, gets the feedback only
// as a marked block, and its answer goes through the same checks and the same merge as "Fetch again".
import { beforeEach, describe, expect, it, vi } from "vitest";

const sent: { url: string; body: string }[] = [];
let answer = "";
vi.mock("obsidian", () => ({
  requestUrl: async (r: { url: string; body: string }) => {
    sent.push(r);
    return { status: 200, json: { content: [{ type: "text", text: answer }] } };
  },
}));

import { recipeWithAi } from "../src/aiImport";
import { currentRecipe } from "../src/feedback";
import { planRefetch } from "../src/refetch";
import { recipeNote } from "../src/recipeNote";
import { DEFAULT_FORMAT } from "../src/noteFormat";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import type { SchemaRecipe } from "../src/schemaorg";

const ai = { provider: "anthropic" as const, endpoint: "", model: "m" };
const SOURCE = "https://example.org/biskuit";
const first: SchemaRecipe = {
  title: "Biskuit",
  ingredients: ["4 Eier", "100 g Zucker"],
  steps: [{ text: "Bei 180 °C backen." }],
  images: [],
};
const html = `<html><head><script type="application/ld+json">${JSON.stringify({
  "@type": "Recipe",
  name: "Biskuit",
  recipeIngredient: ["4 Eier", "100 g Zucker"],
  recipeInstructions: ["Bei 180 °C backen."],
})}</script></head><body><p>Biskuit. Bei 180 °C backen.</p></body></html>`;
const imported = recipeNote(first, { source: SOURCE, today: "2026-11-01", format: DEFAULT_FORMAT });
const fb = (text: string) => ({
  text,
  current: currentRecipe(parseRecipe("A.md", imported, 0, DEFAULT_FORMAT.fields)),
});

beforeEach(() => {
  sent.length = 0;
  setLanguage("de");
  answer = JSON.stringify({
    name: "Biskuit",
    recipeIngredient: ["4 Eier", "100 g Zucker"],
    recipeInstructions: [{ "@type": "HowToStep", text: "Bei 200 °C backen." }],
  });
});

describe("recipeWithAi with feedback", () => {
  it("asks the AI for a page that has recipe data, with the page text, the recipe and the feedback", async () => {
    const r = await recipeWithAi(ai, "k", { url: SOURCE, html }, DEFAULT_FORMAT, fb("Ofen auf 200 °C"));
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0].body) as { system: string; messages: { content: string }[] };
    const user = body.messages[0].content;
    expect(user).toContain("<material>");
    expect(user).toContain("<current_recipe>");
    expect(user).toContain("<feedback>\nOfen auf 200 °C\n</feedback>");
    expect(body.system).not.toContain("Ofen auf 200 °C");
    expect(body.system).toContain("comes from the user");
    expect("recipe" in r && r.recipe.steps[0].text).toBe("Bei 200 °C backen.");
  });
  it("uses the note's own recipe when there is no page or text", async () => {
    await recipeWithAi(ai, "k", {}, DEFAULT_FORMAT, fb("x"));
    const user = (JSON.parse(sent[0].body) as { messages: { content: string }[] }).messages[0].content;
    expect(user).not.toContain("<material>");
    expect(user).toContain("<current_recipe>");
  });
  it("keeps the normal request without feedback", async () => {
    await recipeWithAi(ai, "k", { url: SOURCE, html }, DEFAULT_FORMAT);
    const body = JSON.parse(sent[0].body) as { system: string; messages: { content: string }[] };
    expect(body.messages[0].content).not.toContain("<feedback>");
    expect(body.system).not.toContain("<feedback>");
  });
  it("defuses what the AI answers like every import (no link or embed from the answer)", async () => {
    answer = JSON.stringify({
      name: "Biskuit",
      image: "https://evil.example/x.png",
      recipeIngredient: ["4 Eier", "![[geheim]] 100 g Zucker"],
      recipeInstructions: [{ "@type": "HowToStep", text: "Backen. <script>alert(1)</script>" }],
    });
    const r = await recipeWithAi(ai, "k", { url: SOURCE, html }, DEFAULT_FORMAT, fb("x"));
    expect("recipe" in r && r.recipe.images).toEqual([]);
    const text = recipeNote("recipe" in r ? r.recipe : first, {
      source: SOURCE,
      today: "2026-11-27",
      format: DEFAULT_FORMAT,
    });
    expect(text).not.toContain("![[geheim]]");
    expect(text).not.toContain("<script>");
  });
  it("goes through the change list of Fetch again and keeps hand edits", async () => {
    const edited = imported.replace("- 100 g Zucker", "- 80 g Zucker");
    const r = await recipeWithAi(ai, "k", { url: SOURCE, html }, DEFAULT_FORMAT, fb("Ofen auf 200 °C"));
    if (!("recipe" in r)) throw new Error("no recipe");
    const o = { format: DEFAULT_FORMAT, today: "2026-11-27" };
    const plan = planRefetch(edited, r.recipe, { ...o, replace: [] });
    expect(plan.changes.map((c) => c.part)).toContain("steps");
    expect(plan.edited).toEqual(["ingredients"]);
    expect(plan.text).toContain("200 °C");
    expect(plan.text).toContain("80 g Zucker");
    const replaced = planRefetch(edited, r.recipe, { ...o, replace: ["ingredients"] });
    expect(replaced.text).toContain("100 g Zucker");
  });
});
