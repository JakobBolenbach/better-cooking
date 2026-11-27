import { describe, expect, it } from "vitest";
import { cleanCoverUrls, cleanListRecipes, migrateSettings } from "../src/migrate";

describe("migrateSettings", () => {
  it("maps settings saved with German keys (0.2.1 and earlier)", () => {
    const old = {
      ordner: "Kitchen/Recipes",
      modus: "dunkel",
      beimStartOeffnen: true,
      weg: "claude",
      lokalZuerst: false,
      zusatz: "context: private",
      routine: "trig_0123456789abc",
      repo: "owner/vault",
      liste: "bewaehrt",
      auftraege: [
        {
          id: "rz-1",
          eingabe: "https://example.org/r",
          art: "webseite",
          schluessel: "example.org/r",
          seit: 5,
          weg: "github",
          sitzung: "https://example.org/s",
          fehler: "x",
        },
      ],
    };
    expect(migrateSettings(old)).toEqual({
      folder: "Kitchen/Recipes",
      mode: "dunkel",
      openOnStartup: true,
      processor: "claude",
      readWebsitesLocally: false,
      extraProperties: "context: private",
      routine: "trig_0123456789abc",
      repo: "owner/vault",
      list: "bewaehrt",
      noteFormat: "de",
      jobs: [
        {
          id: "rz-1",
          input: "https://example.org/r",
          kind: "webseite",
          key: "example.org/r",
          since: 5,
          processor: "github",
          session: "https://example.org/s",
          error: "x",
        },
      ],
    });
  });

  it("leaves current settings unchanged and prefers current keys", () => {
    const current = {
      folder: "Recipes",
      processor: "auto",
      noteFormat: "en",
      jobs: [{ id: "rz-2", input: "t", kind: "text", since: 1 }],
    };
    expect(migrateSettings(current)).toEqual(current);
    expect(migrateSettings({ folder: "New", ordner: "Old" })).toEqual({ folder: "New", noteFormat: "de" });
  });

  it("copes with missing or broken data", () => {
    expect(migrateSettings(null)).toEqual({});
    expect(migrateSettings("x")).toEqual({});
    expect(migrateSettings({ auftraege: [null, 3, { eingabe: "a" }] })).toEqual({
      jobs: [{ input: "a" }],
      noteFormat: "de",
    });
  });

  it("keeps German notes for installations from before the note format setting", () => {
    expect(migrateSettings({ folder: "Recipes" }).noteFormat).toBe("de");
    expect(migrateSettings({ noteFormat: "en" }).noteFormat).toBe("en");
  });

  it("turns stored texts of known job errors into an error key, in either language", () => {
    const jobs = [
      { id: "a", fehler: "Nach 20 Minuten kein Rezept angekommen. Warum, steht im Lauf; sonst Sync prüfen." },
      { id: "b", error: "No recipe arrived after 20 minutes. The run shows why; otherwise check the sync." },
      { id: "c", error: "Workflow failed (422)" },
      { id: "d", errorKey: "noRecipeArrived" },
    ];
    const migrated = migrateSettings({ jobs }).jobs as unknown as Record<string, unknown>[];
    expect(migrated[0]).toEqual({ id: "a", errorKey: "noRecipeArrived" });
    expect(migrated[1]).toEqual({ id: "b", errorKey: "noRecipeArrived" });
    expect(migrated[2]).toEqual({ id: "c", error: "Workflow failed (422)" });
    expect(migrated[3]).toEqual({ id: "d", errorKey: "noRecipeArrived" });
    // Migrating again changes nothing.
    expect(migrateSettings({ jobs: migrated }).jobs).toEqual(migrated);
  });
});

describe("listRecipes", () => {
  it("keeps well-formed records and drops the rest", () => {
    const part = { factor: 2, skipped: ["0-1", 3], sig: "x" };
    const s = migrateSettings({
      listRecipes: {
        "L.md": {
          "a.md": { parts: [part, { factor: -1, skipped: [], sig: "y" }, "x"], at: 5 },
          "b.md": { parts: [] },
          "c.md": 7,
        },
        "M.md": "no",
      },
    });
    expect(s.listRecipes).toEqual({
      "L.md": { "a.md": { parts: [{ factor: 2, skipped: ["0-1"], sig: "x" }], at: 5 } },
    });
  });
});

describe("keys that would change prototypes", () => {
  const evil = (o: string) => JSON.parse(o) as unknown;
  const plain = (x: object) => Object.getPrototypeOf(x) === Object.prototype;
  it("cleanListRecipes drops __proto__, constructor and prototype at both levels", () => {
    const rec = '{"parts":[{"factor":1,"skipped":[],"sig":"x"}],"at":1}';
    const x = evil(
      `{"__proto__":{"a.md":${rec}},"constructor":{"a.md":${rec}},"L.md":{"__proto__":${rec},"prototype":${rec},"ok.md":${rec}}}`,
    );
    const out = cleanListRecipes(x);
    expect(Object.keys(out)).toEqual(["L.md"]);
    expect(Object.keys(out["L.md"])).toEqual(["ok.md"]);
    expect(plain(out)).toBe(true);
    expect(plain(out["L.md"])).toBe(true);
    expect(({} as Record<string, unknown>)["a.md"]).toBeUndefined();
  });
  it("cleanCoverUrls drops them too", () => {
    const out = cleanCoverUrls(
      evil('{"__proto__":"https://e.org/x","constructor":"https://e.org/y","a.md":"https://e.org/z"}'),
    );
    expect(Object.keys(out)).toEqual(["a.md"]);
  });
  it("migrateSettings does not let a key set the prototype of the settings or of a job", () => {
    const s = migrateSettings(
      evil(
        '{"__proto__":{"polluted":"yes","folder":"X"},"jobs":[{"__proto__":{"polluted":"yes"},"id":"a","eingabe":"https://e.org"}]}',
      ),
    ) as Record<string, unknown>;
    expect(plain(s)).toBe(true);
    expect(s.polluted).toBeUndefined();
    expect(s.folder).toBeUndefined();
    const job = (s.jobs as Record<string, unknown>[])[0];
    expect(plain(job)).toBe(true);
    expect(job.polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
