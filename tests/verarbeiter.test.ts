import { describe, expect, it } from "vitest";
import { erkenneQuelle, schluesselVon } from "../src/quelle";
import {
  auftragsStand,
  LANGSAM_MIN,
  auftragsText,
  fireAnfrage,
  githubAnfrage,
  neueAuftragsId,
  pruefeAuftraege,
  waehleWeg,
  werteAus,
  WARTEN_MIN,
} from "../src/verarbeiter";
import { naechsterSchritt } from "../src/neuladen";
import type { Auftrag } from "../src/types";

describe("Verarbeiter", () => {
  it("wählt den Weg", () => {
    expect(waehleWeg("auto", true, true)).toBe("claude");
    expect(waehleWeg("auto", false, true)).toBe("github");
    expect(waehleWeg("auto", false, false)).toBeNull();
    expect(waehleWeg("claude", false, true)).toBeNull();
    expect(waehleWeg("github", true, true)).toBe("github");
  });
  it("baut Anfragen", () => {
    const e = erkenneQuelle("https://www.instagram.com/reel/BcExample01/?bqrl=x");
    const a = { id: "rz-1", eingabe: e.url! };
    const t: unknown = JSON.parse(auftragsText(a, e));
    expect(t).toEqual({
      rezept_auftrag: "rz-1",
      art: "instagram",
      quelle: "https://www.instagram.com/reel/BcExample01/",
      schluessel: "instagram:BcExample01",
      text: null,
    });
    const f = fireAnfrage("trig_0123456789abc", " tok ", "x");
    expect(f.url).toBe("https://api.anthropic.com/v1/claude_code/routines/trig_0123456789abc/fire");
    expect(f.headers.Authorization).toBe("Bearer tok");
    const g = githubAnfrage("owner/vault", "gh", a, e);
    expect(g.url).toBe("https://api.github.com/repos/owner/vault/actions/workflows/rezept-import.yml/dispatches");
    expect(JSON.parse(g.body)).toEqual({
      ref: "main",
      inputs: { auftrag: "rz-1", quelle: "https://www.instagram.com/reel/BcExample01/", text: "" },
    });
    const txt = erkenneQuelle("500 g Mehl\n300 ml Wasser");
    expect(
      (
        JSON.parse(githubAnfrage("a/b", "gh", { id: "rz-2", eingabe: "500 g Mehl\n300 ml Wasser" }, txt).body) as {
          inputs: { text: string };
        }
      ).inputs.text,
    ).toBe("500 g Mehl\n300 ml Wasser");
    expect(neueAuftragsId(0, 0)).toBe("rz-0-0000");
  });
  it("wertet Antworten aus", () => {
    expect(werteAus("claude", 200, { claude_code_session_url: "https://claude.ai/code/x" })).toEqual({
      ok: true,
      sitzung: "https://claude.ai/code/x",
    });
    expect(werteAus("github", 204, null)).toEqual({ ok: true, sitzung: undefined });
    expect(werteAus("github", 403, { message: "Resource not accessible" })).toEqual({
      ok: false,
      meldung: "GitHub-Token darf keine Actions starten (Recht „Actions: Read and write“) (Resource not accessible)",
    });
    expect(werteAus("claude", 401, {}).ok).toBe(false);
  });
  it("schließt Aufträge über ID oder Quelle, sonst Zeitlimit", () => {
    const jetzt = 10_000_000;
    const a: Auftrag[] = [
      { id: "rz-a", eingabe: "x", art: "text", seit: jetzt - 1000, weg: "claude" },
      {
        id: "rz-b",
        eingabe: "https://www.instagram.com/reel/AB/",
        art: "instagram",
        schluessel: "instagram:AB",
        seit: jetzt - 1000,
        weg: "github",
      },
      {
        id: "rz-c",
        eingabe: "https://x.de/r",
        art: "webseite",
        schluessel: "x.de/r",
        seit: jetzt - (WARTEN_MIN + 1) * 60_000,
        weg: "github",
      },
    ];
    const rezepte = [
      { pfad: "a.md", auftrag: "rz-a", geaendert: jetzt },
      { pfad: "b.md", quelle: "https://instagram.com/p/AB", geaendert: jetzt },
    ];
    const r = pruefeAuftraege(a, rezepte, schluesselVon, jetzt);
    expect(r.fertig.map((f) => f.rezept.pfad)).toEqual(["a.md", "b.md"]);
    expect(r.offen).toHaveLength(1);
    expect(r.offen[0].fehler).toMatch(/kein Rezept/);
  });
  it("Neuladen erst bei stabilem Stand", () => {
    expect(naechsterSchritt("a", "", "b")).toEqual({ neuLaden: false, kandidat: "b" });
    expect(naechsterSchritt("a", "b", "b")).toEqual({ neuLaden: true, kandidat: "b" });
  });
});

describe("auftragsStand", () => {
  it("läuft, dauert länger, Fehler", () => {
    const jetzt = 10_000_000;
    expect(auftragsStand({ seit: jetzt - 60_000 }, jetzt)).toBe("laeuft");
    expect(auftragsStand({ seit: jetzt - (LANGSAM_MIN + 1) * 60_000 }, jetzt)).toBe("langsam");
    expect(auftragsStand({ seit: jetzt, fehler: "x" }, jetzt)).toBe("fehler");
  });
});
