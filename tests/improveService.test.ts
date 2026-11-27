import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { actions, notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import {
  better,
  COVER,
  FOLDER,
  NOTE,
  PROPOSAL,
  TIMELINE,
  backups,
  firstVersion,
  job,
  proposalText,
  setup,
} from "./improveFake";

beforeEach(() => {
  notices.length = 0;
  actions.length = 0;
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
});

describe("a proposal on the device that started the job", () => {
  it("is merged into the note, the proposal goes, the notice offers Undo and the job is closed", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.title).toBe("Rote Linsensuppe");
    expect(r.steps).toHaveLength(2);
    expect(r.ingredients[0].ingredients).toEqual(better.ingredients);
    expect(r.importState).toBe("fertig");
    expect(r.job).toBe("rz-1");
    expect(r.source).toBe("https://example.org/r");
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(backups(s)).toHaveLength(1);
    expect(notices).toEqual(["Verbessert: Rote Linsensuppe"]);
    expect(actions).toHaveLength(1);
    expect(s.plugin.settings.jobs).toEqual([]);
    expect(s.service.orphanList()).toEqual([]);
  });

  it("keeps what is not imported: status, rating, attempts, own notes and sections", async () => {
    const own = firstVersion()
      .replace("status: ausprobieren", "status: bewaehrt")
      .replace("bewertung:", "bewertung: 5")
      .replace("- \n", "- Mehr Salz\n")
      .concat("\n## Meine Idee\n\nMit Kokosmilch.\n");
    const s = setup({ [NOTE]: own, [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    const text = s.text(NOTE);
    expect(text).toContain("status: bewaehrt");
    expect(text).toContain("bewertung: 5");
    expect(text).toContain("## Meine Idee");
    expect(text).toContain("Mehr Salz");
    expect(parseRecipe("x", text).title).toBe("Rote Linsensuppe");
  });

  it("writes the reason of a partial proposal and sets the state from the proposal", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText("", "teilweise", "Mengen fehlen im Video") });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toBe("Mengen fehlen im Video");
  });

  it("works from the German proposal into an English note and back (names of the note stay)", async () => {
    const en = firstVersion().replace("auftrag:", "job:");
    const s = setup({ [NOTE]: en, [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    const text = s.text(NOTE);
    expect(text.match(/^(auftrag|job):/gm)).toEqual(["job:"]);
    expect(parseRecipe("x", text).importState).toBe("fertig");
  });

  it("takes the cover and the timeline graphic when the note has none, renamed after the note", async () => {
    const s = setup({
      [NOTE]: firstVersion(),
      [PROPOSAL]: proposalText(),
      [COVER]: "img",
      [TIMELINE]: "<svg/>",
    });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.image).toBe("Linsensuppe Titelbild.webp");
    expect(r.timeline).toBe("Linsensuppe Ablauf.svg");
    expect(s.store.has(`${FOLDER}/Bilder/Linsensuppe Titelbild.webp`)).toBe(true);
    expect(s.store.has(`${FOLDER}/Bilder/Linsensuppe Ablauf.svg`)).toBe(true);
    expect(s.store.has(COVER)).toBe(false);
    expect(s.store.has(TIMELINE)).toBe(false);
  });

  it("takes neither when the note has both: the images of the proposal are trashed", async () => {
    const mine = firstVersion()
      .replace(/^bild:.*$/m, 'bild: "[[Mein Bild.jpg]]"')
      .replace("## Zutaten", "## Ablauf\n![[Mein Ablauf.svg]]\n\n## Zutaten");
    const s = setup({
      [NOTE]: mine,
      [PROPOSAL]: proposalText(),
      [COVER]: "img",
      [TIMELINE]: "<svg/>",
      [`${FOLDER}/Bilder/Mein Bild.jpg`]: "mine",
    });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.image).toBe("Mein Bild.jpg");
    expect(r.timeline).toBe("Mein Ablauf.svg");
    expect(s.trashed).toEqual(expect.arrayContaining([PROPOSAL, COVER, TIMELINE]));
    expect(s.store.has(`${FOLDER}/Bilder/Mein Bild.jpg`)).toBe(true);
  });

  it("waits for an image the proposal names but that has not arrived yet", async () => {
    const s = setup({
      [NOTE]: firstVersion(),
      [PROPOSAL]: proposalText().replace(/^bild:.*$/m, 'bild: "[[rz-1 Titelbild.webp]]"'),
    });
    await s.service.handle(PROPOSAL);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Linsensuppe");
    s.store.set(COVER, "img");
    await s.service.handle(PROPOSAL);
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(parseRecipe("x", s.text(NOTE)).image).toBe("Linsensuppe Titelbild.webp");
  });

  it("only closes the job of its proposal", async () => {
    const other = job({ id: "rz-2" });
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() }, [job(), other]);
    await s.service.handle(PROPOSAL);
    expect(s.plugin.settings.jobs).toEqual([other]);
  });
});

describe("Undo", () => {
  it("brings back the first version if the note is still what the merge wrote", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    actions[0].run();
    await vi.waitFor(() => expect(notices).toContain("Verbesserung zurückgenommen."));
    expect(s.text(NOTE)).toBe(before);
  });

  it("does nothing when the note changed in the meantime (compare-and-set)", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    const merged = s.text(NOTE);
    s.store.set(NOTE, merged + "\nMeine Notiz.\n");
    actions[0].run();
    await vi.waitFor(() => expect(notices.at(-1)).toContain("inzwischen geändert"));
    expect(s.text(NOTE)).toBe(merged + "\nMeine Notiz.\n");
  });
});

describe("hand edits", () => {
  const edited = () => firstVersion().replace("- 1 Zwiebel", "- 2 Zwiebeln");

  it("ask first when an edited part would change: banner, no write, no backup", async () => {
    const before = edited();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(before);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect(backups(s)).toEqual([]);
    expect(notices).toEqual([]);
    const marked = s.service.mark([{ ...parseRecipe(NOTE, before), imageSrcs: [] }]);
    expect(marked[0].improvement).toBe(true);
    // The job is done with here; the proposal is found again by the job ID of the note.
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("show in the dialog which parts the user edited, and keep them unless told otherwise", async () => {
    const s = setup({ [NOTE]: edited(), [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    const pre = await s.service.preview(NOTE);
    expect(pre).toMatchObject({ ok: true, via: "proposal" });
    if (!pre.ok) return;
    expect(pre.edited).toContain("ingredients");
    expect(pre.changes.map((c) => c.part)).toEqual(expect.arrayContaining(["title", "ingredients", "steps"]));
    const done = await s.service.apply(NOTE, []);
    expect(done.ok).toBe(true);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.title).toBe("Rote Linsensuppe");
    expect(r.ingredients[0].ingredients).toEqual(["250 g Linsen", "2 Zwiebeln"]);
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(backups(s)).toHaveLength(1);
    expect(s.service.mark([{ ...r, imageSrcs: [] }])[0].improvement).toBeUndefined();
  });

  it("replace an edit only when the user ticks it", async () => {
    const s = setup({ [NOTE]: edited(), [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    await s.service.apply(NOTE, ["ingredients"]);
    expect(parseRecipe("x", s.text(NOTE)).ingredients[0].ingredients).toEqual(better.ingredients);
  });

  it("do not write when the note changed between reading and writing", async () => {
    const s = setup({ [NOTE]: edited(), [PROPOSAL]: proposalText() });
    await s.service.handle(PROPOSAL);
    const create = s.plugin.app.vault.create;
    s.plugin.app.vault.create = async (p: string, t: string) => {
      s.store.set(NOTE, s.text(NOTE) + "\nNeu.\n");
      return create(p, t);
    };
    const r = await s.service.apply(NOTE, ["ingredients"]);
    expect(r).toMatchObject({ ok: false, stale: true });
    expect(s.text(NOTE)).toContain("Neu.");
    expect(s.store.has(PROPOSAL)).toBe(true);
  });
});

describe("another device", () => {
  it("asks instead of applying", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() }, [job({ device: "d2" })]);
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(before);
    expect(s.service.mark([{ ...parseRecipe(NOTE, before), imageSrcs: [] }])[0].improvement).toBe(true);
    // The job belongs to the other device: it is not touched here.
    expect(s.plugin.settings.jobs).toHaveLength(1);
  });

  it("asks when the job is not known here", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText() }, []);
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(before);
    expect(s.service.mark([{ ...parseRecipe(NOTE, before), imageSrcs: [] }])[0].improvement).toBe(true);
  });

  it("asks when the proposal has something suspicious", async () => {
    const before = firstVersion();
    const s = setup({ [NOTE]: before, [PROPOSAL]: proposalText().replace("Linsen und Brühe", "<% tp.x %>") });
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(before);
    expect(s.store.has(PROPOSAL)).toBe(true);
  });

  it("writes even a suspicious proposal defused, once the user applies it", async () => {
    const s = setup({
      [NOTE]: firstVersion(),
      [PROPOSAL]: proposalText().replace("Linsen und Brühe", "<% tp.x %> [[Geheim]]"),
    });
    await s.service.handle(PROPOSAL);
    await s.service.apply(NOTE, []);
    expect(s.text(NOTE)).not.toMatch(/<%|\[\[Geheim\]\]/);
  });
});
