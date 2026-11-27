import { describe, expect, it } from "vitest";
import { DEFAULTS, type Settings } from "../src/settings";
import type { Job } from "../src/types";
import { applyExternal, changedKeys, merge3 } from "../src/settingsMerge";

const job = (id: string, extra: Partial<Job> = {}): Job => ({
  id,
  input: `https://example.org/${id}`,
  kind: "webseite",
  since: 1,
  processor: "claude",
  ...extra,
});
const s = (o: Partial<Settings> = {}): Settings => ({ ...DEFAULTS, noteFormat: "de", ...o });
const ids = (x: Settings) => x.jobs.map((j) => j.id).sort();

describe("merge3: settings", () => {
  it("a setting changed only here wins", () => {
    expect(merge3(s(), s({ folder: "Mine" }), s()).folder).toBe("Mine");
  });
  it("a setting changed only in the file wins", () => {
    expect(merge3(s(), s(), s({ palette: "obsidian" })).palette).toBe("obsidian");
  });
  it("a setting changed on both sides: the file wins", () => {
    expect(merge3(s(), s({ folder: "A" }), s({ folder: "B" })).folder).toBe("B");
  });
  it("seen hint counts as seen from any side", () => {
    expect(merge3(s(), s({ cookingTapHintSeen: true }), s()).cookingTapHintSeen).toBe(true);
    expect(merge3(s(), s(), s({ cookingTapHintSeen: true })).cookingTapHintSeen).toBe(true);
    expect(merge3(s(), s({ timerPhoneHintSeen: true }), s()).timerPhoneHintSeen).toBe(true);
    expect(merge3(s(), s(), s({ timerPhoneHintSeen: true })).timerPhoneHintSeen).toBe(true);
  });
});

describe("merge3: jobs", () => {
  it("a job from another device comes in", () => {
    expect(ids(merge3(s(), s(), s({ jobs: [job("a")] })))).toEqual(["a"]);
  });
  it("a job new here stays", () => {
    expect(ids(merge3(s(), s({ jobs: [job("b")] }), s({ jobs: [job("a")] })))).toEqual(["a", "b"]);
  });
  it("a job removed here does not come back from the file", () => {
    const base = s({ jobs: [job("a"), job("b")] });
    expect(ids(merge3(base, s({ jobs: [job("b")] }), base))).toEqual(["b"]);
  });
  it("a job removed elsewhere falls away here, without writing back", () => {
    const base = s({ jobs: [job("a"), job("b")] });
    const r = applyExternal(base, base, { ...base, jobs: [job("b")] })!;
    expect(ids(r.settings)).toEqual(["b"]);
    expect(r.behind).toBe(false);
  });
  it("the file's version wins for a job in both, a change only here stays", () => {
    const base = s({ jobs: [job("a")] });
    expect(merge3(base, base, s({ jobs: [job("a", { error: "e" })] })).jobs[0].error).toBe("e");
    expect(merge3(base, s({ jobs: [job("a", { error: "mine" })] }), base).jobs[0].error).toBe("mine");
    expect(
      merge3(base, s({ jobs: [job("a", { error: "mine" })] }), s({ jobs: [job("a", { error: "e" })] })).jobs[0].error,
    ).toBe("e");
  });
});

describe("merge3: recipes on lists", () => {
  const r = (path: string, factor: number) => ({
    [path]: { parts: [{ factor, skipped: [], sig: "x" }], title: "T", at: 1 },
  });
  it("joins by list and recipe note, like the cover addresses", () => {
    const base = s({ listRecipes: { "L.md": { ...r("a.md", 1), ...r("b.md", 1) } } });
    const local = s({ listRecipes: { "L.md": { ...r("a.md", 1), ...r("b.md", 1), ...r("mine.md", 2) } } });
    const file = s({ listRecipes: { "L.md": { ...r("b.md", 1), ...r("theirs.md", 3) }, "M.md": r("c.md", 1) } });
    const merged = merge3(base, local, file).listRecipes;
    expect(Object.keys(merged["L.md"]).sort()).toEqual(["b.md", "mine.md", "theirs.md"]);
    expect(Object.keys(merged["M.md"])).toEqual(["c.md"]);
  });
  it("a recipe removed here stays away, one removed elsewhere falls away", () => {
    const base = s({ listRecipes: { "L.md": { ...r("a.md", 1), ...r("b.md", 1) } } });
    expect(merge3(base, s({ listRecipes: { "L.md": r("b.md", 1) } }), base).listRecipes).toEqual({
      "L.md": r("b.md", 1),
    });
    expect(merge3(base, base, s({ listRecipes: { "L.md": r("a.md", 1) } })).listRecipes).toEqual({
      "L.md": r("a.md", 1),
    });
  });
  it("a change only here stays, otherwise the file's version", () => {
    const base = s({ listRecipes: { "L.md": r("a.md", 1) } });
    const two = s({ listRecipes: { "L.md": r("a.md", 2) } });
    expect(merge3(base, two, base).listRecipes["L.md"]["a.md"].parts[0].factor).toBe(2);
    expect(merge3(base, base, two).listRecipes["L.md"]["a.md"].parts[0].factor).toBe(2);
  });
});

describe("merge3 and applyExternal with keys that would change prototypes", () => {
  it("the merged settings keep their prototype and gain nothing", () => {
    const rec = '{"parts":[{"factor":1,"skipped":[],"sig":"x"}],"title":"T","at":1}';
    const raw = JSON.parse(
      `{"__proto__":{"polluted":"yes"},"listRecipes":{"__proto__":{"a.md":${rec}},"L.md":{"constructor":${rec},"b.md":${rec}}},"coverUrls":{"__proto__":"https://e.org/x"}}`,
    ) as unknown;
    const r = applyExternal(s(), s(), raw)!;
    const out = r.settings as unknown as Record<string, unknown>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(out.polluted).toBeUndefined();
    expect(Object.keys(r.settings.listRecipes)).toEqual(["L.md"]);
    expect(Object.keys(r.settings.listRecipes["L.md"])).toEqual(["b.md"]);
    expect(Object.keys(r.settings.coverUrls)).toEqual([]);
  });
  it("a key of that kind in memory does not reach the prototype of the result", () => {
    const evilRec = { "x.md": { parts: [{ factor: 1, skipped: [], sig: "x" }], title: "T", at: 1 } };
    const local = s({ listRecipes: JSON.parse(`{"__proto__":${JSON.stringify(evilRec)}}`) as Settings["listRecipes"] });
    const out = merge3(s(), local, s()).listRecipes;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect((out as Record<string, unknown>)["x.md"]).toBeUndefined();
  });
});

describe("merge3: cover addresses", () => {
  it("joins, and a prune on one device falls away on the other", () => {
    const base = s({ coverUrls: { "x.md": "https://e.org/u1.jpg", "y.md": "https://e.org/u2.jpg" } });
    const local = s({
      coverUrls: { "x.md": "https://e.org/u1.jpg", "y.md": "https://e.org/u2.jpg", "mine.md": "https://e.org/u3.jpg" },
    });
    const file = s({ coverUrls: { "y.md": "https://e.org/u2.jpg", "theirs.md": "https://e.org/u4.jpg" } });
    expect(merge3(base, local, file).coverUrls).toEqual({
      "y.md": "https://e.org/u2.jpg",
      "theirs.md": "https://e.org/u4.jpg",
      "mine.md": "https://e.org/u3.jpg",
    });
  });
  it("a cover removed here does not come back", () => {
    const base = s({ coverUrls: { "x.md": "https://e.org/u1.jpg" } });
    expect(merge3(base, s(), base).coverUrls).toEqual({});
  });
});

describe("applyExternal", () => {
  const base = s({ jobs: [job("a")] });
  it("does nothing without a usable file", () => {
    for (const raw of [null, undefined, "", "garbage", 42, [], {}, [1]])
      expect(applyExternal(base, base, raw)).toBeNull();
  });
  it("migrates old keys like at the start", () => {
    const r = applyExternal(s(), s(), { ordner: "Neu", noteFormat: "de" })!;
    expect(r.settings.folder).toBe("Neu");
    expect(r.changed).toEqual(["folder"]);
  });
  it("does nothing for the file this device wrote itself, also after a JSON roundtrip with undefined fields", () => {
    const own = s({ jobs: [job("a", { device: undefined, key: undefined })], list: undefined });
    const r = applyExternal(own, own, JSON.parse(JSON.stringify(own)))!;
    expect(r.changed).toEqual([]);
    expect(r.behind).toBe(false);
  });
  it("writes back what is new here", () => {
    const r = applyExternal(s(), s({ jobs: [job("b")] }), { ...s(), jobs: [job("a")] })!;
    expect(r.behind).toBe(true);
    expect(r.changed).toEqual(["jobs"]);
  });
});

describe("changedKeys", () => {
  it("ignores key order", () => {
    expect(changedKeys(s({ coverUrls: { a: "1", b: "2" } }), s({ coverUrls: { b: "2", a: "1" } }))).toEqual([]);
  });
});

/** A device as the plugin runs it: memory (`mem`), what it last read or wrote (`base`), the shared file. */
class Device {
  base: Settings;
  constructor(
    public mem: Settings,
    private shared: { file: string },
  ) {
    this.base = mem;
  }
  save(change: (m: Settings) => Settings) {
    this.mem = change(this.mem);
    this.shared.file = JSON.stringify(this.mem);
    this.base = this.mem;
  }
  external(): boolean {
    const r = applyExternal(this.base, this.mem, JSON.parse(this.shared.file));
    if (!r) return false;
    this.mem = r.settings;
    if (r.behind) this.shared.file = JSON.stringify(r.settings);
    this.base = r.settings;
    return r.behind || r.changed.length > 0;
  }
}

describe("two devices converge", () => {
  it("add, remove and change in turns, then nothing changes any more", () => {
    const start = s({
      jobs: [job("a"), job("b")],
      coverUrls: { "x.md": "https://e.org/u1.jpg", "y.md": "https://e.org/u2.jpg" },
    });
    const shared = { file: JSON.stringify(start) };
    const pc = new Device(start, shared);
    const phone = new Device(start, shared);
    const sync = (d: Device) => d.external();

    pc.save((m) => ({ ...m, jobs: m.jobs.filter((j) => j.id !== "a") })); // PC removes a
    sync(phone);
    phone.save((m) => ({ ...m, jobs: [...m.jobs, job("c")], palette: "obsidian" })); // phone adds c
    sync(pc);
    pc.save((m) => ({ ...m, coverUrls: { "y.md": "https://e.org/u2.jpg" }, folder: "Kitchen" })); // PC prunes a cover
    sync(phone);
    phone.save((m) => ({ ...m, jobs: m.jobs.filter((j) => j.id !== "b") })); // phone removes b
    sync(pc);
    for (let round = 0; round < 3; round++) {
      sync(phone);
      sync(pc);
    }
    expect(sync(phone)).toBe(false);
    expect(sync(pc)).toBe(false);
    expect(changedKeys(pc.mem, phone.mem)).toEqual([]);
    expect(ids(pc.mem)).toEqual(["c"]);
    expect(pc.mem.coverUrls).toEqual({ "y.md": "https://e.org/u2.jpg" });
    expect(pc.mem.palette).toBe("obsidian");
    expect(pc.mem.folder).toBe("Kitchen");
  });

  it("an older state in memory does not undo what the other device saved", () => {
    const start = s({ jobs: [job("a")] });
    const shared = { file: JSON.stringify(start) };
    const pc = new Device(start, shared);
    const phone = new Device(start, shared);
    phone.save((m) => ({ ...m, jobs: [...m.jobs, job("n")], mode: "dunkel" }));
    pc.external();
    pc.save((m) => ({ ...m, language: "en" }));
    const file = JSON.parse(shared.file) as Settings;
    expect(file.jobs.map((j) => j.id)).toEqual(["a", "n"]);
    expect(file.mode).toBe("dunkel");
  });

  it("both change the same setting at the same time: both end with the same value", () => {
    const start = s({ folder: "Old" });
    const shared = { file: JSON.stringify(start) };
    const pc = new Device(start, shared);
    const phone = new Device(start, shared);
    pc.save((m) => ({ ...m, folder: "FromPc" }));
    phone.save((m) => ({ ...m, folder: "FromPhone" }));
    for (let i = 0; i < 3; i++) {
      pc.external();
      phone.external();
    }
    expect(pc.mem.folder).toBe(phone.mem.folder);
    expect(pc.external()).toBe(false);
    expect(phone.external()).toBe(false);
  });

  it("both remove a different job at the same time: both end with the later file (the job the first removed is back)", () => {
    const start = s({ jobs: [job("a"), job("b")] });
    const shared = { file: JSON.stringify(start) };
    const pc = new Device(start, shared);
    const phone = new Device(start, shared);
    pc.save((m) => ({ ...m, jobs: m.jobs.filter((j) => j.id !== "a") }));
    phone.save((m) => ({ ...m, jobs: m.jobs.filter((j) => j.id !== "b") }));
    for (let i = 0; i < 4; i++) {
      pc.external();
      phone.external();
    }
    expect(changedKeys(pc.mem, phone.mem)).toEqual([]);
    expect(ids(pc.mem)).toEqual(["a"]);
  });

  it("known limit: a file that replaces the whole state brings back a job this device closed", () => {
    // Both devices were offline; the other one never saw the removal and its older file replaces ours.
    const closedHere = s();
    const olderFile = s({ jobs: [job("done")] });
    expect(ids(merge3(closedHere, closedHere, olderFile))).toEqual(["done"]);
  });
});
