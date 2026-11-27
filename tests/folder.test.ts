import { describe, expect, it } from "vitest";
import { folderMissing, inFolder, isRecipeFile, cleanFolder, nameTaken, DEFAULT_FOLDER } from "../src/folder";

describe("recipe folder", () => {
  it("cleans the input", () => {
    expect(cleanFolder("  Kochen/Rezepte/ ")).toBe("Kochen/Rezepte");
    expect(cleanFolder("/Rezepte")).toBe("Rezepte");
    expect(cleanFolder("Kochen\\Rezepte")).toBe("Kochen/Rezepte");
    expect(cleanFolder("Kochen//./Rezepte")).toBe("Kochen/Rezepte");
    expect(cleanFolder("")).toBe(DEFAULT_FOLDER);
    expect(cleanFolder("/")).toBe("");
  });

  it("erkennt Rezeptnotizen direkt im Ordner", () => {
    expect(isRecipeFile("Rezepte/Brot.md", "Rezepte")).toBe(true);
    expect(isRecipeFile("Rezepte/Bilder/Brot.md", "Rezepte")).toBe(false);
    // Proposals (ADR 0007) and backups wait in subfolders and are no recipes.
    expect(isRecipeFile("Rezepte/Verbesserungen/rz-1.md", "Rezepte")).toBe(false);
    expect(isRecipeFile("Rezepte/Vorversionen/Brot (Vorversion 2026-11-27).md", "Rezepte")).toBe(false);
    expect(isRecipeFile("Rezepte/Vorversionen/Brot (Vorversion 2026-11-26).md", "Rezepte")).toBe(false);
    expect(isRecipeFile("Rezepte/AGENTS.md", "Rezepte")).toBe(false);
    expect(isRecipeFile("Rezepte/Brot Titelbild.webp", "Rezepte")).toBe(false);
    expect(isRecipeFile("Rezepte-alt/Brot.md", "Rezepte")).toBe(false);
    expect(isRecipeFile("Brot.md", "")).toBe(true);
  });

  it("reports changes below the folder", () => {
    expect(inFolder("Rezepte/Bilder/Brot.webp", "Rezepte")).toBe(true);
    expect(inFolder("Rezepte-alt/Brot.md", "Rezepte")).toBe(false);
    expect(inFolder("Rezepte", "Rezepte")).toBe(true); // creating the folder itself
    expect(inFolder("irgendwo/Brot.md", "")).toBe(true);
  });

  it("knows a missing folder; the top level always exists", () => {
    expect(folderMissing("Rezepte", false)).toBe(true);
    expect(folderMissing("Rezepte", true)).toBe(false);
    expect(folderMissing("", false)).toBe(false);
  });
});

describe("nameTaken", () => {
  it("ignores case", () => expect(nameTaken(["Banana Bread.md"], "Banana bread.md")).toBe(true));
  it("treats NFD (macOS) and NFC as the same name", () => {
    expect(nameTaken(["Ka\u0308se.md"], "K\u00e4se.md")).toBe(true);
    expect(nameTaken(["K\u00e4se.md"], "K\u00c4SE.md")).toBe(true);
  });
  it("keeps ß apart from ss, as the file systems do", () => {
    expect(nameTaken(["Straße.md"], "STRAßE.md")).toBe(true);
    expect(nameTaken(["Straße.md"], "Strasse.md")).toBe(false);
  });
  it("is false for other names", () => expect(nameTaken(["Brot.md"], "Brot 2.md")).toBe(false));
});
