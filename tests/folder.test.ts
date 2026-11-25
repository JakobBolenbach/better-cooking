import { describe, expect, it } from "vitest";
import { inFolder, isRecipeFile, cleanFolder, DEFAULT_FOLDER } from "../src/folder";

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
    expect(isRecipeFile("Rezepte/AGENTS.md", "Rezepte")).toBe(false);
    expect(isRecipeFile("Rezepte/Brot Titelbild.webp", "Rezepte")).toBe(false);
    expect(isRecipeFile("Rezepte-alt/Brot.md", "Rezepte")).toBe(false);
    expect(isRecipeFile("Brot.md", "")).toBe(true);
  });

  it("reports changes below the folder", () => {
    expect(inFolder("Rezepte/Bilder/Brot.webp", "Rezepte")).toBe(true);
    expect(inFolder("Rezepte-alt/Brot.md", "Rezepte")).toBe(false);
    expect(inFolder("irgendwo/Brot.md", "")).toBe(true);
  });
});
