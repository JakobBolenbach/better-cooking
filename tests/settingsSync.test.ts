import { describe, expect, it } from "vitest";
import { DEFAULTS, type Settings } from "../src/settings";
import type { Job } from "../src/types";
import { SettingsSync } from "../src/settingsSync";

const job = (id: string): Job => ({
  id,
  input: `https://example.org/${id}`,
  kind: "webseite",
  since: 1,
  processor: "claude",
});
const s = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, noteFormat: "de", ...o });
const ids = (x: Settings) => x.jobs.map((j) => j.id).sort();

/** A device with a shared file, in memory; `gate` holds back the answer of load (the read has happened already). */
function device(initial: Settings) {
  const d = {
    file: JSON.stringify(initial),
    mem: initial,
    changed: [] as string[][],
    gate: null as Promise<void> | null,
    saveGate: null as Promise<void> | null,
    failLoad: false,
    saves: 0,
  };
  const sync = new SettingsSync({
    load: async () => {
      if (d.failLoad) throw new Error("secret value");
      const snapshot = d.file;
      await d.gate;
      return JSON.parse(snapshot) as unknown;
    },
    save: async (x) => {
      await d.saveGate;
      d.file = JSON.stringify(x);
      d.saves++;
    },
    get: () => d.mem,
    set: (x) => {
      d.mem = x;
    },
    changed: (k) => d.changed.push(k),
  });
  sync.setBase(initial);
  return { d, sync };
}
const fileOf = (d: { file: string }) => JSON.parse(d.file) as Settings;
const gate = () => {
  let open!: () => void;
  const p = new Promise<void>((r) => (open = r));
  return { p, open };
};

describe("SettingsSync: the base is a copy", () => {
  const rec = (factor: number) => ({ "L.md": { "a.md": { parts: [{ factor, skipped: [], sig: "x" }], at: 1 } } });
  it("a change deep inside the memory after a write is not taken for the other device's file", async () => {
    const { d, sync } = device(s({ listRecipes: rec(1) }));
    await sync.write();
    // The same object is changed in place (as adding a recipe twice once did): the saved base must not follow.
    d.mem.listRecipes["L.md"]["a.md"].parts[0].factor = 2;
    await sync.write();
    expect(fileOf(d).listRecipes["L.md"]["a.md"].parts[0].factor).toBe(2);
    expect(d.mem.listRecipes["L.md"]["a.md"].parts[0].factor).toBe(2);
  });
  it("the base set at load is a copy too", async () => {
    const initial = s({ listRecipes: rec(1) });
    const { d, sync } = device(initial);
    initial.listRecipes["L.md"]["a.md"].parts[0].factor = 2;
    await sync.write();
    expect(fileOf(d).listRecipes["L.md"]["a.md"].parts[0].factor).toBe(2);
  });
});

describe("SettingsSync", () => {
  it("merges a change of the file and reports what changed", async () => {
    const { d, sync } = device(s());
    d.file = JSON.stringify(s({ jobs: [job("a")], folder: "Kitchen" }));
    await sync.onExternal();
    expect(ids(d.mem)).toEqual(["a"]);
    expect(d.changed.flat().sort()).toEqual(["folder", "jobs"]);
    expect(d.saves).toBe(0);
  });

  it("does nothing after the plugin's own write", async () => {
    const { d, sync } = device(s());
    d.mem = s({ jobs: [job("a")] });
    await sync.write();
    d.changed.length = 0;
    const saves = d.saves;
    await sync.onExternal();
    expect(d.changed).toEqual([]);
    expect(d.saves).toBe(saves);
  });

  it("a save during loadData loses nothing", async () => {
    const { d, sync } = device(s());
    const g = gate();
    d.gate = g.p;
    d.file = JSON.stringify(s({ jobs: [job("remote")] }));
    const hook = sync.onExternal();
    d.mem = s({ folder: "Mine" }); // the save changes the memory while the read is pending
    const saved = sync.write();
    d.gate = null;
    g.open();
    await Promise.all([hook, saved]);
    expect(d.mem.folder).toBe("Mine");
    expect(ids(d.mem)).toEqual(["remote"]);
    expect(fileOf(d).folder).toBe("Mine");
    expect(ids(fileOf(d))).toEqual(["remote"]);
  });

  it("the hook during a write runs after it and keeps both changes", async () => {
    const { d, sync } = device(s());
    const g = gate();
    d.saveGate = g.p;
    d.mem = s({ jobs: [job("mine")] });
    const saved = sync.write();
    const hook = sync.onExternal();
    d.saveGate = null;
    g.open();
    await Promise.all([saved, hook]);
    expect(ids(d.mem)).toEqual(["mine"]);
    expect(ids(fileOf(d))).toEqual(["mine"]);
  });

  it("a write first merges a file that changed meanwhile, so the other device's job is not undone", async () => {
    const { d, sync } = device(s({ jobs: [job("a")] }));
    d.file = JSON.stringify(s({ jobs: [job("a"), job("remote")] })); // the hook has not arrived yet
    d.mem = s({ jobs: [job("a")], folder: "Mine" });
    await sync.write();
    expect(ids(fileOf(d))).toEqual(["a", "remote"]);
    expect(fileOf(d).folder).toBe("Mine");
    expect(ids(d.mem)).toEqual(["a", "remote"]);
  });

  it("a missing, empty or broken file changes nothing", async () => {
    for (const raw of [null, "", "garbage", {}]) {
      const { d, sync } = device(s({ jobs: [job("a")] }));
      d.file = JSON.stringify(raw);
      await sync.onExternal();
      expect(ids(d.mem)).toEqual(["a"]);
      expect(d.saves).toBe(0);
    }
  });

  it("an error in the hook stays quiet", async () => {
    const { d, sync } = device(s());
    d.failLoad = true;
    await expect(sync.onExternal()).resolves.toBeUndefined();
  });

  it("a new installation: the base is the state after the note language was set, so another device's file wins", async () => {
    const start = s({ noteFormat: "en" }); // set in memory at load, not in any file
    const { d, sync } = device(start);
    sync.setBase(start);
    d.file = JSON.stringify(s({ noteFormat: "de", folder: "Kitchen" }));
    await sync.onExternal();
    expect(d.mem.noteFormat).toBe("de");
    expect(d.saves).toBe(0);
  });
});
