// Failed proposals, proposals without a note, invalid files, the timeout and leftover images (ADR 0007).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { COVER, FOLDER, NOTE, PROPOSAL, TIMELINE, firstVersion, job, proposalText, setup } from "./improveFake";

const MIN = 60_000;

beforeEach(() => {
  notices.length = 0;
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const later = (min: number) => vi.setSystemTime(Date.now() + min * MIN);

describe("a failed improvement", () => {
  const failed = () => proposalText("", "fehler", "Das Video enthält kein Rezept");
  const why = "Verbesserung gescheitert: Das Video enthält kein Rezept. Die erste Fassung bleibt.";

  it("leaves the first version, writes the reason, trashes the proposal and tells the user", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: failed() });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.title).toBe("Linsensuppe");
    expect(r.steps).toEqual([{ text: "Alles kochen." }]);
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toBe("Das Video enthält kein Rezept");
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(notices).toEqual([why]);
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("tells the starting device even when the note no longer waits for this job", async () => {
    const done = firstVersion().replace("import: offen", "import: fertig");
    const s = setup({ [NOTE]: done, [PROPOSAL]: failed() });
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(done);
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(notices).toEqual([why]);
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("is written by every device when the note says 'offen' with this job ID, also for a job unknown here", async () => {
    for (const jobs of [[], [job({ device: "d2" })]]) {
      notices.length = 0;
      const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: failed() }, jobs);
      await s.service.handle(PROPOSAL);
      expect(parseRecipe("x", s.text(NOTE)).importError).toBe("Das Video enthält kein Rezept");
      expect(s.store.has(PROPOSAL)).toBe(false);
      expect(notices).toEqual([why]);
      // A job of another device is not touched.
      expect(s.plugin.settings.jobs).toHaveLength(jobs.length);
    }
  });

  it("does not touch a note that is not 'offen' for a job unknown here: the proposal waits as a card", async () => {
    const done = firstVersion().replace("import: offen", "import: fertig");
    const s = setup({ [NOTE]: done, [PROPOSAL]: failed() }, []);
    await s.service.handle(PROPOSAL);
    // A note that is not "offen" is no target for an unknown job at all: wait, then the card.
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(done);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(s.service.orphanList()).toMatchObject([{ path: PROPOSAL, kind: "orphan" }]);
    expect(notices).toEqual([]);
  });

  it("is trashed quietly when this device started the job and there is no note any more", async () => {
    const s = setup({ [PROPOSAL]: failed() });
    await s.service.handle(PROPOSAL);
    expect(s.store.has(PROPOSAL)).toBe(true);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.plugin.settings.jobs).toEqual([]);
    expect(notices).toEqual([]);
  });
});

describe("a proposal without a note", () => {
  it("waits for the note to sync before it is a card, and the proposal is untouched meanwhile", async () => {
    const s = setup({ [PROPOSAL]: proposalText(), [COVER]: "img" });
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([]);
    later(1);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([]);
    later(2);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([
      { path: PROPOSAL, job: "rz-m1-0001", title: "Rote Linsensuppe", kind: "orphan" },
    ]);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(s.store.has(COVER)).toBe(true);
    expect(s.service.proposals()[0].job).toBe("rz-m1-0001");
  });

  it("is not a card when the note arrives in time: it is dealt with as usual", async () => {
    const s = setup({ [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    later(1);
    s.store.set(NOTE, firstVersion());
    await s.service.handle(PROPOSAL);
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Rote Linsensuppe");
    expect(s.service.orphanList()).toEqual([]);
  });

  it("goes away as a card when the note shows up later (checked again after a change of notes)", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toHaveLength(1);
    s.store.set(NOTE, firstVersion());
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([]);
    expect(s.service.mark([{ ...parseRecipe(NOTE, firstVersion()), imageSrcs: [] }])[0].improvement).toBe("ready");
  });

  it("finds a note Obsidian has not indexed yet by reading it", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() });
    s.uncached.add(NOTE);
    await s.service.handle(PROPOSAL);
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Rote Linsensuppe");
  });

  it("can be saved as a new recipe, with its images and the extra properties of the settings", async () => {
    const s = setup({ [PROPOSAL]: proposalText(), [COVER]: "img", [TIMELINE]: "<svg/>" });
    s.plugin.extraProperties = () => [["kontext", "privat"]];
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    const r = await s.service.orphan(PROPOSAL, "save");
    expect(r).toEqual({ ok: true, message: "Gespeichert: Rote Linsensuppe" });
    const text = s.text(`${FOLDER}/Rote Linsensuppe.md`);
    const note = parseRecipe("x", text);
    expect(text).toContain('kontext: "privat"');
    expect(note.steps).toHaveLength(2);
    expect(note.image).toBe("Rote Linsensuppe Titelbild.webp");
    expect(note.timeline).toBe("Rote Linsensuppe Ablauf.svg");
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.service.orphanList()).toEqual([]);
  });

  it("warns about findings of the proposal when it is saved, like a normal import", async () => {
    const s = setup({ [PROPOSAL]: proposalText().replace("Linsen und Brühe", "<% tp.x %> Linsen") });
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    await s.service.orphan(PROPOSAL, "save");
    expect(notices.some((n) => n.includes("Rote Linsensuppe"))).toBe(true);
    expect(s.text(`${FOLDER}/Rote Linsensuppe.md`)).not.toContain("<%");
  });

  it("can be discarded, with its images", async () => {
    const s = setup({ [PROPOSAL]: proposalText(), [COVER]: "img" });
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    await s.service.orphan(PROPOSAL, "discard");
    expect([...s.store.keys()]).toEqual([]);
    expect(s.service.orphanList()).toEqual([]);
  });

  it("is dropped quietly when the job was dropped with the deleted note", async () => {
    const s = setup({ [PROPOSAL]: proposalText(), [COVER]: "img" }, [job({ dropped: true })]);
    await s.service.handle(PROPOSAL);
    expect([...s.store.keys()]).toEqual([]);
    expect(s.service.orphanList()).toEqual([]);
    expect(s.plugin.settings.jobs).toEqual([]);
    expect(notices).toEqual([]);
  });
});

describe("a proposal that is not what it claims", () => {
  const NAMED = `${FOLDER}/Verbesserungen/rz-m1-0002.md`;

  it("is rejected when the file name and the job ID of the note differ: nothing is touched, only a card", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [NAMED]: proposalText(), [COVER]: "img", [TIMELINE]: "<svg/>" });
    await s.service.handle(NAMED);
    expect(s.text(NOTE)).toBe(before);
    expect(s.service.orphanList()).toEqual([
      { path: NAMED, job: "rz-m1-0002", title: "Rote Linsensuppe", kind: "invalid" },
    ]);
    expect(s.service.proposals()).toEqual([]);
    expect(s.plugin.settings.jobs).toHaveLength(1);
    // It is never turned into a recipe; discarding takes only the file, and no image: none is named by this ID.
    expect(await s.service.orphan(NAMED, "save")).toMatchObject({ ok: false });
    expect(s.trashed).toEqual([]);
    expect(await s.service.orphan(NAMED, "discard")).toMatchObject({ ok: true });
    expect([...s.store.keys()].sort()).toEqual([COVER, NOTE, TIMELINE].sort());
    expect(s.trashed).toEqual([NAMED]);
  });

  it("is rejected when the name is no job ID, like 'Lasagne', even if the note agrees", async () => {
    const lasagne = `---\ntyp: rezept\nauftrag: Lasagne\nimport: fertig\n---\n# Lasagne\n\n## Zutaten\n- 1 Ei\n`;
    const files = {
      [`${FOLDER}/Lasagne.md`]: lasagne,
      [`${FOLDER}/Verbesserungen/Lasagne.md`]: proposalText().replace("rz-m1-0001", "Lasagne"),
      [`${FOLDER}/Bilder/Lasagne Titelbild.webp`]: "mein Bild",
    };
    const s = setup(files, []);
    await s.service.handle(`${FOLDER}/Verbesserungen/Lasagne.md`);
    expect(s.text(`${FOLDER}/Lasagne.md`)).toBe(lasagne);
    expect(s.service.orphanList()).toMatchObject([{ kind: "invalid" }]);
    await s.service.orphan(`${FOLDER}/Verbesserungen/Lasagne.md`, "discard");
    expect(s.trashed).toEqual([`${FOLDER}/Verbesserungen/Lasagne.md`]);
    expect(s.store.has(`${FOLDER}/Bilder/Lasagne Titelbild.webp`)).toBe(true);
  });

  it("never changes a finished recipe that happens to carry the job ID, for a job unknown here", async () => {
    const done = firstVersion().replace("import: offen", "import: fertig");
    const s = setup({ [NOTE]: done, [PROPOSAL]: proposalText() }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(done);
    expect(s.service.orphanList()).toMatchObject([{ kind: "orphan" }]);
  });

  it("takes the note that says 'offen' when a routine without 'verbessern' made a second note with the job ID", async () => {
    const second = `${FOLDER}/Linsensuppe 2.md`;
    const normal = firstVersion().replace("import: offen", "import: fertig");
    const s = setup({ [NOTE]: normal, [second]: firstVersion(), [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    expect(parseRecipe("x", s.text(second)).title).toBe("Rote Linsensuppe");
    expect(s.text(NOTE)).toBe(normal);
  });
});

describe("the timeout of an improvement job", () => {
  const timedOut = (o = {}) => job({ errorKey: "noImprovementArrived", ...o });
  const run = (s: ReturnType<typeof setup>) => s.service.afterReconcile(s.plugin.settings.jobs);

  it("leaves the first version as 'teilweise' with the reason, on the device that started the job", async () => {
    const s = setup({ [NOTE]: firstVersion() }, [timedOut()]);
    await run(s);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toContain("keine Verbesserung angekommen");
    expect(r.title).toBe("Linsensuppe");
  });

  it("happens once per job: the job is marked and the note is not read or written again", async () => {
    const s = setup({ [NOTE]: firstVersion() }, [timedOut()]);
    await run(s);
    expect(s.plugin.settings.jobs[0]).toMatchObject({ timedOut: true });
    const process = vi.spyOn(s.plugin.app.vault, "process");
    const read = vi.spyOn(s.plugin.app.vault, "cachedRead");
    await run(s);
    await run(s);
    expect(process).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });

  it("is a compare-and-set that writes nothing when the note would not change, and still marks the job", async () => {
    const done = firstVersion().replace("import: offen", "import: fertig");
    const a = setup({ [NOTE]: done }, [timedOut()]);
    const process = vi.spyOn(a.plugin.app.vault, "process");
    await run(a);
    expect(a.text(NOTE)).toBe(done);
    expect(process).not.toHaveBeenCalled();
    expect(a.plugin.settings.jobs[0]).toMatchObject({ timedOut: true });
  });

  it("does nothing on another device and for another error", async () => {
    const b = setup({ [NOTE]: firstVersion() }, [timedOut({ device: "d2" })]);
    await run(b);
    expect(b.text(NOTE)).toBe(firstVersion());
    expect(b.plugin.settings.jobs[0]).not.toHaveProperty("timedOut");
    const c = setup({ [NOTE]: firstVersion() }, [job({ errorKey: "noRecipeArrived" })]);
    await run(c);
    expect(c.text(NOTE)).toBe(firstVersion());
  });

  it("removes a job of a deleted note once its time is over and no proposal came", async () => {
    const dropped = job({ dropped: true, since: Date.now() });
    const s = setup({}, [dropped]);
    await run(s);
    expect(s.plugin.settings.jobs).toHaveLength(1);
    later(21);
    await run(s);
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("keeps such a job while its proposal is there", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, [job({ dropped: true, since: Date.now() })]);
    s.service["seen"].set(PROPOSAL, { job: "rz-m1-0001", valid: true, recipe: {} as never });
    later(21);
    await s.service.afterReconcile(s.plugin.settings.jobs);
    expect(s.plugin.settings.jobs).toHaveLength(1);
  });
});

describe("what the page shows for a first version", () => {
  const recipe = () => ({ ...parseRecipe(NOTE, firstVersion()), imageSrcs: [] });

  it("shows 'offen' as 'teilweise' when no improvement job is open for it", () => {
    const s = setup({ [NOTE]: firstVersion() }, []);
    const [r] = s.service.mark([recipe()]);
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toContain("läuft nicht mehr");
  });

  it("keeps 'offen' while the job is open, also one of another device", () => {
    for (const jobs of [[job()], [job({ device: "d2" })]]) {
      const [r] = setup({ [NOTE]: firstVersion() }, jobs).service.mark([recipe()]);
      expect(r.importState).toBe("offen");
    }
  });

  it("shows it as 'teilweise' for a failed or dropped job, and when it is no improvement job", () => {
    for (const j of [job({ errorKey: "noImprovementArrived" }), job({ dropped: true }), job({ improve: undefined })])
      expect(setup({ [NOTE]: firstVersion() }, [j]).service.mark([recipe()])[0].importState).toBe("teilweise");
  });
});
