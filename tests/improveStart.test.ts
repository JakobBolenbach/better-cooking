// The common start of an improvement job (src/improveStart.ts) for feedback (#120) and "Retry": reserve, bind the note,
// send; accepted, clearly refused, or no answer at all.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { sendFeedback } from "../src/feedbackService";
import { retryJob } from "../src/jobRetry";
import { SESSION_ID } from "../src/improveTarget";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { FOLDER, NOTE, PROPOSAL, firstVersion, job, proposalText, setup } from "./improveFake";
import type { Job } from "../src/types";

const done = () => firstVersion().replace(/import: \w+/, "import: fertig");
const noJob = () => done().replace(/auftrag: .*\n/, "");
const read = (text: string) => parseRecipe("x", text);

type Sent = { ok: boolean; message?: string; job?: string; unsure?: true };
type Improve = { id?: string; feedback?: string };

/** What `plugin.sendJob` does: on success the real job takes the reservation's place. */
function host(text: string, jobs: Job[] = [], ready = { ai: false, claude: true, github: false }, device = "d1") {
  const s = setup({ [NOTE]: text }, jobs, device);
  const seen: { reserved?: Job; note?: string }[] = [];
  const sendJob = vi.fn(
    async (_e: unknown, input: string, p: string, _l?: string, improve?: Improve): Promise<Sent> => {
      seen.push({ reserved: s.plugin.settings.jobs.find((j) => j.id === improve?.id), note: s.text(NOTE) });
      const j: Job = { id: improve!.id!, input, kind: "x", since: 1, processor: p as "claude", improve: true, device };
      if (improve?.feedback) j.feedback = improve.feedback;
      s.plugin.settings.jobs = s.plugin.settings.jobs.map((x) => (x.id === j.id ? j : x));
      return { ok: true, message: "gesendet", job: j.id };
    },
  );
  Object.assign(s.plugin, { processorInfo: () => ({ ready }), sendJob, secret: () => null });
  return {
    s,
    sendJob,
    seen,
    send: (t = "Ofen auf 200 °C") => sendFeedback(s.plugin as never, NOTE, t),
    retry: (id: string) => retryJob(s.plugin as never, id),
    refuse: (message = "Abgelehnt") => sendJob.mockResolvedValueOnce({ ok: false, message }),
    noAnswer: (message = "Keine Verbindung") => sendJob.mockResolvedValueOnce({ ok: false, message, unsure: true }),
  };
}

beforeEach(() => {
  setLanguage("de");
  vi.stubGlobal("window", { setTimeout: vi.fn(() => 1), clearTimeout: vi.fn() });
});
afterEach(() => vi.useRealTimers());

describe("feedback to a processor", () => {
  it("reserves the job, binds the note to it as 'offen', and only then sends", async () => {
    const t = host(done());
    const r = await t.send("  Ofen auf 200 °C\n");
    expect(r).toEqual({ ok: true, message: "Hinweis an Claude gesendet. Die Verbesserung kommt später." });
    const [e, input, processor, , improve] = t.sendJob.mock.calls[0];
    expect(e).toMatchObject({ kind: "webseite", url: "https://example.org/r" });
    expect(input).toBe("https://example.org/r");
    expect(processor).toBe("claude");
    expect(improve).toMatchObject({ feedback: "Ofen auf 200 °C" });
    expect(improve!.id).toMatch(/^rz-[0-9a-z]+-[0-9a-z]{4}$/);
    // at the time of the request: a reservation of this session, and the note already carries the ID as 'offen'
    expect(t.seen[0].reserved).toMatchObject({ starting: SESSION_ID, improve: true, feedback: "Ofen auf 200 °C" });
    expect(read(t.seen[0].note!)).toMatchObject({ job: improve!.id, importState: "offen" });
    // afterwards: the real job, no reservation
    expect(t.s.plugin.settings.jobs).toHaveLength(1);
    expect(t.s.plugin.settings.jobs[0]).not.toHaveProperty("starting");
    expect(read(t.s.text(NOTE))).toMatchObject({ job: improve!.id, importState: "offen" });
  });
  it("binds a note that had no job ID", async () => {
    const t = host(noJob());
    expect((await t.send()).ok).toBe(true);
    expect(read(t.s.text(NOTE))).toMatchObject({ importState: "offen" });
    expect(read(t.s.text(NOTE)).job).toBe(t.sendJob.mock.calls[0][4]!.id);
  });
  it("sends the note's text when there is no source, or when the source is no real link", async () => {
    for (const none of [
      done()
        .replace(/quelle: .*\n/, "")
        .replace(/^Quelle:.*$/m, ""),
      done()
        .replace(/quelle: .*\n/, 'quelle: "ftp://x.example/a"\n')
        .replace(/^Quelle:.*$/m, ""),
      done()
        .replace(/quelle: .*\n/, 'quelle: "[[Mamas Buch]]"\n')
        .replace(/^Quelle:.*$/m, ""),
    ]) {
      const t = host(none);
      await t.send();
      expect(t.sendJob.mock.calls[0][0]).toMatchObject({ kind: "text" });
      expect(t.sendJob.mock.calls[0][1]).toMatch(/^# Linsensuppe/);
      expect(t.sendJob.mock.calls[0][1]).toContain("- 250 g Linsen");
    }
  });
  it("a clear refusal removes the reservation and closes the note in the state its content has", async () => {
    const t = host(noJob());
    t.refuse();
    expect(await t.send()).toEqual({ ok: false, message: "Abgelehnt" });
    expect(t.s.plugin.settings.jobs).toEqual([]);
    expect(read(t.s.text(NOTE)).importState).toBe("fertig");
  });
  it("no answer at all: the reservation becomes a normal job marked unsure, the note stays 'offen'", async () => {
    const t = host(done());
    t.noAnswer();
    const r = await t.send();
    expect(r.ok).toBe(true);
    expect(r.message).toContain("unklar");
    const jobs = t.s.plugin.settings.jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ unsure: true, improve: true });
    expect(jobs[0]).not.toHaveProperty("starting");
    expect(read(t.s.text(NOTE))).toMatchObject({ importState: "offen", job: jobs[0].id });
    // 'offen' is never without a job: it is open, so nothing else may start until it ends
    expect((await t.send()).message).toContain("läuft schon eine Verbesserung");
  });
  it("after an unsure start the time limit and 'Retry' apply, and a retry sends again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-27T10:00:00Z"));
    const t = host(done());
    t.noAnswer();
    await t.send();
    const unsure = t.s.plugin.settings.jobs[0];
    // the time limit passes: the job ends as 'no improvement', the note is closed
    vi.setSystemTime(Date.now() + 30 * 60_000);
    const ended: Job = { ...unsure, errorKey: "noImprovementArrived" };
    t.s.plugin.settings.jobs = [ended];
    await t.s.service.afterReconcile([ended]);
    expect(read(t.s.text(NOTE)).importState).toBe("fertig");
    const r = await t.retry(unsure.id);
    expect(r.ok).toBe(true);
    expect(t.sendJob).toHaveBeenCalledTimes(2);
    const next = t.s.plugin.settings.jobs;
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ retryOf: [{ job: unsure.id }], feedback: "Ofen auf 200 °C" });
    expect(read(t.s.text(NOTE))).toMatchObject({ importState: "offen", job: next[0].id });
  });
  it("refuses without feedback, without a processor, and while an improvement runs or waits", async () => {
    const a = host(done());
    expect((await a.send(" \n ")).ok).toBe(false);
    const b = host(done(), [], { ai: false, claude: false, github: false });
    expect(await b.send()).toMatchObject({ message: "Ein Hinweis braucht deine eigene KI oder einen Verarbeiter." });
    const running = host(done(), [job()]);
    expect(await running.send()).toMatchObject({
      message: expect.stringContaining("läuft schon eine Verbesserung") as string,
    });
    const review = { proposal: `${FOLDER}/Verbesserungen/rz-m1-0001.md`, target: NOTE };
    const waiting = host(done(), [job({ review })]);
    expect(await waiting.send()).toMatchObject({
      message: expect.stringContaining("wartet eine Verbesserung auf deine Prüfung") as string,
    });
    for (const t of [a, b, running, waiting]) expect(t.sendJob).not.toHaveBeenCalled();
  });
  it("replaces a failed or timed out earlier run like a retry", async () => {
    const old = job({ errorKey: "noImprovementArrived", feedback: "alt" });
    const t = host(firstVersion(), [old]);
    expect((await t.send()).ok).toBe(true);
    const id = t.sendJob.mock.calls[0][4]!.id!;
    expect(t.s.plugin.settings.jobs).toHaveLength(1);
    expect(t.s.plugin.settings.jobs[0]).toMatchObject({ id, retryOf: [{ job: "rz-m1-0001" }] });
    expect(read(t.s.text(NOTE)).job).toBe(id);
  });
  it("a second click while the first is on its way does nothing", async () => {
    const t = host(done());
    let release!: () => void;
    t.sendJob.mockImplementationOnce(() => new Promise((r) => (release = () => r({ ok: true, message: "gesendet" }))));
    const first = t.send();
    await vi.waitFor(() => expect(t.sendJob).toHaveBeenCalled());
    expect(await t.send()).toEqual({ ok: true });
    release();
    await first;
    expect(t.sendJob).toHaveBeenCalledTimes(1);
  });
  it("uses GitHub when only that is set up", async () => {
    const t = host(done(), [], { ai: false, claude: false, github: true });
    await t.send();
    expect(t.sendJob.mock.calls[0][2]).toBe("github");
  });
});

describe("Retry of an improvement job", () => {
  const failed = (o: Partial<Job> = {}) => job({ errorKey: "noImprovementArrived", ...o });
  it("is refused if the note no longer carries the job ID", async () => {
    const t = host(firstVersion().replace("auftrag: rz-m1-0001", "auftrag: rz-other-0002"), [failed()]);
    expect(await t.retry("rz-m1-0001")).toMatchObject({
      ok: false,
      message: expect.stringContaining("gehört nicht mehr") as string,
    });
    expect(t.sendJob).not.toHaveBeenCalled();
    expect(t.s.plugin.settings.jobs).toHaveLength(1);
  });
  it("binds the note to the new ID as 'offen' again, replaces the old job and keeps the feedback", async () => {
    const closed = firstVersion()
      .replace("import: offen", "import: teilweise")
      .replace(/import_fehler:.*/, 'import_fehler: "Keine Verbesserung angekommen."');
    const t = host(closed, [failed({ feedback: "mehr Salz" })]);
    expect(await t.retry("rz-m1-0001")).toMatchObject({ ok: true });
    const id = t.sendJob.mock.calls[0][4]!.id!;
    expect(t.sendJob.mock.calls[0][4]).toMatchObject({ feedback: "mehr Salz" });
    expect(read(t.s.text(NOTE))).toMatchObject({ job: id, importState: "offen" });
    expect(read(t.s.text(NOTE)).importError).toBeFalsy();
    expect(t.s.plugin.settings.jobs).toHaveLength(1);
    expect(t.s.plugin.settings.jobs[0]).toMatchObject({ id, retryOf: [{ job: "rz-m1-0001" }] });
  });
  it("passes on 'unsure': the job exists, the message says it is unclear, the old job is replaced", async () => {
    const t = host(firstVersion(), [failed()]);
    t.noAnswer();
    const r = await t.retry("rz-m1-0001");
    expect(r.ok).toBe(true);
    expect(r.message).toContain("unklar");
    expect(t.s.plugin.settings.jobs).toHaveLength(1);
    expect(t.s.plugin.settings.jobs[0]).toMatchObject({ unsure: true, retryOf: [{ job: "rz-m1-0001" }] });
    expect(t.s.plugin.settings.jobs[0]).not.toHaveProperty("starting");
  });
  it("a clear refusal keeps the old job and closes the note again", async () => {
    const t = host(firstVersion(), [failed()]);
    t.refuse();
    expect(await t.retry("rz-m1-0001")).toMatchObject({ ok: false, message: "Abgelehnt" });
    expect(t.s.plugin.settings.jobs).toEqual([failed()]);
    expect(read(t.s.text(NOTE)).importState).toBe("fertig");
  });
  it("a late proposal of the first ID is dropped once the new run replaced it", async () => {
    const t = host(firstVersion(), [failed()]);
    await t.retry("rz-m1-0001");
    const dir = `${FOLDER}/Verbesserungen`;
    t.s.store.set(PROPOSAL, proposalText());
    t.s.store.set(`${dir}/rz-m1-0001.md`, proposalText());
    await t.s.service.handle(PROPOSAL);
    expect(t.s.store.has(PROPOSAL)).toBe(false);
    expect(read(t.s.text(NOTE)).title).toBe("Linsensuppe");
  });
  it("sends a normal job again with the same input and replaces it", async () => {
    const t = host(firstVersion(), [
      job({ improve: undefined, errorKey: "noRecipeArrived", id: "rz-n-0001", input: "https://example.org/x" }),
    ]);
    t.sendJob.mockResolvedValueOnce({ ok: true, message: "gesendet", job: "rz-n-0002" });
    t.s.plugin.settings.jobs = [...t.s.plugin.settings.jobs, { ...job(), id: "rz-n-0002", improve: undefined }];
    expect(await t.retry("rz-n-0001")).toMatchObject({ ok: true });
    expect(t.s.plugin.settings.jobs.map((j) => j.id)).toEqual(["rz-n-0002"]);
    expect(t.s.plugin.settings.jobs[0]).toMatchObject({ retryOf: [{ job: "rz-n-0001" }] });
  });
});
