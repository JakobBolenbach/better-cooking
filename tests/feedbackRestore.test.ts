// A note that feedback set to 'offen' (issue #120) goes back to what it was when no improvement comes: timeout,
// failed proposal, discard and Undo; and the rules for proposals whose job ID a note carries (ADR 0007).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { actions, notices } from "./stubs/obsidianFake";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { refuseRetry } from "../src/jobRetry";
import { COVER, NOTE, PROPOSAL, firstVersion, job, proposalText, setup } from "./improveFake";

const MIN = 60_000;
const setTimeout = vi.fn(() => 1);

beforeEach(() => {
  notices.length = 0;
  actions.length = 0;
  setTimeout.mockClear();
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout, clearTimeout: vi.fn() });
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
});
afterEach(() => vi.useRealTimers());
const later = (min: number) => vi.setSystemTime(Date.now() + min * MIN);

/** A finished recipe that feedback set to 'offen' with the job ID of its run. */
const feedbackNote = () => firstVersion();
const fb = (o = {}) => job({ feedback: "Ofen auf 200 °C", prevState: "fertig", ...o });
const read = (s: ReturnType<typeof setup>) => parseRecipe("x", s.text(NOTE));

describe("the note goes back to what it was", () => {
  it("after a timeout: 'fertig' again, not 'teilweise'", async () => {
    const s = setup({ [NOTE]: feedbackNote() }, [fb({ errorKey: "noImprovementArrived" })]);
    await s.service.afterReconcile(s.plugin.settings.jobs);
    expect(read(s)).toMatchObject({ importState: "fertig", title: "Linsensuppe" });
    expect(read(s).importError ?? "").toBe("");
  });
  it("puts the reason back that the note had", async () => {
    const s = setup({ [NOTE]: feedbackNote() }, [
      fb({ errorKey: "noImprovementArrived", prevState: "teilweise", prevError: "Mengen fehlen" }),
    ]);
    await s.service.afterReconcile(s.plugin.settings.jobs);
    expect(read(s)).toMatchObject({ importState: "teilweise", importError: "Mengen fehlen" });
  });
  it("after a failed proposal: the note is as before, the proposal goes and the job is closed", async () => {
    const s = setup({ [NOTE]: feedbackNote(), [PROPOSAL]: proposalText("", "fehler", "Kein Rezept") }, [fb()]);
    await s.service.handle(PROPOSAL);
    expect(read(s).importState).toBe("fertig");
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.plugin.settings.jobs).toEqual([]);
    expect(notices.join()).toContain("Kein Rezept");
  });
  it("after Discard in the review dialog", async () => {
    const s = setup({ [NOTE]: feedbackNote(), [PROPOSAL]: proposalText(), [COVER]: "i" }, [fb({ device: "d2" })]);
    await s.service.handle(PROPOSAL);
    later(11);
    await s.service.handle(PROPOSAL);
    expect(await s.service.discard(NOTE)).toMatchObject({ ok: true });
    expect(read(s)).toMatchObject({ importState: "fertig", title: "Linsensuppe" });
  });
  it("after Undo of an improvement that was applied at once", async () => {
    const s = setup({ [NOTE]: feedbackNote(), [PROPOSAL]: proposalText() }, [fb()]);
    await s.service.handle(PROPOSAL);
    expect(read(s).title).toBe("Rote Linsensuppe");
    actions[0].run();
    await vi.waitFor(() => expect(notices).toContain("Verbesserung zurückgenommen."));
    expect(read(s)).toMatchObject({ importState: "fertig", title: "Linsensuppe" });
  });
  it("a first version still goes to 'teilweise' with a reason (nothing to go back to)", async () => {
    const s = setup({ [NOTE]: firstVersion() }, [job({ errorKey: "noImprovementArrived" })]);
    await s.service.afterReconcile(s.plugin.settings.jobs);
    expect(read(s).importState).toBe("teilweise");
  });
});

describe("a proposal whose job ID a note carries", () => {
  const done = () => firstVersion().replace("import: offen", "import: fertig");
  it("is never offered as a new recipe, only to discard (also if the call is made)", async () => {
    const s = setup({ [NOTE]: done(), [PROPOSAL]: proposalText(), [COVER]: "i" }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toMatchObject([{ kind: "claimed" }]);
    const r = await s.service.orphan(PROPOSAL, "save");
    expect(r.ok).toBe(false);
    expect(s.store.has(PROPOSAL)).toBe(true);
    expect([...s.store.keys()].filter((k) => k.endsWith(".md"))).toHaveLength(2);
    expect((await s.service.orphan(PROPOSAL, "discard")).ok).toBe(true);
    expect(s.store.has(PROPOSAL)).toBe(false);
    expect(s.text(NOTE)).toBe(done());
  });
  it("is looked at again when the jobs change on another device", async () => {
    const s = setup({ [NOTE]: done(), [PROPOSAL]: proposalText() }, []);
    await s.service.handle(PROPOSAL);
    later(3);
    await s.service.handle(PROPOSAL);
    setTimeout.mockClear();
    // (the faked timers never fire: forget the ones set so far)
    (s.service as unknown as { timers: Map<string, number> }).timers.clear();
    // the job arrives by sync: the note is its target now
    s.plugin.settings.jobs = [job({ device: "d2" })];
    s.service.jobsChanged();
    expect(setTimeout).toHaveBeenCalled();
    await s.service.handle(PROPOSAL);
    expect(s.service.orphanList()).toEqual([]);
  });
});

describe("a retry", () => {
  it("is refused for an improvement job whose note no longer carries the job ID", async () => {
    const s = setup({ [NOTE]: firstVersion().replace("auftrag: rz-m1-0001", "auftrag: rz-other-0002") }, [job()]);
    expect(await refuseRetry(s.plugin as never, s.plugin.settings.jobs[0])).toContain("gehört nicht mehr");
  });
  it("is allowed while the note carries it, and for a normal job", async () => {
    const s = setup({ [NOTE]: firstVersion() }, [job()]);
    expect(await refuseRetry(s.plugin as never, s.plugin.settings.jobs[0])).toBeUndefined();
    expect(await refuseRetry(s.plugin as never, job({ improve: undefined }))).toBeUndefined();
  });
});
