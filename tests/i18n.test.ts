import { afterEach, describe, expect, it } from "vitest";
import { formatDate, language, setLanguage, toLang, tr } from "../src/i18n";
import { detectSource } from "../src/source";
import { evaluateResponse } from "../src/processor";
import { fieldName } from "../src/search";

afterEach(() => setLanguage("en"));

describe("i18n", () => {
  it("maps Obsidian language codes, English by default", () => {
    expect(toLang("de")).toBe("de");
    expect(toLang("de-AT")).toBe("de");
    expect(toLang("en")).toBe("en");
    expect(toLang("fr")).toBe("en");
    expect(toLang(undefined)).toBe("en");
    expect(language()).toBe("en");
  });

  it("fills placeholders and keeps unknown ones", () => {
    expect(tr("hitsMany", { n: 3, q: "mehl" })).toBe("3 recipes for “mehl”");
    setLanguage("de");
    expect(tr("hitsMany", { n: 3, q: "mehl" })).toBe("3 Rezepte für „mehl“");
    expect(tr("stepNOfM", { n: 2 })).toBe("Schritt 2 von {m}");
  });

  it("translates when text is shown, not at import time", () => {
    expect(detectSource("https://www.instagram.com/reel/BcExample01/").label).toBe("Instagram post");
    expect(fieldName("ingredients")).toBe("ingredients");
    setLanguage("de");
    expect(detectSource("https://www.instagram.com/reel/BcExample01/").label).toBe("Instagram-Beitrag");
    expect(detectSource("https://example.org/r").label).toBe("Rezeptseite example.org");
    expect(fieldName("ingredients")).toBe("Zutaten");
    expect(evaluateResponse("github", 404, null)).toEqual({
      ok: false,
      message: "Repo oder Workflow nicht gefunden (Token-Rechte und Repo prüfen)",
    });
  });

  it("formats dates per language", () => {
    expect(formatDate("2026-11-24")).toBe("24 Nov 2026");
    setLanguage("de");
    expect(formatDate("2026-11-24")).toBe("24.11.2026");
    expect(formatDate("gestern")).toBe("gestern");
  });
});
