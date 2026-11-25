import { describe, expect, it } from "vitest";
import { seiteSelbstLesen, zusatzLesen, zusatzZeilen } from "../src/zusatz";

describe("zusatzLesen", () => {
  it("liest Paare und übergeht leere Zeilen und Kommentare", () => {
    const r = zusatzLesen("kontext: privat\n\n# Kommentar\nherkunft:  Web  \nleer:");
    expect(r.eigenschaften).toEqual([
      ["kontext", "privat"],
      ["herkunft", "Web"],
      ["leer", ""],
    ]);
    expect(r.hinweise).toEqual([]);
  });

  it("lässt eigene Felder des Plugins nicht überschreiben", () => {
    const r = zusatzLesen("status: bewaehrt\ntyp: x\nkontext: privat");
    expect(r.eigenschaften).toEqual([["kontext", "privat"]]);
    expect(r.hinweise).toHaveLength(2);
  });

  it("weist ungültige Namen und doppelte Namen ab", () => {
    const r = zusatzLesen("1abc: x\nmit leer: x\nk: a\nk: b\n---: x");
    expect(r.eigenschaften).toEqual([["k", "a"]]);
    expect(r.hinweise).toHaveLength(4);
  });

  it("behält Doppelpunkte im Wert", () => {
    expect(zusatzLesen("zeit: 12:30").eigenschaften).toEqual([["zeit", "12:30"]]);
  });
});

describe("zusatzZeilen", () => {
  it("setzt Werte in Anführungszeichen, auch YAML-Sonderzeichen", () => {
    expect(
      zusatzZeilen([
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
    expect(seiteSelbstLesen(true, true)).toBe(true);
    expect(seiteSelbstLesen(true, false)).toBe(true);
    expect(seiteSelbstLesen(false, false)).toBe(true);
    expect(seiteSelbstLesen(false, true)).toBe(false);
  });
});
