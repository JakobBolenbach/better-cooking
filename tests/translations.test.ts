import { describe, expect, it } from "vitest";
import { isTranslationOf, linkValue } from "../src/translations";

describe("linkValue", () => {
  it("reads a quoted link, the nested array of an unquoted link and ignores plain text", () => {
    expect(linkValue("[[Brot]]")).toBe("Brot");
    expect(linkValue("[[Rezepte/Brot|das Brot]]")).toBe("Rezepte/Brot");
    expect(linkValue([["Brot"]])).toBe("Brot");
    expect(linkValue([["Brot|alias"]])).toBe("Brot");
    expect(linkValue(["[[Brot]]"])).toBe("Brot");
    expect(linkValue("Brot")).toBeUndefined();
    expect(linkValue("")).toBeUndefined();
    expect(linkValue(3)).toBeUndefined();
    expect(linkValue([[]])).toBeUndefined();
  });
});

describe("isTranslationOf", () => {
  it("compares the name of the note, not its folder", () => {
    expect(isTranslationOf("Brot", "Brot")).toBe(true);
    expect(isTranslationOf("Rezepte/Brot", "Brot")).toBe(true);
    expect(isTranslationOf("Brotchen", "Brot")).toBe(false);
    expect(isTranslationOf(undefined, "Brot")).toBe(false);
  });
});
