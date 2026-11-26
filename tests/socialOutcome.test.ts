import { beforeEach, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { fallbackAfter, type FailReason } from "../src/socialFlow";
import { pageFailure, socialFailure, stopsAfter, usableRules, type LinkTry, type TextTry } from "../src/socialOutcome";
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

describe("usableRules", () => {
  const partial = recipeFromText("Zutaten:\n200 g Mehl\n1 Ei");
  const complete = recipeFromText("Zutaten:\n200 g Mehl\n1 Ei\nZubereitung:\n1. Alles verrühren und 10 Min. backen.");
  it("takes a complete recipe always", () => {
    expect(usableRules(complete, true)).toBe(complete);
    expect(usableRules(complete, false)).toBe(complete);
  });
  it("counts a partial recipe as none if a processor can take over, otherwise saves it as before", () => {
    expect(partial?.steps).toHaveLength(0);
    expect(usableRules(partial, true)).toBeUndefined();
    expect(usableRules(partial, false)).toBe(partial);
  });
  it("has nothing for no result", () => {
    expect(usableRules(undefined, false)).toBeUndefined();
  });
});
