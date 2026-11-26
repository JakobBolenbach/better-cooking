import { describe, expect, it } from "vitest";
import { DEFAULTS, type Settings } from "../src/settings";
import type { Job } from "../src/types";
import { applyExternal, changedKeys, emptyRemoved, mergeExternalSettings, trackRemoved } from "../src/settingsMerge";

const job = (id: string, extra: Partial<Job> = {}): Job => ({
  id,
  input: `https://example.org/${id}`,
  kind: "webseite",
  since: 1,
  processor: "claude",
  ...extra,
});
const settings = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, ...o });

describe("mergeExternalSettings", () => {
  it("takes a job that another device started", () => {
    const m = mergeExternalSettings(settings(), settings({ jobs: [job("a")] }), emptyRemoved());
    expect(m.jobs.map((j) => j.id)).toEqual(["a"]);
  });

  it("keeps a job that is new on this device", () => {
    const m = mergeExternalSettings(settings({ jobs: [job("b")] }), settings({ jobs: [job("a")] }), emptyRemoved());
    expect(m.jobs.map((j) => j.id).sort()).toEqual(["a", "b"]);
  });

  it("does not bring back a job this device removed", () => {
    const removed = emptyRemoved();
    trackRemoved(removed, settings({ jobs: [job("a"), job("b")] }), settings({ jobs: [job("b")] }));
    const m = mergeExternalSettings(settings({ jobs: [job("b")] }), settings({ jobs: [job("a"), job("b")] }), removed);
    expect(m.jobs.map((j) => j.id)).toEqual(["b"]);
  });

  it("forgets a removal when the same ID is added again", () => {
    const removed = emptyRemoved();
    trackRemoved(removed, settings({ jobs: [job("a")] }), settings());
    trackRemoved(removed, settings(), settings({ jobs: [job("a")] }));
    expect(removed.jobs.has("a")).toBe(false);
  });

  it("takes the external version of a job that exists on both", () => {
    const m = mergeExternalSettings(
      settings({ jobs: [job("a")] }),
      settings({ jobs: [job("a", { error: "failed" })] }),
      emptyRemoved(),
    );
    expect(m.jobs[0].error).toBe("failed");
  });

  it("lets the external file win for settings", () => {
    const m = mergeExternalSettings(
      settings({ folder: "Old", palette: "kitchen" }),
      settings({ folder: "New", palette: "obsidian" }),
      emptyRemoved(),
    );
    expect(m.folder).toBe("New");
    expect(m.palette).toBe("obsidian");
  });

  it("joins the cover addresses and does not bring back removed notes", () => {
    const removed = emptyRemoved();
    trackRemoved(removed, settings({ coverUrls: { "x.md": "https://e.org/x.jpg" } }), settings());
    const m = mergeExternalSettings(
      settings({ coverUrls: { "mine.md": "https://e.org/m.jpg" } }),
      settings({
        coverUrls: {
          "x.md": "https://e.org/x.jpg",
          "theirs.md": "https://e.org/t.jpg",
          "mine.md": "https://e.org/n.jpg",
        },
      }),
      removed,
    );
    expect(m.coverUrls).toEqual({ "theirs.md": "https://e.org/t.jpg", "mine.md": "https://e.org/n.jpg" });
  });

  it("keeps a seen hint seen", () => {
    expect(
      mergeExternalSettings(settings({ cookingTapHintSeen: true }), settings(), emptyRemoved()).cookingTapHintSeen,
    ).toBe(true);
    expect(
      mergeExternalSettings(settings(), settings({ cookingTapHintSeen: true }), emptyRemoved()).cookingTapHintSeen,
    ).toBe(true);
  });
});

describe("changedKeys", () => {
  it("is empty for equal settings, whatever the key order", () => {
    const a = settings({ coverUrls: { a: "1", b: "2" } });
    const b = settings({ coverUrls: { b: "2", a: "1" } });
    expect(changedKeys(a, b)).toEqual([]);
  });
  it("names the keys that differ", () => {
    expect(changedKeys(settings(), settings({ language: "de", jobs: [job("a")] })).sort()).toEqual([
      "jobs",
      "language",
    ]);
  });
});

describe("applyExternal", () => {
  it("migrates the file like at the start and reports what changed", () => {
    const r = applyExternal(
      settings(),
      { ordner: "Neu", auftraege: [{ id: "a", eingabe: "x", art: "webseite", seit: 1, weg: "claude" }] },
      emptyRemoved(),
    );
    expect(r.settings.folder).toBe("Neu");
    expect(r.settings.jobs.map((j) => j.id)).toEqual(["a"]);
    expect(r.changed.sort()).toEqual(["folder", "jobs", "noteFormat"].sort());
    expect(r.behind).toBe(false);
  });
  it("does nothing for the file the plugin wrote itself", () => {
    const own = settings({ jobs: [job("a")], coverUrls: { "a.md": "https://e.org/a.jpg" } });
    const r = applyExternal(own, JSON.parse(JSON.stringify(own)), emptyRemoved());
    expect(r.changed).toEqual([]);
    expect(r.behind).toBe(false);
  });
  it("reports that the file lacks a job of this device", () => {
    const r = applyExternal(settings({ jobs: [job("b")] }), { ...DEFAULTS, jobs: [job("a")] }, emptyRemoved());
    expect(r.behind).toBe(true);
    expect(r.changed).toEqual(["jobs"]);
  });
});
