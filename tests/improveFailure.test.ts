// Failed proposals, proposals without a note, invalid files, the timeout and leftover images (ADR 0007).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { SESSION_ID, cleanupStarting } from "../src/improveTarget";
import {
  COVER,
  FOLDER,
  NOTE,
  PROPOSAL,
  TIMELINE,
  firstVersion,
  job,
  partialVersion,
  proposalText,
  setup,
} from "./improveFake";

const MIN = 60_000;
const setTimeoutMock = vi.fn(() => 1);

beforeEach(() => {
  notices.length = 0;
  setLanguage("de");
  setTimeoutMock.mockClear();
  vi.stubGlobal("window", { setTimeout: setTimeoutMock, clearTimeout: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const later = (min: number) => vi.setSystemTime(Date.now() + min * MIN);
/** Past the waiting time for another device to sync (src/improveWait.ts): a proposal is then a real orphan. */
const WAIT = 24 * 60 + 5;

describe("a failed improvement", () => {
  const failed = () => proposalText("", "fehler", "Das Video enthält kein Rezept");
  const why = "Verbesserung gescheitert: Das Video enthält kein Rezept. Die erste Fassung bleibt.";

  it("leaves a complete first version as it is without a job ('fertig'), trashes the proposal and tells the user", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: failed() });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.title).toBe("Linsensuppe");
    expect(r.steps).toEqual([{ text: "Alles kochen." }]);
    expect(r.importState).toBe("fertig");
    expect(r.importError).toBeFalsy();
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(notices).toEqual([why]);
    expect(s.plugin.settings.jobs).toEqual([]);
  });

  it("leaves an incomplete one 'teilweise' with what is missing and then the reason", async () => {
    const s = setup({ [NOTE]: partialVersion(), [PROPOSAL]: failed() });
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toBe("Der Text enthält keine Schritte. Das Video enthält kein Rezept");
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
      const s = setup({ [NOTE]: partialVersion(), [PROPOSAL]: failed() }, jobs);
      await s.service.handle(PROPOSAL);
      expect(parseRecipe("x", s.text(NOTE)).importError).toContain("Das Video enthält kein Rezept");
      expect(s.store.has(PROPOSAL)).toBe(false);
      expect(notices).toEqual([why]);
      // A job of another device is not touched.
      expect(s.plugin.settings.jobs).toHaveLength(jobs.length);
    }
  });

  it("does not touch a note that is not 'offen' for a job unknown here: the failed proposal is discarded quietly", async () => {
    const done = firstVersion().replace("import: offen", "import: fertig");
    const s = setup({ [NOTE]: done, [PROPOSAL]: failed() }, []);
    await s.service.handle(PROPOSAL);
    // A note that is not "offen" is no target for an unknown job at all: wait, then the proposal goes (no card to save it as a recipe).
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.text(NOTE)).toBe(done);
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.service.orphanList()).toEqual([]);
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

describe("a proposal without a note that another device may still sync (#156)", () => {
  /** The proposal of a run that the other device rebound its note to; it names the post as its source. */
  const withSource = () => proposalText().replace(/^quelle:.*$/m, "quelle: https://example.org/r");
  /** The note another device is going to rebind: same source, but not (yet) the job ID of the proposal. */
  const sameSource = () =>
    firstVersion().replace("auftrag: rz-m1-0001", "auftrag: rz-alt-0000").replace("offen", "fertig");

  it("is no orphan after the grace period but a waiting card, and 'save as a new recipe' is refused", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([
      { path: PROPOSAL, job: "rz-m1-0001", title: "Rote Linsensuppe", kind: "waiting" },
    ]);
    const r = await s.service.orphan(PROPOSAL, "save");
    expect(r.ok).toBe(false);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect([...s.store.keys()].filter((k) => !k.includes("Verbesserungen"))).toEqual([]);
  });

  it("becomes a real orphan once the waiting time is over and no note has the same source", async () => {
    const s = setup({ [PROPOSAL]: withSource() }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "waiting" }]);
    later(24 * 60);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "orphan" }]);
    expect(await s.service.orphan(PROPOSAL, "save")).toMatchObject({ ok: true });
  });

  it("ends as an unexpected card after the waiting time when a note with the same source exists, and links to it", async () => {
    const s = setup({ [PROPOSAL]: withSource(), [NOTE]: sameSource() }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    later(3 * 24 * 60);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([
      {
        path: PROPOSAL,
        job: "rz-m1-0001",
        title: "Rote Linsensuppe",
        kind: "unexpected",
        note: { path: NOTE, title: "Linsensuppe" },
      },
    ]);
    expect(await s.service.orphan(PROPOSAL, "save")).toMatchObject({ ok: false });
  });

  it("can be discarded while it waits", async () => {
    const s = setup({ [PROPOSAL]: withSource(), [COVER]: "img" }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(await s.service.orphan(PROPOSAL, "discard")).toMatchObject({ ok: true });
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.store.has(COVER)).toBe(false);
    expect(s.service.orphanList()).toEqual([]);
  });

  it("takes the normal way when the note with the job ID arrives meanwhile (applied on the device that started the job)", async () => {
    const s = setup({ [PROPOSAL]: withSource(), [NOTE]: sameSource() });
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "waiting" }]);
    s.store.set(NOTE, firstVersion());
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([]);
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Rote Linsensuppe");
    expect(s.store.has(PROPOSAL)).toBe(false);
  });

  it("is looked at again when a note changes, although its timer is long", async () => {
    const s = setup({ [PROPOSAL]: withSource() }, []);
    s.service.start();
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "waiting" }]);
    s.store.set(NOTE, firstVersion());
    setTimeoutMock.mockClear();
    s.fire("mc:changed", s.file(NOTE));
    expect(setTimeoutMock).toHaveBeenCalled();
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
    later(WAIT);
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
    // The job is unknown here and the note came late: its device gets the ten minutes first (#156).
    expect(s.service.mark([{ ...parseRecipe(NOTE, firstVersion()), imageSrcs: [] }])[0].improvement).toBe("waiting");
    later(11);
    await s.service.handle(PROPOSAL);
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
    later(WAIT);
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
    later(WAIT);
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
    // The job ID is carried by a note: never offered as a recipe of its own, only to discard.
    expect(s.service.orphanList()).toMatchObject([{ kind: "claimed" }]);
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

  it("leaves a complete first version as 'fertig', the state it has without a job, on the device that started the job", async () => {
    const s = setup({ [NOTE]: firstVersion() }, [timedOut()]);
    await run(s);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.importState).toBe("fertig");
    expect(r.importError).toBeFalsy();
    expect(r.title).toBe("Linsensuppe");
  });

  it("leaves an incomplete one as 'teilweise' with what is missing and then the reason", async () => {
    const partial = firstVersion().replace(/## Schritte[\s\S]*?(?=\n## )/, "## Schritte\n1. ");
    const s = setup({ [NOTE]: partial }, [timedOut()]);
    await run(s);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.importState).toBe("teilweise");
    expect(r.importError).toMatch(/^Der Text enthält keine Schritte\. .*keine Verbesserung angekommen/);
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

describe("a first version whose job was reserved but never sent (#133)", () => {
  const starting = (o = {}) => job({ starting: "old-session", ...o });

  it("is cleaned up at the start: the job goes, the note goes back to the state without a job", async () => {
    const s = setup({ [NOTE]: firstVersion() }, [starting()]);
    await cleanupStarting(s.plugin as never);
    expect(s.plugin.settings.jobs).toEqual([]);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.importState).toBe("fertig");
  });
  it("works without a note (the app closed before it was written)", async () => {
    const s = setup({}, [starting()]);
    await cleanupStarting(s.plugin as never);
    expect(s.plugin.settings.jobs).toEqual([]);
  });
  it("leaves a reservation of this session (still in flight), one of another device and a real job alone", async () => {
    const jobs = [
      starting({ starting: SESSION_ID }),
      starting({ id: "rz-m1-0002", device: "d2" }),
      job({ id: "rz-m1-0003" }),
    ];
    const s = setup({ [NOTE]: firstVersion() }, jobs);
    await cleanupStarting(s.plugin as never);
    expect(s.plugin.settings.jobs).toHaveLength(3);
    expect(s.text(NOTE)).toBe(firstVersion());
  });
});
