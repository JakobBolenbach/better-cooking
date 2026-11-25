import { describe, expect, it } from "vitest";
import { readPageLocally, readExtraProperties, extraPropertyLines } from "../src/extraProperties";

describe("zusatzLesen", () => {
  it("liest Paare und übergeht leere Zeilen und Kommentare", () => {
    const r = readExtraProperties("kontext: privat\n\n# Kommentar\nherkunft:  Web  \nleer:");
    expect(r.properties).toEqual([
      ["kontext", "privat"],
      ["herkunft", "Web"],
      ["leer", ""],
    ]);
    expect(r.hints).toEqual([]);
  });

  it("lässt eigene Felder des Plugins nicht überschreiben", () => {
    const r = readExtraProperties("status: bewaehrt\ntyp: x\nkontext: privat");
    expect(r.properties).toEqual([["kontext", "privat"]]);
    expect(r.hints).toHaveLength(2);
  });

  it("weist ungültige Namen und doppelte Namen ab", () => {
    const r = readExtraProperties("1abc: x\nmit leer: x\nk: a\nk: b\n---: x");
    expect(r.properties).toEqual([["k", "a"]]);
    expect(r.hints).toHaveLength(4);
  });

  it("behält Doppelpunkte im Wert", () => {
    expect(readExtraProperties("zeit: 12:30").properties).toEqual([["zeit", "12:30"]]);
  });
});

describe("zusatzZeilen", () => {
  it("setzt Werte in Anführungszeichen, auch YAML-Sonderzeichen", () => {
    expect(
      extraPropertyLines([
        ["kontext", "privat"],
        ["x", "[[Notiz]]"],
        ["y", 'a "b"\nc'],
        ["leer", ""],
      ]),
    ).toEqual(['kontext: "privat"', 'x: "[[Notiz]]"', 'y: "a \\"b\\" c"', "leer:"]);
  });
});

describe("seiteSelbstLesen", () => {
  it("liest selbst, wenn eingestellt oder kein Verarbeiter da ist", () => {
    expect(readPageLocally(true, true)).toBe(true);
    expect(readPageLocally(true, false)).toBe(true);
    expect(readPageLocally(false, false)).toBe(true);
    expect(readPageLocally(false, true)).toBe(false);
  });
});
