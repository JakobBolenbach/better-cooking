import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { COVER, FOLDER, NOTE, PROPOSAL, TIMELINE, firstVersion, job, proposalText, setup } from "./improveFake";

beforeEach(() => {
  notices.length = 0;
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
});

describe("a failed improvement", () => {
  const failed = () => proposalText("", "fehler", "Das Video enthält kein Rezept");

  it("leaves the first version, writes the reason, trashes the proposal and tells the user", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: failed() });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.title).toBe("Linsensuppe");
    expect(r.steps).toEqual([{ text: "Alles kochen." }]);
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toBe("Das Video enthält kein Rezept");
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(notices).toEqual(["Verbesserung gescheitert: Das Video enthält kein Rezept. Die erste Fassung bleibt."]);
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("only changes a note that still waits for this job", async () => {
    const done = firstVersion().replace("import: offen", "import: fertig");
    const s = setup({ [NOTE]: done, [PROPOSAL]: failed() });
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(done);
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(notices).toEqual([]);
  });

  it("does nothing on another device", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: failed() }, [job({ device: "d2" })]);
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(before);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(notices).toEqual([]);
    expect(s.service.mark([{ ...parseRecipe(NOTE, before), imageSrcs: [] }])[0].improvement).toBeUndefined();
  });
});

describe("a proposal without a note", () => {
  it("is kept and listed as 'recipe not found'", async () => {
    const s = setup({ [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([{ path: PROPOSAL, job: "rz-1", title: "Rote Linsensuppe" }]);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(s.service.proposals()[0].job).toBe("rz-1");
  });

  it("can be saved as a new recipe, with its images", async () => {
    const s = setup({ [PROPOSAL]: proposalText(), [COVER]: "img", [TIMELINE]: "<svg/>" });
    await s.service.handle(PROPOSAL);
    const r = await s.service.orphan(PROPOSAL, "save");
    expect(r).toEqual({ ok: true, message: "Gespeichert: Rote Linsensuppe" });
    const note = parseRecipe("x", s.text(`${FOLDER}/Rote Linsensuppe.md`));
    expect(note.steps).toHaveLength(2);
    expect(note.image).toBe("Rote Linsensuppe Titelbild.webp");
    expect(note.timeline).toBe("Rote Linsensuppe Ablauf.svg");
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.service.orphanList()).toEqual([]);
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("can be discarded", async () => {
    const s = setup({ [PROPOSAL]: proposalText(), [COVER]: "img" });
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
