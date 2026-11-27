import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { fallbackAfter, type FailReason } from "../src/socialFlow";
import { pageFailure, socialFailure, stopsAfter, textOutcome, type LinkTry, type TextTry } from "../src/socialOutcome";
import { recipeFromText } from "../src/textRecipe";

beforeEach(() => setLanguage("en"));

const noData: LinkTry = { noData: true };
const down: LinkTry = { error: "Page not reachable (offline).", technical: true };
const status: LinkTry = { error: "The page answers with error 403.", technical: false };
const dup: LinkTry = { duplicate: "https://a.example/r" };
const text = (error: string, why: FailReason): TextTry => ({ error, why });

describe("socialFailure", () => {
  const cases: [string, LinkTry[], TextTry, FailReason, string[]][] = [
    ["no link, no text", [], "none", "unreadable", ["no readable text", "Paste the text"]],
    ["linked page without recipe data, no text", [noData], "none", "noRecipe", ["The linked page has no recipe data."]],
    ["linked page unreachable, no text", [down], "none", "technical", ["not reachable"]],
    ["linked page with an error status, no text", [status], "none", "unreadable", ["error 403"]],
    ["one page unreachable, one without data", [down, noData], "none", "noRecipe", ["no recipe data", "not reachable"]],
    [
      "a duplicate wins over everything",
      [noData, dup],
      text("x", "noRecipe"),
      "duplicate",
      ["Already saved", "source"],
    ],
    ["no link, text without recipe", [], text("No ingredients.", "noRecipe"), "noRecipe", ["No ingredients."]],
    [
      "link without data, then text without recipe",
      [noData],
      text("No ingredients.", "noRecipe"),
      "noRecipe",
      ["The linked page has no recipe data. No ingredients."],
    ],
    ["own AI failed technically", [], text("The AI key is rejected.", "technical"), "technical", ["key is rejected"]],
  ];
  it.each(cases)("%s", (_name, tries, t, why, parts) => {
    const f = socialFailure(tries, t);
    expect(f.why).toBe(why);
    for (const p of parts) expect(f.message).toContain(p);
  });
  it("gives the bare reason without the paste hint for a processor that takes over", () => {
    const f = socialFailure([noData], "none");
    expect(f.message).toContain("Paste the text");
    expect(f.detail).toBe("The linked page has no recipe data.");
    expect(pageFailure("Page not reachable (x).", true)).toMatchObject({
      why: "technical",
      detail: "Page not reachable (x).",
    });
    expect(pageFailure("The page answers with error 429.", false).why).toBe("unreadable");
  });
  it("lets a processor take over only after noRecipe or unreadable", () => {
    const reasons: FailReason[] = ["noRecipe", "unreadable", "technical", "duplicate"];
    for (const why of reasons)
      expect(fallbackAfter("claude", why) !== null).toBe(why === "noRecipe" || why === "unreadable");
  });
});

describe("order of the steps", () => {
  it("stops after a saved note and after a duplicate, not after a page without data", () => {
    expect(stopsAfter({ saved: true })).toBe("saved");
    expect(stopsAfter(dup)).toBe("duplicate");
    expect(stopsAfter(noData)).toBeNull();
    expect(stopsAfter(down)).toBeNull();
  });
});

describe("textOutcome", () => {
  const partial = recipeFromText("Zutaten:\n200 g Mehl\n1 Ei");
  const onlySteps = recipeFromText("Zubereitung:\n1. Alles verrühren und 10 Min. backen.");
  const complete = recipeFromText("Zutaten:\n200 g Mehl\n1 Ei\nZubereitung:\n1. Alles verrühren und 10 Min. backen.");
  const empty = { title: "x", ingredients: [], steps: [], images: [] };
  const any = [complete, partial, onlySteps];
  it("has the parts the table below needs", () => {
    expect(partial?.steps).toHaveLength(0);
    expect(onlySteps?.ingredients).toHaveLength(0);
  });
  it("always a first version when a processor was chosen on purpose (run always)", () => {
    for (const r of any) expect(textOutcome(r, { run: "always", fallback: true, ai: false })).toBe("firstVersion");
  });
  it("with Automatic a first version only for an incomplete result, a complete one is saved without a job (cost)", () => {
    const o = { run: "partial" as const, fallback: true };
    expect(textOutcome(complete, { ...o, ai: false })).toBe("saved");
    expect(textOutcome(complete, { ...o, ai: true })).toBe("saved");
    for (const r of [partial, onlySteps])
      for (const ai of [false, true]) expect(textOutcome(r, { ...o, ai })).toBe("firstVersion");
  });
  it("without a first version: a partial result of the rules goes to a processor that can take over, as before", () => {
    expect(textOutcome(partial, { fallback: true, ai: false })).toBe("none");
    expect(textOutcome(partial, { fallback: true, ai: true })).toBe("saved");
    expect(textOutcome(complete, { fallback: true, ai: false })).toBe("saved");
  });
  it("saves every result when no processor is set up", () => {
    for (const r of any) expect(textOutcome(r, { fallback: false, ai: false })).toBe("saved");
  });
  it("has nothing for no result and for a recipe without ingredients and steps", () => {
    for (const run of [undefined, "always", "partial"] as const) {
      expect(textOutcome(undefined, { run, fallback: true, ai: false })).toBe("none");
      expect(textOutcome(empty, { run, fallback: true, ai: false })).toBe("none");
    }
  });
});
