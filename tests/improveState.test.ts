// State of improvements (ADR 0007): the review kept in the job, retries with new IDs, moves of images, events and loops.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { SeenStore } from "../src/improveSeen";
import { checkJobs } from "../src/processor";
import { COVER, FOLDER, NOTE, PROPOSAL, TIMELINE, firstVersion, job, proposalText, setup } from "./improveFake";

const MIN = 60_000;
const OLD = "rz-m1-0001";
const NEW = "rz-m1-0002";
const REVIEW = { proposal: PROPOSAL, target: NOTE };
let queue: ((() => void) | null)[] = [];

beforeEach(() => {
  notices.length = 0;
  queue = [];
  setLanguage("de");
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void) => queue.push(fn) - 1,
    clearTimeout: (id: number) => void (queue[id] = null),
  });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());

const later = (min: number) => vi.setSystemTime(Date.now() + min * MIN);
const view = (path: string, text: string) => ({ ...parseRecipe(path, text), imageSrcs: [] });
/** Runs what was scheduled, as often as it schedules more (at most a few rounds: a loop would not end). */
/** The timers of the service that were scheduled but never run in the test (the clock is not driven). */
const forgetTimers = (s: { service: object }) =>
  (s.service as unknown as { timers: Map<string, number> }).timers.clear();
const pending = () => queue.filter(Boolean).length;
const drain = async (rounds = 5) => {
  for (let i = 0; i < rounds && pending(); i++) {
    const now = queue.splice(0);
    for (const fn of now) fn?.();
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
  }
};

describe("a retry starts a new run with a new job ID", () => {
  const retried = () => job({ id: NEW, retryOf: [{ job: OLD }] });
  const lateProposal = proposalText();

  it("drops the late proposal of the old run, with its images, and shows no card", async () => {
    const note = firstVersion().replace(OLD, NEW);
    const s = setup({ [NOTE]: note, [PROPOSAL]: lateProposal, [COVER]: "img", [TIMELINE]: "<svg/>" }, [retried()]);
    await s.service.handle(PROPOSAL);
    expect([...s.store.keys()]).toEqual([NOTE]);
    expect(s.text(NOTE)).toBe(note);
    expect(s.service.orphanList()).toEqual([]);
    expect(s.service.proposals()).toEqual([]);
    expect(notices).toEqual([]);
    // The job of the new run is untouched and still waits for its own proposal.
    expect(s.plugin.settings.jobs).toEqual([retried()]);
  });

  it("the proposal of the new run is applied, and the old one cannot touch the note", async () => {
    const note = firstVersion().replace(OLD, NEW);
    const dir = `${FOLDER}/Verbesserungen`;
    const s = setup(
      { [NOTE]: note, [`${dir}/${NEW}.md`]: proposalText().replace(OLD, NEW), [PROPOSAL]: lateProposal },
      [retried()],
    );
    await s.service.handle(PROPOSAL);
    await s.service.handle(`${dir}/${NEW}.md`);
    expect(parseRecipe("x", s.text(NOTE)).title).toBe("Rote Linsensuppe");
    expect(s.store.has(PROPOSAL)).toBe(false);
  });

  it("sets the new job ID in the note, only if it still carries the old one (compare-and-set)", async () => {
    const s = setup({ [NOTE]: firstVersion() }, [retried()]);
    await s.service.rebind(OLD, NEW);
    expect(parseRecipe("x", s.text(NOTE)).job).toBe(NEW);
    expect(s.text(NOTE)).toBe(firstVersion().replace(OLD, NEW));
    const process = vi.spyOn(s.plugin.app.vault, "process");
    await s.service.rebind(OLD, "rz-m1-0003");
    expect(process).not.toHaveBeenCalled();
    expect(parseRecipe("x", s.text(NOTE)).job).toBe(NEW);
  });

  it("does not look for a note that carries another ID", async () => {
    const other = firstVersion().replace(OLD, "rz-m1-0077");
    const s = setup({ [NOTE]: other }, []);
    await s.service.rebind(OLD, NEW);
    expect(s.text(NOTE)).toBe(other);
  });
});

describe("a review is kept in the job", () => {
  const other = () => `${FOLDER}/Linsensuppe Kopie.md`;

  it("survives a restart: the banner is there and the dialog works before the proposal was looked at again", async () => {
    const jobs = [job({ review: REVIEW })];
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() }, jobs);
    expect(s.service.mark([view(NOTE, firstVersion())])[0].improvement).toBe("ready");
    const pre = await s.service.preview(NOTE);
    expect(pre.ok).toBe(true);
    expect((await s.service.apply(NOTE, [])).ok).toBe(true);
    expect(s.plugin.settings.jobs).toEqual([]);
    expect(s.store.has(PROPOSAL)).toBe(false);
  });

  it("is not timed out or shown as a running job while it waits for the user", () => {
    const jobs = [job({ review: REVIEW, since: 1 })];
    const r = checkJobs(jobs, [], () => undefined, Date.now(), []);
    expect(r.pending).toEqual(jobs);
    expect(r.done).toEqual([]);
  });

  it("does not turn 'offen' into 'teilweise' while a review is open, and does so without any job", () => {
    const s = setup({ [NOTE]: firstVersion() }, [job({ review: REVIEW })]);
    expect(s.service.mark([view(NOTE, firstVersion())])[0].importState).toBe("offen");
    const none = setup({ [NOTE]: firstVersion() }, []);
    expect(none.service.mark([view(NOTE, firstVersion())])[0].importState).toBe("teilweise");
  });

  it("shows the banner only on the note it was made for, not on a copy with the same auftrag", async () => {
    const s = setup({ [NOTE]: firstVersion(), [other()]: firstVersion(), [PROPOSAL]: proposalText() }, [
      job({ review: REVIEW }),
    ]);
    const [a, b] = s.service.mark([view(NOTE, firstVersion()), view(other(), firstVersion())]);
    expect(a.improvement).toBe("ready");
    expect(b.improvement).toBeUndefined();
    expect(await s.service.preview(other())).toMatchObject({ ok: false });
    expect(await s.service.apply(other(), [])).toMatchObject({ ok: false });
    expect(s.store.has(PROPOSAL)).toBe(true);
  });

  it("follows the note when it is renamed", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() }, [job({ review: REVIEW })]);
    s.service.start();
    const to = `${FOLDER}/Rote Suppe.md`;
    s.store.set(to, s.text(NOTE));
    s.fire("rename", { path: to }, NOTE);
    await vi.waitFor(() => expect(s.plugin.settings.jobs[0].review?.target).toBe(to));
    expect(s.service.mark([view(to, s.text(to))])[0].improvement).toBe("ready");
  });

  it("ends when the proposal was deleted elsewhere, on the event and at the start", async () => {
    const live = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() }, [job({ review: REVIEW })]);
    live.service.start();
    live.store.delete(PROPOSAL);
    live.fire("delete", { path: PROPOSAL });
    await vi.waitFor(() => expect(live.plugin.settings.jobs).toEqual([]));
    const start = setup({ [NOTE]: firstVersion() }, [job({ review: REVIEW }), job({ id: OLD.replace("1", "9") })]);
    start.service.start();
    await vi.waitFor(() => expect(start.plugin.settings.jobs.map((j) => j.review)).toEqual([undefined]));
  });
});

describe("images move before the note is written", () => {
  it("a failed move leaves the link on the old name, and that image is kept", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText(), [COVER]: "img", [TIMELINE]: "<svg/>" });
    s.plugin.app.fileManager.renameFile = async () => {
      throw new Error("locked");
    };
    await s.service.handle(PROPOSAL);
    const r = parseRecipe("x", s.text(NOTE));
    expect(r.image).toBe("rz-m1-0001 Titelbild.webp");
    expect(r.timeline).toBe("rz-m1-0001 Ablauf.svg");
    expect(s.store.has(COVER)).toBe(true);
    expect(s.store.has(TIMELINE)).toBe(true);
    expect(s.store.has(PROPOSAL)).toBe(false);
  });

  it("moves them back when the note was not written (it changed in between)", async () => {
    const edited = firstVersion().replace("- 1 Zwiebel", "- 2 Zwiebeln");
    const s = setup({ [NOTE]: edited, [PROPOSAL]: proposalText(), [COVER]: "img" }, [job({ review: REVIEW })]);
    const create = s.plugin.app.vault.create;
    s.plugin.app.vault.create = async (p: string, t: string) => {
      s.store.set(NOTE, s.text(NOTE) + "\nNeu.\n");
      return create(p, t);
    };
    const r = await s.service.apply(NOTE, ["ingredients"]);
    expect(r).toMatchObject({ ok: false, stale: true });
    expect(s.store.has(COVER)).toBe(true);
    expect(s.store.has(`${FOLDER}/Bilder/Linsensuppe Titelbild.webp`)).toBe(false);
    expect(s.store.has(PROPOSAL)).toBe(true);
  });
});

describe("events and loops", () => {
  const dir = `${FOLDER}/Verbesserungen`;

  it("a proposal that is applied does not lead back into itself", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText() });
    const process = vi.spyOn(s.plugin.app.vault, "process");
    s.service.start();
    s.fire("create", { path: PROPOSAL });
    expect(pending()).toBe(1);
    await drain();
    expect(process).toHaveBeenCalledTimes(1);
    // What Obsidian reports about the service's own writes.
    s.fire("modify", { path: NOTE });
    s.fire("mc:changed", s.file(NOTE));
    s.fire("delete", { path: PROPOSAL });
    s.fire("rename", { path: `${FOLDER}/Bilder/Linsensuppe Titelbild.webp` }, COVER);
    s.fire("mc:changed", s.file(NOTE));
    await drain();
    expect(pending()).toBe(0);
    expect(process).toHaveBeenCalledTimes(1);
  });

  it("a failed proposal that is dealt with is not looked at again after its own writes", async () => {
    const s = setup({ [NOTE]: firstVersion(), [PROPOSAL]: proposalText("", "fehler", "kein Rezept") });
    const process = vi.spyOn(s.plugin.app.vault, "process");
    s.service.start();
    s.fire("modify", { path: PROPOSAL });
    await drain();
    expect(process).toHaveBeenCalledTimes(1);
    s.fire("modify", { path: NOTE });
    s.fire("mc:changed", s.file(NOTE));
    s.fire("delete", { path: PROPOSAL });
    await drain();
    expect(pending()).toBe(0);
    expect(process).toHaveBeenCalledTimes(1);
  });

  it("only proposals and notes of the recipe folder matter, and only a changed auftrag or import state", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    s.service.start();
    await s.service.handle(PROPOSAL);
    queue.length = 0;
    forgetTimers(s);
    // Outside the recipe folder, or in the folder but not a proposal or a note: nothing.
    s.fire("create", { path: "Anderes/Notiz.md" });
    s.fire("mc:changed", { path: "Anderes/Notiz.md" });
    s.fire("modify", { path: `${dir}/rz-m1-0001.md` }); // a proposal: scheduled, once
    expect(pending()).toBe(1);
    queue.length = 0;
    forgetTimers(s);
    // A note of the folder: the first sight counts, the same again does not.
    s.store.set(NOTE, firstVersion().replace(OLD, "rz-m1-0555"));
    s.fire("mc:changed", s.file(NOTE));
    expect(pending()).toBe(1);
    queue.length = 0;
    s.fire("mc:changed", s.file(NOTE));
    expect(pending()).toBe(0);
  });

  it("a card is looked at again only for a new or renamed note, not for every change", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    s.service.start();
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toHaveLength(1);
    queue.length = 0;
    forgetTimers(s);
    s.store.set(NOTE, "---\nauftrag: x\n---\n# A\n");
    s.fire("mc:changed", s.file(NOTE));
    expect(pending()).toBe(0);
    s.fire("create", { path: `${FOLDER}/Neu.md` });
    expect(pending()).toBe(1);
  });
});

describe("the first sight of a proposal outlasts a restart", () => {
  it("counts the grace period from the first sight, not from the start of this session", async () => {
    const s = setup({ [PROPOSAL]: proposalText() }, []);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([]);
    later(3);
    const restarted = s.another();
    await restarted.handle(PROPOSAL);
    expect(restarted.orphanList()).toHaveLength(1);
  });

  it("is small and bounded, and a broken storage only starts the times again", () => {
    const store = new Map<string, string>([["better-cooking-improve-seen", "kaputt"]]);
    const app = {
      loadLocalStorage: (k: string) => store.get(k),
      saveLocalStorage: (k: string, v: string) => void store.set(k, v),
    };
    const seen = new SeenStore(app as never);
    expect(seen.first("a", 5)).toBe(5);
    for (let i = 0; i < 80; i++) seen.first(`p${i}`, 100 + i);
    const kept = Object.keys(JSON.parse(store.get("better-cooking-improve-seen")!) as object);
    expect(kept).toHaveLength(50);
    expect(kept).not.toContain("a");
    expect(new SeenStore(app as never).first("p79", 9999)).toBe(179);
    seen.forget("p79");
    expect(new SeenStore(app as never).first("p79", 9999)).toBe(9999);
  });

  it("works when the storage throws", () => {
    const app = {
      loadLocalStorage: () => {
        throw new Error("no");
      },
      saveLocalStorage: () => {
        throw new Error("no");
      },
    };
    expect(new SeenStore(app as never).first("a", 7)).toBe(7);
  });
});
