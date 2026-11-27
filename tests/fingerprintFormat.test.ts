// The fingerprint is stored in users' notes. These tests pin hash function, normalisation and field format against a
// hand-written note: if one fails, stored hashes no longer match and every imported note would look edited.
// A failure means: a migration is needed (ADR 0006), not "update the constants".
import { describe, expect, it } from "vitest";
import { fingerprints, fnv1a, formatHash, parseHash } from "../src/fingerprint";
import { DEFAULT_FORMAT } from "../src/noteFormat";

const NOTE = `---
typ: rezept
status: ausprobieren
quelle: "https://example.org/biskuit"
ergebnis: "1 Form"
zeit_aktiv: 20
zeit_gesamt: 55
import: fertig
import_hash: "v1;title:aaaaa"
erstellt: 2026-11-27
aktualisiert: 2026-11-27
---
# Biskuit

Luftig.

**Ergebnis:** 1 Form

## Zutaten
- [ ] 4 Eier
-   100 g   Zucker
**Guss**
- 50 g Puderzucker

## Schritte
1. **Trennen:** Eier trennen.
2) **Backen (30 Min.):** 30 Min. backen.
  eingerückte Zeile

## Tipps
- Ofen vorheizen.
`;

describe("pinned fingerprint format (ADR 0006)", () => {
  it("fnv1a over UTF-8 bytes", () => {
    expect(fnv1a("Biskuit")).toBe("kpqzc");
    expect(fnv1a("Öl")).toBe("1pi6iyo");
  });

  it("hashes of a hand-written note", () => {
    expect(fingerprints(NOTE, DEFAULT_FORMAT.fields)).toEqual({
      title: "kpqzc",
      description: "a8uwu",
      yield: "1oewr6",
      times: "1apbdkz",
      ingredients: "1h8gvrw",
      steps: "1ph2obe",
      tips: "2jh2f7",
    });
  });

  it("an empty part has the hash of an empty text; decomposed characters hash like composed ones (NFC)", () => {
    expect(fnv1a("")).toBe("ztntfp");
    const bare = NOTE.replace("Luftig.\n\n", "").replace(/## Tipps\n- Ofen vorheizen.\n/, "");
    const h = fingerprints(bare, DEFAULT_FORMAT.fields);
    expect([h.description, h.tips, h.title]).toEqual(["ztntfp", "ztntfp", "kpqzc"]);
    expect(fingerprints(NOTE.replace("eingerückte", "eingeru\u0308ckte"), DEFAULT_FORMAT.fields).steps).toBe("1ph2obe");
  });

  it("the field value", () => {
    expect(parseHash("v1;title:abc;ingredients:def")).toEqual({ title: "abc", ingredients: "def" });
    expect(formatHash({ title: "abc", steps: "x1" })).toBe('"v1;title:abc;steps:x1"');
  });
});
