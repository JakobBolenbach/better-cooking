import { describe, expect, it } from "vitest";
import { imOrdner, istRezeptDatei, ordnerBereinigen, ORDNER_STANDARD } from "../src/ordner";

describe("Rezeptordner", () => {
  it("bereinigt die Eingabe", () => {
    expect(ordnerBereinigen("  Kochen/Rezepte/ ")).toBe("Kochen/Rezepte");
    expect(ordnerBereinigen("/Rezepte")).toBe("Rezepte");
    expect(ordnerBereinigen("Kochen\\Rezepte")).toBe("Kochen/Rezepte");
    expect(ordnerBereinigen("Kochen//./Rezepte")).toBe("Kochen/Rezepte");
    expect(ordnerBereinigen("")).toBe(ORDNER_STANDARD);
    expect(ordnerBereinigen("/")).toBe("");
  });

  it("erkennt Rezeptnotizen direkt im Ordner", () => {
    expect(istRezeptDatei("Rezepte/Brot.md", "Rezepte")).toBe(true);
    expect(istRezeptDatei("Rezepte/Bilder/Brot.md", "Rezepte")).toBe(false);
    expect(istRezeptDatei("Rezepte/AGENTS.md", "Rezepte")).toBe(false);
    expect(istRezeptDatei("Rezepte/Brot Titelbild.webp", "Rezepte")).toBe(false);
    expect(istRezeptDatei("Rezepte-alt/Brot.md", "Rezepte")).toBe(false);
    expect(istRezeptDatei("Brot.md", "")).toBe(true);
  });

  it("meldet Änderungen unterhalb des Ordners", () => {
    expect(imOrdner("Rezepte/Bilder/Brot.webp", "Rezepte")).toBe(true);
    expect(imOrdner("Rezepte-alt/Brot.md", "Rezepte")).toBe(false);
    expect(imOrdner("irgendwo/Brot.md", "")).toBe(true);
  });
});
