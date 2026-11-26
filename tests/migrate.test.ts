import { describe, expect, it } from "vitest";
import { migrateSettings } from "../src/migrate";

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

  it("keeps a valid timer volume and drops one that is not a choice (#58)", () => {
    expect(migrateSettings({ timerVolume: "loud" }).timerVolume).toBe("loud");
    expect(migrateSettings({ timerVolume: "deafening" })).not.toHaveProperty("timerVolume");
  });
});
