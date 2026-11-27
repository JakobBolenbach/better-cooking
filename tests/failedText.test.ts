import { describe, expect, it } from "vitest";
import { failedText } from "../src/failedText";
import { setLanguage } from "../src/i18n";

describe("failedText", () => {
  it("shows the message of an exception", () => {
    setLanguage("en");
    expect(failedText(new Error("File already exists."))).toBe("That did not work: File already exists.");
  });
  it("accepts anything thrown", () => expect(failedText("boom")).toContain("boom"));
});
