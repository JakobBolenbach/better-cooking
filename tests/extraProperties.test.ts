import { describe, expect, it } from "vitest";
import { readPageLocally, readExtraProperties, extraPropertyLines } from "../src/extraProperties";

describe("readExtraProperties", () => {
  it("reads pairs and skips empty lines and comments", () => {
    const r = readExtraProperties("kontext: privat\n\n# Kommentar\nherkunft:  Web  \nleer:");
    expect(r.properties).toEqual([
      ["kontext", "privat"],
      ["herkunft", "Web"],
      ["leer", ""],
    ]);
    expect(r.hints).toEqual([]);
  });

  it("does not let the setting override the plugin's own fields", () => {
    const r = readExtraProperties("status: bewaehrt\ntyp: x\nkontext: privat");
    expect(r.properties).toEqual([["kontext", "privat"]]);
    expect(r.hints).toHaveLength(2);
  });

  it("rejects invalid and duplicate names", () => {
    const r = readExtraProperties("1abc: x\nmit leer: x\nk: a\nk: b\n---: x");
    expect(r.properties).toEqual([["k", "a"]]);
    expect(r.hints).toHaveLength(4);
  });

  it("keeps colons in the value", () => {
    expect(readExtraProperties("zeit: 12:30").properties).toEqual([["zeit", "12:30"]]);
  });
});

describe("extraPropertyLines", () => {
  it("quotes values, including YAML special characters", () => {
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

describe("readPageLocally", () => {
  it("reads locally when set or when there is no processor", () => {
    expect(readPageLocally(true, true)).toBe(true);
    expect(readPageLocally(true, false)).toBe(true);
    expect(readPageLocally(false, false)).toBe(true);
    expect(readPageLocally(false, true)).toBe(false);
  });
});
