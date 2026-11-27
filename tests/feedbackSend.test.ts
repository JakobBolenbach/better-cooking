// "Send to Claude" (issue #120): an improvement job with the feedback for an existing note. The note is set to 'offen'
// with the new job ID first (compare-and-set); the old state goes into the job; a clear refusal puts the note back,
// no answer at all does not.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { sendFeedback } from "../src/feedbackService";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { NOTE, firstVersion, job, setup } from "./improveFake";
import type { Job } from "../src/types";

const done = () => firstVersion().replace(/import: \w+/, "import: fertig");
const noJob = () => done().replace(/auftrag: .*\n/, "");
const read = (text: string) => parseRecipe("x", text);

type Sent = { ok: boolean; message?: string; job?: string; unsure?: true };

function host(text: string, jobs: Job[] = [], ready = { ai: false, claude: true, github: false }) {
  const s = setup({ [NOTE]: text }, jobs);
  const sendJob = vi.fn(
    async (
      _e: unknown,
      input: string,
      p: string,
      _l?: string,
      improve?: { id?: string; feedback?: string },
    ): Promise<Sent> => {
      const j: Job = {
        id: improve!.id!,
        input,
        kind: "x",
        since: 1,
        processor: p as "claude",
        improve: true,
        feedback: improve?.feedback,
      };
      s.plugin.settings.jobs = [...s.plugin.settings.jobs, j];
      return { ok: true, message: "gesendet", job: j.id };
    },
  );
  Object.assign(s.plugin, { processorInfo: () => ({ ready }), sendJob, secret: () => null });
  return { s, sendJob, send: (t = "Ofen auf 200 °C") => sendFeedback(s.plugin as never, NOTE, t) };
}

beforeEach(() => setLanguage("de"));

describe("sendFeedback", () => {
  it("sets the note to 'offen' with the new job ID and starts an improvement job with the feedback", async () => {
    const { s, sendJob, send } = host(done());
    const r = await send("  Ofen auf 200 °C\n");
    expect(r).toEqual({ ok: true, message: "Hinweis an Claude gesendet. Die Verbesserung kommt später." });
    const [e, input, processor, , improve] = sendJob.mock.calls[0];
    expect(e).toMatchObject({ kind: "webseite", url: "https://example.org/r" });
    expect(input).toBe("https://example.org/r");
    expect(processor).toBe("claude");
    expect(improve).toMatchObject({ feedback: "Ofen auf 200 °C" });
    expect(improve!.id).toMatch(/^rz-[0-9a-z]+-[0-9a-z]{4}$/);
    expect(read(s.text(NOTE))).toMatchObject({ job: improve!.id, importState: "offen" });
    // what the note was is in the job, to put it back
    expect(s.plugin.settings.jobs[0]).toMatchObject({ id: improve!.id, prevState: "fertig", improve: true });
  });
  it("keeps the reason of a partial note in the job", async () => {
    const { s, send } = host(
      done()
        .replace("import: fertig", "import: teilweise")
        .replace(/import_fehler:.*/, "import_fehler: Mengen fehlen"),
    );
    await send();
    expect(s.plugin.settings.jobs[0]).toMatchObject({ prevState: "teilweise", prevError: "Mengen fehlen" });
    expect(read(s.text(NOTE)).importError ?? "").toBe("");
  });
  it("sends the note's text when there is no source, and when the source is no real link", async () => {
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
      const { sendJob, send } = host(none);
      await send();
      expect(sendJob.mock.calls[0][0]).toMatchObject({ kind: "text" });
      expect(sendJob.mock.calls[0][1]).toMatch(/^# Linsensuppe/);
      expect(sendJob.mock.calls[0][1]).toContain("- 250 g Linsen");
    }
  });
  it("sets the job ID on a note that had none; a clear refusal puts everything back, also removing the field", async () => {
    const a = host(noJob());
    expect((await a.send()).ok).toBe(true);
    expect(read(a.s.text(NOTE)).job).toBeDefined();
    const before = noJob();
    const b = host(before);
    b.sendJob.mockResolvedValueOnce({ ok: false, message: "Abgelehnt" });
    expect(await b.send()).toEqual({ ok: false, message: "Abgelehnt" });
    // (an empty reason may be written as "" instead of nothing: the same value)
    expect(read(b.s.text(NOTE))).toMatchObject({ importState: "fertig", title: "Linsensuppe" });
    expect(b.s.text(NOTE)).not.toContain("auftrag");
    expect(before).not.toContain("auftrag");
    const c = host(done());
    c.sendJob.mockResolvedValueOnce({ ok: false, message: "Abgelehnt" });
    await c.send();
    expect(read(c.s.text(NOTE))).toMatchObject({ importState: "fertig", job: "rz-m1-0001" });
  });
  it("does not put the note back when there was no answer at all (the job may have arrived)", async () => {
    const t = host(done());
    t.sendJob.mockResolvedValueOnce({ ok: false, message: "Keine Verbindung", unsure: true });
    const r = await t.send();
    expect(r.ok).toBe(false);
    expect(r.message).toContain("unklar");
    expect(read(t.s.text(NOTE)).importState).toBe("offen");
  });
  it("does not start a job without feedback, without a processor, or for a note that changed", async () => {
    const a = host(done());
    expect((await a.send(" \n ")).ok).toBe(false);
    const b = host(done(), [], { ai: false, claude: false, github: false });
    expect(await b.send()).toMatchObject({
      ok: false,
      message: "Ein Hinweis braucht deine eigene KI oder einen Verarbeiter.",
    });
    for (const t of [a, b]) expect(t.sendJob).not.toHaveBeenCalled();
  });
  it("refuses while an improvement runs or a proposal waits for review", async () => {
    const running = host(done(), [job()]);
    expect(await running.send()).toMatchObject({
      ok: false,
      message: expect.stringContaining("läuft schon eine Verbesserung") as string,
    });
    const waiting = host(done(), [job({ review: { proposal: "Rezepte/Verbesserungen/rz-m1-0001.md", target: NOTE } })]);
    expect(await waiting.send()).toMatchObject({
      ok: false,
      message: expect.stringContaining("wartet eine Verbesserung auf deine Prüfung") as string,
    });
    expect(running.sendJob).not.toHaveBeenCalled();
    expect(waiting.sendJob).not.toHaveBeenCalled();
  });
  it("replaces a failed or timed out earlier run like a retry", async () => {
    const old = job({ errorKey: "noImprovementArrived", feedback: "alt", prevState: "fertig" });
    const { s, sendJob, send } = host(firstVersion(), [old]);
    expect((await send()).ok).toBe(true);
    const id = sendJob.mock.calls[0][4]!.id!;
    expect(s.plugin.settings.jobs).toHaveLength(1);
    expect(s.plugin.settings.jobs[0]).toMatchObject({ id, retryOf: [{ job: "rz-m1-0001" }], prevState: "fertig" });
    expect(read(s.text(NOTE)).job).toBe(id);
  });
  it("a second click while the first is on its way does nothing", async () => {
    const { sendJob, send } = host(done());
    let release!: () => void;
    sendJob.mockImplementationOnce(
      () => new Promise((r) => (release = () => r({ ok: true, message: "gesendet", job: "x" }))),
    );
    const first = send();
    await vi.waitFor(() => expect(sendJob).toHaveBeenCalled());
    expect(await send()).toEqual({ ok: true });
    release();
    await first;
    expect(sendJob).toHaveBeenCalledTimes(1);
  });
  it("uses GitHub when only that is set up", async () => {
    const { sendJob, send } = host(done(), [], { ai: false, claude: false, github: true });
    await send();
    expect(sendJob.mock.calls[0][2]).toBe("github");
  });
});
