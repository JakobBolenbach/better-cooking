import { beforeAll, describe, expect, it } from "vitest";
import { setLanguage } from "../src/i18n";
import { changeText } from "../src/ui/refetchModal";

describe("changeText", () => {
  beforeAll(() => setLanguage("de"));
  it("counts for lists that differ in number, and says changed where the number is the same", () => {
    expect(changeText({ part: "steps", from: 3, to: 11 })).toBe("Schritte: 3 → 11");
    expect(changeText({ part: "ingredients", from: 5, to: 5 })).toBe("Zutaten: geändert");
    expect(changeText({ part: "title" })).toBe("Titel");
  });
});
