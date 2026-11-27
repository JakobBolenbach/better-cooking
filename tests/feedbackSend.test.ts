// "Send to Claude" (issue #120): an improvement job with the feedback for an existing note; the note's `auftrag` is
// set to the new job ID first (compare-and-set) and put back if the processor does not accept the job.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("obsidian", () => import("./stubs/obsidianFake"));
vi.mock("../src/notice", () => import("./stubs/obsidianFake"));

import { sendFeedback } from "../src/feedbackService";
import { parseRecipe } from "../src/parse";
import { setLanguage } from "../src/i18n";
import { NOTE, firstVersion, job, setup } from "./improveFake";

const done = () => firstVersion().replace(/import: \w+/, "import: fertig");
const noJob = () => done().replace(/auftrag: .*\n/, "");
const jobOf = (text: string) => parseRecipe("x", text).job;

function host(text: string, jobs = [] as ReturnType<typeof job>[], ready = { ai: false, claude: true, github: false }) {
  const s = setup({ [NOTE]: text }, jobs);
  const sendJob = vi.fn(async (_e: unknown, _input: string, _p: string, _l?: string, improve?: { id?: string }) => {
    return { ok: true, message: "gesendet", job: improve?.id };
  });
  Object.assign(s.plugin, { processorInfo: () => ({ ready }), sendJob, secret: () => null });
  return { s, sendJob, send: (t = "Ofen auf 200 °C") => sendFeedback(s.plugin as never, NOTE, t) };
}

beforeEach(() => setLanguage("de"));

describe("sendFeedback", () => {
  it("binds the note to the new job ID and starts an improvement job with the feedback", async () => {
    const { s, sendJob, send } = host(done());
    const r = await send("  Ofen auf 200 °C\n");
    expect(r).toEqual({ ok: true, message: "Hinweis an Claude gesendet. Die Verbesserung kommt später." });
    const [e, input, processor, , improve] = sendJob.mock.calls[0];
    expect(e).toMatchObject({ kind: "webseite", url: "https://example.org/r" });
    expect(input).toBe("https://example.org/r");
    expect(processor).toBe("claude");
    expect(improve).toMatchObject({ feedback: "Ofen auf 200 °C" });
    expect(improve!.id).toMatch(/^rz-[0-9a-z]+-[0-9a-z]{4}$/);
    expect(jobOf(s.text(NOTE))).toBe(improve!.id);
  });
  it("sends the note's text for a note without a source", async () => {
    const { sendJob, send } = host(
      done()
        .replace(/quelle: .*\n/, "")
        .replace(/^Quelle:.*$/m, ""),
    );
    await send();
    expect(sendJob.mock.calls[0][0]).toMatchObject({ kind: "text" });
    expect(sendJob.mock.calls[0][1]).toContain("- 250 g Linsen");
  });
  it("sets the job ID on a note that had none, and puts the old one back when the job is not accepted", async () => {
    const a = host(noJob());
    expect((await a.send()).ok).toBe(true);
    expect(jobOf(a.s.text(NOTE))).toBeDefined();
    const b = host(done());
    b.sendJob.mockResolvedValueOnce({ ok: false, message: "Abgelehnt", job: undefined });
    expect(await b.send()).toEqual({ ok: false, message: "Abgelehnt" });
    expect(jobOf(b.s.text(NOTE))).toBe("rz-m1-0001");
  });
  it("does not start a job without feedback, without a processor, or while an improvement runs", async () => {
    const a = host(done());
    expect((await a.send(" \n ")).ok).toBe(false);
    const b = host(done(), [], { ai: false, claude: false, github: false });
    expect(await b.send()).toMatchObject({
      ok: false,
      message: "Feedback braucht deine eigene KI oder einen Verarbeiter.",
    });
    const c = host(done(), [job()]);
    expect(await c.send()).toMatchObject({ ok: false, message: "Für dieses Rezept läuft schon eine Verbesserung." });
    expect(a.sendJob).not.toHaveBeenCalled();
    expect(b.sendJob).not.toHaveBeenCalled();
    expect(c.sendJob).not.toHaveBeenCalled();
  });
  it("uses GitHub when only that is set up", async () => {
    const { sendJob, send } = host(done(), [], { ai: false, claude: false, github: true });
    await send();
    expect(sendJob.mock.calls[0][2]).toBe("github");
  });
});
